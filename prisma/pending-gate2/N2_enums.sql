-- ============================================================================
-- N2_enums — valores nuevos de enums del nivel 2 (paso 2 de 7 del paquete Gate 2)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01)
-- ============================================================================
--
-- QUIÉN LA USA: M1 (Tarjeta real en caja: PaymentMethod.TARJETA) · M6 (roles Repartidor y
-- Encargado: UserRole.REPARTIDOR / UserRole.ENCARGADO).
-- Runbook: docs/runbooks/gate2-nivel2.md · Paquete: prisma/pending-gate2/README.md.
--
-- ⚠️ CÓMO SE APLICA (S2-C3) — CADA `ADD VALUE` EN SU PROPIO PASO:
--   Este archivo NO tiene BEGIN/COMMIT a propósito. Postgres (12+) acepta `ALTER TYPE … ADD
--   VALUE` dentro de una transacción, pero el valor nuevo NO SE PUEDE USAR en esa misma
--   transacción ("unsafe use of new value"). Si se lo mete en un bloque junto con algo que lo
--   use (un default, un INSERT, un CHECK) la ventana falla a mitad. Por eso:
--     · se corre con `psql -v ON_ERROR_STOP=1 -f N2_enums.sql` SIN `--single-transaction`:
--       psql en autocommit confirma cada sentencia sola → tres pasos, tres commits;
--     · ninguna otra migración del paquete usa estos valores (ni defaults ni CHECKs), así
--       que el orden 2 → 3 … 7 no depende de que estén "visibles" en otra transacción.
--
-- ADITIVA e IDEMPOTENTE: `ADD VALUE IF NOT EXISTS` no falla si el valor ya está. Re-correr
-- el archivo no hace nada. No cambia filas existentes.
--
-- TOLERANCIA DEL CÓDIGO: hasta que se aplique, `hayValorEnum("PaymentMethod","TARJETA")`
-- (src/lib/schema-probe) contesta false y M1/M6 muestran «En preparación» / ocultan la opción.
-- ============================================================================

-- Paso 2.a · Medio de pago TARJETA (débito/crédito con posnet: M1, cierre con columnas separadas).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'TARJETA';

-- Paso 2.b · Rol REPARTIDOR (vista del cadete, rendición por cadete: M6).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'REPARTIDOR';

-- Paso 2.c · Rol ENCARGADO (autoriza fiado sobre el límite, reabre el día: M6, M7, M1).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ENCARGADO';

-- Post-check (aparte):
--   SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname IN ('PaymentMethod','UserRole') ORDER BY t.typname, e.enumsortorder;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (leer antes de usar)
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres NO tiene `ALTER TYPE … DROP VALUE`. La reversa práctica es DEJAR los valores:
-- son inocuos mientras ninguna fila los use (el código viejo nunca los escribe). Si hubiera
-- que sacarlos de verdad (no recomendado, toca tablas vivas — es otro Gate 2):
--   1. Verificar que nadie los usa:
--        SELECT count(*) FROM "Payment"      WHERE method::text = 'TARJETA';
--        SELECT count(*) FROM "Order"        WHERE "paymentMethod"::text = 'TARJETA';
--        SELECT count(*) FROM "Collection"   WHERE method::text = 'TARJETA';
--        SELECT count(*) FROM "User"         WHERE role::text IN ('REPARTIDOR','ENCARGADO');
--   2. Recrear el tipo sin el valor (por cada enum):
--        ALTER TYPE "UserRole" RENAME TO "UserRole_old";
--        CREATE TYPE "UserRole" AS ENUM ('OWNER','RECEPTION','PROFESSIONAL');
--        ALTER TABLE "User" ALTER COLUMN role TYPE "UserRole" USING role::text::"UserRole";
--        -- PaymentMethod: Payment.method, Order.paymentMethod, Collection.method (mismo molde;
--        -- si una columna tiene DEFAULT, sacarlo antes del ALTER y reponerlo después)
--        DROP TYPE "UserRole_old";
-- Sin el paso 2, los valores quedan y no molestan: es la opción de la reversa del runbook.
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
