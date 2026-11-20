-- Vuelta atrás de M5 (sólo si se decide deshacerla; NO es parte de `migrate deploy`). Borra únicamente las 4 tablas
-- nuevas: las liquidaciones de proyecto, sus líneas, ajustes y saldos se pierden. Antes: sacar de los `extras` de las
-- liquidaciones mensuales las líneas «Proyecto · …» que no estén pagadas (la mensual no tiene FK hacia estas tablas).
-- Después: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261121100000_mia_m5_liquidacion_proyecto';
DROP TABLE IF EXISTS "ProyectoSaldoAFavor";
DROP TABLE IF EXISTS "ProyectoLiquidacionProyectoAjuste";
DROP TABLE IF EXISTS "ProyectoLiquidacionProyectoLinea";
DROP TABLE IF EXISTS "ProyectoLiquidacionProyecto";
