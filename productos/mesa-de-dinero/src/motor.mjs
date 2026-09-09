/**
 * Motor de falsación — Mesa de Dinero (GSG)
 *
 * No emite señales de compra. Barre estrategias, aplica el modelo de costos completo,
 * RE-CHEQUEA las oportunidades que sobrevivieron tras un delay (tasa de fantasma) y
 * acumula estadística. El veredicto es 🟢 sobrevive / 🟡 marginal / 🔴 muere.
 */
import { COSTOS, VEREDICTO } from './costos.mjs';
import * as cexCex from './estrategias/cex-cex.mjs';
import * as triangular from './estrategias/triangular.mjs';
import * as funding from './estrategias/funding.mjs';
import * as ars from './estrategias/ars.mjs';
import { estadisticasDe, observacionDe } from './registro.mjs';
import { curvaSpread, NOCIONALES_CURVA } from './profundidad.mjs';

export const ESTRATEGIAS = Object.freeze({ 'cex-cex': cexCex, triangular, funding, ars });
export const PARES_DEFAULT = Object.freeze(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ETH/BTC']);
// Clips del contrato de medición (ANÁLISIS §7.1): USD 500 / 2.500 / 5.000; 10.000 para ver el derrumbe.
export const NOCIONALES_DEFAULT = Object.freeze([500, 2_500, 5_000, 10_000]);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Junta libros, funding y ARS en un contexto para las estrategias. */
export async function armarContexto(mercado, { exchanges, pares, nocionales, profundidad = 100, instante = 't0', costos = COSTOS, opciones = {}, conFunding = true, conArs = true } = {}) {
  const libros = {};
  const fund = {};
  const tareas = [];
  for (const ex of exchanges) {
    libros[ex] = {};
    for (const par of pares) {
      tareas.push(mercado.libroDeOrdenes(ex, par, profundidad, { instante }).then((l) => { if (l) libros[ex][par] = l; }).catch(() => {}));
      if (conFunding && par.endsWith('/USDT')) {
        tareas.push(mercado.funding(ex, par).then((f) => { if (f) (fund[ex] ??= {})[par] = f; }).catch(() => {}));
      }
    }
  }
  let arsDatos = null;
  if (conArs) tareas.push(mercado.ars(1000).then((a) => { arsDatos = a; }).catch(() => {}));
  await Promise.all(tareas);
  for (const ex of Object.keys(libros)) if (!Object.keys(libros[ex]).length) delete libros[ex];
  return { libros, funding: fund, ars: arsDatos, nocionales, costos, opciones, instante };
}

/** Evalúa todas las estrategias pedidas sobre un contexto. */
export function evaluarTodo(ctx, estrategias = Object.keys(ESTRATEGIAS)) {
  const out = [];
  for (const nombre of estrategias) {
    const e = ESTRATEGIAS[nombre];
    if (!e) { out.push({ estrategia: nombre, error: `estrategia desconocida: ${nombre}` }); continue; }
    try { out.push(...e.evaluar(ctx)); } catch (err) { out.push({ estrategia: nombre, error: err.message }); }
  }
  return out;
}

/**
 * Una pasada completa: observar → evaluar → re-chequear ganadoras → estadística → registro.
 *
 * Devuelve { pasada, ts, oportunidades, estadisticas, red, errores, duracionMs }.
 */
export async function correrPasada(mercado, {
  exchanges = mercado.exchanges,
  pares = PARES_DEFAULT,
  nocionales = NOCIONALES_DEFAULT,
  estrategias = Object.keys(ESTRATEGIAS),
  delayRecheckMs = 500,
  registro = null,
  costos = COSTOS,
  opciones = {},
  pasada = 1,
} = {}) {
  const t0 = performance.now();
  const ts = Date.now();
  const ctx = await armarContexto(mercado, { exchanges, pares, nocionales, costos, opciones, instante: 't0' });
  const todas = evaluarTodo(ctx, estrategias);
  const errores = todas.filter((o) => o.error);
  // "Oportunidad bruta" = lo que un amateur vería como positivo mirando el top-of-book.
  // Las combinaciones con bruto <= 0 se cuentan pero no entran a la tasa de supervivencia.
  const evaluadas = todas.filter((o) => !o.error);
  const oportunidades = evaluadas.filter((o) => o.bruto > 0);

  // Re-chequeo de las que NO murieron: ¿siguen vivas a los N ms?
  const ganadoras = oportunidades.filter((o) => o.veredicto !== VEREDICTO.MUERE);
  if (ganadoras.length && delayRecheckMs >= 0) {
    if (delayRecheckMs > 0) await dormir(delayRecheckMs);
    const ctx1 = await armarContexto(mercado, { exchanges, pares, nocionales, costos, opciones, instante: 't1' });
    const despues = new Map(evaluarTodo(ctx1, estrategias).filter((o) => !o.error).map((o) => [o.clave, o]));
    // Fantasma = a los N ms la oportunidad ya no es lo que era: una 🟢 que dejó de ser 🟢
    // (bajó a marginal o murió), o una 🟡 que murió. Si no aparece más, también es fantasma.
    for (const g of ganadoras) {
      const r = despues.get(g.clave);
      const fantasma = !r || r.veredicto === VEREDICTO.MUERE || (g.veredicto === VEREDICTO.SOBREVIVE && r.veredicto !== VEREDICTO.SOBREVIVE);
      g.recheck = { hecho: true, delayMs: delayRecheckMs, neto: r?.neto ?? NaN, veredicto: r?.veredicto ?? 'desaparecio', fantasma };
    }
  }
  for (const o of oportunidades) if (!o.recheck) o.recheck = { hecho: false };

  oportunidades.sort((a, b) => b.neto - a.neto);

  // Curvas de derrumbe: para los cruces spot más TENTADORES (mayor bruto top-of-book),
  // cómo se desploma el spread ejecutable a medida que sube el nocional.
  const curvas = curvasDeDerrumbe(ctx, oportunidades, costos);

  const observaciones = oportunidades.map((o) => observacionDe(o, { pasada, ts }));
  if (registro) for (const obs of observaciones) registro.anotar(obs);

  const resultado = {
    pasada, ts,
    oportunidades,
    curvas,
    estadisticas: { ...estadisticasDe(observaciones), combinacionesEvaluadas: evaluadas.length },
    red: mercado.estadoRed(),
    contexto: { exchanges: Object.keys(ctx.libros), pares, nocionales, funding: Object.keys(ctx.funding), ars: !!ctx.ars, origenArs: ctx.ars?.origen ?? null },
    errores,
    duracionMs: Math.round(performance.now() - t0),
  };
  // Los libros quedan accesibles (para el servidor web) pero no se serializan.
  Object.defineProperty(resultado, 'ctx', { value: ctx, enumerable: false });
  return resultado;
}

/** Hasta 3 cruces cex-cex distintos (par+ruta), ordenados por bruto top-of-book. */
export function curvasDeDerrumbe(ctx, oportunidades, costos = COSTOS, nocionales = NOCIONALES_CURVA, maximo = 3) {
  const vistos = new Set();
  const out = [];
  const spot = oportunidades.filter((o) => o.estrategia === 'cex-cex').sort((a, b) => b.spreadTop - a.spreadTop);
  for (const o of spot) {
    const k = `${o.par}|${o.ruta}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const [compraEn, ventaEn] = o.ruta.split(' → ');
    const la = ctx.libros[compraEn]?.[o.par], lb = ctx.libros[ventaEn]?.[o.par];
    if (!la || !lb) continue;
    const pisoFijo = o.costos.comisiones + o.costos.riesgoTraslado; // lo que no depende del nocional
    const retiroUSD = costos.exchanges[compraEn]?.retiroUSDT ?? 1;
    out.push({
      par: o.par, ruta: o.ruta, compraEn, ventaEn,
      puntos: curvaSpread(la, lb, nocionales).map((p) => ({ ...p, pisoCosto: pisoFijo + retiroUSD / p.nocional })),
    });
    if (out.length >= maximo) break;
  }
  return out;
}

/** Acumulador para `watch`: suma estadísticas de varias pasadas. */
export function crearAcumulador() {
  const obs = [];
  return {
    sumar(resultado) { obs.push(...resultado.oportunidades.map((o) => observacionDe(o, { pasada: resultado.pasada, ts: resultado.ts }))); },
    estadisticas() { return estadisticasDe(obs); },
    cantidad() { return obs.length; },
  };
}
