// ============================================================================
// Tests de base de la tanda P1 sobre PGlite — sin Postgres instalado, sin tocar ninguna base real
// ============================================================================
//
//   node scripts/qa/p1-pglite.mjs                       # los tests de base de P1
//   node scripts/qa/p1-pglite.mjs <a.test.ts> [...]     # otros tests del arnés de base efímera
//
// Levanta PGlite (Postgres en WASM, EN MEMORIA, de node_modules) en 127.0.0.1 y corre los tests con
// ERP_TEST_PG_URL apuntando ahí: el arnés `src/test/base-efimera.ts` crea, migra (`prisma migrate
// deploy`), aplica 0002/0001 y siembra A y B como siempre. Al terminar, la base desaparece con el
// proceso. Un archivo de test por servidor PGlite (cada uno arranca limpio).
//
// 🔴 Nunca toca Neon: se BORRAN del entorno de los tests DATABASE_URL, MIGRATE_DATABASE_URL y
// cualquier *_DATABASE_URL, y la guarda del arnés exige un servidor local.
//
// Lo que PGlite NO reproduce (molde de scripts/qa/gate2-pglite.mjs de S2):
//   · RLS: PGlite corre en modo de un solo usuario; toda conexión es el superusuario `postgres`
//     aunque la URL diga `app_rls`, y el superusuario no pasa por las políticas. Las aserciones
//     de aislamiento por RLS (p. ej. «el handler de A ve sólo los pedidos de A») FALLAN acá y
//     sólo valen contra el Postgres del arnés (CI). La unicidad, la dedupe y los candados sí corren.
//   · concurrencia real: atiende los mensajes de a uno; se prueba el RESULTADO, no la carrera.
//   · bases separadas: `CREATE DATABASE` existe en el catálogo, pero toda conexión cae en la
//     misma base.
// ============================================================================
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PUERTO = Number(process.env.P1_PGLITE_PORT ?? 54332);
const TESTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "src/integraciones/certificacion-p1-postgres.test.ts",
      "src/integraciones/conexiones-postgres.test.ts",
      "src/lib/webhooks/webhooks-por-conexion-postgres.test.ts",
    ];

let codigoFinal = 0;
for (const test of TESTS) {
  const db = await PGlite.create();
  const servidor = new PGLiteSocketServer({ db, port: PUERTO, host: "127.0.0.1", maxConnections: 64 });
  await servidor.start();
  console.log(`\n── ${test} · PGlite en 127.0.0.1:${PUERTO}`);
  // sslmode=disable: el motor de Prisma pide SSL y PGlite no lo atiende.
  const env = { ...process.env, ERP_TEST_PG_URL: `postgresql://postgres@127.0.0.1:${PUERTO}/postgres?sslmode=disable` };
  for (const k of Object.keys(env)) if (/DATABASE_URL$/.test(k)) delete env[k];
  delete env.CI;
  const hijo = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", test], { stdio: "inherit", env });
  const codigo = await new Promise((resolve) => hijo.on("exit", (c) => resolve(c ?? 1)));
  if (codigo !== 0) codigoFinal = codigo;
  await servidor.stop();
  await db.close();
}
process.exit(codigoFinal);
