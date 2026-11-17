-- Proyectos · «Registrar cobro»: cada envío del formulario lleva una clave propia, generada en el navegador. Si el
-- mismo envío llega dos veces (doble clic, reintento después de un corte), el segundo encuentra el cobro ya grabado
-- y lo devuelve en vez de grabarlo de nuevo (src/lib/proyectos/acciones.ts → registrarCobro).
--
-- ADITIVA: una columna nullable en "ProyectoPago", sin default y sin backfill (no toca datos), y un índice único por
-- negocio. Los cobros existentes quedan con NULL y Postgres no compara NULL en un índice único: no choca nada.
-- Idempotente (`IF NOT EXISTS`). RLS: viaja en la fila de "ProyectoPago", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código graba el cobro como hoy, sin clave: las lecturas de "ProyectoPago" nombran sus
-- columnas (pago-columnas.ts) y, si la columna falta (P2022), registrarCobro reintenta sin ella.
--
-- Vuelta atrás: DROP INDEX IF EXISTS "ProyectoPago_tenantId_claveEnvio_key";
--               ALTER TABLE "ProyectoPago" DROP COLUMN IF EXISTS "claveEnvio";

ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "claveEnvio" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoPago_tenantId_claveEnvio_key" ON "ProyectoPago"("tenantId", "claveEnvio");
