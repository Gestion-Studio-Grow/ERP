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
// cualquier acción que escriba en el libro (alta, borrado, cobro de cartera).
//
// Corolario: los días sin cierre propio (un domingo, un sábado que se pasó por alto)
// quedan absorbidos por el cierre siguiente. Eso es correcto: "cerrar el 08/09" es
// arquear desde el último cierre, no solo las 24 horas del 08.

export function isFrozenDay(day: DayKey, lastClosedDay: DayKey | null): boolean {
  if (!lastClosedDay) return false;
  return compareDayKeys(day, lastClosedDay) <= 0;
}

export function frozenDayMessage(day: DayKey, lastClosedDay: DayKey): string {
  return (
    `El ${formatDayLabel(day)} ya está cerrado (último cierre: ${formatDayLabel(lastClosedDay)}). ` +
    `No se puede cargar ni borrar nada con esa fecha. Si falta un movimiento, cargalo con la fecha de hoy ` +
    `y aclarás en el detalle a qué día corresponde.`
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
    default:
      return null;
  }
}

// ── Tipos del cierre ────────────────────────────────────────────────────────

// Movimiento visto por el cierre: el del libro + el rastro opcional al cobro de
// cartera que lo originó. Ese rastro es lo que evita el doble conteo (ver el diseño):
// si un ingreso vino de cuentas a cobrar, el cierre lo cuenta UNA vez como ingreso del
// libro y lo REPORTA aparte como "cobro de cartera" — nunca lo suma dos veces.
export type CierreMovement = LibroMovement & { collectionId?: string | null };

// Lo que la persona DECLARA que hay al cierre, por medio. `null` = ese medio no se
// concilia hoy (la tarjeta se liquida a T+N y el negocio no la cuenta por día). El
// EFECTIVO no puede quedar en null: contar el cajón es el acto mínimo del cierre.
export type DeclaredAmounts = Record<CashMethod, number | null>;

export type CierreMedio = {
  opening: number; // saldo al arrancar el período (lo que quedó del cierre anterior)
  ingresos: number;
  egresos: number;
  expected: number; // opening + ingresos − egresos: lo que el libro dice que hay
  cobrosCartera: number; // parte de `ingresos` que vino de cuentas a cobrar (informativo)
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
  porMedio: Record<CashMethod, CierreMedio>;
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

function ajusteDetail(day: DayKey, method: CashMethod, diff: number): string {
  const que = diff > 0 ? "sobrante" : "faltante";
  return `Diferencia de caja ${formatDayLabel(day)}: ${que} en ${CASH_METHOD_LABEL[method]}`;
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
export function buildCierreDiario(input: {
  day: DayKey;
  since?: DayKey | null;
  previous: readonly LibroMovement[];
  movements: readonly CierreMovement[];
  declared: DeclaredAmounts;
}): CierreDiario {
  const opening = openingFromHistory(input.previous);
  const { summary } = buildLibro(opening, input.movements);

  // Cobros que vinieron de cuentas a cobrar: ya están dentro de `ingresos` (son filas
  // del libro). Se suman aparte SOLO para mostrarlos; no vuelven a entrar al esperado.
  const cobros = zeroAmounts();
  let cobrosCount = 0;
  for (const m of input.movements) {
    if (!m.collectionId) continue;
    if (movementSign(m.type) <= 0) continue; // un cobro de cartera solo puede ser ingreso
    if (!Number.isFinite(m.amount) || m.amount <= 0) continue;
    cobros[m.method] += m.amount;
    cobrosCount += 1;
  }

  const porMedio = {} as Record<CashMethod, CierreMedio>;
  const ajustes: AjusteCierre[] = [];
  const declaredTotal = zeroAmounts();
  const diffTotal = zeroAmounts();
  let anyDeclared = false;
  let sobra = false;
  let falta = false;

  for (const k of CASH_METHODS) {
    const expected = summary.saldo[k];
    const declared = declaredOf(input.declared[k]);
    const diff = declared === null ? null : round2(declared - expected);
    porMedio[k] = {
      opening: opening[k],
      ingresos: summary.ingresos[k],
      egresos: summary.egresos[k],
      expected,
      cobrosCartera: round2(cobros[k]),
      declared,
      diff,
    };
    if (declared === null || diff === null) continue;
    anyDeclared = true;
    declaredTotal[k] = declared;
    diffTotal[k] = diff;
    if (diff > 0) sobra = true;
    if (diff < 0) falta = true;
    if (diff !== 0) {
      ajustes.push({
        type: diff > 0 ? "INGRESO" : "EGRESO",
        method: k,
        amount: round2(Math.abs(diff)),
        detail: ajusteDetail(input.day, k, diff),
      });
    }
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
  for (const k of CASH_METHODS) {
    const d = cierre.porMedio[k].declared;
    if (d !== null && d < 0) {
      errors.push(`Lo declarado en ${CASH_METHOD_LABEL[k]} no puede ser negativo.`);
    }
  }

  if (cierre.estado !== "SIN_DECLARAR" && cierre.estado !== "CUADRA") {
    const note = String(ctx.note ?? "").trim();
    if (!note) {
      errors.push(
        "Hay diferencia entre lo que dice el libro y lo que contaste. Anotá por qué (o " +
          "“sin explicación por ahora”): la diferencia se asienta igual, pero tiene que quedar dicho.",
      );
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
