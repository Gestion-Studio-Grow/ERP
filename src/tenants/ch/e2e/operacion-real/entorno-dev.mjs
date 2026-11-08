// Copia de src/tenants/ch/e2e/entorno-ch.mjs para el recorrido del sábado (desvío anotado: el build de
// producción no compila en este entorno). Cambios: sin chequeo de BUILD_ID, `next dev` en lugar de
// `next start`, NODE_ENV sin forzar, y el reloj del recorrido (reloj.mjs) cargado en el servidor.
// Resto igual: base efímera LOCAL con migraciones + RLS, app como `app_rls`, RLS_ENFORCEMENT=on. Nunca Neon.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import os from "node:os";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, CLAVE_DE_PRUEBA } from "../../../../test/base-efimera.ts";
import { sembrarCH, SUBDOMINIO_CH } from "../semilla-ch.ts";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CODIGO = path.dirname(fileURLToPath(import.meta.url));
// Las salidas (capturas, JSON, logs) van FUERA del repo: nada binario en Git.
export const AQUI = process.env.SALIDA_OPERACION_REAL ?? path.join(os.tmpdir(), "operacion-real-ch", "recorrido");
mkdirSync(AQUI, { recursive: true });
export { CLAVE_DE_PRUEBA };

const puertoLibre = () =>
  new Promise((ok, mal) => {
    const s = createServer().once("error", mal).listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

export async function levantarEntornoDev({ log = console.log, env: envExtra = {}, ahora = new Date(), relojArchivo } = {}) {
  const base = await crearBaseEfimera();
  log(`· base local ${base.nombre} (migraciones + RLS aplicadas)`);
  try {
    const semilla = await sembrarCH(base, ahora);
    const puerto = await puertoLibre();
    const env = { ...process.env };
    for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_INVOICING_ENABLED", "NODE_ENV", "NODE_OPTIONS"]) delete env[v];
    Object.assign(env, {
      ...envExtra,
      DATABASE_URL: base.urlApp,
      OPERATOR_DATABASE_URL: base.urlDuenio,
      MIGRATE_DATABASE_URL: base.urlDuenio,
      RLS_ENFORCEMENT: "on",
      APP_BASE_DOMAIN: "localhost",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      NEXT_TELEMETRY_DISABLED: "1",
      ...(relojArchivo ? { RELOJ_ARCHIVO: relojArchivo, NODE_OPTIONS: `--import ${path.join(CODIGO, "reloj.mjs")}` } : {}),
    });
    const servidor = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "dev", "-p", String(puerto)], {
      cwd: RAIZ,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logServidor = [];
    servidor.stdout.on("data", (d) => logServidor.push(String(d)));
    servidor.stderr.on("data", (d) => logServidor.push(String(d)));
    const url = `http://${SUBDOMINIO_CH}.localhost:${puerto}`;
    for (let i = 0; ; i++) {
      const r = await fetch(`http://127.0.0.1:${puerto}/admin/login`, { headers: { host: `${SUBDOMINIO_CH}.localhost:${puerto}` } }).catch(() => null);
      if (r?.ok) break;
      if (i > 360 || servidor.exitCode !== null) throw new Error(`la app no levantó:\n${logServidor.join("").slice(-2000)}`);
      await new Promise((ok) => setTimeout(ok, 500));
    }
    log(`· app (next dev) en ${url}`);
    const cerrar = async () => {
      servidor.kill("SIGTERM");
      await new Promise((ok) => (servidor.exitCode !== null ? ok() : servidor.once("exit", ok)));
      await base.borrar();
    };
    return { base, semilla, url, puerto, logServidor, cerrar };
  } catch (err) {
    await base.borrar();
    throw err;
  }
}
