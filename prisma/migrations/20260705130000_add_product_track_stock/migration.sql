-- Flag `trackStock` en Product (POS/stock — descuento de stock al vender, sin oversell).
-- Escrita a mano y verificada offline (prisma validate + prisma generate + tsc + build);
-- NO aplicada a Neon. Se aplica con `prisma migrate deploy` (Gate 2 — requiere OK del owner).
--
-- Aditiva y no invasiva: columna con default false, así ningún producto existente cambia de
-- comportamiento (los que no controlan stock se siguen vendiendo sin bloqueo). El blueprint
-- Retail siembra sus productos con trackStock=true para que el descuento con guarda anti-oversell
-- (ver src/lib/order-core.ts) opere de verdad en ese vertical.

ALTER TABLE "Product" ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT false;
