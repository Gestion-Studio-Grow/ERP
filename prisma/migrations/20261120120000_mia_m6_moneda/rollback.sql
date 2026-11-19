-- Vuelta atrás de M6 (T08). Borra el historial del cambio y las fotos en pesos. Destructivo: lo corre sólo el dueño
-- (Gate 2), con respaldo. Después, el código vuelve solo al cambio único de "ProyectoTipoCambio".
DROP TABLE IF EXISTS "ProyectoMovMoneda", "ProyectoCambioDia";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120120000_mia_m6_moneda';
