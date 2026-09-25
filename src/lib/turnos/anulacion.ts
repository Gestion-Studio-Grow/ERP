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
import { estadoCobroTurno, type CobroTurno, type PagoLegado } from "./cobros";
import { cashMethodFromPaymentMethod } from "@/lib/caja/cierre-diario";
import { facturaDeLaVenta, mensajeFacturaViva, type FacturaDeLaVenta } from "@/lib/factura-viva";

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

const MARCA_ANULACION = "ANULACION:";
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
  | "dia-cerrado"; // el día del asiento ya está cerrado: la corrección va con fecha de hoy

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
    case "dia-cerrado":
      return "Ese cobro es de un día ya cerrado y un día contado no se toca. La corrección va con fecha de hoy: cargala en el libro de caja como INGRESO/EGRESO, con el motivo.";
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
  constructor(motivo: MotivoAnulacionRechazada) {
    super(mensajeAnulacionRechazada(motivo));
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
};

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
  let asientoOriginal: { id: string; occurredAt: Date; sessionId: string | null; reason: string | null } | null = null;
  if (args.withSchema) {
    asientoOriginal = await tx.cashMovement.findFirst({
      where: { tenantId, collectionId: args.collectionId, type: "VENTA" },
      select: { id: true, occurredAt: true, sessionId: true, reason: true },
    });
  }

  const diaContable = args.diaDe(asientoOriginal?.occurredAt ?? original.createdAt);
  const plan = planAnulacion({
    note: original.note,
    amount: montoOriginal,
    yaAnulado: Boolean(yaAnulada),
    diaCerrado: Boolean(args.diaCerradoHasta && args.esDiaCerrado(diaContable, args.diaCerradoHasta)),
    // ENG-023: la factura del turno, por su enlace (`Invoice.appointmentId`) y dentro del negocio.
    factura: facturaDeLaVenta(
      await tx.invoice.findMany({
        where: { tenantId, appointmentId: args.appointmentId },
        select: { status: true },
      }),
    ),
  });
  if (!plan.ok) {
    if (plan.motivo === "ya-anulado" && yaAnulada) return { applied: false, reason: "duplicate", reversaId: yaAnulada.id };
    throw new AnulacionRechazada(plan.motivo);
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

  return { applied: true, reversaId: reversa.id, monto: montoOriginal, cobradoDespues, saldoDespues: estado.saldo, libro };
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
    asientoOriginal: { id: string; occurredAt: Date; sessionId: string | null; reason: string | null } | null;
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
  const method = cashMethodFromPaymentMethod(input.method);
  if (!method) return { asentada: false, reason: "medio-no-traducible" };

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
      select: { id: true, originId: true, amount: true, method: true, note: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    for (const r of rows) {
      const arr = map.get(r.originId) ?? [];
      arr.push({ id: r.id, amount: round2(r.amount.toNumber()), method: r.method, note: r.note, createdAt: r.createdAt });
      map.set(r.originId, arr);
    }
  } catch (e) {
    if (!isSchemaMissing(e)) throw e;
  }
  return map;
}
