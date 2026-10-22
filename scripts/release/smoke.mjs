#!/usr/bin/env node
// ============================================================================
// SMOKE POST-DEPLOY — `npm run release:smoke -- <url> [--commit <sha>] [--modo preview]`
// ============================================================================
//
// Cinco pedidos contra un deploy ya publicado, sin login y sin escribir nada:
//   1. GET /api/health   → vivo, qué commit corre, cómo quedó configurado ARCA (sin base).
//   2. GET /api/ready    → la base responde + semáforo del motor ARCA (agregado, sin negocios).
//   3. GET /facturita    → la entrada pública de Facturita abre.
//   4. GET /contador     → SIN sesión tiene que mandar al login (si responde 200, el portón está roto).
//   5. GET /admin/login  → el login de los negocios abre.
//
// Niveles: ok · aviso (no frena: ej. motor ARCA en rojo, que tiene su runbook) · falla (exit 1).
// `--modo preview`: la protección de Vercel y el «preview bloqueado» son avisos, no fallas.
// `--commit <sha>`: exige que /api/health diga ese commit (que no quedó sirviendo el anterior).
//
// No manda cookies ni credenciales; sigue CERO redirecciones (las evalúa). Timeout de 15 s por
// pedido. Pensado para correr a mano, desde preparar.mjs o desde el workflow `release` cuando
// Vercel avisa que terminó un deploy. Escribe un resumen en GITHUB_STEP_SUMMARY si existe.

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { codigoSalidaSmoke, evaluarSmoke } from "./lib.mjs";

export const CHEQUEOS = [
  { id: "health", ruta: "/api/health" },
  { id: "ready", ruta: "/api/ready" },
  { id: "facturita", ruta: "/facturita" },
  { id: "contador", ruta: "/contador" },
  { id: "login", ruta: "/admin/login" },
];

async function pedir(base, ruta) {
  const url = new URL(ruta, base);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "gsg-smoke/1" } });
    const texto = await res.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      json = undefined;
    }
    return { status: res.status, location: res.headers.get("location"), json, texto: texto.slice(0, 2000) };
  } catch (err) {
    return { status: 0, texto: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}

/** Corre el smoke y devuelve los resultados (no termina el proceso). */
export async function correrSmoke(base, esperado = {}) {
  const resultados = [];
  for (const c of CHEQUEOS) {
    const r = await pedir(base, c.ruta);
    const ev = r.status === 0 ? { nivel: "falla", texto: `no responde (${r.texto})` } : evaluarSmoke(c.id, r, esperado);
    resultados.push({ chequeo: c.id, ruta: c.ruta, status: r.status, ...ev });
  }
  return resultados;
}

export function renderSmoke(base, resultados) {
  const icono = { ok: "✔", aviso: "⚠", falla: "✖" };
  const lineas = [`Smoke contra ${base}`];
  for (const r of resultados) lineas.push(`${icono[r.nivel]} ${r.ruta.padEnd(13)} ${String(r.status).padStart(3)}  ${r.texto}`);
  const fallas = resultados.filter((r) => r.nivel === "falla").length;
  const avisos = resultados.filter((r) => r.nivel === "aviso").length;
  lineas.push(fallas ? `\n✖ ${fallas} falla(s). Ver docs/runbooks/facturacion/rollback.md si el deploy es de producción.` : `\n✔ Sin fallas${avisos ? ` (${avisos} aviso(s))` : ""}.`);
  return lineas.join("\n");
}

async function main() {
  const base = process.argv.slice(2).find((a) => /^https?:\/\//.test(a));
  if (!base) {
    console.error("Uso: node scripts/release/smoke.mjs <https://url-del-deploy> [--commit <sha>] [--modo preview]");
    process.exit(2);
  }
  const arg = (n) => {
    const i = process.argv.indexOf(n);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const resultados = await correrSmoke(base, { commit: arg("--commit"), modo: arg("--modo") === "preview" ? "preview" : "produccion" });
  const texto = renderSmoke(base, resultados);
  console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Smoke post-deploy\n\n\`\`\`\n${texto}\n\`\`\`\n`);
  process.exit(codigoSalidaSmoke(resultados));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
