// ============================================================================
// Paquete Gate 2 nivel 2 sobre PGlite — sin Postgres instalado, sin tocar ninguna base real
// ============================================================================
//
//   node scripts/qa/gate2-pglite.mjs            # corre src/lib/schema-probe/paquete-gate2.test.ts
//   node scripts/qa/gate2-pglite.mjs <test.ts>  # otro test que lea GATE2_PG_URL
//
// Levanta PGlite (Postgres en WASM, EN MEMORIA, de node_modules) en 127.0.0.1 y corre el test con
// GATE2_PG_URL apuntando ahí. Al terminar, la base desaparece con el proceso.
//
// 🔴 Nunca toca Neon: se BORRAN del entorno del test DATABASE_URL, MIGRATE_DATABASE_URL y
// cualquier *_DATABASE_URL, y el test mismo se niega a correr si GATE2_PG_URL no es local.
//
// Lo que PGlite NO reproduce (dicho también en prisma/pending-gate2/README.md):
//   · concurrencia real: atiende los mensajes de a uno (una sola sesión de Postgres por debajo);
//     las transacciones de distintas conexiones se serializan → se prueba el RESULTADO de la
//     dedupe, no la carrera;
//   · bases separadas: `CREATE DATABASE` existe en el catálogo, pero toda conexión cae en la
//     misma base;
//   · estado de sesión por conexión: `SET ROLE` / `set_config(…, false)` se comparten entre
//     conexiones (por eso el test usa SET LOCAL dentro de una transacción);
//   · psql: el test ejecuta los .sql sentencia por sentencia en autocommit, como psql.
// ============================================================================
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PUERTO = Number(process.env.GATE2_PGLITE_PORT ?? 54331);
const TEST = process.argv[2] ?? "src/lib/schema-probe/paquete-gate2.test.ts";

const db = await PGlite.create();
const { rows } = await db.query("SELECT version() AS v");
const servidor = new PGLiteSocketServer({ db, port: PUERTO, host: "127.0.0.1", maxConnections: 64 });
await servidor.start();
console.log(`PGlite en 127.0.0.1:${PUERTO} · ${String(rows[0].v).split(" on ")[0]}`);

const env = { ...process.env, GATE2_PG_URL: `postgresql://postgres@127.0.0.1:${PUERTO}/postgres?sslmode=disable` /* el motor de Prisma pide SSL y PGlite no lo atiende */, GATE2_MOTOR: "pglite" };
for (const k of Object.keys(env)) if (/DATABASE_URL$/.test(k)) delete env[k];

const hijo = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", TEST], { stdio: "inherit", env });
const codigo = await new Promise((resolve) => hijo.on("exit", (c) => resolve(c ?? 1)));

await servidor.stop();
await db.close();
process.exit(codigo);
