// Entorno de DESARROLLO de los recorridos de CH (`next dev`): igual que entorno-ch.mjs pero sin build, para
// las sesiones en la nube donde `next build` no puede bajar las fuentes de Google. Base LOCAL efímera, nunca Neon.
// Lo usa ronda-estetica.mjs. Para certificar se sigue usando entorno-ch.mjs (build de producción).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera, CLAVE_DE_PRUEBA } from "../../../test/base-efimera.ts";
import { sembrarCH, SUBDOMINIO_CH } from "./semilla-ch.ts";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export { CLAVE_DE_PRUEBA };

const puertoLibre = () =>
  new Promise((ok, mal) => {
    const s = createServer().once("error", mal).listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

export async function levantarEntornoCH({ log = console.log, env: envExtra = {} } = {}) {
  if (false) {
    throw new Error("Falta el build de producción: corré `npm run build` antes del recorrido.");
  }
  const base = await crearBaseEfimera();
  log(`· base local ${base.nombre} (migraciones + RLS aplicadas)`);
  try {
    const semilla = await sembrarCH(base);
    const puerto = await puertoLibre();
    const env = { ...process.env };
    for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_INVOICING_ENABLED"]) delete env[v];
    Object.assign(env, {
      // Lo que pida el recorrido (p. ej. ARCA_INVOICING_ENABLED). Va primero: la base, el rol y el
      // RLS de abajo no se pueden pisar.
      ...envExtra,
      NODE_ENV: "development",
      DATABASE_URL: base.urlApp,
      OPERATOR_DATABASE_URL: base.urlDuenio,
      MIGRATE_DATABASE_URL: base.urlDuenio,
      RLS_ENFORCEMENT: "on",
      APP_BASE_DOMAIN: "localhost",
      AUTH_SECRET: randomBytes(32).toString("hex"),
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
      if (i > 240 || servidor.exitCode !== null) throw new Error(`la app no levantó:\n${logServidor.join("").slice(-2000)}`);
      await new Promise((ok) => setTimeout(ok, 500));
    }
    log(`· app de producción en ${url}`);
    const cerrar = async () => {
      servidor.kill("SIGTERM");
      await new Promise((ok) => (servidor.exitCode !== null ? ok() : servidor.once("exit", ok)));
      await base.borrar();
    };
    return { base, semilla, url, logServidor, cerrar };
  } catch (err) {
    await base.borrar();
    throw err;
  }
}
