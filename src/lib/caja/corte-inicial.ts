// Aritmética PURA del CORTE INICIAL de caja.
//
// El corte inicial es el momento en que la caja de un negocio deja de vivir en una
// planilla y empieza a vivir en el sistema ARRANCANDO DE LA REALIDAD: se cuenta la plata
// que hay de verdad, por medio, en una fecha, y desde ahí el libro dice eso — no lo que
// la planilla venía arrastrando.
//
// Por qué existe (auditoría de la planilla de CH Estética): ningún saldo estuvo nunca
// atado a un conteo físico; el faltante de $154.500 de marzo quedó al margen y abril
// abrió como si la plata estuviera; el saldo de MP se fue negativo; julio no encadena y
// hay 18 días sin datos. Decisión del dueño: el histórico se carga como REGISTRO (ver
// import-caja.ts) pero el saldo operativo NO se deriva de él — nace de un arqueo.
//
// EL MECANISMO, EN UNA FRASE: el corte inicial ES el primer cierre diario del tenant.
// No hay un segundo mecanismo. `buildCierreDiario` (cierre-diario.ts) ya hace lo que el
// corte necesita: toma todo lo anterior, compara lo que el libro dice contra lo que se
// declara, y EMITE la diferencia como movimientos INGRESO/EGRESO del libro (signo de
// `movementSign`, la única tabla de signos del sistema). Con `lastClosedDay = null`, el
// "período" del cierre es TODO el histórico, y su propiedad central —
// `openingFromHistory(todo ≤ día + ajustes) === lo declarado` — es exactamente "desde
// la fecha de corte el saldo del libro es el declarado".
//
// Lo que este módulo AGREGA sobre el cierre diario (y nada más):
//   1. Validación más estricta: en el corte se declaran LOS TRES medios (tarjeta en 0
//      incluida), porque "no declarado" en el cierre significa "arrastra lo que decía el
//      libro", y acá NADA operativo puede venir de la planilla. Nota obligatoria siempre.
//      No puede existir un cierre anterior (si existe, es un cierre común, no un corte).
//   2. Un rótulo propio en el ajuste, con los números a la vista: "el histórico decía X,
//      se contaron Y". Para CH esa diferencia va a ser grande y es información, no
//      vergüenza: es la medida de cuánto se había desviado la planilla.
//   3. La regla para movimientos RETROACTIVOS (fechados antes del corte): todo hecho
//      anterior al corte YA está incluido en el conteo físico (la plata ya entró o ya
//      salió cuando se contó). Cargarlo suelto lo cuenta dos veces y mueve el saldo
//      operativo. Por eso el corte congela (`isFrozenDay`) y, si el histórico se completa
//      después, cada fila retroactiva entra en PAR con un contra-asiento en el día del
//      corte (`contraAsientoRetroactivo`) que reclasifica esa parte del desvío de
//      "sin explicar" a "explicado por X". El saldo operativo no se mueve; el mes
//      histórico sí muestra el hecho. `verificarInvarianteCorte` detecta la violación.
//
// Sin Prisma, sin sesión, sin tenant. La persistencia (escribir los ajustes, registrar
// el corte, congelar) vive en scripts/corte-inicial.ts hoy y en la acción del cierre
// diario cuando exista `CashDayClose` (ver docs/producto/corte-inicial-caja.md).

import { round2 } from "@/lib/round";
import { movementSign, type CashMethod, type CashMovementType } from "@/lib/caja/cash-register";
import {
  CASH_METHODS,
  CASH_METHOD_LABEL,
  openingFromHistory,
  totalOf,
  zeroAmounts,
  type LibroMovement,
  type MethodAmounts,
} from "@/lib/caja/libro-caja";
import {
  buildCierreDiario,
  ajustesAsMovements,
  openingAfterCierre,
  validateCierre,
  partitionForCierre,
  compareDayKeys,
  formatDayLabel,
  isDayKey,
  type AjusteCierre,
  type CierreDiario,
  type CierreMovement,
  type DayKey,
} from "@/lib/caja/cierre-diario";
import { centsOf, fmtCents } from "@/lib/caja/import-caja";

// ── Convenciones de reconocimiento ──────────────────────────────────────────
//
// Sin tocar el schema, un ajuste del corte se reconoce por dos cosas: el `reason`
// arranca con este prefijo (lo lee la persona en el libro) y el `createdBy` lleva la
// marca (lo lee el script para verificar / deshacer, igual que `importMarker` en
// import-caja.ts). Cuando exista `CashDayClose`, además llevan `dayCloseId`.

export const CORTE_INICIAL_PREFIX = "Corte inicial";
export const CORTE_INICIAL_ACTOR_PREFIX = "corte-inicial:";

export function corteMarker(day: DayKey): string {
  return `${CORTE_INICIAL_ACTOR_PREFIX}${day}`;
}

export function esAjusteDeCorte(m: { detail: string }): boolean {
  return m.detail.startsWith(CORTE_INICIAL_PREFIX);
}

// ── Tipos ───────────────────────────────────────────────────────────────────

// Lo que se CONTÓ, por medio. A diferencia de `DeclaredAmounts` del cierre, acá no hay
// `null`: los tres medios son obligatorios (tarjeta incluida, aunque sea 0). Un NaN se
// trata como "no declarado" y la validación lo rechaza.
export type ArqueoInicial = Record<CashMethod, number>;

// Movimiento visto por el corte: el del libro + `createdAt` opcional (cuándo se tipeó),
// que es lo único que permite señalar un retroactivo cargado DESPUÉS del corte.
export type CorteMovement = CierreMovement & { createdAt?: Date | null };

export type CorteInicial = {
  day: DayKey;
  // El cierre diario subyacente (since = null: abarca desde el origen). Se expone para
  // que la persistencia use exactamente las mismas piezas que el cierre común.
  cierre: CierreDiario;
  historico: MethodAmounts; // lo que el histórico cargado decía que había (esperado)
  declarado: MethodAmounts; // lo que se contó
  desvio: MethodAmounts; // declarado − historico: >0 había más plata que la anotada, <0 menos
  // Los ajustes que asientan el desvío, uno por medio con diferencia, con el rótulo del
  // corte. Mismo tipo/signo/monto que `cierre.ajustes`; sólo cambia el detalle.
  ajustes: AjusteCierre[];
  historicoCount: number; // movimientos del histórico absorbidos por el corte
  // Movimientos fechados DESPUÉS del día de corte que ya estaban cargados. No entran
  // al cálculo (son operativos) pero se informan: lo normal es cortar ANTES de cargar
  // lo operativo, y si hay filas posteriores conviene mirarlas antes de escribir.
  posterioresAlCorte: number;
};

// ── Construcción ────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return fmtCents(centsOf(n));
}

// "Corte inicial 31/08/2026 — Efectivo: el histórico decía $652.534,00, se contaron
// $498.034,00 (faltante $154.500,00)". Los tres números van en la fila a propósito: el
// ajuste tiene que poder leerse solo, sin abrir la planilla ni el AuditLog.
function detalleAjusteCorte(day: DayKey, method: CashMethod, historico: number, declarado: number): string {
  const diff = round2(declarado - historico);
  const que = diff > 0 ? "sobrante" : "faltante";
  return (
    `${CORTE_INICIAL_PREFIX} ${formatDayLabel(day)} — ${CASH_METHOD_LABEL[method]}: ` +
    `el histórico decía ${fmt(historico)}, se contaron ${fmt(declarado)} (${que} ${fmt(Math.abs(diff))})`
  );
}

// Arma el corte inicial.
//
//   day    → fecha de corte: el último día que pertenece al histórico. El arqueo se hace
//            al final de ese día; el día siguiente es el primero operativo.
//   all    → TODO el ledger del tenant en memoria (histórico importado + lo que haya).
//            Lo posterior a `day` se descarta del cálculo y se cuenta en
//            `posterioresAlCorte`.
//   arqueo → lo contado, por medio.
//   dayOf  → instante → día del negocio (inyectado, como en el cierre: acá no se sabe
//            de zonas horarias).
//
// Es `buildCierreDiario` con `lastClosedDay = null`: previous vacío, período = todo el
// histórico. El esperado del cierre ES el saldo que el histórico decía.
export function buildCorteInicial(input: {
  day: DayKey;
  all: readonly CorteMovement[];
  arqueo: ArqueoInicial;
  dayOf: (d: Date) => DayKey;
}): CorteInicial {
  const { previous, movements } = partitionForCierre(input.all, {
    day: input.day,
    lastClosedDay: null,
    dayOf: input.dayOf,
  });
  const posterioresAlCorte = input.all.length - previous.length - movements.length;

  const cierre = buildCierreDiario({
    day: input.day,
    since: null,
    previous,
    movements,
    declared: { ...input.arqueo },
  });

  const historico = zeroAmounts();
  const declarado = zeroAmounts();
  const desvio = zeroAmounts();
  for (const k of CASH_METHODS) {
    const m = cierre.porMedio[k];
    historico[k] = m.expected;
    // Sin declarar (NaN en la entrada) → se arrastra el esperado, igual que el cierre.
    // La validación lo rechaza; acá sólo se evita inventar un número.
    declarado[k] = m.declared ?? m.expected;
    desvio[k] = round2(declarado[k] - historico[k]);
  }

  // Mismo ajuste que emitió el cierre (tipo, medio, monto, signo), con el rótulo del
  // corte. No se recalcula nada: se re-etiqueta.
  const ajustes: AjusteCierre[] = cierre.ajustes.map((a) => ({
    ...a,
    detail: detalleAjusteCorte(input.day, a.method, historico[a.method], declarado[a.method]),
  }));

  return {
    day: input.day,
    cierre,
    historico,
    declarado,
    desvio,
    ajustes,
    historicoCount: movements.length,
    posterioresAlCorte,
  };
}

// Los ajustes del corte como filas del libro, listas para persistir. `at` es el
// instante contable que les pone el llamador: el FINAL del día de corte en la zona del
// negocio, para que sean la última fila del histórico y la primera cosa que el día
// siguiente arrastra. Ids determinísticos (`corte-<día>-<n>`): además de dar un saldo
// corrido estable, sirven de guarda a nivel PK contra una doble corrida del script.
export function corteAsMovements(corte: CorteInicial, at: Date): LibroMovement[] {
  return ajustesAsMovements({ ...corte.cierre, ajustes: corte.ajustes }, at).map((m, i) => ({
    ...m,
    id: `corte-${corte.day}-${i}`,
  }));
}

// Saldo con el que arranca el primer día operativo, por medio. Es LO DECLARADO, siempre:
// en el corte no hay medios sin declarar (la validación lo garantiza), así que
// `openingAfterCierre` devuelve el arqueo tal cual. Se expone con nombre propio porque
// es la promesa del corte: "desde acá, el libro dice lo que se contó".
export function saldoOperativoInicial(corte: CorteInicial): MethodAmounts {
  return openingAfterCierre(corte.cierre);
}

// ── Validación ──────────────────────────────────────────────────────────────
//
// Reusa `validateCierre` (fecha válida, no futura, efectivo declarado, sin negativos) y
// suma las reglas propias del corte. Devuelve todos los errores juntos.

export type CorteValidation = { ok: true } | { ok: false; errors: string[] };

export function validateCorteInicial(
  corte: CorteInicial,
  ctx: {
    nota: string | null | undefined;
    today: DayKey; // hoy en la zona del negocio
    lastClosedDay: DayKey | null; // último cierre registrado del tenant (debe ser null)
  },
): CorteValidation {
  const errors: string[] = [];

  // El corte es el PRIMER cierre. Si ya hay uno, lo que corresponde es el cierre diario
  // común (o, si el corte salió mal, deshacerlo — ver el doc), nunca un segundo corte.
  if (ctx.lastClosedDay !== null) {
    errors.push(
      `Ya hay un cierre registrado (${formatDayLabel(ctx.lastClosedDay)}). El corte inicial es el PRIMER cierre ` +
        `de la caja: si hay que corregir, va como cierre diario o como movimiento con la fecha de hoy; ` +
        `si el corte salió mal, hay que deshacerlo antes de rehacerlo.`,
    );
  }

  // Las reglas del cierre común valen todas (fecha válida, no futura, efectivo declarado,
  // sin negativos). Se le pasa lastClosedDay = null para no duplicar el error de arriba, y
  // una nota fija para que no pida la suya: la nota la exige el corte SIEMPRE (abajo), con
  // su propio texto, y no sólo cuando hay diferencia.
  const base = validateCierre(corte.cierre, { note: "corte inicial", today: ctx.today, lastClosedDay: null });
  if (!base.ok) errors.push(...base.errors);

  // Los tres medios, sin excepción. `validateCierre` sólo exige el efectivo.
  for (const k of CASH_METHODS) {
    if (k === "EFECTIVO") continue; // ya lo pidió el cierre
    if (corte.cierre.porMedio[k].declared === null) {
      errors.push(
        `Falta declarar ${CASH_METHOD_LABEL[k]}. En el corte inicial se declaran los tres medios, ` +
          `aunque el saldo sea 0: nada operativo puede arrancar de lo que decía la planilla.`,
      );
    }
  }

  // Nota siempre: el corte es un acto único y tiene que quedar dicho cómo se contó
  // (cajón, extracto de MP a qué hora, etc.), haya o no diferencia.
  if (!String(ctx.nota ?? "").trim()) {
    errors.push(
      "Falta la nota del corte: cómo se contó el efectivo y de dónde salió el saldo de MP " +
        "(por ejemplo, “dinero disponible en la app de MP a las 20:15”). Se guarda con el corte.",
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ── Clasificación de filas: histórico / corte / operativo ───────────────────
//
// Para que la pantalla pueda mostrar el histórico consultable pero CLARAMENTE separado
// de lo operativo. Un solo criterio, por fecha contable:
//   · antes del día de corte, o ese mismo día sin ser un ajuste del corte → HISTORICO
//     (registro: lo que la planilla decía; su saldo no es el saldo del negocio)
//   · ajuste del corte (día de corte + prefijo)                           → CORTE
//   · después del día de corte                                            → OPERATIVO

export type TramoCaja = "HISTORICO" | "CORTE" | "OPERATIVO";

export function tramoDe(m: LibroMovement, corteDay: DayKey, dayOf: (d: Date) => DayKey): TramoCaja {
  const d = dayOf(m.occurredAt);
  const cmp = compareDayKeys(d, corteDay);
  if (cmp > 0) return "OPERATIVO";
  if (cmp === 0 && esAjusteDeCorte(m)) return "CORTE";
  return "HISTORICO";
}

// ── Invariante del corte y movimientos retroactivos ─────────────────────────
//
// INVARIANTE: openingFromHistory(todo lo fechado ≤ día de corte) === declarado.
// Es lo que hace verdadero "el saldo operativo es el que se contó". Un movimiento
// fechado ≤ corte que entre suelto después del corte la rompe (mueve el saldo operativo
// en `movementSign(type) * amount`). La defensa primaria es el congelamiento en las
// acciones (`isFrozenDay`); esta función es la defensa detectiva: se corre después de
// escribir el corte, y en cualquier auditoría.

export type InvarianteCorte = {
  ok: boolean;
  esperado: MethodAmounts; // lo declarado en el corte
  actual: MethodAmounts; // openingFromHistory(≤ día de corte) hoy
  desvio: MethodAmounts; // actual − esperado; todo 0 si ok
  // Fichas fechadas ≤ corte pero TIPEADAS después de ejecutarlo (requiere `createdAt`
  // en las filas y `executedAt`). Vacío si no hay con qué comparar.
  sospechosos: CorteMovement[];
};

export function verificarInvarianteCorte(
  all: readonly CorteMovement[],
  corte: CorteInicial,
  opts: { dayOf: (d: Date) => DayKey; executedAt?: Date | null },
): InvarianteCorte {
  const hastaCorte = all.filter((m) => compareDayKeys(opts.dayOf(m.occurredAt), corte.day) <= 0);
  const actual = openingFromHistory(hastaCorte);
  const esperado = saldoOperativoInicial(corte);
  const desvio = zeroAmounts();
  let ok = true;
  for (const k of CASH_METHODS) {
    desvio[k] = round2(actual[k] - esperado[k]);
    if (desvio[k] !== 0) ok = false;
  }
  const executedAt = opts.executedAt ?? null;
  const sospechosos = executedAt
    ? hastaCorte.filter((m) => m.createdAt && m.createdAt.getTime() > executedAt.getTime())
    : [];
  return { ok, esperado, actual, desvio, sospechosos };
}

// Tipo que anula el efecto de `type` sobre el saldo. VENTA y RETIRO también se cubren
// (un retroactivo puede venir de cualquier tipo); APERTURA no mueve el saldo y no tiene
// contra-asiento (null).
function tipoContrario(type: CashMovementType): "INGRESO" | "EGRESO" | null {
  const sign = movementSign(type);
  if (sign > 0) return "EGRESO";
  if (sign < 0) return "INGRESO";
  return null;
}

// Contra-asiento de un movimiento RETROACTIVO al corte.
//
// Caso real que lo motiva: julio 2026 de CH no encadena porque faltan ~$1,8M de egresos
// (comisiones y alquiler). Si se cargan después del corte, el histórico de julio queda
// completo — pero la plata YA no estaba cuando se contó, así que el desvío del corte
// ya la incluía. Este contra-asiento, fechado en el día de corte, deja el saldo
// operativo exactamente donde estaba y RECLASIFICA esa parte del desvío: de "sin
// explicar" pasa a "explicado por los egresos de julio". Los dos movimientos (el
// retroactivo y su contra-asiento) se escriben JUNTOS, en la misma transacción, o no
// se escribe ninguno. Devuelve null si el movimiento no mueve el saldo (APERTURA).
export function contraAsientoRetroactivo(
  retro: LibroMovement,
  corte: CorteInicial,
  opts: { at: Date; dayOf: (d: Date) => DayKey },
): LibroMovement | null {
  const type = tipoContrario(retro.type);
  if (type === null) return null;
  if (!Number.isFinite(retro.amount) || retro.amount <= 0) return null;
  const diaRetro = opts.dayOf(retro.occurredAt);
  return {
    id: `corte-${corte.day}-reclas-${retro.id}`,
    occurredAt: opts.at,
    type,
    method: retro.method,
    amount: round2(retro.amount),
    detail:
      `${CORTE_INICIAL_PREFIX} ${formatDayLabel(corte.day)} — reclasificación del desvío en ` +
      `${CASH_METHOD_LABEL[retro.method]} por movimiento retroactivo del ${formatDayLabel(diaRetro)}: ` +
      `${retro.detail} (${fmt(retro.amount)})`,
  };
}

// ── Resumen para pantalla / consola ─────────────────────────────────────────

export type ResumenCorte = {
  day: DayKey;
  dayLabel: string;
  historicoCount: number;
  posterioresAlCorte: number;
  porMedio: { method: CashMethod; label: string; historico: number; declarado: number; desvio: number }[];
  total: { historico: number; declarado: number; desvio: number };
  ajustes: AjusteCierre[];
};

export function resumenCorte(corte: CorteInicial): ResumenCorte {
  return {
    day: corte.day,
    dayLabel: isDayKey(corte.day) ? formatDayLabel(corte.day) : corte.day,
    historicoCount: corte.historicoCount,
    posterioresAlCorte: corte.posterioresAlCorte,
    porMedio: CASH_METHODS.map((k) => ({
      method: k,
      label: CASH_METHOD_LABEL[k],
      historico: corte.historico[k],
      declarado: corte.declarado[k],
      desvio: corte.desvio[k],
    })),
    total: {
      historico: totalOf(corte.historico),
      declarado: totalOf(corte.declarado),
      desvio: totalOf(corte.desvio),
    },
    ajustes: corte.ajustes,
  };
}
