#!/usr/bin/env node
// ============================================================================
// CONTROL DE PUSH · frena una rama vieja antes de que Vercel la reciba.
// Orden del dueño 15/11/2026 (VERCEL-RAMAS-VIEJAS, opción A: «control que rechace el envío»; no se
// borra ninguna rama). Método: Factory-GSG 10-GOBIERNO/despliegues-vercel.md §5.3.
//
// Por qué: desde fbf64d7 (#168) el vercel.json dice que sólo main despliega. Pero una rama creada
// antes trae el vercel.json viejo y, si Vercel lee el del commit empujado (sin fuente oficial), un
// push a esa rama crea un despliegue que el filtro cancela, y lo cancelado CUENTA para el tope de 100
// por día (https://vercel.com/docs/project-configuration/project-settings).
//
// Qué revisa: para cada rama que no es main, el vercel.json DEL COMMIT EMPUJADO no tiene que hacer
// desplegar a esa rama (git.deploymentEnabled con la semántica de Vercel). Así frena tanto una rama
// anterior a fbf64d7 como una `tanda/` cortada con el vercel.json de fbf64d7 ("tanda/**": true). Sirve
// en clones superficiales (los de la nube lo son) y si mañana el vercel.json cambia.
// Deja pasar: main, borrados de rama y tags.
//
// Dónde corre: es un gancho `pre-push` de git, del lado de quien empuja. GitHub.com no admite
// ganchos del lado del servidor (pre-receive es sólo de GitHub Enterprise Server), así que no hay
// nada en el repo que frene ANTES de Vercel desde el servidor. Lo que NO frena: ver
// docs/operacion/control-de-push.md («qué deja pasar»).
//
//   node scripts/git-hooks/pre-push.mjs --instalar   # lo copia a .git/hooks (lo hace preparar-nube.sh)
//   (como gancho) git lo llama con las refs por stdin; exit 1 = rechaza el push entero.
//
// Autocontenido a propósito: se copia a .git/hooks y tiene que andar aunque se cambie a una rama
// vieja que no trae este archivo. Sólo usa módulos de Node.
// ============================================================================
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARCA = "gsg-control-de-push";
const CEROS = /^0+$/;

/** Patrón minimatch de rama → RegExp, o null si trae sintaxis que no evaluamos (llaves, clases, negación). */
function patron(glob) {
  if (/[{}[\]!+@()\\,]/.test(glob)) return null;
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.^$|]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * ¿Vercel crea un despliegue para un push a `rama` con este vercel.json? Semántica oficial
 * (https://vercel.com/docs/project-configuration/git-configuration): las ramas sin regla despliegan,
 * y si una rama cumple varias reglas despliega cuando al menos una es true. Un patrón que no sabemos
 * evaluar cuenta como que cubre la rama si está en true (ante la duda, despliega).
 */
export function despliega(cfg, rama) {
  if (!cfg || typeof cfg !== "object") return true;
  if (cfg.github?.enabled === false) return false;
  const d = cfg.git?.deploymentEnabled;
  if (d === false) return false;
  if (!d || typeof d !== "object") return true;
  let cubierta = false;
  for (const [glob, valor] of Object.entries(d)) {
    const re = patron(glob);
    if (re ? re.test(rama) : valor === true) {
      cubierta = true;
      if (valor === true) return true;
    }
  }
  return !cubierta;
}

/**
 * Revisa lo que git pasa por stdin al pre-push («<ref local> <sha local> <ref remota> <sha remota>»
 * por línea) y devuelve las ramas a rechazar. `leerVercelJson(sha)` da el texto o null si no está.
 */
export function revisarPush(entrada, leerVercelJson) {
  const rechazos = [];
  for (const linea of String(entrada).split("\n")) {
    const [, sha, refRemota] = linea.trim().split(/\s+/);
    if (!sha || !refRemota) continue;
    if (CEROS.test(sha)) continue; // borrar una rama no despliega nada
    if (!refRemota.startsWith("refs/heads/")) continue; // tags: Vercel despliega ramas
    const rama = refRemota.slice("refs/heads/".length);
    let texto;
    try {
      texto = leerVercelJson(sha);
    } catch (e) {
      rechazos.push({ rama, motivo: `no se pudo leer el vercel.json del commit ${sha.slice(0, 7)} (${e.message})` });
      continue;
    }
    if (texto == null) {
      rechazos.push({ rama, motivo: "el commit no trae vercel.json (sin él, Vercel despliega toda rama)" });
      continue;
    }
    let cfg;
    try {
      cfg = JSON.parse(texto);
    } catch {
      rechazos.push({ rama, motivo: "su vercel.json no es JSON válido" });
      continue;
    }
    // main despliega a propósito (producción); cualquier otra rama que despliegue gasta cupo.
    if (rama !== "main" && despliega(cfg, rama))
      rechazos.push({ rama, motivo: "con el vercel.json de ese commit, Vercel crearía un despliegue para esta rama (le falta el vercel.json de main)" });
  }
  return rechazos;
}

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function leerDeGit(sha) {
  try {
    return git(["show", `${sha}:vercel.json`]);
  } catch (e) {
    // «exists on disk, but not in» / «does not exist in»: el commit no lo trae. Otro error: que suba.
    if (/does not exist|exists on disk, but not in/.test(String(e.stderr))) return null;
    throw new Error(String(e.stderr || e.message).trim().split("\n")[0]);
  }
}

function instalar() {
  const hooksPath = (() => {
    try {
      return git(["config", "--get", "core.hooksPath"]).trim();
    } catch {
      return "";
    }
  })();
  if (hooksPath) {
    console.log(`control de push: NO instalado (core.hooksPath=${hooksPath}: git no mira .git/hooks).`);
    return;
  }
  let dir = git(["rev-parse", "--git-path", "hooks"]).trim();
  if (!isAbsolute(dir)) dir = resolve(process.cwd(), dir);
  mkdirSync(dir, { recursive: true });
  const gancho = join(dir, "pre-push");
  if (existsSync(gancho) && !readFileSync(gancho, "utf8").includes(MARCA)) {
    console.log(`control de push: NO instalado (ya hay un pre-push que no es éste en ${gancho}).`);
    return;
  }
  copyFileSync(fileURLToPath(import.meta.url), join(dir, `${MARCA}.mjs`));
  // Un archivo sin extensión no siempre lo carga Node como módulo: el gancho es un sh que llama al .mjs.
  writeFileSync(gancho, `#!/bin/sh\n# ${MARCA}: ver scripts/git-hooks/pre-push.mjs\nexec node "$(dirname "$0")/${MARCA}.mjs" "$@"\n`);
  chmodSync(gancho, 0o755);
  console.log("control de push: instalado (no se empuja una rama que Vercel desplegaría, salvo main).");
}

function comoGancho() {
  const rechazos = revisarPush(readFileSync(0, "utf8"), leerDeGit);
  if (!rechazos.length) return 0;
  const lineas = [
    "",
    "✋ Push RECHAZADO por el control de despliegues de Vercel (plan gratis: 100 por día, los cancelados cuentan).",
    ...rechazos.map((r) => `   · ${r.rama}: ${r.motivo}`),
    "",
    "   Traé main a tu rama y volvé a empujar:",
    "     git fetch origin main && git merge origin/main && git push",
    "   Detalle: docs/operacion/control-de-push.md",
    "",
  ];
  console.error(lineas.join("\n"));
  return 1;
}

const esPrincipal = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  if (process.argv.includes("--instalar")) {
    try {
      instalar();
    } catch (e) {
      console.log(`control de push: NO instalado (${e.message}).`);
    }
  } else {
    process.exit(comoGancho());
  }
}
