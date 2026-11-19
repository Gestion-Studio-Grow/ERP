-- M1 · MIA-50 T05 (GSG-MIA-124): comprobantes de proveedor, adjunto, líneas de imputación, enlace cuota ↔ comprobante,
-- orden de pago con numeración correlativa por negocio y el rastro del asiento de caja de la orden.
-- ADITIVA: crea 7 tablas nuevas; en tablas existentes sólo agrega una columna nula a "CashMovement" (con su índice
-- único y su FK) y un índice único (id, tenantId) a "ProyectoCuota" ("id" ya es único: no cambia datos ni falla).
-- Plata en centavos enteros (BIGINT). Cada tabla nueva: "tenantId", política por negocio con RLS FORZADA y FKs
-- compuestas (id, tenantId) que no dejan cruzar de negocio. Sin esta migración, el código lo dice y no se cae.
-- Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql en esta carpeta.

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "proyectoOrdenPagoId" TEXT;

-- CreateTable
CREATE TABLE "ProyectoComprobante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "netoCentavos" BIGINT NOT NULL,
    "ivaCentavos" BIGINT NOT NULL DEFAULT 0,
    "totalCentavos" BIGINT NOT NULL,
    "detalle" TEXT NOT NULL DEFAULT '',
    "vinculada" BOOLEAN NOT NULL DEFAULT false,
    "referenciaVinculada" TEXT,
    "modeloCompra" TEXT,
    "modeloCompraProvisional" BOOLEAN NOT NULL DEFAULT false,
    "claveEnvio" TEXT,
    "cargadoPorId" TEXT NOT NULL,
    "cargadoNombre" TEXT NOT NULL,
    "anuladoEl" TIMESTAMP(3),
    "anuladoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoComprobanteAdjunto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoComprobanteAdjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoComprobanteLinea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "destino" TEXT NOT NULL,
    "proyectoId" TEXT,
    "sector" TEXT,
    "categoria" TEXT NOT NULL,
    "detalle" TEXT NOT NULL DEFAULT '',
    "netoCentavos" BIGINT NOT NULL,
    "ivaCentavos" BIGINT NOT NULL DEFAULT 0,
    "ivaTratamiento" TEXT NOT NULL,
    "ivaProvisional" BOOLEAN NOT NULL DEFAULT false,
    "costoCentavos" BIGINT NOT NULL,
    "adicional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoComprobanteLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoCuotaComprobante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCuotaComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoOrdenPago" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "supplierId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "totalCentavos" BIGINT NOT NULL,
    "medio" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "claveEnvio" TEXT,
    "creadaPorId" TEXT NOT NULL,
    "creadaNombre" TEXT NOT NULL,
    "aprobadaPorId" TEXT,
    "aprobadaNombre" TEXT,
    "pagadaEl" TIMESTAMP(3),
    "anuladaEl" TIMESTAMP(3),
    "anuladaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoOrdenPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoOrdenPagoLinea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "cuotaId" TEXT,
    "importeCentavos" BIGINT NOT NULL,

    CONSTRAINT "ProyectoOrdenPagoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoNumerador" (
    "tenantId" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProyectoNumerador_pkey" PRIMARY KEY ("tenantId","serie")
);

-- CreateIndex
CREATE INDEX "ProyectoComprobante_tenantId_fecha_idx" ON "ProyectoComprobante"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "ProyectoComprobante_tenantId_referenciaVinculada_idx" ON "ProyectoComprobante"("tenantId", "referenciaVinculada");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoComprobante_tenantId_supplierId_tipo_numero_key" ON "ProyectoComprobante"("tenantId", "supplierId", "tipo", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoComprobante_tenantId_claveEnvio_key" ON "ProyectoComprobante"("tenantId", "claveEnvio");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoComprobante_id_tenantId_key" ON "ProyectoComprobante"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProyectoComprobanteAdjunto_tenantId_idx" ON "ProyectoComprobanteAdjunto"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoComprobanteAdjunto_comprobanteId_tenantId_key" ON "ProyectoComprobanteAdjunto"("comprobanteId", "tenantId");

-- CreateIndex
CREATE INDEX "ProyectoComprobanteLinea_tenantId_comprobanteId_idx" ON "ProyectoComprobanteLinea"("tenantId", "comprobanteId");

-- CreateIndex
CREATE INDEX "ProyectoComprobanteLinea_tenantId_proyectoId_idx" ON "ProyectoComprobanteLinea"("tenantId", "proyectoId");

-- CreateIndex
CREATE INDEX "ProyectoCuotaComprobante_tenantId_comprobanteId_idx" ON "ProyectoCuotaComprobante"("tenantId", "comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoCuotaComprobante_cuotaId_tenantId_key" ON "ProyectoCuotaComprobante"("cuotaId", "tenantId");

-- CreateIndex
CREATE INDEX "ProyectoOrdenPago_tenantId_supplierId_idx" ON "ProyectoOrdenPago"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoOrdenPago_tenantId_numero_key" ON "ProyectoOrdenPago"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoOrdenPago_tenantId_claveEnvio_key" ON "ProyectoOrdenPago"("tenantId", "claveEnvio");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoOrdenPago_id_tenantId_key" ON "ProyectoOrdenPago"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProyectoOrdenPagoLinea_tenantId_ordenId_idx" ON "ProyectoOrdenPagoLinea"("tenantId", "ordenId");

-- CreateIndex
CREATE INDEX "ProyectoOrdenPagoLinea_tenantId_comprobanteId_idx" ON "ProyectoOrdenPagoLinea"("tenantId", "comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoOrdenPagoId_type_key" ON "CashMovement"("tenantId", "proyectoOrdenPagoId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoCuota_id_tenantId_key" ON "ProyectoCuota"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoOrdenPagoId_tenantId_fkey" FOREIGN KEY ("proyectoOrdenPagoId", "tenantId") REFERENCES "ProyectoOrdenPago"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobante" ADD CONSTRAINT "ProyectoComprobante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobante" ADD CONSTRAINT "ProyectoComprobante_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobanteAdjunto" ADD CONSTRAINT "ProyectoComprobanteAdjunto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobanteAdjunto" ADD CONSTRAINT "ProyectoComprobanteAdjunto_comprobanteId_tenantId_fkey" FOREIGN KEY ("comprobanteId", "tenantId") REFERENCES "ProyectoComprobante"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobanteLinea" ADD CONSTRAINT "ProyectoComprobanteLinea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobanteLinea" ADD CONSTRAINT "ProyectoComprobanteLinea_comprobanteId_tenantId_fkey" FOREIGN KEY ("comprobanteId", "tenantId") REFERENCES "ProyectoComprobante"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComprobanteLinea" ADD CONSTRAINT "ProyectoComprobanteLinea_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuotaComprobante" ADD CONSTRAINT "ProyectoCuotaComprobante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuotaComprobante" ADD CONSTRAINT "ProyectoCuotaComprobante_cuotaId_tenantId_fkey" FOREIGN KEY ("cuotaId", "tenantId") REFERENCES "ProyectoCuota"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuotaComprobante" ADD CONSTRAINT "ProyectoCuotaComprobante_comprobanteId_tenantId_fkey" FOREIGN KEY ("comprobanteId", "tenantId") REFERENCES "ProyectoComprobante"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoOrdenPago" ADD CONSTRAINT "ProyectoOrdenPago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoOrdenPago" ADD CONSTRAINT "ProyectoOrdenPago_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoOrdenPagoLinea" ADD CONSTRAINT "ProyectoOrdenPagoLinea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoOrdenPagoLinea" ADD CONSTRAINT "ProyectoOrdenPagoLinea_ordenId_tenantId_fkey" FOREIGN KEY ("ordenId", "tenantId") REFERENCES "ProyectoOrdenPago"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoOrdenPagoLinea" ADD CONSTRAINT "ProyectoOrdenPagoLinea_comprobanteId_tenantId_fkey" FOREIGN KEY ("comprobanteId", "tenantId") REFERENCES "ProyectoComprobante"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoOrdenPagoLinea" ADD CONSTRAINT "ProyectoOrdenPagoLinea_cuotaId_tenantId_fkey" FOREIGN KEY ("cuotaId", "tenantId") REFERENCES "ProyectoCuota"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoNumerador" ADD CONSTRAINT "ProyectoNumerador_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Reglas de integridad que la base garantiza (plan § 4.2) ──
ALTER TABLE "ProyectoComprobante" ADD CONSTRAINT "ProyectoComprobante_montos_check"
  CHECK ("netoCentavos" >= 0 AND "ivaCentavos" >= 0 AND "totalCentavos" = "netoCentavos" + "ivaCentavos" AND "totalCentavos" > 0);
ALTER TABLE "ProyectoComprobanteLinea" ADD CONSTRAINT "ProyectoComprobanteLinea_destino_check"
  CHECK (("destino" = 'PROYECTO' AND "proyectoId" IS NOT NULL) OR ("destino" = 'ADMINISTRACION' AND "proyectoId" IS NULL));
ALTER TABLE "ProyectoComprobanteLinea" ADD CONSTRAINT "ProyectoComprobanteLinea_iva_check"
  CHECK ("ivaTratamiento" IN ('CREDITO', 'COSTO') AND "netoCentavos" >= 0 AND "ivaCentavos" >= 0
    AND "costoCentavos" = CASE WHEN "ivaTratamiento" = 'COSTO' THEN "netoCentavos" + "ivaCentavos" ELSE "netoCentavos" END);
ALTER TABLE "ProyectoOrdenPago" ADD CONSTRAINT "ProyectoOrdenPago_check"
  CHECK ("estado" IN ('PENDIENTE', 'PAGADA', 'ANULADA') AND "totalCentavos" > 0 AND "numero" > 0);
ALTER TABLE "ProyectoOrdenPagoLinea" ADD CONSTRAINT "ProyectoOrdenPagoLinea_importe_check" CHECK ("importeCentavos" > 0);

-- ── Aislamiento por negocio: política por tenant y RLS FORZADA (también para el dueño de las tablas) ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ProyectoComprobante', 'ProyectoComprobanteAdjunto', 'ProyectoComprobanteLinea', 'ProyectoCuotaComprobante', 'ProyectoOrdenPago', 'ProyectoOrdenPagoLinea', 'ProyectoNumerador'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rls', t);
    END IF;
  END LOOP;
END $$;
