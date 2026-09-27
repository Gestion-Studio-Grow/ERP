#!/usr/bin/env bash
# Recorrido completo del súper, de cero, contra una COPIA del laboratorio (nunca Neon):
#   1. copia erp_lab → erp_super_qa y le aplica la migración pendiente de Gate 2 (lotes y
#      columna de góndola) SÓLO a esa copia;
#   2. levanta el build de producción (next start) en :3254 con la app como app_rls (RLS on);
#   3. alta por la consola, cajera, «Trabaja por apps», recorrido A-D.
# Las claves no se guardan en la evidencia: van a $SECRETOS (fuera del repo).
set -euo pipefail
ARBOL=/home/user/erp-super
QA=$ARBOL/.qa/super-2709
SECRETOS=${SECRETOS:?carpeta fuera del repo para la clave temporal}
PG="postgresql://postgres@localhost:5433/erp_super_qa?host=/tmp/pgrun"
source "${ENV_SUPER:?env del laboratorio apuntado a erp_super_qa}"
unset NODE_ENV
dropdb -h /tmp/pgrun -p 5433 -U postgres --if-exists erp_super_qa
createdb -h /tmp/pgrun -p 5433 -U postgres -T erp_lab erp_super_qa
psql "$PG" -v ON_ERROR_STOP=1 -q -f "$ARBOL/prisma/pending-gate2/CarniceriaRubro.sql" 2>/dev/null
psql "$PG" -q -c 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ProductBatch", "ProcessingRun", "ProcessingOutput" TO app_rls;'
cd "$ARBOL"
npx next start -p 3254 > "$SECRETOS/server.log" 2>&1 &
echo $! > "$SECRETOS/server.pid"
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3254/operador/login && break; sleep 1; done
rm -rf "$QA/capturas"; mkdir -p "$QA/capturas"
CLAVE_FUERA_DEL_REPO="$SECRETOS/clave" node "$QA/01-alta.mjs" http://localhost:3254 "$QA/capturas"
DATABASE_URL="$PG" CLAVE_CAJERA="$(cat "$SECRETOS/clave")" RLS_ENFORCEMENT=off npx tsx "$QA/02-cajera.mts"
node "$QA/01b-por-apps.mjs" http://localhost:3254 "$QA/capturas"
CLAVE_DUENIO="$(cat "$SECRETOS/clave")" CLAVE_CAJERA="$(cat "$SECRETOS/clave")" node "$QA/03-recorrido.mjs" http://super.localhost:3254 "$QA/capturas"
