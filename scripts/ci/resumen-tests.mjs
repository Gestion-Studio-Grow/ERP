#!/usr/bin/env node
// Resumen de `npm test` para CI: lista los tests fallidos (y los salteados) con su archivo:línea.
//
// Por qué: el log del job «tests (npm test)» es largo y llega truncado a quien lo lee de lejos
// (get_job_logs devuelve la cola), y el artefacto no siempre se puede bajar. Este paso corre AL
// FINAL del job e imprime sólo lo que importa, también en $GITHUB_STEP_SUMMARY.
//
// Uso: node scripts/ci/resumen-tests.mjs npm-test.log
// Lee el reporte TAP de `node --test` (sin terminal). Nunca falla el job: sólo informa.

import { appendFileSync, existsSync, readFileSync } from "node:fs";

/**
 * Del texto TAP, los tests que fallaron o se saltearon, con la ubicación que trae su bloque YAML.
 * Las suites (`type: 'suite'`) que fallan sólo por sus hijos no se repiten.
 * @param {string} tap
 * @returns {{ fallidos: {nombre: string, donde: string, motivo: string}[], salteados: {nombre: string, donde: string, motivo: string}[], totales: Record<string, string> }}
 */
export function resumirTap(tap) {
  const lineas = tap.split(/\r?\n/);
  const fallidos = [];
  const salteados = [];
  const totales = {};
  for (let i = 0; i < lineas.length; i++) {
    const total = /^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(lineas[i]);
    if (total) totales[total[1]] = total[2];
    const m = /^(\s*)(not ok|ok) \d+ - (.*?)(?: # SKIP(?: (.*))?)?$/.exec(lineas[i]);
    if (!m) continue;
    const [, sangria, estado, nombre] = m;
    const skip = / # SKIP/.test(lineas[i]);
    if (estado === "ok" && !skip) continue;
    // El bloque YAML del test sigue con más sangría hasta «...».
    let donde = "";
    let ubicacion = "";
    let tipo = "test";
    let motivo = skip ? (m[4] ?? "").trim() : "";
    for (let j = i + 1; j < lineas.length && j < i + 80; j++) {
      const l = lineas[j];
      if (l.trim() === "..." && l.startsWith(sangria)) break;
      // La línea de `location` sale corrida por la transformación de tsx: la del stack es la real.
      const pila = /(\/\S*?\.test\.[mc]?[jt]s:\d+):\d+/.exec(l);
      if (pila && !donde && !/^\s*location:/.test(l)) donde = pila[1];
      const loc = /^\s*location: '(.*):\d+'$/.exec(l);
      if (loc) ubicacion = loc[1];
      const t = /^\s*type: '(\w+)'$/.exec(l);
      if (t) tipo = t[1];
      const err = /^\s*error: (.*)$/.exec(l);
      if (err && !motivo) {
        // `error: |-` deja el mensaje en la línea siguiente.
        motivo = /^[|>]-?$/.test(err[1].trim()) ? (lineas[j + 1] ?? "").trim() : err[1].replace(/^'|'$/g, "");
      }
      if (/^\s*(expected|actual): /.test(l) && motivo.length < 200) motivo += ` · ${l.trim()}`;
    }
    donde = (donde || ubicacion).replace(/^.*?\/(src|scripts|prisma)\//, "$1/");
    const fila = { nombre: nombre.trim(), donde, motivo: motivo.slice(0, 240) };
    if (skip) salteados.push(fila);
    else if (!(tipo === "suite" && /subtests? failed/i.test(motivo))) fallidos.push(fila);
  }
  return { fallidos, salteados, totales };
}

function formatear({ fallidos, salteados, totales }) {
  const out = [];
  out.push(`## npm test — ${totales.pass ?? "?"} ok · ${totales.fail ?? "?"} fallidos · ${totales.skipped ?? "?"} salteados · ${totales.cancelled ?? "0"} cancelados`);
  out.push("");
  out.push(fallidos.length ? `### Fallidos (${fallidos.length})` : "### Fallidos: ninguno");
  for (const f of fallidos) out.push(`- ✗ ${f.nombre}${f.donde ? ` — \`${f.donde}\`` : ""}${f.motivo ? `\n  - ${f.motivo}` : ""}`);
  if (salteados.length) {
    out.push("", `### Salteados (${salteados.length})`);
    for (const s of salteados) out.push(`- ⤼ ${s.nombre}${s.donde ? ` — \`${s.donde}\`` : ""}${s.motivo ? ` — ${s.motivo}` : ""}`);
  }
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const archivo = process.argv[2] ?? "npm-test.log";
  if (!existsSync(archivo)) {
    console.log(`resumen-tests: no está ${archivo}`);
    process.exit(0);
  }
  const texto = formatear(resumirTap(readFileSync(archivo, "utf8")));
  console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + "\n");
}
