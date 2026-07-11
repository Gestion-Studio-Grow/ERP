-- I2 (ADR-064) — IDEMPOTENCIA comprobante↔venta 1:1: índice ÚNICO por origen en Invoice.
--
-- Convierte los índices D10 `(tenantId, orderId)` y `(tenantId, appointmentId)` de NO-únicos
-- a ÚNICOS. Es la guarda a nivel DB que cierra la ventana de carrera del check-then-create de
-- `createInvoice` (src/lib/invoice-core.ts): dos disparos simultáneos de "emitir factura" para
-- la misma venta pasan ambos el chequeo aplicativo y crean → el UNIQUE hace fallar al 2º con
-- P2002, la tx aborta y el Core refetchea y devuelve el comprobante ganador. Sin este UNIQUE la
-- idempotencia solo cubre el caso SECUENCIAL (reintentos), no el concurrente.
--
-- NULLs no colisionan en un UNIQUE de Postgres → las facturas SIN origen (Mercado Pago
-- standalone / previas a D10) conviven sin límite; el 1:1 aplica solo cuando hay venta enlazada.
--
-- ADITIVA y REVERSIBLE (recrea el índice como no-único). Depende de `20260708230200_add_invoice_origin`
-- (crea las columnas/índices de origen), que corre antes por timestamp.
--
-- ⚠️ Gate 2 (OK del dueño): NO aplicada a Neon. Se aplica con `prisma migrate deploy` junto con
-- las demás migraciones fiscales pendientes. Verificada OFFLINE (schema válido + `tsc` + tests-gate
-- I2 en verde con doble de test, sin tocar la DB). Riesgo de aplicación: si HOY existieran en prod
-- dos facturas con el mismo (tenantId, orderId) el CREATE UNIQUE fallaría → debe verificarse que no
-- haya duplicados de origen antes de aplicar (query de control en el runbook de deploy fiscal).

-- DropIndex (los no-únicos de D10)
DROP INDEX "Invoice_tenantId_orderId_idx";
DROP INDEX "Invoice_tenantId_appointmentId_idx";

-- CreateIndex (ahora ÚNICOS — 1:1 venta↔comprobante)
CREATE UNIQUE INDEX "Invoice_tenantId_orderId_key" ON "Invoice"("tenantId", "orderId");
CREATE UNIQUE INDEX "Invoice_tenantId_appointmentId_key" ON "Invoice"("tenantId", "appointmentId");
