#!/usr/bin/env bash
# Prueba la plantilla v2 de D1 contra un Postgres local. Uso: ./probar.sh
set -u
PSQL="psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=0 -q -X"
DB=erp_d1_v2
PARES="['Payment','amount','2'], ['Service','price','2'], ['Service','depositAmount','2'], ['CashMovement','amount','2'], ['StockMovement','unitCost','6']"
llenar() { sed -e "s/@PARES@/$PARES/" -e "s/@AUTORIZADAS@/$1/" "$2"; }
base() {
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
  $PSQL -d $DB <<'SQL'
CREATE TABLE "Payment" (id text PRIMARY KEY, "tenantId" text NOT NULL, amount double precision NOT NULL);
CREATE TABLE "Service" (id text PRIMARY KEY, "tenantId" text NOT NULL, price double precision NOT NULL DEFAULT 0, "depositAmount" double precision);
CREATE TABLE "CashMovement" (id text PRIMARY KEY, "tenantId" text NOT NULL, method text NOT NULL, amount double precision NOT NULL);
CREATE TABLE "StockMovement" (id text PRIMARY KEY, "tenantId" text NOT NULL, "unitCost" double precision);
INSERT INTO "Payment" VALUES ('pay1','ch',3000), ('pay2','ch',0.1+0.2), ('pay3','magra',1234.56);
INSERT INTO "Service" VALUES ('svc1','ch',12000,3000), ('svc2','ch',9999.99,NULL);
INSERT INTO "CashMovement" VALUES ('cm1','ch','EFECTIVO',3000), ('cm2','ch','EFECTIVO',0.1+0.2);
INSERT INTO "StockMovement" VALUES ('sm1','magra',round(7004.0/7*1e6)/1e6), ('sm2','magra',1000), ('sm3','magra',NULL);
SQL
}
huella() { $PSQL -d $DB -Atc "SELECT md5(string_agg(t||':'||id||':'||coalesce(encode(float8send(v),'hex'),'-'), ',' ORDER BY t,id)) FROM (
  SELECT 'Payment' t, id, amount v FROM \"Payment\" WHERE id IN ('pay2','pay3') UNION ALL
  SELECT 'Service', id, \"depositAmount\" FROM \"Service\" WHERE id='svc2' UNION ALL
  SELECT 'CashMovement', id, amount FROM \"CashMovement\" WHERE id IN ('cm1','cm2') UNION ALL
  SELECT 'StockMovement', id, \"unitCost\" FROM \"StockMovement\") x"; }
estado() { $PSQL -d $DB -Atc "SELECT 'Payment '||id||'='||amount FROM \"Payment\" UNION ALL SELECT 'Service '||id||' price='||price||' dep='||coalesce(\"depositAmount\"::text,'null') FROM \"Service\" UNION ALL SELECT 'CM '||id||'='||amount FROM \"CashMovement\" UNION ALL SELECT 'SM '||id||'='||coalesce(\"unitCost\"::text,'null') FROM \"StockMovement\" ORDER BY 1" | tr '\n' ';'; echo; }

echo "== A · subir, escribir en el medio (como el código nuevo), bajar con la reversa v2"
base
H0=$(huella)
llenar "" plantilla.sql.in | $PSQL -d $DB 2>&1 | grep -v "^$"
echo "tipos: $($PSQL -d $DB -Atc "SELECT string_agg(table_name||'.'||column_name||'='||data_type||coalesce('('||numeric_precision||','||numeric_scale||')',''), ' ' ORDER BY 1) FROM information_schema.columns WHERE column_name IN ('amount','price','depositAmount','unitCost')")"
# cobro del saldo: Payment de la seña 3000 pasa a 12000 y entra 9000 a caja; aumento de precio; alta nueva
$PSQL -d $DB -c "UPDATE \"Payment\" SET amount = 12000 WHERE id='pay1'" -c "INSERT INTO \"CashMovement\" VALUES ('cm3','ch','EFECTIVO',9000)" \
  -c "UPDATE \"Service\" SET price = 13500, \"depositAmount\" = 3500 WHERE id='svc1'" -c "INSERT INTO \"Payment\" VALUES ('pay4','ch',777.77)"
llenar "" reversa.sql.in | $PSQL -d $DB 2>&1 | grep -v "^$"
estado
H1=$(huella); echo "huella de las filas que nadie tocó: antes $H0 / después $H1 → $([ "$H0" = "$H1" ] && echo IGUAL || echo DISTINTA)"
echo "caja ch = $($PSQL -d $DB -Atc "SELECT sum(amount) FROM \"CashMovement\" WHERE \"tenantId\"='ch' AND id<>'cm2'") ; Payment pay1 = $($PSQL -d $DB -Atc "SELECT amount FROM \"Payment\" WHERE id='pay1'")"

echo "== B · la reversa de antes (coalesce) con la misma secuencia"
base
llenar "" plantilla.sql.in | $PSQL -d $DB 2>&1 | grep -v "^$"
$PSQL -d $DB -c "UPDATE \"Payment\" SET amount = 12000 WHERE id='pay1'" -c "UPDATE \"Service\" SET price = 13500, \"depositAmount\" = 3500 WHERE id='svc1'"
$PSQL -d $DB -c 'ALTER TABLE "Payment" ALTER COLUMN amount TYPE double precision USING coalesce(amount_float, amount::float8)' \
             -c 'ALTER TABLE "Service" ALTER COLUMN price TYPE double precision USING coalesce(price_float, price::float8), ALTER COLUMN "depositAmount" TYPE double precision USING coalesce("depositAmount_float", "depositAmount"::float8)'
echo "reversa vieja: Payment pay1 = $($PSQL -d $DB -Atc "SELECT amount FROM \"Payment\" WHERE id='pay1'"), Service svc1 = $($PSQL -d $DB -Atc "SELECT price||' / '||\"depositAmount\" FROM \"Service\" WHERE id='svc1'")"

echo "== C · un importe con fracción de centavo sin autorizar (la comisión 1851,8505 de antes)"
base
$PSQL -d $DB -c "INSERT INTO \"Payment\" VALUES ('pay9','ch',1851.8505)"
llenar "" plantilla.sql.in | $PSQL -d $DB 2>&1 | grep -E "ERROR" | head -2
echo "tipo después: $($PSQL -d $DB -Atc "SELECT data_type FROM information_schema.columns WHERE table_name='Payment' AND column_name='amount'"); columnas _float: $($PSQL -d $DB -Atc "SELECT count(*) FROM information_schema.columns WHERE column_name LIKE '%_float'")"

echo "== D · la misma fila, autorizada por el dueño"
llenar "'Payment.amount:pay9'" plantilla.sql.in | $PSQL -d $DB 2>&1 | grep -E "ERROR" | head -2
echo "pay9 = $($PSQL -d $DB -Atc "SELECT amount||' (respaldo '||amount_float||')' FROM \"Payment\" WHERE id='pay9'"); sm1 = $($PSQL -d $DB -Atc "SELECT \"unitCost\" FROM \"StockMovement\" WHERE id='sm1'")"

echo "== E · costo unitario de 6 decimales en una columna de 2 (sin autorizar)"
base
sed -e "s/@PARES@/['StockMovement','unitCost','2']/" -e "s/@AUTORIZADAS@//" plantilla.sql.in | $PSQL -d $DB 2>&1 | grep -E "ERROR" | head -2

echo "== F · NaN"
base
$PSQL -d $DB -c "INSERT INTO \"Payment\" VALUES ('payN','ch','NaN')"
llenar "" plantilla.sql.in | $PSQL -d $DB 2>&1 | grep -E "ERROR" | head -2

echo "== G · RLS forzado y un dueño sin BYPASSRLS"
base
$PSQL -d postgres -c "DROP ROLE IF EXISTS d1_duenio" -c "CREATE ROLE d1_duenio LOGIN PASSWORD 'x' NOBYPASSRLS"
$PSQL -d $DB -c "INSERT INTO \"Payment\" VALUES ('payN','ch','NaN')" -c "ALTER TABLE \"Payment\" OWNER TO d1_duenio" -c "ALTER TABLE \"Service\" OWNER TO d1_duenio" -c "ALTER TABLE \"CashMovement\" OWNER TO d1_duenio" -c "ALTER TABLE \"StockMovement\" OWNER TO d1_duenio" \
  -c "ALTER TABLE \"Payment\" ENABLE ROW LEVEL SECURITY" -c "ALTER TABLE \"Payment\" FORCE ROW LEVEL SECURITY" \
  -c "CREATE POLICY tenant_isolation ON \"Payment\" USING (\"tenantId\" = current_setting('app.current_tenant_id', true))"
echo "-- sin row_security=off (plantilla vieja en ese punto):"
llenar "" plantilla.sql.in | grep -v "row_security" | PGPASSWORD=x psql -h localhost -p 5433 -U d1_duenio -d $DB -q -X 2>&1 | grep -E "ERROR" | head -2
echo "   tipo: $($PSQL -d $DB -Atc "SELECT data_type FROM information_schema.columns WHERE table_name='Payment' AND column_name='amount'"); NaN adentro: $($PSQL -d $DB -Atc "SELECT count(*) FROM \"Payment\" WHERE amount::text='NaN'")"
base
$PSQL -d $DB -c "INSERT INTO \"Payment\" VALUES ('payN','ch','NaN')" -c "ALTER TABLE \"Payment\" OWNER TO d1_duenio" -c "ALTER TABLE \"Service\" OWNER TO d1_duenio" -c "ALTER TABLE \"CashMovement\" OWNER TO d1_duenio" -c "ALTER TABLE \"StockMovement\" OWNER TO d1_duenio" \
  -c "ALTER TABLE \"Payment\" ENABLE ROW LEVEL SECURITY" -c "ALTER TABLE \"Payment\" FORCE ROW LEVEL SECURITY" \
  -c "CREATE POLICY tenant_isolation ON \"Payment\" USING (\"tenantId\" = current_setting('app.current_tenant_id', true))"
echo "-- con row_security=off (plantilla v2):"
llenar "" plantilla.sql.in | PGPASSWORD=x psql -h localhost -p 5433 -U d1_duenio -d $DB -q -X 2>&1 | grep -E "ERROR" | head -2
echo "   tipo: $($PSQL -d $DB -Atc "SELECT data_type FROM information_schema.columns WHERE table_name='Payment' AND column_name='amount'")"

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "DROP ROLE IF EXISTS d1_duenio"
