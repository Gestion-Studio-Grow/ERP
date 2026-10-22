// ============================================================================
// COBRO DIVIDIDO, LLEGÓ LA SEÑA, DEUDA VIEJA Y DESHACER — las reglas, PURAS (reingeniería CH, Tanda 2).
// ============================================================================
//
// Lo que la recepción de CH hacía con la cuenta en la cabeza:
//   · «Paga $10.000 en efectivo y el resto por Mercado Pago» — dos cobros por un turno, a mano, con
//     la cuenta mental del resto (R-E17). Acá: el reparto se valida contra el saldo al centavo y la
//     segunda línea se completa sola.
//   · «Llegó la seña» — buscar el turno, cobrar con el medio que venía en Efectivo, volver a
//     confirmar (R-E08). Acá: el monto es la seña que falta del servicio y el medio por defecto es
//     transferencia (cómo llegan las señas a CH, D6 *provisional a confirmar*).
//   · «Ya que estás, te debo lo de la otra vez» — dos cobros imputados cada uno a su turno (R-E19).
//   · «Me equivoqué, deshacé» — volver atrás una cancelación, un «no vino» o una seña recién cobrada
//     dentro de una ventana corta, y sólo si nada lo impide (el hueco sigue libre, la caja no cerró).
//
// Este módulo es la REGLA, sin DB ni sesión (cobro-dividido.test.ts). Las Server Actions viven en
// `cobro-actions.ts` y NO vuelven a hacer cuentas de plata: llaman a estas funciones y al motor de
// cobros de siempre (`aplicarCobroTurnoInTx`, `anularCobroTurnoInTx`). Mismo molde que el pago mixto
// del supermercado (`supermercado/pago-mixto-tx.ts`): centavos enteros, medios distintos, suma exacta.
//
// Lo importa también la pantalla (DividirPago.tsx, LlegoLaSenia.tsx): sin Prisma ni `server-only`.

import { centavosDe } from "@/lib/dinero/redondeo";
import { fmtMoneyARS } from "@/components/ui/format";
import { round2 } from "@/lib/round";
import {
  METODOS_DE_PAGO,
  METODO_LABEL,
  claveCobroTurno,
  esMetodoDePago,
  seniaDelServicio,
  type MetodoDePago,
} from "./cobros";

/** «$18.000» o «$7.500,50»: sin centavos cuando no hay (la voz de CH: pesos sin decimales). */
export function pesosDelCobro(n: number): string {
  return fmtMoneyARS(n, centavosDe(n) % 100 === 0 ? 0 : 2);
}

// ── 1. COBRO DIVIDIDO ────────────────────────────────────────────────────────

export type LineaDePago = { metodo: MetodoDePago; monto: number };

/** Hasta un cobro por medio: con los medios de hoy, tres. Más es un error de la pantalla. */
export const MAX_LINEAS_DIVIDIDO = METODOS_DE_PAGO.length;

export type ValidacionDividido = { ok: true; lineas: LineaDePago[]; total: number } | { ok: false; error: string };

/**
 * ¿Este reparto salda EXACTO lo que falta? Dos o más líneas, medios distintos, cada una con plata,
 * centavos como mucho, y la suma igual al saldo al centavo: ni un peso de menos (eso es «Queda
 * debiendo», otra tecla) ni uno de más (un turno no da vuelto por Mercado Pago).
 */
export function validarCobroDividido(lineas: readonly { metodo: string; monto: number }[], saldo: number): ValidacionDividido {
  const saldoC = centavosDe(saldo);
  if (!(saldoC > 0)) return { ok: false, error: "Este turno no tiene nada para cobrar." };
  if (lineas.length < 2) return { ok: false, error: "Para dividir el pago hacen falta dos medios." };
  if (lineas.length > MAX_LINEAS_DIVIDIDO) return { ok: false, error: `Hasta ${MAX_LINEAS_DIVIDIDO} medios por cobro.` };
  const vistos = new Set<string>();
  const limpias: LineaDePago[] = [];
  let sumaC = 0;
  for (const l of lineas) {
    if (!esMetodoDePago(l.metodo)) return { ok: false, error: "Hay un medio de pago que no se reconoce: elegilo de nuevo." };
    if (vistos.has(l.metodo)) return { ok: false, error: `${METODO_LABEL[l.metodo]} aparece dos veces: juntalo en una sola línea.` };
    vistos.add(l.metodo);
    const c = centavosDe(l.monto);
    if (!Number.isFinite(l.monto) || !(c > 0)) return { ok: false, error: `Poné cuánto paga con ${METODO_LABEL[l.metodo].toLowerCase()}.` };
    if (c / 100 !== l.monto) return { ok: false, error: "Los importes van con centavos como mucho." };
    sumaC += c;
    limpias.push({ metodo: l.metodo, monto: c / 100 });
  }
  if (sumaC < saldoC) return { ok: false, error: `Faltan ${pesosDelCobro((saldoC - sumaC) / 100)} para completar lo que falta cobrar.` };
  if (sumaC > saldoC) return { ok: false, error: `Te pasaste por ${pesosDelCobro((sumaC - saldoC) / 100)}: es más de lo que falta cobrar.` };
  return { ok: true, lineas: limpias, total: saldoC / 100 };
}

/** La línea que se completa sola: lo que falta después de la primera (nunca negativo). */
export function restoDelSaldo(saldo: number, primero: number): number {
  if (!Number.isFinite(primero) || primero <= 0) return round2(Math.max(0, saldo));
  return Math.max(0, centavosDe(saldo) - centavosDe(primero)) / 100;
}

export type RepartoEnPantalla =
  | { listo: true; lineas: [LineaDePago, LineaDePago]; texto: string }
  | { listo: false; resto: number; error?: string };

/**
 * El reparto de dos líneas tal como lo arma la hoja de cobro: el primer medio y su monto los elige
 * la recepción, el segundo medio también, y el segundo monto es el resto. Listo para cobrar sólo si
 * los dos medios están elegidos, son distintos y el primero no se come todo el saldo.
 */
export function repartoEnPantalla(p: {
  saldo: number;
  primero: { metodo: MetodoDePago | null; monto: number | null };
  segundoMetodo: MetodoDePago | null;
}): RepartoEnPantalla {
  const monto = p.primero.monto;
  const resto = restoDelSaldo(p.saldo, monto ?? 0);
  if (monto === null || !Number.isFinite(monto)) return { listo: false, resto };
  if (!(monto > 0)) return { listo: false, resto, error: "El monto tiene que ser mayor a cero." };
  if (centavosDe(monto) >= centavosDe(p.saldo)) {
    return { listo: false, resto: 0, error: "Eso ya es todo lo que falta: cobralo con un solo medio, arriba." };
  }
  if (!p.primero.metodo || !p.segundoMetodo) return { listo: false, resto };
  if (p.primero.metodo === p.segundoMetodo) return { listo: false, resto, error: "Elegí dos medios distintos." };
  const lineas: [LineaDePago, LineaDePago] = [
    { metodo: p.primero.metodo, monto: centavosDe(monto) / 100 },
    { metodo: p.segundoMetodo, monto: resto },
  ];
  const v = validarCobroDividido(lineas, p.saldo);
  if (!v.ok) return { listo: false, resto, error: v.error };
  return { listo: true, lineas, texto: textoDelReparto(lineas) };
}

/** «Efectivo $10.000 + Mercado Pago $8.000». */
export function textoDelReparto(lineas: readonly LineaDePago[]): string {
  return lineas.map((l) => `${METODO_LABEL[l.metodo]} ${pesosDelCobro(l.monto)}`).join(" + ");
}

/**
 * Clave de idempotencia de cada línea de un cobro de saldo: `saldo:<turno>:<n>`. La `n` va de 1 a
 * la cantidad de líneas en el cobro dividido, y es `1` para el turno que se termina en «sumar lo que
 * debe». Para un turno ya terminado al que se le cobra deuda vieja, `n` = filas de cobro que ya
 * tiene + 1: como las filas sólo crecen (una anulación suma una fila, no borra), esa `n` es siempre
 * mayor que cualquier clave anterior del turno — dos envíos de la MISMA foto chocan en el
 * `@@unique([tenantId, idempotencyKey])` (la carrera), y un cobro nuevo nunca choca con uno viejo.
 */
export function claveDeSaldo(appointmentId: string, n: number): string {
  return `saldo:${appointmentId}:${n}`;
}

/** Clave de la seña: `senia:<turno>`, la misma que usa la seña cobrada al reservar. */
export function claveDeSenia(appointmentId: string): string {
  return claveCobroTurno("senia", appointmentId);
}

/** El campo `pagos` del formulario (JSON de `{ metodo, monto }[]`), o por qué no se puede leer. */
export function leerPagos(raw: unknown): { ok: true; lineas: { metodo: string; monto: number }[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, error: "Faltan los medios del pago dividido." };
  let datos: unknown;
  try {
    datos = JSON.parse(raw);
  } catch {
    return { ok: false, error: "No se pudo leer el pago dividido. Recargá y probá de nuevo." };
  }
  if (!Array.isArray(datos)) return { ok: false, error: "No se pudo leer el pago dividido. Recargá y probá de nuevo." };
  const lineas: { metodo: string; monto: number }[] = [];
  for (const d of datos) {
    if (!d || typeof d !== "object") return { ok: false, error: "No se pudo leer el pago dividido. Recargá y probá de nuevo." };
    const o = d as { metodo?: unknown; monto?: unknown };
    lineas.push({ metodo: String(o.metodo ?? ""), monto: typeof o.monto === "number" ? o.monto : Number(o.monto) });
  }
  return { ok: true, lineas };
}

// ── 2. LLEGÓ LA SEÑA ─────────────────────────────────────────────────────────

/** Cómo llegan las señas a CH: por transferencia (D6, *provisional a confirmar*). Se cambia en el botón. */
export const MEDIO_DE_LA_SENIA: MetodoDePago = "TRANSFERENCIA";

/**
 * La nota del cobro de «Llegó la seña»: es lo que reconoce «Deshacer» (no es una marca reservada).
 * «Verificada por recepción»: el botón se toca cuando la plata SE VE en el banco o en Mercado Pago,
 * no por la captura que manda la clienta (comprobante informado ≠ cobrado; decisión del orquestador).
 */
export const NOTA_LLEGO_LA_SENIA = "Llegó la seña (verificada por recepción)";

/** La ayuda debajo de «Llegó la seña» (buscador y cajón): cuándo se toca. */
export const AYUDA_LLEGO_LA_SENIA = "Tocalo cuando la veas en el banco o en Mercado Pago, no por la captura.";

/** La seña que FALTA cobrar: la del servicio (acotada al precio) menos la plata que ya entró. */
export function seniaQueFalta(p: { depositAmount: number | null | undefined; precio: number; cobradoReal: number }): number {
  const senia = seniaDelServicio({ depositAmount: p.depositAmount, precio: p.precio });
  if (!(senia > 0)) return 0;
  return Math.max(0, centavosDe(senia) - centavosDe(Math.max(0, p.cobradoReal))) / 100;
}

export type PlanDeSenia =
  /** Cobrar `monto` y, si estaba Reservado, confirmarlo. */
  | { tipo: "cobrar"; monto: number; confirmar: boolean }
  /** La seña ya entró (otro toque, otra recepcionista): sólo falta confirmarlo. */
  | { tipo: "solo-confirmar" }
  /** Ya estaba todo: la seña cobrada y el turno confirmado. Un doble toque no hace nada. */
  | { tipo: "ya-estaba" }
  | { tipo: "rechazado"; motivo: string };

export const MENSAJE_SENIA_CAMBIO = "La seña de este turno cambió recién. Recargá y fijate cuánto falta.";

/**
 * Qué hace «Llegó la seña» con este turno. Idempotente por la plata, además de por la clave: si la
 * seña ya entró, no se cobra de nuevo aunque la columna de la clave no esté migrada.
 * `montoEsperado` es lo que decía el botón: si la pantalla quedó vieja (entró un parcial), no se
 * cobra un monto que la recepción no vio.
 */
export function planDeSenia(p: {
  status: string;
  depositAmount: number | null | undefined;
  precio: number;
  cobradoReal: number;
  montoEsperado?: number | null;
}): PlanDeSenia {
  if (p.status !== "PENDING" && p.status !== "CONFIRMED") {
    return { tipo: "rechazado", motivo: "Ese turno ya no está reservado ni confirmado: no se le cobra la seña." };
  }
  const senia = seniaDelServicio({ depositAmount: p.depositAmount, precio: p.precio });
  if (!(senia > 0)) return { tipo: "rechazado", motivo: "Este servicio no tiene seña: confirmalo sin seña." };
  const falta = seniaQueFalta(p);
  const confirmar = p.status === "PENDING";
  if (falta <= 0) return confirmar ? { tipo: "solo-confirmar" } : { tipo: "ya-estaba" };
  if (p.montoEsperado != null && Number.isFinite(p.montoEsperado) && centavosDe(p.montoEsperado) !== centavosDe(falta)) {
    return { tipo: "rechazado", motivo: MENSAJE_SENIA_CAMBIO };
  }
  return { tipo: "cobrar", monto: falta, confirmar };
}

// ── 3. DEUDA VIEJA («+ Sumar lo que debe») ───────────────────────────────────

/** Un turno ya terminado que la clienta todavía debe (cuenta a cobrar). */
export type DeudaVieja = { turnoId: string; inicio: string; servicio: string; saldo: number };

/** Lo que debe en total. */
export function totalDeLaDeuda(deudas: readonly { saldo: number }[]): number {
  return deudas.reduce((s, d) => s + centavosDe(d.saldo), 0) / 100;
}

export type PedidoDeCobroVarios = { id: string; monto: number };

/** Hasta cuántos turnos en un solo cobro: más es casi seguro un error de la pantalla. */
export const TOPE_COBRO_VARIOS = 10;

export function leerCobrosVarios(raw: unknown): { ok: true; cobros: PedidoDeCobroVarios[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, error: "Faltan los turnos a cobrar." };
  let datos: unknown;
  try {
    datos = JSON.parse(raw);
  } catch {
    return { ok: false, error: "No se pudo leer el cobro. Recargá y probá de nuevo." };
  }
  if (!Array.isArray(datos)) return { ok: false, error: "No se pudo leer el cobro. Recargá y probá de nuevo." };
  const cobros: PedidoDeCobroVarios[] = [];
  for (const d of datos) {
    const o = (d ?? {}) as { id?: unknown; monto?: unknown };
    cobros.push({ id: typeof o.id === "string" ? o.id : "", monto: typeof o.monto === "number" ? o.monto : Number(o.monto) });
  }
  return { ok: true, cobros };
}

/**
 * El pedido de «cobrar varios turnos» bien formado: ids presentes y distintos, montos con plata y
 * centavos como mucho, y el turno que se termina (si hay) entre los cobrados o sin saldo (eso lo
 * mira el servidor con la plata real). Lo de cada turno (saldo, estado, clienta) lo valida la
 * acción adentro de la transacción.
 */
export function validarCobrosVarios(cobros: readonly PedidoDeCobroVarios[]): string | null {
  if (cobros.length === 0) return "Elegí qué turnos cobrás.";
  if (cobros.length > TOPE_COBRO_VARIOS) return `Hasta ${TOPE_COBRO_VARIOS} turnos en un mismo cobro.`;
  const ids = new Set<string>();
  for (const c of cobros) {
    if (!c.id) return "Falta identificar un turno del cobro.";
    if (ids.has(c.id)) return "Un turno aparece dos veces en el cobro.";
    ids.add(c.id);
    const cent = centavosDe(c.monto);
    if (!Number.isFinite(c.monto) || !(cent > 0)) return "Hay un turno sin monto para cobrar.";
    if (cent / 100 !== c.monto) return "Los importes van con centavos como mucho.";
  }
  return null;
}

// ── 4. DESHACER ──────────────────────────────────────────────────────────────

/**
 * Cuánto dura el «Deshacer» del lado del servidor: 10 minutos (§3.3 del diseño). La pantalla lo
 * ofrece menos tiempo (el aviso dura 10 s); el servidor es más generoso para que la demora de la red
 * no deje a la recepción con un «ya no se puede» injusto, y más corto que un turno de caja.
 */
export const VENTANA_DESHACER_MS = 10 * 60 * 1000;

export type QueSeDeshace = "cancelacion" | "no-vino" | "senia";

export function leerQueSeDeshace(raw: unknown): QueSeDeshace | null {
  return raw === "cancelacion" || raw === "no-vino" || raw === "senia" ? raw : null;
}

export const MENSAJE_VENTANA_VENCIDA = "Ya pasaron más de 10 minutos: esto ya no se deshace desde acá. Si hace falta, volvé a darle el turno.";

/**
 * ¿Se puede volver atrás una cancelación o un «no vino»? El turno tiene que estar en ese estado y
 * dentro de la ventana desde que se marcó (`hechoEl`, de la auditoría). Que el hueco siga libre lo
 * mira el servidor con `assertSlotAvailable`, adentro de la transacción.
 */
export function puedeDeshacerCierre(p: {
  que: Exclude<QueSeDeshace, "senia">;
  status: string;
  hechoEl: Date | null;
  ahora: Date;
}): { ok: true } | { ok: false; motivo: string } {
  const esperado = p.que === "cancelacion" ? "CANCELLED" : "NO_SHOW";
  if (p.status !== esperado) {
    return { ok: false, motivo: p.que === "cancelacion" ? "Ese turno ya no está cancelado: no hay nada que deshacer." : "Ese turno ya no figura como que no vino: no hay nada que deshacer." };
  }
  if (!p.hechoEl) return { ok: false, motivo: "No encuentro cuándo se marcó: esto ya no se deshace desde acá." };
  if (p.ahora.getTime() - p.hechoEl.getTime() > VENTANA_DESHACER_MS) return { ok: false, motivo: MENSAJE_VENTANA_VENCIDA };
  return { ok: true };
}

/** ¿Se puede deshacer la seña recién cobrada? El cobro tiene que ser de «Llegó la seña» y reciente. */
export function puedeDeshacerSenia(p: { note: string | null; cobradoEl: Date; ahora: Date }): { ok: true } | { ok: false; motivo: string } {
  if (p.note !== NOTA_LLEGO_LA_SENIA) return { ok: false, motivo: "Ese cobro no es una seña recién llegada: anulalo desde «La plata» con su motivo." };
  if (p.ahora.getTime() - p.cobradoEl.getTime() > VENTANA_DESHACER_MS) return { ok: false, motivo: MENSAJE_VENTANA_VENCIDA };
  return { ok: true };
}

/** El motivo con que queda anulada una seña deshecha (la auditoría y el libro lo leen). */
export const MOTIVO_DESHACER_SENIA = "deshacer: la seña se marcó por error";

// ── 5. LOS CAMPOS DE LAS ACCIONES (los de seña y dividir viven en `_agenda/campos.ts`) ──

/** «+ Sumar lo que debe»: los campos de `cobrarVariosTurnos`. */
export function camposDeCobrarVarios(p: {
  cobros: readonly PedidoDeCobroVarios[];
  metodo: MetodoDePago;
  /** El turno que además se termina (el de hoy), si hay. */
  terminar?: { turnoId: string; estado?: string } | null;
}): readonly (readonly [string, string])[] {
  const c: [string, string][] = [
    ["cobros", JSON.stringify(p.cobros.map((x) => ({ id: x.id, monto: x.monto })))],
    ["method", p.metodo],
  ];
  if (p.terminar) {
    c.push(["terminar", p.terminar.turnoId]);
    if (p.terminar.estado === "PENDING") c.push(["vino", "on"]);
  }
  return c;
}

/** «Deshacer»: los campos de `deshacerCierre`. */
export function camposDeDeshacer(p: { turnoId: string; que: QueSeDeshace; cobroId?: string | null }): readonly (readonly [string, string])[] {
  const c: [string, string][] = [
    ["appointmentId", p.turnoId],
    ["que", p.que],
  ];
  if (p.que === "senia" && p.cobroId) c.push(["cobroId", p.cobroId]);
  return c;
}
