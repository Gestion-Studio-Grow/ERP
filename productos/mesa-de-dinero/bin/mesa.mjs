#!/usr/bin/env node
/**
 * mesa — CLI de la Mesa de Dinero (GSG). Consola de falsación, modo papel.
 *
 *   node bin/mesa.mjs scan     [--nocional 100,1000,10000] [--par BTC/USDT,ETH/USDT] [--exchange binance,kraken]
 *                              [--estrategia cex-cex,funding] [--recheck 500] [--fixtures | --red] [--sin-registro] [--json]
 *   node bin/mesa.mjs watch    --intervalo 10   (segundos; mismas opciones que scan)
 *   node bin/mesa.mjs serve    --puerto 8787
 *   node bin/mesa.mjs reporte  [--json]
 */
import { crearMercado } from '../src/exchanges.mjs';
import { correrPasada, crearAcumulador, ESTRATEGIAS, PARES_DEFAULT, NOCIONALES_DEFAULT } from '../src/motor.mjs';
import { crearRegistro } from '../src/registro.mjs';
import { resumenArs } from '../src/estrategias/ars.mjs';
import { EMOJI_VEREDICTO, COSTOS } from '../src/costos.mjs';
import { pct, usd, num, dias, tabla } from '../src/formato.mjs';
import { MODO } from '../src/ejecucion.mjs';

const args = parsear(process.argv.slice(2));
const comando = args._[0] ?? 'ayuda';

const lista = (v, def) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : def);
const opciones = {
  nocionales: lista(args.nocional, NOCIONALES_DEFAULT).map(Number),
  pares: lista(args.par, PARES_DEFAULT),
  exchanges: lista(args.exchange, undefined),
  estrategias: lista(args.estrategia, Object.keys(ESTRATEGIAS)),
  delayRecheckMs: args.recheck !== undefined ? Number(args.recheck) : 500,
};
const modo = args.fixtures ? 'fixtures' : args.red ? 'red' : 'auto';

const say = (...x) => console.log(...x);
const avisos = [];
const mercado = crearMercado({ modo, alAvisar: (m) => { avisos.push(m); if (!args.json) console.error(`⚠️  ${m}`); } });
const registro = args['sin-registro'] ? null : crearRegistro(args.registro);

try {
  switch (comando) {
    case 'scan': await scan(); break;
    case 'watch': await watch(); break;
    case 'serve': await serve(); break;
    case 'reporte': reporte(); break;
    default: ayuda();
  }
} catch (e) {
  console.error(`💥 ${e.message}`);
  process.exit(1);
}

async function scan(pasada = 1) {
  const r = await correrPasada(mercado, { ...opciones, exchanges: opciones.exchanges ?? mercado.exchanges, registro, pasada });
  if (args.json) { say(JSON.stringify(r, null, 2)); return r; }
  imprimirPasada(r);
  return r;
}

async function watch() {
  const intervalo = Number(args.intervalo ?? 10) * 1000;
  const acum = crearAcumulador();
  let pasada = 0;
  say(`👀 watch cada ${intervalo / 1000} s (Ctrl+C para cortar). Modo ${MODO}: no opera, solo mide.`);
  for (;;) {
    pasada++;
    const r = await correrPasada(mercado, { ...opciones, exchanges: opciones.exchanges ?? mercado.exchanges, registro, pasada });
    acum.sumar(r);
    imprimirPasada(r, { compacto: true });
    const e = acum.estadisticas();
    say(`   acumulado: ${e.pasadas} pasadas · ${e.brutas} brutas · supervivencia ${pct(e.tasaSupervivencia, 1)} · fantasma ${pct(e.tasaFantasma, 1)}\n`);
    await new Promise((res) => setTimeout(res, intervalo));
  }
}

async function serve() {
  const { iniciarServidor } = await import('../src/servidor.mjs');
  const puerto = Number(args.puerto ?? 8787);
  const srv = await iniciarServidor({ puerto, mercado, registro, opciones });
  say(`🖥️  Consola web en http://localhost:${srv.puerto}  (modo ${MODO}, no opera). Ctrl+C para cortar.`);
}

function reporte() {
  if (!registro) throw new Error('reporte necesita el registro (sacá --sin-registro)');
  const e = registro.estadisticas();
  if (args.json) { say(JSON.stringify(e, null, 2)); return; }
  say(`\n📓 Reporte acumulado — ${registro.ruta}`);
  if (!e.brutas) { say('   Todavía no hay observaciones. Corré `scan` o `watch` primero.'); return; }
  say(`   ${e.pasadas} pasadas · desde ${fecha(e.desde)} hasta ${fecha(e.hasta)}\n`);
  imprimirTitulares(e);
  say('');
  say(tabla(Object.entries(e.porEstrategia).map(([k, v]) => ({ estrategia: k, ...v })), [
    { titulo: 'Estrategia', clave: 'estrategia' },
    { titulo: 'Brutas', clave: 'brutas', der: true },
    { titulo: 'Sobreviven', clave: 'netasPositivas', der: true },
    { titulo: 'Supervivencia', clave: 'tasaSupervivencia', der: true, f: (v) => pct(v, 1) },
    { titulo: 'Fantasma', clave: 'tasaFantasma', der: true, f: (v) => pct(v, 1) },
    { titulo: 'Bruto prom.', clave: 'brutoPromedio', der: true, f: (v) => pct(v) },
    { titulo: 'Piso costo prom.', clave: 'pisoCostoPromedio', der: true, f: (v) => pct(v) },
    { titulo: 'Mejor neto', clave: 'mejorNeto', der: true, f: (v) => pct(v) },
  ]));
  say('');
}

function imprimirTitulares(e) {
  say(`   🎯 Tasa de supervivencia : ${pct(e.tasaSupervivencia, 1)}   (${e.netasPositivas} netas positivas de ${e.brutas} brutas observadas)`);
  say(`   👻 Tasa de fantasma      : ${Number.isFinite(e.tasaFantasma) ? pct(e.tasaFantasma, 1) : 's/d (ninguna efímera —spot/triangular— quedó viva para re-chequear)'}${e.recheckeadas ? `   (${e.fantasmas} de ${e.recheckeadas} re-chequeadas)` : ''}`);
  say(`   🧱 Piso de costo promedio: ${pct(e.pisoCostoPromedio)}   vs   spread bruto promedio: ${pct(e.brutoPromedio)}`);
}

function imprimirPasada(r, { compacto = false } = {}) {
  const origen = r.red.redCaida ? `fixtures (${r.red.motivo})` : 'red';
  say(`\n🧪 Pasada ${r.pasada} · ${fecha(r.ts)} · ${r.duracionMs} ms · datos: ${origen} · modo ${MODO} (no opera)`);
  say(`   exchanges: ${r.contexto.exchanges.join(', ')} · pares: ${r.contexto.pares.join(', ')} · nocionales: ${r.contexto.nocionales.map((n) => usd(n, 0)).join(', ')}`);
  say(`   combinaciones evaluadas: ${r.estadisticas.combinacionesEvaluadas} · oportunidades brutas (bruto > 0): ${r.estadisticas.brutas}\n`);
  imprimirTitulares(r.estadisticas);
  say('');

  const filas = compacto ? r.oportunidades.slice(0, 8) : r.oportunidades.slice(0, 25);
  if (!filas.length) { say('   Ni una sola oportunidad bruta positiva. Eso también es un dato.\n'); return; }
  say(tabla(filas, [
    { titulo: '', clave: 'veredicto', f: (v) => EMOJI_VEREDICTO[v] ?? '' },
    { titulo: 'Estrategia', clave: 'estrategia' },
    { titulo: 'Par', clave: 'par' },
    { titulo: 'Ruta', clave: 'ruta' },
    { titulo: 'Nocional', clave: 'nocional', der: true, f: (v) => usd(v, 0) },
    { titulo: 'Bruto', clave: 'bruto', der: true, f: (v) => pct(v) },
    { titulo: 'Comis.', clave: 'costos', der: true, f: (c) => pct(c.comisiones) },
    { titulo: 'Slip.', clave: 'costos', der: true, f: (c) => pct(c.slippage) },
    { titulo: 'Retiro', clave: 'costos', der: true, f: (c) => pct(c.retiro) },
    { titulo: 'Riesgo', clave: 'costos', der: true, f: (c) => pct(c.riesgoTraslado) },
    { titulo: 'Imp.', clave: 'costos', der: true, f: (c) => pct(c.impuesto) },
    { titulo: 'Neto', clave: 'neto', der: true, f: (v) => pct(v) },
    { titulo: 'Neto USD', clave: 'netoUSD', der: true, f: (v) => num(v) },
    { titulo: 'Re-chequeo', clave: 'recheck', f: (rc) => (!rc?.hecho ? (rc?.aplica === false ? 'n/a (vive horas/días)' : '—') : rc.fantasma ? `👻 fantasma a ${rc.delayMs} ms` : `sigue viva (${pct(rc.neto)})`) },
  ]));
  if (r.oportunidades.length > filas.length) say(`   … y ${r.oportunidades.length - filas.length} más (todas en el registro JSONL).`);

  if (compacto) return;

  // Funding: break-even.
  const fund = r.oportunidades.filter((o) => o.estrategia === 'funding' && o.nocional === r.contexto.nocionales[0]);
  if (fund.length) {
    say('\n💸 Cash & carry — período de break-even (round-trip ÷ funding diario):');
    say(tabla(fund, [
      { titulo: 'Venue', clave: 'ruta', f: (v) => v.split(':')[0] },
      { titulo: 'Par', clave: 'par' },
      { titulo: 'Funding 8h', clave: 'detalle', der: true, f: (d) => pct(d.tasa8h, 4) },
      { titulo: 'Anualizado', clave: 'detalle', der: true, f: (d) => pct(d.fundingAnualizado, 1) },
      { titulo: 'Round-trip', clave: 'detalle', der: true, f: (d) => pct(d.roundTrip) },
      { titulo: 'Break-even', clave: 'detalle', der: true, f: (d) => dias(d.breakEvenDias) },
      { titulo: `Neto a ${fund[0].detalle.horizonteDias} d`, clave: 'neto', der: true, f: (v) => pct(v) },
    ]));
    say('   ⚠️  el funding no es fijo: si se da vuelta, la posición paga en vez de cobrar.');
  }

  // Curva de derrumbe para el cruce spot más TENTADOR (mayor bruto top-of-book).
  const mejorSpot = r.oportunidades.filter((o) => o.estrategia === 'cex-cex').sort((a, b) => b.spreadTop - a.spreadTop)[0];
  if (mejorSpot) say(curvaTexto(mejorSpot, r));

  // ARS.
  if (r.ctx?.ars) say(arsTexto(r.ctx.ars));
  say('');
}

/** Curva de derrumbe (top-of-book vs ejecutable vs piso de costo) del cruce spot más tentador. */
function curvaTexto(op, r) {
  const cab = `\n📉 Derrumbe del spread por profundidad — cruce más tentador: ${op.par} ${op.ruta} (top-of-book vs ejecutable):\n` +
    `   spread top ${pct(op.spreadTop)} → ejecutable a ${usd(op.nocional, 0)}: ${pct(op.spreadEjecutable)} → piso de costo ${pct(op.costos.totalConImpuesto)} → neto ${pct(op.neto)}`;
  const c = r.curvas?.find((x) => x.par === op.par && x.ruta === op.ruta) ?? r.curvas?.[0];
  if (!c) return cab;
  return `${cab}\n` + tabla(c.puntos, [
    { titulo: 'Nocional', clave: 'nocional', der: true, f: (v) => usd(v, 0) },
    { titulo: 'Spread top', clave: 'spreadTop', der: true, f: (v) => pct(v) },
    { titulo: 'Ejecutable', clave: 'spreadEjecutable', der: true, f: (v) => pct(v) },
    { titulo: 'Slippage', clave: 'slippage', der: true, f: (v) => pct(v) },
    { titulo: 'Piso de costo', clave: 'pisoCosto', der: true, f: (v) => pct(v) },
    { titulo: 'Libro alcanza', clave: 'completo', f: (v) => (v ? 'sí' : 'no') },
  ]).replace(/^/gm, '   ');
}

function arsTexto(ars) {
  const s = resumenArs(ars);
  if (!s) return '';
  const cab = `\n🇦🇷 USDT/ARS por plataforma (${ars.origen}) — publicado vs con comisiones · dólar oficial BNA venta ${num(s.oficialVenta)}:\n` +
    `   premium del mejor bid USDT vs oficial: ${pct(s.premiumVsOficial, 2)}   (si es ≈ 0, el "rulo" no existe; el brief dice ≈ 0, la foto del 08/09 dijo +2,6 %: por eso se mide)\n`;
  return cab + tabla(s.filas, [
    { titulo: 'Plataforma', clave: 'plataforma' },
    { titulo: 'Compra publ.', clave: 'ask', der: true, f: (v) => num(v) },
    { titulo: 'Compra total', clave: 'totalAsk', der: true, f: (v) => num(v) },
    { titulo: 'Venta publ.', clave: 'bid', der: true, f: (v) => num(v) },
    { titulo: 'Venta total', clave: 'totalBid', der: true, f: (v) => num(v) },
    { titulo: 'Spread efectivo', clave: 'spreadEfectivo', der: true, f: (v) => pct(v, 2) },
  ]).replace(/^/gm, '   ');
}

function fecha(ts) { return ts ? new Date(ts).toLocaleString('es-AR') : '—'; }

function ayuda() {
  say(`
🏦 Mesa de Dinero — consola de falsación (Gestión Studio Grow). Modo ${MODO}: NO opera, mide.

  scan      una pasada: observa, aplica costos, re-chequea y registra
  watch     continuo  (--intervalo 10 segundos)
  serve     consola web (--puerto 8787)
  reporte   estadística acumulada del JSONL

Opciones: --nocional 100,1000,10000 · --par BTC/USDT,ETH/USDT · --exchange binance,kraken
          --estrategia cex-cex,triangular,funding,ars · --recheck 500 (ms) · --fixtures · --red
          --sin-registro · --registro <ruta.jsonl> · --json

Sin salida de red, corre con fixtures y lo avisa. Umbral marginal: ${pct(COSTOS.umbralMarginal)}.
`);
}

function parsear(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith('--')) { out[k] = v; i++; } else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
