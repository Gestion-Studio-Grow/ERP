/**
 * Estrategia CEX↔CEX — spot cruzado entre exchanges.
 *
 * Compro en A (barriendo asks), vendo en B (barriendo bids). Se resta TODO:
 *   taker compra + taker venta + retiro USDT (rebalanceo TRC20 ≈ USD 1) + slippage por
 *   profundidad + riesgo de precio durante el traslado (la pata queda descubierta).
 *
 * Supuesto de operación (anotado): inventario pre-posicionado en ambos venues y
 * rebalanceo en USDT. Sin inventario previo habría que trasladar el activo comprado
 * (retiro on-chain más caro y más lento) — o sea, peor que lo que se modela acá.
 *
 * `bruto` = spread top-of-book (la ilusión); `costos.slippage` = lo que se derrumba
 * al barrer el libro para el nocional pedido.
 */
import { spreadEjecutable } from '../profundidad.mjs';
import { costoCexCex, liquidar } from '../costos.mjs';

export const nombre = 'cex-cex';

export function evaluar(ctx) {
  const { libros, nocionales, costos } = ctx;
  const out = [];
  const exchanges = Object.keys(libros);
  const pares = new Set(exchanges.flatMap((e) => Object.keys(libros[e])).filter((p) => p.endsWith('/USDT')));

  for (const par of pares) {
    const activo = par.split('/')[0];
    for (const compraEn of exchanges) {
      const la = libros[compraEn]?.[par];
      if (!la) continue;
      for (const ventaEn of exchanges) {
        if (ventaEn === compraEn) continue;
        const lb = libros[ventaEn]?.[par];
        if (!lb) continue;
        for (const nocional of nocionales) {
          const s = spreadEjecutable(la, lb, nocional);
          if (!Number.isFinite(s.ejecutable.spread)) continue;
          const slippage = Math.max(0, s.derrumbe);
          const desglose = costoCexCex({ compraEn, ventaEn, nocionalUSD: nocional, activo, slippage, costos });
          const liq = liquidar(s.top.spread, desglose, costos);
          out.push({
            clave: `cex-cex|${par}|${compraEn}>${ventaEn}|${nocional}`,
            estrategia: nombre,
            par,
            ruta: `${compraEn} → ${ventaEn}`,
            nocional,
            ...liq,
            netoUSD: liq.neto * nocional,
            spreadTop: s.top.spread,
            spreadEjecutable: s.ejecutable.spread,
            completo: s.ejecutable.completo,
            detalle: {
              precioCompraTop: s.top.compra, precioVentaTop: s.top.venta,
              precioCompraVWAP: s.ejecutable.compra, precioVentaVWAP: s.ejecutable.venta,
              baseCruzada: s.ejecutable.baseCruzada,
              origen: `${la.origen}/${lb.origen}`,
            },
          });
        }
      }
    }
  }
  return out;
}
