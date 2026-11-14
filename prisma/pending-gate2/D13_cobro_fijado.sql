-- D13 · cobro de proyecto fijado al tipo de cambio de su momento (GSG-MIA-009). PREPARADA, SIN APLICAR (Gate 2: la
-- autoriza el dueño). Reemplaza a la migración 20261114120000_proyecto_pago_cuota (DOUBLE PRECISION), que nunca se aplicó
-- y se borró: la plata va en centavos enteros y el tipo de cambio exacto.
--
-- Qué agrega en "ProyectoPago" (todas NULL, sin default ni backfill: los cobros viejos quedan sin fijar):
--   "cuotaId"             TEXT           la cuota que pagó el cobro («Marcar cobrado»); sin FK a propósito (rastro).
--   "moneda"              TEXT           la moneda del PROYECTO al momento del cobro.
--   "montoMonedaCentavos" BIGINT         lo que valió el cobro en esa moneda, en centavos (R8, src/lib/dinero/redondeo.ts).
--   "tipoCambio"          NUMERIC(18,6)  pesos por unidad de esa moneda, exacto (1.000000 en pesos).
-- CHECKs: centavos ≥ 0; tipo de cambio > 0; (moneda, centavos, tipo de cambio) van los tres o ninguno.
-- Índice ("tenantId", "cuotaId").
-- Trigger BEFORE UPDATE (regla del dueño «lo contabilizado no se edita»): no cambian "id", "monto", "medio", "tenantId",
-- "proyectoId", "createdAt" ni "cobradoPor"; "anuladoEl"/"anuladoPor" sólo pasan de NULL a un valor; las cuatro columnas
-- D13 se cargan UNA vez, juntas, y sólo con el cobro vivo; "nota" es libre.
--
-- RLS: columnas de una tabla que ya tiene su policy; no suma superficie. El código tolera la ausencia de todo esto
-- (`hayColumnasCobroFijado`, src/lib/proyectos/cobranza.server.ts, exige además los tipos). En schema.prisma los campos
-- van comentados con `// GATE2-D13: ` (el predeploy-check no los exige); al aplicar, se descomentan en el mismo PR.
-- Idempotente: se puede correr dos veces. Como dueño, con `psql -v ON_ERROR_STOP=1 -f`.

BEGIN;

-- Una base que tenga la migración vieja (DOUBLE) no se «arregla» sola: primero su vuelta atrás.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ProyectoPago' AND column_name = 'montoMoneda')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ProyectoPago' AND column_name = 'tipoCambio' AND data_type <> 'numeric') THEN
    RAISE EXCEPTION 'ProyectoPago tiene las columnas D13 viejas (en coma flotante): correr antes la vuelta atrás de 20261114120000_proyecto_pago_cuota';
  END IF;
END $$;

ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "cuotaId" TEXT;
ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "moneda" TEXT;
ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "montoMonedaCentavos" BIGINT;
ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "tipoCambio" NUMERIC(18, 6);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"ProyectoPago"'::regclass AND conname = 'ProyectoPago_montoMonedaCentavos_check') THEN
    ALTER TABLE "ProyectoPago" ADD CONSTRAINT "ProyectoPago_montoMonedaCentavos_check" CHECK ("montoMonedaCentavos" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"ProyectoPago"'::regclass AND conname = 'ProyectoPago_tipoCambio_check') THEN
    ALTER TABLE "ProyectoPago" ADD CONSTRAINT "ProyectoPago_tipoCambio_check" CHECK ("tipoCambio" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"ProyectoPago"'::regclass AND conname = 'ProyectoPago_fijado_completo_check') THEN
    ALTER TABLE "ProyectoPago" ADD CONSTRAINT "ProyectoPago_fijado_completo_check"
      CHECK (("moneda" IS NULL) = ("montoMonedaCentavos" IS NULL) AND ("moneda" IS NULL) = ("tipoCambio" IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProyectoPago_tenantId_cuotaId_idx" ON "ProyectoPago" ("tenantId", "cuotaId");

CREATE OR REPLACE FUNCTION proyecto_pago_contabilizado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."monto" IS DISTINCT FROM OLD."monto"
     OR NEW."medio" IS DISTINCT FROM OLD."medio"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."proyectoId" IS DISTINCT FROM OLD."proyectoId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."cobradoPor" IS DISTINCT FROM OLD."cobradoPor" THEN
    RAISE EXCEPTION 'ProyectoPago %: lo contabilizado no se edita (monto, medio, negocio, proyecto, fecha, quién cobró); se anula', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD."anuladoEl" IS NOT NULL AND NEW."anuladoEl" IS DISTINCT FROM OLD."anuladoEl")
     OR (OLD."anuladoPor" IS NOT NULL AND NEW."anuladoPor" IS DISTINCT FROM OLD."anuladoPor") THEN
    RAISE EXCEPTION 'ProyectoPago %: una anulación no se deshace ni se cambia', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."cuotaId" IS DISTINCT FROM OLD."cuotaId"
     OR NEW."moneda" IS DISTINCT FROM OLD."moneda"
     OR NEW."montoMonedaCentavos" IS DISTINCT FROM OLD."montoMonedaCentavos"
     OR NEW."tipoCambio" IS DISTINCT FROM OLD."tipoCambio" THEN
    IF OLD."cuotaId" IS NOT NULL OR OLD."moneda" IS NOT NULL OR OLD."montoMonedaCentavos" IS NOT NULL OR OLD."tipoCambio" IS NOT NULL THEN
      RAISE EXCEPTION 'ProyectoPago %: el cobro ya quedó fijado; lo contabilizado no se edita', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."anuladoEl" IS NOT NULL OR NEW."anuladoEl" IS NOT NULL THEN
      RAISE EXCEPTION 'ProyectoPago %: sólo se fija un cobro vivo (no anulado)', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER "ProyectoPago_contabilizado"
  BEFORE UPDATE ON "ProyectoPago"
  FOR EACH ROW EXECUTE FUNCTION proyecto_pago_contabilizado();

COMMIT;

-- VUELTA ATRÁS (descomentar y correr como dueño; deja "ProyectoPago" como antes de este archivo y pierde lo fijado):
--   BEGIN;
--   DROP TRIGGER IF EXISTS "ProyectoPago_contabilizado" ON "ProyectoPago";
--   DROP FUNCTION IF EXISTS proyecto_pago_contabilizado();
--   DROP INDEX IF EXISTS "ProyectoPago_tenantId_cuotaId_idx";
--   ALTER TABLE "ProyectoPago" DROP CONSTRAINT IF EXISTS "ProyectoPago_montoMonedaCentavos_check", DROP CONSTRAINT IF EXISTS "ProyectoPago_tipoCambio_check", DROP CONSTRAINT IF EXISTS "ProyectoPago_fijado_completo_check";
--   ALTER TABLE "ProyectoPago" DROP COLUMN IF EXISTS "cuotaId", DROP COLUMN IF EXISTS "moneda", DROP COLUMN IF EXISTS "montoMonedaCentavos", DROP COLUMN IF EXISTS "tipoCambio";
--   COMMIT;
