-- Contabilidad, ola 2 — T0 de Contabilidad + Control de gestión (GSG-CTRL-001, Factory-GSG
-- 20-PRODUCTO/control-de-gestion-DISENO-FINAL.md §3 T0 y control-de-gestion-EMPRESAS.md §2.2).
--
-- ADITIVA: sólo ADD COLUMN nullable, tablas nuevas con RLS, índices y CHECKs sobre columnas nuevas.
-- No toca datos ni columnas existentes, no hay DROP ni ALTER TYPE. Escrita SIN aplicar (Gate 2).
-- El código tolera su ausencia: con el interruptor «contabilidad» apagado no se lee nada; prendido
-- y sin esta migración, P2021/P2022 → «migración pendiente» (src/lib/contabilidad/repo.ts).
-- Requiere 20261104122000_contabilidad_ola1 aplicada (FK a "CuentaContable").
--
--   · CuentaContable: rubro RT 54, plazo, función, monetaria, ritmo, nombre del dueño y
--     monedaCuenta (nivel Corporativo; NULL = ARS).
--   · AsientoLinea.fechaOrigen: fecha de origen de la partida no monetaria (ajuste por inflación, T8).
--   · CuentaRol: qué cuenta cumple cada rol de las reglas, uno por negocio.
--   · ConfigContable: nivel PYME · CORPORATIVO + capacidades (JSON) + rubro del plan sembrado.
--
-- Columnas de AsientoLinea con trigger de inmutabilidad (ola 1): ADD COLUMN no dispara triggers
-- y con NULL no reescribe la tabla.

-- AlterTable
ALTER TABLE "CuentaContable" ADD COLUMN     "funcion" TEXT,
ADD COLUMN     "monedaCuenta" TEXT,
ADD COLUMN     "monetaria" BOOLEAN,
ADD COLUMN     "nombreDueno" TEXT,
ADD COLUMN     "plazo" TEXT,
ADD COLUMN     "ritmo" TEXT,
ADD COLUMN     "rubro" TEXT;

-- AlterTable
ALTER TABLE "AsientoLinea" ADD COLUMN     "fechaOrigen" DATE;

-- CreateTable
CREATE TABLE "CuentaRol" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaRol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigContable" (
    "tenantId" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'PYME',
    "capacidades" JSONB NOT NULL DEFAULT '{}',
    "rubroNegocio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigContable_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "CuentaRol_tenantId_cuentaId_idx" ON "CuentaRol"("tenantId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaRol_tenantId_rol_key" ON "CuentaRol"("tenantId", "rol");

-- AddForeignKey
ALTER TABLE "CuentaRol" ADD CONSTRAINT "CuentaRol_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaRol" ADD CONSTRAINT "CuentaRol_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Reglas que la base sostiene aunque el código se equivoque ───────────────────────────────
-- Sobre columnas nuevas (todas NULL): validan al instante sin recorrer datos viejos.

ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_plazo_check"
  CHECK ("plazo" IS NULL OR "plazo" IN ('CORRIENTE', 'NO_CORRIENTE'));
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_funcion_check"
  CHECK ("funcion" IS NULL OR "funcion" IN ('COSTO', 'COMERCIALIZACION', 'ADMINISTRACION', 'FINANCIACION'));
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_ritmo_check"
  CHECK ("ritmo" IS NULL OR "ritmo" IN ('FIJO_MENSUAL', 'VARIABLE'));
-- El catálogo de rubros RT 54 puede crecer sin migración: acá sólo la forma.
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_rubro_check"
  CHECK ("rubro" IS NULL OR "rubro" ~ '^[A-Z][A-Z_]*$');
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_monedaCuenta_check"
  CHECK ("monedaCuenta" IS NULL OR "monedaCuenta" ~ '^[A-Z]{3}$');

ALTER TABLE "CuentaRol" ADD CONSTRAINT "CuentaRol_rol_check" CHECK ("rol" ~ '^[A-Z][A-Z_]*$');

ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_nivel_check" CHECK ("nivel" IN ('PYME', 'CORPORATIVO'));
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_capacidades_check" CHECK (jsonb_typeof("capacidades") = 'object');
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_rubroNegocio_check"
  CHECK ("rubroNegocio" IS NULL OR "rubroNegocio" IN ('comercio', 'servicios', 'club', 'agencia'));

-- ── RLS: misma policy que el resto (prisma/rls/0001_enable_rls.sql la recrea igual) ───────────

ALTER TABLE "CuentaRol" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CuentaRol";
CREATE POLICY tenant_isolation ON "CuentaRol"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ConfigContable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ConfigContable";
CREATE POLICY tenant_isolation ON "ConfigContable"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
