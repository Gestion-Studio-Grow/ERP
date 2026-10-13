-- Recibos de alquiler: cada cobro lleva un número correlativo por negocio y la inmobiliaria
-- decide cómo se ve el recibo. Aditiva: dos columnas con NULL permitido y un índice único.
-- Los cobros que ya existen reciben su número por orden de fecha, dentro de cada negocio.

ALTER TABLE "InmoPago" ADD COLUMN "reciboNumero" INTEGER;
ALTER TABLE "InmoConfig" ADD COLUMN "recibo" JSONB;

UPDATE "InmoPago" p
SET "reciboNumero" = n.numero
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", "id") AS numero
  FROM "InmoPago"
) n
WHERE p."id" = n."id";

CREATE UNIQUE INDEX "InmoPago_tenantId_reciboNumero_key" ON "InmoPago"("tenantId", "reciboNumero");
