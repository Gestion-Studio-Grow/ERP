-- Conteo previo a M2 (MIA T06): proyectos con dos o más versiones APROBADAS. Sólo lee. Con resultado > 0 la migración
-- frena sola; esos proyectos se resuelven antes del Gate 2. Devuelve conteos e ids, sin nombres ni importes.
SELECT "tenantId", "proyectoId", COUNT(*) AS aprobadas, array_agg("version" ORDER BY "version") AS versiones
FROM "ProyectoPresupuesto"
WHERE "estado" = 'APROBADO'
GROUP BY "tenantId", "proyectoId"
HAVING COUNT(*) > 1
ORDER BY "tenantId", "proyectoId";
