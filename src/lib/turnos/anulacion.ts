// ============================================================================
// ANULAR UN COBRO Y CONDONAR UN SALDO — la corrección que el cobro de turnos no tenía.
// ============================================================================
//
// QUÉ PASABA ANTES Y POR QUÉ ERA GRAVE. `Collection` se creaba en dos lugares y NO se
// actualizaba ni se borraba en ningún lado del código de aplicación: un cobro mal cargado
// —el monto equivocado, o el medio equivocado sobre un select cuyo default es EFECTIVO—
// quedaba grabado para siempre. El libro tampoco daba salida: `deleteLibroEntry` rechaza
// borrar una VENTA con "corregilo desde Turnos, no desde el libro", y Turnos no tenía nada
// que corrigiera. La recepcionista terminaba tipeando DOS asientos compensatorios de
// fantasía (un EGRESO en efectivo y un INGRESO en MP) con un motivo inventado, o el cierre
// del día asentaba las dos diferencias como ajuste y quedaban congeladas para siempre.
// Si alguien "simplifica" esto de vuelta, eso es lo que vuelve.
//
// DOS OPERACIONES DISTINTAS, no una con un flag:
//
//   · ANULAR un cobro — se cobró plata que no correspondía (monto o medio equivocado, o el
//     turno equivocado). Hay una CONTRAPARTIDA de plata: sale del libro lo que entró.
//   · CONDONAR un saldo — la plata nunca va a entrar y el negocio decide no reclamarla.
//     NO hay plata de por medio: el libro no se toca. Sólo deja de ser cuenta a cobrar.
//
// CÓMO QUEDA EL RASTRO (la decisión, y por qué). La `Collection` original NO se borra ni se
// muta: se asienta la CONTRAPARTIDA, una `Collection` de monto NEGATIVO contra el mismo
// turno. Tres razones, en orden de peso:
//   1. Es lo único que no necesita una migración. Marcar la fila (`voidedAt`) exigiría una
//      columna nueva, y las columnas nuevas de este camino (`Collection.idempotencyKey`,
//      `CashMovement.collectionId`) YA están escritas y sin aplicar esperando al dueño: una
//      anulación que sólo funciona después de migrar es una anulación que hoy no existe.
//   2. El saldo se recalcula SOLO. `estadoCobroTurno` deriva el saldo de Σ cobros; con la
//      contrapartida adentro, la suma baja sin que nadie tenga que acordarse de filtrar
//      filas anuladas en las cinco pantallas que leen cobros (agenda, lista, comisiones,
//      ficha, settlement). Un filtro olvidado en una de ellas es plata mal contada.
//   3. Es contabilidad, no edición: lo que pasó queda, y lo que lo revierte también.
//
// El vínculo con el cobro original viaja en `note` con un prefijo estructurado
// (`ANULACION:<collectionId>`) porque es el ÚNICO campo de `Collection` que existe hoy en
// la base y sirve para atar dos filas. Cuando la migración de `idempotencyKey` aterrice, la
// clave `anulacion:<collectionId>` pasa a ser además el árbitro de la carrera a nivel DB —
// las dos capas, igual que el cobro.
//
// Dinero: contrato `number` (ADR-057), redondeo único `round2`; `Decimal` se convierte a
// `number` en el borde del repositorio, explícitamente.

import { round2 } from "@/lib/round";
import type { Prisma } from "@/generated/prisma/client";
import type { AnulacionDeCobro } from "@/lib/capabilities";
import { estadoCobroTurno, type CobroTurno, type PagoLegado } from "./cobros";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";
import { facturaDeLaVenta, mensajeFacturaViva, type FacturaDeLaVenta } from "@/lib/factura-viva";
import { claveCobroDelLibro, cobroDeLaClave } from "@/lib/facturacion/clave-cobro-del-libro";
import { claveNotaDeCobroMP, coberturaMP, facturadoPropioPorCobro, saldosMPSinPareja } from "@/lib/facturacion/cobertura-mp";
import { centavosDe } from "@/lib/dinero/redondeo";

export type AnulacionTx = Prisma.TransactionClient;

// ── 1. NÚCLEO PURO: marcas, clasificación y validación ──────────────────────

/**
 * Actor con el que se firma el asiento de reversa en el libro.
 *
 * Existe por la misma razón que `CIERRE_DIARIO_ACTOR_PREFIX` y `ARQUEO_TURNO_ACTOR_PREFIX`:
 * la reversa se asienta como EGRESO (es lo que el libro sabe restar), y un EGRESO sin marca
 * se ve igual que uno tipeado a mano → `deleteLibroEntry` lo dejaría borrar, y borrarlo
 * devolvería al libro plata que el sistema ya decidió que no entró.
 * La guarda de borrado vive en `libro-caja-actions.ts` y usa `esEgresoDeAnulacion`.
 */
export const ANULACION_TURNO_ACTOR_PREFIX = "anulacion-turno:";

/** ¿Esta fila del libro la escribió la anulación de un cobro? Para no dejar borrarla. */
export function esEgresoDeAnulacion(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(ANULACION_TURNO_ACTOR_PREFIX);
}

export const MARCA_ANULACION = "ANULACION:";
const MARCA_CONDONACION = "CONDONACION:";

/** Largo mínimo del motivo: menos que esto es "asd" y no explica nada en la auditoría. */
export const MOTIVO_MIN = 4;
export const MOTIVO_MAX = 200;

export type MotivoInvalido = "vacio" | "corto";

export type ValidacionMotivo = { ok: true; motivo: string } | { ok: false; error: MotivoInvalido };

/** El motivo es obligatorio: es lo único que explica, seis meses después, por qué falta plata. */
export function validarMotivo(raw: string | null | undefined): ValidacionMotivo {
  const m = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (m.length === 0) return { ok: false, error: "vacio" };
  if (m.length < MOTIVO_MIN) return { ok: false, error: "corto" };
  return { ok: true, motivo: m.slice(0, MOTIVO_MAX) };
}

export function mensajeMotivoInvalido(e: MotivoInvalido): string {
  return e === "vacio"
    ? "Escribí por qué se anula: queda en la auditoría y es lo único que lo explica después."
    : `El motivo es muy corto: contá qué pasó (al menos ${MOTIVO_MIN} letras).`;
}

export function notaDeAnulacion(collectionId: string, motivo: string): string {
  return `${MARCA_ANULACION}${collectionId} — ${motivo}`;
}

export function notaDeCondonacion(motivo: string): string {
  return `${MARCA_CONDONACION} ${motivo}`;
}

/** Qué clase de fila es este `Collection` de turno, leyendo la marca de su nota. */
export type ClaseDeCobro = "cobro" | "anulacion" | "condonacion";

export function claseDeCobro(note: string | null | undefined): ClaseDeCobro {
  const n = String(note ?? "");
  if (n.startsWith(MARCA_ANULACION)) return "anulacion";
  if (n.startsWith(MARCA_CONDONACION)) return "condonacion";
  return "cobro";
}

/** Si la fila es una anulación, el id del cobro que revierte. */
export function cobroAnuladoPor(note: string | null | undefined): string | null {
  const n = String(note ?? "");
  if (!n.startsWith(MARCA_ANULACION)) return null;
  const id = n.slice(MARCA_ANULACION.length).split(" —")[0]?.trim();
  return id ? id : null;
}

/** Una fila de cobro tal como la leen las pantallas (ya en `number`). */
export type CobroDelTurno = {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  createdAt: Date;
  /** Quién lo registró (actor «user:<id>»); lo traduce a nombre la agenda, nunca cruza crudo. */
  collectedBy?: string;
};

/**
 * Lo MÍNIMO que las funciones puras necesitan de una fila. Es un tipo estructural y no
 * `CobroDelTurno` a propósito: la grilla del calendario declara su propia copia del tipo de
 * turno con menos columnas, y estas reglas tienen que poder correr igual sobre esa forma —
 * si no, la misma regla se calcularía distinto en dos pantallas.
 */
export type FilaDeCobro = { amount: number; note?: string | null };

export type DesgloseCobros = {
  /** Plata que entró de verdad y sigue en pie (cobros − anulaciones). */
  cobrado: number;
  /** Plata que entró y se dio de baja. */
  anulado: number;
  /** Saldo dado de baja sin plata (condonaciones). */
  condonado: number;
};

/**
 * Abre Σ cobros en sus tres naturalezas. La agenda muestra "cobrado" y "condonado" por
 * separado a propósito: sumarlos diría que entraron $20.000 cuando entraron $17.000, y esa
 * es exactamente la mentira que hoy obliga a inventar asientos en la caja.
 */
export function desglosarCobros(rows: readonly FilaDeCobro[]): DesgloseCobros {
  let cobrado = 0;
  let anulado = 0;
  let condonado = 0;
  for (const r of rows) {
    const clase = claseDeCobro(r.note);
    if (clase === "condonacion") condonado += r.amount;
    else {
      cobrado += r.amount;
      if (clase === "anulacion") anulado += Math.abs(r.amount);
    }
  }
  return { cobrado: round2(cobrado), anulado: round2(anulado), condonado: round2(condonado) };
}

/**
 * La plata del turno que entró y sigue en pie: con cobros propios, Σ cobros − anulaciones (sin las
 * condonaciones, que no son plata); sin cobros, el pago viejo (`Payment`). Es lo que la agenda
 * llama «cobrado» y lo que mide la seña (`faltanteDeSenia`). Una sola definición. PURA.
 */
export function cobradoRealDelTurno(
  precio: number,
  cobros: readonly (FilaDeCobro & { method?: string })[],
  pagoLegado?: PagoLegado,
): number {
  return cobros.length > 0
    ? desglosarCobros(cobros).cobrado
    : estadoCobroTurno({ precio, cobros: [], pagoLegado }).cobrado;
}

/**
 * Cobros que todavía se pueden anular: los que son cobros de verdad y no tienen ya su
 * contrapartida. Es la MISMA regla que aplica el servidor (`planAnulacion`), para que el
 * botón no aparezca cuando la acción va a rechazar.
 */
export function cobrosAnulables<T extends FilaDeCobro & { id?: string }>(rows: readonly T[]): T[] {
  const yaAnulados = new Set<string>();
  for (const r of rows) {
    const orig = cobroAnuladoPor(r.note);
    if (orig) yaAnulados.add(orig);
  }
  return rows.filter(
    (r) => typeof r.id === "string" && claseDeCobro(r.note) === "cobro" && !yaAnulados.has(r.id) && r.amount > 0,
  );
}

export type MotivoAnulacionRechazada =
  | "no-es-cobro" // se apuntó a una contrapartida o a una condonación
  | "ya-anulado" // idempotencia: ya tiene su reversa
  | "monto-invalido" // fila corrupta (≤ 0): no hay nada que revertir
  | "facturado" // ENG-023: el turno tiene factura autorizada y todavía no hay nota de crédito
  | "factura-en-camino" // ENG-023: su factura espera la respuesta de ARCA; el CAE puede llegar después
  | "dia-cerrado" // el día del asiento ya está cerrado: la corrección va con fecha de hoy
  | "nota-de-credito" // opción B: el cobro tiene su factura autorizada y la nota de crédito no se pudo emitir
  | "voucher-con-baja" // CH: cobro con voucher ya dado de baja en OpenKey: no vuelve a DISPONIBLE
  | "voucher-liquidado" // CH: OpenKey ya pagó ese voucher: liberarlo dejaría plata sin cobro vivo
  | "voucher-en-liquidacion"; // CH: el voucher está en una liquidación del lunes (abierta o conciliada)

export type PlanAnulacion =
  | { ok: true; monto: number }
  | { ok: false; motivo: MotivoAnulacionRechazada };

/**
 * ¿Se puede anular ESTE cobro? Pura. `yaAnulado` lo resuelve el repositorio buscando la
 * contrapartida; `diaCerrado` lo resuelve la frontera del libro (`frontera-cierre.ts`);
 * `factura`, la factura del turno (`facturaDeLaVenta`, factura-viva.ts, ENG-023).
 */
export function planAnulacion(input: {
  note: string | null | undefined;
  amount: number;
  yaAnulado: boolean;
  diaCerrado: boolean;
  factura: FacturaDeLaVenta;
}): PlanAnulacion {
  if (claseDeCobro(input.note) !== "cobro") return { ok: false, motivo: "no-es-cobro" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, motivo: "monto-invalido" };
  if (input.yaAnulado) return { ok: false, motivo: "ya-anulado" };
  // La factura va antes que el día cerrado: sin nota de crédito, la plata de un turno
  // facturado no se devuelve por acá, ni hoy ni con fecha de otro día.
  if (input.factura === "autorizada") return { ok: false, motivo: "facturado" };
  if (input.factura === "en-camino") return { ok: false, motivo: "factura-en-camino" };
  // El día cerrado se evalúa AL FINAL: si ya está anulado, la respuesta correcta es
  // "ya está", no "no se puede" — un doble clic no tiene que asustar a nadie.
  if (input.diaCerrado) return { ok: false, motivo: "dia-cerrado" };
  return { ok: true, monto: round2(input.amount) };
}

export type MotivoCondonacionRechazada =
  | "sin-saldo" // no hay nada que condonar
  | "no-prestado"; // sólo se condona lo que ya es cuenta a cobrar (turno COMPLETED)

export type PlanCondonacion =
  | { ok: true; monto: number }
  | { ok: false; motivo: MotivoCondonacionRechazada };

/**
 * ¿Se puede condonar el saldo de este turno? Pura.
 *
 * Sólo un turno COMPLETED con saldo: es la definición de `esCuentaACobrar`. Condonar un
 * turno que todavía no se prestó sería regalar un servicio antes de darlo —eso es un
 * descuento, y el descuento toca el precio congelado y la comisión: es otra decisión.
 */
export function planCondonacion(input: {
  status: string;
  precio: number;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
}): PlanCondonacion {
  if (input.status !== "COMPLETED") return { ok: false, motivo: "no-prestado" };
  const estado = estadoCobroTurno({ precio: input.precio, cobros: input.cobros, pagoLegado: input.pagoLegado });
  if (estado.saldo <= 0) return { ok: false, motivo: "sin-saldo" };
  return { ok: true, monto: estado.saldo };
}

/** Clave de idempotencia (DB) de la contrapartida de un cobro. Una por cobro, siempre. */
export function claveAnulacion(collectionId: string): string {
  return `anulacion:${collectionId}`;
}

/** Clave de idempotencia (DB) de la condonación de un turno. Una por turno, siempre. */
export function claveCondonacion(appointmentId: string): string {
  return `condonacion:${appointmentId}`;
}

/** Detalle del asiento de reversa en el libro: se lee al lado del original y lo nombra. */
export function detalleReversa(detalleOriginal: string | null | undefined, motivo: string): string {
  const base = String(detalleOriginal ?? "").trim() || "Turno cobrado";
  return `Anulación de cobro · ${base} — ${motivo}`;
}

// ── Quién anula: los textos, para que la pantalla y el servidor digan lo mismo ──

export const MENSAJE_SIN_ANULAR = "Anular un cobro lo hace la dueña. Pasale el turno a ella.";
export const MENSAJE_FALTA_CODIGO = "Para anular hace falta el código de la dueña. Pedile que abra este cobro y toque «Autorizar anulación».";
export const MENSAJE_CODIGO_MALO = "Ese código no sirve: está mal escrito, venció o es de otro cobro. Pedile uno nuevo a la dueña.";
export const MENSAJE_TOPE_DE_CODIGOS = "Demasiados intentos con el código. Esperá unos minutos y pedile uno nuevo a la dueña.";
export const MENSAJE_NO_DESHACE = "La seña ya quedó registrada. Si estuvo mal, anular el cobro necesita a la dueña.";

/** Por qué no se ofrece «Se la devolvemos»: devolver es anular el cobro, y no hay otra puerta. */
export function mensajeSinDevolver(anular: AnulacionDeCobro | null): string {
  return anular === "con-autorizacion"
    ? "Devolverla necesita a la dueña: anulá el cobro con su código, desde «La plata», y después cerrá el turno."
    : MENSAJE_SIN_ANULAR;
}

export function mensajeAnulacionRechazada(motivo: MotivoAnulacionRechazada): string {
  switch (motivo) {
    case "no-es-cobro":
      return "Esa fila no es un cobro: es la anulación o la condonación de otro.";
    case "monto-invalido":
      return "Ese cobro no tiene un monto válido para revertir.";
    case "ya-anulado":
      return "Ese cobro ya estaba anulado.";
    case "facturado":
      return mensajeFacturaViva("autorizada", "turno");
    case "factura-en-camino":
      return mensajeFacturaViva("en-camino", "turno");
    case "nota-de-credito":
      return "Ese cobro tiene su factura autorizada por ARCA y la nota de crédito que la anula no se pudo emitir. No se anuló nada.";
    case "dia-cerrado":
      return "Ese cobro es de un día ya cerrado y un día contado no se toca. La corrección va con fecha de hoy: cargala en el libro de caja como INGRESO/EGRESO, con el motivo.";
    case "voucher-con-baja":
      return "Ese cobro es con un voucher que ya se dio de baja en la administración del country: no se anula desde acá. Resolvelo con La Alameda y anotalo.";
    case "voucher-liquidado":
      return "Ese cobro es con un voucher que la administración del country ya liquidó: no se anula desde acá. Se resuelve con La Alameda y se anota.";
    case "voucher-en-liquidacion":
      return "Ese cobro es con un voucher que ya está en la liquidación del lunes a la administración: no se anula desde acá. Si la liquidación sigue abierta, descartala primero en Vouchers; si ya se concilió, se resuelve con la administración y se anota.";
  }
}

export function mensajeCondonacionRechazada(motivo: MotivoCondonacionRechazada): string {
  switch (motivo) {
    case "sin-saldo":
      return "Este turno no tiene saldo pendiente: no hay nada que dar de baja.";
    case "no-prestado":
      return "Sólo se da de baja el saldo de un turno ya realizado. Si el turno no se hizo, cancelalo.";
  }
}

export class AnulacionRechazada extends Error {
  readonly motivo: MotivoAnulacionRechazada;
  constructor(motivo: MotivoAnulacionRechazada, detalle?: string) {
    super(detalle ? `${mensajeAnulacionRechazada(motivo)} ${detalle}` : mensajeAnulacionRechazada(motivo));
    this.name = "AnulacionRechazada";
    this.motivo = motivo;
  }
}

export class CondonacionRechazada extends Error {
  readonly motivo: MotivoCondonacionRechazada;
  constructor(motivo: MotivoCondonacionRechazada) {
    super(mensajeCondonacionRechazada(motivo));
    this.name = "CondonacionRechazada";
    this.motivo = motivo;
  }
}

// ── 2. PERSISTENCIA tx-scoped ───────────────────────────────────────────────

export type AnularCobroArgs = {
  collectionId: string;
  appointmentId: string;
  precio: number;
  motivo: string;
  actor: string; // "user:<id>"
  /** Último día CERRADO del tenant (frontera-cierre.ts), o null si nunca se cerró. */
  diaCerradoHasta: string | null;
  /** Predicado de congelamiento inyectado (`isFrozenDay`): mantiene este módulo sin fechas. */
  esDiaCerrado: (dia: string, cerradoHasta: string) => boolean;
  /** Día contable (AAAA-MM-DD) de una fecha, en la zona del negocio. */
  diaDe: (d: Date) => string;
  /** true = escribir `idempotencyKey` y tocar el libro (columnas migradas). */
  withSchema: boolean;
  /**
   * Opción B de CH (una factura por cobro): emite la nota de crédito de la factura AUTORIZADA de
   * este cobro, en esta misma transacción. La inyecta el servidor
   * (`facturacion/factura-por-cobro.ts`, `notaDeCreditoDelCobroInTx`): este módulo lo importan
   * pantallas y no puede traer el Core de facturación. Sin ella, un cobro con factura autorizada no
   * se anula (como antes: «facturado»).
   */
  notaDeCredito?: (
    tx: AnulacionTx,
    x: { tenantId: string; facturaId: string; motivo: string; importe?: number },
  ) => Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }>;
};

/**
 * La factura propia de ESTE cobro (opción B: `CobroFacturado` con `turno:cobro:<id>`), si la tabla
 * existe. Se pregunta antes por la tabla (`to_regclass`): una consulta a una tabla sin migrar
 * abortaría la transacción entera de la anulación (Gate 2: el código tolera la ausencia).
 */
async function facturaDelCobroInTx(
  tx: AnulacionTx,
  tenantId: string,
  collectionId: string,
): Promise<{ invoiceId: string; status: string } | null> {
  const tabla = await tx.$queryRaw<{ tabla?: string | null }[]>`SELECT to_regclass('"CobroFacturado"')::text AS tabla`;
  if (!tabla[0]?.tabla) return null;
  const fila = await tx.cobroFacturado.findFirst({
    where: { tenantId, clave: claveCobroDelLibro(collectionId) },
    select: { invoiceId: true, invoice: { select: { status: true } } },
  });
  return fila ? { invoiceId: fila.invoiceId, status: fila.invoice.status } : null;
}

/**
 * Opción B: un cobro con medio Mercado Pago puede estar cubierto (entero, o en parte junto a su
 * factura propia) por la factura del pago de MP (`mp:<pago>`, la emite el aviso de MP): las partes
 * de esas facturas que lo cubren,
 * con el mismo reparto con que `facturarCobrosDelTurno` decidió no facturarlo (`cobertura-mp.ts`).
 */
async function coberturaMPDelCobroInTx(
  tx: AnulacionTx,
  tenantId: string,
  appointmentId: string,
  collectionId: string,
  filas: readonly CobroDelTurno[],
): Promise<{ invoiceId: string; centavos: number; status: string }[]> {
  const tabla = await tx.$queryRaw<{ tabla?: string | null }[]>`SELECT to_regclass('"CobroFacturado"')::text AS tabla`;
  if (!tabla[0]?.tabla) return [];
  const facturadas = await tx.cobroFacturado.findMany({
    where: { tenantId, appointmentId },
    select: { clave: true, invoiceId: true, importe: true, createdAt: true, invoice: { select: { status: true, comprobanteAsociadoId: true } } },
    orderBy: { createdAt: "desc" },
  });
  const filasFacturadas = facturadas.map((f) => ({
    clave: f.clave,
    invoiceId: f.invoiceId,
    importe: Number(f.importe),
    status: f.invoice.status,
    createdAt: f.createdAt,
    asociada: f.invoice.comprobanteAsociadoId,
  }));
  const anulados = new Set(filas.map((f) => cobroAnuladoPor(f.note)).filter((id): id is string => id != null));
  const vivos = filas
    .filter((f) => claseDeCobro(f.note) === "cobro" && centavosDe(f.amount) > 0 && !anulados.has(f.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((f) => ({ id: f.id, method: f.method, centavos: centavosDe(f.amount) }));
  const conFila = new Set(filasFacturadas.map((f) => cobroDeLaClave(f.clave)).filter((id): id is string => id != null));
  const partes =
    coberturaMP({ vivos, conFila, saldos: saldosMPSinPareja(filasFacturadas), propias: facturadoPropioPorCobro(filasFacturadas) }).get(collectionId) ?? [];
  const estado = new Map(filasFacturadas.map((f) => [f.invoiceId, f.status]));
  return partes.map((p) => ({ ...p, status: estado.get(p.invoiceId) ?? "PENDING" }));
}

export type ReversaLibro =
  | { asentada: true; movementId: string }
  | { asentada: false; reason: "sin-asiento-original" | "medio-no-traducible" | "ya-revertido" | "sin-migrar" };

export type AnularCobroResult =
  | {
      applied: true;
      reversaId: string;
      monto: number;
      cobradoDespues: number;
      saldoDespues: number;
      libro: ReversaLibro;
      /** Opción B: la nota de crédito que canceló la factura de este cobro, si la tenía. */
      notaDeCreditoId?: string | null;
    }
  | { applied: false; reason: "duplicate"; reversaId: string };

/**
 * Revierte UN cobro concreto, dentro de la tx del llamador (I7, ADR-064): la contrapartida,
 * el `Payment` agregado y el asiento del libro son todo-o-nada.
 *
 * IDEMPOTENCIA, tres capas — las mismas que el cobro, en espejo:
 *   (1) pre-check de la contrapartida por la marca de `note` (caso secuencial, y funciona
 *       aunque `idempotencyKey` no esté migrada: es la capa que hoy realmente corre);
 *   (2) `@@unique(tenantId, idempotencyKey)` sobre `anulacion:<collectionId>` como árbitro
 *       de la carrera, cuando la columna existe;
 *   (3) `@@unique(tenantId, collectionId, type)` sobre el EGRESO: dos reversas simultáneas
 *       no pueden asentar dos egresos por el mismo cobro.
 */
export async function anularCobroTurnoInTx(
  tx: AnulacionTx,
  tenantId: string,
  args: AnularCobroArgs,
): Promise<AnularCobroResult> {
  // ENG-023, contra la facturación del turno: la fila del turno FOR UPDATE, ANTES de leer sus
  // facturas. La facturación (`createInvoiceInTx`, origen APPOINTMENT) escribe esa misma fila:
  //  · si facturó primero y confirmó después de la foto de esta transacción (Serializable),
  //    Postgres aborta este bloqueo (40001), `tenantTransaction` reintenta y el reintento ve la
  //    factura y rechaza la anulación;
  //  · si la anulación va primero, la facturación espera este bloqueo y después relee el cobro.
  // El negocio va explícito en el WHERE además de RLS.
  await tx.$queryRaw`
    SELECT id FROM "Appointment"
    WHERE id = ${args.appointmentId} AND "tenantId" = ${tenantId}
    FOR UPDATE`;
  const original = await tx.collection.findFirst({
    where: { tenantId, id: args.collectionId, originType: "APPOINTMENT", originId: args.appointmentId },
    select: { id: true, amount: true, method: true, note: true, createdAt: true },
  });
  if (!original) throw new AnulacionRechazada("no-es-cobro");

  // `Decimal` → `number` en el borde, explícitamente (ADR-057).
  const montoOriginal = round2(original.amount.toNumber());

  const previas = await tx.collection.findMany({
    where: { tenantId, originType: "APPOINTMENT", originId: args.appointmentId },
    select: { id: true, amount: true, method: true, note: true, createdAt: true },
  });
  const filas: CobroDelTurno[] = previas.map((c) => ({
    id: c.id,
    amount: round2(c.amount.toNumber()),
    method: c.method,
    note: c.note,
    createdAt: c.createdAt,
  }));
  const yaAnulada = filas.find((f) => cobroAnuladoPor(f.note) === args.collectionId);

  // El asiento original se busca ANTES de decidir, porque su `occurredAt` —no el `createdAt`
  // del cobro— es la FECHA CONTABLE que decide si el día está cerrado. El libro se carga en
  // diferido y esas dos fechas pueden no ser el mismo día.
  let asientoOriginal: { id: string; occurredAt: Date; sessionId: string | null; reason: string | null; method: string } | null = null;
  if (args.withSchema) {
    asientoOriginal = await tx.cashMovement.findFirst({
      where: { tenantId, collectionId: args.collectionId, type: "VENTA" },
      select: { id: true, occurredAt: true, sessionId: true, reason: true, method: true },
    });
  }

  // D6 · cobro de la profesional que cobra aparte YA RENDIDO: no tiene VENTA (no entró al libro al
  // cobrarse), pero su plata entró con la rendición (un INGRESO `rendicion:<id>`). La devolución
  // sale del cajón HOY: la contrapartida es un EGRESO con fecha de hoy, y es HOY el día que tiene
  // que estar abierto. Si todavía no se rindió, no hay plata en el libro que devolver (la rendición
  // ya no lo toma: ve la contrapartida). Ver docs/producto/comisiones/RENDICION.md §Anulación.
  const rendido = args.withSchema && !asientoOriginal ? await cobroRendidoInTx(tx, tenantId, args.collectionId) : null;
  if (rendido) {
    const sesion = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    asientoOriginal = { id: rendido.cashMovementId, occurredAt: new Date(), sessionId: sesion?.id ?? null, reason: rendido.reason, method: rendido.method };
  }

  const diaContable = args.diaDe(asientoOriginal?.occurredAt ?? original.createdAt);
  // ENG-023: la factura del turno, por su enlace (`Invoice.appointmentId`) y dentro del negocio.
  const facturaDelTurno = facturaDeLaVenta(
    await tx.invoice.findMany({
      where: { tenantId, appointmentId: args.appointmentId },
      select: { status: true },
    }),
  );
  // Opción B: la factura de ESTE cobro (las de los otros cobros del turno no frenan esta anulación).
  // Se lee después de tomar la fila del turno, que es la que escribe quien factura el cobro.
  const delCobro =
    facturaDelTurno === "sin-factura-viva" && !yaAnulada ? await facturaDelCobroInTx(tx, tenantId, args.collectionId) : null;
  // Un cobro de Mercado Pago puede estar cubierto por la factura del PAGO de MP (`mp:<pago>`),
  // entero o en parte junto a su factura propia: la nota de crédito va también contra esa parte
  // (certificación y re-certificación del PR #38). Si no, esa parte quedaba facturada de más.
  const porMP =
    facturaDelTurno === "sin-factura-viva" && !yaAnulada && original.method === "MERCADOPAGO"
      ? await coberturaMPDelCobroInTx(tx, tenantId, args.appointmentId, args.collectionId, filas)
      : [];
  // Todas las facturas vivas que cubren este cobro: autorizadas todas → nota de crédito; alguna en
  // camino (o en un estado desconocido) → se espera; ninguna viva → se anula sin nota.
  const vivasDelCobro = [...(delCobro ? [{ status: delCobro.status }] : []), ...porMP].filter((f) => f.status !== "REJECTED");
  const estadoDelCobro =
    vivasDelCobro.length === 0
      ? "sin-factura-viva"
      : vivasDelCobro.every((f) => f.status === "AUTHORIZED")
        ? "autorizada"
        : facturaDeLaVenta(vivasDelCobro.filter((f) => f.status !== "AUTHORIZED"));
  const conNota = estadoDelCobro === "autorizada" && Boolean(args.notaDeCredito);
  const plan = planAnulacion({
    note: original.note,
    amount: montoOriginal,
    yaAnulado: Boolean(yaAnulada),
    diaCerrado: Boolean(args.diaCerradoHasta && args.esDiaCerrado(diaContable, args.diaCerradoHasta)),
    // Autorizada con nota de crédito: se anula y la nota cancela la factura ante ARCA (abajo).
    factura: facturaDelTurno !== "sin-factura-viva" ? facturaDelTurno : conNota ? "sin-factura-viva" : estadoDelCobro,
  });
  if (!plan.ok) {
    if (plan.motivo === "ya-anulado" && yaAnulada) return { applied: false, reason: "duplicate", reversaId: yaAnulada.id };
    throw new AnulacionRechazada(plan.motivo);
  }
  // ORDEN: toda validación que puede rechazar la anulación corre ANTES de la nota de crédito.
  // La nota queda PENDING en la cola de esta misma transacción: si la anulación se rechaza después,
  // el rollback la deshace junto con todo lo demás. Validar antes evita igual crear (y enumerar)
  // una nota que se va a descartar (merge de #23 vouchers con #38 opción B).
  //
  // CH · cobro con voucher (src/lib/vouchers): el voucher vuelve a DISPONIBLE en esta misma tx,
  // sólo si OpenKey todavía no lo dio de baja NI lo liquidó. Con la baja o la liquidación hecha,
  // la anulación no corre: liberarlo dejaría plata de OpenKey sin cobro vivo que la explique.
  const voucher =
    original.method === "VOUCHER"
      ? await tx.voucher.findFirst({
          where: { tenantId, collectionId: args.collectionId },
          select: { id: true, bajaOpenKeyEn: true, liquidadoEn: true, liquidacionSemanalId: true },
        })
      : null;
  if (voucher?.liquidacionSemanalId) throw new AnulacionRechazada("voucher-en-liquidacion");
  if (voucher?.liquidadoEn) throw new AnulacionRechazada("voucher-liquidado");
  if (voucher?.bajaOpenKeyEn) throw new AnulacionRechazada("voucher-con-baja");
  // La liberación condicionada también va antes de la nota: si la baja o la liquidación de
  // OpenKey entró en paralelo, se rechaza acá, sin nota; y si sale, la fila del voucher queda
  // tomada hasta el final de la tx (si la nota falla, el rollback la devuelve a USADO).
  if (voucher) {
    const liberado = await tx.voucher.updateMany({
      where: {
        id: voucher.id,
        tenantId,
        estado: "USADO",
        collectionId: args.collectionId,
        bajaOpenKeyEn: null,
        liquidadoEn: null,
        // La liquidación del lunes toma el voucher con un updateMany sobre esta misma fila: el
        // bloqueo de fila ordena las dos transacciones y la segunda ve el estado de la primera.
        liquidacionSemanalId: null,
      },
      data: { estado: "DISPONIBLE", appointmentId: null, collectionId: null, valorCubierto: null, usadoEn: null, usadoPor: null },
    });
    // Cambió entre la lectura y acá (la foto o la liquidación de OpenKey entró en paralelo): no se anula.
    if (liberado.count !== 1) {
      const actual = await tx.voucher.findFirst({ where: { id: voucher.id, tenantId }, select: { liquidadoEn: true, liquidacionSemanalId: true } });
      throw new AnulacionRechazada(
        actual?.liquidacionSemanalId ? "voucher-en-liquidacion" : actual?.liquidadoEn ? "voucher-liquidado" : "voucher-con-baja",
      );
    }
  }

  // La nota de crédito va en ESTA transacción: si no sale, no se anula nada (ni libro ni Payment).
  let notaDeCreditoId: string | null = null;
  if (conNota && delCobro && delCobro.status === "AUTHORIZED" && args.notaDeCredito) {
    const nota = await args.notaDeCredito(tx, { tenantId, facturaId: delCobro.invoiceId, motivo: args.motivo });
    if (!nota.ok) throw new AnulacionRechazada("nota-de-credito", nota.error);
    notaDeCreditoId = nota.invoiceId;
  }
  if (conNota && porMP.length > 0 && args.notaDeCredito) {
    for (const parte of porMP) {
      const importe = parte.centavos / 100;
      const nota = await args.notaDeCredito(tx, { tenantId, facturaId: parte.invoiceId, motivo: args.motivo, importe });
      if (!nota.ok) throw new AnulacionRechazada("nota-de-credito", nota.error);
      // Esa parte de la factura de MP ya no cubre a nadie: la nota queda anotada contra el cobro.
      await tx.cobroFacturado.create({
        data: {
          tenantId,
          clave: claveNotaDeCobroMP(args.collectionId, parte.invoiceId),
          invoiceId: nota.invoiceId,
          importe,
          appointmentId: args.appointmentId,
        },
      });
      notaDeCreditoId = nota.invoiceId;
    }
  }

  const reversa = await tx.collection.create({
    data: {
      tenantId,
      originType: "APPOINTMENT",
      originId: args.appointmentId,
      appointmentId: args.appointmentId,
      // NEGATIVO a propósito: es la contrapartida, y así Σ cobros baja sin que ninguna
      // pantalla tenga que acordarse de filtrar filas anuladas.
      amount: round2(-montoOriginal),
      method: original.method,
      note: notaDeAnulacion(args.collectionId, args.motivo),
      collectedBy: args.actor,
      ...(args.withSchema ? { idempotencyKey: claveAnulacion(args.collectionId) } : {}),
    },
    select: { id: true },
  });

  // `Payment` sigue siendo el AGREGADO de los cobros del turno: si no baja acá, Reportes, la
  // ficha de la clienta y las comisiones seguirían contando plata que se dio de baja.
  const cobradoDespues = round2(Math.max(0, desglosarCobros(filas).cobrado - montoOriginal));
  await tx.payment.updateMany({
    where: { tenantId, appointmentId: args.appointmentId },
    data: {
      amount: cobradoDespues,
      // Sin un peso en pie, el turno NO está pago: si quedara APPROVED, la liquidación de
      // comisiones lo seguiría tomando como cobrado (`payment: { status: "APPROVED" }`).
      status: cobradoDespues > 0 ? "APPROVED" : "PENDING",
    },
  });

  const libro = await asentarReversaInTx(tx, tenantId, {
    collectionId: args.collectionId,
    asientoOriginal,
    method: original.method,
    monto: montoOriginal,
    motivo: args.motivo,
    actor: args.actor,
    withSchema: args.withSchema,
  });

  const estado = estadoCobroTurno({
    precio: args.precio,
    cobros: [...filas.map((f) => ({ amount: f.amount, method: f.method })), { amount: -montoOriginal, method: original.method }],
  });

  return {
    applied: true,
    reversaId: reversa.id,
    monto: montoOriginal,
    cobradoDespues,
    saldoDespues: estado.saldo,
    libro,
    ...(notaDeCreditoId ? { notaDeCreditoId } : {}),
  };
}

/**
 * ¿Este cobro quedó a rendir y ya se rindió? Devuelve el medio y el detalle del INGRESO de la
 * rendición (la plata entró por ahí). SQL crudo sobre las tablas de pending-gate2: se pregunta
 * antes si existen y si este rol puede leerlas (una tabla ausente abortaría la anulación entera).
 * Sin `Prisma` en runtime: este módulo lo importan pantallas del navegador.
 */
async function cobroRendidoInTx(
  tx: AnulacionTx,
  tenantId: string,
  collectionId: string,
): Promise<{ cashMovementId: string; method: string; reason: string | null } | null> {
  const hay = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT COALESCE(
      has_table_privilege(to_regclass('"CobroARendir"'), 'SELECT')
      AND has_table_privilege(to_regclass('"RendicionProfesional"'), 'SELECT'),
      false) AS ok`;
  if (hay[0]?.ok !== true) return null;
  const filas = await tx.$queryRaw<{ cashMovementId: string | null; method: string; reason: string | null }[]>`
    SELECT p."cashMovementId", p."method", m."reason"
    FROM "CobroARendir" r
    JOIN "RendicionProfesional" p ON p."id" = r."rendicionId" AND p."tenantId" = r."tenantId"
    LEFT JOIN "CashMovement" m ON m."id" = p."cashMovementId" AND m."tenantId" = p."tenantId"
    WHERE r."tenantId" = ${tenantId} AND r."collectionId" = ${collectionId}
    LIMIT 1`;
  const f = filas[0];
  // Sin asiento (rendición de $0, imposible con la retención apagada): nada entró, nada sale.
  if (!f || !f.cashMovementId) return null;
  return { cashMovementId: f.cashMovementId, method: f.method, reason: f.reason };
}

/**
 * El asiento contrario en el libro: un EGRESO por el mismo monto, el mismo medio, el mismo
 * turno de caja y la MISMA FECHA CONTABLE que la VENTA original — así el día del cobro
 * vuelve a cerrar en cero en vez de quedar con un ingreso de más y un egreso de hoy.
 *
 * Va contra `collectionId` del cobro ORIGINAL (no de la contrapartida): eso lo ata al
 * asiento que revierte por clave foránea, y el `@@unique(tenantId, collectionId, type)` que
 * ya existe se vuelve el árbitro de la carrera sin ninguna migración nueva.
 */
async function asentarReversaInTx(
  tx: AnulacionTx,
  tenantId: string,
  input: {
    collectionId: string;
    asientoOriginal: { id: string; occurredAt: Date; sessionId: string | null; reason: string | null; method?: string } | null;
    method: string;
    monto: number;
    motivo: string;
    actor: string;
    withSchema: boolean;
  },
): Promise<ReversaLibro> {
  // Sin columnas migradas el COBRO tampoco asentó nada (misma degradación acordada):
  // no hay libro que revertir.
  if (!input.withSchema) return { asentada: false, reason: "sin-migrar" };
  if (!input.asientoOriginal) return { asentada: false, reason: "sin-asiento-original" };

  const previo = await tx.cashMovement.findFirst({
    where: { tenantId, collectionId: input.collectionId, type: "EGRESO" },
    select: { id: true },
  });
  if (previo) return { asentada: false, reason: "ya-revertido" };

  // Dos causas DISTINTAS compartían etiqueta, y esta etiqueta es el único rastro que queda
  // cuando la reversa no se asienta: "no había asiento que revertir" y "el medio del cobro no
  // se traduce a un medio de caja" se investigan de maneras opuestas. Leer un `sin-asiento-original`
  // que en realidad era un medio raro manda a buscar al lugar equivocado.
  // La reversa sale de la MISMA columna que el asiento que revierte (M1-C2: una transferencia
  // asentada en `MP` antes del paquete no se revierte en `TRANSFERENCIA` después). Sin el dato,
  // la traducción de siempre.
  const traducido = cashMethodFromPaymentMethod(input.method);
  if (!traducido) return { asentada: false, reason: "medio-no-traducible" };
  const method = (input.asientoOriginal.method as CashMethod | undefined) ?? traducido;

  const mov = await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: input.asientoOriginal.sessionId,
      type: "EGRESO",
      method,
      amount: input.monto, // siempre > 0: el signo lo pone el tipo (`movementSign`)
      reason: detalleReversa(input.asientoOriginal.reason, input.motivo),
      occurredAt: input.asientoOriginal.occurredAt,
      collectionId: input.collectionId,
      createdBy: `${ANULACION_TURNO_ACTOR_PREFIX}${input.actor}`,
    },
    select: { id: true },
  });
  return { asentada: true, movementId: mov.id };
}

export type CondonarSaldoArgs = {
  appointmentId: string;
  status: string;
  precio: number;
  motivo: string;
  actor: string;
  withSchema: boolean;
};

export type CondonarSaldoResult =
  | { applied: true; condonacionId: string; monto: number }
  | { applied: false; reason: "duplicate"; condonacionId: string };

/**
 * Da de baja el saldo incobrable de un turno prestado. SIN plata: no escribe una sola fila
 * en el libro de caja, y eso es el punto — hoy la única salida es cobrar plata que no entró
 * (mintiendo en la caja) y compensarla con un EGRESO manual.
 *
 * Se asienta como una `Collection` marcada `CONDONACION:` porque Σ cobros es lo ÚNICO que
 * mueve el saldo derivado (`esCuentaACobrar`) sin tocar el precio congelado — y el precio
 * congelado, la comisión y su auditoría son otra decisión, de producto, no de este arreglo.
 *
 * ⚠️ `method` es EFECTIVO por obligación del enum `PaymentMethod` (MERCADOPAGO | EFECTIVO |
 * TRANSFERENCIA), no porque haya entrado efectivo: NO entró nada. La verdad de esta fila
 * está en la marca de `note`, y por eso `desglosarCobros` la separa de lo cobrado en vez de
 * sumarla. Nada del sistema agrupa cobros de turno por medio (la caja mira `CashMovement`,
 * que acá no se escribe); si algún día alguien lo hace, tiene que excluir estas filas.
 *
 * `Payment` NO se toca a propósito: sigue valiendo lo que REALMENTE entró, así Reportes no
 * ve un ingreso que nunca existió y la comisión —que se devenga sobre `payment.amount`— se
 * paga sobre la plata cobrada, no sobre la perdonada. Lo que la condonación sí destraba es
 * `sePuedeLiquidar`, que exige el turno saldado.
 */
export async function condonarSaldoTurnoInTx(
  tx: AnulacionTx,
  tenantId: string,
  args: CondonarSaldoArgs,
): Promise<CondonarSaldoResult> {
  const [previas, pagoLegado] = await Promise.all([
    tx.collection.findMany({
      where: { tenantId, originType: "APPOINTMENT", originId: args.appointmentId },
      select: { id: true, amount: true, method: true, note: true, createdAt: true },
    }),
    tx.payment.findUnique({
      where: { appointmentId: args.appointmentId },
      select: { status: true, amount: true },
    }),
  ]);
  const filas: CobroDelTurno[] = previas.map((c) => ({
    id: c.id,
    amount: round2(c.amount.toNumber()),
    method: c.method,
    note: c.note,
    createdAt: c.createdAt,
  }));

  // Idempotencia capa 1: ya hay una condonación para este turno → no se inventa otra.
  const yaCondonado = filas.find((f) => claseDeCobro(f.note) === "condonacion");
  if (yaCondonado) return { applied: false, reason: "duplicate", condonacionId: yaCondonado.id };

  const plan = planCondonacion({
    status: args.status,
    precio: args.precio,
    cobros: filas.map((f) => ({ amount: f.amount, method: f.method })),
    pagoLegado,
  });
  if (!plan.ok) throw new CondonacionRechazada(plan.motivo);

  const created = await tx.collection.create({
    data: {
      tenantId,
      originType: "APPOINTMENT",
      originId: args.appointmentId,
      appointmentId: args.appointmentId,
      amount: plan.monto,
      method: "EFECTIVO", // ver el ⚠️ de arriba: no entró plata, el enum no tiene "ninguno"
      note: notaDeCondonacion(args.motivo),
      collectedBy: args.actor,
      ...(args.withSchema ? { idempotencyKey: claveCondonacion(args.appointmentId) } : {}),
    },
    select: { id: true },
  });
  return { applied: true, condonacionId: created.id, monto: plan.monto };
}

// ── 3. LECTURA PARA LAS PANTALLAS ───────────────────────────────────────────

// ¿Falta la tabla/columna en la DB (migración sin aplicar)? P2021 = tabla, P2022 = columna.
//
// Se chequea por FORMA y no con `e instanceof Prisma.PrismaClientKnownRequestError` a propósito:
// este módulo lo importa `AppointmentRow.tsx`, que es un client component. Un import de VALOR del
// namespace de Prisma arrastra el runtime del cliente al bundle del browser y Turbopack corta el
// build con "the chunking context (unknown) does not support external modules (request: node:module)".
// Por eso `@/lib/prisma-errors` tampoco sirve acá: ese módulo sí importa Prisma como valor.
// El precio del duck-typing es que un objeto ajeno con `.code === "P2022"` pasaría; el beneficio es
// que este archivo queda importable desde el cliente, que es lo que la pantalla necesita.
function isSchemaMissing(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

/**
 * Cobros por turno CON su id y su nota, que es lo que la fila necesita para ofrecer "Anular
 * este cobro" y para distinguir cobrado de condonado.
 *
 * Hermano de `cobrosPorTurno` (cobro-turno-repo.ts) y con la misma tolerancia: si la tabla
 * `Collection` no está migrada, la agenda tiene que cargar igual con el mapa vacío. Devuelve
 * más columnas —`id` y `note`— porque sin el id no hay qué anular.
 */
export async function cobrosDetalladosPorTurno(
  db: { collection: { findMany: AnulacionTx["collection"]["findMany"] } },
  tenantId: string,
  appointmentIds: readonly string[],
): Promise<Map<string, CobroDelTurno[]>> {
  const map = new Map<string, CobroDelTurno[]>();
  if (appointmentIds.length === 0) return map;
  try {
    const rows = await db.collection.findMany({
      where: { tenantId, originType: "APPOINTMENT", originId: { in: [...appointmentIds] } },
      select: { id: true, originId: true, amount: true, method: true, note: true, createdAt: true, collectedBy: true },
      orderBy: { createdAt: "asc" },
    });
    for (const r of rows) {
      const arr = map.get(r.originId) ?? [];
      arr.push({ id: r.id, amount: round2(r.amount.toNumber()), method: r.method, note: r.note, createdAt: r.createdAt, collectedBy: r.collectedBy });
      map.set(r.originId, arr);
    }
  } catch (e) {
    if (!isSchemaMissing(e)) throw e;
  }
  return map;
}
