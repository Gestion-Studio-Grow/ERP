-- SEG-006 · Tanda 1 · FK compuestas con el negocio en las tablas de PLATA.
-- Inventario y motivo: docs/seguridad/INVENTARIO-FK-SIN-TENANT.md.
--
-- Problema: las FK de abajo eran sólo (columna) → destino(id). La validación de una FK ignora RLS,
-- así que un negocio podía escribir el id de una fila de OTRO negocio (la FK lo aceptaba y,
-- por el error distinto, revelaba que existe) y ON UPDATE/DELETE en cascada podía tocar filas ajenas.
--
-- ADITIVA: no borra ni cambia ninguna restricción ni dato existente.
--   1. Índice único ("tenantId","id") en cada tabla destino. Es trivialmente único (id ya es PK):
--      no puede chocar con datos existentes.
--   2. Una FK NUEVA (columna,"tenantId") → destino("tenantId","id") por cada FK de plata, AL LADO de
--      la vieja. Con MATCH SIMPLE (el default), columna NULL = no se chequea: las opcionales siguen igual.
--      · ON DELETE replica la vieja: CASCADE↔CASCADE, SET NULL↔SET NULL (sólo la columna, nunca
--        "tenantId"; Postgres ≥ 15, Neon es 16), RESTRICT↔RESTRICT. Así el orden en que disparan los
--        dos triggers no cambia el resultado de un borrado.
--      · ON UPDATE NO ACTION: los ids no se reescriben (cuid); cambiar el id o el negocio de un padre
--        con hijos queda bloqueado en vez de propagarse.
--      · NOT VALID: Postgres la hace cumplir en TODA escritura nueva desde ya, pero no revisa las filas
--        viejas (no puede frenar el deploy por un dato histórico). El paso 2 (VALIDATE CONSTRAINT,
--        con la consulta de diagnóstico previa) está en el inventario y es orden del dueño.
-- Las FK nuevas NO están en schema.prisma (Prisma no puede expresar SET NULL de una sola columna de
-- una FK compuesta sin poner "tenantId" en NULL); los índices únicos sí (@@unique([tenantId, id])).
-- Prisma Client no cambia de comportamiento. Un `migrate dev` futuro va a proponer BORRAR estas FK
-- (no las ve en el schema): no aceptarlo. Gate 2: se aplica sólo con orden del dueño.

-- 1. Índices únicos (negocio, id) en los destinos que no lo tenían.
CREATE UNIQUE INDEX "CashSession_tenantId_id_key" ON "CashSession"("tenantId", "id");
CREATE UNIQUE INDEX "Order_tenantId_id_key" ON "Order"("tenantId", "id");
CREATE UNIQUE INDEX "Payment_tenantId_id_key" ON "Payment"("tenantId", "id");
CREATE UNIQUE INDEX "Collection_tenantId_id_key" ON "Collection"("tenantId", "id");
CREATE UNIQUE INDEX "TallerPago_tenantId_id_key" ON "TallerPago"("tenantId", "id");
CREATE UNIQUE INDEX "ProyectoPago_tenantId_id_key" ON "ProyectoPago"("tenantId", "id");
CREATE UNIQUE INDEX "Appointment_tenantId_id_key" ON "Appointment"("tenantId", "id");
CREATE UNIQUE INDEX "ImportacionBancaria_tenantId_id_key" ON "ImportacionBancaria"("tenantId", "id");
CREATE UNIQUE INDEX "VoucherLote_tenantId_id_key" ON "VoucherLote"("tenantId", "id");
CREATE UNIQUE INDEX "Client_tenantId_id_key" ON "Client"("tenantId", "id");

-- 2. FK compuestas (columna, negocio). Invoice ya tenía ("tenantId","id"); ProyectoGasto, ("id","tenantId").
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_tenant_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "CashSession"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_orderId_tenant_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE SET NULL ("orderId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_tenant_fkey" FOREIGN KEY ("tenantId", "paymentId") REFERENCES "Payment"("tenantId", "id") ON DELETE SET NULL ("paymentId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_collectionId_tenant_fkey" FOREIGN KEY ("tenantId", "collectionId") REFERENCES "Collection"("tenantId", "id") ON DELETE SET NULL ("collectionId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tallerPagoId_tenant_fkey" FOREIGN KEY ("tenantId", "tallerPagoId") REFERENCES "TallerPago"("tenantId", "id") ON DELETE SET NULL ("tallerPagoId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoPagoId_tenant_fkey" FOREIGN KEY ("tenantId", "proyectoPagoId") REFERENCES "ProyectoPago"("tenantId", "id") ON DELETE SET NULL ("proyectoPagoId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoGastoId_tenant_fkey" FOREIGN KEY ("proyectoGastoId", "tenantId") REFERENCES "ProyectoGasto"("id", "tenantId") ON DELETE SET NULL ("proyectoGastoId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_orderId_tenant_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE SET NULL ("orderId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_appointmentId_tenant_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE SET NULL ("appointmentId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_tenant_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_tenant_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE SET NULL ("orderId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_tenant_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE SET NULL ("appointmentId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "CobroFacturado" ADD CONSTRAINT "CobroFacturado_invoiceId_tenant_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_loteId_tenant_fkey" FOREIGN KEY ("tenantId", "loteId") REFERENCES "VoucherLote"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_clientId_tenant_fkey" FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_appointmentId_tenant_fkey" FOREIGN KEY ("tenantId", "appointmentId") REFERENCES "Appointment"("tenantId", "id") ON DELETE SET NULL ("appointmentId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_collectionId_tenant_fkey" FOREIGN KEY ("tenantId", "collectionId") REFERENCES "Collection"("tenantId", "id") ON DELETE SET NULL ("collectionId") ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "MovimientoImportado" ADD CONSTRAINT "MovimientoImportado_importacionId_tenant_fkey" FOREIGN KEY ("tenantId", "importacionId") REFERENCES "ImportacionBancaria"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;
