-- ROLLBACK de 20261121110000_caja_libro_proyecto_inmutable (GSG-MIA-208). Manual, como dueño de las tablas
-- (neondb_owner). Probado en src/lib/proyectos/mia208-libro-protegido-postgres.test.ts.
--
-- Saca el disparador y su función. No toca columnas ni datos: ninguna fila cambia. Después de correrlo, el libro de un
-- proyecto vuelve a quedar protegido SÓLO por el código (`deleteLibroEntry`, A-06). Borra además el registro de la
-- migración en _prisma_migrations para que la base diga la verdad y un `prisma migrate deploy` posterior la reaplique.

BEGIN;
DROP TRIGGER IF EXISTS "CashMovement_proyecto_inmutable" ON "CashMovement";
DROP FUNCTION IF EXISTS "caja_libro_proyecto_inmutable"();
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261121110000_caja_libro_proyecto_inmutable';
COMMIT;
