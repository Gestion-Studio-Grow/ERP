// Capturas del backoffice (/admin) de CH Estética y de Magra, en 4 tamaños × claro/oscuro.
//
// Levanta el ERP REAL (`next start`, el build tiene que estar hecho) sobre una base Postgres LOCAL y
// efímera (src/test/base-efimera.ts): nunca Neon. Siembra CH (src/tenants/ch/e2e/semilla-ch.ts) y Magra
// (prisma/seed-magra.ts) en la misma base y fotografía las pantallas de uso diario de cada uno.
//
// Uso:  node --import tsx scripts/qa/capturas-backoffice.mjs <carpeta de salida> [tenant]
//       tenant = ch | magra (por defecto, los dos)        PORT=3251 por defecto (nunca 3210/3211)
import { spawn, execFile } from "node:child_process";
import { createWriteStream, existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { crearBaseEfimera, CLAVE_DE_PRUEBA } from "../../src/test/base-efimera.ts";
import { sembrarCH, SUBDOMINIO_CH } from "../../src/tenants/ch/e2e/semilla-ch.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(process.argv[2] ?? path.join(RAIZ, "dist/capturas-backoffice"));
const SOLO = process.argv[3];
const PORT = Number(process.env.PORT ?? 3251);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const AUTH_SECRET = "capturas-backoffice-0123456789abcdef";
if (!existsSync(path.join(RAIZ, ".next/BUILD_ID"))) throw new Error("Falta el build: corré `npm run build` antes.");

const TAMANOS = [
  ["390x844", 390, 844],
  ["820x1180", 820, 1180],
  ["1366x768", 1366, 768],
  ["1920x1080", 1920, 1080],
];
const TEMAS = ["claro", "oscuro"];

const TENANTS = {
  ch: {
    host: `${SUBDOMINIO_CH}.localhost`,
    pantallas: [
      ["inicio", "/admin"],
      ["agenda", "/admin/turnos"],
      ["clientes", "/admin/clientes"],
      ["caja", "/admin/caja"],
    ],
  },
  magra: {
    host: "magra.localhost",
    pantallas: [
      ["inicio", "/admin"],
      ["pedidos", "/admin/pedidos"],
      ["catalogo", "/admin/catalogo"],
      ["caja", "/admin/caja"],
    ],
  },
};

const correr = (args, env) =>
  new Promise((ok, mal) =>
    execFile(process.execPath, args, { cwd: RAIZ, env, timeout: 120_000, maxBuffer: 8 << 20 }, (err, out, e2) =>
      err ? mal(new Error(`${args.join(" ")} falló:\n${out}\n${e2}`)) : ok(out),
    ),
  );

function rutaDeChromium() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const n of existsSync(dir) ? readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : []) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = path.join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

await mkdir(OUT, { recursive: true });
const base = await crearBaseEfimera();
let app;
let browser;
try {
  const ch = await sembrarCH(base);
  void ch;
  await correr([path.join(RAIZ, "node_modules/tsx/dist/cli.mjs"), "prisma/seed-magra.ts"], {
    ...process.env,
    DATABASE_URL: base.urlDuenio,
    MAGRA_SLUG: "magra",
  });
  const env = {
    ...process.env,
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    NODE_ENV: "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete env[v];
  const log = createWriteStream(path.join(OUT, "servidor.txt"));
  app = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
    cwd: RAIZ,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.pipe(log);
  app.stderr.pipe(log);
  for (let i = 0; ; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/admin/login`, { headers: { host: `${TENANTS.ch.host}:${PORT}` } }).catch(() => null);
    if (r?.ok) break;
    if (i > 120) throw new Error("la app no levantó (ver servidor.txt)");
    await new Promise((ok) => setTimeout(ok, 500));
  }

  browser = await chromium.launch({ executablePath: rutaDeChromium() });
  const credenciales = {
    ch: { email: base.a.duenia.email, clave: CLAVE_DE_PRUEBA },
    magra: { email: "admin@magra", clave: "ERP" },
  };
  for (const [slug, t] of Object.entries(TENANTS)) {
    if (SOLO && SOLO !== slug) continue;
    const origen = `http://${t.host}:${PORT}`;
    for (const tema of TEMAS) {
      for (const [nombreTam, ancho, alto] of TAMANOS) {
        const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema === "oscuro" ? "dark" : "light" });
        await ctx.addInitScript((v) => {
          try {
            localStorage.setItem("gsg-admin-theme", v);
          } catch {
            /* sin storage */
          }
        }, tema === "oscuro" ? "dark" : "light");
        await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
        const p = await ctx.newPage();
        const errores = [];
        p.on("pageerror", (e) => errores.push(String(e)));
        p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text()) && errores.push(m.text()));
        await p.goto(`${origen}/admin/login`);
        await p.fill('input[name="email"]', credenciales[slug].email);
        await p.fill('input[name="password"]', credenciales[slug].clave);
        await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), p.click('button[type="submit"]')]);
        for (const [nombre, ruta] of t.pantallas) {
          const r = await p.goto(`${origen}${ruta}`, { waitUntil: "load" });
          await p.waitForTimeout(500);
          const lateral = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          const archivo = `${slug}-${nombre}-${nombreTam}-${tema}.png`;
          await p.screenshot({ path: path.join(OUT, archivo), fullPage: false });
          console.log(`${r?.status() === 200 ? "✓" : "✗"} ${archivo} ${r?.status()}${lateral ? " · SCROLL LATERAL" : ""}`);
        }
        if (errores.length) console.log(`  consola ${slug} ${nombreTam} ${tema}:`, [...new Set(errores)].slice(0, 3));
        await ctx.close();
      }
    }
  }
} finally {
  await browser?.close().catch(() => {});
  if (app) {
    app.kill("SIGTERM");
    await new Promise((ok) => (app.exitCode !== null ? ok() : app.once("exit", ok)));
  }
  await base.borrar();
}
