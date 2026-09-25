-- ROLLBACK de 20260925150000_comprobante_autorizado_inmutable (ENG-022). Manual, como dueño de
-- las tablas (neondb_owner). Probado en src/lib/comprobante-autorizado-inmutable-postgres.test.ts.
--
-- Saca el trigger y su función. No toca columnas ni datos: ninguna fila cambia. Después de
-- correrlo, un comprobante con CAE vuelve a quedar protegido SÓLO por el código (invoice-core.ts).
-- Borra además el registro de la migración en _prisma_migrations para que la base diga la verdad
-- y un `prisma migrate deploy` posterior la vuelva a aplicar.

BEGIN;
DROP TRIGGER IF EXISTS "Invoice_comprobante_autorizado_inmutable" ON "Invoice";
DROP FUNCTION IF EXISTS "comprobante_autorizado_inmutable"();
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260925150000_comprobante_autorizado_inmutable';
COMMIT;
