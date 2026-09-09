/**
 * Estrategia ARS — dólar cripto local. Dos variantes:
 *
 * (a) `cruce`  — USDT/ARS ENTRE plataformas argentinas: compro USDT con pesos en A
 *     (totalAsk = con comisión) y lo vendo en B (totalBid). `bruto` = precios PUBLICADOS
 *     (la ilusión); `costos.comisiones` = lo que cada plataforma esconde entre publicado y
 *     total; + retiro USDT (TRC20 ≈ USD 1) + riesgo de precio del traslado.
 *
 * (b) `rulo-oficial` — la única que el análisis (docs/ANALISIS-FACTIBILIDAD.md §4) dejó en
 *     pista: comprar USD al oficial BNA → transferir al exchange → vender USDT contra ARS al
 *     mejor bid → pesos de vuelta al banco. `bruto` = premium del bid vs BNA venta. Se resta
 *     la fricción del ciclo (spread P2P efectivo, transferencia USD banco→exchange, impuesto
 *     al cheque si aplica, riesgo de que el premium se mueva durante las 24–48 h del riel)
 *     + impuesto a la ganancia. Lo que está SIN VERIFICAR va anotado en `detalle.advertencias`
 *     y NO habilita capital: lo mide un ciclo de prueba (§7.5 del análisis).
 *
 * Premium vs oficial: el brief dice ≈ 0 % en 2026; la foto del 08/09/2026 dijo +2,6/+3,2 %.
 * Las dos no pueden ser ciertas en promedio → es la primera variable que hay que medir 30 días.
 *
 * Fuente en vivo (a probar en la máquina del dueño): https://criptoya.com/api/usdt/ars/<monto>
 */
import { desglose, liquidar, riesgoTraslado, fijoComoFraccion } from '../costos.mjs';

export const nombre = 'ars';

export function evaluar(ctx) {
  const { ars, nocionales, costos } = ctx;
  if (!ars?.usdt) return [];
  const out = [];
  const plataformas = Object.entries(ars.usdt).filter(([, v]) => v && v.ask > 0 && v.bid > 0);
  const oficialVenta = ars.dolar?.oficial?.venta;
  const volARS = costos.argentina.volatilidadAnualARS;
  const conVolARS = { ...costos, mercado: { ...costos.mercado, volatilidadAnual: { ...costos.mercado.volatilidadAnual, ARS: volARS } } };

  // (a) cruce entre plataformas
  const segCruce = costos.exchanges.binance.retiroSeg + costos.argentina.transferenciaARSSeg;
  const riesgoCruce = riesgoTraslado('USDT', segCruce, costos) + riesgoTraslado('ARS', segCruce, conVolARS);
  for (const [a, pa] of plataformas) {
    for (const [b, pb] of plataformas) {
      if (a === b) continue;
      const askA = pa.ask, totalAskA = pa.totalAsk ?? pa.ask;
      const bidB = pb.bid, totalBidB = pb.totalBid ?? pb.bid;
      const bruto = (bidB - askA) / askA;
      const comisiones = (totalAskA - askA) / askA + (bidB - totalBidB) / bidB;
      for (const nocional of nocionales) {
        const d = desglose({ comisiones, retiro: fijoComoFraccion(costos.exchanges.binance.retiroUSDT, nocional), slippage: 0, riesgoTraslado: riesgoCruce });
        const liq = liquidar(bruto, d, costos);
        out.push({
          clave: `ars|cruce|${a}>${b}|${nocional}`,
          estrategia: nombre, par: 'USDT/ARS', ruta: `${a} → ${b}`, nocional,
          ...liq, netoUSD: liq.neto * nocional,
          spreadTop: bruto, spreadEjecutable: (totalBidB - totalAskA) / totalAskA, completo: true,
          detalle: { variante: 'cruce', askPublicado: askA, askTotal: totalAskA, bidPublicado: bidB, bidTotal: totalBidB, premiumVsOficial: oficialVenta ? totalBidB / oficialVenta - 1 : NaN, origen: ars.origen },
        });
      }
    }
  }

  // (b) rulo oficial: BNA → USD → exchange → vender USDT al bid → ARS
  if (oficialVenta > 0) {
    const r = costos.argentina.rulo;
    const segCiclo = r.cicloHoras * 3600;
    const riesgoCiclo = riesgoTraslado('ARS', segCiclo, conVolARS); // el premium se mueve mientras el riel demora
    for (const [b, pb] of plataformas) {
      const totalBidB = pb.totalBid ?? pb.bid;
      const bruto = totalBidB / oficialVenta - 1;
      const comisiones = (pb.bid - totalBidB) / pb.bid + r.spreadP2PEfectivo;
      const otros = r.transferenciaUSDBanco + r.conversionUSDaUSDT + r.impuestoCheque;
      for (const nocional of nocionales) {
        const d = desglose({ comisiones, retiro: 0, slippage: 0, riesgoTraslado: riesgoCiclo, otros });
        const liq = liquidar(bruto, d, costos);
        out.push({
          clave: `ars|rulo-oficial|${b}|${nocional}`,
          estrategia: nombre, par: 'USD→USDT/ARS', ruta: `BNA oficial → ${b}`, nocional,
          ...liq, netoUSD: liq.neto * nocional,
          spreadTop: bruto, spreadEjecutable: bruto - comisiones, completo: true,
          efimera: false, // el ciclo dura 24–48 h: la tasa de fantasma a ms no aplica
          detalle: {
            variante: 'rulo-oficial', oficialVenta, bidTotal: totalBidB, premiumVsOficial: bruto, cicloHoras: r.cicloHoras,
            advertencias: r.advertencias,
            origen: ars.origen,
          },
        });
      }
    }
  }
  return out;
}

/** Resumen del mercado ARS: mejor compra, mejor venta, premium vs oficial. */
export function resumenArs(ars) {
  if (!ars?.usdt) return null;
  const filas = Object.entries(ars.usdt).filter(([, v]) => v && v.ask > 0 && v.bid > 0).map(([p, v]) => ({ plataforma: p, ask: v.ask, totalAsk: v.totalAsk ?? v.ask, bid: v.bid, totalBid: v.totalBid ?? v.bid, spreadEfectivo: ((v.totalAsk ?? v.ask) - (v.totalBid ?? v.bid)) / (v.totalAsk ?? v.ask) }));
  if (!filas.length) return null;
  const mejorCompra = filas.reduce((m, f) => (f.totalAsk < m.totalAsk ? f : m));
  const mejorVenta = filas.reduce((m, f) => (f.totalBid > m.totalBid ? f : m));
  const oficial = ars.dolar?.oficial?.venta;
  return { filas, mejorCompra, mejorVenta, oficialVenta: oficial, premiumVsOficial: oficial ? mejorVenta.totalBid / oficial - 1 : NaN };
}
