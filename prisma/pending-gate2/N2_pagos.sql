-- ============================================================================
-- N2_pagos — PagoExterno: conciliación persistida de pagos de proveedores (paso 4 de 7)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01) · ADR-018
-- ============================================================================
--
-- QUIÉN LA USA: P5 (Mercado Pago multi-negocio: conciliación persistida, idempotencia por
-- payment_id entre procesos) · M2 (cobro del pedido a distancia por MP) · B3 (seña y cobro
-- del club por MP: el webhook aplica la seña). Diseño: PLAN-REINGENIERIA-N2 §4.2 punto 5.
--
-- ── DECISIÓN S2-C4 (pregunta P-8): SE CREA `PagoExterno`; `Payment` NO se extiende ──────────
-- Se leyó `model Payment` (prisma/schema.prisma, "model Payment {", hoy línea 795):
--   id, tenantId, appointmentId (NOT NULL y @unique), amount (Float), method (PaymentMethod),
--   status (PaymentStatus), mpPaymentId?, mpPreferenceId?, comprobanteNro?, createdAt,
--   updatedAt, cashMovements[].
-- No sirve para la conciliación del nivel 2 por cuatro motivos:
--   1. Está atado a UN TURNO: `appointmentId` es obligatorio y único. Los pagos de M2 son de
--      un PEDIDO (Order) y los de B3 son señas de una reserva del CLUB, que vive en la foto
--      del club, no en Appointment. Extenderlo obligaría a volver nullable `appointmentId`
--      (cambio NO aditivo sobre una tabla con plata viva) y a sumar una FK por cada destino.
--   2. No tiene proveedor ni conexión: `mpPaymentId` es específico de MP y no es único, así
--      que no da la idempotencia `(tenantId, proveedor, idExterno)` que exige R-5 (doble
--      aplicación de un pago entre dos procesos).
--   3. `amount` es Float; la plata nueva va en Decimal(14,2) (ADR-057).
--   4. Su ciclo (`status` PENDING/APPROVED…) es el del cobro del turno; el de conciliación
--      necesita "aplicado al Core" (`aplicadoEn`) y "devuelto" (`devueltoEn`) por separado.
-- Por eso: `PagoExterno` = la verdad de lo que dijo el proveedor (una fila por pago externo),
-- y el cobro del Core (Payment del turno, Order.paid, seña del club, CashMovement) se aplica
-- desde el despachante. `Payment` queda como está; un PagoExterno de un turno puede guardar
-- el id del Payment en `referencia`. Reversible: tabla nueva, se borra sin tocar nada vivo.
--
-- IDEMPOTENCIA (plata): UNIQUE (tenantId, proveedor, idExterno). Dos webhooks del mismo
-- payment_id (reintento de MP, dos procesos) → un solo INSERT gana (ON CONFLICT DO NOTHING);
-- aplicar el cobro es `UPDATE … SET "aplicadoEn" = now() WHERE "aplicadoEn" IS NULL
-- RETURNING` → un solo proceso lo aplica. Probado con dos negocios y doble envío en
-- src/lib/schema-probe/paquete-gate2.test.ts.
--
-- ADITIVA (una tabla nueva) · IDEMPOTENTE (IF NOT EXISTS + guardas DO) · una transacción.
-- TOLERANCIA: hayTabla("PagoExterno") false → P5 concilia sólo con EventoIntegracion (como
-- hoy) y el cobro sigue por el camino actual.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "PagoExterno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conexionId" TEXT,                       -- conexión del negocio que recibió el pago (NULL = credencial vieja por env)
    "proveedor" TEXT NOT NULL,               -- "mercadopago" (minúsculas, como el id del conector)
    "idExterno" TEXT NOT NULL,               -- payment_id del proveedor
    "estado" TEXT NOT NULL,                  -- approved | pending | rejected | refunded | charged_back… (texto del proveedor)
    "monto" DECIMAL(14,2) NOT NULL,          -- ADR-057: plata en Decimal(14,2), nunca Float
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "referencia" TEXT,                       -- external_reference: "pedido:<id>", "reserva:<id>", "turno:<paymentId>"
    "aplicadoEn" TIMESTAMP(3),               -- cuándo el Core aplicó el cobro (una sola vez)
    "devueltoEn" TIMESTAMP(3),               -- cuándo se registró la devolución/contracargo
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoExterno_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagoExterno_tenantId_proveedor_idExterno_key" ON "PagoExterno"("tenantId", "proveedor", "idExterno");
CREATE INDEX IF NOT EXISTS "PagoExterno_tenantId_idx" ON "PagoExterno"("tenantId");
CREATE INDEX IF NOT EXISTS "PagoExterno_tenantId_referencia_idx" ON "PagoExterno"("tenantId", "referencia");

-- Un pago externo no tiene monto negativo (la devolución se marca con `devueltoEn`).
DO $$ BEGIN
  ALTER TABLE "PagoExterno" ADD CONSTRAINT "PagoExterno_monto_no_negativo" CHECK ("monto" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PagoExterno" ADD CONSTRAINT "PagoExterno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Compuesta: la conexión tiene que ser DEL MISMO negocio. Con conexionId NULL no se verifica
-- (MATCH SIMPLE) — es el caso de la credencial de MP por variable de entorno.
DO $$ BEGIN
  ALTER TABLE "PagoExterno" ADD CONSTRAINT "PagoExterno_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS (misma policy que prisma/rls/0001_enable_rls.sql; el paso 7 la re-pone igual).
ALTER TABLE "PagoExterno" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PagoExterno";
CREATE POLICY tenant_isolation ON "PagoExterno"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA. ⚠️ Borra la conciliación: sólo el día D, antes de que entre el primer pago por
-- conexión. Si ya hay filas, exportarlas antes (COPY "PagoExterno" TO …) — es rastro de plata.
--   BEGIN;
--   DROP TABLE IF EXISTS "PagoExterno";
--   COMMIT;
-- Modelo para schema.prisma: bloque `// N2:` (N2_pagos) de prisma/schema.prisma.
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
