# Runbook — Levantar el gate RLS para dar de alta el 2º tenant (ADR-018)

> **Qué resuelve:** hoy el alta de un tenant **nuevo** se **aborta a propósito** si ya existe ≥1 tenant y
> RLS no está activo (gate compuesto ADR-018/019 en `scripts/provision-tenant.ts`). Es **seguridad
> correcta, no un bug**: crear la 2ª fila en `Tenant` sin aislamiento rompe `getCurrentTenantId()` (ADR-015)
> y dejaría a toda la app leyendo/escribiendo el tenant equivocado (MT-3). Este runbook es el camino
> **ejecutable y ordenado** para levantar ese gate **con evidencia**, para poder dar de alta un cliente real.
>
> **Estado:** los SQL ya están escritos y probados en branch (`prisma/rls/`, ensayo 8/8 verde 2026-07-05).
> Esto NO se corre solo: es **Gate 2** (toca prod/Neon) → requiere el **OK explícito del dueño** y lo aplica
> el dueño. Los secretos (password de `app_rls`) **los pega el dueño**, nunca el agente (SEC-1 / ADR-041).

## Precondición — entender el gate (no saltearlo)

El gate vive en `provisionTenant` (`scripts/provision-tenant.ts`), dentro de la transacción:

```
if (isNewTenant && tenantCount >= 1 && !isRlsActive(tx)) → ABORTA con error explícito
```

`isRlsActive` chequea `pg_class.relrowsecurity` sobre las tablas centinela (`Appointment`, `Client`). Mientras
esas tablas no tengan RLS habilitado, **cualquier** alta de un tenant nuevo (consola o CLI) se niega. Re-provisionar
un slug **existente** es siempre seguro (no crea fila nueva → no dispara el gate).

## Orden de ejecución (cada paso deja evidencia antes de pasar al siguiente)

### 0. Foto previa (read-only, seguro contra prod)

```bash
# Cobertura estática (sin DB): todo modelo de-tenant tiene columna tenantId.
node prisma/rls/check-coverage.mjs        # espera: 38/38

# Estado EN VIVO contra prod (solo lectura, no imprime el connection string):
RLS_AUDIT_DATABASE_URL="<PROD_URL>" node prisma/rls/check-rls-live.mjs
# hoy espera: varias tablas SIN RLS + "app_rls: no existe todavía"
```

Guardá la salida: es el "antes". El "después" debe mostrar **38/38 con RLS + policy** y **app_rls sin BYPASSRLS**.

### 1. Ensayo en branch de Neon (OBLIGATORIO — ADR-018 T2, nunca directo a prod)

```bash
# 1.1 Crear una branch desechable de Neon (copia de la base viva) → $BRANCH_URL
# 1.2 Aplicar el backstop de DB sobre la branch:
psql "$BRANCH_URL" -f prisma/rls/0001_enable_rls.sql     # ENABLE RLS + policy tenant_isolation (data-driven)
psql "$BRANCH_URL" -f prisma/rls/0002_app_role.sql       # crea app_rls SIN password (rol inerte)

# 1.3 Verificación funcional (2 tenants sintéticos: lectura aislada, WITH CHECK, UPDATE cross-tenant, fail-closed):
RLS_VERIFY_DATABASE_URL="$BRANCH_URL" node prisma/rls/verify-rls.mjs   # espera: 4/4 aserciones OK

# 1.4 Auditoría en vivo sobre la branch (debe dar SIN DRIFT):
RLS_AUDIT_DATABASE_URL="$BRANCH_URL" node prisma/rls/check-rls-live.mjs
```

### 2. Encender la mitad app-level (cablear el contexto de tenant por request)

El backstop de DB (paso 1) aísla aunque una query olvide el `where`. Falta cablear la app para que **conecte
como `app_rls`** y setee el contexto de tenant por transacción. Está **escrito pero apagado** en
`src/lib/tenant-context.ts` y `src/lib/rls.ts` (README de `prisma/rls/` §"Adopción en la app"):

1. Cablear `runInTenantContext(tenantId, …)` en el borde del request, con el `tenantId` resuelto por
   subdominio/sesión — reemplaza el `findMany take:2` de `getCurrentTenantId`, **conservando el assert
   fail-closed** como red (ADR-018 §4 / MT-3).
2. Apuntar el runtime a `rlsPrisma` (en vez del `prisma` owner).
3. Reemplazar los `prisma.$transaction(async tx => …)` por `tenantTransaction(tenantId, tx => …)` (setea el
   GUC `app.current_tenant_id` como primer statement; sin anidar transacciones). Revisar los ~12
   `$transaction` y el `connection_limit` bajo (3–5) sobre el pooler (ADR-023 F6).
4. **Re-ensayar TODO en la branch** con la app conectada como `app_rls` (crons incluidos — hoy corren sin
   contexto de tenant, gap abierto en ESTADO §RLS: `reminders` + `arca-outbox` deben correr dentro de
   `runInTenantContext`).

> ⚠️ **El operador/control-plane NO se toca:** `operatorPrisma` (`OPERATOR_DATABASE_URL`) debe seguir con un
> rol con BYPASSRLS (owner) — es el único que legítimamente ve cross-tenant (ADR-021). El que rota a `app_rls`
> es la conexión de la **app del tenant** (`DATABASE_URL`), no la del operador.

### 3. Aplicar a PROD (Gate 2 — solo con OK explícito del dueño, lo aplica el dueño)

```bash
# 3.1 Backstop de DB en prod (mismo trabajo que provisiona el 2º tenant):
psql "$PROD_URL" -f prisma/rls/0001_enable_rls.sql
psql "$PROD_URL" -f prisma/rls/0002_app_role.sql      # crea app_rls SIN password

# 3.2 El DUEÑO pone la password de app_rls FUERA del repo (Neon console → Roles → Reset password,
#     o  ALTER ROLE app_rls PASSWORD '<secret>'). El agente NUNCA la toca (SEC-1).

# 3.3 El DUEÑO rota DATABASE_URL (app del tenant) al connection string de app_rls, y redeploya.
#     OPERATOR_DATABASE_URL queda como está (owner/BYPASSRLS).
```

### 4. Verificar aislamiento en vivo, en prod, CON EVIDENCIA (antes de crear el 2º tenant)

```bash
# 4.1 Sin drift + app_rls sin bypass:
RLS_AUDIT_DATABASE_URL="$PROD_URL" node prisma/rls/check-rls-live.mjs   # espera: 38/38 + "app_rls NO evade RLS"

# 4.2 Confirmar que la app conecta como app_rls (no como owner): revisar que una query cross-tenant
#     desde la app devuelva 0 filas del otro tenant (con el tenant #1 vivo, todavía sin crear el #2).
```

Solo con **4.1 + 4.2 en verde** el gate de `provisionTenant` (`isRlsActive`) pasa a devolver `true` y el alta
del 2º tenant deja de abortar.

### 5. Recién ahora: dar de alta el 2º tenant

Desde la consola de operador (`/operador/alta`) o el CLI. El gate ya no lo bloquea; el aislamiento está
enforced y verificado. Repetir `check-rls-live` después del alta (las tablas del tenant nuevo ya nacen bajo
policy porque `0001` es data-driven, pero se confirma).

## Checklist de "listo para el 2º tenant"

- [ ] `check-coverage` 38/38 (estático).
- [ ] Ensayo en branch: `verify-rls` 4/4 + `check-rls-live` sin drift.
- [ ] App cableada a `app_rls` + `runInTenantContext`/`tenantTransaction` + crons con contexto de tenant.
- [ ] Prod: `0001` + `0002` aplicados; password de `app_rls` puesta por el dueño; `DATABASE_URL` rotada.
- [ ] `check-rls-live` en prod: 38/38 + `app_rls` sin BYPASSRLS.
- [ ] `app_user` legacy (BYPASSRLS, inarreglable) confirmado **sin uso** (nadie conecta con él) — SEC-2.
- [ ] Evidencia guardada (antes/después) en el PR del gate.

## Riesgos y guardarraíles (de las lecciones)

- **SEC-2:** la app conecta SIEMPRE con un rol sin BYPASSRLS (`app_rls`); **nunca** rotar `DATABASE_URL` a
  `app_user`. `check-rls-live` bloquea (exit 1) si `app_rls` evade RLS.
- **MT-3 / ADR-015:** conservar el assert fail-closed de `getCurrentTenantId` como red aunque haya RLS.
- **DB-3:** `migrate deploy` aplica **todas** las migraciones pendientes — RLS vive **fuera** de
  `prisma/migrations/` (en `prisma/rls/`) justamente para que ningún deploy lo aplique de rebote; se aplica
  a mano con `psql`, en su propio paso.
- **PD-2 / Gate 2:** nada de esto se corre solo. Es acción del dueño, con OK explícito.

— Elaborado por GSG
