-- Vuelta atrás de M7b (sólo si se decide deshacerla; NO es parte de `migrate deploy`). Borra únicamente las 3 tablas
-- nuevas: las fechas por etapa, las obligaciones y las cancelaciones cargadas se pierden. Un proyecto cancelado sigue
-- fuera del tablero (su `perdidoEl` y su motivo «Cancelado: …» viven en Proyecto, que esta migración no toca).
-- Después: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120140000_mia_m7b_etapas';
DROP TABLE IF EXISTS "ProyectoCancelacion";
DROP TABLE IF EXISTS "ProyectoObligacion";
DROP TABLE IF EXISTS "ProyectoEtapaFecha";
