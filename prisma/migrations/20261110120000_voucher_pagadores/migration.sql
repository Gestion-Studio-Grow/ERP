-- Quién es la administración de vouchers (CH · La Alameda, orden de la orquestadora 10/11/2026): los CUIT/CUIL/
-- CBU/CVU (sólo dígitos) desde los que paga. Todo crédito de esos pagadores (aviso de Mercado Pago o extracto)
-- va a «revision» y no se factura solo, sin importar el orden de los eventos ni el monto. Lista vacía =
-- criterio de monto y fecha, como hasta ahora.
--
-- ADITIVA: una columna TEXT[] NOT NULL con default '{}' en "BusinessSettings"; las filas existentes quedan
-- con la lista vacía (mismo comportamiento que hoy). Idempotente (`IF NOT EXISTS`).
-- RLS: viaja en la fila de "BusinessSettings", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código lee la columna con SQL crudo tolerante
-- (src/lib/vouchers/pagadores-administracion.ts): ausente = sin pagadores, y la pantalla avisa que falta un
-- paso de base de datos para guardarlos.
--
-- Vuelta atrás: ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "voucherPagadores";

ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "voucherPagadores" TEXT[] NOT NULL DEFAULT '{}';
