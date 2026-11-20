-- Vuelta atrás de M3 (MIA T07). Borra SÓLO lo que M3 creó: las 2 tablas, el trigger y su función. No toca datos de
-- ninguna tabla existente. Se pierden los totales escritos a mano y las fotos de las aprobaciones hechas después de aplicar.
-- Después de correrla: `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120100000_mia_m3_foto';`
DROP TABLE IF EXISTS "ProyectoPrecioFoto";
DROP TABLE IF EXISTS "ProyectoPrecio";
DROP FUNCTION IF EXISTS "proyecto_precio_foto_inmutable"();
