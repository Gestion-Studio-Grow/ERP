-- ============================================================================
-- N2_enums — valores nuevos de enums del nivel 2 (paso 2 de 7 del paquete Gate 2)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01)
-- ============================================================================
--
-- QUIÉN LA USA: M1 (Débito y Crédito en caja: PaymentMethod.DEBITO / PaymentMethod.CREDITO; la
-- transferencia con su propia columna en el libro: CashMethod.TRANSFERENCIA, orden del dueño 29/10) ·
-- M6 (roles Repartidor y Encargado: UserRole.REPARTIDOR / UserRole.ENCARGADO).
-- Runbook: docs/runbooks/gate2-nivel2.md · Paquete: prisma/pending-gate2/README.md.
--
-- DECISIÓN DEL DUEÑO D-C01 (28/10/2026): Débito y Crédito van SEPARADOS en todo el ERP (dos
-- valores de PaymentMethod, no uno "TARJETA"). El cierre de caja muestra una columna "Tarjeta"
-- que SUMA los dos: es una agregación de pantalla, no un valor de la base. PaymentMethod hoy
-- (prisma/schema.prisma) = MERCADOPAGO, EFECTIVO, TRANSFERENCIA: no trae ningún valor de
-- tarjeta, así que no se duplica nada. (`CashMethod.TARJETA`, el medio del libro de caja, es
-- otro enum y no lo toca este paquete: lo resuelve M1.)
--
-- 🔴 IRREVERSIBLE: Postgres no tiene `ALTER TYPE … DROP VALUE`. Un valor agregado queda para
-- siempre salvo recrear el tipo (procedimiento manual al pie, otro Gate 2). Por eso el nombre
-- se fija ANTES de aplicar (D-C01) y no se corrige después.
--
-- ⚠️ CÓMO SE APLICA (S2-C3) — CADA `ADD VALUE` EN SU PROPIO PASO:
--   Este archivo NO tiene BEGIN/COMMIT a propósito. Postgres (12+) acepta `ALTER TYPE … ADD
--   VALUE` dentro de una transacción, pero el valor nuevo NO SE PUEDE USAR en esa misma
--   transacción ("unsafe use of new value"). Si se lo mete en un bloque junto con algo que lo
--   use (un default, un INSERT, un CHECK) la ventana falla a mitad. Por eso:
--     · se corre con `psql -v ON_ERROR_STOP=1 -f N2_enums.sql` SIN `--single-transaction`:
--       psql en autocommit confirma cada sentencia sola → cuatro pasos, cuatro commits;
--     · ninguna otra migración del paquete usa estos valores (ni defaults ni CHECKs), así
--       que el orden 2 → 3 … 7 no depende de que estén "visibles" en otra transacción.
--
-- 🔴 REGLA PARA M1 Y M6 — ENCENDER `// N2-enum:` Y DESPLEGAR ANTES DEL PRIMER VALOR NUEVO:
--   Un cliente de Prisma generado SIN el valor falla al LEER una fila que lo tenga ("Value
--   'DEBITO' not found in enum 'PaymentMethod'"), y esa lectura puede ser cualquier pantalla
--   (caja, ventas, KPI), no sólo la de la tanda. Orden obligatorio:
--     1. este archivo aplicado (día D);
--     2. la tanda quita `// N2-enum: ` de SUS valores en schema.prisma, `prisma generate`, tsc,
--        y DESPLIEGA ese build (todas las funciones vivas con el cliente nuevo);
--     3. recién después el código escribe el primer DEBITO/CREDITO/REPARTIDOR/ENCARGADO.
--   Chequeo automático: el código escribe sólo si `sePuedeEscribirValorEnum(tipo, valor)`
--   (src/lib/schema-probe) da true = la base tiene el valor Y el cliente de este build lo
--   conoce. Y src/lib/schema-probe/paquete-gate2-estatico.test.ts falla si este archivo y las
--   marcas `// N2-enum:` de schema.prisma no nombran exactamente los mismos valores.
--   Nunca escribir estos valores por SQL a mano antes del paso 2.
--
-- ADITIVA e IDEMPOTENTE: `ADD VALUE IF NOT EXISTS` no falla si el valor ya está. Re-correr
-- el archivo no hace nada. No cambia filas existentes.
--
-- TOLERANCIA DEL CÓDIGO: hasta que se aplique, `hayValorEnum("PaymentMethod","DEBITO")`
-- (src/lib/schema-probe) contesta false y M1/M6 muestran «En preparación» / ocultan la opción.
-- ============================================================================

-- Paso 2.a · Medio de pago DEBITO (tarjeta de débito con posnet: M1, D-C01).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DEBITO';

-- Paso 2.b · Medio de pago CREDITO (tarjeta de crédito con posnet: M1, D-C01). El cierre de
-- caja los suma en la columna "Tarjeta"; en la base y en los reportes van separados.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDITO';

-- Paso 2.c · Rol REPARTIDOR (vista del cadete, rendición por cadete: M6).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'REPARTIDOR';

-- Paso 2.d · Rol ENCARGADO (autoriza fiado sobre el límite, reabre el día: M6, M7, M1).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ENCARGADO';

-- Paso 2.e · Medio del libro TRANSFERENCIA (M1-C2, orden del dueño 29/10/2026). Hasta acá el libro
-- junta la transferencia con Mercado Pago en `MP`; desde acá cada asiento NUEVO de una
-- transferencia va a su columna (`transferenciaEnElLibroTx`, src/lib/caja). Los de antes quedan
-- en `MP` y el cierre los separa por el medio de origen. M1 ya lo encendió en el cliente
-- (`TRANSFERENCIA // N2-enum-encendido:` en `enum CashMethod`).
ALTER TYPE "CashMethod" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA';

-- Post-check (aparte):
--   SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname IN ('PaymentMethod','UserRole','CashMethod') ORDER BY t.typname, e.enumsortorder;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (leer antes de usar) — 🔴 no hay reversa automática
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres NO tiene `ALTER TYPE … DROP VALUE`. La reversa práctica es DEJAR los valores:
-- son inocuos mientras ninguna fila los use (el código viejo nunca los escribe). Si hubiera
-- que sacarlos de verdad (no recomendado, toca tablas vivas — es otro Gate 2):
--   1. Verificar que nadie los usa (TODAS las columnas de esos tipos, según pg_attribute):
--        SELECT count(*) FROM "Payment"      WHERE method::text IN ('DEBITO','CREDITO');
--        SELECT count(*) FROM "Order"        WHERE "paymentMethod"::text IN ('DEBITO','CREDITO');
--        SELECT count(*) FROM "Collection"   WHERE method::text IN ('DEBITO','CREDITO');
--        SELECT count(*) FROM "User"         WHERE role::text IN ('REPARTIDOR','ENCARGADO');
--        SELECT count(*) FROM "CashMovement" WHERE method::text IN ('TRANSFERENCIA');
--   2. Recrear el tipo sin los valores (por cada enum):
--        ALTER TYPE "UserRole" RENAME TO "UserRole_old";
--        CREATE TYPE "UserRole" AS ENUM ('OWNER','RECEPTION','PROFESSIONAL');
--        ALTER TABLE "User" ALTER COLUMN role TYPE "UserRole" USING role::text::"UserRole";
--        DROP TYPE "UserRole_old";
--        ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
--        CREATE TYPE "PaymentMethod" AS ENUM ('MERCADOPAGO','EFECTIVO','TRANSFERENCIA');
--        -- Payment.method, Order.paymentMethod, Collection.method (si una columna tiene
--        -- DEFAULT, sacarlo antes del ALTER y reponerlo después):
--        ALTER TABLE "Payment"    ALTER COLUMN method TYPE "PaymentMethod" USING method::text::"PaymentMethod";
--        ALTER TABLE "Order"      ALTER COLUMN "paymentMethod" TYPE "PaymentMethod" USING "paymentMethod"::text::"PaymentMethod";
--        ALTER TABLE "Collection" ALTER COLUMN method TYPE "PaymentMethod" USING method::text::"PaymentMethod";
--        DROP TYPE "PaymentMethod_old";
--        ALTER TYPE "CashMethod" RENAME TO "CashMethod_old";
--        CREATE TYPE "CashMethod" AS ENUM ('EFECTIVO','MP','TARJETA');
--        -- CashMovement.method tiene DEFAULT 'EFECTIVO': se saca antes y se repone después.
--        ALTER TABLE "CashMovement" ALTER COLUMN method DROP DEFAULT;
--        ALTER TABLE "CashMovement" ALTER COLUMN method TYPE "CashMethod" USING method::text::"CashMethod";
--        ALTER TABLE "CashMovement" ALTER COLUMN method SET DEFAULT 'EFECTIVO';
--        DROP TYPE "CashMethod_old";
-- Sin el paso 2, los valores quedan y no molestan: es la opción de la reversa del runbook.
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
