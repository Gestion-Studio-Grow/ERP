#!/usr/bin/env bash
# R0-F1 · `prisma migrate deploy` sobre una COPIA de erp_lab (datos de laboratorio), probando que
# las migraciones anteriores y sus datos quedan intactos, que la reversa corre con datos, que RLS
# queda prendido y que el aislamiento por negocio y el único [conector, cuentaExterna] frenan.
# SÓLO local (puerto 5433, socket /tmp/pgrun). Nunca contra Neon. La copia se borra al final.
set -euo pipefail
cd /home/user/erp
OUT=.qa/vender-1/r0f1-migracion
S="postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun"
C="postgresql://postgres@localhost:5433/r0f1_lab_copia?host=/tmp/pgrun"
MIG=prisma/migrations
NUEVAS="'IntegracionConexion','IntegracionCredencial','EventoIntegracion','IntegracionUso','IntegracionEstadoOAuth','ContactoCartera','ConversacionWhatsapp','MensajeWhatsapp','ExtractoRecibido','DelegacionFiscal','ReceptorFiscal','EnvioComprobante','ArcaAuthTicket'"
psql "$S" -qc "drop database if exists r0f1_lab_copia"
if ! psql "$S" -qc "create database r0f1_lab_copia template erp_lab" 2>/dev/null; then
  psql "$S" -qc "create database r0f1_lab_copia"
  pg_dump -h /tmp/pgrun -p 5433 -U postgres erp_lab | psql -q "$C" > /dev/null
fi
echo "1. copia de erp_lab con $(psql "$C" -Atc 'select count(*) from _prisma_migrations') migraciones aplicadas"
psql -v ON_ERROR_STOP=1 -q "$C" -f $MIG/20260925150000_comprobante_autorizado_inmutable/rollback.sql
psql -v ON_ERROR_STOP=1 -q "$C" -f $MIG/20260925120000_lanzamiento_base/rollback.sql
echo "2. reversas (150000 y 120000) corridas con datos: quedan $(psql "$C" -Atc 'select count(*) from _prisma_migrations') migraciones; tablas nuevas presentes: $(psql "$C" -Atc "select count(*) from pg_class where relname in ($NUEVAS)")"
psql "$C" -Atc "select format('select %L, count(*), md5(coalesce(string_agg(md5(row(%s)::text), '''' order by md5(row(%s)::text)), '''')) from %I;', table_name, cols, cols, table_name) from (select c.table_name, string_agg(format('%I', c.column_name), ',' order by c.ordinal_position) cols from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.table_name <> '_prisma_migrations' group by c.table_name) s order by table_name" > $OUT/lab-foto.sql
psql "$C" -At -F'|' -f $OUT/lab-foto.sql > $OUT/lab-antes.txt
DATABASE_URL="$C" MIGRATE_DATABASE_URL="$C" npx prisma migrate deploy > $OUT/lab-deploy.txt 2>&1
echo "3. migrate deploy: $(tail -1 $OUT/lab-deploy.txt)"
echo "   últimas aplicadas, en orden: $(psql "$C" -Atc "select string_agg(migration_name, ' -> ' order by started_at) from (select * from _prisma_migrations order by started_at desc limit 3) x")"
psql "$C" -At -F'|' -f $OUT/lab-foto.sql > $OUT/lab-despues.txt
diff $OUT/lab-antes.txt $OUT/lab-despues.txt > /dev/null && echo "4. datos anteriores intactos: $(wc -l < $OUT/lab-antes.txt) tablas con las mismas filas y el mismo md5 de sus columnas ($(awk -F'|' '{s+=$2} END {print s}' $OUT/lab-antes.txt) filas)"
echo "5. filas de hoy con algo cargado en lo nuevo (debe ser 0): $(psql "$C" -Atc "select (select count(*) from \"Client\" where coalesce(\"razonSocial\",\"docNro\",\"condicionIva\",\"domicilio\") is not null or \"docTipo\" is not null) + (select count(*) from \"Product\" where codigo is not null or \"alicuotaIva\" is not null) + (select count(*) from \"StockPurchase\" where \"facturaNumero\" is not null or \"facturaCuit\" is not null or \"facturaTotal\" is not null) + (select count(*) from \"Tenant\" where \"cuentasCorrientes\" is not null or perfiles is not null or \"fceMiPyme\" or \"arcaCondicionIva\" is not null) + (select count(*) from \"OutboxEvent\" where \"conexionId\" is not null)")"
# SIN 0001 (corrección del refutador): el deploy (scripts/vercel-build.mjs) migra y no la corre, y
# 0001 borra y vuelve a crear las políticas, así que taparía lo que trae la migración. Sólo los
# GRANT de 0002 (en Neon llegan por ALTER DEFAULT PRIVILEGES; acá migró el superusuario local).
psql -v ON_ERROR_STOP=1 -q "$C" -f prisma/rls/0002_app_role.sql > $OUT/lab-rls-0002.txt 2>&1
POL="(\"tenantId\" = current_setting('app.current_tenant_id'::text, true))"
echo "6. SIN correr 0001. Tabla nueva | RLS | políticas | USING y WITH CHECK = negocio de la transacción:"
psql "$C" -At -F' | ' -c "select c.relname, c.relrowsecurity, string_agg(p.policyname, ',' order by p.policyname), bool_and(p.qual = \$\$$POL\$\$ and p.with_check = \$\$$POL\$\$) from pg_class c left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname where c.relkind = 'r' and c.relname in ($NUEVAS) group by 1, 2 order by 1" | sed 's/^/   /'
A=$(psql "$C" -Atc 'select id from "Tenant" order by id limit 1'); B=$(psql "$C" -Atc 'select id from "Tenant" order by id offset 1 limit 1')
echo "7. como app_rls, negocio A=$A, B=$B (todo en una transacción que se deshace):"
psql "$C" -At -F' ' 2>&1 <<SQL | grep -vE '^(BEGIN|SET|SAVEPOINT|ROLLBACK|INSERT 0 1)$' | sed 's/^/   /'
begin;
set local role app_rls;
select set_config('app.current_tenant_id', '$A', true) is not null as "con A";
insert into "IntegracionConexion"(id, "tenantId", conector, "cuentaExterna", "updatedAt") values ('r0f1-a', '$A', 'whatsapp', '5491100000000', now());
select 'A ve sus conexiones:', count(*) from "IntegracionConexion";
select set_config('app.current_tenant_id', '$B', true) is not null as "con B";
select 'B ve conexiones de A:', count(*) from "IntegracionConexion";
savepoint s1;
insert into "IntegracionConexion"(id, "tenantId", conector, "cuentaExterna", "updatedAt") values ('r0f1-b', '$B', 'whatsapp', '5491100000000', now());
rollback to s1;
insert into "IntegracionConexion"(id, "tenantId", conector, "cuentaExterna", "updatedAt") values ('r0f1-c', '$A', 'whatsapp', '5491199999999', now());
rollback to s1;
insert into "IntegracionConexion"(id, "tenantId", conector, "cuentaExterna", "updatedAt") values ('r0f1-d', '$B', 'WhatsApp', '5491100000000', now());
rollback to s1;
insert into "IntegracionUso"(id, "tenantId", "conexionId", mes) values ('r0f1-u', '$B', 'r0f1-a', '2026-10');
rollback to s1;
select set_config('app.current_tenant_id', '', true) is not null as "sin negocio";
select 'sin negocio ve:', count(*) from "IntegracionConexion";
rollback;
SQL
psql "$S" -qc "drop database r0f1_lab_copia"
echo "8. copia borrada. erp_lab no se tocó: $(psql "postgresql://postgres@localhost:5433/erp_lab?host=/tmp/pgrun" -Atc 'select count(*) from _prisma_migrations') migraciones."
