-- TALLER DE STANDS (GSG-MIA-004 · T3): valor hora POR PERSONA (con vigencia) y horas cargadas por stand (= Proyecto),
-- con el valor hora congelado al cargarlas. Aditiva: dos tablas nuevas con RLS por negocio; ProyectoPersona no se toca.
-- FKs compuestas (personaId, tenantId) y (proyectoId, tenantId): la base no deja apuntar a una persona o un
-- proyecto de otro negocio. Requiere los índices únicos (id, tenantId) de `20261104121000_rendiciones`.
-- El código tolera que no existan (P2021 → aviso amable). ESCRITA, NO APLICADA (Gate 2).

CREATE TABLE "TallerValorHora" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "valorHora" DOUBLE PRECISION NOT NULL,
  "vigenteDesde" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerValorHora_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallerValorHora_valorHora_check" CHECK ("valorHora" >= 0)
);
CREATE UNIQUE INDEX "TallerValorHora_tenantId_personaId_vigenteDesde_key" ON "TallerValorHora"("tenantId", "personaId", "vigenteDesde");
CREATE INDEX "TallerValorHora_tenantId_personaId_idx" ON "TallerValorHora"("tenantId", "personaId");
ALTER TABLE "TallerValorHora" ADD CONSTRAINT "TallerValorHora_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerValorHora" ADD CONSTRAINT "TallerValorHora_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TallerHora" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "horas" DOUBLE PRECISION NOT NULL,
  "valorHoraSnap" DOUBLE PRECISION NOT NULL,
  "nota" TEXT,
  "envioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerHora_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallerHora_horas_check" CHECK ("horas" > 0 AND "horas" <= 24),
  CONSTRAINT "TallerHora_valorHoraSnap_check" CHECK ("valorHoraSnap" >= 0)
);
-- Doble clic: el formulario manda un token; la base deja una sola carga por token (NULL no choca).
CREATE UNIQUE INDEX "TallerHora_tenantId_envioId_key" ON "TallerHora"("tenantId", "envioId");
CREATE INDEX "TallerHora_tenantId_proyectoId_idx" ON "TallerHora"("tenantId", "proyectoId");
CREATE INDEX "TallerHora_tenantId_personaId_idx" ON "TallerHora"("tenantId", "personaId");
ALTER TABLE "TallerHora" ADD CONSTRAINT "TallerHora_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerHora" ADD CONSTRAINT "TallerHora_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerHora" ADD CONSTRAINT "TallerHora_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TallerValorHora" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerValorHora" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerValorHora";
CREATE POLICY tenant_isolation ON "TallerValorHora"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TallerHora" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerHora" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerHora";
CREATE POLICY tenant_isolation ON "TallerHora"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
