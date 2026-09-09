/**
 * Estrategia FUNDING — cash & carry: spot largo + perpetuo corto, cobrando funding.
 *
 * bruto (a horizonte H días) = funding8h × 3 × H + basis de entrada (marca − spot)/spot
 * costos = round-trip (abrir y cerrar las dos patas) + slippage spot
 * break-even = round-trip ÷ funding diario   → con 0,28 % y 0,01 %/8h ≈ 9,3 días
 *
 * Advertencia que se imprime siempre: el funding NO es fijo. Si se da vuelta, la
 * posición paga en vez de cobrar, y el break-even se corre al infinito.
 */
import { comprarPorNocional } from '../profundidad.mjs';
import { costoFundingRoundTrip, breakEvenDias, liquidar } from '../costos.mjs';

export const nombre = 'funding';

export function evaluar(ctx) {
  const { libros, funding = {}, nocionales, costos, opciones = {} } = ctx;
  const horizonte = opciones.horizonteDias ?? 30;
  const out = [];
  for (const venue of Object.keys(funding)) {
    for (const par of Object.keys(funding[venue])) {
      const f = funding[venue][par];
      const spot = libros[venue]?.[par];
      if (!f || !spot) continue;
      for (const nocional of nocionales) {
        const compra = comprarPorNocional(spot, nocional);
        const slippage = Number.isFinite(compra.slippage) ? compra.slippage : 0;
        const basis = Number.isFinite(f.precioMarca) ? (f.precioMarca - compra.precioPromedio) / compra.precioPromedio : 0;
        const fundingDiario = f.tasa8h * costos.mercado.periodosFundingPorDia;
        const bruto = fundingDiario * horizonte + basis;
        const desglose = costoFundingRoundTrip({ venue, slippage, costos });
        const liq = liquidar(bruto, desglose, costos);
        const breakEven = breakEvenDias(desglose.total, f.tasa8h, costos.mercado.periodosFundingPorDia);
        out.push({
          clave: `funding|${venue}|${par}|${nocional}`,
          estrategia: nombre,
          par,
          ruta: `${venue}: spot largo + perp corto (${horizonte} días)`,
          nocional,
          ...liq,
          netoUSD: liq.neto * nocional,
          spreadTop: bruto,
          spreadEjecutable: bruto - slippage,
          completo: compra.completo,
          efimera: false, // vive días: el re-chequeo a ms no mide nada acá
          detalle: {
            tasa8h: f.tasa8h,
            fundingDiario,
            fundingAnualizado: fundingDiario * 365,
            basis,
            horizonteDias: horizonte,
            breakEvenDias: breakEven,
            roundTrip: desglose.total,
            advertencia: 'el funding no es fijo: si se da vuelta, la posición paga en vez de cobrar',
            origen: `${spot.origen}/${f.origen}`,
          },
        });
      }
    }
  }
  return out;
}
