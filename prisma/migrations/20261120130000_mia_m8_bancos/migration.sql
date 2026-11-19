-- M8 · MIA-50 T08 (GSG-MIA-150): bancos y a cobrar. Lo que movió cada cobro, pago, orden o liquidación en una cuenta
-- (O38: el saldo sale de los movimientos, una sola vez cada uno), retenciones sufridas al cobrar (O36), enlace cuota de
-- cobro ↔ factura por tramo (O35) y, en el extracto, conciliar contra cualquier movimiento y no duplicar al reimportar.
-- ADITIVA: crea 3 tablas nuevas; en tablas existentes sólo agrega 3 columnas nulas a "ProyectoMovBanco" (con 2 índices
-- únicos que ignoran NULL: las filas viejas no chocan) y un índice único (id, tenantId) a "ProyectoCuentaBanco" ("id" ya
-- es único: no cambia datos ni falla). Plata en centavos (BIGINT). Cada tabla nueva: "tenantId", RLS FORZADA por negocio
-- y FKs compuestas (id, tenantId) que no dejan cruzar de negocio. Nada contra ARCA: el enlace sólo apunta a una factura.
-- Sin esta migración el código lo dice y no se cae. Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql.

-- AlterTable
ALTER TABLE "ProyectoMovBanco" ADD COLUMN     "huella" TEXT,
ADD COLUMN     "origenId" TEXT,
ADD COLUMN     "origenTipo" TEXT;

-- CreateTable
CREATE TABLE "ProyectoMovCuenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "origenTipo" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "importeCentavos" BIGINT NOT NULL,
    "anuladoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoMovCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoCobroRetencion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "cuotaId" TEXT,
    "retencionPagoId" TEXT,
    "tipo" TEXT NOT NULL,
    "importeCentavos" BIGINT NOT NULL,
    "certificado" TEXT,
    "cuentaComoCobrado" BOOLEAN NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "anuladoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCobroRetencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoCuotaFactura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "tramo" TEXT NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCuotaFactura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoCambioDia_tenantId_moneda_dia_key" ON "ProyectoCambioDia"("tenantId", "moneda", "dia");

-- CreateIndex
CREATE INDEX "ProyectoMovMoneda_tenantId_origenTipo_createdAt_idx" ON "ProyectoMovMoneda"("tenantId", "origenTipo", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoMovMoneda_tenantId_origenTipo_origenId_key" ON "ProyectoMovMoneda"("tenantId", "origenTipo", "origenId");

-- CreateIndex
CREATE INDEX "ProyectoMovCuenta_tenantId_cuentaId_idx" ON "ProyectoMovCuenta"("tenantId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoMovCuenta_tenantId_origenTipo_origenId_key" ON "ProyectoMovCuenta"("tenantId", "origenTipo", "origenId");

-- CreateIndex
CREATE INDEX "ProyectoCobroRetencion_tenantId_pagoId_idx" ON "ProyectoCobroRetencion"("tenantId", "pagoId");

-- CreateIndex
CREATE INDEX "ProyectoCobroRetencion_tenantId_cuotaId_idx" ON "ProyectoCobroRetencion"("tenantId", "cuotaId");

-- CreateIndex
CREATE INDEX "ProyectoCuotaFactura_tenantId_facturaId_idx" ON "ProyectoCuotaFactura"("tenantId", "facturaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoCuotaFactura_cuotaId_tenantId_key" ON "ProyectoCuotaFactura"("cuotaId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoCuentaBanco_id_tenantId_key" ON "ProyectoCuentaBanco"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoMovBanco_tenantId_origenTipo_origenId_key" ON "ProyectoMovBanco"("tenantId", "origenTipo", "origenId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoMovBanco_tenantId_cuentaId_huella_key" ON "ProyectoMovBanco"("tenantId", "cuentaId", "huella");

-- AddForeignKey
ALTER TABLE "ProyectoMovCuenta" ADD CONSTRAINT "ProyectoMovCuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMovCuenta" ADD CONSTRAINT "ProyectoMovCuenta_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "ProyectoCuentaBanco"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCobroRetencion" ADD CONSTRAINT "ProyectoCobroRetencion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuotaFactura" ADD CONSTRAINT "ProyectoCuotaFactura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuotaFactura" ADD CONSTRAINT "ProyectoCuotaFactura_cuotaId_tenantId_fkey" FOREIGN KEY ("cuotaId", "tenantId") REFERENCES "ProyectoCuota"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Llave foránea por "Invoice"("id") y no la de dos columnas, como 20261022150000_cobro_facturado: esa depende del
-- único Invoice(tenantId, id) de 20260925120000_lanzamiento_base, que tiene reversa, y M8 tiene que aplicarse igual
-- sin ella. El negocio lo cuidan la RLS de las dos tablas y el predicado tenantId de `enlazarCuotaFactura`.
ALTER TABLE "ProyectoCuotaFactura" ADD CONSTRAINT "ProyectoCuotaFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que la base sostiene sola (no dependen del código).
ALTER TABLE "ProyectoMovCuenta" ADD CONSTRAINT "ProyectoMovCuenta_valido_check"
  CHECK ("origenTipo" IN ('COBRO', 'PAGO', 'ORDEN_PAGO', 'LIQUIDACION') AND "importeCentavos" <> 0);
ALTER TABLE "ProyectoCobroRetencion" ADD CONSTRAINT "ProyectoCobroRetencion_valido_check"
  CHECK ("importeCentavos" > 0 AND length(btrim("tipo")) > 0);
ALTER TABLE "ProyectoCuotaFactura" ADD CONSTRAINT "ProyectoCuotaFactura_valido_check"
  CHECK ("tramo" IN ('ANTICIPO', 'SALDO', 'ADICIONAL'));
-- Un movimiento del extracto se concilia contra una cuota O contra un movimiento, nunca los dos; tipo e id van juntos.
ALTER TABLE "ProyectoMovBanco" ADD CONSTRAINT "ProyectoMovBanco_origen_check"
  CHECK (("origenTipo" IS NULL) = ("origenId" IS NULL)
    AND ("origenTipo" IS NULL OR "cuotaId" IS NULL)
    AND ("origenTipo" IS NULL OR "origenTipo" IN ('COBRO', 'PAGO', 'ORDEN_PAGO', 'LIQUIDACION')));

-- RLS: política por negocio, FORZADA, y permisos al rol de la app.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ProyectoMovCuenta', 'ProyectoCobroRetencion', 'ProyectoCuotaFactura'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rls', t);
    END IF;
  END LOOP;
END $$;
