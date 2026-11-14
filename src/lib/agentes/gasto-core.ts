// ============================================================================
// EQUIPO DE AGENTES · cuentas del gasto (03 §11). PURO, en micro-dólares ENTEROS (nunca Float).
// ============================================================================
// Los PRECIOS por modelo los carga el brief 1C desde la página oficial, citados con fecha. Hasta
// entonces la tabla está vacía y un modelo sin precio no se puede usar: `precioDe` tira, y sin
// precio no hay reserva ni llamada (provisional a confirmar, 05 S8).

/** Precio por millón de tokens, en micro-dólares (US$ 1 = 1.000.000). */
export interface Precio {
  entradaPorMillon: number;
  salidaPorMillon: number;
}

/** Tabla de precios: la llena 1C (gasto-core, «precios»), con fuente y fecha. */
export const PRECIOS: Readonly<Record<string, Precio>> = {};

/** Tope del mes por negocio si AgenteAjuste no dice otro (US$ 20 hablado, 05 S21; provisional). */
export const TOPE_MES_MICRO_USD_DEFECTO = 20_000_000;

/** Vencimiento de cada reserva (05 S17, provisional). */
export const VENCE_RESERVA_MS = 120_000;

/** Caracteres por token para estimar la entrada (conservador: estima de más, 05 S17). */
export const CARACTERES_POR_TOKEN = 3;

export function precioDe(modelo: string, precios: Readonly<Record<string, Precio>> = PRECIOS): Precio {
  const p = precios[modelo];
  if (!p) throw new Error(`Sin precio cargado para el modelo ${modelo}: no se puede reservar gasto.`);
  return p;
}

/** Costo en micro-dólares, redondeado para arriba (nunca se subestima). */
export function costoMicroUsd(uso: { entrada: number; salida: number }, precio: Precio): number {
  const entrada = Math.max(0, Math.trunc(uso.entrada));
  const salida = Math.max(0, Math.trunc(uso.salida));
  return Math.ceil((entrada * precio.entradaPorMillon + salida * precio.salidaPorMillon) / 1_000_000);
}

export function estimarTokensDeEntrada(caracteres: number): number {
  return Math.ceil(Math.max(0, caracteres) / CARACTERES_POR_TOKEN);
}

/** Estimado ANTES de la llamada: entrada por caracteres y la salida al máximo pedido. */
export function estimadoMicroUsd(p: { caracteresDeEntrada: number; maxTokens: number }, precio: Precio): number {
  return costoMicroUsd({ entrada: estimarTokensDeEntrada(p.caracteresDeEntrada), salida: p.maxTokens }, precio);
}

/** Lo que queda del mes: tope menos comprometido (gastado más reservas abiertas). Nunca negativo. */
export function saldoMicroUsd(tope: number, comprometido: number): number {
  return Math.max(0, tope - comprometido);
}

/** El período del gasto, `AAAA-MM` en hora de Argentina. */
export function periodoDelGasto(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
}

/** Micro-dólares a texto para una persona: "US$ 1,23". */
export function textoMicroUsd(microUsd: number): string {
  return `US$ ${(microUsd / 1_000_000).toFixed(2).replace(".", ",")}`;
}
