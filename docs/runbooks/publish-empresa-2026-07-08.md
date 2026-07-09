# 🚀 Go-live — Incremento Empresa base (a un OK del dueño)

> **Estado al escribir (2026-07-08, S5/Opus):** el incremento Empresa base **está MERGEADO a `main`**
> (`74af0db`), Gate VERDE (tsc + 602 tests + gate:rls 33/33). **Nada se aplicó a prod ni se deployó** — este
> runbook deja los 2 pasos que faltan **a un OK explícito del dueño**. Auto-publish está OFF: push a `main`
> **no** publica.

---

## 🔴 FRENO registrado (§E) — por qué NO corrí `migrate deploy`

`prisma migrate deploy` aplica **TODA** migración pendiente en orden de timestamp — no se puede aplicar
solo una. La cola pendiente en `prisma/migrations/` incluye, **antes** de `add_tenant_profile`:

- `20260708120000_invoice_money_decimal` → **convierte `Invoice.{neto,iva,total}` a `Decimal(14,2)`**
  sobre **facturas reales**. Es cambio de tipo = **riesgo de dato**, y es §C **NO autorizado** (el dueño
  autorizó `Tenant.profile`, no el Decimal de facturas).
- migraciones fiscales (`add_tenant_fiscal_config`, `fiscal_invoice_align`) — aditivas, pero también §C.

Por eso **frené el paso de migración y lo elevo**. El código publicado NO se rompe sin la migración: el
resolver de perfil (`getActiveProfile`) tiene **fallback seguro a "Comercio"** si la columna no existe.

---

## Estado actual (seguro, reversible)

- **`main` = `a6e9969`** — incremento Empresa base (`74af0db`) **+ Ola 1** (deepening Empresa: Compras
  J45/18J + Reportes margen 16T · set lite por rubro · primitivos KpiTile/EmptyState · hardening $0:
  connection_limit / webhook idempotente / cron dead-letter / `/api/ready`) + PR-1/PR-2 + Balde-B. Todo
  el código Empresa vive detrás de flags **DEFAULT OFF** (`PROFILES_ENABLED`, `NAV_GROUPING_ENABLED`,
  `UPGRADE_TEASER_ENABLED`). Ola 1 pasó el Gate S5/Opus (tsc + 622 tests + gate:rls 33/33).
- **Prod intacto:** nada aplicado a Neon, nada deployado. Con flags OFF, el panel es idéntico al de hoy.
- **`main` queda schema-ahead-of-DB** (Decimal de facturas en schema, sin aplicar). **Regla:** aplicar las
  migraciones seguras **ANTES** de deployar el código nuevo (si no, lecturas de factura Decimal-vs-Float).

---

## Secuencia de go-live (cuando el dueño dé el OK)

> **Orden duro:** backup → (decisión de cola) → migrar seguro → gate:rls → deploy → flags ON → marcar tenant → smoke.

### 0. Backup (obligatorio)
```
pg_dump "$PROD_URL" --no-owner --format=custom -f backup-2026-07-08.dump
```
> ⚠️ El rollback por **PITR/branch de Neon requiere el plan PAGO** (límite duro NO autorizado). Sin él, el
> rollback de DB es restaurar este dump. `Tenant.profile` aditivo se revierte trivial (`DROP COLUMN`).

### 1. Decisión de la cola de migraciones (elige el dueño)
- **Opción A — aplicar toda la cola:** solo si el dueño **revisa y autoriza** `invoice_money_decimal`
  (ADR-057 lo diseñó lossless, blast radius = 1 borde de lectura). Entonces:
  `DATABASE_URL="$PROD_URL" npx prisma migrate deploy` (aplica fiscales + Decimal + `add_tenant_profile`).
- **Opción B — solo `Tenant.profile` (quirúrgico), sin tocar el Decimal:** aplicar el SQL aditivo a mano y
  marcarlo como aplicado, dejando el resto pendiente:
  ```
  psql "$PROD_URL" -c "CREATE TYPE \"TenantProfile\" AS ENUM ('lite','enterprise');"
  psql "$PROD_URL" -c "ALTER TABLE \"Tenant\" ADD COLUMN \"profile\" \"TenantProfile\" NOT NULL DEFAULT 'lite';"
  npx prisma migrate resolve --applied 20260708213237_add_tenant_profile
  ```
  (Requiere que las migraciones previas ya estén aplicadas/resueltas; si no lo están, coordinar con Data/DBA.)

### 2. Valla post-migración
```
npm run gate:rls        # 33/33 sin drift (Tenant.profile no afecta RLS)
```

### 3. Deploy a Vercel (Gate 1 del dueño)
- Deploy del código de `main` a prod (dashboard de Vercel o `vercel --prod` con la cuenta del dueño).
  *(No hay CLI autenticado en la sesión del agente → este botón es del dueño.)*

### 4. Encender el perfil (flags → ON)
- En el env de Vercel: `PROFILES_ENABLED=on`, `NAV_GROUPING_ENABLED=on`. **Mantener `UPGRADE_TEASER_ENABLED=off`**
  (D3: candados nunca por default). Redeploy/restart si el runtime cachea env.

### 5. Marcar el/los tenant(s) Empresa (dato, no schema)
```
UPDATE "Tenant" SET "profile" = 'enterprise' WHERE slug = '<slug-del-pyme>';
```
- Demo de venta: correr el seed **en DEV** (no prod): `DATABASE_URL="<dev>" npx tsx prisma/seed-demo-empresa.ts`.

### 6. Smoke
- Comercio: un tenant existente ve la nav de siempre (perfil lite/Comercio).
- Empresa: el tenant marcado ve los ítems Empresa `ready:true`; los `ready:false` (J59/J58/BMK) NO aparecen.

---

## Rollback
- **Flags:** poner `*_ENABLED=off` en el env → nav plana legada al instante (cero deploy).
- **App:** republicar el deploy anterior en Vercel (sin pérdida de datos).
- **DB:** `Tenant.profile` → `DROP COLUMN "profile"; DROP TYPE "TenantProfile";` (trivial). Decimal (si se
  aplicó) → restaurar `backup-2026-07-08.dump` (el caso delicado; por eso se aísla la decisión en el paso 1).

## Límites duros (NO ejecutar — a un OK aparte)
- **Neon plan PAGO** (PITR/réplica) — es una compra.
- **Homologación / cert ARCA** — trámite externo. Worker dormido hasta entonces.

— Preparado por S5 (Juicio Crítico, Opus). Decisiones de alcance Empresa: `docs/estrategia/decisiones-set-empresa-2026-07-08.md`.
