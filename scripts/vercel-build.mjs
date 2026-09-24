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
//
// LO QUE SÍ HACE AUNQUE NO MIGRE. Un build de producción SIN la cadena de migración también
// mira la base (con el rol de la app) y frena si está atrasada respecto del código. Sin eso,
// un merge o un redeploy antes de cargar la variable publicaba código nuevo contra una base
// vieja: el mostrador de CH sin poder cobrar, y el build en verde.

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
const urlApp = (process.env.DATABASE_URL ?? "").trim();
const esProduccion = entorno === "production";
const migraEsteBuild = esProduccion && urlMigracion !== "";

log(`\n${GRIS}════ build de ${entorno} ════${FIN}`);

// Antes, sin AUTH_SECRET, las sesiones se firmaban con un string público. Hoy el código tira
// en producción si falta (src/lib/auth.ts): mejor enterarse en el build que con el login caído.
if (esProduccion && (process.env.AUTH_SECRET ?? "").trim() === "") {
  fatal(
    "Falta AUTH_SECRET en Production. Sin ella nadie puede iniciar sesión.",
    `CÓMO SE ARREGLA:
  Vercel → Settings → Environment Variables → AUTH_SECRET, marcada para Production.`,
  );
}

// La consola del operador gobierna a TODOS los negocios. Su secreto tiene que existir y ser
// distinto del de las sesiones de negocio: si no, la sesión de una recepcionista podía abrirla
// (src/lib/operator-auth.ts, agujero cerrado el 2026-09-23). El código ahora falla cerrado en
// runtime; este freno lo adelanta al build, para que no se publique una consola que no abre.
if (esProduccion) {
  const operador = (process.env.OPERATOR_SECRET ?? "").trim();
  if (operador === "") {
    fatal(
      "Falta OPERATOR_SECRET en Production. La consola de GSG no abre sin él.",
      `CÓMO SE ARREGLA:
  Vercel → Settings → Environment Variables → OPERATOR_SECRET (sólo Production), una frase
  larga inventada, DISTINTA de AUTH_SECRET.`,
    );
  }
  if (operador === (process.env.AUTH_SECRET ?? "").trim()) {
    fatal(
      "OPERATOR_SECRET es igual a AUTH_SECRET. Con los dos iguales, la sesión de un negocio abría la consola de todos.",
      `CÓMO SE ARREGLA:
  Vercel → Settings → Environment Variables → OPERATOR_SECRET → Edit → otra frase larga,
  distinta de AUTH_SECRET. Después, Redeploy.`,
    );
  }
  // La clave del operador dueño. Sin ella (o vacía) el código no deja entrar a nadie como dueño
  // (src/lib/operator-auth.ts: una clave vacía nunca entra), así que el dueño quedaría afuera de la
  // consola sin aviso. El valor nunca se imprime.
  if ((process.env.OPERATOR_PASSWORD ?? "").trim() === "") {
    fatal(
      "Falta OPERATOR_PASSWORD en Production (o está vacía). El dueño no podría entrar a la consola de GSG.",
      `CÓMO SE ARREGLA:
  Vercel → Settings → Environment Variables → OPERATOR_PASSWORD (sólo Production): la clave del
  dueño para /operador/login, larga y distinta de todo lo demás. Después, Redeploy.`,
    );
  }
}

/**
 * Corre el pre-deploy check contra `url` y devuelve su código:
 * 0 = al día · 1 = la base está atrás del código · 2 (u otro) = no se pudo mirar.
 */
function verifica(url, extra = {}) {
  return corre("npx", ["tsx", "scripts/predeploy-check.mts"], { PREDEPLOY_DATABASE_URL: url, ...extra });
}

function noConecta(queBase) {
  fatal(
    `No se pudo CONECTAR a ${queBase}, o el rol no tiene permiso para mirarla.`,
    `No se publica a ciegas. El detalle está arriba.
  · ¿La cadena está bien copiada y la base de Neon está despierta?
  · Si dice "permission denied", el rol no tiene GRANT: Neon → SQL Editor → pegar
    prisma/rls/0002_app_role.sql (conectado como neondb_owner).`,
  );
}

if (!migraEsteBuild) {
  if (!esProduccion) {
    log(`${GRIS}Sin migración: el entorno es "${entorno}", no producción.${FIN}`);
    // Un PREVIEW nunca atiende pantallas contra la base de producción: se compila igual (así el
    // build sigue sirviendo de verificación), pero la app queda bloqueada con un aviso. Ver
    // scripts/preview-base.mjs. Local (sin VERCEL_ENV) no se toca.
    const extra = {};
    if (entorno === "preview") {
      const { previewDebeBloquearse } = await import("./preview-base.mjs");
      const r = await previewDebeBloquearse([process.env.DATABASE_URL, process.env.OPERATOR_DATABASE_URL]);
      if (r.bloquear) {
        log(`${AMBAR}⚠ PREVIEW BLOQUEADO:${FIN} ${r.motivo}. Se compila, pero la app no atiende pantallas.`);
        log(`${GRIS}  Para usarlo de QA: DATABASE_URL y OPERATOR_DATABASE_URL sólo de Preview, apuntando a la base de QA.${FIN}`);
        extra.GSG_PREVIEW_BLOQUEADO = "1";
      } else {
        log(`${VERDE}Preview con base propia (${r.motivo}).${FIN}`);
      }
    }
    process.exit(corre("npx", ["prisma", "generate"]) || corre("npx", ["next", "build"], extra));
  }

  // Producción SIN cadena de migración: no se toca la base, pero se la MIRA.
  if (urlApp === "") {
    fatal(
      "Production no tiene ni MIGRATE_DATABASE_URL ni DATABASE_URL.",
      `Sin base no hay nada que publicar. Vercel → Settings → Environment Variables.`,
    );
  }
  log(`${GRIS}Sin migración: no está seteada MIGRATE_DATABASE_URL. Se verifica que la base esté al día.${FIN}`);
  titulo(1, "Que la base de producción esté al día con este código (sólo lectura)");
  const r = verifica(urlApp);
  if (r === 1) {
    fatal(
      "La base de producción está ATRÁS de este código.",
      `Publicarlo así deja el mostrador sin poder cobrar: el código busca columnas que no existen.
  Primero la migración: docs/runbooks/migracion-caja-neon.md §"A · Desde el deploy de Vercel".`,
    );
  }
  if (r !== 0) noConecta("la base de producción (DATABASE_URL)");

  titulo(2, "Compilar");
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
// Cancelar a mitad de `migrate deploy` es lo único que puede dejar la base TRABADA (P3009):
// una migración marcada como fallida bloquea todos los deploys siguientes. Si no hubo
// respaldo, el momento de frenar era antes de cargar la variable, no ahora.
log(`${AMBAR}NO CANCELES ESTE BUILD.${FIN} ${GRIS}Cortarlo mientras migra puede trabar la base (P3009).`);
log(`Dejalo terminar: si algo falla, frena solo y no publica.${FIN}`);

// ── 1. Qué hay del otro lado, antes de tocar nada ───────────────────────────
titulo(1, "Estado de la base (sólo lectura)");
corre("npx", ["prisma", "migrate", "status"], { DATABASE_URL: urlMigracion });

// ── 1b. Que se aplique exactamente lo que se revisó ─────────────────────────
//
// "Exactamente estas cinco" era una frase del runbook. Acá es un freno: si la base tiene
// pendiente algo que no está en prisma/lote-deploy.txt, o el repo no conoce algo que la
// base ya tiene, no se migra.
titulo("1b", "Que lo pendiente sea exactamente el lote declarado");
const lote = verifica(urlMigracion, { PREDEPLOY_LOTE: "prisma/lote-deploy.txt" });
if (lote === 1) {
  fatal(
    "Lo que se iba a aplicar no coincide con prisma/lote-deploy.txt. No se tocó la base.",
    `El detalle está arriba. Si la diferencia es a propósito, se corrige el archivo en un PR.`,
  );
}
if (lote !== 0) noConecta("la base con MIGRATE_DATABASE_URL");

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
  3. Mientras la migración fallida figure en _prisma_migrations, TODO deploy siguiente va a
     frenar con P3009. El procedimiento desde el navegador está en el runbook, §"Si el
     build dice P3009".
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
const arbitros = verifica(urlMigracion);
if (arbitros === 1) {
  fatal(
    "Falta un índice único, una tabla o una columna que el código da por existente.",
    `NO se publica. El detalle está arriba, con el nombre del índice y sus columnas.
  Sin un índice único de idempotencia, el cobro queda en una sola capa y un doble submit
  cobra dos veces. Ver docs/runbooks/migracion-caja-neon.md §"Antes de deployar".`,
  );
}
if (arbitros !== 0) noConecta("la base con MIGRATE_DATABASE_URL");

// ── 3b. Lo mismo, visto por el rol de la APP ────────────────────────────────
//
// La migración corre con el rol dueño; la app se conecta con otro (`app_rls`). Una tabla
// nueva que el rol de la app no puede leer es, para la app, una tabla que no existe: el
// cobro rompe en vivo con la base "al día". `information_schema` sólo muestra lo que el rol
// puede ver, así que el mismo chequeo con la otra cadena atrapa el GRANT que falta.
if (urlApp !== "" && urlApp !== urlMigracion) {
  titulo("3b", "Que la app vea lo que se acaba de crear (rol de DATABASE_URL)");
  const vista = verifica(urlApp);
  if (vista === 1) {
    fatal(
      "La base está migrada, pero el rol de la app NO ve todo lo que el código usa.",
      `Casi seguro es un GRANT que falta sobre las tablas nuevas.
  Neon → SQL Editor (como neondb_owner) → pegar prisma/rls/0002_app_role.sql → Run.
  Es idempotente. Después, Redeploy: la base ya está migrada y el lote va a dar "nada pendiente".`,
    );
  }
  if (vista !== 0) noConecta("la base con el rol de la app (DATABASE_URL)");
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
  log(`  Cerrarlo: Neon → SQL Editor (como neondb_owner) → pegar prisma/rls/0001_enable_rls.sql → Run.${FIN}`);
}

// ── 5. Recién ahora, compilar ───────────────────────────────────────────────
titulo(5, "Compilar");
if (corre("npx", ["prisma", "generate"]) !== 0) fatal("`prisma generate` falló.");
if (corre("npx", ["next", "build"]) !== 0) fatal("`next build` falló. No se publica.");

log(`\n${VERDE}✔ Base migrada, árbitros verificados y build completo.${FIN}\n`);
