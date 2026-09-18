#!/usr/bin/env node
// ============================================================================
// EL BUILD DE VERCEL, CON EL RUNBOOK ADENTRO.
// ============================================================================
//
// POR QUÉ EXISTE. La migración a Neon quedó meses trabada en un paso humano: alguien tenía
// que abrir una terminal, pegar la cadena del rol directo y correr `prisma migrate deploy`.
// El dueño no levanta sesiones locales, y el entorno donde trabaja el asistente no llega a
// Neon (la política de egreso de la organización rechaza el CONNECT). Resultado: 38 commits
// —entre ellos arreglos de plata y uno fiscal— esperando a que alguien tuviera la terminal.
//
// Vercel SÍ llega a Neon. Este script mete el runbook adentro del build, en el mismo orden y
// con los mismos frenos: migrar, verificar los árbitros del dinero, verificar el aislamiento,
// recién después compilar. **Si algo falla, el build falla y Vercel NO publica**: el código
// viejo sigue sirviendo, que es exactamente lo que se quiere.
//
// EL ORDEN NO ES CAPRICHOSO (docs/runbooks/migracion-caja-neon.md §Los pasos). Publicar el
// código antes de migrar deja el mostrador sin poder cobrar: el código nuevo busca columnas
// que todavía no existen. Acá la migración corre DURANTE el build, o sea antes de que una
// sola request toque el código nuevo.
//
// LO QUE ESTE SCRIPT NO HACE, Y NO DEBE HACER:
//
//   · **No hace el backup.** Ningún automatismo puede decidir por el dueño que un respaldo
//     no hace falta. Antes de publicar: un branch de Neon (un clic en la consola) o un
//     `pg_dump`. Es lo único que deshace un error.
//   · **No prende RLS.** Aplicar `prisma/rls/0001_enable_rls.sql` es una decisión de
//     seguridad del dueño (Gate 2), no un efecto colateral de un deploy. Acá sólo se MIDE y
//     se avisa.
//   · **No migra fuera de producción.** Un preview apuntando a la base de producción que
//     migrara solo sería la peor trampa posible de este repo.

import { spawnSync } from "node:child_process";

const VERDE = "\x1b[32m", ROJO = "\x1b[31m", AMBAR = "\x1b[33m", GRIS = "\x1b[90m", FIN = "\x1b[0m";
const log = (m = "") => console.log(m);
const titulo = (n, t) => log(`\n${GRIS}──${FIN} ${n}. ${t}`);

function corre(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: false });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

function fatal(msg, comoSeArregla) {
  log(`\n${ROJO}✖ BUILD DETENIDO${FIN}  ${msg}`);
  if (comoSeArregla) log(`\n${comoSeArregla}\n`);
  log(`${GRIS}Vercel NO va a publicar. El código que está sirviendo hoy sigue intacto.${FIN}\n`);
  process.exit(1);
}

// ── Dónde estamos ───────────────────────────────────────────────────────────
//
// `VERCEL_ENV` es "production" | "preview" | "development". Sólo la primera migra, y sólo si
// hay una conexión de migración explícita. Las dos condiciones juntas: sin la variable no se
// toca ninguna base, y con la variable en un preview tampoco.
const entorno = process.env.VERCEL_ENV ?? "local";
const urlMigracion = (process.env.MIGRATE_DATABASE_URL ?? "").trim();
const esProduccion = entorno === "production";
const migraEsteBuild = esProduccion && urlMigracion !== "";

log(`\n${GRIS}════ build de ${entorno} ════${FIN}`);

if (!migraEsteBuild) {
  const motivo = !esProduccion
    ? `el entorno es "${entorno}", no producción`
    : "no está seteada MIGRATE_DATABASE_URL";
  log(`${GRIS}Sin migración: ${motivo}. Se compila y nada más.${FIN}`);
  process.exit(corre("npx", ["prisma", "generate"]) || corre("npx", ["next", "build"]));
}

// Red de contención barata y de las que salvan: el pooler RECHAZA las migraciones, y el
// error que devuelve no dice "usaste el pooler", dice cualquier otra cosa.
if (urlMigracion.includes("-pooler.")) {
  fatal(
    "MIGRATE_DATABASE_URL apunta al POOLER de Neon y el pooler rechaza las migraciones.",
    `CÓMO SE ARREGLA:
  Neon → tu proyecto → Connection string → destildá "Connection pooling".
  Es la misma cadena SIN "-pooler" en el host.
  Vercel → Settings → Environment Variables → MIGRATE_DATABASE_URL (sólo Production).`,
  );
}

log(`${AMBAR}Este build MIGRA la base de producción.${FIN}`);
log(`${GRIS}Si no hiciste el respaldo (branch de Neon o pg_dump), cancelá el deploy ahora.${FIN}`);

// ── 1. Qué hay del otro lado, antes de tocar nada ───────────────────────────
titulo(1, "Estado de la base (sólo lectura)");
corre("npx", ["prisma", "migrate", "status"], { DATABASE_URL: urlMigracion });

// ── 2. Migrar ───────────────────────────────────────────────────────────────
//
// `migrate deploy`, nunca `migrate dev`. Aplica TODAS las pendientes en una corrida y se
// detiene en la primera que falla.
titulo(2, "Aplicar las migraciones pendientes");
if (corre("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: urlMigracion }) !== 0) {
  fatal(
    "`prisma migrate deploy` falló. La base puede haber quedado A MEDIO MIGRAR.",
    `QUÉ HACER:
  1. Mirá arriba cuál migración murió y por qué.
  2. La base NO está como antes: las anteriores a la que falló SÍ se aplicaron.
  3. Si hay que volver atrás, es restaurando el respaldo — no hay "deshacer" de migraciones.
  4. El código viejo sigue sirviendo: las migraciones de este lote son ADITIVAS
     (columnas y tablas nuevas), así que una base a medio migrar no lo rompe.`,
  );
}

// ── 3. Los árbitros del dinero ──────────────────────────────────────────────
//
// Éste es el freno que el runbook llama "el paso que faltaba". Una migración que aplica su
// ADD COLUMN y muere antes del CREATE UNIQUE INDEX deja la base en el peor estado posible:
// la columna existe, el chequeo de columnas da verde, y el código cree que tiene árbitro.
// Sin ese índice el cobro queda con una sola capa —un check-then-write— y dos pestañas o un
// reintento de red COBRAN DOS VECES. Tres de esos árbitros llegan en este lote.
titulo(3, "Que los árbitros del dinero existan en la base");
if (corre("npx", ["tsx", "scripts/predeploy-check.mts"], { PREDEPLOY_DATABASE_URL: urlMigracion }) !== 0) {
  fatal(
    "Falta un índice único, una tabla o una columna que el código da por existente.",
    `NO se publica. El detalle está arriba, con el nombre del índice y sus columnas.
  Sin un índice único de idempotencia, el cobro queda en una sola capa y un doble submit
  cobra dos veces. Ver docs/runbooks/migracion-caja-neon.md §"Antes de deployar".`,
  );
}

// ── 4. El aislamiento entre negocios ────────────────────────────────────────
//
// AVISA, no frena. A propósito: nadie midió nunca esta base, así que no sé si el rol `app_rls`
// existe allá. Frenar un deploy por una condición que jamás se observó convierte el primer
// build en un misterio. Prender RLS es Gate 2 del dueño, no un efecto colateral de un deploy.
// Cuando haya una medición real, esto pasa a ser un freno duro.
titulo(4, "Aislamiento entre negocios (informativo)");
const rls = corre("node", ["prisma/rls/check-rls-live.mjs"], { RLS_AUDIT_DATABASE_URL: urlMigracion });
if (rls !== 0) {
  log(`\n${AMBAR}⚠ HAY TABLAS SIN AISLAMIENTO.${FIN} El build sigue, pero esto se mira HOY.`);
  log(`${GRIS}  El SQL es data-driven y se corre a mano: sólo cubre las tablas que existían`);
  log(`  cuando se lo corrió por última vez, y este build acaba de crear tablas nuevas.`);
  log(`  Cerrarlo: psql "<rol directo>" -f prisma/rls/0001_enable_rls.sql${FIN}`);
}

// ── 5. Recién ahora, compilar ───────────────────────────────────────────────
titulo(5, "Compilar");
if (corre("npx", ["prisma", "generate"]) !== 0) fatal("`prisma generate` falló.");
if (corre("npx", ["next", "build"]) !== 0) fatal("`next build` falló. No se publica.");

log(`\n${VERDE}✔ Base migrada, árbitros verificados y build completo.${FIN}\n`);
