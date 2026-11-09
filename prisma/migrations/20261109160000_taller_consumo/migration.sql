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
