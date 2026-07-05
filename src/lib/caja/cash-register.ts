// Aritmética PURA de la caja del POS (arqueo de turno de mostrador).
//
// Vive fuera de las server actions a propósito (mismo criterio que order-core.ts):
// acá está SOLO el cálculo — sin Prisma, sin sesión, sin tenant —, así el arqueo
// es unit-testeable de punta a punta (ver cash-register.test.ts). La persistencia
// (abrir/registrar/cerrar contra la DB) vive en src/lib/caja-actions.ts y usa
// estas funciones para calcular; nunca duplica la aritmética.
//
// Convención de signos: los montos de los movimientos SIEMPRE son positivos; el
// signo (suma o resta al efectivo esperado) lo decide el TIPO acá, en un solo
// lugar. Así el registro guardado es auditable y no ambiguo (ADR-006: el cálculo
// vive en el Core, los montos se guardan tal cual se declararon).

export type CashMovementType = "APERTURA" | "VENTA" | "INGRESO" | "EGRESO" | "RETIRO";

// Movimiento visto por la aritmética: solo tipo + monto (>0). La APERTURA no entra
// como movimiento en el cálculo del esperado —ese fondo lo aporta `openingFloat`—;
// si además se materializa como fila APERTURA en el ledger (para tener el turno
// completo), esta función la ignora para no contarla dos veces.
export type CashMovementLike = { type: CashMovementType; amount: number };

// Redondeo a 2 decimales (pesos). Se aplica en cada agregación para que el arqueo
// no arrastre el error de coma flotante de sumar muchos importes.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Efecto de un movimiento sobre el efectivo esperado en el cajón:
//   +1 → entra plata (VENTA en efectivo, INGRESO)
//   -1 → sale plata (EGRESO, RETIRO)
//    0 → no mueve el esperado por sí mismo (APERTURA: la aporta openingFloat)
// Un tipo desconocido no afecta el esperado (fail-safe: nunca inventa dinero).
export function movementSign(type: CashMovementType): -1 | 0 | 1 {
  switch (type) {
    case "VENTA":
    case "INGRESO":
      return 1;
    case "EGRESO":
    case "RETIRO":
      return -1;
    case "APERTURA":
      return 0;
    default:
      return 0;
  }
}

// Solo los montos POSITIVOS y finitos cuentan. Un monto <= 0 o no numérico se
// descarta (la validación de entrada vive en la server action; acá blindamos el
// cálculo para que un dato basura nunca corrompa el arqueo).
function usable(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

// Desglose del efectivo del turno por categoría (todos >= 0, ya redondeados).
export type CashBreakdown = {
  sales: number; // ingresos por VENTA en efectivo
  cashIn: number; // otros INGRESO
  cashOut: number; // EGRESO
  withdrawals: number; // RETIRO
};

export function summarizeMovements(movements: readonly CashMovementLike[]): CashBreakdown {
  let sales = 0;
  let cashIn = 0;
  let cashOut = 0;
  let withdrawals = 0;
  for (const m of movements) {
    if (!usable(m.amount)) continue;
    switch (m.type) {
      case "VENTA":
        sales += m.amount;
        break;
      case "INGRESO":
        cashIn += m.amount;
        break;
      case "EGRESO":
        cashOut += m.amount;
        break;
      case "RETIRO":
        withdrawals += m.amount;
        break;
      // APERTURA no suma acá (la aporta openingFloat).
    }
  }
  return {
    sales: round2(sales),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    withdrawals: round2(withdrawals),
  };
}

// Efectivo ESPERADO en el cajón al cierre = fondo inicial declarado
//   + ventas en efectivo + otros ingresos − egresos − retiros.
// Es el número contra el que se compara lo contado en el arqueo.
export function expectedCash(
  openingFloat: number,
  movements: readonly CashMovementLike[],
): number {
  const { sales, cashIn, cashOut, withdrawals } = summarizeMovements(movements);
  const opening = usable(openingFloat) ? openingFloat : 0;
  return round2(opening + sales + cashIn - cashOut - withdrawals);
}

// Resultado del arqueo al cerrar el turno.
export type CashReconciliation = {
  expected: number; // efectivo que debería haber (expectedCash)
  counted: number; // efectivo realmente contado en el cajón
  diff: number; // counted − expected: >0 sobrante, <0 faltante, 0 cuadra
  breakdown: CashBreakdown;
};

// Arqueo de cierre: dado el fondo inicial, los movimientos del turno y el efectivo
// contado, devuelve esperado / contado / diferencia (+ desglose). La diferencia es
// `counted − expected` para que el SIGNO sea intuitivo: negativo = falta plata,
// positivo = sobra. Todo redondeado a 2 decimales.
export function reconcileCash(
  openingFloat: number,
  movements: readonly CashMovementLike[],
  counted: number,
): CashReconciliation {
  const expected = expectedCash(openingFloat, movements);
  const countedSafe = Number.isFinite(counted) ? counted : 0;
  return {
    expected,
    counted: round2(countedSafe),
    diff: round2(countedSafe - expected),
    breakdown: summarizeMovements(movements),
  };
}
