-- Vuelta atrás de M4 (MIA T07). Borra SÓLO la tabla que M4 creó. No toca ProyectoEquipo ni ningún otro dato.
-- Se pierden los porcentajes por persona cargados después de aplicar (el reparto vuelve al inicial del negocio).
-- Después de correrla: `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261120110000_mia_m4_equipo';`
DROP TABLE IF EXISTS "ProyectoEquipoReparto";
