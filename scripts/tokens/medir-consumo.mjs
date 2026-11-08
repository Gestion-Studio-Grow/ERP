#!/usr/bin/env node
// Mide el consumo REAL de tokens de una sesión de Claude Code y sus agentes, leyendo los transcripts .jsonl
// (o los .output de agentes en segundo plano, que tienen el mismo formato). Cero tokens: lo corre Node.
//
//   node scripts/tokens/medir-consumo.mjs <archivo|carpeta> [...]           tabla por transcript
//   node scripts/tokens/medir-consumo.mjs <...> --top 10                     sólo los 10 más caros
//   node scripts/tokens/medir-consumo.mjs <...> --presupuesto 300000000      sale con código 2 si se pasa
//   node scripts/tokens/medir-consumo.mjs <...> --max-inicial 40000 --max-llamadas 80   marca a los agentes que se pasan
//   node scripts/tokens/medir-consumo.mjs <...> --semana --tope-semanal-usd 200       últimos 7 días y % del tope en US$
//   node scripts/tokens/medir-consumo.mjs <...> --desde 2026-11-01                   sólo mensajes desde esa fecha
//   node scripts/tokens/medir-consumo.mjs <...> --json [--rol orquestadora]          una fila JSON por transcript (JSONL):
//        {sesion,rol,modelo,fecha,llamadas,entrada,cache_lectura,cache_escritura,salida,total,contexto_inicial,
//         contexto_max,usd,fuente}. Es la fila que va al pie de cada informe y al tablero de tokens.
//
// US$ = precio de lista de la API de Anthropic (equivalente: con un plan de claude.ai no se paga por token, pero el
// límite de uso se consume en la misma proporción). Escritura de caché a 2× la entrada (TTL de 1 hora); con
// --ttl-5m, a 1,25×. Búsquedas web a US$10 cada 1.000.
//
// Dedup por id de mensaje: el streaming escribe el mismo mensaje varias veces (sin dedup se cuenta 2-3x).
// Lo que importa leer: el % de «relectura» (cache_read). Si pasa del 90 %, el problema es contexto, no trabajo.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  // Imprime el encabezado de este archivo (uso y opciones) y sale.
  const fuente = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n");
  console.log(fuente.slice(1).filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? Number(args.splice(i, 2)[1]) : null; };
const top = opcion("--top");
const presupuesto = opcion("--presupuesto");
const maxInicial = opcion("--max-inicial");
const maxLlamadas = opcion("--max-llamadas");
const topeSemanalUsd = opcion("--tope-semanal-usd");
const bandera = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const ttl5m = bandera("--ttl-5m");
const comoJson = bandera("--json");
const iRol = args.indexOf("--rol");
const rol = iRol >= 0 ? args.splice(iRol, 2)[1] : null;
const iDesde = args.indexOf("--desde");
let desde = iDesde >= 0 ? new Date(args.splice(iDesde, 2)[1]) : null;
if (bandera("--semana")) desde = new Date(Date.now() - 7 * 864e5);

// US$ por millón de tokens: [entrada, lectura de caché, salida]. Fuente: tabla de modelos de la API (cacheada 2026-10-06).
const PRECIOS = [
  ["claude-fable-5", [10, 0.25, 50]], ["claude-mythos-5", [10, 0.25, 50]],
  ["claude-opus-5-5", [4, 0.2, 20]], ["claude-opus-5", [5, 0.5, 25]], ["claude-opus-4", [5, 0.5, 25]],
  ["claude-sonnet-5", [2, 0.2, 10]], ["claude-sonnet-4", [3, 0.3, 15]],
  ["claude-haiku-5", [0.1, 0.01, 0.5]], ["claude-haiku-4", [1, 0.1, 5]],
];
const precioDe = (modelo) => (PRECIOS.find(([pre]) => modelo?.startsWith(pre)) ?? [null, null])[1];
const sinPrecio = new Set();
const costo = (modelo, u) => {
  const p = precioDe(modelo);
  if (!p) { sinPrecio.add(modelo); return 0; }
  const [ent, lec, sal] = p;
  return ((u.input_tokens ?? 0) * ent + (u.cache_read_input_tokens ?? 0) * lec
    + (u.cache_creation_input_tokens ?? 0) * ent * (ttl5m ? 1.25 : 2) + (u.output_tokens ?? 0) * sal) / 1e6
    + (u.server_tool_use?.web_search_requests ?? 0) * 0.01;
};
const porModeloUsd = {};
const vistos = new Set(); // global: el mismo agente puede aparecer como agent-*.jsonl y como *.output
let totalUsd = 0;
if (!args.length) { console.error("Uso: medir-consumo.mjs <archivo|carpeta> [...] [--top N] [--presupuesto T]  (--help para todas las opciones)"); process.exit(1); }

const archivos = [];
const juntar = (p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) juntar(path.join(p, f));
  else if (/\.(jsonl|output)$/.test(p)) archivos.push(p);
};
args.forEach(juntar);

const CAMPOS = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"];
const total = Object.fromEntries(CAMPOS.map((c) => [c, 0]));
const porModelo = {};
const filas = [];

for (const f of archivos) {
  const suma = Object.fromEntries(CAMPOS.map((c) => [c, 0]));
  let llamadas = 0;
  let inicial = null;
  let usd = 0;
  let maxCtx = 0, sesion = null, fecha = null;
  const usoModelo = {};
  for (const linea of fs.readFileSync(f, "utf8").split("\n")) {
    if (!linea.includes('"usage"')) continue;
    let d; try { d = JSON.parse(linea); } catch { continue; }
    const m = d.message;
    if (d.type !== "assistant" || !m?.usage || vistos.has(m.id)) continue;
    if (desde && d.timestamp && new Date(d.timestamp) < desde) continue;
    vistos.add(m.id); llamadas++;
    const ctx = (m.usage.input_tokens ?? 0) + (m.usage.cache_read_input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0);
    if (inicial === null) inicial = ctx;
    if (ctx > maxCtx) maxCtx = ctx;
    sesion ??= d.sessionId ?? null; fecha ??= d.timestamp ?? null;
    const sub = CAMPOS.reduce((s, c) => s + (m.usage[c] ?? 0), 0);
    CAMPOS.forEach((c) => { suma[c] += m.usage[c] ?? 0; total[c] += m.usage[c] ?? 0; });
    if (m.model && m.model !== "<synthetic>") {
      const c = costo(m.model, m.usage);
      porModelo[m.model] = (porModelo[m.model] ?? 0) + sub;
      usoModelo[m.model] = (usoModelo[m.model] ?? 0) + 1;
      porModeloUsd[m.model] = (porModeloUsd[m.model] ?? 0) + c;
      usd += c; totalUsd += c;
    }
  }
  const t = CAMPOS.reduce((s, c) => s + suma[c], 0);
  if (llamadas) filas.push({ archivo: path.basename(f), llamadas, inicial, total: t, relectura: suma.cache_read_input_tokens, salida: suma.output_tokens, usd,
    json: { sesion: sesion ?? path.basename(f).replace(/\.(jsonl|output)$/, ""), rol, modelo: Object.entries(usoModelo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      fecha: fecha?.slice(0, 10) ?? null, llamadas, entrada: suma.input_tokens, cache_lectura: suma.cache_read_input_tokens,
      cache_escritura: suma.cache_creation_input_tokens, salida: suma.output_tokens, total: t, contexto_inicial: inicial,
      contexto_max: maxCtx, usd: Math.round(usd * 100) / 100, fuente: path.basename(f) } });
}
if (comoJson) {
  for (const r of filas.sort((a, b) => b.total - a.total)) console.log(JSON.stringify(r.json));
  if (sinPrecio.size) console.error(`Sin precio (no suman US$): ${[...sinPrecio].join(", ")}`);
  process.exit(0);
}

const M = (n) => (n / 1e6).toFixed(1).padStart(8) + " M";
const U = (n) => ("US$ " + n.toFixed(2)).padStart(12);
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "0") + " %";
filas.sort((a, b) => b.total - a.total);
const T = CAMPOS.reduce((s, c) => s + total[c], 0);

console.log(`\nTranscripts: ${filas.length}  ·  total ${M(T).trim()}  ·  ${U(totalUsd).trim()}  ·  relectura ${pct(total.cache_read_input_tokens, T)}  ·  salida ${pct(total.output_tokens, T)}${desde ? `  ·  desde ${desde.toISOString().slice(0, 10)}` : ""}`);
if (topeSemanalUsd) console.log(`Tope semanal: ${U(totalUsd).trim()} de US$ ${topeSemanalUsd} = ${pct(totalUsd, topeSemanalUsd)}`);
for (const [m, n] of Object.entries(porModelo).sort((a, b) => b[1] - a[1])) console.log(`  ${m.padEnd(22)} ${M(n)} ${U(porModeloUsd[m] ?? 0)}  ${pct(porModeloUsd[m] ?? 0, totalUsd)} del costo`);
if (sinPrecio.size) console.error(`Sin precio (no suman US$): ${[...sinPrecio].join(", ")}`);
console.log("\n   total          US$  llamadas  contexto medio  contexto inicial  transcript");
for (const r of (top ? filas.slice(0, top) : filas)) {
  console.log(`${M(r.total)} ${U(r.usd)} ${String(r.llamadas).padStart(8)} ${M(r.total / r.llamadas)} ${(Math.round(r.inicial / 1000) + " k").padStart(16)}   ${r.archivo}`);
}
const mediana = (xs) => { const o = [...xs].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : 0; };
console.log(`\nMediana: contexto inicial ${Math.round(mediana(filas.map((r) => r.inicial)) / 1000)} k · llamadas por agente ${mediana(filas.map((r) => r.llamadas))}`);
let excedido = false;
if (maxInicial) for (const r of filas.filter((r) => r.inicial > maxInicial)) { console.error(`CONTEXTO INICIAL ALTO: ${Math.round(r.inicial / 1000)} k > ${Math.round(maxInicial / 1000)} k  ${r.archivo}`); excedido = true; }
if (maxLlamadas) for (const r of filas.filter((r) => r.llamadas > maxLlamadas)) { console.error(`DEMASIADAS LLAMADAS: ${r.llamadas} > ${maxLlamadas}  ${r.archivo}`); excedido = true; }
if (excedido && !(presupuesto && T > presupuesto)) process.exitCode = 2;
if (presupuesto && T > presupuesto) {
  console.error(`\nSE PASÓ DEL PRESUPUESTO: ${M(T).trim()} > ${M(presupuesto).trim()}`);
  process.exit(2);
}
