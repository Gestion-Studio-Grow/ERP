/**
 * Modelo de costos — Mesa de Dinero (GSG)
 *
 * Todos los valores son FRACCIONES (0.001 = 0,10 %). Configurables por objeto,
 * con la fuente anotada al lado de cada número. Verificados para 2026.
 *
 * Regla de la casa: el costo se muestra SIEMPRE desagregado y al lado del spread
 * bruto. Un neto sin desglose no sirve como evidencia.
 */

export const COSTOS = Object.freeze({
  exchanges: {
    // Fuente: binance.com/fee/schedule — spot VIP0 0,10 % maker/taker; 25 % off pagando con BNB → 0,075 %.
    //         binance.com/fee/futureFee — USDT-M VIP0 maker 0,02 % / taker 0,05 % (0,04 % con descuentos).
    //         Retiro USDT red TRC20 ≈ 1 USDT.
    binance: {
      spotTaker: 0.0010,
      spotTakerBNB: 0.00075,
      spotMaker: 0.0010,
      futMaker: 0.0002,
      futTaker: 0.0005,
      retiroUSDT: 1,        // USD fijo, TRC20
      retiroSeg: 120,       // tiempo típico hasta acreditar (confirmaciones TRC20)
    },
    // Fuente: kraken.com/features/fee-schedule — spot tier < 50k USD/30d: maker 0,16 % / taker 0,26 %.
    kraken: {
      spotTaker: 0.0026,
      spotMaker: 0.0016,
      retiroUSDT: 1,
      retiroSeg: 180,
    },
    // Fuente: bybit.com/en/help-center (fee rates) — spot VIP0 0,10 %; perpetuos maker 0,02 % / taker 0,055 %.
    bybit: {
      spotTaker: 0.0010,
      spotMaker: 0.0010,
      futMaker: 0.0002,
      futTaker: 0.00055,
      retiroUSDT: 1,
      retiroSeg: 120,
    },
    // Fuente: okx.com/fees — spot Lv1 maker 0,08 % / taker 0,10 %; perpetuos maker 0,02 % / taker 0,05 %.
    okx: {
      spotTaker: 0.0010,
      spotMaker: 0.0008,
      futMaker: 0.0002,
      futTaker: 0.0005,
      retiroUSDT: 1,
      retiroSeg: 120,
    },
    // Fuente: coinbase.com/advanced-fees — Advanced Trade tier base: maker 0,40 % / taker 0,60 %.
    coinbase: {
      spotTaker: 0.0060,
      spotMaker: 0.0040,
      retiroUSDT: 1,
      retiroSeg: 300,
    },
  },

  // Exchanges argentinos (Ripio, Buenbit, Lemon, Belo, SatoshiTango, etc.).
  // Fuente: comparativa de precios ask/bid vs totalAsk/totalBid en criptoya.com (2026) —
  // comisión + spread efectivo todo incluido entre 3,5 % y 8 % según plataforma y monto.
  argentina: {
    spreadEfectivoMin: 0.035,
    spreadEfectivoMax: 0.08,
    spreadEfectivoDefault: 0.05,
    // Premium USDT/ARS vs dólar oficial. 2022: > 30 % (el "rulo" clásico). 2026: ≈ 0 %.
    // Fuente: series de dolarapi.com / criptoya vs BCRA A3500 — brecha cripto-oficial < 1 % durante 2025-2026.
    premiumVsOficial: 0.0,
    transferenciaARS: 0,       // CVU/CBU inmediata y gratis para personas físicas
    transferenciaARSSeg: 30,
  },

  impuestos: {
    // Fuente: Ley 27.430 / Ganancias, art. 94-95 — resultado por enajenación de activos financieros
    // en moneda extranjera para personas humanas residentes: alícuota 15 % sobre la ganancia neta.
    gananciaNetaPF: 0.15,
  },

  mercado: {
    // Fuente: mediciones propias y literatura de HFT (Makarov & Schoar 2020, "Trading and arbitrage in
    // cryptocurrency markets"): un desvío cross-exchange se cierra en 200-800 ms en pares líquidos.
    vidaSpreadMs: [200, 800],
    // Volatilidad anualizada realizada 2026 (fuente: índices BVOL / Deribit DVOL promedios): BTC ≈ 45 %, ETH ≈ 65 %.
    volatilidadAnual: { BTC: 0.45, ETH: 0.65, SOL: 0.85, USDT: 0.002, default: 0.70 },
    // Funding neutro típico en perpetuos: 0,01 % cada 8 h = 0,03 %/día (fuente: docs de Binance/Bybit — tasa base).
    fundingNeutro8h: 0.0001,
    periodosFundingPorDia: 3,
  },

  // Umbral bajo el cual un neto positivo se considera "marginal" (dentro del ruido de medición).
  umbralMarginal: 0.0005,
});

/** Devuelve el objeto de fees de un exchange o lanza si no está modelado. */
export function feesDe(exchange, costos = COSTOS) {
  const f = costos.exchanges[exchange];
  if (!f) throw new Error(`Exchange sin modelo de costos: ${exchange}`);
  return f;
}

/** Costo fijo expresado como fracción del nocional. */
export function fijoComoFraccion(usd, nocionalUSD) {
  if (nocionalUSD <= 0) return Infinity;
  return usd / nocionalUSD;
}

/**
 * Riesgo de precio durante un traslado (retiro/depósito). Modelo: 1 sigma de la
 * volatilidad realizada escalada a la duración del traslado. No es una comisión
 * "cobrada", es la pérdida esperada por quedar expuesto sin cobertura mientras
 * la plata viaja. El "arbitraje" amateur lo ignora; acá se resta siempre.
 *
 * sigma_t = sigma_anual * sqrt(segundos / segundosAnio)
 */
export function riesgoTraslado(activo, segundos, costos = COSTOS) {
  const vol = costos.mercado.volatilidadAnual[activo] ?? costos.mercado.volatilidadAnual.default;
  const SEG_ANIO = 365 * 24 * 3600;
  return vol * Math.sqrt(segundos / SEG_ANIO);
}

/** Impuesto a la ganancia neta: 15 % solo si hay ganancia; 0 si hay pérdida. */
export function impuestoSobre(netoAntesImpuesto, costos = COSTOS) {
  return netoAntesImpuesto > 0 ? netoAntesImpuesto * costos.impuestos.gananciaNetaPF : 0;
}

/**
 * Desglose de costos de un spot cruzado (comprar en A, trasladar, vender en B).
 * Devuelve fracciones del nocional. `slippage` viene ya calculado por profundidad.
 */
export function costoCexCex({ compraEn, ventaEn, nocionalUSD, activo, slippage = 0, costos = COSTOS }) {
  const fa = feesDe(compraEn, costos);
  const fb = feesDe(ventaEn, costos);
  const comisiones = fa.spotTaker + fb.spotTaker;
  const retiro = fijoComoFraccion(fa.retiroUSDT, nocionalUSD);
  const traslado = riesgoTraslado(activo, fa.retiroSeg, costos);
  return desglose({ comisiones, retiro, slippage, riesgoTraslado: traslado });
}

/** Triangular dentro de un venue: 3 taker, sin retiro, sin traslado. */
export function costoTriangular({ venue, slippage = 0, costos = COSTOS }) {
  const f = feesDe(venue, costos);
  return desglose({ comisiones: 3 * f.spotTaker, retiro: 0, slippage, riesgoTraslado: 0 });
}

/**
 * Cash & carry: spot largo + perpetuo corto. Round-trip = abrir y cerrar ambas patas.
 * Con Binance: 0,10 + 0,10 (spot) + 0,05 + 0,05 (fut taker) = 0,30 %. Con 0,04 % fut → 0,28 %.
 */
export function costoFundingRoundTrip({ venue, slippage = 0, costos = COSTOS, futTaker }) {
  const f = feesDe(venue, costos);
  const fut = futTaker ?? f.futTaker;
  if (fut === undefined) throw new Error(`${venue} no tiene perpetuos modelados`);
  return desglose({ comisiones: 2 * f.spotTaker + 2 * fut, retiro: 0, slippage, riesgoTraslado: 0 });
}

/**
 * Período de break-even de cash & carry: cuántos días de funding hacen falta para
 * pagar el round-trip. Ej.: 0,28 % ÷ (0,01 %×3) = 9,33 días.
 */
export function breakEvenDias(roundTrip, funding8h, periodosPorDia = COSTOS.mercado.periodosFundingPorDia) {
  const diario = funding8h * periodosPorDia;
  if (diario <= 0) return Infinity;
  return roundTrip / diario;
}

/** Arma el objeto de desglose con el total, siempre con las mismas llaves. */
export function desglose({ comisiones = 0, retiro = 0, slippage = 0, riesgoTraslado = 0, otros = 0 }) {
  const total = comisiones + retiro + slippage + riesgoTraslado + otros;
  return { comisiones, retiro, slippage, riesgoTraslado, otros, total };
}

/**
 * Liquida una oportunidad: bruto − costos → neto antes de impuesto → impuesto → neto.
 * El veredicto sale del neto DESPUÉS de impuesto.
 */
export function liquidar(bruto, costosDesglosados, costos = COSTOS) {
  const netoAntesImpuesto = bruto - costosDesglosados.total;
  const impuesto = impuestoSobre(netoAntesImpuesto, costos);
  const neto = netoAntesImpuesto - impuesto;
  return {
    bruto,
    costos: { ...costosDesglosados, impuesto, totalConImpuesto: costosDesglosados.total + impuesto },
    netoAntesImpuesto,
    neto,
    veredicto: veredictoDe(neto, costos),
  };
}

export const VEREDICTO = Object.freeze({
  SOBREVIVE: 'sobrevive',
  MARGINAL: 'marginal',
  MUERE: 'muere',
});

export function veredictoDe(neto, costos = COSTOS) {
  if (neto > costos.umbralMarginal) return VEREDICTO.SOBREVIVE;
  if (neto >= 0) return VEREDICTO.MARGINAL;
  return VEREDICTO.MUERE;
}

export const EMOJI_VEREDICTO = Object.freeze({
  [VEREDICTO.SOBREVIVE]: '🟢',
  [VEREDICTO.MARGINAL]: '🟡',
  [VEREDICTO.MUERE]: '🔴',
});
