// Aritmética PURA del CIERRE DIARIO de caja.
//
// Es la tercera lectura del MISMO ledger (`CashMovement`), no una contabilidad aparte:
//   · el arqueo de turno (cash-register.ts) mira UN turno y SOLO el efectivo;
//   · el libro (libro-caja.ts) mira UN mes y los TRES medios;
//   · el cierre diario mira "desde el último cierre hasta hoy", los tres medios, y
//     COMPARA lo que el libro dice que hay contra lo que la persona DECLARA que hay.
//
// Lo que este módulo agrega sobre el libro es una sola cosa: la DIFERENCIA, y el
// asiento que la deja escrita. La auditoría de la planilla de CH Estética encontró un
// faltante de $154.500 anotado en marzo al margen y nunca aplicado, con abril abriendo
// como si la plata estuviera. Acá eso no puede pasar: cerrar un día con diferencia
// PRODUCE los movimientos de ajuste (`ajustes`), y el día siguiente abre con lo que se
// contó, no con lo que la planilla decía. La persistencia (guardar el cierre, escribir
// los ajustes, congelar los días) vive en la server action y NUNCA duplica esta
// aritmética. Sin Prisma, sin sesión, sin tenant — ver cierre-diario.test.ts.
//
// El signo de cada movimiento lo decide `movementSign` (cash-register.ts), como en el
// libro. No hay una segunda tabla de signos acá: los ajustes se emiten como INGRESO
// (sobrante) / EGRESO (faltante) y el test verifica que su signo sale de esa tabla.

import { round2 } from "@/lib/round";
import { movementSign, type CashMethod } from "@/lib/caja/cash-register";
import {
  CASH_METHODS,
  CASH_METHOD_LABEL,
  buildLibro,
  openingFromHistory,
  totalOf,
  zeroAmounts,
  type LibroMovement,
  type MethodAmounts,
} from "@/lib/caja/libro-caja";

// ── Días ────────────────────────────────────────────────────────────────────
//
// El cierre se identifica por el DÍA CALENDARIO del negocio ("YYYY-MM-DD" en la zona
// del tenant), nunca por un instante UTC: a las 22:00 de Buenos Aires ya es mañana en
// UTC y el cierre "de hoy" caería en otro día. Convertir instante → día es trabajo del
// llamador (`dateStrInBusinessTz` en datetime.ts); acá los días son strings opacos y
// comparables (ISO ordena lexicográficamente).

export type DayKey = string;

export function isDayKey(raw: string | null | undefined): raw is DayKey {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  // Rechaza 2026-02-30 y similares: Date los "corrige" al mes siguiente.
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// "2026-09-06" → "06/09/2026", como lo lee la persona. Sin Intl: el día ya viene
// resuelto en la zona del negocio y no hay instante que convertir.
export function formatDayLabel(day: DayKey): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

// ── Congelamiento ───────────────────────────────────────────────────────────
//
// Cerrar el día D congela TODO lo fechado hasta D inclusive, no solo D. Es la regla
// que hace que el cierre valga algo: si el 05/09 quedara editable después de cerrar el
// 06/09, el "esperado" que se congeló el 06 dejaría de ser reproducible. La frontera es
// una sola por tenant —el último día cerrado— y se consulta con esta función desde
// cualquier acción que escriba en el libro (alta, borrado, cobro o pago de cuenta corriente).
// El CIERRE DEL MES no mueve esta frontera: exige que el mes ya esté cerrado día por día
// (cierre-mes/cierre-mes.ts), así que lo que el mes congela en la caja ya lo congeló el día.
//
// Corolario: los días sin cierre propio (un domingo, un sábado que se pasó por alto)
// quedan absorbidos por el cierre siguiente. Eso es correcto: "cerrar el 08/09" es
// arquear desde el último cierre, no solo las 24 horas del 08.

export function isFrozenDay(day: DayKey, lastClosedDay: DayKey | null): boolean {
  if (!lastClosedDay) return false;
  return compareDayKeys(day, lastClosedDay) <= 0;
}

/**
 * El mensaje del día congelado. Manda a cargar en el PRIMER DÍA ABIERTO, no "hoy".
 *
 * El QA de recorrido encontró el callejón: se cierra el día de hoy, aparece un gasto, y el
 * mensaje decía "cargalo con la fecha de hoy" — que es justo el día que se acaba de
 * congelar. La única salida real era fecharlo mañana, o sea lo contrario de lo que el
 * mensaje pedía. Ahora el mensaje dice la fecha exacta que sí se puede usar.
 */
export function frozenDayMessage(day: DayKey, lastClosedDay: DayKey): string {
  const abierto = nextDayKey(lastClosedDay);
  const mismoDia = day === lastClosedDay;
  return (
    (mismoDia
      ? `El ${formatDayLabel(day)} ya está cerrado. `
      : `El ${formatDayLabel(day)} quedó dentro del cierre del ${formatDayLabel(lastClosedDay)}. `) +
    `No se puede cargar ni borrar nada con esa fecha. Si falta un movimiento, cargalo con fecha ` +
    `${formatDayLabel(abierto)} —el primer día abierto— y aclarás en el detalle que es del ${formatDayLabel(day)}.`
  );
}

// ── Puente con cuentas a cobrar ─────────────────────────────────────────────
//
// Un cobro de cartera (`Collection` RECEIVABLE) viene con el `PaymentMethod` de la
// cartera, que no es el `CashMethod` del libro: la cartera no distingue MP de
// transferencia (y el libro los junta a propósito en una sola columna), y no tiene
// TARJETA. Esta es la ÚNICA traducción entre los dos vocabularios. `null` = no hay
// columna del libro para ese medio: el llamador tiene que frenar, no adivinar.

export function cashMethodFromPaymentMethod(paymentMethod: string): CashMethod | null {
  switch (paymentMethod) {
    case "EFECTIVO":
      return "EFECTIVO";
    case "MERCADOPAGO":
    case "TRANSFERENCIA":
      return "MP";
    // N2 · M1: Tarjeta (posnet) tiene su columna en el libro desde siempre. En `PaymentMethod`
    // existe sólo con N2_enums.sql aplicada; mientras tanto ningún cobro llega con este valor.
    case "TARJETA":
      return "TARJETA";
    default:
      return null;
  }
}

// ── Tipos del cierre ────────────────────────────────────────────────────────

// Movimiento visto por el cierre: el del libro + el rastro opcional al cobro de
// cartera que lo originó. Ese rastro es lo que evita el doble conteo (ver el diseño):
// si un ingreso vino de cuentas a cobrar, el cierre lo cuenta UNA vez como ingreso del
// libro y lo REPORTA aparte como "cobro de cartera" — nunca lo suma dos veces.
// Movimiento visto por el cierre: el del libro + de qué COBRO salió, si salió de uno.
// `collectionOrigin` es el `Collection.originType` (ORDER | APPOINTMENT | RECEIVABLE |
// PAYABLE). Hace falta el ORIGEN y no alcanza el id: el rótulo de la pantalla dice
// "vinieron de cuentas a cobrar", y con sólo el id se lo ponía a CUALQUIER movimiento con
// rastro a un cobro — los cobros de TURNO también lo tienen. Con el origen no puede mentir.
// El fiado escribe su rastro desde `aplicarConAsientoInTx` (settlement/collection-repo.ts),
// con CUENTAS_CORRIENTES_ENABLED: un INGRESO con el `collectionId` del cobro RECEIVABLE, que
// acá cuenta UNA vez en el esperado y se muestra aparte como "cobro de cartera".
export type CierreMovement = LibroMovement & {
  collectionId?: string | null;
  collectionOrigin?: string | null;
  /**
   * El `PaymentMethod` con que se cobró lo que originó el movimiento (el del cobro si salió de
   * uno, si no el del pedido). Es lo ÚNICO que separa Mercado Pago de Transferencia: el libro
   * los guarda juntos en `MP` (ver `columnaDelMovimiento`). Ausente = no se sabe → Mercado Pago.
   */
  medioDeOrigen?: string | null;
};

// ── Columnas del cierre (N2 · M1-C2) ────────────────────────────────────────
//
// El libro tiene tres medios (`CashMethod`: EFECTIVO · MP · TARJETA) y junta Mercado Pago con
// transferencia en `MP` a propósito (es la columna de la planilla). El cierre del día los
// SEPARA para contarlos: lo que dice la app de Mercado Pago no es lo que dice el banco. La
// columna Transferencia es un desglose de `MP`, no un medio nuevo del libro:
//
//   · lo que se movió en el período por transferencia (según `medioDeOrigen`) va a su columna;
//     el resto de `MP` —con el saldo que venía de antes— queda en Mercado Pago. Las dos suman
//     exactamente el `MP` del libro, así el total y el arrastre no cambian;
//   · la diferencia de cada columna se asienta en `MP` (es donde vive en el libro), con el
//     detalle que dice de cuál de las dos salió.
//
// Sin `columnas` (los llamadores de siempre) el cierre es el de antes: tres medios, MP junto.
export type ColumnaDelCierre = CashMethod | "TRANSFERENCIA";

/** El orden de la hoja nueva: EFECTIVO · MP · TRANSFERENCIA · TARJETA. */
export const COLUMNAS_DEL_CIERRE: readonly ColumnaDelCierre[] = ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"];

export const ETIQUETA_DE_COLUMNA: Record<ColumnaDelCierre, string> = {
  EFECTIVO: "Efectivo",
  MP: "Mercado Pago",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
};

/** En qué medio del libro vive una columna. */
export function metodoDeColumna(c: ColumnaDelCierre): CashMethod {
  return c === "TRANSFERENCIA" ? "MP" : c;
}

/** La columna de un movimiento: su medio del libro, salvo `MP` cobrado por transferencia. PURA. */
export function columnaDelMovimiento(m: { method: CashMethod; medioDeOrigen?: string | null }): ColumnaDelCierre {
  if (m.method === "MP" && m.medioDeOrigen === "TRANSFERENCIA") return "TRANSFERENCIA";
  return m.method;
}

/**
 * Qué columnas cuenta la hoja. Tarjeta sólo si se puede cobrar con tarjeta (el valor está en
 * `PaymentMethod`, ver `tarjetaHabilitadaPor` en medio-cobro.ts) o si igual se movió plata por
 * tarjeta en el libro (un asiento a mano: esconderla dejaría plata sin columna). PURA.
 */
export function columnasDelCierre(p: { tarjetaHabilitada: boolean; tarjetaSeMovio: boolean }): ColumnaDelCierre[] {
  return COLUMNAS_DEL_CIERRE.filter((c) => c !== "TARJETA" || p.tarjetaHabilitada || p.tarjetaSeMovio);
}

// Lo que la persona DECLARA que hay al cierre, por medio. `null` = ese medio no se
// concilia hoy (la tarjeta se liquida a T+N y el negocio no la cuenta por día). El
// EFECTIVO no puede quedar en null: contar el cajón es el acto mínimo del cierre.
// `TRANSFERENCIA` sólo cuenta cuando el cierre separa esa columna (`columnas`).
export type DeclaredAmounts = Record<CashMethod, number | null> & { TRANSFERENCIA?: number | null };

export type CierreMedio = {
  opening: number; // saldo al arrancar el período (lo que quedó del cierre anterior)
  ingresos: number;
  egresos: number;
  expected: number; // opening + ingresos − egresos: lo que el libro dice que hay
  cobrosCartera: number; // parte de `ingresos` que vino de cuentas a cobrar / fiado (informativo)
  declared: number | null; // lo contado / lo que dice el extracto
  diff: number | null; // declared − expected: >0 sobra, <0 falta, null sin declarar
};

// Fila TOTAL. `declared` y `diff` suman SOLO los medios declarados: un total que
// mezclara medios contados con medios sin contar diría un número que nadie contó.
export type CierreTotal = {
  opening: number;
  ingresos: number;
  egresos: number;
  expected: number;
  declared: number;
  diff: number;
};

/**
 * El texto cuando el arqueo no cuadra y no se anotó por qué. UNO solo para el cierre del día y el
 * cierre del turno de cajero (`notaFaltanteDelArqueo`, abajo): la persona lee lo mismo.
 */
export const NOTA_OBLIGATORIA_CON_DIFERENCIA =
  "Hay diferencia entre lo que dice el libro y lo que contaste. Anotá por qué (o " +
  "“sin explicación por ahora”): la diferencia se asienta igual, pero tiene que quedar dicho.";

/**
 * ¿Falta la nota del cierre del turno? PURA. Con diferencia (`diff` ≠ 0, ya redondeada por
 * `arqueoContraElLibro`, saldo-cajon.ts) y sin nota, devuelve el MISMO texto que el cierre del
 * día: el faltante se asienta igual, pero sin un porqué no se cierra. Cuadrando, la nota sigue
 * siendo opcional.
 * Lo usan el servidor (`closeCashSession`) y el formulario del turno (CajaForms.tsx).
 */
export function notaFaltanteDelArqueo(diff: number, nota: string | null | undefined): string | null {
  if (diff === 0) return null;
  return String(nota ?? "").trim() ? null : NOTA_OBLIGATORIA_CON_DIFERENCIA;
}

export type CierreEstado =
  | "SIN_DECLARAR" // no se declaró ningún medio: todavía no es un cierre
  | "CUADRA" // todo medio declarado da diferencia 0
  | "SOBRANTE" // hay plata de más en al menos un medio y de menos en ninguno
  | "FALTANTE" // hay plata de menos en al menos un medio y de más en ninguno
  | "MIXTO"; // sobra en un medio y falta en otro (típico: cobro anotado en el medio equivocado)

// Movimiento de AJUSTE que el cierre manda a escribir. Es un INGRESO/EGRESO común del
// libro —mismo tipo, mismo signo, misma fila— con un detalle que dice de dónde salió.
// El tipo es deliberadamente el par que el libro ya deja cargar a mano (LIBRO_TYPES en
// libro-caja-actions.ts): el ajuste no es una categoría nueva, es la fila que la
// planilla hacía a mano en su fila 32 y 154 ("diferencia de caja").
export type AjusteCierre = {
  type: "INGRESO" | "EGRESO";
  method: CashMethod;
  amount: number; // siempre > 0
  detail: string;
};

export type CierreDiario = {
  day: DayKey;
  since: DayKey | null; // primer día que abarca (día siguiente al último cierre); null = desde el origen
  /** Por medio DEL LIBRO (lo que se asienta y arrastra). Con Transferencia separada, MP es la suma. */
  porMedio: Record<CashMethod, CierreMedio>;
  /** Las columnas que se cuentan, en orden (sin `columnas` en la entrada: los tres medios de siempre). */
  columnas: ColumnaDelCierre[];
  /** Por columna de la hoja. Una columna que no está en `columnas` queda en cero y sin declarar. */
  porColumna: Record<ColumnaDelCierre, CierreMedio>;
  total: CierreTotal;
  movementCount: number;
  cobrosCarteraCount: number;
  ajustes: AjusteCierre[];
  estado: CierreEstado;
};

// ── Construcción ────────────────────────────────────────────────────────────

// Monto declarado usable: finito y redondeado. Cualquier otra cosa es "no declarado" —
// la validación (más abajo) es la que dice si eso es un error o no.
function declaredOf(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? round2(v) : null;
}

function ajusteDetail(day: DayKey, etiqueta: string, diff: number): string {
  const que = diff > 0 ? "sobrante" : "faltante";
  return `Diferencia de caja ${formatDayLabel(day)}: ${que} en ${etiqueta}`;
}

function medioVacio(): CierreMedio {
  return { opening: 0, ingresos: 0, egresos: 0, expected: 0, cobrosCartera: 0, declared: null, diff: null };
}

// Arma el cierre de un día.
//
//   previous  → todo lo anterior al período (hasta el último cierre inclusive, con sus
//               ajustes). De acá sale el saldo de apertura, derivado y no tipeado —
//               igual que el libro.
//   movements → lo del período (desde el día siguiente al último cierre hasta `day`).
//   declared  → lo contado / lo que dice el extracto, por medio.
//
// El esperado por medio es `buildLibro(...).summary.saldo`: la MISMA aritmética del
// libro, sin reimplementar. Lo único que el cierre calcula por su cuenta es la
// diferencia y los ajustes que la asientan.
/** `Collection.originType` del fiado. Es el único origen que cuenta como cobro de cartera. */
export const ORIGEN_CUENTA_A_COBRAR = "RECEIVABLE";

export function buildCierreDiario(input: {
  day: DayKey;
  since?: DayKey | null;
  previous: readonly LibroMovement[];
  movements: readonly CierreMovement[];
  declared: DeclaredAmounts;
  /** Las columnas que se cuentan (`columnasDelCierre`). Sin esto: EFECTIVO · MP · TARJETA, MP junto. */
  columnas?: readonly ColumnaDelCierre[];
}): CierreDiario {
  const opening = openingFromHistory(input.previous);
  const { summary } = buildLibro(opening, input.movements);
  const columnas: ColumnaDelCierre[] = input.columnas ? COLUMNAS_DEL_CIERRE.filter((c) => input.columnas!.includes(c)) : [...CASH_METHODS];
  // EFECTIVO siempre: contar el cajón es el acto mínimo del cierre.
  if (!columnas.includes("EFECTIVO")) columnas.unshift("EFECTIVO");
  const separaTransferencia = columnas.includes("TRANSFERENCIA");
  const etiqueta = (c: ColumnaDelCierre) => (separaTransferencia ? ETIQUETA_DE_COLUMNA[c] : CASH_METHOD_LABEL[metodoDeColumna(c)]);

  // Cobros que vinieron de CUENTAS A COBRAR (fiado): ya están dentro de `ingresos` (son
  // filas del libro). Se suman aparte SOLO para mostrarlos; no vuelven a entrar al
  // esperado. Se identifican por el ORIGEN del cobro, no por tener rastro a uno: un cobro
  // de turno también lo tiene y no es fiado.
  const cobros = zeroAmounts();
  let cobrosCount = 0;
  // Lo que se movió por transferencia en el período (parte de `MP` del libro).
  const transf = { ingresos: 0, egresos: 0, cobrosCartera: 0 };
  for (const m of input.movements) {
    if (!Number.isFinite(m.amount) || m.amount <= 0) continue;
    const signo = movementSign(m.type);
    const esTransf = separaTransferencia && columnaDelMovimiento(m) === "TRANSFERENCIA";
    if (esTransf && signo > 0) transf.ingresos += m.amount;
    if (esTransf && signo < 0) transf.egresos += m.amount;
    if (m.collectionOrigin !== ORIGEN_CUENTA_A_COBRAR) continue;
    if (signo <= 0) continue; // un cobro de cartera solo puede ser ingreso
    cobros[m.method] += m.amount;
    if (esTransf) transf.cobrosCartera += m.amount;
    cobrosCount += 1;
  }

  // Por columna: el medio del libro, con Transferencia sacada de MP cuando se separa.
  const porColumna = {} as Record<ColumnaDelCierre, CierreMedio>;
  for (const c of COLUMNAS_DEL_CIERRE) porColumna[c] = medioVacio();
  for (const k of CASH_METHODS) {
    if (!columnas.includes(k)) continue;
    porColumna[k] = {
      ...medioVacio(),
      opening: opening[k],
      ingresos: summary.ingresos[k],
      egresos: summary.egresos[k],
      expected: summary.saldo[k],
      cobrosCartera: round2(cobros[k]),
    };
  }
  if (separaTransferencia) {
    const t: CierreMedio = {
      ...medioVacio(),
      ingresos: round2(transf.ingresos),
      egresos: round2(transf.egresos),
      expected: round2(transf.ingresos - transf.egresos),
      cobrosCartera: round2(transf.cobrosCartera),
    };
    const mp = porColumna.MP;
    porColumna.TRANSFERENCIA = t;
    porColumna.MP = {
      ...mp,
      ingresos: round2(mp.ingresos - t.ingresos),
      egresos: round2(mp.egresos - t.egresos),
      expected: round2(mp.expected - t.expected),
      cobrosCartera: round2(mp.cobrosCartera - t.cobrosCartera),
    };
  }

  const ajustes: AjusteCierre[] = [];
  const declaredTotal = zeroAmounts();
  const diffTotal = zeroAmounts();
  let anyDeclared = false;
  let sobra = false;
  let falta = false;

  for (const c of columnas) {
    const col = porColumna[c];
    const declared = declaredOf(input.declared[c]);
    const diff = declared === null ? null : round2(declared - col.expected);
    porColumna[c] = { ...col, declared, diff };
    if (declared === null || diff === null) continue;
    anyDeclared = true;
    const k = metodoDeColumna(c);
    declaredTotal[k] = round2(declaredTotal[k] + declared);
    diffTotal[k] = round2(diffTotal[k] + diff);
    if (diff > 0) sobra = true;
    if (diff < 0) falta = true;
    if (diff !== 0) {
      ajustes.push({
        type: diff > 0 ? "INGRESO" : "EGRESO",
        method: k,
        amount: round2(Math.abs(diff)),
        detail: ajusteDetail(input.day, etiqueta(c), diff),
      });
    }
  }

  // Por medio del libro: lo que se arrastra. Declarado = lo contado en sus columnas (lo no contado
  // de una columna vale su esperado), así `openingAfterCierre` es lo que el libro dice después.
  const porMedio = {} as Record<CashMethod, CierreMedio>;
  for (const k of CASH_METHODS) {
    const suyas = columnas.filter((c) => metodoDeColumna(c) === k);
    const contadas = suyas.filter((c) => porColumna[c].declared !== null);
    const expected = summary.saldo[k];
    const declared = contadas.length === 0 ? null : round2(suyas.reduce((s, c) => s + (porColumna[c].declared ?? porColumna[c].expected), 0));
    porMedio[k] = {
      opening: opening[k],
      ingresos: summary.ingresos[k],
      egresos: summary.egresos[k],
      expected,
      cobrosCartera: round2(cobros[k]),
      declared,
      diff: declared === null ? null : round2(declared - expected),
    };
  }

  const estado: CierreEstado = !anyDeclared
    ? "SIN_DECLARAR"
    : sobra && falta
      ? "MIXTO"
      : sobra
        ? "SOBRANTE"
        : falta
          ? "FALTANTE"
          : "CUADRA";

  return {
    day: input.day,
    since: input.since ?? null,
    porMedio,
    columnas,
    porColumna,
    total: {
      opening: totalOf(opening),
      ingresos: totalOf(summary.ingresos),
      egresos: totalOf(summary.egresos),
      expected: totalOf(summary.saldo),
      declared: totalOf(declaredTotal),
      diff: totalOf(diffTotal),
    },
    movementCount: input.movements.length,
    cobrosCarteraCount: cobrosCount,
    ajustes,
    estado,
  };
}

// Convierte los ajustes de un cierre en movimientos del libro, listos para persistir
// o para alimentar el cierre siguiente. `at` es el instante contable que les pone el
// llamador (el final del día cerrado, en la zona del negocio) para que en el libro
// queden como la ÚLTIMA fila de ese día. Los ids son provisorios: la base asigna los
// definitivos; acá sirven para que el saldo corrido del libro sea estable.
export function ajustesAsMovements(cierre: CierreDiario, at: Date): LibroMovement[] {
  return cierre.ajustes.map((a, i) => ({
    id: `ajuste-${cierre.day}-${i}`,
    occurredAt: at,
    type: a.type,
    method: a.method,
    amount: a.amount,
    detail: a.detail,
  }));
}

// Saldo con el que ARRANCA el día siguiente a este cierre, por medio: lo declarado
// donde se declaró, lo esperado donde no. Es la propiedad que el cierre garantiza:
// después de cerrar, el libro dice lo que se contó. `openingFromHistory` sobre
// (previous + movements + ajustes) tiene que dar exactamente esto — lo prueba el test
// del arrastre entre días.
export function openingAfterCierre(cierre: CierreDiario): MethodAmounts {
  const out = zeroAmounts();
  for (const k of CASH_METHODS) {
    const m = cierre.porMedio[k];
    out[k] = m.declared ?? m.expected;
  }
  return out;
}

// ── Validación ──────────────────────────────────────────────────────────────
//
// Reglas del cierre que no son aritmética: qué día se puede cerrar y qué hay que
// declarar. Devuelve TODOS los errores juntos (la persona corrige de una), en
// castellano y listos para la pantalla. La server action las corre de nuevo contra la
// base (nunca confía en lo que calculó el navegador).

export type CierreValidation = { ok: true } | { ok: false; errors: string[] };

export function validateCierre(
  cierre: CierreDiario,
  ctx: {
    note: string | null | undefined;
    today: DayKey; // hoy en la zona del negocio
    lastClosedDay: DayKey | null;
  },
): CierreValidation {
  const errors: string[] = [];

  if (!isDayKey(cierre.day)) {
    errors.push("La fecha del cierre no es válida (formato AAAA-MM-DD).");
  } else {
    if (compareDayKeys(cierre.day, ctx.today) > 0) {
      errors.push(`No se puede cerrar el ${formatDayLabel(cierre.day)}: todavía no pasó.`);
    }
    if (ctx.lastClosedDay && isFrozenDay(cierre.day, ctx.lastClosedDay)) {
      errors.push(
        `El ${formatDayLabel(cierre.day)} ya está cerrado (último cierre: ${formatDayLabel(ctx.lastClosedDay)}). ` +
          `Un cierre no se rehace: si hay una corrección, va como movimiento con la fecha de hoy.`,
      );
    }
  }

  const efectivo = cierre.porMedio.EFECTIVO.declared;
  if (efectivo === null) {
    errors.push("Falta el efectivo contado. Contá el cajón y poné el total, aunque sea 0.");
  }
  const separa = cierre.columnas.includes("TRANSFERENCIA");
  for (const c of cierre.columnas) {
    const d = cierre.porColumna[c].declared;
    if (d !== null && d < 0) {
      const nombre = separa ? ETIQUETA_DE_COLUMNA[c] : CASH_METHOD_LABEL[metodoDeColumna(c)];
      errors.push(`Lo declarado en ${nombre} no puede ser negativo.`);
    }
  }

  if (cierre.estado !== "SIN_DECLARAR" && cierre.estado !== "CUADRA") {
    const note = String(ctx.note ?? "").trim();
    if (!note) {
      errors.push(NOTA_OBLIGATORIA_CON_DIFERENCIA);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ── Partición del ledger por día ────────────────────────────────────────────
//
// Separa "lo anterior" de "lo del período" a partir de todos los movimientos en
// memoria. La server action NO lo usa (consulta por rango a la base, como el libro); es
// para tests y para quien ya tiene el ledger cargado. `dayOf` traduce el instante al
// día del negocio — inyectado, para que este módulo no sepa de zonas horarias.
export function partitionForCierre(
  all: readonly CierreMovement[],
  opts: { day: DayKey; lastClosedDay: DayKey | null; dayOf: (d: Date) => DayKey },
): { previous: CierreMovement[]; movements: CierreMovement[]; since: DayKey | null } {
  const previous: CierreMovement[] = [];
  const movements: CierreMovement[] = [];
  for (const m of all) {
    const d = opts.dayOf(m.occurredAt);
    if (opts.lastClosedDay && compareDayKeys(d, opts.lastClosedDay) <= 0) previous.push(m);
    else if (compareDayKeys(d, opts.day) <= 0) movements.push(m);
    // Lo posterior a `day` no entra: cerrar el 05 no puede mirar lo cargado el 06.
  }
  return { previous, movements, since: opts.lastClosedDay ? nextDayKey(opts.lastClosedDay) : null };
}

// Día siguiente en el calendario (sin zona: los DayKey ya son días del negocio).
export function nextDayKey(day: DayKey): DayKey {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

// ── Quién cierra y quién reabre (N2 · M1-C5, C7, C8) ────────────────────────
//
// Reglas puras del cierre que no son aritmética. La server action (`cerrarDia`) y la de
// reabrir (`reabrirDiaAction`, cierre-mes/acciones.ts) las corren contra la base adentro de su
// transacción; la pantalla las usa para decir lo mismo antes del viaje.

/**
 * ¿Este rol cierra el día? La dueña / el dueño y, cuando exista el rol (N2 · M6, N2_enums.sql),
 * el encargado. Recepción no: cerrar congela el día y asienta las diferencias. PURA.
 */
export function puedeCerrarElDia(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ENCARGADO";
}

export const CERRAR_DIA_SIN_PERMISO =
  "Cerrar el día lo hace la dueña, el dueño o el encargado: pedile al encargado que lo cierre. Vos podés cerrar tu turno de caja.";

/** El rechazo de cerrar el día con un turno de caja abierto, con quién lo abrió. PURA. */
export function mensajeTurnoAbierto(t: { quien: string; hora: string }): string {
  return (
    `No se puede cerrar el día con un turno de caja abierto: lo abrió ${t.quien} a las ${t.hora}. ` +
    "Primero se cierra ese turno (Caja → Cerrar turno), con su conteo; después, el día."
  );
}

/**
 * Un solo conteo de efectivo (M1-C4): el cierre del día reusa lo contado al cerrar el último turno
 * del período, SÓLO si desde entonces el efectivo no se movió (el libro dice exactamente eso). Si
 * se movió (un retiro, otra venta sin turno), lo contado ya no es lo que hay: se cuenta de nuevo.
 * PURA. `null` = no hay conteo para reusar.
 */
export function conteoDelTurnoParaElCierre(p: {
  turno: { contado: number | null; cerradoEl: Date; quien: string } | null;
  esperadoEfectivo: number;
}): { contado: number; quien: string; cerradoEl: Date; vigente: boolean } | null {
  const t = p.turno;
  if (!t || t.contado === null || !Number.isFinite(t.contado)) return null;
  return { contado: round2(t.contado), quien: t.quien, cerradoEl: t.cerradoEl, vigente: round2(t.contado) === round2(p.esperadoEfectivo) };
}

/** Acción con la que queda la fila de un cierre REABIERTO: la frontera ya no la cuenta (frontera-cierre.ts). */
export const CIERRE_DIARIO_REABIERTO_ACTION = "caja.cierre-diario.reabierto";
/** Acción de la fila de auditoría que deja la reapertura (entity "CierreDiario", entityId el día). */
export const REABRIR_DIA_ACTION = "caja.reabrir-dia";
/** Mínimo de letras del motivo (el mismo que reabrir el mes). */
export const MOTIVO_MINIMO_REABRIR_DIA = 10;

/**
 * ¿Se puede reabrir este día? (M1-C7) PURA. Sólo la dueña o el dueño, con motivo, sólo el ÚLTIMO
 * día cerrado (reabrir uno anterior dejaría cerrados días que arrastran de él), nunca el corte
 * inicial y nunca un día de un mes congelado (el mes cerrado es del contador: primero se reabre
 * el mes, desde Cierre del mes).
 */
export function validarReabrirDia(p: {
  day: DayKey;
  role: string | null | undefined;
  motivo: string | null | undefined;
  /** Último día cerrado (la frontera). */
  ultimoCerrado: DayKey | null;
  /** ¿La frontera sale de un cierre diario de ESE día (y no del corte inicial)? */
  hayCierreDelDia: boolean;
  /** ¿El mes de ese día está congelado (Cierre del mes)? */
  mesCongelado: boolean;
  /**
   * Un mes ANTERIOR congelado que ese cierre cubría (su etiqueta, «septiembre de 2026»), o null. El
   * cierre de un día arrastra desde el día siguiente a la frontera anterior: si ese tramo toca un mes
   * congelado, reabrir el día dejaría días de ese mes aceptando movimientos (M1-C7).
   */
  mesCongeladoQueCubre?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (p.role !== "OWNER") return { ok: false, error: "Sólo la dueña o el dueño puede reabrir un día cerrado." };
  if (!isDayKey(p.day)) return { ok: false, error: "No se entendió qué día reabrir. Volvé a abrir el cierre y elegilo de nuevo." };
  if (!p.ultimoCerrado || compareDayKeys(p.day, p.ultimoCerrado) > 0) {
    return { ok: false, error: `El ${formatDayLabel(p.day)} no está cerrado: no hay nada que reabrir.` };
  }
  if (p.mesCongelado) {
    return {
      ok: false,
      error: `El ${formatDayLabel(p.day)} es de un mes congelado: un mes cerrado no se reabre desde la caja. Si hace falta, primero reabrí el mes en Cierre del mes.`,
    };
  }
  if (p.mesCongeladoQueCubre) {
    return {
      ok: false,
      error: `El cierre del ${formatDayLabel(p.day)} también cubre días de ${p.mesCongeladoQueCubre}, que está congelado: reabrirlo abriría esos días. Si hace falta, primero reabrí ${p.mesCongeladoQueCubre} en Cierre del mes.`,
    };
  }
  if (p.day !== p.ultimoCerrado) {
    return {
      ok: false,
      error: `Sólo se reabre el último día cerrado (${formatDayLabel(p.ultimoCerrado)}): los días de después arrastran de éste.`,
    };
  }
  if (!p.hayCierreDelDia) {
    return { ok: false, error: `El ${formatDayLabel(p.day)} es el corte inicial de la caja: el corte no se reabre.` };
  }
  if (String(p.motivo ?? "").trim().length < MOTIVO_MINIMO_REABRIR_DIA) {
    return { ok: false, error: "Escribí por qué lo reabrís (una frase): queda en la Auditoría con tu nombre." };
  }
  return { ok: true };
}

// ── Causas probables de una diferencia (N2 · M1-C6) ─────────────────────────
//
// Lo que el sistema SABE que suele explicar una diferencia del día, contado desde la base (la
// lectura vive en `getCierreDiarioData`). No es un diagnóstico: es la lista corta de «fijate si
// fue esto» que la pantalla pone al lado de la diferencia (`causasProbables`, revisar-cierre.ts).

export type MontoContado = { cantidad: number; monto: number };

export type HechosDelCierre = {
  /** Pedidos creados en el día que siguen sin cobrar (no anulados). */
  ventasSinCobrar: MontoContado;
  /** Envíos que salieron con el cadete y no se rindieron (monto: lo que falta cobrar de ésos). */
  repartoSinRendir: MontoContado;
  /** Pedidos del período con más asentado que su total (monto: el excedente = vuelto que salió). */
  pagadosDeMas: MontoContado;
  /** Ventas cargadas en el período con fecha de un día anterior (el cuaderno). */
  cuadernoConFechaVieja: MontoContado;
};

/**
 * Pedidos pagados de más, desde los asientos del período: suma lo que entró por cada pedido y lo
 * compara con su total. PURA. Un pedido sin total conocido no cuenta.
 */
export function pagadosDeMasDelPeriodo(
  filas: readonly { orderId: string | null; total: number | null; amount: number; type: string }[],
): MontoContado {
  const porPedido = new Map<string, { asentado: number; total: number }>();
  for (const f of filas) {
    if (!f.orderId || f.type !== "VENTA" || f.total === null || !Number.isFinite(f.amount)) continue;
    const p = porPedido.get(f.orderId) ?? { asentado: 0, total: f.total };
    p.asentado = round2(p.asentado + f.amount);
    porPedido.set(f.orderId, p);
  }
  const out: MontoContado = { cantidad: 0, monto: 0 };
  for (const p of porPedido.values()) {
    const excedente = round2(p.asentado - p.total);
    if (excedente > 0) {
      out.cantidad += 1;
      out.monto = round2(out.monto + excedente);
    }
  }
  return out;
}
