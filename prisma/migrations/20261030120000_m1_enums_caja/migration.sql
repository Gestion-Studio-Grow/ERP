-- N2 · M1 (pase del 30/10/2026, orden del dueño): los tres valores de enum que usa M1, sacados del
-- paquete Gate 2 (prisma/pending-gate2/N2_enums.sql, pasos 2.a, 2.b y 2.e) para aplicarlos con
-- `prisma migrate deploy`. Los de M6 (UserRole REPARTIDOR / ENCARGADO, 2.c y 2.d) siguen en el
-- paquete. `IF NOT EXISTS`: si después se corre N2_enums.sql entero, estas tres no hacen nada.
--
-- 🔴 IRREVERSIBLE: Postgres no tiene `ALTER TYPE … DROP VALUE`. Una vez aplicada, los valores
-- quedan para siempre (salvo recrear el tipo, otro Gate 2).
-- 🔴 VUELTA ATRÁS DEL CÓDIGO: `e2976802` (el código de antes de M1) no conoce estos valores y su
-- cliente de Prisma falla al LEER una fila que los use. Revertir a `e2976802` sólo si la consulta
-- del runbook (docs/runbooks/gate2-nivel2.md §5) da 0 filas; con más de 0, se arregla hacia
-- adelante sobre M1.
--
-- Ninguna sentencia de esta migración usa los valores nuevos: `ADD VALUE` dentro de la transacción
-- de la migración es válido en Postgres 12+ mientras no se use el valor en esa misma transacción.

-- 2.a · Débito (D-C01)
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DEBITO';
-- 2.b · Crédito (D-C01)
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDITO';
-- 2.e · Transferencia con su propia columna en el libro de caja (M1-C2)
ALTER TYPE "CashMethod" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA';
