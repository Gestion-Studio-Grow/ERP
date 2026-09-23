#!/usr/bin/env node
// Genera el SQL del ENSAYO de la migración en un branch de Neon (sin terminal: se pega en el
// SQL Editor). Lo lee de prisma/lote-deploy.txt y de las carpetas de migración, y registra
// cada una en _prisma_migrations con el checksum que calcula Prisma (sha256 del archivo), así
// después del ensayo el mismo chequeo del build (predeploy-check) ve la base "al día".
//
//   node scripts/ensayo-lote-neon.mjs      → escribe docs/runbooks/ensayo-neon/1-lote-en-branch.sql
//
// El test src/lib/ensayo-lote-neon.test.ts falla si el archivo quedó viejo respecto de las
// migraciones: un ensayo con SQL distinto del que se va a aplicar no ensaya nada.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function generarEnsayo(root = ".") {
  const lote = readFileSync(`${root}/prisma/lote-deploy.txt`, "utf8")
    .split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  const lista = lote.map((m) => `'${m}'`).join(", ");
  let sql = `-- =============================================================================
-- ENSAYO DE LA MIGRACIÓN — sólo en un BRANCH de Neon, NUNCA en producción.
-- =============================================================================
-- GENERADO por scripts/ensayo-lote-neon.mjs desde prisma/lote-deploy.txt. No editar a mano.
--
-- Cómo: Neon → Branches → Create branch (desde producción, nombre "ensayo-lote") →
-- SQL Editor → elegí el branch "ensayo-lote" arriba → pegá TODO → Run.
-- Aplica las ${lote.length} migraciones en UNA transacción y las registra en _prisma_migrations con el
-- checksum de Prisma. Si algo falla no queda nada a medias, y el error dice qué migración.
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios, data-driven).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN (${lista})) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;
`;
  for (const m of lote) {
    const contenido = readFileSync(`${root}/prisma/migrations/${m}/migration.sql`);
    const ck = createHash("sha256").update(contenido).digest("hex");
    sql += `\n-- ─── ${m} · checksum ${ck} ───\n${contenido.toString("utf8")}\n` +
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)\n` +
      `VALUES (gen_random_uuid()::text, '${ck}', now(), '${m}', NULL, NULL, now(), 1);\n`;
  }
  sql += `\nCOMMIT;\n\n-- Verificación (sólo lectura): ${lote.length} filas, todas con finished_at.\n` +
    `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN (${lista}) ORDER BY migration_name;\n`;
  return sql;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync("docs/runbooks/ensayo-neon/1-lote-en-branch.sql", generarEnsayo("."));
  console.log("docs/runbooks/ensayo-neon/1-lote-en-branch.sql");
}
