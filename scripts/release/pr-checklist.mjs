#!/usr/bin/env node
// ============================================================================
// CHECKLIST DEL GATE EN EL PR — lo corre el workflow `release` en cada pull_request.
// ============================================================================
//
// Verifica que la descripción del PR traiga el Gate de Excelencia con sus 4 bloques (SAP Fiori +
// ángulo argentino · Sello GSG · Arquitectura · Confiabilidad) y ninguna casilla sin tildar salvo
// las marcadas «N/A» con su porqué. Es la parte AUTOMATIZABLE del Gate: no reemplaza la auditoría
// (eso lo hace la célula de Auditoría GSG), sólo impide que un PR llegue sin haberla declarado.
//
// Fuente del cuerpo: el evento de GitHub (GITHUB_EVENT_PATH) o un archivo (`--archivo <ruta>`) para
// probarlo a mano. Exit 0 = OK · 1 = falta algo · 0 con aviso si no es un PR (no aplica).

import { appendFileSync, readFileSync } from "node:fs";
import { revisarChecklistPR } from "./lib.mjs";

function leerCuerpo() {
  const i = process.argv.indexOf("--archivo");
  if (i !== -1) return readFileSync(process.argv[i + 1], "utf8");
  const ruta = process.env.GITHUB_EVENT_PATH;
  if (!ruta) return null;
  const evento = JSON.parse(readFileSync(ruta, "utf8"));
  return evento.pull_request ? (evento.pull_request.body ?? "") : null;
}

const cuerpo = leerCuerpo();
if (cuerpo === null) {
  console.log("ℹ No es un pull request: el checklist del Gate no aplica.");
  process.exit(0);
}

const r = revisarChecklistPR(cuerpo);
const lineas = [];
if (r.ok) {
  lineas.push(`✔ Gate de Excelencia declarado: 4 bloques, ${r.tildadas} casillas tildadas, nada pendiente.`);
} else {
  lineas.push("✖ El PR no declara el Gate de Excelencia completo (CLAUDE.md: «Ningún cambio se integra sin el Gate»).");
  for (const f of r.faltan) lineas.push(`  · Falta ${f}.`);
  for (const s of r.sinTildar) lineas.push(`  · Sin tildar (y sin N/A): ${s}`);
  if (r.tildadas === 0 && r.faltan.length === 0) lineas.push("  · No hay ninguna casilla tildada.");
  lineas.push("", "Cómo se arregla: editá la descripción del PR con el checklist de docs/release/CHECKLIST-RELEASE.md §Gate.");
}
console.log(lineas.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Gate de Excelencia (checklist del PR)\n\n\`\`\`\n${lineas.join("\n")}\n\`\`\`\n`);
process.exit(r.ok ? 0 : 1);
