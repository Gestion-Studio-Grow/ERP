/** Formato de salida en criollo: porcentajes con coma, USD, tablas alineadas. */

export const pct = (x, dec = 3) => (Number.isFinite(x) ? `${(x * 100).toFixed(dec).replace('.', ',')} %` : '—');
export const usd = (x, dec = 2) => (Number.isFinite(x) ? `USD ${x.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}` : '—');
export const num = (x, dec = 2) => (Number.isFinite(x) ? x.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—');
export const dias = (x) => (Number.isFinite(x) ? `${x.toFixed(1).replace('.', ',')} días` : '∞');

/** Ancho visible (los emojis ocupan 2 celdas en la mayoría de las terminales). */
function ancho(s) {
  let w = 0;
  for (const ch of String(s)) w += /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
  return w;
}
const pad = (s, w, der) => { const f = ' '.repeat(Math.max(0, w - ancho(s))); return der ? f + s : s + f; };

/**
 * Tabla alineada. columnas: [{ titulo, clave, der?: bool, f?: (v, fila) => string }]
 */
export function tabla(filas, columnas) {
  const celdas = filas.map((fila) => columnas.map((c) => String(c.f ? c.f(fila[c.clave], fila) : fila[c.clave] ?? '')));
  const anchos = columnas.map((c, i) => Math.max(ancho(c.titulo), ...celdas.map((r) => ancho(r[i]))));
  const linea = (r) => r.map((v, i) => pad(v, anchos[i], columnas[i].der)).join('  ');
  const sep = anchos.map((w) => '─'.repeat(w)).join('  ');
  return [linea(columnas.map((c) => c.titulo)), sep, ...celdas.map(linea)].join('\n');
}
