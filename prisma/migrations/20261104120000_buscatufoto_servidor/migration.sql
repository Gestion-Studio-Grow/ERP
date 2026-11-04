-- BUSCATUFOTO · servidor base (fotógrafos, álbumes, medios, pedidos). Aditiva: sólo tablas nuevas,
-- sin tocar ninguna existente. NO son tablas de negocio del ERP: no llevan "tenantId" (buscatufoto es
-- un producto propio con su host; ver src/lib/tenant-scope.ts → MODELOS_SIN_TENANT), por eso no
-- llevan RLS ni la política tenant_isolation. El aislamiento es por "fotografoId" en la app
-- (src/lib/btf/). Dinero en ARS enteros. El token de MP vive cifrado en "mpCredencial" (sealSecret).
-- SIN APLICAR en Neon: se aplica con OK del dueño (Gate 2). El código tolera su ausencia (P2021 →
-- /api/btf/estado responde configurado:false y el resto 503).
-- GRANT: si migra `neondb_owner`, el ALTER DEFAULT PRIVILEGES de prisma/rls/0002_app_role.sql ya le da
-- SELECT/INSERT/UPDATE/DELETE a `app_rls`; el bloque del final lo repite explícito (idempotente) por si
-- migra otro rol.

-- CreateTable
CREATE TABLE "BtfFotografo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "contrasena" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "instagram" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "plan" TEXT NOT NULL DEFAULT 'libre',
    "cobro" JSONB,
    "marca" JSONB NOT NULL,
    "mpCredencial" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BtfFotografo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BtfAlbum" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fotografoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "evento" TEXT NOT NULL DEFAULT 'otro',
    "lugar" TEXT NOT NULL DEFAULT '',
    "fecha" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "precioFoto" INTEGER NOT NULL DEFAULT 0,
    "precioVideo" INTEGER NOT NULL DEFAULT 0,
    "paquetes" JSONB NOT NULL DEFAULT '[]',
    "escalones" JSONB NOT NULL DEFAULT '[]',
    "cupones" JSONB NOT NULL DEFAULT '[]',
    "colaboradores" JSONB NOT NULL DEFAULT '[]',
    "portadaId" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BtfAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BtfMedio" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "fotografoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL DEFAULT 0,
    "alto" INTEGER NOT NULL DEFAULT 0,
    "duracion" DOUBLE PRECISION,
    "peso" BIGINT NOT NULL DEFAULT 0,
    "dorsales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mimeOriginal" TEXT NOT NULL,
    "mimePrevia" TEXT NOT NULL,
    "claveOriginal" TEXT NOT NULL,
    "clavePrevia" TEXT NOT NULL,
    "claveMiniatura" TEXT NOT NULL,
    "subido" BOOLEAN NOT NULL DEFAULT false,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BtfMedio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BtfPedido" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "fotografoId" TEXT NOT NULL,
    "items" TEXT[],
    "comprador" JSONB NOT NULL,
    "cotizacion" JSONB NOT NULL,
    "cupon" TEXT,
    "total" INTEGER NOT NULL,
    "comision" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "metodo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "referenciaPago" TEXT NOT NULL DEFAULT '',
    "mpPreferenciaId" TEXT,
    "pagadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BtfPedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BtfFotografo_email_key" ON "BtfFotografo"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BtfFotografo_usuario_key" ON "BtfFotografo"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "BtfAlbum_slug_key" ON "BtfAlbum"("slug");

-- CreateIndex
CREATE INDEX "BtfAlbum_fotografoId_idx" ON "BtfAlbum"("fotografoId");

-- CreateIndex
CREATE INDEX "BtfMedio_albumId_idx" ON "BtfMedio"("albumId");

-- CreateIndex
CREATE INDEX "BtfMedio_fotografoId_idx" ON "BtfMedio"("fotografoId");

-- CreateIndex
CREATE INDEX "BtfPedido_albumId_idx" ON "BtfPedido"("albumId");

-- CreateIndex
CREATE INDEX "BtfPedido_fotografoId_idx" ON "BtfPedido"("fotografoId");

-- AddForeignKey
ALTER TABLE "BtfAlbum" ADD CONSTRAINT "BtfAlbum_fotografoId_fkey" FOREIGN KEY ("fotografoId") REFERENCES "BtfFotografo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BtfMedio" ADD CONSTRAINT "BtfMedio_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "BtfAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BtfMedio" ADD CONSTRAINT "BtfMedio_fotografoId_fkey" FOREIGN KEY ("fotografoId") REFERENCES "BtfFotografo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BtfPedido" ADD CONSTRAINT "BtfPedido_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "BtfAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BtfPedido" ADD CONSTRAINT "BtfPedido_fotografoId_fkey" FOREIGN KEY ("fotografoId") REFERENCES "BtfFotografo"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Permisos del rol de la app (idempotente; inocuo si el rol no existe) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "BtfFotografo", "BtfAlbum", "BtfMedio", "BtfPedido" TO app_rls;
  END IF;
END $$;
