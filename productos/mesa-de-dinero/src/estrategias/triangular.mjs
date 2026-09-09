/**
 * Estrategia TRIANGULAR — tres patas dentro del mismo venue.
 *
 * Ciclo A: USDT → B1 (asks B1/USDT) → B2 (asks B2/B1, gastando B1) → USDT (bids B2/USDT)
 * Ciclo B: USDT → B2 (asks B2/USDT) → B1 (bids B2/B1, vendiendo B2) → USDT (bids B1/USDT)
 *
 * Sin retiro ni traslado; se pagan 3 taker. `bruto` = ciclo con precios top-of-book;
 * `costos.slippage` = lo que se pierde barriendo los tres libros para el nocional.
 */
import { barrer, mejorAsk, mejorBid } from '../profundidad.mjs';
import { costoTriangular, liquidar } from '../costos.mjs';

export const nombre = 'triangular';

/** Encuentra triángulos {b1, b2} tales que existan B1/USDT, B2/USDT y B2/B1 en el venue. */
export function triangulosDe(librosVenue) {
  const pares = Object.keys(librosVenue);
  const out = [];
  for (const p of pares) {
    const [b2, b1] = p.split('/');
    if (b1 === 'USDT') continue;
    if (pares.includes(`${b1}/USDT`) && pares.includes(`${b2}/USDT`)) out.push({ b1, b2, cruzado: p });
  }
  return out;
}

export function evaluar(ctx) {
  const { libros, nocionales, costos } = ctx;
  const out = [];
  for (const venue of Object.keys(libros)) {
    const lv = libros[venue];
    for (const { b1, b2, cruzado } of triangulosDe(lv)) {
      const L1 = lv[`${b1}/USDT`], L2 = lv[`${b2}/USDT`], LX = lv[cruzado];
      for (const nocional of nocionales) {
        // Ciclo A
        {
          const top = (1 / mejorAsk(L1)) * (1 / mejorAsk(LX)) * mejorBid(L2) - 1;
          const p1 = barrer(L1.asks, { quote: nocional });
          const p2 = barrer(LX.asks, { quote: p1.base });
          const p3 = barrer(L2.bids, { base: p2.base });
          const ejec = p3.quote / nocional - 1;
          out.push(armar({ venue, ruta: `USDT → ${b1} → ${b2} → USDT`, ciclo: 'A', nocional, top, ejec, completo: p1.completo && p2.completo && p3.completo, costos, origen: L1.origen }));
        }
        // Ciclo B
        {
          const top = (1 / mejorAsk(L2)) * mejorBid(LX) * mejorBid(L1) - 1;
          const p1 = barrer(L2.asks, { quote: nocional });
          const p2 = barrer(LX.bids, { base: p1.base });
          const p3 = barrer(L1.bids, { base: p2.quote });
          const ejec = p3.quote / nocional - 1;
          out.push(armar({ venue, ruta: `USDT → ${b2} → ${b1} → USDT`, ciclo: 'B', nocional, top, ejec, completo: p1.completo && p2.completo && p3.completo, costos, origen: L2.origen }));
        }
      }
    }
  }
  return out;
}

function armar({ venue, ruta, ciclo, nocional, top, ejec, completo, costos, origen }) {
  const slippage = Math.max(0, top - ejec);
  const liq = liquidar(top, costoTriangular({ venue, slippage, costos }), costos);
  return {
    clave: `triangular|${venue}|${ciclo}|${ruta}|${nocional}`,
    estrategia: nombre,
    par: ruta.replace(/USDT → | → USDT/g, '').replace(' → ', '/'),
    ruta: `${venue}: ${ruta}`,
    nocional,
    ...liq,
    netoUSD: liq.neto * nocional,
    spreadTop: top,
    spreadEjecutable: ejec,
    completo,
    detalle: { venue, ciclo, origen },
  };
}
