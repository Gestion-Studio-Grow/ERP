-- Vuelta atrás de M2 (MIA T06). Borra SÓLO lo que M2 creó: las 4 tablas nuevas y el índice parcial. No toca datos de
-- ninguna tabla existente. Se pierden los adicionales, el detalle de las líneas y los estados de la previsión cargados
-- después de aplicar M2. Después de correrla: `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261119110000_mia_m2_presupuesto';`
DROP TABLE IF EXISTS "ProyectoPrevisionEstado";
DROP TABLE IF EXISTS "ProyectoAdicionalLinea";
DROP TABLE IF EXISTS "ProyectoAdicional";
DROP TABLE IF EXISTS "ProyectoLineaDetalle";
DROP INDEX IF EXISTS "ProyectoPresupuesto_una_base_aprobada";
