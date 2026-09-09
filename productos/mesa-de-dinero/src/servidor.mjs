/**
 * Servidor de la consola web — node:http puro, cero dependencias.
 *
 * Rutas:
 *   GET  /                 consola (src/consola.html)
 *   GET  /api/estado       última pasada (o null) + estado de red + modo
 *   POST /api/scan         corre una pasada (body JSON opcional: { nocionales, pares, estrategias, delayRecheckMs })
 *   GET  /api/reporte      estadística acumulada del JSONL
 *   GET  /api/curva?par=BTC/USDT&compra=binance&venta=kraken   curva de derrumbe con los libros de la última pasada
 *
 * SOLO LECTURA de mercado. No hay ninguna ruta que opere.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { correrPasada, PARES_DEFAULT, NOCIONALES_DEFAULT, ESTRATEGIAS } from './motor.mjs';
import { curvaSpread } from './profundidad.mjs';
import { resumenArs } from './estrategias/ars.mjs';
import { COSTOS } from './costos.mjs';
import { MODO } from './ejecucion.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

export function crearManejador({ mercado, registro = null, opciones = {} }) {
  let ultima = null;
  let pasada = 0;
  let corriendo = null;

  const html = () => readFileSync(join(AQUI, 'consola.html'), 'utf8');

  const json = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  const leerBody = (req) => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64_000) { reject(new Error('body demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });

  const serializar = (r) => r && ({ ...r, ars: resumenArs(r.ctx?.ars), modo: MODO, umbralMarginal: COSTOS.umbralMarginal });

  return async function manejar(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(html());
      }
      if (req.method === 'GET' && url.pathname === '/api/estado') {
        return json(res, 200, { modo: MODO, red: mercado.estadoRed(), ultima: serializar(ultima), defaults: { pares: PARES_DEFAULT, nocionales: NOCIONALES_DEFAULT, estrategias: Object.keys(ESTRATEGIAS), exchanges: mercado.exchanges } });
      }
      if (req.method === 'POST' && url.pathname === '/api/scan') {
        if (corriendo) { await corriendo; }
        const body = await leerBody(req);
        const lista = (v, def) => (Array.isArray(v) && v.length ? v : def);
        pasada++;
        corriendo = correrPasada(mercado, {
          ...opciones,
          exchanges: lista(body.exchanges, opciones.exchanges ?? mercado.exchanges),
          pares: lista(body.pares, opciones.pares ?? PARES_DEFAULT),
          nocionales: lista(body.nocionales?.map(Number).filter((n) => n > 0), opciones.nocionales ?? NOCIONALES_DEFAULT),
          estrategias: lista(body.estrategias, opciones.estrategias ?? Object.keys(ESTRATEGIAS)),
          delayRecheckMs: Number.isFinite(Number(body.delayRecheckMs)) ? Math.min(Number(body.delayRecheckMs), 10_000) : (opciones.delayRecheckMs ?? 500),
          registro, pasada,
        }).finally(() => { corriendo = null; });
        ultima = await corriendo;
        return json(res, 200, serializar(ultima));
      }
      if (req.method === 'GET' && url.pathname === '/api/reporte') {
        return json(res, 200, registro ? registro.estadisticas() : { brutas: 0, sinRegistro: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/curva') {
        if (!ultima?.ctx) return json(res, 409, { error: 'todavía no hay una pasada; corré una primero' });
        const par = url.searchParams.get('par'), compra = url.searchParams.get('compra'), venta = url.searchParams.get('venta');
        const la = ultima.ctx.libros[compra]?.[par], lb = ultima.ctx.libros[venta]?.[par];
        if (!la || !lb) return json(res, 404, { error: `no tengo libros de ${par} para ${compra} → ${venta}` });
        return json(res, 200, { par, compra, venta, puntos: curvaSpread(la, lb) });
      }
      if (url.pathname.startsWith('/api/operar')) {
        return json(res, 403, { error: 'MODO PAPEL: la Mesa de Dinero no opera. Operar requiere el OK explícito del dueño (regla GSG).' });
      }
      json(res, 404, { error: 'ruta desconocida' });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  };
}

export function iniciarServidor({ puerto = 8787, host = '127.0.0.1', ...resto }) {
  const servidor = createServer(crearManejador(resto));
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, host, () => resolve({ servidor, puerto: servidor.address().port, cerrar: () => new Promise((r) => servidor.close(r)) }));
  });
}
