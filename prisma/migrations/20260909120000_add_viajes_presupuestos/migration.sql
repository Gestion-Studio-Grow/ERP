-- Módulo VIAJES — armador de presupuestos de viaje (agencias). Capability nativa del Core
-- (ADR-002 mecanismo B), asignada por tenant con rubro `viajes` (ADR-054/055). Modelo según
-- docs/producto/spec-armador-presupuestos-viaje.md §3: SolicitudViaje → PresupuestoViaje →
-- NivelPresupuestoViaje → OpcionPresupuestoViaje; OfertaCapturadaViaje (objeto maestro) y
-- AsignacionOfertaViaje (la relación con ABM propio); + cuota y caché del buscador.
--
-- TODO ADITIVO: 8 enums + 9 tablas nuevas. No toca ninguna tabla/fila viva. Generada con
-- `prisma migrate diff` desde el schema (sin DB); verificada local (validate + generate +
-- tsc + tests); NO aplicada a Neon (Gate 2 — la aplica el dueño con `migrate deploy`).
--
-- INVARIANTE DURA en el schema: `OfertaCapturadaViaje.capturadoEn`, `.unidad`, `.vigenteHasta`
-- y `.certeza` son NOT NULL y SIN default — un precio sin fecha de captura, sin unidad o sin
-- certeza no puede persistirse (caso real: confundir por-habitación con por-persona duplica
-- un presupuesto).
--
-- ⚠️ RLS: las 9 tablas tienen columna `tenantId` → la policy data-driven de
--    `prisma/rls/0001_enable_rls.sql` las cubre sola. Re-ejecutar ese script tras esta
--    migración, en el mismo deploy.

-- CreateEnum
CREATE TYPE "TipoOfertaViaje" AS ENUM ('VUELO', 'ALOJAMIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "UnidadPrecioViaje" AS ENUM ('POR_PERSONA', 'POR_HABITACION_NOCHE', 'POR_HABITACION_TOTAL', 'POR_TRAMO');

-- CreateEnum
CREATE TYPE "BaseOcupacionViaje" AS ENUM ('SINGLE', 'DOBLE', 'TRIPLE', 'OTRA');

-- CreateEnum
CREATE TYPE "CertezaOfertaViaje" AS ENUM ('VERIFICADA', 'ESTIMADA');

-- CreateEnum
CREATE TYPE "IncluyeImpuestosViaje" AS ENUM ('SI', 'NO', 'PARCIAL');

-- CreateEnum
CREATE TYPE "EstadoSolicitudViaje" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoPresupuestoViaje" AS ENUM ('BORRADOR', 'EN_ARMADO', 'LISTO_PARA_REVISAR', 'APROBADO', 'ENVIADO', 'VENCIDO', 'ACEPTADO', 'RECHAZADO', 'SIN_RESPUESTA', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "TipoBusquedaViaje" AS ENUM ('VUELO', 'HOTEL');

-- CreateTable
CREATE TABLE "SolicitudViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactoNombre" TEXT NOT NULL,
    "contactoWhatsapp" TEXT,
    "contactoEmail" TEXT,
    "cantidadPasajeros" INTEGER NOT NULL,
    "motivo" TEXT,
    "requisitos" TEXT,
    "monedaReferencia" TEXT NOT NULL DEFAULT 'USD',
    "operadorId" TEXT NOT NULL,
    "estado" "EstadoSolicitudViaje" NOT NULL DEFAULT 'ABIERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TramoSolicitudViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "destino" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,

    CONSTRAINT "TramoSolicitudViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresupuestoViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL,
    "estado" "EstadoPresupuestoViaje" NOT NULL DEFAULT 'BORRADOR',
    "vigenteHasta" TIMESTAMP(3),
    "notaCliente" TEXT,
    "notaInterna" TEXT,
    "creadoPor" TEXT NOT NULL,
    "enviadoPor" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresupuestoViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NivelPresupuestoViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "NivelPresupuestoViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcionPresupuestoViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nivelId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "incluye" TEXT,
    "noIncluye" TEXT,

    CONSTRAINT "OpcionPresupuestoViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfertaCapturadaViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoOfertaViaje" NOT NULL,
    "titulo" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "referenciaProveedor" TEXT,
    "tramoId" TEXT,
    "precio" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "unidad" "UnidadPrecioViaje" NOT NULL,
    "baseOcupacion" "BaseOcupacionViaje",
    "ocupacion" INTEGER,
    "noches" INTEGER,
    "incluyeImpuestos" "IncluyeImpuestosViaje",
    "detalleImpuestos" TEXT,
    "capturadoEn" TIMESTAMP(3) NOT NULL,
    "vigenteHasta" TIMESTAMP(3) NOT NULL,
    "vigenciaAsumida" BOOLEAN NOT NULL DEFAULT false,
    "certeza" "CertezaOfertaViaje" NOT NULL,
    "fuente" TEXT NOT NULL,
    "capturadoPor" TEXT NOT NULL,
    "condiciones" TEXT,
    "tcReferencia" DECIMAL(14,4),
    "fechaTC" TIMESTAMP(3),
    "detalle" JSONB NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfertaCapturadaViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionOfertaViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "ofertaId" TEXT NOT NULL,
    "pasajerosCubiertos" INTEGER NOT NULL,
    "baseAplicada" "BaseOcupacionViaje",
    "ocupacionAplicada" INTEGER,
    "suplementoSingle" DECIMAL(14,2),
    "cantidad" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "notaVisible" TEXT,
    "notaInterna" TEXT,
    "asignadoPor" TEXT NOT NULL,
    "asignadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionOfertaViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoProveedorViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "busquedas" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumoProveedorViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheBusquedaViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "tipo" "TipoBusquedaViaje" NOT NULL,
    "clave" TEXT NOT NULL,
    "resultado" JSONB NOT NULL,
    "capturadoEn" TIMESTAMP(3) NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacheBusquedaViaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitudViaje_tenantId_estado_idx" ON "SolicitudViaje"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudViaje_tenantId_operadorId_idx" ON "SolicitudViaje"("tenantId", "operadorId");

-- CreateIndex
CREATE INDEX "TramoSolicitudViaje_tenantId_solicitudId_idx" ON "TramoSolicitudViaje"("tenantId", "solicitudId");

-- CreateIndex
CREATE INDEX "PresupuestoViaje_tenantId_estado_idx" ON "PresupuestoViaje"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "PresupuestoViaje_tenantId_vigenteHasta_idx" ON "PresupuestoViaje"("tenantId", "vigenteHasta");

-- CreateIndex
CREATE UNIQUE INDEX "PresupuestoViaje_tenantId_solicitudId_version_key" ON "PresupuestoViaje"("tenantId", "solicitudId", "version");

-- CreateIndex
CREATE INDEX "NivelPresupuestoViaje_tenantId_presupuestoId_idx" ON "NivelPresupuestoViaje"("tenantId", "presupuestoId");

-- CreateIndex
CREATE INDEX "OpcionPresupuestoViaje_tenantId_nivelId_idx" ON "OpcionPresupuestoViaje"("tenantId", "nivelId");

-- CreateIndex
CREATE INDEX "OfertaCapturadaViaje_tenantId_activa_idx" ON "OfertaCapturadaViaje"("tenantId", "activa");

-- CreateIndex
CREATE INDEX "OfertaCapturadaViaje_tenantId_vigenteHasta_idx" ON "OfertaCapturadaViaje"("tenantId", "vigenteHasta");

-- CreateIndex
CREATE INDEX "OfertaCapturadaViaje_tenantId_tramoId_idx" ON "OfertaCapturadaViaje"("tenantId", "tramoId");

-- CreateIndex
CREATE INDEX "AsignacionOfertaViaje_tenantId_opcionId_idx" ON "AsignacionOfertaViaje"("tenantId", "opcionId");

-- CreateIndex
CREATE INDEX "AsignacionOfertaViaje_tenantId_ofertaId_idx" ON "AsignacionOfertaViaje"("tenantId", "ofertaId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionOfertaViaje_tenantId_opcionId_ofertaId_key" ON "AsignacionOfertaViaje"("tenantId", "opcionId", "ofertaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoProveedorViaje_tenantId_proveedor_dia_key" ON "ConsumoProveedorViaje"("tenantId", "proveedor", "dia");

-- CreateIndex
CREATE INDEX "CacheBusquedaViaje_expiraEn_idx" ON "CacheBusquedaViaje"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "CacheBusquedaViaje_tenantId_proveedor_clave_key" ON "CacheBusquedaViaje"("tenantId", "proveedor", "clave");

-- AddForeignKey
ALTER TABLE "SolicitudViaje" ADD CONSTRAINT "SolicitudViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudViaje" ADD CONSTRAINT "SolicitudViaje_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudViaje" ADD CONSTRAINT "SolicitudViaje_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TramoSolicitudViaje" ADD CONSTRAINT "TramoSolicitudViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TramoSolicitudViaje" ADD CONSTRAINT "TramoSolicitudViaje_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresupuestoViaje" ADD CONSTRAINT "PresupuestoViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresupuestoViaje" ADD CONSTRAINT "PresupuestoViaje_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NivelPresupuestoViaje" ADD CONSTRAINT "NivelPresupuestoViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NivelPresupuestoViaje" ADD CONSTRAINT "NivelPresupuestoViaje_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "PresupuestoViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionPresupuestoViaje" ADD CONSTRAINT "OpcionPresupuestoViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionPresupuestoViaje" ADD CONSTRAINT "OpcionPresupuestoViaje_nivelId_fkey" FOREIGN KEY ("nivelId") REFERENCES "NivelPresupuestoViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaCapturadaViaje" ADD CONSTRAINT "OfertaCapturadaViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaCapturadaViaje" ADD CONSTRAINT "OfertaCapturadaViaje_tramoId_fkey" FOREIGN KEY ("tramoId") REFERENCES "TramoSolicitudViaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionOfertaViaje" ADD CONSTRAINT "AsignacionOfertaViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionOfertaViaje" ADD CONSTRAINT "AsignacionOfertaViaje_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "OpcionPresupuestoViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionOfertaViaje" ADD CONSTRAINT "AsignacionOfertaViaje_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "OfertaCapturadaViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoProveedorViaje" ADD CONSTRAINT "ConsumoProveedorViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacheBusquedaViaje" ADD CONSTRAINT "CacheBusquedaViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

