// P2 · O-v6-1 (CERT-P2 vuelta 6): la dedupe del lote no recorre el outbox de todos los negocios.
// Sin el filtro fijo por negocio (`$4`), con más de ~50 claves el planificador elegía Seq Scan sobre
// "OutboxEvent" (~480 ms con 500 mil filas ajenas). Se mira el PLAN, no los milisegundos: es estable.
// PGlite en memoria, sin N2_hub (como está producción hoy). Nunca una base real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { SQL_YA_ESTAN_DEL_LOTE } from "@/eventos/emitir";

test("O-v6-1: la dedupe de un lote de 2000 claves usa el índice por negocio, no un Seq Scan del outbox", { timeout: 120_000 }, async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE TABLE "OutboxEvent" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "type" text NOT NULL, "payload" jsonb NOT NULL);
      CREATE INDEX "OutboxEvent_tenantId_idx" ON "OutboxEvent" ("tenantId");`);
    await db.query(`INSERT INTO "OutboxEvent" SELECT 'a' || g, 'A', 'producto.actualizado@1', jsonb_build_object('clave', 'producto:v' || g) FROM generate_series(1, 2000) g`);
    await db.query(`INSERT INTO "OutboxEvent" SELECT 'o' || g, 'T' || (g % 50), 'producto.actualizado@1', jsonb_build_object('clave', 'producto:o' || g) FROM generate_series(1, 100000) g`);
    await db.exec(`ANALYZE "OutboxEvent"`);

    const claves = Array.from({ length: 2000 }, (_, i) => `producto:v${i * 2}`);
    const params = [claves.map(() => "A"), claves.map(() => "producto.actualizado@1"), claves, ["A"]];
    const plan = (await db.query<{ "QUERY PLAN": string }>(`EXPLAIN ${SQL_YA_ESTAN_DEL_LOTE}`, params)).rows.map((r) => r["QUERY PLAN"]).join("\n");
    assert.doesNotMatch(plan, /Seq Scan on "OutboxEvent"/, plan);

    // Y sigue encontrando lo ya escrito del negocio (claves pares 2..2000 → 1000), nada de otro.
    const ya = await db.query<{ i: number }>(SQL_YA_ESTAN_DEL_LOTE, params);
    assert.equal(ya.rows.length, 1000);
    const deOtro = await db.query<{ i: number }>(SQL_YA_ESTAN_DEL_LOTE, [["A"], ["producto.actualizado@1"], ["producto:o1"], ["A"]]);
    assert.equal(deOtro.rows.length, 0);
  } finally {
    await db.close();
  }
});
