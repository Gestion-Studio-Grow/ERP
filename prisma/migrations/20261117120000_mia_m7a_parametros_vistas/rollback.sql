-- Vuelta atrás de M7a (sólo si se decide deshacerla; NO es parte de `migrate deploy`). Borra únicamente las 3 tablas
-- nuevas: los parámetros y vistas cargados se pierden y el módulo vuelve a leer los valores del rubro.
-- Después: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261117120000_mia_m7a_parametros_vistas';
DROP TABLE IF EXISTS "ProyectoVista";
DROP TABLE IF EXISTS "ProyectoParametroHistorial";
DROP TABLE IF EXISTS "ProyectoParametro";
