-- Módulo VIAJES — armador de presupuestos de viaje (agencias). Capability nativa del Core
-- (ADR-002 mecanismo B), asignada por tenant con rubro `agencia-viajes` (ADR-054/055).
--
-- TODO ADITIVO: 3 enums + 4 tablas nuevas. No toca ninguna tabla/fila viva. Generada con
-- `prisma migrate diff` desde el schema (sin DB); verificada local (validate + generate +
-- tsc + tests); NO aplicada a Neon (Gate 2 — la aplica el dueño con `migrate deploy`).
--
-- INVARIANTE DURA en el schema: `OpcionPresupuestoViaje.capturadoEn` y `.baseOcupacion`
-- son NOT NULL y SIN default — un precio sin fecha de captura o sin base de ocupación no
-- puede persistirse (caso real: confundir por-habitación con por-persona duplica un presupuesto).
--
-- ⚠️ RLS: las 4 tablas tienen columna `tenantId` → la policy data-driven de
--    `prisma/rls/0001_enable_rls.sql` las cubre sola. Re-ejecutar ese script tras esta
--    migración, en el mismo deploy.

-- CreateEnum
CREATE TYPE "BaseOcupacionViaje" AS ENUM ('POR_PERSONA_EN_DOBLE', 'POR_PERSONA_EN_SINGLE', 'POR_PERSONA_EN_TRIPLE', 'POR_HABITACION', 'POR_PASAJERO', 'TOTAL');

-- CreateEnum
CREATE TYPE "TipoOfertaViaje" AS ENUM ('VUELO', 'HOTEL');

-- CreateEnum
CREATE TYPE "EstadoPresupuestoViaje" AS ENUM ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'VENCIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "PresupuestoViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "titulo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "fechaSalida" DATE,
    "fechaRegreso" DATE,
    "adultos" INTEGER NOT NULL DEFAULT 1,
    "ninos" INTEGER NOT NULL DEFAULT 0,
    "habitaciones" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoPresupuestoViaje" NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresupuestoViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcionPresupuestoViaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "tipo" "TipoOfertaViaje" NOT NULL,
    "proveedor" TEXT NOT NULL,
    "referenciaProveedor" TEXT,
    "descripcion" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "baseOcupacion" "BaseOcupacionViaje" NOT NULL,
    "cantidadBase" INTEGER NOT NULL,
    "precioTotal" DECIMAL(14,2) NOT NULL,
    "capturadoEn" TIMESTAMP(3) NOT NULL,
    "vigenteHasta" TIMESTAMP(3),
    "seleccionada" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpcionPresupuestoViaje_pkey" PRIMARY KEY ("id")
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
    "tipo" "TipoOfertaViaje" NOT NULL,
    "clave" TEXT NOT NULL,
    "resultado" JSONB NOT NULL,
    "capturadoEn" TIMESTAMP(3) NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacheBusquedaViaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PresupuestoViaje_tenantId_estado_idx" ON "PresupuestoViaje"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "PresupuestoViaje_tenantId_clientId_idx" ON "PresupuestoViaje"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "OpcionPresupuestoViaje_tenantId_presupuestoId_idx" ON "OpcionPresupuestoViaje"("tenantId", "presupuestoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoProveedorViaje_tenantId_proveedor_dia_key" ON "ConsumoProveedorViaje"("tenantId", "proveedor", "dia");

-- CreateIndex
CREATE INDEX "CacheBusquedaViaje_expiraEn_idx" ON "CacheBusquedaViaje"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "CacheBusquedaViaje_tenantId_proveedor_clave_key" ON "CacheBusquedaViaje"("tenantId", "proveedor", "clave");

-- AddForeignKey
ALTER TABLE "PresupuestoViaje" ADD CONSTRAINT "PresupuestoViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresupuestoViaje" ADD CONSTRAINT "PresupuestoViaje_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionPresupuestoViaje" ADD CONSTRAINT "OpcionPresupuestoViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionPresupuestoViaje" ADD CONSTRAINT "OpcionPresupuestoViaje_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "PresupuestoViaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoProveedorViaje" ADD CONSTRAINT "ConsumoProveedorViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacheBusquedaViaje" ADD CONSTRAINT "CacheBusquedaViaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

