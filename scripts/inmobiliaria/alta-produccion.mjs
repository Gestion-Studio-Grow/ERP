// ============================================================================
// ALTA DE UNA INMOBILIARIA EN PRODUCCIÓN, con cartera de muestra — por orden del dueño.
// ============================================================================
//
// Hermano de scripts/taller/migrar-produccion.mjs: toma la conexión del `.env` del repo principal
// (rol dueño de las tablas) y la usa sólo en la memoria de este proceso. Da de alta el negocio
// (rubro inmobiliaria, módulos por defecto, subdominio) y carga la cartera de muestra del seed,
// que son datos INVENTADOS para mostrar el producto. Si el negocio ya existe, recarga sólo lo
// propio del módulo (fichas, consultas, contratos) y no toca usuarios ni configuración.
//
//   node scripts/inmobiliaria/alta-produccion.mjs --slug pdcinmobiliaria --nombre "PDC Propiedades" \
//        --duenio-email dueño@mail.com [--whatsapp 549...] [--direccion "..."] [--ciudad "..."] \
//        [--horario "..."] [--lema "..."] --confirmar
//
// Sin --confirmar sólo muestra qué haría. La clave del dueño la genera el alta y se imprime UNA
// vez; la del agente de ejemplo también. No hace respaldo: eso lo decide el dueño antes.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV_PRINCIPAL = process.env.ENV_PRODUCCION ?? "C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env";
const isWin = process.platform === "win32";
const fatal = (m) => {
  console.error(`\n✖ FRENADO: ${m}\n`);
  process.exit(1);
};

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const t = process.argv[i];
  if (!t.startsWith("--")) continue;
  const k = t.slice(2);
  const v = process.argv[i + 1];
  if (v && !v.startsWith("--")) {
    args[k] = v;
    i++;
  } else args[k] = true;
}
const slug = String(args.slug ?? "").trim();
const nombre = String(args.nombre ?? "").trim();
const duenioEmail = String(args["duenio-email"] ?? "").trim().toLowerCase();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fatal("--slug tiene que ser minúsculas, dígitos y guiones (es también el subdominio).");
if (!nombre) fatal("falta --nombre.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(duenioEmail)) fatal("falta --duenio-email válido.");

let cruda = "";
try {
  const linea = readFileSync(ENV_PRINCIPAL, "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  cruda = (linea ?? "").replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
} catch {
  fatal(`no se pudo leer ${ENV_PRINCIPAL}`);
}
let url;
try {
  url = new URL(cruda);
} catch {
  fatal("DATABASE_URL del .env principal no es una URL legible.");
}
if (url.username !== "neondb_owner") fatal(`la conexión es del rol "${url.username}", no del dueño de las tablas.`);
if (!url.hostname.endsWith(".neon.tech")) fatal("la conexión no es de Neon.");

console.log(`Base: ${url.hostname} · negocio: ${nombre} (${slug}) · dueño: ${duenioEmail}`);
console.log(`Sitio: https://${slug}.gsgapp.com.ar · panel: https://${slug}.gsgapp.com.ar/admin`);
if (!args.confirmar) {
  console.log("\nSólo mirar: faltó --confirmar. No se escribió nada.");
  process.exit(0);
}

// La cadena va sólo por variables de entorno del hijo, nunca por argv.
const r = spawnSync("npx", ["tsx", "prisma/seed-inmobiliaria-demo.ts"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: isWin,
  env: {
    ...process.env,
    DATABASE_URL: url.toString(),
    SEED_DB_MAX: "2",
    INMO_SEED_PRODUCCION: "1",
    INMO_SEED_SLUG: slug,
    INMO_SEED_NOMBRE: nombre,
    INMO_SEED_DUENIO_EMAIL: duenioEmail,
    INMO_SEED_DUENIO_NOMBRE: String(args["duenio-nombre"] ?? "Dueño/a"),
    ...(args.whatsapp ? { INMO_SEED_WHATSAPP: String(args.whatsapp) } : {}),
    ...(args.direccion ? { INMO_SEED_DIRECCION: String(args.direccion) } : {}),
    ...(args.ciudad ? { INMO_SEED_CIUDAD: String(args.ciudad) } : {}),
    ...(args.horario ? { INMO_SEED_HORARIO: String(args.horario) } : {}),
    ...(args.lema ? { INMO_SEED_LEMA: String(args.lema) } : {}),
  },
});
process.exit(r.status ?? 1);
