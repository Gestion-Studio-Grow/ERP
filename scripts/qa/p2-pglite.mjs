// ============================================================================
// Tests de base de la tanda P2 sobre PGlite — sin Postgres instalado, sin tocar ninguna base real
// ============================================================================
//
//   node scripts/qa/p2-pglite.mjs                       # los tests de base de P2
//   node scripts/qa/p2-pglite.mjs <a.test.ts> [...]     # otros tests del arnés de base efímera
//
// Molde: scripts/qa/p1-pglite.mjs (P1, 82fae3a). Levanta PGlite (Postgres en WASM, EN MEMORIA, de
// node_modules) en 127.0.0.1 y corre cada test con ERP_TEST_PG_URL apuntando ahí y
// ERP_TEST_MOTOR=pglite; el arnés `src/test/base-efimera.ts` crea, migra y siembra A y B. Un
// servidor nuevo por archivo de test. Al terminar, la base desaparece con el proceso.
//
// 🔴 Nunca toca Neon: se BORRAN del entorno de los tests DATABASE_URL, MIGRATE_DATABASE_URL y
// cualquier *_DATABASE_URL, y la guarda del arnés exige un servidor local.
//
// Lo que PGlite NO reproduce (y por eso los tests lo saltean con ERP_TEST_MOTOR=pglite):
//   · RLS: toda conexión es el superusuario `postgres` y no pasa por las políticas. Las
//     aserciones de aislamiento por RLS sólo valen contra el Postgres del arnés (CI).
//   · concurrencia real: atiende los mensajes de a uno; se prueba el RESULTADO, no la carrera.
//   · psql: N2_hub.sql se aplica con el cliente `pg` (una consulta simple con todo el archivo).
//   · tiempos: es WASM; los milisegundos sirven para comparar planes entre sí, no como número
//     de producción.
// ============================================================================
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PUERTO = Number(process.env.P2_PGLITE_PORT ?? 54333);
const TESTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["src/eventos/emitir-postgres.test.ts", "src/eventos/vuelta4-postgres.test.ts", "src/eventos/vuelta5-postgres.test.ts"];

let codigoFinal = 0;
for (const test of TESTS) {
  const db = await PGlite.create();
  const servidor = new PGLiteSocketServer({ db, port: PUERTO, host: "127.0.0.1", maxConnections: 64 });
  await servidor.start();
  console.log(`\n── ${test} · PGlite en 127.0.0.1:${PUERTO}`);
  // sslmode=disable: el motor de Prisma pide SSL y PGlite no lo atiende.
  const env = { ...process.env, ERP_TEST_PG_URL: `postgresql://postgres@127.0.0.1:${PUERTO}/postgres?sslmode=disable`, ERP_TEST_MOTOR: "pglite" };
  for (const k of Object.keys(env)) if (/DATABASE_URL$/.test(k)) delete env[k];
  delete env.CI;
  const hijo = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", test], { stdio: "inherit", env });
  const codigo = await new Promise((resolve) => hijo.on("exit", (c) => resolve(c ?? 1)));
  if (codigo !== 0) codigoFinal = codigo;
  await servidor.stop();
  await db.close();
}
process.exit(codigoFinal);
