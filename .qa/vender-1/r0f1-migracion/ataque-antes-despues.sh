#!/usr/bin/env bash
# R0-F1 · Los ataques del refutador, como app_rls con la sesión de A y los ids de B, contra la
# migración VIEJA (md5 dfd86de8…, copia en migration-antes-dfd86de8.sql) y la NUEVA. Base armada como
# el deploy: todas las migraciones como neondb_owner + GRANT de 0002, SIN 0001. Sólo local.
# Uso: bash ataque-antes-despues.sh   (desde /home/user/erp)
set -uo pipefail
S="postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun"
Q=.qa/vender-1/r0f1-migracion
correr() { # $1 = nombre, $2 = migration.sql de 20260925120000
  local db=r0f1_ataque_$1; local U="postgresql://neondb_owner@localhost:5433/$db?host=/tmp/pgrun"
  psql "$S" -qc "drop database if exists $db" 2>/dev/null; psql "$S" -qc "create database $db owner neondb_owner"
  for d in $(ls prisma/migrations | grep -v migration_lock | sort); do
    f=prisma/migrations/$d/migration.sql; [ "$d" = 20260925120000_lanzamiento_base ] && f=$2
    psql -v ON_ERROR_STOP=1 -q "$U" -f "$f" > /dev/null 2>&1 || { echo "falló $d"; return; }
  done
  psql -q "$U" -c 'GRANT USAGE ON SCHEMA public TO app_rls; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;'
  psql -q "$U" > /dev/null <<'SQL'
insert into "Tenant"(id, name, slug, "updatedAt") values ('neg_a','A','neg_a',now()), ('neg_b','B','neg_b',now());
insert into "IntegracionConexion"(id, "tenantId", conector, "cuentaExterna", "updatedAt") values ('cx_a','neg_a','whatsapp','pn_A',now()), ('cx_b','neg_b','whatsapp','pn_B',now());
insert into "IntegracionCredencial"(id, "tenantId", "conexionId", campo, "kekId", "wrappedDek", sealed, "cargadaPor", "updatedAt") values ('cr_b','neg_b','cx_b','access_token','k','w','s','u',now());
SQL
  echo "== migración $1 ($(md5sum "$2" | cut -c1-8)…); 'INSERT 0 1' = el ataque PASÓ"
  psql "postgresql://app_rls@localhost:5433/$db?host=/tmp/pgrun" -At 2>&1 <<'SQL' | grep -vE '^(BEGIN|SET|SAVEPOINT|ROLLBACK|RELEASE|f)$' | sed 's/^/   /'
begin; select set_config('app.current_tenant_id','neg_a',true) is null;
\echo 1. A anota uso con la conexion de B
savepoint s; insert into "IntegracionUso"(id,"tenantId","conexionId",mes) values ('us_x','neg_a','cx_b','2026-10'); rollback to s;
\echo 2. A encola un evento del outbox por la conexion de B
savepoint s; insert into "OutboxEvent"(id,"tenantId",type,payload,"conexionId") values ('ob_x','neg_a','integracion.enviar','{}','cx_b'); rollback to s;
\echo 3. A repite la credencial que B tiene en su conexion (antes: el unico la delataba)
savepoint s; insert into "IntegracionCredencial"(id,"tenantId","conexionId",campo,"kekId","wrappedDek",sealed,"cargadaPor","updatedAt") values ('cr_x','neg_a','cx_b','access_token','k','w','s','u',now()); rollback to s;
\echo 4. A vincula la cuenta de B como WhatsApp con mayuscula
savepoint s; insert into "IntegracionConexion"(id,"tenantId",conector,"cuentaExterna","updatedAt") values ('cx_x','neg_a','WhatsApp','pn_B',now()); rollback to s;
\echo 5. A vincula la cuenta de B con un espacio al final
savepoint s; insert into "IntegracionConexion"(id,"tenantId",conector,"cuentaExterna","updatedAt") values ('cx_y','neg_a','whatsapp','pn_B ',now()); rollback to s;
rollback;
SQL
  psql "$S" -qc "drop database $db"
}
correr vieja $Q/migration-antes-dfd86de8.sql
correr nueva prisma/migrations/20260925120000_lanzamiento_base/migration.sql
