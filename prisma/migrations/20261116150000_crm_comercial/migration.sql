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
