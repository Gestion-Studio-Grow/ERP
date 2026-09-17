#!/usr/bin/env bash
# ============================================================================
# MEDIR NEON — las tres preguntas abiertas sobre producción, contestadas.
# ============================================================================
#
# POR QUÉ EXISTE: este repo afirma cosas sobre el estado de Neon que NADIE midió.
# La migración de cartera figuraba como "sin aplicar" en cuatro archivos, y los cuatro
# citaban la misma afirmación de julio. Ya hubo documentación que se contradecía a sí
# misma sobre si RLS estaba aplicado. La fuente de verdad es la base, no el doc.
#
# ES DE SOLO LECTURA. No migra, no escribe, no toca una fila. Se puede correr contra
# producción sin ventana ni backup.
#
# USO:
#   export NEON_URL='postgresql://...'   # rol DIRECTO, sin -pooler
#   bash scripts/medir-neon.sh
#
# La salida NO incluye la connection string: está pensada para pegarse tal cual.

set -uo pipefail

URL="${NEON_URL:-${PREDEPLOY_DATABASE_URL:-${DIRECT_URL:-}}}"

if [ -z "$URL" ]; then
  cat >&2 <<'MSG'
❌ Falta la connection string.

   export NEON_URL='postgresql://usuario:clave@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require'
   bash scripts/medir-neon.sh

   Tiene que ser la del rol DIRECTO, no la del pooler (la del pooler lleva `-pooler`
   en el host). `prisma migrate` no funciona contra el pooler.
MSG
  exit 2
fi

case "$URL" in
  *-pooler.*)
    echo "⚠️  La URL es la del POOLER (tiene '-pooler' en el host)."
    echo "   Las consultas de RLS van a andar, pero \`prisma migrate status\` puede fallar."
    echo "   Si falla, volvé a correr esto con la URL del rol directo."
    echo
    ;;
esac

HOST=$(printf '%s' "$URL" | sed -E 's#^[^@]*@##; s#[/?].*$##')
echo "════════════════════════════════════════════════════════════════════"
echo " MEDICIÓN DE NEON — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo " host: $HOST"
echo "════════════════════════════════════════════════════════════════════"

# ── 1. ¿Cuántas migraciones faltan? ─────────────────────────────────────────
# El runbook (docs/runbooks/migracion-caja-neon.md) dice CINCO. Si dice otra cosa,
# el plan de la ventana de migración cambia y hay que frenar.
echo
echo "── 1. MIGRACIONES PENDIENTES ───────────────────────────────────────"
echo "   (el runbook espera CINCO; más o menos que eso = frenar)"
echo
DATABASE_URL="$URL" npx prisma migrate status 2>&1 | sed 's/^/   /'
echo "   [exit=$?]"

# ── 2. ¿Hay drift de RLS? ───────────────────────────────────────────────────
# Caza la tabla que TIENE `tenantId` pero a la que nunca se le aplicó la policy.
# Ya pasó: 0001 se corrió una vez sobre 24 tablas y las 9 nuevas quedaron sin
# proteger. El script es data-driven y se corre A MANO, así que toda tabla creada
# después de la última corrida queda afuera hasta que se lo vuelva a correr.
echo
echo "── 2. DRIFT DE RLS ─────────────────────────────────────────────────"
echo "   (exit 0 = sin drift · exit 1 = hay tablas sin proteger)"
echo
RLS_AUDIT_DATABASE_URL="$URL" node prisma/rls/check-rls-live.mjs 2>&1 | sed 's/^/   /'
echo "   [exit=$?]"

# ── 3. El conteo y las dos tablas que están en duda ─────────────────────────
echo
echo "── 3. POLICIES Y LAS TABLAS EN DUDA ────────────────────────────────"
echo
psql "$URL" -v ON_ERROR_STOP=0 2>&1 <<'SQL' | sed 's/^/   /'
\pset pager off
\echo '-- cuántas policies tenant_isolation hay (la base local tiene 44):'
SELECT count(*) AS policies_tenant_isolation FROM pg_policies WHERE policyname = 'tenant_isolation';

\echo ''
\echo '-- tablas con tenantId que NO tienen la policy (esto tiene que dar vacío):'
SELECT c.relname AS tabla_sin_policy
FROM information_schema.columns col
JOIN pg_class c ON c.relname = col.table_name AND c.relkind = 'r'
WHERE col.table_schema = 'public' AND col.column_name = 'tenantId'
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.tablename = col.table_name AND p.policyname = 'tenant_isolation'
  )
ORDER BY 1;

\echo ''
\echo '-- CarteraCliente: el hallazgo de aislamiento que quedó abierto:'
SELECT relname, relrowsecurity AS rls_activa, relforcerowsecurity AS rls_forzada
FROM pg_class WHERE relname = 'CarteraCliente';

\echo ''
\echo '-- el rol de la app: si tiene BYPASSRLS, evade TODAS las policies:'
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_rls', 'app_user', 'neondb_owner') ORDER BY 1;
SQL

echo
echo "════════════════════════════════════════════════════════════════════"
echo " Listo. Esta salida no contiene la connection string: se puede pegar."
echo "════════════════════════════════════════════════════════════════════"
