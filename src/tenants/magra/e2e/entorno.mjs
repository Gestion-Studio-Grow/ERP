// Entorno del recorrido E2E de MAGRA: base Postgres LOCAL recién hecha (nunca Neon), migraciones,
// RLS como en producción, la semilla de MAGRA con el slug real y la app de producción (`next start`)
// conectada como `app_rls`. Se usa desde uat-magra.e2e.mjs; también se puede levantar sola para
// mirar a mano:  node --import tsx src/tenants/magra/e2e/entorno.mjs   (Ctrl+C la borra).
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearBaseEfimera } from "../../../test/base-efimera.ts";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// Claves de la DEMO local (están en prisma/seed-magra.ts, no son secretos).
export const DUENIO = { email: "admin@magra", clave: "ERP", nombre: "dueño" };
export const MOSTRADOR = { email: "mostrador@magra", clave: "ERP", nombre: "mostrador" };

const puertoLibre = () =>
  new Promise((ok, mal) => {
    const s = createServer().once("error", mal).listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const correr = (args, env) =>
  new Promise((ok, mal) =>
    execFile(process.execPath, args, { cwd: RAIZ, env, timeout: 120_000, maxBuffer: 8 << 20 }, (err, stdout, stderr) =>
      err ? mal(new Error(`${args.join(" ")} falló:\n${stdout}\n${stderr}`)) : ok(stdout),
    ),
  );

export async function levantarEntorno({ log = console.log } = {}) {
  if (!existsSync(path.join(RAIZ, ".next/BUILD_ID"))) {
    throw new Error("Falta el build de producción: corré `npm run build` antes del recorrido.");
  }
  const base = await crearBaseEfimera();
  log(`· base local ${base.nombre} (migraciones + RLS aplicadas)`);
  try {
    const salida = await correr([path.join(RAIZ, "node_modules/tsx/dist/cli.mjs"), "prisma/seed-magra.ts"], {
      ...process.env,
      DATABASE_URL: base.urlDuenio,
      MAGRA_SLUG: "magra",
    });
    log(`· semilla: ${salida.split("\n")[0]}`);
    const puerto = await puertoLibre();
    const env = { ...process.env };
    for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete env[v];
    Object.assign(env, {
      NODE_ENV: "production",
      DATABASE_URL: base.urlApp,
      OPERATOR_DATABASE_URL: base.urlApp,
      RLS_ENFORCEMENT: "on",
      // `magra.localhost` → subdominio `magra`. Chromium resuelve *.localhost solo y lo trata como
      // origen seguro, así la cookie `secure` de la sesión de producción viaja por http local.
      APP_BASE_DOMAIN: "localhost",
      AUTH_SECRET: randomBytes(32).toString("hex"),
    });
    const servidor = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(puerto)], {
      cwd: RAIZ,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logServidor = [];
    servidor.stdout.on("data", (d) => logServidor.push(String(d)));
    servidor.stderr.on("data", (d) => logServidor.push(String(d)));
    const url = `http://magra.localhost:${puerto}`;
    for (let i = 0; ; i++) {
      const r = await fetch(`http://127.0.0.1:${puerto}/admin/login`, { headers: { host: `magra.localhost:${puerto}` } }).catch(() => null);
      if (r?.ok) break;
      if (i > 120 || servidor.exitCode !== null) throw new Error(`la app no levantó:\n${logServidor.join("").slice(-2000)}`);
      await new Promise((ok) => setTimeout(ok, 500));
    }
    log(`· app de producción en ${url}`);
    const cerrar = async () => {
      servidor.kill("SIGTERM");
      await new Promise((ok) => (servidor.exitCode !== null ? ok() : servidor.once("exit", ok)));
      await base.borrar();
    };
    return { base, url, puerto, logServidor, cerrar };
  } catch (err) {
    await base.borrar();
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const e = await levantarEntorno();
  console.log(`Listo. Dueño: ${DUENIO.email} / ${DUENIO.clave} · Mostrador: ${MOSTRADOR.email} / ${MOSTRADOR.clave}`);
  const salir = async () => { await e.cerrar(); process.exit(0); };
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
}
