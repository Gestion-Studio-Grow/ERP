// ============================================================================
// Tope mensual de gasto de IA paga por negocio (Etapa 2 de MIA · T4) — lo PURO: precios, estimación,
// mes de Buenos Aires, decisión y textos. Montos en MICRO-DÓLARES (BigInt): 1 US$ = 1.000.000.
// La base y el candado viven en ia-tope.server.ts.
// ============================================================================

export const MICRO_POR_USD = BigInt(1_000_000);
const TOKENS_POR_MTOK = BigInt(1_000_000);

/**
 * Precio por millón de tokens, en micro-dólares. PROVISIONAL A CONFIRMAR con la lista vigente de
 * Anthropic antes de cobrar nada en serio: hoy se usa sólo para no pasarse del tope (que también decide
 * el dueño). Un modelo que no está acá NO se llama (`precioDe` → null → se niega).
 */
export const PRECIOS_MICRO_USD_POR_MTOK: Readonly<Record<string, { entrada: bigint; salida: bigint }>> = {
  "claude-opus-5-5": { entrada: BigInt(5_000_000), salida: BigInt(25_000_000) },
};

export const precioDe = (modelo: string): { entrada: bigint; salida: bigint } | null => PRECIOS_MICRO_USD_POR_MTOK[modelo] ?? null;

/**
 * Margen por el envoltorio que la API suma al pedido (formato de mensajes, esquema de salida).
 * Provisional, a favor de reservar de más.
 */
export const MARGEN_TOKENS_ENTRADA = 2000;

/**
 * Cota SUPERIOR de los tokens de entrada: un token nunca ocupa menos de un byte de UTF-8, así que los
 * bytes del pedido no se quedan cortos. Reserva de más; la liquidación devuelve la diferencia.
 */
export function tokensEntradaMaximos(pedido: { sistema: string; mensajes: readonly { content: string }[]; esquema?: unknown }): number {
  const enc = new TextEncoder();
  let bytes = enc.encode(pedido.sistema).length;
  for (const m of pedido.mensajes) bytes += enc.encode(m.content).length;
  if (pedido.esquema !== undefined) bytes += enc.encode(JSON.stringify(pedido.esquema)).length;
  return bytes + MARGEN_TOKENS_ENTRADA;
}

const enteroNoNegativo = (n: unknown): bigint => (typeof n === "number" && Number.isFinite(n) && n > 0 ? BigInt(Math.ceil(n)) : BigInt(0));

/** Costo en micro-dólares, redondeado hacia arriba. null si el modelo no tiene precio. */
export function costoMicroUsd(modelo: string, tokensEntrada: number, tokensSalida: number): bigint | null {
  const p = precioDe(modelo);
  if (!p) return null;
  const total = enteroNoNegativo(tokensEntrada) * p.entrada + enteroNoNegativo(tokensSalida) * p.salida;
  return (total + TOKENS_POR_MTOK - BigInt(1)) / TOKENS_POR_MTOK;
}

/** Lo que devuelve la API en `usage` (sólo lo que se cobra). Caché incluida, a precio de entrada (cota alta). */
export interface UsoIA {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Lo que se gasta al liquidar:
 * - con `usage` legible → el costo real (modelo de la respuesta si tiene precio; si no, el pedido);
 * - sin `usage` pero con la llamada que pudo haberse cobrado (2xx, o se cortó sin saber) → el estimado;
 * - la API dijo que no (4xx/5xx) → 0 (los errores no se cobran).
 */
export function gastoALiquidar(x: {
  estimado: bigint;
  modeloPedido: string;
  resultado: { tipo: "respuesta"; uso: UsoIA | null; modelo?: unknown } | { tipo: "incierto" } | { tipo: "rechazada" };
}): bigint {
  if (x.resultado.tipo === "rechazada") return BigInt(0);
  if (x.resultado.tipo === "incierto" || !x.resultado.uso) return x.estimado;
  const u = x.resultado.uso;
  const entrada = num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
  const salida = num(u.output_tokens);
  const modelo = typeof x.resultado.modelo === "string" && precioDe(x.resultado.modelo) ? x.resultado.modelo : x.modeloPedido;
  return costoMicroUsd(modelo, entrada, salida) ?? x.estimado;
}

/** "YYYY-MM" en hora de Buenos Aires (UTC-3, sin horario de verano). */
export function mesDeIA(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).formatToParts(fecha);
  const y = partes.find((p) => p.type === "year")?.value;
  const m = partes.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** ¿Entra esta llamada? Cuenta lo gastado, lo que está en vuelo y lo nuevo. */
export const entraEnElTope = (x: { tope: bigint; gastado: bigint; reservado: bigint; estimado: bigint }): boolean =>
  x.estimado >= BigInt(0) && x.gastado + x.reservado + x.estimado <= x.tope;

/** «US$ 1,23» (dos decimales, redondeado hacia arriba para no mostrar de menos lo gastado). */
export function usd(micro: bigint): string {
  const centavos = micro <= BigInt(0) ? BigInt(0) : (micro + BigInt(9_999)) / BigInt(10_000);
  const enteros = centavos / BigInt(100);
  const resto = (centavos % BigInt(100)).toString().padStart(2, "0");
  return `US$ ${enteros.toLocaleString("es-AR")},${resto}`;
}

/** Lee «12,50» o «12.5» (US$) del formulario de la consola. null si no es un monto válido. Tope: US$ 100.000. */
export function leerTopeUsd(texto: unknown): bigint | null {
  if (typeof texto !== "string") return null;
  const t = texto.trim().replace(/^US\$\s*/i, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  const [ent, dec = ""] = t.split(".");
  const micro = BigInt(ent) * MICRO_POR_USD + BigInt(dec.padEnd(2, "0")) * BigInt(10_000);
  return micro <= BigInt(100_000) * MICRO_POR_USD ? micro : null;
}

export const TOPE_ALCANZADO = (gastado: bigint, tope: bigint): string =>
  `Se alcanzó el tope de IA de este mes (${usd(gastado)} de ${usd(tope)}). Lo amplía GSG.`;
export const SIN_TOPE_CARGADO = "Este negocio no tiene tope de IA paga cargado. Lo habilita GSG.";
export const IA_ESPERA_ACTUALIZACION = "La IA de proyectos espera su actualización. Avisale a GSG.";
export const TOPE_NO_VERIFICADO = "No se pudo verificar el tope de IA de este mes. Probá de nuevo en un momento.";
export const MODELO_SIN_PRECIO = "El modelo de IA configurado no tiene precio cargado: no se usa hasta que GSG lo revise.";
