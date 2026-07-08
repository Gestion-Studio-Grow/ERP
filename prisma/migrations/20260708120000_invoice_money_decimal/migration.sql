-- Invoice: montos Float -> Decimal(14,2) — exactitud fiscal al centavo (ADR-057, CORE-SCHEMA-SPEC §1).
--
-- ⚠️ Gate 2 (OK del dueño): NO aplicada. Se aplica con `prisma migrate deploy` junto con las
-- demás migraciones fiscales pendientes, el día que se enciende ARCA real. El cast de
-- `double precision` -> `numeric(14,2)` es seguro (Postgres redondea a 2 decimales al castear);
-- los importes ya venían redondeados a 2 decimales por el Core (round2, ADR-057), así que no
-- hay pérdida de información. El contrato del plugin/Core sigue en `number`: la conversión
-- Decimal<->number se confina al borde del repositorio de Invoice (src/lib/facturacion-actions.ts).
ALTER TABLE "Invoice"
  ALTER COLUMN "neto"  SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "iva"   SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2);
