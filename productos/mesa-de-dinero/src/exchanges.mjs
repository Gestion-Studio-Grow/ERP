/**
 * Conectores de market data PÚBLICO — Mesa de Dinero (GSG)
 *
 * SOLO LECTURA. Ningún conector firma nada, ninguno usa API key, ninguno toca un
 * endpoint privado. Si un día se quisiera operar, eso pasa por `ejecucion.mjs`,
 * que hoy lanza error y eleva al dueño.
 *
 * Cada conector normaliza a:
 *   libro   → { bids: [[precio, cantidad]], asks: [[precio, cantidad]], ts, fuente, par, origen }
 *   tickers → { [par]: { bid, ask, ts } }
 *   funding → { tasa8h, precioMarca, precioIndice, proximoCobroTs }
 *
 * `origen` es 'red' o 'fixture'. Sin salida de red la consola degrada con elegancia:
 * lo avisa una vez y sigue con fixtures (test/fixtures/libros/*.json).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarLibro } from './profundidad.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const DIR_FIXTURES = join(AQUI, '..', 'test', 'fixtures');

export const EXCHANGES = Object.freeze(['binance', 'kraken', 'bybit', 'okx', 'coinbase']);

const sinBarra = (par) => par.replace('/', '');
const conGuion = (par) => par.replace('/', '-');
const numPar = (n) => [Number(n[0]), Number(n[1])];

/**
 * Definición por exchange: símbolo, URL exacta del endpoint público y normalizador.
 * Los endpoints se dejan documentados acá para que el dueño los pruebe a mano
 * con curl en su máquina (acá el egress está bloqueado).
 */
export const CONECTORES = Object.freeze({
  binance: {
    // Libro:    GET https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=100
    // Tickers:  GET https://api.binance.com/api/v3/ticker/bookTicker?symbols=["BTCUSDT","ETHUSDT"]
    // Funding:  GET https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT
    simbolo: sinBarra,
    urlLibro: (s, prof) => `https://api.binance.com/api/v3/depth?symbol=${s}&limit=${prof}`,
    normalizarLibro: (j) => ({ bids: j.bids.map(numPar), asks: j.asks.map(numPar), ts: Date.now() }),
    urlTickers: (simbolos) => `https://api.binance.com/api/v3/ticker/bookTicker?symbols=${encodeURIComponent(JSON.stringify(simbolos))}`,
    normalizarTickers: (j) => Object.fromEntries((Array.isArray(j) ? j : [j]).map((t) => [t.symbol, { bid: Number(t.bidPrice), ask: Number(t.askPrice), ts: Date.now() }])),
    urlFunding: (s) => `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${s}`,
    normalizarFunding: (j) => ({ tasa8h: Number(j.lastFundingRate), precioMarca: Number(j.markPrice), precioIndice: Number(j.indexPrice), proximoCobroTs: Number(j.nextFundingTime) }),
  },
  kraken: {
    // Libro:    GET https://api.kraken.com/0/public/Depth?pair=XBTUSDT&count=100   (BTC se llama XBT)
    // Tickers:  GET https://api.kraken.com/0/public/Ticker?pair=XBTUSDT,ETHUSDT
    // Funding:  no aplica (Kraken Futures es otra API; no modelado)
    simbolo: (par) => sinBarra(par).replace(/^BTC/, 'XBT'),
    urlLibro: (s, prof) => `https://api.kraken.com/0/public/Depth?pair=${s}&count=${Math.min(prof, 500)}`,
    normalizarLibro: (j) => {
      if (j.error?.length) throw new Error(`kraken: ${j.error.join(', ')}`);
      const r = j.result[Object.keys(j.result)[0]];
      return { bids: r.bids.map(numPar), asks: r.asks.map(numPar), ts: Date.now() };
    },
    urlTickers: (simbolos) => `https://api.kraken.com/0/public/Ticker?pair=${simbolos.join(',')}`,
    normalizarTickers: (j) => Object.fromEntries(Object.entries(j.result).map(([k, t]) => [k, { bid: Number(t.b[0]), ask: Number(t.a[0]), ts: Date.now() }])),
  },
  bybit: {
    // Libro:    GET https://api.bybit.com/v5/market/orderbook?category=spot&symbol=BTCUSDT&limit=50
    // Tickers:  GET https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT
    // Funding:  GET https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT   (campo fundingRate)
    simbolo: sinBarra,
    urlLibro: (s, prof) => `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${s}&limit=${Math.min(prof, 200)}`,
    normalizarLibro: (j) => {
      if (j.retCode !== 0) throw new Error(`bybit: ${j.retMsg}`);
      return { bids: j.result.b.map(numPar), asks: j.result.a.map(numPar), ts: Number(j.result.ts) };
    },
    urlTickers: (simbolos) => `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${simbolos[0]}`,
    normalizarTickers: (j) => Object.fromEntries(j.result.list.map((t) => [t.symbol, { bid: Number(t.bid1Price), ask: Number(t.ask1Price), ts: Date.now() }])),
    urlFunding: (s) => `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}`,
    normalizarFunding: (j) => { const t = j.result.list[0]; return { tasa8h: Number(t.fundingRate), precioMarca: Number(t.markPrice), precioIndice: Number(t.indexPrice), proximoCobroTs: Number(t.nextFundingTime) }; },
  },
  okx: {
    // Libro:    GET https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=100
    // Tickers:  GET https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT
    // Funding:  GET https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP
    simbolo: conGuion,
    urlLibro: (s, prof) => `https://www.okx.com/api/v5/market/books?instId=${s}&sz=${Math.min(prof, 400)}`,
    normalizarLibro: (j) => {
      if (j.code !== '0') throw new Error(`okx: ${j.msg}`);
      const d = j.data[0];
      return { bids: d.bids.map(numPar), asks: d.asks.map(numPar), ts: Number(d.ts) };
    },
    urlTickers: (simbolos) => `https://www.okx.com/api/v5/market/ticker?instId=${simbolos[0]}`,
    normalizarTickers: (j) => Object.fromEntries(j.data.map((t) => [t.instId, { bid: Number(t.bidPx), ask: Number(t.askPx), ts: Number(t.ts) }])),
    urlFunding: (s) => `https://www.okx.com/api/v5/public/funding-rate?instId=${s}-SWAP`,
    normalizarFunding: (j) => { const d = j.data[0]; return { tasa8h: Number(d.fundingRate), precioMarca: NaN, precioIndice: NaN, proximoCobroTs: Number(d.nextFundingTime) }; },
  },
  coinbase: {
    // Libro:    GET https://api.exchange.coinbase.com/products/BTC-USDT/book?level=2
    // Tickers:  GET https://api.exchange.coinbase.com/products/BTC-USDT/ticker
    // Funding:  no aplica (Coinbase no ofrece perpetuos en spot público)
    simbolo: conGuion,
    urlLibro: (s) => `https://api.exchange.coinbase.com/products/${s}/book?level=2`,
    normalizarLibro: (j) => ({ bids: j.bids.map(numPar), asks: j.asks.map(numPar), ts: j.time ? Date.parse(j.time) : Date.now() }),
    urlTickers: (simbolos) => `https://api.exchange.coinbase.com/products/${simbolos[0]}/ticker`,
    normalizarTickers: (j, simbolos) => ({ [simbolos[0]]: { bid: Number(j.bid), ask: Number(j.ask), ts: Date.parse(j.time) } }),
  },
});

// Fuentes argentinas: precio USDT/ARS por plataforma y referencia dólar.
//   Cripto:  GET https://criptoya.com/api/usdt/ars/1000      (ask/bid y totalAsk/totalBid con comisiones)
//   Dólar:   GET https://criptoya.com/api/dolar               (oficial, mep, ccl, blue)
export const URL_ARS = Object.freeze({
  usdt: (monto) => `https://criptoya.com/api/usdt/ars/${monto}`,
  dolar: () => 'https://criptoya.com/api/dolar',
});

export class ErrorDeRed extends Error {
  constructor(msg, causa) { super(msg); this.name = 'ErrorDeRed'; this.causa = causa; }
}

/**
 * Crea el "mercado": una fachada única para pedir libros, tickers, funding y ARS
 * con la política de red/fixture ya resuelta.
 *
 * modo: 'auto' (red y si falla, fixture) · 'fixtures' (nunca sale a la red) · 'red' (sin fallback).
 */
export function crearMercado({
  modo = 'auto',
  fetchImpl = globalThis.fetch,
  timeoutMs = 4000,
  reintentos = 1,
  dirFixtures = DIR_FIXTURES,
  reintentarRedCadaMs = 60_000,
  alAvisar = () => {},
} = {}) {
  if (!['auto', 'fixtures', 'red'].includes(modo)) throw new Error(`modo inválido: ${modo}`);

  const estado = { modo, redCaida: modo === 'fixtures', motivo: modo === 'fixtures' ? 'modo fixtures pedido' : null, caidaDesde: null, avisado: false, pedidos: 0, fallos: 0, deFixture: 0 };

  function marcarCaida(err) {
    estado.fallos++;
    if (!estado.redCaida) {
      estado.redCaida = true;
      estado.caidaDesde = Date.now();
      estado.motivo = err?.message ?? String(err);
    }
    if (!estado.avisado) {
      estado.avisado = true;
      alAvisar(`sin salida de red (${estado.motivo}): corriendo con fixtures`);
    }
  }

  function redDisponible() {
    if (modo === 'fixtures') return false;
    if (modo === 'red') return true;
    if (!estado.redCaida) return true;
    // En auto, cada tanto reintentamos por si volvió la red.
    if (Date.now() - estado.caidaDesde > reintentarRedCadaMs) { estado.redCaida = false; return true; }
    return false;
  }

  async function traerJSON(url) {
    let ultimo;
    for (let intento = 0; intento <= reintentos; intento++) {
      try {
        estado.pedidos++;
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', 'user-agent': 'gsg-mesa-de-dinero/0.1 (solo lectura)' } });
        if (!res.ok) throw new ErrorDeRed(`HTTP ${res.status} en ${url}`);
        return await res.json();
      } catch (e) {
        ultimo = e instanceof ErrorDeRed ? e : new ErrorDeRed(`${e?.name ?? 'Error'}: ${e?.message ?? e}`, e);
      }
    }
    throw ultimo;
  }

  function leerFixture(nombre, { instante = 't0', opcional = false } = {}) {
    const candidatos = instante === 't1' ? [`${nombre}.t1.json`, `${nombre}.json`] : [`${nombre}.json`];
    for (const c of candidatos) {
      const ruta = join(dirFixtures, c);
      if (existsSync(ruta)) { estado.deFixture++; return JSON.parse(readFileSync(ruta, 'utf8')); }
    }
    if (opcional) return null;
    throw new Error(`fixture no encontrado: ${nombre} (${dirFixtures})`);
  }

  async function conFallback(nombreFixture, pedirRed, opciones = {}) {
    if (redDisponible()) {
      try {
        const dato = await pedirRed();
        return { ...dato, origen: 'red' };
      } catch (e) {
        if (modo === 'red') throw e;
        marcarCaida(e);
      }
    }
    const fx = leerFixture(nombreFixture, opciones);
    return fx ? { ...fx, origen: 'fixture' } : null;
  }

  return {
    exchanges: EXCHANGES,
    estado,
    estadoRed: () => ({ ...estado }),

    /** Libro normalizado de `exchange` para `par` ('BTC/USDT'). `instante` solo afecta fixtures ('t0'|'t1'). */
    async libroDeOrdenes(exchange, par, profundidad = 100, { instante = 't0' } = {}) {
      const c = CONECTORES[exchange];
      if (!c) throw new Error(`exchange desconocido: ${exchange}`);
      const s = c.simbolo(par);
      const bruto = await conFallback(`libros/${exchange}-${sinBarra(par)}`, async () => c.normalizarLibro(await traerJSON(c.urlLibro(s, profundidad))), { instante, opcional: true });
      if (!bruto) return null;
      return normalizarLibro({ ...bruto, fuente: exchange, par });
    },

    /** Tickers top-of-book para una lista de pares. */
    async tickers(exchange, pares) {
      const c = CONECTORES[exchange];
      if (!c) throw new Error(`exchange desconocido: ${exchange}`);
      const simbolos = pares.map(c.simbolo);
      if (redDisponible()) {
        try {
          const j = await traerJSON(c.urlTickers(simbolos));
          const porSimbolo = c.normalizarTickers(j, simbolos);
          const out = {};
          for (const par of pares) {
            const s = c.simbolo(par);
            const t = porSimbolo[s] ?? Object.values(porSimbolo)[0];
            if (t) out[par] = { ...t, origen: 'red' };
          }
          return out;
        } catch (e) {
          if (modo === 'red') throw e;
          marcarCaida(e);
        }
      }
      // Fixture: top-of-book de los libros.
      const out = {};
      for (const par of pares) {
        const l = await this.libroDeOrdenes(exchange, par, 1);
        if (l) out[par] = { bid: l.bids[0]?.[0], ask: l.asks[0]?.[0], ts: l.ts, origen: 'fixture' };
      }
      return out;
    },

    /** Funding del perpetuo USDT-M de `par` en `exchange` (null si el venue no lo tiene). */
    async funding(exchange, par) {
      const c = CONECTORES[exchange];
      if (!c?.urlFunding) return null;
      if (redDisponible()) {
        try { return { ...c.normalizarFunding(await traerJSON(c.urlFunding(c.simbolo(par)))), origen: 'red' }; }
        catch (e) { if (modo === 'red') throw e; marcarCaida(e); }
      }
      const fx = leerFixture('funding');
      const f = fx[exchange]?.[par];
      return f ? { ...f, origen: 'fixture' } : null;
    },

    /** Precios USDT/ARS por plataforma argentina + referencia dólar. */
    async ars(monto = 1000) {
      if (redDisponible()) {
        try {
          const [usdt, dolar] = await Promise.all([traerJSON(URL_ARS.usdt(monto)), traerJSON(URL_ARS.dolar())]);
          return { ts: Date.now(), monto, usdt, dolar: normalizarDolar(dolar), origen: 'red' };
        } catch (e) { if (modo === 'red') throw e; marcarCaida(e); }
      }
      return { ...leerFixture('ars'), origen: 'fixture' };
    },
  };
}

/** criptoya /api/dolar devuelve { oficial:{price|compra,venta}, mep:{al30:{ci:{price}}}, ... } — se aplana a números. */
export function normalizarDolar(d) {
  const n = (x) => (typeof x === 'number' ? x : Number(x?.price ?? x?.venta ?? x?.al30?.ci?.price ?? x?.al30?.['24hs']?.price ?? NaN));
  return {
    oficial: { compra: Number(d?.oficial?.compra ?? d?.oficial?.price ?? NaN), venta: Number(d?.oficial?.venta ?? d?.oficial?.price ?? NaN) },
    mep: n(d?.mep), ccl: n(d?.ccl),
    blue: { compra: Number(d?.blue?.compra ?? d?.blue?.price ?? NaN), venta: Number(d?.blue?.venta ?? d?.blue?.price ?? NaN) },
  };
}
