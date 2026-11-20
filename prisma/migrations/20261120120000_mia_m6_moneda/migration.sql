-- M6 · MIA-50 T08 (GSG-MIA-150): moneda. Historial del cambio por día (O39) y la foto en pesos de cada cobro, pago,
-- comprobante y orden de pago en otra moneda: original, cambio, pesos y diferencia de cambio (O31).
-- ADITIVA: crea 2 tablas nuevas; no toca tablas existentes. Plata y cambio en centavos enteros (BIGINT): el cambio es
-- «centavos de peso por 1 unidad» (US$ 1 = $ 1.000,50 → 100050). Cada tabla: "tenantId", RLS FORZADA por negocio.
-- Sin esta migración el código sigue con el cambio único de "ProyectoTipoCambio" y lo avisa; no se cae.
-- Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql en esta carpeta.

-- CreateTable
CREATE TABLE "ProyectoCambioDia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "centavosPorUnidad" BIGINT NOT NULL,
    "cargadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCambioDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoMovMoneda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origenTipo" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "originalCentavos" BIGINT NOT NULL,
    "cambioCentavos" BIGINT NOT NULL,
    "cambioDia" TEXT,
    "pesosCentavos" BIGINT NOT NULL,
    "diferenciaCentavos" BIGINT NOT NULL DEFAULT 0,
    "criterio" TEXT,
    "criterioProvisional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoMovMoneda_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProyectoCambioDia" ADD CONSTRAINT "ProyectoCambioDia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMovMoneda" ADD CONSTRAINT "ProyectoMovMoneda_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que la base sostiene sola (no dependen del código).
ALTER TABLE "ProyectoCambioDia" ADD CONSTRAINT "ProyectoCambioDia_valido_check"
  CHECK ("centavosPorUnidad" > 0 AND "moneda" <> 'ARS' AND "dia" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE "ProyectoMovMoneda" ADD CONSTRAINT "ProyectoMovMoneda_valido_check"
  CHECK ("origenTipo" IN ('COBRO', 'PAGO', 'COMPROBANTE', 'ORDEN_PAGO')
    AND "cambioCentavos" > 0
    AND ("moneda" <> 'ARS' OR "cambioCentavos" = 100)
    AND ("criterio" IS NULL OR "criterio" IN ('MANUAL', 'DEL_COMPROBANTE', 'DEL_PAGO')));

-- RLS: política por negocio, FORZADA, y permisos al rol de la app.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ProyectoCambioDia', 'ProyectoMovMoneda'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rls', t);
    END IF;
  END LOOP;
END $$;
