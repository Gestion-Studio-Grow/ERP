-- Reingeniería CH, Tanda 3 · M3 — combos «camino B»: un turno con varias zonas (CH-033, CH-065).
--
--   · "AppointmentItem": las zonas/servicios de un turno, en orden, con su duración y su precio
--     CONGELADO al reservar (Decimal 14,2, ADR-100). El turno sigue siendo uno; "Appointment"
--     ."serviceId" queda como el servicio principal (todo lo que lo lee sigue igual).
--   · "Appointment"."groupId": agrupa turnos dados juntos (nullable, sin default).
--
-- Aditiva: una tabla NUEVA y una columna nullable. No cambia ninguna fila existente ni ningún
-- servicio del catálogo. RLS `tenant_isolation` adentro de esta misma migración, con la misma
-- forma que prisma/rls/0001_enable_rls.sql y las migraciones de módulos (prisma/rls/check-coverage.mjs
-- lo exige). Los GRANT del rol de la app llegan por los DEFAULT PRIVILEGES de 0002_app_role.sql
-- (la tabla la crea el dueño, `neondb_owner`).
-- Mientras NO esté aplicada, el cliente de Prisma no pide "groupId" (omit global,
-- src/lib/prisma-omit.ts) y el alta cae a un turno de un solo servicio (camino A).
--
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: la aplica el dueño (Gate 2).

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "AppointmentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "priceAtBooking" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "AppointmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentItem_tenantId_appointmentId_idx" ON "AppointmentItem"("tenantId", "appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentItem_serviceId_idx" ON "AppointmentItem"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentItem_appointmentId_order_key" ON "AppointmentItem"("appointmentId", "order");

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── RLS de la tabla nueva (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AppointmentItem'
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
END $$;
