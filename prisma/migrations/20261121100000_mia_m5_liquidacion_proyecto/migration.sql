-- M5 · MIA T10 (plan MIA-50 § 1.3): la liquidación del proyecto. Cabecera, líneas en centavos, ajustes y saldo a favor.
-- Aditiva: sólo crea tablas nuevas; se puede correr dos veces. El código tolera su ausencia (la ficha muestra
-- «falta la base» y la liquidación mensual sigue como antes). Gate 2: escrita, SIN aplicar en Neon. Vuelta atrás:
-- rollback.sql. Plata en centavos enteros (BIGINT). Cada tabla lleva `tenantId` y la política por negocio.

-- Cabecera: una por proyecto. Nace al declarar «costos completos» (O20) y guarda la foto del costo con sus ids.
CREATE TABLE IF NOT EXISTS "ProyectoLiquidacionProyecto" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "proyectoId"      TEXT NOT NULL,
  "estado"          TEXT NOT NULL DEFAULT 'BORRADOR', -- BORRADOR · REVISADA · APROBADA
  "presupuestoId"   TEXT,
  "fotoVersion"     INTEGER,
  "totalVenta"      BIGINT NOT NULL DEFAULT 0,
  "costoReal"       BIGINT NOT NULL DEFAULT 0,
  "comprobantes"    BIGINT NOT NULL DEFAULT 0,
  "facturado"       BIGINT NOT NULL DEFAULT 0,
  "cobrado"         BIGINT NOT NULL DEFAULT 0,
  "esperado"        BIGINT NOT NULL DEFAULT 0, -- total − real: la suma de las líneas tiene que dar esto al centavo
  "costoDetalle"    JSONB,
  "parametros"      JSONB,
  "avisos"          JSONB,
  "declaradaPor"    TEXT NOT NULL,
  "declaradaNombre" TEXT NOT NULL,
  "declaradaEl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revisadaPor"     TEXT,
  "revisadaNombre"  TEXT,
  "revisadaEl"      TIMESTAMP(3),
  "notaRevision"    TEXT,
  "aprobadaPor"     TEXT,
  "aprobadaNombre"  TEXT,
  "aprobadaEl"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoLiquidacionProyecto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoLiquidacionProyecto_proyectoId_tenantId_key" ON "ProyectoLiquidacionProyecto"("proyectoId", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoLiquidacionProyecto_id_tenantId_key" ON "ProyectoLiquidacionProyecto"("id", "tenantId");
CREATE INDEX IF NOT EXISTS "ProyectoLiquidacionProyecto_tenantId_estado_idx" ON "ProyectoLiquidacionProyecto"("tenantId", "estado");

-- Líneas: una por participante de la foto del precio (la empresa con `personaId` nulo). `mensualId` = la liquidación
-- mensual que la tomó (O23); nula mientras espera «cuándo se paga».
CREATE TABLE IF NOT EXISTS "ProyectoLiquidacionProyectoLinea" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "liquidacionId" TEXT NOT NULL,
  "clave"         TEXT NOT NULL,
  "personaId"     TEXT,
  "nombre"        TEXT NOT NULL,
  "funcion"       TEXT NOT NULL,
  "comision"      BIGINT NOT NULL DEFAULT 0,
  "reparto"       BIGINT NOT NULL DEFAULT 0,
  "redondeo"      BIGINT NOT NULL DEFAULT 0,
  "rentabilidad"  BIGINT NOT NULL DEFAULT 0,
  "total"         BIGINT NOT NULL DEFAULT 0,
  "detalle"       JSONB,
  "mensualId"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoLiquidacionProyectoLinea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoLiquidacionProyectoLinea_liquidacionId_clave_key" ON "ProyectoLiquidacionProyectoLinea"("liquidacionId", "clave");
CREATE INDEX IF NOT EXISTS "ProyectoLiquidacionProyectoLinea_tenantId_personaId_idx" ON "ProyectoLiquidacionProyectoLinea"("tenantId", "personaId");
CREATE INDEX IF NOT EXISTS "ProyectoLiquidacionProyectoLinea_mensualId_idx" ON "ProyectoLiquidacionProyectoLinea"("mensualId");

-- Ajustes (los arma T12): una diferencia posterior a la aprobación, en centavos, por línea o para toda la liquidación.
CREATE TABLE IF NOT EXISTS "ProyectoLiquidacionProyectoAjuste" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "liquidacionId" TEXT NOT NULL,
  "lineaId"       TEXT,
  "motivo"        TEXT NOT NULL,
  "monto"         BIGINT NOT NULL,
  "detalle"       JSONB,
  "autorId"       TEXT NOT NULL,
  "autorNombre"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoLiquidacionProyectoAjuste_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProyectoLiquidacionProyectoAjuste_tenantId_liquidacionId_idx" ON "ProyectoLiquidacionProyectoAjuste"("tenantId", "liquidacionId");

-- Saldo a favor de la empresa (T12, defensa negativa «descuenta»): lo que una persona debe, a descontar más adelante.
CREATE TABLE IF NOT EXISTS "ProyectoSaldoAFavor" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "personaId"     TEXT NOT NULL,
  "liquidacionId" TEXT NOT NULL,
  "monto"         BIGINT NOT NULL,
  "aplicado"      BIGINT NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoSaldoAFavor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProyectoSaldoAFavor_tenantId_personaId_idx" ON "ProyectoSaldoAFavor"("tenantId", "personaId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyecto_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyecto" ADD CONSTRAINT "ProyectoLiquidacionProyecto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyecto_proyectoId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyecto" ADD CONSTRAINT "ProyectoLiquidacionProyecto_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyectoLinea_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyectoLinea" ADD CONSTRAINT "ProyectoLiquidacionProyectoLinea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyectoLinea_liquidacionId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyectoLinea" ADD CONSTRAINT "ProyectoLiquidacionProyectoLinea_liquidacionId_tenantId_fkey" FOREIGN KEY ("liquidacionId", "tenantId") REFERENCES "ProyectoLiquidacionProyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyectoLinea_personaId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyectoLinea" ADD CONSTRAINT "ProyectoLiquidacionProyectoLinea_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyectoLinea_mensualId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyectoLinea" ADD CONSTRAINT "ProyectoLiquidacionProyectoLinea_mensualId_tenantId_fkey" FOREIGN KEY ("mensualId", "tenantId") REFERENCES "ProyectoLiquidacion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyectoAjuste_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyectoAjuste" ADD CONSTRAINT "ProyectoLiquidacionProyectoAjuste_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLiquidacionProyectoAjuste_liquidacionId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLiquidacionProyectoAjuste" ADD CONSTRAINT "ProyectoLiquidacionProyectoAjuste_liquidacionId_tenantId_fkey" FOREIGN KEY ("liquidacionId", "tenantId") REFERENCES "ProyectoLiquidacionProyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoSaldoAFavor_tenantId_fkey') THEN
    ALTER TABLE "ProyectoSaldoAFavor" ADD CONSTRAINT "ProyectoSaldoAFavor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoSaldoAFavor_personaId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoSaldoAFavor" ADD CONSTRAINT "ProyectoSaldoAFavor_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoSaldoAFavor_liquidacionId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoSaldoAFavor" ADD CONSTRAINT "ProyectoSaldoAFavor_liquidacionId_tenantId_fkey" FOREIGN KEY ("liquidacionId", "tenantId") REFERENCES "ProyectoLiquidacionProyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Aislamiento por negocio (RLS forzada, misma política que el resto).
ALTER TABLE "ProyectoLiquidacionProyecto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoLiquidacionProyecto" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoLiquidacionProyecto";
CREATE POLICY tenant_isolation ON "ProyectoLiquidacionProyecto" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoLiquidacionProyectoLinea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoLiquidacionProyectoLinea" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoLiquidacionProyectoLinea";
CREATE POLICY tenant_isolation ON "ProyectoLiquidacionProyectoLinea" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoLiquidacionProyectoAjuste" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoLiquidacionProyectoAjuste" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoLiquidacionProyectoAjuste";
CREATE POLICY tenant_isolation ON "ProyectoLiquidacionProyectoAjuste" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoSaldoAFavor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoSaldoAFavor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoSaldoAFavor";
CREATE POLICY tenant_isolation ON "ProyectoSaldoAFavor" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoLiquidacionProyecto", "ProyectoLiquidacionProyectoLinea", "ProyectoLiquidacionProyectoAjuste", "ProyectoSaldoAFavor" TO app_rls;
  END IF;
END $$;
