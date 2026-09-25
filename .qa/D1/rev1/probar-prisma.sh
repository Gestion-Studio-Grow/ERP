#!/usr/bin/env bash
# D1 rev. 1 · la plantilla con `prisma migrate deploy` (criterio M4). Necesita Postgres en 5433 y
# node_modules con prisma 7 en mini/ (ln -s <repo>/node_modules mini/node_modules).
# 1) sin autorizar la fila pay9 (1851,8505) frena con P3018 "D1: …" y la base queda igual;
# 2) `migrate resolve --rolled-back`, se autoriza el id y pasa; 3) la reversa como migración nueva
# pasa y `migrate status` queda al día. Salida del 2026-09-25 en probar-prisma-salida.txt.
set -u; cd "$(dirname "$0")/mini"
M=prisma/migrations/20260925000100_d1_prueba/migration.sql; cp $M /tmp/d1-aut.sql
sed -i "s/ARRAY\[ 'Payment.amount:pay9' \]::text\[\]/ARRAY[]::text[]/" $M
P="psql -h localhost -p 5433 -U postgres -qX"
$P -d postgres -c "DROP DATABASE IF EXISTS erp_d1_mini" -c "CREATE DATABASE erp_d1_mini"
export DATABASE_URL="postgresql://postgres@localhost:5433/erp_d1_mini"
npx prisma migrate deploy 2>&1 | grep -E 'D1:|P30' | head -2
npx prisma migrate resolve --rolled-back 20260925000100_d1_prueba 2>&1 | grep -i rolled
cp /tmp/d1-aut.sql $M; npx prisma migrate deploy 2>&1 | grep -E 'successfully|Error'
$P -d erp_d1_mini -Atc 'select id, amount, amount_float from "Payment" order by id'
mkdir -p prisma/migrations/20260925000200_d1_prueba_revertir
sed -e "s/@PARES@/['Payment','amount','2'], ['StockMovement','unitCost','6']/" ../reversa.sql.in > prisma/migrations/20260925000200_d1_prueba_revertir/migration.sql
npx prisma migrate deploy 2>&1 | grep -E 'successfully|Error'; npx prisma migrate status 2>&1 | grep -iE 'up to date|failed'
$P -d erp_d1_mini -Atc 'select id, amount, pg_typeof(amount) from "Payment" order by id'
rm -rf prisma/migrations/20260925000200_d1_prueba_revertir; $P -d postgres -c "DROP DATABASE erp_d1_mini"
