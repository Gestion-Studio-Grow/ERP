-- ============================================================================
-- N2_hub_posterior — re-backfill de OutboxEvent.clave (paso 3b del paquete: DOS MINUTOS después
--                    del paso 3, con la app corriendo)
-- PREPARADA, NO APLICADA · Gate 2 · el mismo SQL del «PASO POSTERIOR» al pie de N2_hub.sql
-- ============================================================================
--
-- Un proceso vivo que preguntó por las columnas ANTES del paso 3 guarda «no están» 60 s
-- (TTL_NEGATIVO_MS, src/lib/schema-probe/probe.ts) y en ese rato escribe eventos con `clave` NULL y
-- la clave en `payload._clave`. Esto los completa.
--   · 1.er NOT EXISTS: deja afuera la fila de un hecho que ya tiene su clave (va por el UNIQUE).
--   · 2.º NOT EXISTS (cert. del pase, F11): de dos filas tardías del MISMO hecho completa sólo la de
--     id menor, en vez de fallar entero por el UNIQUE y dejar sin clave a las legítimas.
-- IDEMPOTENTE: se puede repetir. Esperado: «UPDATE 0» o pocas filas. El SELECT final lista los
-- duplicados (filas que quedaron con clave NULL y `_clave`): AVISAR, NO BORRAR.
-- ============================================================================

UPDATE "OutboxEvent" AS o SET "clave" = o."payload"->>'_clave'
 WHERE o."clave" IS NULL AND o."payload" ? '_clave'
   AND NOT EXISTS (SELECT 1 FROM "OutboxEvent" AS d WHERE d."tenantId" = o."tenantId" AND d."clave" = o."payload"->>'_clave')
   AND NOT EXISTS (SELECT 1 FROM "OutboxEvent" AS e WHERE e."tenantId" = o."tenantId" AND e."clave" IS NULL
                     AND e."payload"->>'_clave' = o."payload"->>'_clave' AND e.id < o.id);

SELECT id, "tenantId", "payload"->>'_clave' AS clave_duplicada
  FROM "OutboxEvent" WHERE "clave" IS NULL AND "payload" ? '_clave' ORDER BY "tenantId", id;
