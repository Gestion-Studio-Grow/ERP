-- Contacto captado por una campaña presencial (QR del evento).
-- Vive aparte de "Client": es un contacto de marketing, no una clienta del negocio.
CREATE TABLE "LeadCampania" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campania" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "instagram" TEXT,
    "aceptaDifusion" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCampania_pkey" PRIMARY KEY ("id")
);

-- Una inscripción por teléfono y campaña: hace el alta idempotente.
CREATE UNIQUE INDEX "LeadCampania_tenantId_campania_telefono_key"
    ON "LeadCampania"("tenantId", "campania", "telefono");

CREATE INDEX "LeadCampania_tenantId_campania_idx"
    ON "LeadCampania"("tenantId", "campania");

ALTER TABLE "LeadCampania"
    ADD CONSTRAINT "LeadCampania_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── AISLAMIENTO: esta migración protege la tabla en el mismo acto ───────────
--
-- Hasta acá, NINGUNA de las 21 migraciones que crean una tabla con `tenantId` prendía RLS.
-- No fue un leak porque `prisma/rls/0001_enable_rls.sql` es data-driven —le pone policy a
-- toda tabla con `tenantId`— y se re-corría después. Pero eso deja la protección dependiendo
-- de que alguien se acuerde: entre `migrate deploy` y el re-run de 0001, la tabla nueva
-- existe sin policy. Para ésta, que todavía no se aplicó a Neon, se emite acá.
--
-- Y no es una tabla cualquiera: `LeadCampania` guarda teléfono y consentimiento de difusión
-- de gente que dejó sus datos en un evento, y hay un export CSV. Es el peor dato del sistema
-- para que se cruce entre negocios.
--
-- MISMA policy `tenant_isolation` que 0001, con el mismo criterio: filtra por el GUC
-- `app.current_tenant_id` que setea `tenantTransaction` por request (`src/lib/rls.ts`).
-- Idempotente (DROP IF EXISTS + CREATE). Fail-closed: sin contexto de tenant no se ve ni se
-- escribe nada. No aplica al owner salvo FORCE RLS — el enforcement real lo da conectar como
-- `app_rls`, igual que en 0001.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE "LeadCampania" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON "LeadCampania"';
  EXECUTE 'CREATE POLICY tenant_isolation ON "LeadCampania" '
       || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
       || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))';
END $$;
