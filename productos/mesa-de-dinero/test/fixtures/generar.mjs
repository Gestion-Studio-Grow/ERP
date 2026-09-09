/**
 * Generador determinístico de fixtures de libros (GSG Mesa de Dinero).
 *
 * Los libros son SINTÉTICOS con forma realista (mid, spread propio, profundidad que
 * crece con la distancia al top) y con desvíos cross-exchange deliberados para que
 * la consola tenga qué falsar. Dos instantes: t0 (observación) y t1 (re-chequeo a
 * los N ms) — en t1 el desvío más jugoso (Kraken BTC) se cierra: así se mide la tasa
 * de fantasma sin salida de red.
 *
 * Correr: node test/fixtures/generar.mjs   (regenera los JSON de libros/)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(aqui, 'libros');
mkdirSync(salida, { recursive: true });

// LCG chiquito para ruido reproducible.
let semilla = 20260909;
const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

/** Un lado del libro: precio se aleja del top, cantidad crece con la distancia. */
function lado(top, tick, q0, signo, niveles = 25) {
  const out = [];
  for (let i = 0; i < niveles; i++) {
    const precio = top * (1 + signo * i * tick);
    const cantidad = q0 * (1 + 0.55 * i) * (0.7 + 0.6 * rnd());
    out.push([Number(precio.toFixed(6)), Number(cantidad.toFixed(6))]);
  }
  return out;
}

function libro({ bid, ask, tick, q0, ts }) {
  return { bids: lado(bid, tick, q0, -1), asks: lado(ask, tick, q0, +1), ts };
}

const T0 = 1789000000000; // ms; instante ficticio y fijo
const T1 = T0 + 500;

// { exchange: { par: { t0: {bid, ask, tick, q0}, t1: {...} } } }
const ESCENARIO = {
  binance: {
    'BTC/USDT': { t0: { bid: 104248.5, ask: 104249.0, tick: 0.00004, q0: 0.35 }, t1: { bid: 104250.0, ask: 104250.5, tick: 0.00004, q0: 0.35 } },
    'ETH/USDT': { t0: { bid: 3179.8, ask: 3180.1, tick: 0.00006, q0: 6 }, t1: { bid: 3179.9, ask: 3180.2, tick: 0.00006, q0: 6 } },
    'SOL/USDT': { t0: { bid: 148.02, ask: 148.04, tick: 0.00008, q0: 120 }, t1: { bid: 148.03, ask: 148.05, tick: 0.00008, q0: 120 } },
    'ETH/BTC':  { t0: { bid: 0.030495, ask: 0.030505, tick: 0.00008, q0: 4 }, t1: { bid: 0.030494, ask: 0.030504, tick: 0.00008, q0: 4 } },
  },
  kraken: {
    // Desvío "jugoso" en t0: bid 0,15 % arriba del ask de Binance, pero con 0,05 BTC en el top. En t1 se cierra.
    'BTC/USDT': { t0: { bid: 104405.0, ask: 104420.0, tick: 0.00012, q0: 0.05 }, t1: { bid: 104290.0, ask: 104310.0, tick: 0.00012, q0: 0.05 } },
    'ETH/USDT': { t0: { bid: 3183.0, ask: 3184.5, tick: 0.00015, q0: 1.2 }, t1: { bid: 3181.0, ask: 3182.5, tick: 0.00015, q0: 1.2 } },
    'SOL/USDT': { t0: { bid: 148.30, ask: 148.45, tick: 0.0002, q0: 30 }, t1: { bid: 148.12, ask: 148.25, tick: 0.0002, q0: 30 } },
  },
  bybit: {
    'BTC/USDT': { t0: { bid: 104240.0, ask: 104252.0, tick: 0.00006, q0: 0.2 }, t1: { bid: 104244.0, ask: 104254.0, tick: 0.00006, q0: 0.2 } },
    'ETH/USDT': { t0: { bid: 3178.0, ask: 3180.5, tick: 0.00008, q0: 3.5 }, t1: { bid: 3178.5, ask: 3180.6, tick: 0.00008, q0: 3.5 } },
    'SOL/USDT': { t0: { bid: 147.95, ask: 148.06, tick: 0.0001, q0: 80 }, t1: { bid: 147.98, ask: 148.07, tick: 0.0001, q0: 80 } },
    'ETH/BTC':  { t0: { bid: 0.030480, ask: 0.030520, tick: 0.0001, q0: 2 }, t1: { bid: 0.030482, ask: 0.030519, tick: 0.0001, q0: 2 } },
  },
  okx: {
    'BTC/USDT': { t0: { bid: 104255.0, ask: 104262.0, tick: 0.00005, q0: 0.25 }, t1: { bid: 104253.0, ask: 104261.0, tick: 0.00005, q0: 0.25 } },
    'ETH/USDT': { t0: { bid: 3181.5, ask: 3182.2, tick: 0.00007, q0: 4 }, t1: { bid: 3180.8, ask: 3181.6, tick: 0.00007, q0: 4 } },
    'SOL/USDT': { t0: { bid: 148.10, ask: 148.14, tick: 0.0001, q0: 90 }, t1: { bid: 148.06, ask: 148.11, tick: 0.0001, q0: 90 } },
    'ETH/BTC':  { t0: { bid: 0.030500, ask: 0.030512, tick: 0.0001, q0: 2.5 }, t1: { bid: 0.030498, ask: 0.030511, tick: 0.0001, q0: 2.5 } },
  },
  coinbase: {
    'BTC/USDT': { t0: { bid: 104300.0, ask: 104330.0, tick: 0.0001, q0: 0.08 }, t1: { bid: 104280.0, ask: 104315.0, tick: 0.0001, q0: 0.08 } },
    'ETH/USDT': { t0: { bid: 3185.0, ask: 3188.0, tick: 0.00012, q0: 1.5 }, t1: { bid: 3183.0, ask: 3186.5, tick: 0.00012, q0: 1.5 } },
  },
};

const indice = {};
for (const [exchange, pares] of Object.entries(ESCENARIO)) {
  for (const [par, inst] of Object.entries(pares)) {
    const nombre = `${exchange}-${par.replace('/', '')}`;
    writeFileSync(join(salida, `${nombre}.json`), JSON.stringify({ fuente: exchange, par, ...libro({ ...inst.t0, ts: T0 }) }, null, 0));
    writeFileSync(join(salida, `${nombre}.t1.json`), JSON.stringify({ fuente: exchange, par, ...libro({ ...inst.t1, ts: T1 }) }, null, 0));
    (indice[exchange] ??= []).push(par);
  }
}
writeFileSync(join(salida, 'indice.json'), JSON.stringify(indice, null, 2));
console.log('fixtures generados:', Object.values(indice).flat().length * 2, 'libros en', salida);
