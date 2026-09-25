-- ============================================================================
-- 20260925120000_lanzamiento_base · R0-F1 · UNA migración aditiva para vender (E1, E2, E3, E4)
-- ============================================================================
--
-- Junta en un solo paso lo que piden los frentes de lanzamiento, para pedir UNA autorización:
--   (a) contador por WhatsApp: ContactoCartera, ConversacionWhatsapp, MensajeWhatsapp,
--       ExtractoRecibido, DelegacionFiscal, ReceptorFiscal, EnvioComprobante (el canal de
--       WhatsApp no es tabla propia: es una IntegracionConexion con conector 'whatsapp');
--   (b) suite de integraciones: IntegracionConexion, IntegracionCredencial, EventoIntegracion,
--       IntegracionUso, IntegracionEstadoOAuth + 4 columnas del outbox genérico en OutboxEvent;
--   (c) fiscal: datos del emisor en Tenant, ficha fiscal de Client (y Client.phone deja de ser
--       obligatorio EN LA BASE), Invoice.comprobanteAsociadoId (nota de crédito), columnas de la
--       propuesta en MovimientoImportado;
--   (d) comercio: Product.codigo (único por negocio) y Product.alicuotaIva; la factura del
--       proveedor en StockPurchase;
--   (e) llaves por negocio: Tenant.cuentasCorrientes y Tenant.perfiles (nulas = heredan la
--       variable de entorno de hoy: ningún negocio cambia, CH incluida);
--   (f) ArcaAuthTicket, promovida de prisma/pending-gate2/ArcaAuthTicket.sql (misma forma).
--
-- ADITIVA Y SIN BACKFILL: tablas nuevas, columnas nulas o con default constante (en Postgres 11+
-- no reescribe la tabla), índices y restricciones que las filas de hoy ya cumplen. La única
-- relajación es `Client.phone DROP NOT NULL`: no toca ninguna fila y todo el código de hoy sigue
-- escribiendo un teléfono (en schema.prisma el campo sigue obligatorio hasta el importador).
--
-- RLS VIAJA CON LA MIGRACIÓN: cada tabla nueva tiene `tenantId` y acá mismo se le prende RLS con
-- la política `tenant_isolation` (idéntica a la de prisma/rls/0001_enable_rls.sql). En Neon este
-- bloque es la ÚNICA barrera de las 13 tablas: scripts/vercel-build.mjs migra y no corre 0001. Por
-- eso la prueba arma la base como el deploy, SIN 0001, mide la política que deja este archivo y
-- comprueba que una floja (USING o WITH CHECK en true) no pasa
-- (src/lib/lanzamiento-base-postgres.test.ts). Re-ejecutar 0001 después es inocuo (borra y vuelve
-- a crear la misma política). Los GRANT al rol de la app los da el
-- `ALTER DEFAULT PRIVILEGES` de prisma/rls/0002_app_role.sql si migra `neondb_owner`; si migra
-- otro rol, correr 0002 (idempotente). El build de Vercel lo verifica (vercel-build.mjs, 3b).
--
-- LLAVES FORÁNEAS CON EL NEGOCIO ADENTRO: toda columna que apunta a una fila de una tabla de
-- negocio lleva el negocio en la llave: (tenantId, x) → padre (tenantId, id). Vale también para
-- IntegracionUso.conexionId, OutboxEvent.conexionId, EventoIntegracion.outboxId y
-- ExtractoRecibido.mensajeId: nula, no se verifica (MATCH SIMPLE: los eventos de ARCA del outbox
-- no tienen conexión); con valor, la fila apuntada es del mismo negocio. La base impide que una
-- fila de un negocio apunte a la de otro aunque el código se equivoque de id (las verificaciones
-- de llaves foráneas no pasan por RLS). Los únicos que incluyen una de esas columnas llevan
-- también el negocio: con un id ajeno el error es siempre la llave foránea, exista o no la fila
-- del otro, así que la fila del otro ni se bloquea ni se delata. Las llaves nuevas son RESTRICT:
-- una conexión con uso contado o con eventos en el outbox, o un mensaje del que salió un
-- extracto, no se borran (la conexión se da de baja con su estado; el contador sobrevive).
-- Contactos, conversaciones, extractos y delegaciones cuelgan de CarteraCliente: no se anota nada
-- de un negocio que no está en la cartera del estudio.
--
-- UNA CUENTA EXTERNA, UN NEGOCIO: el único [conector, cuentaExterna] es global a propósito (al
-- segundo negocio le dice que la cuenta ya está vinculada) y compara bytes. Para que la misma
-- cuenta no entre escrita de otra forma, la base exige la forma canónica: `conector` en
-- minúsculas, dígitos y guiones ("whatsapp", "tiendanube"), y `cuentaExterna` en ASCII imprimible,
-- sin espacios ni caracteres invisibles. Las mayúsculas de la cuenta se respetan (hay proveedores
-- con ids que las distinguen): el conector guarda el id tal como lo manda el proveedor.
--
-- ORDEN: va ANTES de 20260925150000_comprobante_autorizado_inmutable por nombre. No dependen
-- entre sí (el trigger de ésa nombra columnas por texto): se aplican en cualquier orden.
--
-- PRODUCCIÓN: `prisma migrate deploy` en Neon SÓLO con autorización del dueño. Reversa probada:
-- rollback.sql de esta carpeta (src/lib/lanzamiento-base-postgres.test.ts).

-- CreateEnum
CREATE TYPE "EstadoConexion" AS ENUM ('pendiente', 'conectada', 'con_problemas', 'requiere_reconectar', 'pausada', 'desconectada');

-- CreateEnum
CREATE TYPE "DireccionEvento" AS ENUM ('entrada', 'salida');

-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('recibido', 'procesado', 'fallido', 'ignorado', 'duplicado', 'muerto');

-- CreateEnum
CREATE TYPE "EstadoExtractoRecibido" AS ENUM ('recibido', 'descargado', 'leido', 'esperando_confirmacion', 'cargado', 'descartado', 'ilegible', 'duplicado', 'error');

-- CreateEnum
CREATE TYPE "EstadoDelegacionFiscal" AS ENUM ('declarada', 'verificada', 'fallida', 'revocada');

-- CreateEnum
CREATE TYPE "OrigenReceptorFiscal" AS ENUM ('manual', 'leyenda', 'padron');

-- CreateEnum
CREATE TYPE "CanalEnvio" AS ENUM ('whatsapp', 'email');

-- CreateEnum
CREATE TYPE "EstadoEnvioComprobante" AS ENUM ('pendiente', 'enviado', 'entregado', 'leido', 'fallido');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "condicionIva" TEXT,
ADD COLUMN     "docNro" TEXT,
ADD COLUMN     "docTipo" INTEGER,
ADD COLUMN     "domicilio" TEXT,
ADD COLUMN     "razonSocial" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "comprobanteAsociadoId" TEXT;

-- AlterTable
ALTER TABLE "MovimientoImportado" ADD COLUMN     "aprobadoEn" TIMESTAMP(3),
ADD COLUMN     "aprobadoPor" TEXT,
ADD COLUMN     "concepto" INTEGER,
ADD COLUMN     "fceObligatoria" BOOLEAN,
ADD COLUMN     "receptorCondicionIva" TEXT,
ADD COLUMN     "rechazoMotivo" TEXT,
ADD COLUMN     "tipoComprobantePropuesto" INTEGER;

-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "bloqueadoHasta" TIMESTAMP(3),
ADD COLUMN     "conexionId" TEXT,
ADD COLUMN     "muertoEn" TIMESTAMP(3),
ADD COLUMN     "proximoIntentoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "alicuotaIva" INTEGER,
ADD COLUMN     "codigo" TEXT;

-- AlterTable
ALTER TABLE "StockPurchase" ADD COLUMN     "facturaCuit" TEXT,
ADD COLUMN     "facturaExento" DECIMAL(14,2),
ADD COLUMN     "facturaFecha" TEXT,
ADD COLUMN     "facturaIva" DECIMAL(14,2),
ADD COLUMN     "facturaIvaDesglose" JSONB,
ADD COLUMN     "facturaNeto" DECIMAL(14,2),
ADD COLUMN     "facturaNoGravado" DECIMAL(14,2),
ADD COLUMN     "facturaNumero" INTEGER,
ADD COLUMN     "facturaOtrosTributos" DECIMAL(14,2),
ADD COLUMN     "facturaPercepcionIibb" DECIMAL(14,2),
ADD COLUMN     "facturaPercepcionIva" DECIMAL(14,2),
ADD COLUMN     "facturaPuntoVenta" INTEGER,
ADD COLUMN     "facturaTipo" INTEGER,
ADD COLUMN     "facturaTotal" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "arcaConceptoDefault" INTEGER,
ADD COLUMN     "arcaCondicionIva" TEXT,
ADD COLUMN     "arcaDomicilioFiscal" TEXT,
ADD COLUMN     "arcaIibb" TEXT,
ADD COLUMN     "arcaInicioActividades" TEXT,
ADD COLUMN     "arcaRazonSocial" TEXT,
ADD COLUMN     "cuentasCorrientes" BOOLEAN,
ADD COLUMN     "fceMiPyme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "perfiles" BOOLEAN;

-- CreateTable
CREATE TABLE "IntegracionConexion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conector" TEXT NOT NULL,
    "cuentaExterna" TEXT,
    "etiqueta" TEXT,
    "rutaHash" TEXT,
    "estado" "EstadoConexion" NOT NULL DEFAULT 'pendiente',
    "config" JSONB,
    "ultimoEventoEn" TIMESTAMP(3),
    "fallosSeguidos" INTEGER NOT NULL DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "conectadaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracionConexion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracionCredencial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conexionId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "kekId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "ultimos4" TEXT,
    "expiraEn" TIMESTAMP(3),
    "cargadaPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracionCredencial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoIntegracion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conexionId" TEXT NOT NULL,
    "direccion" "DireccionEvento" NOT NULL,
    "tipo" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "estado" "EstadoEvento" NOT NULL DEFAULT 'recibido',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "codigoError" TEXT,
    "detalleError" TEXT,
    "resumen" TEXT,
    "payload" JSONB,
    "payloadSha256" TEXT,
    "entidad" TEXT,
    "entidadId" TEXT,
    "outboxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),

    CONSTRAINT "EventoIntegracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracionUso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conexionId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "eventos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IntegracionUso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracionEstadoOAuth" (
    "nonce" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conector" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracionEstadoOAuth_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "ContactoCartera" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteTenantId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT,
    "verificadoEn" TIMESTAMP(3),
    "optOutEn" TIMESTAMP(3),
    "avisoPrivacidadEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactoCartera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversacionWhatsapp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "contexto" JSONB,
    "clienteTenantId" TEXT,
    "vence" TIMESTAMP(3),
    "silenciadoHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversacionWhatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeWhatsapp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "direccion" "DireccionEvento" NOT NULL,
    "tipo" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "texto" TEXT,
    "estadoEntrega" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeWhatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractoRecibido" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteTenantId" TEXT NOT NULL,
    "mensajeId" TEXT,
    "mime" TEXT NOT NULL,
    "nombreArchivo" TEXT,
    "sha256" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "kekId" TEXT,
    "wrappedDek" TEXT,
    "sealed" TEXT,
    "banco" TEXT,
    "cuentaUlt4" TEXT,
    "periodoDesde" TEXT,
    "periodoHasta" TEXT,
    "resumen" JSONB,
    "estado" "EstadoExtractoRecibido" NOT NULL DEFAULT 'recibido',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "importacionId" TEXT,
    "purgarDesde" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractoRecibido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegacionFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "estudioTenantId" TEXT NOT NULL,
    "cuitRepresentado" TEXT NOT NULL,
    "cuitRepresentante" TEXT NOT NULL,
    "servicio" TEXT NOT NULL DEFAULT 'wsfe',
    "estado" "EstadoDelegacionFiscal" NOT NULL DEFAULT 'declarada',
    "verificadaEn" TIMESTAMP(3),
    "ultimaPrueba" TIMESTAMP(3),
    "evidencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegacionFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptorFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "razonSocial" TEXT,
    "condicionIva" TEXT,
    "email" TEXT,
    "origen" "OrigenReceptorFiscal" NOT NULL DEFAULT 'manual',
    "patrones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceptorFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioComprobante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "canal" "CanalEnvio" NOT NULL,
    "destino" TEXT NOT NULL,
    "estado" "EstadoEnvioComprobante" NOT NULL DEFAULT 'pendiente',
    "wamid" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvioComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcaAuthTicket" (
    "id" TEXT NOT NULL,
    "certHuella" TEXT NOT NULL,
    "service" TEXT NOT NULL DEFAULT 'wsfe',
    "tenantId" TEXT NOT NULL,
    "kekId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "expiration" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArcaAuthTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegracionConexion_rutaHash_key" ON "IntegracionConexion"("rutaHash");

-- CreateIndex
CREATE INDEX "IntegracionConexion_tenantId_estado_idx" ON "IntegracionConexion"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracionConexion_conector_cuentaExterna_key" ON "IntegracionConexion"("conector", "cuentaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracionConexion_tenantId_conector_cuentaExterna_key" ON "IntegracionConexion"("tenantId", "conector", "cuentaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracionConexion_tenantId_id_key" ON "IntegracionConexion"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracionCredencial_tenantId_conexionId_campo_key" ON "IntegracionCredencial"("tenantId", "conexionId", "campo");

-- CreateIndex
CREATE INDEX "EventoIntegracion_tenantId_createdAt_idx" ON "EventoIntegracion"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "EventoIntegracion_conexionId_estado_idx" ON "EventoIntegracion"("conexionId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "EventoIntegracion_tenantId_conexionId_direccion_idExterno_key" ON "EventoIntegracion"("tenantId", "conexionId", "direccion", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracionUso_tenantId_conexionId_mes_key" ON "IntegracionUso"("tenantId", "conexionId", "mes");

-- CreateIndex
CREATE INDEX "IntegracionEstadoOAuth_tenantId_idx" ON "IntegracionEstadoOAuth"("tenantId");

-- CreateIndex
CREATE INDEX "IntegracionEstadoOAuth_expira_idx" ON "IntegracionEstadoOAuth"("expira");

-- CreateIndex
CREATE INDEX "ContactoCartera_tenantId_clienteTenantId_idx" ON "ContactoCartera"("tenantId", "clienteTenantId");

-- CreateIndex
CREATE INDEX "ContactoCartera_telefono_idx" ON "ContactoCartera"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "ContactoCartera_tenantId_telefono_clienteTenantId_key" ON "ContactoCartera"("tenantId", "telefono", "clienteTenantId");

-- CreateIndex
CREATE INDEX "ConversacionWhatsapp_tenantId_clienteTenantId_idx" ON "ConversacionWhatsapp"("tenantId", "clienteTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversacionWhatsapp_tenantId_telefono_key" ON "ConversacionWhatsapp"("tenantId", "telefono");

-- CreateIndex
CREATE UNIQUE INDEX "ConversacionWhatsapp_tenantId_id_key" ON "ConversacionWhatsapp"("tenantId", "id");

-- CreateIndex
CREATE INDEX "MensajeWhatsapp_tenantId_conversacionId_createdAt_idx" ON "MensajeWhatsapp"("tenantId", "conversacionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MensajeWhatsapp_tenantId_wamid_key" ON "MensajeWhatsapp"("tenantId", "wamid");

-- CreateIndex
CREATE INDEX "ExtractoRecibido_tenantId_estado_idx" ON "ExtractoRecibido"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "ExtractoRecibido_estado_updatedAt_idx" ON "ExtractoRecibido"("estado", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractoRecibido_tenantId_clienteTenantId_sha256_key" ON "ExtractoRecibido"("tenantId", "clienteTenantId", "sha256");

-- CreateIndex
CREATE INDEX "DelegacionFiscal_estudioTenantId_tenantId_idx" ON "DelegacionFiscal"("estudioTenantId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegacionFiscal_tenantId_servicio_key" ON "DelegacionFiscal"("tenantId", "servicio");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptorFiscal_tenantId_cuit_key" ON "ReceptorFiscal"("tenantId", "cuit");

-- CreateIndex
CREATE INDEX "EnvioComprobante_wamid_idx" ON "EnvioComprobante"("wamid");

-- CreateIndex
CREATE UNIQUE INDEX "EnvioComprobante_tenantId_invoiceId_canal_key" ON "EnvioComprobante"("tenantId", "invoiceId", "canal");

-- CreateIndex
CREATE INDEX "ArcaAuthTicket_tenantId_idx" ON "ArcaAuthTicket"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ArcaAuthTicket_certHuella_service_key" ON "ArcaAuthTicket"("certHuella", "service");

-- CreateIndex
CREATE INDEX "Client_tenantId_docNro_idx" ON "Client"("tenantId", "docNro");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_comprobanteAsociadoId_idx" ON "Invoice"("tenantId", "comprobanteAsociadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_id_key" ON "Invoice"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MensajeWhatsapp_tenantId_id_key" ON "MensajeWhatsapp"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_tenantId_id_key" ON "OutboxEvent"("tenantId", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_proximoIntentoEn_idx" ON "OutboxEvent"("processedAt", "proximoIntentoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_codigo_key" ON "Product"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "StockPurchase_factura_proveedor_key" ON "StockPurchase"("tenantId", "facturaCuit", "facturaTipo", "facturaPuntoVenta", "facturaNumero");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_comprobanteAsociadoId_fkey" FOREIGN KEY ("tenantId", "comprobanteAsociadoId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracionConexion" ADD CONSTRAINT "IntegracionConexion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracionCredencial" ADD CONSTRAINT "IntegracionCredencial_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoIntegracion" ADD CONSTRAINT "EventoIntegracion_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracionUso" ADD CONSTRAINT "IntegracionUso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracionUso" ADD CONSTRAINT "IntegracionUso_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoIntegracion" ADD CONSTRAINT "EventoIntegracion_tenantId_outboxId_fkey" FOREIGN KEY ("tenantId", "outboxId") REFERENCES "OutboxEvent"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracionEstadoOAuth" ADD CONSTRAINT "IntegracionEstadoOAuth_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoCartera" ADD CONSTRAINT "ContactoCartera_tenantId_clienteTenantId_fkey" FOREIGN KEY ("tenantId", "clienteTenantId") REFERENCES "CarteraCliente"("tenantId", "clienteTenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversacionWhatsapp" ADD CONSTRAINT "ConversacionWhatsapp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversacionWhatsapp" ADD CONSTRAINT "ConversacionWhatsapp_tenantId_clienteTenantId_fkey" FOREIGN KEY ("tenantId", "clienteTenantId") REFERENCES "CarteraCliente"("tenantId", "clienteTenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeWhatsapp" ADD CONSTRAINT "MensajeWhatsapp_tenantId_conversacionId_fkey" FOREIGN KEY ("tenantId", "conversacionId") REFERENCES "ConversacionWhatsapp"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractoRecibido" ADD CONSTRAINT "ExtractoRecibido_tenantId_clienteTenantId_fkey" FOREIGN KEY ("tenantId", "clienteTenantId") REFERENCES "CarteraCliente"("tenantId", "clienteTenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractoRecibido" ADD CONSTRAINT "ExtractoRecibido_tenantId_mensajeId_fkey" FOREIGN KEY ("tenantId", "mensajeId") REFERENCES "MensajeWhatsapp"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegacionFiscal" ADD CONSTRAINT "DelegacionFiscal_estudioTenantId_tenantId_fkey" FOREIGN KEY ("estudioTenantId", "tenantId") REFERENCES "CarteraCliente"("tenantId", "clienteTenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptorFiscal" ADD CONSTRAINT "ReceptorFiscal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioComprobante" ADD CONSTRAINT "EnvioComprobante_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcaAuthTicket" ADD CONSTRAINT "ArcaAuthTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Client.phone: opcional EN LA BASE ─────────────────────────────────────────
-- Para importar empresas sin teléfono sin inventar datos. Ninguna fila cambia.
ALTER TABLE "Client" ALTER COLUMN "phone" DROP NOT NULL;

-- ── Validación en el borde de la base (Prisma no modela CHECK) ────────────────
-- Concepto de ARCA: 1 productos, 2 servicios, 3 ambos.
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_arcaConceptoDefault_check"
  CHECK ("arcaConceptoDefault" IN (1, 2, 3));
ALTER TABLE "MovimientoImportado" ADD CONSTRAINT "MovimientoImportado_concepto_check"
  CHECK ("concepto" IN (1, 2, 3));
-- Código de alícuota de ARCA (1 no gravado, 2 exento, 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %,
-- 8 = 5 %, 9 = 2,5 %). Frena el error más probable: guardar el porcentaje (21) en vez del código.
ALTER TABLE "Product" ADD CONSTRAINT "Product_alicuotaIva_check"
  CHECK ("alicuotaIva" IN (1, 2, 3, 4, 5, 6, 8, 9));
-- "Sin código" es NULL: ni vacío ni con espacios en los bordes (lo que manda la pistola se
-- compara igual que lo guardado, y dos productos "vacíos" no chocan en el índice único).
ALTER TABLE "Product" ADD CONSTRAINT "Product_codigo_check"
  CHECK ("codigo" <> '' AND "codigo" = btrim("codigo"));
-- Una cuenta externa, un negocio (ver la cabecera): el conector y la cuenta, en su forma canónica.
ALTER TABLE "IntegracionConexion" ADD CONSTRAINT "IntegracionConexion_conector_check"
  CHECK ("conector" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$');
ALTER TABLE "IntegracionConexion" ADD CONSTRAINT "IntegracionConexion_cuentaExterna_check"
  CHECK ("cuentaExterna" ~ '^[!-~]+$');
ALTER TABLE "IntegracionEstadoOAuth" ADD CONSTRAINT "IntegracionEstadoOAuth_conector_check"
  CHECK ("conector" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$');

-- ── RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'IntegracionConexion', 'IntegracionCredencial', 'EventoIntegracion', 'IntegracionUso',
    'IntegracionEstadoOAuth', 'ContactoCartera', 'ConversacionWhatsapp', 'MensajeWhatsapp',
    'ExtractoRecibido', 'DelegacionFiscal', 'ReceptorFiscal', 'EnvioComprobante', 'ArcaAuthTicket'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
  END LOOP;
END
$$;
