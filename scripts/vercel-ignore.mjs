#!/usr/bin/env node
// Paso "Ignored Build Step" de Vercel: decide si un push se construye o no.
//   exit 0 = NO construir (Vercel cancela el build) · exit 1 = construir.
//
// Por qué existe: Vercel construye en CADA push. Un push a una rama gasta un build de vista previa
// que hoy no sirve para QA (queda bloqueada porque apunta a la base de producción, ver
// scripts/vercel-build.mjs), y un push a main ES un despliegue a producción aunque sólo cambie un .md.
//
// Regla:
//   · Rama que no es main  → no construye, salvo que el mensaje del commit traiga [preview].
//   · main                 → construye SIEMPRE, salvo que el mensaje traiga [sin-deploy] Y todo lo que
//                            cambió sea documentación o configuración de .claude/ (nada que la app use).
//
// Ante cualquier duda o error se construye: es lo que pasaba antes de que existiera este control.
// SÓLO tiene efecto si el proyecto de Vercel lo tiene cargado en Settings → Git → Ignored Build Step
// como `node scripts/vercel-ignore.mjs`. Sin eso, este archivo no hace nada.
import { execFileSync } from "node:child_process";

const construir = (motivo) => {
  console.log(`[vercel-ignore] CONSTRUYE: ${motivo}`);
  process.exit(1);
};
const saltear = (motivo) => {
  console.log(`[vercel-ignore] NO construye: ${motivo}`);
  process.exit(0);
};

// Lo que la app no usa ni en build ni en runtime. Un .md sólo cuenta si está en la raíz:
// uno dentro de src/ o public/ puede ser contenido de la app.
const SUELTOS = new Set(["skills-lock.json", ".mcp.json", ".gitignore", "scripts/vercel-ignore.mjs"]);
const esInocuo = (f) =>
  f.startsWith(".claude/") ||
  f.startsWith("docs/") ||
  f.startsWith("brain/") ||
  (!f.includes("/") && /\.md$/i.test(f)) ||
  SUELTOS.has(f);

try {
  const rama = process.env.VERCEL_GIT_COMMIT_REF || "";
  const mensaje = process.env.VERCEL_GIT_COMMIT_MESSAGE || "";
  if (!rama) construir("no se sabe de qué rama viene el push");

  if (rama !== "main") {
    if (/\[preview\]/i.test(mensaje)) construir(`rama ${rama} con [preview] en el mensaje`);
    saltear(`rama ${rama} sin [preview] en el mensaje`);
  }

  if (!/\[sin-deploy\]/i.test(mensaje)) construir("push a main sin [sin-deploy]: es un despliegue normal");

  const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let base = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
  if (base) {
    try {
      git(["cat-file", "-e", `${base}^{commit}`]);
    } catch {
      base = "";
    }
  }
  if (!base) base = git(["rev-parse", "HEAD^"]);

  const archivos = git(["diff", "--name-only", base, "HEAD"]).split("\n").filter(Boolean);
  if (!archivos.length) construir("no se pudo listar qué cambió");

  const pesan = archivos.filter((f) => !esInocuo(f));
  if (pesan.length) construir(`[sin-deploy] pero cambia algo que la app usa: ${pesan.slice(0, 5).join(", ")}`);

  saltear(`[sin-deploy] y los ${archivos.length} archivos que cambian son documentación o .claude/`);
} catch (e) {
  construir(`falló el propio control (${e.message})`);
}
