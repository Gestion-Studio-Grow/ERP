-- =============================================================================
-- PASE A PRODUCCIÓN — el lote vigente de prisma/lote-deploy.txt (hoy: 10 migraciones de MIA,
-- CRM comercial + Taller (GSG-PLAT-020), Consola de la Cuadrilla (#188) y Administración (#191),
-- tanda/mia-publicacion, GSG-PLAT-023; la aplica el build con
-- MIGRATE_DATABASE_URL, este archivo es el camino manual equivalente). Se pega en
-- PRODUCCIÓN, DESPUÉS de crear un branch de respaldo con la fecha del día
-- (Branches → Create branch → "respaldo-AAAA-MM-DD"). Gate 2: sólo con OK del dueño.
-- =============================================================================
-- Mismo SQL que el ensayo (docs/runbooks/ensayo-neon/1-lote-en-branch.sql): aplica el lote en
-- UNA transacción, lo registra en _prisma_migrations con el checksum de Prisma y frena si ya
-- estaba. Si algo falla no queda nada a medias y el error dice cuál.
-- El pase del 23/09 (las 4 migraciones de caja) quedó en el historial de git de este archivo
-- y en respaldo-2026-09-23.md.
--
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios de las tablas nuevas).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261116150000_crm_comercial', '20261116160000_crm_comercial_pronostico', '20261116200000_taller_piezas_despiece', '20261116201000_taller_horas', '20261116202000_taller_pedidos', '20261116203000_taller_consumo', '20261117010000_crm_vinculo_negocios', '20261117120000_consola_cuadrilla', '20261117120000_mia_m7a_parametros_vistas', '20261117130000_cuadrilla_correcciones')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261116150000_crm_comercial · checksum 75b977a18af6d3c8256c95499644b667e9d132e82efb441e487f4728e0c8d417 ───
-- CRM comercial (GSG-CRM-010 · diseño docs/tenants/mia-producciones/CRM-REINGENIERIA.md §2-§3): la
-- oportunidad (marca × evento, o consulta entrante) desde que se detecta hasta que se asigna a un comercial
-- y toma el cierre del proyecto; contactos cargados sólo por personas, supresión con huella, línea de
-- tiempo con registro por puesto, brief, borradores de mail/WhatsApp, cola de tareas y el permiso por
-- puesto (MiembroCrmComercial: el permiso del CRM sale de ahí, no de `clients:manage`).
-- ADITIVA: ocho tablas nuevas con RLS + columnas NULLABLES nuevas en MarcaRelevada (dominio, cuit) y
-- PedidoAlEquipo (tomadoPor, tomadoEl, cerradoEl, notaCierre). Sin enum, sin DROP (salvo DROP POLICY IF
-- EXISTS del molde), sin ALTER COLUMN, sin borrar datos. Los CHECKs nuevos sobre tablas existentes sólo
-- miran las columnas nuevas (todas NULL en las filas que ya hay): no pueden fallar al aplicarse.
-- SIN APLICAR (Gate 2). El código publicado (src/lib/eventos-sponsors) lee MarcaRelevada y PedidoAlEquipo
-- siempre con `select`, así que sigue andando con la migración ausente.
-- Vuelta atrás (en este orden):
--   DROP TABLE "TareaComercial", "BorradorMensaje", "BriefComercial", "ActividadComercial";
--   DROP TABLE "Oportunidad"; DROP TABLE "ContactoComercial", "SupresionComercial", "MiembroCrmComercial";
--   DROP INDEX "MarcaRelevada_tenantId_dominio_key", "MarcaRelevada_tenantId_cuit_key";
--   ALTER TABLE "MarcaRelevada" DROP CONSTRAINT "MarcaRelevada_dominio_check", DROP CONSTRAINT "MarcaRelevada_cuit_check",
--     DROP COLUMN "dominio", DROP COLUMN "cuit";
--   ALTER TABLE "PedidoAlEquipo" DROP CONSTRAINT "PedidoAlEquipo_toma_check", DROP CONSTRAINT "PedidoAlEquipo_notaCierre_check",
--     DROP COLUMN "tomadoPor", DROP COLUMN "tomadoEl", DROP COLUMN "cerradoEl", DROP COLUMN "notaCierre";
--   (Antes de volver atrás con datos cargados: respaldo de la rama de Neon. Las columnas nuevas de las
--   tablas existentes se pueden dejar: nadie las lee sin la migración.)

-- AlterTable
ALTER TABLE "MarcaRelevada" ADD COLUMN     "cuit" TEXT,
ADD COLUMN     "dominio" TEXT;

-- AlterTable
ALTER TABLE "PedidoAlEquipo" ADD COLUMN     "cerradoEl" TIMESTAMP(3),
ADD COLUMN     "notaCierre" TEXT,
ADD COLUMN     "tomadoEl" TIMESTAMP(3),
ADD COLUMN     "tomadoPor" TEXT;

-- AlterTable

-- CreateTable
CREATE TABLE "MiembroCrmComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "puesto" TEXT,
    "topeAccionesDia" INTEGER,
    "topeCostoDiaUsd" DECIMAL(10,4),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiembroCrmComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "marcaId" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "cargo" TEXT,
    "origen" TEXT NOT NULL,
    "cargadoPor" TEXT NOT NULL,
    "suprimidoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactoComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupresionComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "registradaPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupresionComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Oportunidad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "marcaId" TEXT,
    "eventoId" TEXT,
    "contactoId" TEXT,
    "etapa" TEXT NOT NULL,
    "etapaPrevia" TEXT,
    "duenoUserId" TEXT,
    "puntaje" INTEGER,
    "puntajeDetalle" JSONB,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "consultaTexto" TEXT,
    "identidadComprobada" BOOLEAN NOT NULL DEFAULT false,
    "destino" TEXT,
    "destinoConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "monto" DECIMAL(14,2),
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "proximoPaso" TEXT,
    "proximoPasoEl" TIMESTAMP(3),
    "fechaLimite" TIMESTAMP(3),
    "compraAtravesDeMarcaId" TEXT,
    "despertarEl" TIMESTAMP(3),
    "motivo" TEXT,
    "nota" TEXT,
    "proyectoId" TEXT,
    "pasePropuesto" TEXT,
    "pasePropuestoPor" TEXT,
    "pasePropuestoEl" TIMESTAMP(3),
    "pasePropuestoDatos" JSONB,
    "pedidosDeDatos" INTEGER NOT NULL DEFAULT 0,
    "seguimientosSinRespuesta" INTEGER NOT NULL DEFAULT 0,
    "calificadaEl" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadaPor" TEXT NOT NULL,
    "idempotencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Oportunidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oportunidadId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "puesto" TEXT,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fuenteUrl" TEXT,
    "costoUsd" DECIMAL(10,4),
    "idempotencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActividadComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oportunidadId" TEXT NOT NULL,
    "campos" JSONB NOT NULL DEFAULT '{}',
    "faltantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorradorMensaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oportunidadId" TEXT NOT NULL,
    "contactoId" TEXT,
    "canal" TEXT NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "motivoRechazo" TEXT,
    "redactadoPor" TEXT NOT NULL,
    "aprobadoPor" TEXT,
    "aprobadoEl" TIMESTAMP(3),
    "enviadoPor" TEXT,
    "enviadoEl" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "idempotencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorradorMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TareaComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oportunidadId" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EN_COLA',
    "venceEl" TIMESTAMP(3),
    "tomadaPor" TEXT,
    "tomadaEl" TIMESTAMP(3),
    "cerradaEl" TIMESTAMP(3),
    "notaCierre" TEXT,
    "creadaPor" TEXT NOT NULL,
    "idempotencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TareaComercial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiembroCrmComercial_tenantId_userId_key" ON "MiembroCrmComercial"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MiembroCrmComercial_id_tenantId_key" ON "MiembroCrmComercial"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ContactoComercial_tenantId_marcaId_idx" ON "ContactoComercial"("tenantId", "marcaId");

-- CreateIndex
CREATE INDEX "ContactoComercial_tenantId_email_idx" ON "ContactoComercial"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ContactoComercial_id_tenantId_key" ON "ContactoComercial"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupresionComercial_tenantId_huella_key" ON "SupresionComercial"("tenantId", "huella");

-- CreateIndex
CREATE INDEX "Oportunidad_tenantId_etapa_idx" ON "Oportunidad"("tenantId", "etapa");

-- CreateIndex
CREATE INDEX "Oportunidad_tenantId_duenoUserId_etapa_idx" ON "Oportunidad"("tenantId", "duenoUserId", "etapa");

-- CreateIndex
CREATE INDEX "Oportunidad_tenantId_proximoPasoEl_idx" ON "Oportunidad"("tenantId", "proximoPasoEl");

-- CreateIndex
CREATE INDEX "Oportunidad_tenantId_marcaId_idx" ON "Oportunidad"("tenantId", "marcaId");

-- CreateIndex
CREATE UNIQUE INDEX "Oportunidad_tenantId_idempotencia_key" ON "Oportunidad"("tenantId", "idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "Oportunidad_id_tenantId_key" ON "Oportunidad"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ActividadComercial_tenantId_oportunidadId_createdAt_idx" ON "ActividadComercial"("tenantId", "oportunidadId", "createdAt");

-- CreateIndex
CREATE INDEX "ActividadComercial_tenantId_usuarioId_createdAt_idx" ON "ActividadComercial"("tenantId", "usuarioId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActividadComercial_tenantId_idempotencia_key" ON "ActividadComercial"("tenantId", "idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "BriefComercial_oportunidadId_tenantId_key" ON "BriefComercial"("oportunidadId", "tenantId");

-- CreateIndex
CREATE INDEX "BorradorMensaje_tenantId_estado_createdAt_idx" ON "BorradorMensaje"("tenantId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "BorradorMensaje_tenantId_oportunidadId_idx" ON "BorradorMensaje"("tenantId", "oportunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "BorradorMensaje_tenantId_idempotencia_key" ON "BorradorMensaje"("tenantId", "idempotencia");

-- CreateIndex
CREATE INDEX "TareaComercial_tenantId_para_estado_createdAt_idx" ON "TareaComercial"("tenantId", "para", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "TareaComercial_tenantId_oportunidadId_idx" ON "TareaComercial"("tenantId", "oportunidadId");

-- CreateIndex
CREATE INDEX "TareaComercial_tenantId_tomadaPor_estado_idx" ON "TareaComercial"("tenantId", "tomadaPor", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "TareaComercial_tenantId_idempotencia_key" ON "TareaComercial"("tenantId", "idempotencia");

-- AddForeignKey
ALTER TABLE "MiembroCrmComercial" ADD CONSTRAINT "MiembroCrmComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_marcaId_tenantId_fkey" FOREIGN KEY ("marcaId", "tenantId") REFERENCES "MarcaRelevada"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupresionComercial" ADD CONSTRAINT "SupresionComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_marcaId_tenantId_fkey" FOREIGN KEY ("marcaId", "tenantId") REFERENCES "MarcaRelevada"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_eventoId_tenantId_fkey" FOREIGN KEY ("eventoId", "tenantId") REFERENCES "EventoRelevado"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_contactoId_tenantId_fkey" FOREIGN KEY ("contactoId", "tenantId") REFERENCES "ContactoComercial"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_compraAtravesDeMarcaId_tenantId_fkey" FOREIGN KEY ("compraAtravesDeMarcaId", "tenantId") REFERENCES "MarcaRelevada"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_oportunidadId_tenantId_fkey" FOREIGN KEY ("oportunidadId", "tenantId") REFERENCES "Oportunidad"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefComercial" ADD CONSTRAINT "BriefComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefComercial" ADD CONSTRAINT "BriefComercial_oportunidadId_tenantId_fkey" FOREIGN KEY ("oportunidadId", "tenantId") REFERENCES "Oportunidad"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_oportunidadId_tenantId_fkey" FOREIGN KEY ("oportunidadId", "tenantId") REFERENCES "Oportunidad"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_contactoId_tenantId_fkey" FOREIGN KEY ("contactoId", "tenantId") REFERENCES "ContactoComercial"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_oportunidadId_tenantId_fkey" FOREIGN KEY ("oportunidadId", "tenantId") REFERENCES "Oportunidad"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Valores cerrados y reglas (TEXT + CHECK: un enum en Neon es irreversible) ──────────────────────────

-- Columnas nuevas de tablas existentes (sólo miran lo nuevo; las filas actuales las tienen en NULL).
ALTER TABLE "MarcaRelevada" ADD CONSTRAINT "MarcaRelevada_dominio_check" CHECK ("dominio" IS NULL OR ("dominio" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' AND "dominio" !~ '^www\.' AND length("dominio") <= 253));
ALTER TABLE "MarcaRelevada" ADD CONSTRAINT "MarcaRelevada_cuit_check" CHECK ("cuit" IS NULL OR "cuit" ~ '^[0-9]{11}$');
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_toma_check" CHECK (("tomadoEl" IS NULL OR "tomadoPor" IS NOT NULL) AND ("tomadoPor" IS NULL OR length(btrim("tomadoPor")) > 0) AND ("cerradoEl" IS NULL OR "tomadoEl" IS NULL OR "cerradoEl" >= "tomadoEl"));
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_notaCierre_check" CHECK ("notaCierre" IS NULL OR length("notaCierre") <= 1000);

-- MiembroCrmComercial: rol y puesto; un PUESTO tiene puesto, una persona no.
ALTER TABLE "MiembroCrmComercial" ADD CONSTRAINT "MiembroCrmComercial_rol_check" CHECK ("rol" IN ('DIRECCION', 'COMERCIAL', 'PUESTO'));
ALTER TABLE "MiembroCrmComercial" ADD CONSTRAINT "MiembroCrmComercial_puesto_check" CHECK (("rol" = 'PUESTO') = ("puesto" IS NOT NULL) AND ("puesto" IS NULL OR "puesto" IN ('descubridor', 'identificador', 'verificador', 'contactos', 'redactor', 'seguidor', 'calificador', 'armador_brief')));
ALTER TABLE "MiembroCrmComercial" ADD CONSTRAINT "MiembroCrmComercial_topes_check" CHECK (("topeAccionesDia" IS NULL OR "topeAccionesDia" >= 0) AND ("topeCostoDiaUsd" IS NULL OR "topeCostoDiaUsd" >= 0));
ALTER TABLE "MiembroCrmComercial" ADD CONSTRAINT "MiembroCrmComercial_userId_check" CHECK (length(btrim("userId")) > 0);

-- ContactoComercial: origen de persona; con un canal; suprimido = anonimizado (E8).
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_origen_check" CHECK ("origen" IN ('DIRECCION', 'COMERCIAL', 'CONSULTA_ENTRANTE'));
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_textos_check" CHECK (length(btrim("nombre")) > 0 AND length("nombre") <= 200 AND length(btrim("cargadoPor")) > 0 AND ("cargo" IS NULL OR length("cargo") <= 200));
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_email_check" CHECK ("email" IS NULL OR ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND "email" = lower("email") AND length("email") <= 254));
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_telefono_check" CHECK ("telefono" IS NULL OR (length(regexp_replace("telefono", '[^0-9]', '', 'g')) BETWEEN 6 AND 15 AND length("telefono") <= 40));
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_canal_check" CHECK ("suprimidoEl" IS NOT NULL OR "email" IS NOT NULL OR "telefono" IS NOT NULL);
ALTER TABLE "ContactoComercial" ADD CONSTRAINT "ContactoComercial_supresion_check" CHECK ("suprimidoEl" IS NULL OR ("email" IS NULL AND "telefono" IS NULL AND "cargo" IS NULL AND "nombre" = '(baja)'));

-- SupresionComercial: sólo la huella (sha256 en hex), nunca el dato.
ALTER TABLE "SupresionComercial" ADD CONSTRAINT "SupresionComercial_huella_check" CHECK ("huella" ~ '^[0-9a-f]{64}$');
ALTER TABLE "SupresionComercial" ADD CONSTRAINT "SupresionComercial_tipo_check" CHECK ("tipo" IN ('EMAIL', 'TELEFONO'));
ALTER TABLE "SupresionComercial" ADD CONSTRAINT "SupresionComercial_registradaPor_check" CHECK (length(btrim("registradaPor")) > 0);

-- Oportunidad: tipo, etapas por tipo, evidencia mínima por etapa, E5 (abierta ⇒ próximo paso).
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_tipo_check" CHECK ("tipo" IN ('PROSPECTO', 'CONSULTA'));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_etapa_check" CHECK ("etapa" IN ('DETECTADA', 'VERIFICADA', 'SIN_CONTACTO', 'CONTACTADA', 'RECIBIDA', 'EN_CONVERSACION', 'FALTAN_DATOS', 'CALIFICADA', 'ASIGNADA', 'DORMIDA', 'GANADA', 'PERDIDA', 'DESCARTADA', 'DERIVADA_AL_TALLER'));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_etapa_tipo_check" CHECK (("tipo" = 'PROSPECTO' AND "marcaId" IS NOT NULL AND "etapa" <> 'RECIBIDA') OR ("tipo" = 'CONSULTA' AND "etapa" NOT IN ('DETECTADA', 'VERIFICADA', 'SIN_CONTACTO', 'CONTACTADA')));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_etapaPrevia_check" CHECK ("etapaPrevia" IS NULL OR "etapaPrevia" IN ('DETECTADA', 'VERIFICADA', 'SIN_CONTACTO', 'CONTACTADA', 'RECIBIDA', 'EN_CONVERSACION', 'FALTAN_DATOS', 'CALIFICADA', 'ASIGNADA'));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_pasePropuesto_check" CHECK ("pasePropuesto" IS NULL OR ("pasePropuesto" IN ('DETECTADA', 'VERIFICADA', 'SIN_CONTACTO', 'CONTACTADA', 'RECIBIDA', 'EN_CONVERSACION', 'FALTAN_DATOS', 'CALIFICADA', 'ASIGNADA', 'DORMIDA', 'PERDIDA', 'DESCARTADA', 'DERIVADA_AL_TALLER') AND "pasePropuestoPor" IS NOT NULL AND "pasePropuestoEl" IS NOT NULL));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_proximoPaso_check" CHECK ("etapa" IN ('DORMIDA', 'GANADA', 'PERDIDA', 'DESCARTADA', 'DERIVADA_AL_TALLER') OR ("proximoPaso" IS NOT NULL AND length(btrim("proximoPaso")) > 0 AND "proximoPasoEl" IS NOT NULL));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_dormida_check" CHECK ("etapa" <> 'DORMIDA' OR ("despertarEl" IS NOT NULL AND "motivo" IS NOT NULL AND "etapaPrevia" IS NOT NULL));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_motivo_check" CHECK (("etapa" NOT IN ('PERDIDA', 'DESCARTADA') OR "motivo" IS NOT NULL) AND ("motivo" IS NULL OR (length(btrim("motivo")) > 0 AND length("motivo") <= 120)));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_destino_check" CHECK (("destino" IS NULL OR "destino" IN ('AGENCIA', 'TALLER')) AND (NOT "destinoConfirmado" OR "destino" IS NOT NULL));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_asignada_check" CHECK ("etapa" NOT IN ('ASIGNADA', 'GANADA') OR "duenoUserId" IS NOT NULL);
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_moneda_check" CHECK ("moneda" IN ('ARS', 'USD') AND ("monto" IS NULL OR "monto" >= 0));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_contadores_check" CHECK ("version" >= 0 AND "pedidosDeDatos" >= 0 AND "seguimientosSinRespuesta" >= 0 AND ("puntaje" IS NULL OR "puntaje" >= 0));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_textos_check" CHECK (length(btrim("creadaPor")) > 0 AND ("consultaTexto" IS NULL OR length("consultaTexto") <= 10000) AND ("nota" IS NULL OR length("nota") <= 4000) AND ("proximoPaso" IS NULL OR length("proximoPaso") <= 300) AND ("idempotencia" IS NULL OR length(btrim("idempotencia")) > 0));
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_datos_check" CHECK (jsonb_typeof("datos") = 'object');
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_intermediaria_check" CHECK ("compraAtravesDeMarcaId" IS NULL OR "marcaId" IS NULL OR "compraAtravesDeMarcaId" <> "marcaId");

-- ActividadComercial: el tipo lo define el motor (formato, no lista); puesto de la lista ampliada.
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_tipo_check" CHECK ("tipo" ~ '^[A-Z][A-Z_]{1,39}$');
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_puesto_check" CHECK ("puesto" IS NULL OR "puesto" IN ('descubridor', 'identificador', 'verificador', 'contactos', 'redactor', 'seguidor', 'calificador', 'armador_brief'));
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_textos_check" CHECK (length(btrim("usuarioId")) > 0 AND length(btrim("texto")) > 0 AND length("texto") <= 4000 AND ("idempotencia" IS NULL OR length(btrim("idempotencia")) > 0));
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_fuenteUrl_check" CHECK ("fuenteUrl" IS NULL OR "fuenteUrl" ~* '^https?://');
ALTER TABLE "ActividadComercial" ADD CONSTRAINT "ActividadComercial_costoUsd_check" CHECK ("costoUsd" IS NULL OR "costoUsd" >= 0);

-- BriefComercial.
ALTER TABLE "BriefComercial" ADD CONSTRAINT "BriefComercial_campos_check" CHECK (jsonb_typeof("campos") = 'object' AND "version" >= 0);

-- BorradorMensaje: ciclo y quién firmó cada paso (E16: el enviado lo marca una persona).
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_canal_check" CHECK ("canal" IN ('MAIL', 'WHATSAPP'));
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_estado_check" CHECK ("estado" IN ('BORRADOR', 'APROBADO', 'ENVIADO_POR_PERSONA', 'RECHAZADO'));
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_ciclo_check" CHECK (
  ("estado" <> 'RECHAZADO' OR ("motivoRechazo" IS NOT NULL AND length(btrim("motivoRechazo")) > 0))
  AND ("estado" NOT IN ('APROBADO', 'ENVIADO_POR_PERSONA') OR ("aprobadoPor" IS NOT NULL AND "aprobadoEl" IS NOT NULL))
  AND ("estado" <> 'ENVIADO_POR_PERSONA' OR ("enviadoPor" IS NOT NULL AND "enviadoEl" IS NOT NULL))
  AND ("estado" = 'ENVIADO_POR_PERSONA' OR ("enviadoPor" IS NULL AND "enviadoEl" IS NULL)));
ALTER TABLE "BorradorMensaje" ADD CONSTRAINT "BorradorMensaje_textos_check" CHECK (length(btrim("cuerpo")) > 0 AND length("cuerpo") <= 10000 AND ("asunto" IS NULL OR length("asunto") <= 300) AND length(btrim("redactadoPor")) > 0 AND "version" >= 0 AND ("idempotencia" IS NULL OR length(btrim("idempotencia")) > 0));

-- TareaComercial: para quién, estado y toma (E22).
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_para_check" CHECK ("para" IN ('descubridor', 'identificador', 'verificador', 'contactos', 'redactor', 'seguidor', 'calificador', 'armador_brief', 'PERSONA', 'DIRECCION'));
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_tipo_check" CHECK ("tipo" ~ '^[A-Z][A-Z_]{1,39}$');
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_estado_check" CHECK ("estado" IN ('EN_COLA', 'EN_CURSO', 'HECHA', 'DESCARTADA'));
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_toma_check" CHECK (("estado" <> 'EN_CURSO' OR ("tomadaPor" IS NOT NULL AND "tomadaEl" IS NOT NULL)) AND ("estado" NOT IN ('HECHA', 'DESCARTADA') OR "cerradaEl" IS NOT NULL) AND ("estado" <> 'EN_COLA' OR ("tomadaPor" IS NULL AND "cerradaEl" IS NULL)));
ALTER TABLE "TareaComercial" ADD CONSTRAINT "TareaComercial_textos_check" CHECK (length(btrim("creadaPor")) > 0 AND ("notaCierre" IS NULL OR length("notaCierre") <= 1000) AND ("idempotencia" IS NULL OR length(btrim("idempotencia")) > 0));

-- ── Únicos parciales (sólo SQL; Prisma no los modela) ──────────────────────────────────────────────────

-- E1: una sola oportunidad ABIERTA por marca × evento (sin evento cuenta como uno más). Las terminales no
-- cuentan: se puede volver a prospectar la marca para la próxima edición. DORMIDA sí cuenta (está viva).
CREATE UNIQUE INDEX "Oportunidad_abierta_marca_evento_key" ON "Oportunidad"("tenantId", "marcaId", COALESCE("eventoId", ''))
  WHERE "marcaId" IS NOT NULL AND "etapa" NOT IN ('GANADA', 'PERDIDA', 'DESCARTADA', 'DERIVADA_AL_TALLER');

-- E1: la misma marca no se carga dos veces con el mismo dominio o CUIT en un negocio.
CREATE UNIQUE INDEX "MarcaRelevada_tenantId_dominio_key" ON "MarcaRelevada"("tenantId", "dominio") WHERE "dominio" IS NOT NULL;
CREATE UNIQUE INDEX "MarcaRelevada_tenantId_cuit_key" ON "MarcaRelevada"("tenantId", "cuit") WHERE "cuit" IS NOT NULL;

-- ── RLS: aislamiento por negocio (mismo molde que 20261114231500_eventos_y_sponsors) ───────────────────

ALTER TABLE "MiembroCrmComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MiembroCrmComercial";
CREATE POLICY tenant_isolation ON "MiembroCrmComercial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ContactoComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ContactoComercial";
CREATE POLICY tenant_isolation ON "ContactoComercial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "SupresionComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupresionComercial";
CREATE POLICY tenant_isolation ON "SupresionComercial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Oportunidad" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Oportunidad";
CREATE POLICY tenant_isolation ON "Oportunidad"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ActividadComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ActividadComercial";
CREATE POLICY tenant_isolation ON "ActividadComercial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "BriefComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BriefComercial";
CREATE POLICY tenant_isolation ON "BriefComercial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "BorradorMensaje" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BorradorMensaje";
CREATE POLICY tenant_isolation ON "BorradorMensaje"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TareaComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TareaComercial";
CREATE POLICY tenant_isolation ON "TareaComercial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '75b977a18af6d3c8256c95499644b667e9d132e82efb441e487f4728e0c8d417', now(), '20261116150000_crm_comercial', NULL, NULL, now(), 1);

-- ─── 20261116160000_crm_comercial_pronostico · checksum 7b6a9f6c7539667b261bfc2841691ac1af979829465d70279681664689588ab1 ───
-- CRM comercial · pronóstico y contactos con papel (GSG-CRM-011 · diseño CRM-REINGENIERIA.md §2, «campos que
-- suma la lectura de código abierto»). En la oportunidad: desde cuándo está en la etapa («días en esta etapa»),
-- su última actividad y el cierre esperado. Tabla nueva OportunidadContacto: varios contactos por oportunidad,
-- cada uno con su papel (DECIDE · PIDE · PAGA). Quién aprobó cada pase y cuándo NO suma columna: ya queda en
-- ActividadComercial (fila PASE con usuarioId y createdAt).
-- ADITIVA: tres columnas NULLABLES en Oportunidad (sin CHECK, sin DEFAULT: las filas que hay quedan en NULL)
-- y una tabla nueva con RLS. Sin enum, sin DROP (salvo DROP POLICY IF EXISTS del molde), sin ALTER COLUMN.
-- Depende de 20261116150000_crm_comercial. SIN APLICAR (Gate 2): el código la tolera ausente (esFaltaDeTabla).
-- Vuelta atrás (en este orden):
--   DROP TABLE "OportunidadContacto";
--   ALTER TABLE "Oportunidad" DROP COLUMN "etapaDesde", DROP COLUMN "ultimaActividadEl", DROP COLUMN "cierreEsperadoEl";

-- AlterTable
ALTER TABLE "Oportunidad" ADD COLUMN     "etapaDesde" TIMESTAMP(3),
ADD COLUMN     "ultimaActividadEl" TIMESTAMP(3),
ADD COLUMN     "cierreEsperadoEl" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OportunidadContacto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oportunidadId" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "vinculadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OportunidadContacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OportunidadContacto_id_tenantId_key" ON "OportunidadContacto"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OportunidadContacto_vinculo_key" ON "OportunidadContacto"("tenantId", "oportunidadId", "contactoId", "papel");

-- CreateIndex
CREATE INDEX "OportunidadContacto_tenantId_contactoId_idx" ON "OportunidadContacto"("tenantId", "contactoId");

-- AddForeignKey
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_oportunidadId_tenantId_fkey" FOREIGN KEY ("oportunidadId", "tenantId") REFERENCES "Oportunidad"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_contactoId_tenantId_fkey" FOREIGN KEY ("contactoId", "tenantId") REFERENCES "ContactoComercial"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECKs (los mismos valores que src/lib/crm-comercial/motor.ts → PAPELES) ──────────────────────────
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_papel_check" CHECK ("papel" IN ('DECIDE', 'PIDE', 'PAGA'));
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_vinculadoPor_check" CHECK (length(btrim("vinculadoPor")) > 0);

-- ── RLS: aislamiento por negocio (mismo molde que 20261116150000_crm_comercial) ─────────────────────────

ALTER TABLE "OportunidadContacto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OportunidadContacto";
CREATE POLICY tenant_isolation ON "OportunidadContacto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '7b6a9f6c7539667b261bfc2841691ac1af979829465d70279681664689588ab1', now(), '20261116160000_crm_comercial_pronostico', NULL, NULL, now(), 1);

-- ─── 20261116200000_taller_piezas_despiece · checksum dd0ca4ba38f6e72801745088636d7d46ba1b395a58f7623328c246b8e8128a8a ───
-- TALLER DE STANDS (GSG-MIA-004 · T2): catálogo de piezas con costo interno y despiece por stand (= Proyecto).
-- Aditiva: dos tablas nuevas con RLS por negocio. Ningún otro negocio las usa. El código tolera que no existan
-- (P2021 → vacío amable) hasta que se aplique. ESCRITA, NO APLICADA (Gate 2).
-- FKs compuestas (id, tenantId) a Proyecto y TallerPieza: la base misma impide un despiece con datos de otro negocio.
-- FORCE ROW LEVEL SECURITY: ni el dueño de las tablas lee un taller ajeno sin `app.current_tenant_id`.

CREATE TABLE "TallerPieza" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "unidad" TEXT NOT NULL DEFAULT 'u',
  "costoUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "horasStd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productId" TEXT,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerPieza_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerPieza_id_tenantId_key" ON "TallerPieza"("id", "tenantId");
CREATE INDEX "TallerPieza_tenantId_activa_idx" ON "TallerPieza"("tenantId", "activa");
ALTER TABLE "TallerPieza" ADD CONSTRAINT "TallerPieza_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TallerDespiece" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "piezaId" TEXT NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "costoUnitSnap" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerDespiece_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerDespiece_proyectoId_piezaId_key" ON "TallerDespiece"("proyectoId", "piezaId");
CREATE INDEX "TallerDespiece_tenantId_proyectoId_idx" ON "TallerDespiece"("tenantId", "proyectoId");
ALTER TABLE "TallerDespiece" ADD CONSTRAINT "TallerDespiece_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerDespiece" ADD CONSTRAINT "TallerDespiece_proyectoId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerDespiece" ADD CONSTRAINT "TallerDespiece_piezaId_fkey" FOREIGN KEY ("piezaId", "tenantId") REFERENCES "TallerPieza"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TallerPieza" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerPieza" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerPieza";
CREATE POLICY tenant_isolation ON "TallerPieza"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TallerDespiece" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerDespiece" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerDespiece";
CREATE POLICY tenant_isolation ON "TallerDespiece"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'dd0ca4ba38f6e72801745088636d7d46ba1b395a58f7623328c246b8e8128a8a', now(), '20261116200000_taller_piezas_despiece', NULL, NULL, now(), 1);

-- ─── 20261116201000_taller_horas · checksum 54e593a7c93f4465ad577d18d9f2db911960df0d215a4eb6ff9c40eb6435b75b ───
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

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '54e593a7c93f4465ad577d18d9f2db911960df0d215a4eb6ff9c40eb6435b75b', now(), '20261116201000_taller_horas', NULL, NULL, now(), 1);

-- ─── 20261116202000_taller_pedidos · checksum 0955041126fe884059844489b56f79574700929065c4a069007ab755a0dad133 ───
-- TALLER DE STANDS (GSG-MIA-004 · T4): pedidos de materiales a un proveedor para un stand (= Proyecto).
-- PEDIDO → RECIBIDO | ANULADO. Al recibirlo se crea UN ProyectoGasto rubro «Materiales» y queda en "gastoId", que es
-- único: dos recepciones (doble clic) no pueden dejar dos gastos. No usa StockPurchase (es fiscal); el stock real es T6.
-- Aditiva: una tabla nueva con RLS por negocio + un índice único (id, tenantId) en "Supplier" (destino de la FK
-- compuesta; no cambia datos: "id" ya es único). FKs compuestas (x, tenantId) a Proyecto, Supplier y ProyectoGasto: la
-- base no deja apuntar a nada de otro negocio. Requiere los únicos (id, tenantId) de Proyecto y ProyectoGasto
-- (`20261104121000_rendiciones`). El código tolera que no exista (P2021 → aviso amable). ESCRITA, NO APLICADA (Gate 2).

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_id_tenantId_key" ON "Supplier"("id", "tenantId");

CREATE TABLE "TallerPedido" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "supplierId" TEXT,
  "proveedorNombre" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PEDIDO',
  "total" DOUBLE PRECISION NOT NULL,
  "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pedidoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recibidoEl" TIMESTAMP(3),
  "gastoId" TEXT,
  "anuladoEl" TIMESTAMP(3),
  "cargadoPor" TEXT,
  "envioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerPedido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallerPedido_estado_check" CHECK ("estado" IN ('PEDIDO', 'RECIBIDO', 'ANULADO')),
  CONSTRAINT "TallerPedido_total_check" CHECK ("total" > 0),
  CONSTRAINT "TallerPedido_iva_check" CHECK ("iva" >= 0)
);
CREATE UNIQUE INDEX "TallerPedido_id_tenantId_key" ON "TallerPedido"("id", "tenantId");
-- Un gasto por pedido (NULL no choca: los pedidos sin recibir no tienen gasto).
CREATE UNIQUE INDEX "TallerPedido_gastoId_key" ON "TallerPedido"("gastoId");
-- Doble clic al crear: el formulario manda un token; la base deja un solo pedido por token.
CREATE UNIQUE INDEX "TallerPedido_tenantId_envioId_key" ON "TallerPedido"("tenantId", "envioId");
CREATE INDEX "TallerPedido_tenantId_proyectoId_idx" ON "TallerPedido"("tenantId", "proyectoId");
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_gastoId_tenantId_fkey" FOREIGN KEY ("gastoId", "tenantId") REFERENCES "ProyectoGasto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TallerPedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerPedido" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerPedido";
CREATE POLICY tenant_isolation ON "TallerPedido"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '0955041126fe884059844489b56f79574700929065c4a069007ab755a0dad133', now(), '20261116202000_taller_pedidos', NULL, NULL, now(), 1);

-- ─── 20261116203000_taller_consumo · checksum c0463a0506f949343d62e5db2db0499fa41f95a2e5a53c1e46973d1d011b67d3 ───
-- TALLER DE STANDS (GSG-MIA-004 · T6): stock real de materiales. Una pieza del catálogo se vincula a un producto del
-- negocio ("TallerPieza"."productId", que ya existía sin FK y nadie escribía: hoy son todos NULL) y «Descontar
-- materiales del stock» registra salidas CONSUMO por el ledger (recordMovement). "TallerConsumo" guarda, por proyecto y
-- pieza, la cantidad NETA descontada (0 = devuelta) y su costo ("costoTotal": suma de cantidad × costo estampado en
-- cada CONSUMO; la devolución vuelve a ese costo para que descontar y devolver neteen 0 en reportes): el único
-- (proyectoId, piezaId) + el FOR UPDATE del proyecto hacen que descontar o devolver dos veces a la vez deje un solo
-- juego de movimientos.
-- Aditiva: una tabla nueva con RLS por negocio, un índice único (id, tenantId) en "Product" (destino de las FKs
-- compuestas; no cambia datos: "id" ya es único; IF NOT EXISTS por si otra rama lo crea) y una FK nueva en "TallerPieza".
-- FK de la pieza: ON DELETE RESTRICT, no SET NULL: con FK compuesta SET NULL anularía también "tenantId" (NOT NULL), y
-- Prisma no admite la forma de Postgres 15 `SET NULL ("productId")`. Los productos se dan de baja lógica ("deletedAt").
-- "movementId" es un rastro débil al último StockMovement (sin FK, como los rastros del ledger: StockMovement no tiene
-- único (id, tenantId)). Requiere los únicos (id, tenantId) de Proyecto (`20261104121000_rendiciones`) y TallerPieza
-- (`20261109130000_taller_piezas_despiece`). El código tolera que no exista (P2021 → aviso amable).
-- ESCRITA, NO APLICADA (Gate 2).

CREATE UNIQUE INDEX IF NOT EXISTS "Product_id_tenantId_key" ON "Product"("id", "tenantId");

ALTER TABLE "TallerPieza" ADD CONSTRAINT "TallerPieza_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TallerConsumo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "piezaId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costoTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cantidadConCosto" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "movementId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerConsumo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallerConsumo_cantidad_check" CHECK ("cantidad" >= 0),
  CONSTRAINT "TallerConsumo_costoTotal_check" CHECK ("costoTotal" >= 0),
  CONSTRAINT "TallerConsumo_cantidadConCosto_check" CHECK ("cantidadConCosto" >= 0)
);
CREATE UNIQUE INDEX "TallerConsumo_proyectoId_piezaId_key" ON "TallerConsumo"("proyectoId", "piezaId");
CREATE INDEX "TallerConsumo_tenantId_proyectoId_idx" ON "TallerConsumo"("tenantId", "proyectoId");
ALTER TABLE "TallerConsumo" ADD CONSTRAINT "TallerConsumo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerConsumo" ADD CONSTRAINT "TallerConsumo_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerConsumo" ADD CONSTRAINT "TallerConsumo_piezaId_tenantId_fkey" FOREIGN KEY ("piezaId", "tenantId") REFERENCES "TallerPieza"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerConsumo" ADD CONSTRAINT "TallerConsumo_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TallerConsumo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerConsumo" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerConsumo";
CREATE POLICY tenant_isolation ON "TallerConsumo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'c0463a0506f949343d62e5db2db0499fa41f95a2e5a53c1e46973d1d011b67d3', now(), '20261116203000_taller_consumo', NULL, NULL, now(), 1);

-- ─── 20261117010000_crm_vinculo_negocios · checksum 56e3d5a2ca4fca4c5a3e2399638824c82a6131bb04b49aec875e7abdd4f9a228 ───
-- CRM comercial · ARM como negocio propio (GSG-CRM-017 · T4 · decisión del dueño del 16/11/2026). El ARM (p. ej. `arm-mia`)
-- tiene sólo el CRM y asigna a SUS negocios vinculados (MIA Producciones, MIA Taller): el proyecto nace en el destino,
-- en dos fases dentro de una transacción (patrón `trasladoTransaction`, sin saltear RLS).
--
-- Qué agrega, una cosa por vez:
--   1. "VinculoNegocio" (en el ARM): ARM → destino, por tipo de destino (AGENCIA · TALLER). Lo carga SÓLO GSG como dueño
--      de la base: al rol de la app (`app_rls`) se le sacan INSERT, UPDATE y DELETE (sólo lee). Sin vínculo no hay
--      asignación (V2).
--   2. "AsignacionRecibida" (en el destino): qué proyecto nació de qué oportunidad del ARM. Única por oportunidad: un
--      doble clic, dos personas a la vez o un reintento no crean dos proyectos (V3), aunque se saltee el control del ARM.
--   3. Tres columnas OPCIONALES en "Oportunidad": `destinoTenantId` y `proyectoDestinoId` (a qué negocio y a qué proyecto
--      fue; sólo se lee su estado, V6) y `consultaId` (la consulta del formulario de la que nació: una sola puerta, V8),
--      con índice único por negocio (una consulta → una oportunidad).
--
-- ADITIVA: dos tablas nuevas con RLS y tres columnas que aceptan NULL. Sin enum, sin DROP (salvo DROP POLICY IF EXISTS del
-- molde), sin ALTER COLUMN, sin UPDATE ni DELETE. No carga datos: el vínculo de un negocio real lo carga GSG aparte.
-- Depende de 20261116150000_crm_comercial (tabla "Oportunidad") y del modelo "Consulta" (no los modifica).
-- SIN APLICAR (Gate 2): sin ella, asignar contesta «falta un paso de base de datos» y no escribe nada.
-- Vuelta atrás: DROP TABLE "AsignacionRecibida"; DROP TABLE "VinculoNegocio";
--               ALTER TABLE "Oportunidad" DROP COLUMN "destinoTenantId", DROP COLUMN "proyectoDestinoId", DROP COLUMN "consultaId";

-- ── 1. VinculoNegocio ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "VinculoNegocio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destinoTenantId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "cargadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinculoNegocio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VinculoNegocio_destinoTenantId_idx" ON "VinculoNegocio"("destinoTenantId");
CREATE UNIQUE INDEX "VinculoNegocio_tenantId_destino_key" ON "VinculoNegocio"("tenantId", "destino");
CREATE UNIQUE INDEX "VinculoNegocio_tenantId_destinoTenantId_key" ON "VinculoNegocio"("tenantId", "destinoTenantId");

ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_destinoTenantId_fkey" FOREIGN KEY ("destinoTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_destino_check" CHECK ("destino" IN ('AGENCIA', 'TALLER'));
ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_otro_negocio_check" CHECK ("tenantId" <> "destinoTenantId");
ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_textos_check" CHECK (length(btrim("cargadoPor")) > 0 AND length("cargadoPor") <= 200);

-- ── 2. AsignacionRecibida ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE "AsignacionRecibida" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origenTenantId" TEXT NOT NULL,
    "origenOportunidadId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionRecibida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsignacionRecibida_tenantId_origenTenantId_origenOportunidadId_key" ON "AsignacionRecibida"("tenantId", "origenTenantId", "origenOportunidadId");
CREATE UNIQUE INDEX "AsignacionRecibida_tenantId_proyectoId_key" ON "AsignacionRecibida"("tenantId", "proyectoId");

ALTER TABLE "AsignacionRecibida" ADD CONSTRAINT "AsignacionRecibida_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsignacionRecibida" ADD CONSTRAINT "AsignacionRecibida_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsignacionRecibida" ADD CONSTRAINT "AsignacionRecibida_otro_negocio_check" CHECK ("tenantId" <> "origenTenantId");

-- ── 3. Oportunidad: a dónde fue y de qué consulta nació ─────────────────────────────────────────────────
ALTER TABLE "Oportunidad" ADD COLUMN "destinoTenantId" TEXT;
ALTER TABLE "Oportunidad" ADD COLUMN "proyectoDestinoId" TEXT;
ALTER TABLE "Oportunidad" ADD COLUMN "consultaId" TEXT;

CREATE UNIQUE INDEX "Oportunidad_tenantId_consultaId_key" ON "Oportunidad"("tenantId", "consultaId");
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Las dos columnas del destino van juntas: o las dos o ninguna, y nunca el propio negocio.
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_destino_negocio_check" CHECK (("destinoTenantId" IS NULL) = ("proyectoDestinoId" IS NULL) AND ("destinoTenantId" IS NULL OR "destinoTenantId" <> "tenantId"));

-- ── RLS: aislamiento por negocio (mismo molde que 20261116150000_crm_comercial) ─────────────────────────
ALTER TABLE "VinculoNegocio" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VinculoNegocio";
CREATE POLICY tenant_isolation ON "VinculoNegocio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AsignacionRecibida" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AsignacionRecibida";
CREATE POLICY tenant_isolation ON "AsignacionRecibida"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── El vínculo lo carga sólo GSG: la app lo lee y nada más ──────────────────────────────────────────────
-- Si `app_rls` todavía no existe (la base sólo con migraciones), no hay nada que sacarle: `prisma/rls/0002_app_role.sql`
-- repite este REVOKE después de su GRANT general, así el orden de los dos scripts no importa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    REVOKE INSERT, UPDATE, DELETE ON "VinculoNegocio" FROM app_rls;
  END IF;
END $$;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '56e3d5a2ca4fca4c5a3e2399638824c82a6131bb04b49aec875e7abdd4f9a228', now(), '20261117010000_crm_vinculo_negocios', NULL, NULL, now(), 1);

-- ─── 20261117120000_consola_cuadrilla · checksum af53655c97c58644e4e4819dfa42a5b82ab63b8dbc234908a539d23f84c745ee ───
-- Consola de la Cuadrilla (GSG-MIA-062 · 17/11/2026): los agentes de un negocio (sesiones de Claude Code que
-- operan el sistema por el navegador con su usuario propio), sus excepciones (aprobaciones, frenos, rechazos,
-- escalados) y los hilos por agente o por equipo donde las personas les hablan. El ERP no llama a ningún modelo.
-- ADITIVA: cuatro tablas nuevas con RLS (la cuarta, PedidoCuadrilla: criterio 8). No toca tablas, datos ni enums existentes.
-- SIN APLICAR (Gate 2 del dueño): el código la tolera ausente (la pantalla dice «falta un paso de base de datos»).
-- Vuelta atrás: DROP de las cuatro tablas (PedidoCuadrilla y ExcepcionCuadrilla primero).
-- CreateTable
CREATE TABLE "AgenteCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "equipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "userId" TEXT,
    "sesion" TEXT,
    "ultimaSenal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgenteCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcepcionCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'OTRA',
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creadaPorUserId" TEXT,
    "decididaPor" TEXT,
    "decididaEn" TIMESTAMP(3),
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExcepcionCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hilo" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorUserId" TEXT,
    "agenteId" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgenteCuadrilla_tenantId_estado_idx" ON "AgenteCuadrilla"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteCuadrilla_tenantId_nombre_key" ON "AgenteCuadrilla"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteCuadrilla_tenantId_userId_key" ON "AgenteCuadrilla"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteCuadrilla_id_tenantId_key" ON "AgenteCuadrilla"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ExcepcionCuadrilla_tenantId_estado_createdAt_idx" ON "ExcepcionCuadrilla"("tenantId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "ExcepcionCuadrilla_tenantId_agenteId_idx" ON "ExcepcionCuadrilla"("tenantId", "agenteId");

-- CreateIndex
CREATE INDEX "MensajeCuadrilla_tenantId_hilo_createdAt_idx" ON "MensajeCuadrilla"("tenantId", "hilo", "createdAt");

-- AddForeignKey
ALTER TABLE "AgenteCuadrilla" ADD CONSTRAINT "AgenteCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_agenteId_tenantId_fkey" FOREIGN KEY ("agenteId", "tenantId") REFERENCES "AgenteCuadrilla"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Valores cerrados (TEXT + CHECK: un enum en Neon es irreversible).
ALTER TABLE "AgenteCuadrilla" ADD CONSTRAINT "AgenteCuadrilla_estado_check" CHECK ("estado" IN ('ACTIVO', 'PAUSADO', 'FRENADO'));
ALTER TABLE "AgenteCuadrilla" ADD CONSTRAINT "AgenteCuadrilla_textos_check" CHECK (length(btrim("nombre")) > 0 AND length("nombre") <= 60 AND length(btrim("puesto")) > 0 AND length(btrim("equipo")) > 0);
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_tipo_check" CHECK ("tipo" IN ('APROBACION', 'FRENADO', 'RECHAZO', 'ESCALADO'));
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_categoria_check" CHECK ("categoria" IN ('PLATA', 'ENVIO_TERCEROS', 'OTRA'));
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'RESUELTA'));
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_textos_check" CHECK (length(btrim("titulo")) > 0 AND length("titulo") <= 160 AND length(btrim("contenido")) > 0 AND length("contenido") <= 4000);
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_autorTipo_check" CHECK ("autorTipo" IN ('PERSONA', 'AGENTE', 'SISTEMA'));
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_hilo_check" CHECK ("hilo" ~ '^(agente|equipo):.+');
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_texto_check" CHECK (length(btrim("texto")) > 0 AND length("texto") <= 2000);

-- RLS: aislamiento por negocio (mismo molde que 20261114231500_eventos_y_sponsors).
ALTER TABLE "AgenteCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteCuadrilla";
CREATE POLICY tenant_isolation ON "AgenteCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ExcepcionCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ExcepcionCuadrilla";
CREATE POLICY tenant_isolation ON "ExcepcionCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "MensajeCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MensajeCuadrilla";
CREATE POLICY tenant_isolation ON "MensajeCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));


-- ── Pedidos a la cuadrilla (criterio 8: servicio, no Claude suelto) ─────────────────────────────
-- CreateTable
CREATE TABLE "PedidoCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "pedidoPor" TEXT NOT NULL,
    "pedidoPorUserId" TEXT,
    "topeMinutos" INTEGER NOT NULL DEFAULT 30,
    "topeTurnos" INTEGER NOT NULL DEFAULT 10,
    "turnosUsados" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "salida" TEXT,
    "regla" TEXT,
    "duenio" TEXT,
    "respuesta" TEXT,
    "cerradoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PedidoCuadrilla_tenantId_estado_createdAt_idx" ON "PedidoCuadrilla"("tenantId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "PedidoCuadrilla_tenantId_agenteId_estado_idx" ON "PedidoCuadrilla"("tenantId", "agenteId", "estado");

-- AddForeignKey
ALTER TABLE "PedidoCuadrilla" ADD CONSTRAINT "PedidoCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCuadrilla" ADD CONSTRAINT "PedidoCuadrilla_agenteId_tenantId_fkey" FOREIGN KEY ("agenteId", "tenantId") REFERENCES "AgenteCuadrilla"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PedidoCuadrilla" ADD CONSTRAINT "PedidoCuadrilla_estado_check" CHECK ("estado" IN ('ABIERTO', 'HECHO', 'NEGADO', 'ESCALADO'));
ALTER TABLE "PedidoCuadrilla" ADD CONSTRAINT "PedidoCuadrilla_salida_check" CHECK (
  ("estado" IN ('ABIERTO', 'HECHO') AND "salida" IS NULL)
  OR ("estado" = 'NEGADO' AND "salida" = 'AJENO' AND "regla" IS NOT NULL AND length(btrim("regla")) > 0)
  OR ("estado" = 'ESCALADO' AND "salida" = 'OPORTUNIDAD' AND "duenio" = 'COM')
  OR ("estado" = 'ESCALADO' AND "salida" = 'TOPE')
);
ALTER TABLE "PedidoCuadrilla" ADD CONSTRAINT "PedidoCuadrilla_topes_check" CHECK ("topeMinutos" BETWEEN 5 AND 240 AND "topeTurnos" BETWEEN 1 AND 50 AND "turnosUsados" >= 0);
ALTER TABLE "PedidoCuadrilla" ADD CONSTRAINT "PedidoCuadrilla_textos_check" CHECK (length(btrim("texto")) > 0 AND length("texto") <= 2000 AND length(btrim("pedidoPor")) > 0);

ALTER TABLE "PedidoCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PedidoCuadrilla";
CREATE POLICY tenant_isolation ON "PedidoCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'af53655c97c58644e4e4819dfa42a5b82ab63b8dbc234908a539d23f84c745ee', now(), '20261117120000_consola_cuadrilla', NULL, NULL, now(), 1);

-- ─── 20261117120000_mia_m7a_parametros_vistas · checksum 02d51ecb7846e70f916fae29d688882e87f36763fc9365d046fae07823ddd525 ───
-- M7a · MIA T03 (GSG-MIA-054): parámetros del módulo de proyectos por negocio y vistas guardadas.
-- ADITIVA: sólo crea 3 tablas nuevas, sus índices y sus políticas. No toca ninguna tabla existente ni datos.
-- Se puede correr dos veces (IF NOT EXISTS, DROP POLICY IF EXISTS): la segunda corrida no cambia nada.
-- Sin filas en ProyectoParametro el código lee los valores del rubro; sin estas tablas, el código también los lee
-- (tolera la ausencia de la migración: parametros/leer.server.ts y vistas.server.ts).
-- Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql en esta carpeta (borra sólo estas 3 tablas).

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoParametro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "actualizadoPor" TEXT NOT NULL,
    "actualizadoNombre" TEXT NOT NULL,
    "actualizadoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoParametro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoParametroHistorial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "provisionalAntes" BOOLEAN,
    "provisionalDespues" BOOLEAN,
    "autorId" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoParametroHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoVista" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lista" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alcance" TEXT NOT NULL,
    "propietario" TEXT NOT NULL,
    "columnas" JSONB NOT NULL,
    "filtros" JSONB NOT NULL,
    "agrupacion" TEXT,
    "orden" JSONB,
    "creadaPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoVista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoParametro_tenantId_clave_key" ON "ProyectoParametro"("tenantId", "clave");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoParametroHistorial_tenantId_clave_createdAt_idx" ON "ProyectoParametroHistorial"("tenantId", "clave", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoParametroHistorial_tenantId_createdAt_idx" ON "ProyectoParametroHistorial"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoVista_tenantId_lista_idx" ON "ProyectoVista"("tenantId", "lista");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoVista_tenantId_lista_alcance_propietario_nombre_key" ON "ProyectoVista"("tenantId", "lista", "alcance", "propietario", "nombre");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoParametro_tenantId_fkey') THEN
    ALTER TABLE "ProyectoParametro" ADD CONSTRAINT "ProyectoParametro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoParametroHistorial_tenantId_fkey') THEN
    ALTER TABLE "ProyectoParametroHistorial" ADD CONSTRAINT "ProyectoParametroHistorial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoVista_tenantId_fkey') THEN
    ALTER TABLE "ProyectoVista" ADD CONSTRAINT "ProyectoVista_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Aislamiento por negocio: política por tenant y RLS FORZADA (también para el dueño de las tablas) ──

ALTER TABLE "ProyectoParametro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoParametro" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoParametro";
CREATE POLICY tenant_isolation ON "ProyectoParametro"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoParametroHistorial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoParametroHistorial" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoParametroHistorial";
CREATE POLICY tenant_isolation ON "ProyectoParametroHistorial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoVista" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoVista" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoVista";
CREATE POLICY tenant_isolation ON "ProyectoVista"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- El rol de la app (app_rls) hereda los permisos por defecto del esquema (prisma/rls/0002_app_role.sql); si existe, se
-- le dan explícitos por si los permisos por defecto no alcanzaran a tablas creadas por esta migración.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoParametro", "ProyectoParametroHistorial", "ProyectoVista" TO app_rls;
  END IF;
END $$;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '02d51ecb7846e70f916fae29d688882e87f36763fc9365d046fae07823ddd525', now(), '20261117120000_mia_m7a_parametros_vistas', NULL, NULL, now(), 1);

-- ─── 20261117130000_cuadrilla_correcciones · checksum 4bb4195125038d1aafa5738286ef768c903e670688ff1aadecf87b319d0f9f7b ───
-- CONSOLA DE LA CUADRILLA · correcciones de GSG-MIA-072 (PR #188). ADITIVA: dos columnas nulables y dos índices.
-- Se prueba sólo en local (Postgres efímero con `app_rls`); a Neon va con Gate 2, junto con 20261117120000.
--
-- · "MensajeCuadrilla"."pedidoId": a qué pedido contesta (o qué pedido abre) cada mensaje del hilo. Sin FK a
--   propósito: el pedido se lee con tenantId y bajo RLS, y un mensaje viejo sin pedido sigue valiendo (NULL).
-- · "AgenteCuadrilla"."comoUserId": la persona del puesto cuyos accesos tiene el usuario del agente («mismos
--   accesos que una persona», orden del dueño 17/11 07:38Z). Sin FK a "User" por la misma razón: el código lo
--   busca dentro del negocio, y si la persona se borra, la consola avisa que no hay con quién comparar.

ALTER TABLE "MensajeCuadrilla" ADD COLUMN IF NOT EXISTS "pedidoId" TEXT;
CREATE INDEX IF NOT EXISTS "MensajeCuadrilla_tenantId_pedidoId_idx" ON "MensajeCuadrilla"("tenantId", "pedidoId");

ALTER TABLE "AgenteCuadrilla" ADD COLUMN IF NOT EXISTS "comoUserId" TEXT;
CREATE INDEX IF NOT EXISTS "AgenteCuadrilla_tenantId_comoUserId_idx" ON "AgenteCuadrilla"("tenantId", "comoUserId");

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '4bb4195125038d1aafa5738286ef768c903e670688ff1aadecf87b319d0f9f7b', now(), '20261117130000_cuadrilla_correcciones', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 10 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261116150000_crm_comercial', '20261116160000_crm_comercial_pronostico', '20261116200000_taller_piezas_despiece', '20261116201000_taller_horas', '20261116202000_taller_pedidos', '20261116203000_taller_consumo', '20261117010000_crm_vinculo_negocios', '20261117120000_consola_cuadrilla', '20261117120000_mia_m7a_parametros_vistas', '20261117130000_cuadrilla_correcciones') ORDER BY migration_name;
