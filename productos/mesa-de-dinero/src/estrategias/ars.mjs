/**
 * Estrategia ARS — dólar cripto local: USDT/ARS entre plataformas argentinas.
 *
 * Compro USDT con pesos en A (totalAsk = precio con comisión incluida) y lo vendo en
 * B (totalBid). `bruto` = diferencia entre precios PUBLICADOS (ask/bid pelados, la
 * ilusión); `costos.comisiones` = lo que cada plataforma esconde entre el precio
 * publicado y el total efectivo; más retiro USDT (TRC20 ≈ USD 1), más el riesgo de
 * precio del traslado (USDT ≈ 0, pero el peso se mueve).
 *
 * Además se reporta el premium USDT vs dólar oficial: el "rulo" clásico de 2022
 * (> 30 %) hoy es ≈ 0 %. Si el premium no está, el rulo no existe.
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
  const seg = costos.exchanges.binance.retiroSeg + costos.argentina.transferenciaARSSeg;
  const riesgo = riesgoTraslado('USDT', seg, costos) + riesgoTraslado('ARS_PROXY', seg, { ...costos, mercado: { ...costos.mercado, volatilidadAnual: { ARS_PROXY: 0.08 } } });

  for (const [a, pa] of plataformas) {
    for (const [b, pb] of plataformas) {
      if (a === b) continue;
      const askA = pa.ask, totalAskA = pa.totalAsk ?? pa.ask;
      const bidB = pb.bid, totalBidB = pb.totalBid ?? pb.bid;
      const bruto = (bidB - askA) / askA;
      const comisiones = (totalAskA - askA) / askA + (bidB - totalBidB) / bidB;
      for (const nocional of nocionales) {
        const d = desglose({ comisiones, retiro: fijoComoFraccion(costos.exchanges.binance.retiroUSDT, nocional), slippage: 0, riesgoTraslado: riesgo });
        const liq = liquidar(bruto, d, costos);
        out.push({
          clave: `ars|${a}>${b}|${nocional}`,
          estrategia: nombre,
          par: 'USDT/ARS',
          ruta: `${a} → ${b}`,
          nocional,
          ...liq,
          netoUSD: liq.neto * nocional,
          spreadTop: bruto,
          spreadEjecutable: (totalBidB - totalAskA) / totalAskA,
          completo: true,
          detalle: {
            askPublicado: askA, askTotal: totalAskA, bidPublicado: bidB, bidTotal: totalBidB,
            premiumVsOficial: oficialVenta ? totalBidB / oficialVenta - 1 : NaN,
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
  const filas = Object.entries(ars.usdt).map(([p, v]) => ({ plataforma: p, ask: v.ask, totalAsk: v.totalAsk ?? v.ask, bid: v.bid, totalBid: v.totalBid ?? v.bid, spreadEfectivo: ((v.totalAsk ?? v.ask) - (v.totalBid ?? v.bid)) / (v.totalAsk ?? v.ask) }));
  const mejorCompra = filas.reduce((m, f) => (f.totalAsk < m.totalAsk ? f : m));
  const mejorVenta = filas.reduce((m, f) => (f.totalBid > m.totalBid ? f : m));
  const oficial = ars.dolar?.oficial?.venta;
  return { filas, mejorCompra, mejorVenta, oficialVenta: oficial, premiumVsOficial: oficial ? mejorVenta.totalBid / oficial - 1 : NaN };
}
