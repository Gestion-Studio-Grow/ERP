// ============================================================================
// GATE VISUAL · orquestador para CI / pre-push  ·  npm run gate:visual
// ============================================================================
// Levanta la app buildeada (`next start`) en un puerto, espera a que esté SANO
// (responde 200 y sirve la hoja de estilos), corre el smoke visual
// (scripts/qa/visual-smoke.mjs) contra localhost y baja el server (árbol completo
// en Windows). Exit 0 = render OK; exit 1 = layout roto.
//
// SUBSET SIN DB (default en CI): por defecto corre ROUTES_NO_AUTH=1 → solo las
// rutas que renderizan sin base de datos (login de operador, login de admin,
// vidriera con branding fail-open). Son las que atrapan la clase de bug "CSS no
// cargó / layout colapsado" — que fue exactamente lo que se escapó. Las rutas de
// consola autenticadas necesitan DB (operatorPrisma) y se cubren en el pre-push
// local con `npm run gate:visual:full` apuntando al server de dev con DB.
//
// ROBUSTEZ (aprendido 2026-07-11): NO alcanza con esperar el puerto TCP. Un server
// ZOMBIE de un build anterior puede tener el puerto tomado y servir HTML que apunta
// a un CSS ya borrado por el rebuild → página sin estilos = falso rojo. Por eso:
//   (a) si el puerto ya está ocupado ANTES de arrancar, abortamos con mensaje claro
//       (no testeamos el server de otro);
//   (b) la espera es por SALUD HTTP: 200 + hoja de estilos presente en el HTML;
//   (c) al salir matamos el ÁRBOL de procesos (en Windows `next` es un hijo de npx).
//
// Requisitos: `next build` ya corrido (lo hace la valla build antes de esta) y
// Chromium de Playwright instalado (`npx playwright install chromium`).
// ============================================================================

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import net from "node:net";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const PORT = Number(process.env.VISUAL_PORT ?? "3210");
const BASE_URL = `http://127.0.0.1:${PORT}`;
// full = incluye rutas autenticadas (necesita DB). Se activa por env o por `--full`.
const FULL = process.env.VISUAL_FULL === "1" || process.argv.includes("--full");

// ¿El puerto ya está ocupado? (para no testear el server de otro proceso).
function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.setTimeout(1000);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
  });
}

function httpGet(path) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
}

// Espera SALUD: 200 en /operador/login (no toca DB) Y que el HTML enlace una hoja de
// estilos. Esto descarta un server que responde pero sirve páginas sin CSS (zombie
// con assets borrados) — la trampa que nos dio un falso rojo.
async function waitForHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await httpGet("/operador/login");
    if (r && r.status === 200 && /<link[^>]+rel="stylesheet"|\.css/i.test(r.body)) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

function killTree(child) {
  if (!child || child.killed) return;
  if (isWin && child.pid) {
    // `next` corre como hijo de npx → matamos el árbol, no solo el wrapper.
    spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", shell: true });
  } else {
    child.kill("SIGTERM");
  }
}

async function main() {
  // Guardarraíl: si el puerto ya está tomado, NO arrancamos (evita testear un server
  // ajeno/zombie). Se puede pasar otro con VISUAL_PORT.
  if (await portInUse(PORT)) {
    process.stderr.write(`❌ Puerto ${PORT} ya está en uso. Cerrá ese proceso o pasá VISUAL_PORT=<otro>.\n`);
    process.exit(1);
  }

  const env = {
    ...process.env,
    PORT: String(PORT),
    OPERATOR_SECRET: process.env.OPERATOR_SECRET ?? "visual-gate-secret",
    // En prod OPERATOR_PASSWORD es obligatoria; acá basta para que el login exista.
    OPERATOR_PASSWORD: process.env.OPERATOR_PASSWORD ?? "operador",
  };
  process.stdout.write(`🚀 next start en ${BASE_URL} …\n`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT, env, stdio: "inherit", shell: isWin,
  });

  let code = 1;
  try {
    if (!(await waitForHealthy(60000))) {
      process.stderr.write(`❌ El server no quedó SANO en 60s (200 + hoja de estilos). ¿Falta 'next build'?\n`);
      code = 1;
    } else {
      process.stdout.write(`✓ server sano (200 + CSS)\n`);
      const smokeEnv = { ...env, BASE_URL };
      if (!FULL) smokeEnv.ROUTES_NO_AUTH = "1";
      const r = spawnSync(process.execPath, [join(ROOT, "scripts/qa/visual-smoke.mjs")], {
        cwd: ROOT, env: smokeEnv, stdio: "inherit",
      });
      code = r.status ?? 1;
    }
  } catch (e) {
    process.stderr.write(`❌ ${e?.message ?? e}\n`);
    code = 1;
  } finally {
    killTree(server);
  }
  process.exit(code);
}

main();
