# Runbook — Alta de Magra en producción (2º tenant + activación de RLS)

> **Estado:** PLAN APROBADO PARA PREPARAR — **no ejecutar todavía.** Cada paso
> irreversible (migración/rotación en prod, DNS, secrets) requiere **OK explícito del
> dueño** en el momento. Este documento es el guion; no dispara nada solo.
>
> **Contexto (verificado en código, deploy `f0a13f0`):** hoy prod tiene **1 tenant**
> (CH Estética, slug `beauty-spa`). Magra está **preparado pero no provisionado**
> (branding `src/lib/branding.ts:58`, blueprint `src/blueprints/carniceria.ts`,
> vidriera `/tienda`, playbooks en `docs/tenants/magra/`). El alta del 2º tenant está
> **bloqueada a propósito** por el gate ADR-018 (`scripts/provision-tenant.ts:191-202`)
> hasta que RLS de Postgres esté activo. Por eso este runbook activa RLS **primero**.

## Leyenda de riesgo

- 🟢 **Verificable sin riesgo** — corre local o contra un branch desechable de Neon; no toca prod. Se puede hacer sin OK.
- 🟡 **Cambio de código** — verificable con `tsc`+build+tests; no toca prod hasta deploy (Gate 1). Necesita revisión, no es irreversible.
- 🔴 **Requiere OK del dueño / acción humana** — irreversible sobre prod, o secret/DNS. **No se corre solo.**

## Lo que YA está listo (no hay que construirlo)

- SQL de RLS data-driven: `prisma/rls/0001_enable_rls.sql` (ENABLE + policy `tenant_isolation` en las 28 tablas con `tenantId`), `0002_app_role.sql` (rol `app_user` sin `BYPASSRLS`), `0003_force_rls_optional.sql` (hardening opcional), `0001_rollback.sql`.
- Redes de verificación: `check-coverage.mjs` (estática), `verify-rls.mjs` (funcional contra branch), `verify-wiring.mts` + `verify-tenant-resolution.mts` (integración del código real con PGlite). Procedimiento canónico: `prisma/rls/README.md`.
- Cableado app-level **escrito y apagado** tras el flag `RLS_ENFORCEMENT` (`src/lib/prisma-base.ts`, `rls.ts`, `tenant-context.ts`) → hoy cero cambio en prod.
- Control-plane con alta por UI: `/operador/alta` → `provisionFromConsole` → `provisionTenant` (`src/lib/operator-actions.ts:51`).

---

## Paso 0 — Pre-flight (🟢 sin riesgo, hacer antes de pedir cualquier OK)

Confirma que el paquete está sano **sin tocar nada vivo**:

```bash
node prisma/rls/check-coverage.mjs            # 28/28 tablas protegibles
npx tsx prisma/rls/verify-wiring.mts          # cableado real + policies (PGlite en memoria)
npx tsx prisma/rls/verify-tenant-resolution.mts   # resuelve caro.<base> y magra.<base> aislados
npm test && npx tsc --noEmit && npx next build    # vallas verdes
```

Todo esto vive en RAM / código; **no hay forma de que golpee Neon ni prod.** Si algo
sale en rojo acá, se frena y se corrige antes de seguir — nunca se avanza a prod con
el pre-flight en rojo.

---

## Paso 1 — Ensayo de RLS en un branch de Neon (🟢 sin riesgo — base desechable)

Objetivo: probar la activación **sobre una copia** de la base viva, no sobre la viva.

1. **Crear un branch de Neon** (copia instantánea, desechable) desde el dashboard de
   Neon: *Branches → New branch* a partir de `main`/`production`. Anotá su connection
   string → lo llamamos `$BRANCH_URL`. 🔴 *(requiere acceso a la consola de Neon — acción humana, pero el branch NO es prod: es descartable.)*

2. **Aplicar RLS sobre el branch** (por `psql`, **no** `prisma migrate deploy` — estos
   SQL viven fuera de `prisma/migrations/` a propósito):

   ```bash
   psql "$BRANCH_URL" -f prisma/rls/0001_enable_rls.sql
   psql "$BRANCH_URL" -v app_pw="<pw-de-ensayo>" -f prisma/rls/0002_app_role.sql
   ```

3. **Verificar el aislamiento funcional** (el script se **niega** a correr si la URL
   coincide con la `DATABASE_URL` de prod del `.env` — red anti-accidente):

   ```bash
   RLS_VERIFY_DATABASE_URL="$BRANCH_URL" node prisma/rls/verify-rls.mjs
   ```

   Deben pasar las **4 aserciones**: lectura aislada, `WITH CHECK` en INSERT, bloqueo de
   UPDATE cross-tenant, y fail-closed (sin contexto → 0 filas).

4. **Ensayar la app contra el branch como `app_user`** (opcional pero recomendado):
   levantar local con `DATABASE_URL=$BRANCH_URL?...&user=app_user`, `RLS_ENFORCEMENT=on`,
   `OPERATOR_DATABASE_URL=$BRANCH_URL` (rol dueño). Chequear especialmente los ~12
   `$transaction` y `connection_limit` bajo (3-5) sobre el pooler (ADR-023 F6).

5. **Limpiar:** borrar el branch de Neon al terminar (o dejarlo hasta el go-live). 🟢

> **Salida esperada del Paso 1:** "las 4 aserciones en verde sobre un branch, la app
> corre como `app_user` sin romperse". Recién con esto se pide el OK del Paso 2.

---

## Paso 2 — Activación de RLS en PROD (🔴 Gate 2 — irreversible, OK explícito del dueño por cada sub-paso)

> **No correr hasta que el Paso 1 esté en verde.** Ventana de bajo tráfico. Idealmente
> se hace en la **misma pasada** que el alta de Magra (Paso 3), porque prod pasa a tener
> 2 tenants y sin RLS eso rompería el aislamiento (ADR-015).

**Antes (checklist previo):**
- [ ] 🟢 Paso 1 en verde, documentado.
- [ ] 🔴 Definir y guardar el **password de `app_user`** en el vault/secrets de Netlify (nunca al repo).
- [ ] 🔴 Confirmar que no hay migraciones de Prisma pendientes que el alta necesite (control-plane y fiscal ya aplicadas; POS/stock son aditivas).
- [ ] 🔴 Backup / snapshot de la base viva (branch de respaldo en Neon antes de tocar).

**Ejecución (cada uno requiere OK):**
1. 🔴 Aplicar a prod los mismos SQL, con `psql` contra la `DATABASE_URL` de prod:
   ```bash
   psql "$PROD_URL" -f prisma/rls/0001_enable_rls.sql
   psql "$PROD_URL" -v app_pw="<pw-real-de-app_user>" -f prisma/rls/0002_app_role.sql
   ```
2. 🔴 **Rotar variables de entorno en Netlify** (sin esto, encender el flag solo agrega overhead sin enforcement — ver `src/lib/prisma-base.ts`):
   - `DATABASE_URL` → connection string con el rol **`app_user`** (el que NO tiene `BYPASSRLS`).
   - `OPERATOR_DATABASE_URL` → connection string con el rol **dueño** (`neondb_owner`, con bypass) — es el único proceso que ve cross-tenant, para el `/operador` (`src/lib/operator-db.ts`).
   - `RLS_ENFORCEMENT` = `on`.
3. 🔴 **Deploy** (Gate 1 — "deployá") para que tome las variables.

**Después (verificación en prod, 🟢 solo lectura):**
- [ ] `GET /api/health` responde `ok` con el commit nuevo.
- [ ] CH Estética (`/admin`) sigue viéndose y operando normal (1 tenant, todo su dato visible).
- [ ] Una lectura del backoffice NO devuelve filas de otro tenant (recién habrá "otro" tras el Paso 3; hasta entonces, que CH siga intacto ya valida que el enforcement no rompió nada).

**Rollback (si algo sale mal):**
1. 🔴 Revertir `DATABASE_URL` al rol dueño y `RLS_ENFORCEMENT`=`off` en Netlify + redeploy → la app vuelve al comportamiento pre-RLS al instante (el flag apagado usa el cliente crudo).
2. 🔴 Si además se quiere sacar las policies: `psql "$PROD_URL" -f prisma/rls/0001_rollback.sql` (quita policies + RLS + FORCE).
3. El rol `app_user` puede quedar creado sin daño (no molesta si nadie conecta con él).

---

## Paso 3 — Alta de Magra desde `/operador/alta` (🔴 crea datos en prod — OK del dueño)

Con RLS **ya activo** (Paso 2), el gate ADR-018 se **abre** y el alta procede. Entrar a
`https://<host>/operador` (login de operador, cookie propia — **no** es `/admin`) →
**"+ Alta de tenant"**.

**Datos a cargar** (campos reales de `provisionFromConsole`, `src/lib/operator-actions.ts:54-64`):

| Campo | Valor | Nota |
|---|---|---|
| **name** | `Magra — Carnicería Premium` | nombre visible |
| **slug** | `magra` | identificador; branding/vidriera ya mapean este slug (`branding.ts:58`) |
| **ownerEmail** | *(email real del dueño de Magra)* | 🔴 dato de negocio a confirmar |
| **ownerName** | `Dueño Magra` | ajustable |
| **blueprint** | `carniceria` | rubro Retail/Mostrador (`src/blueprints/carniceria.ts`) |
| **subdomain** | `magra` | clave para entrar por `magra.<dominio>` (Paso 4) |
| **plan** | `trial` o `active` | según acuerdo comercial |
| **status** | `TRIAL` → `ACTIVE` al confirmar cobro | |
| **modules** | los del blueprint (o tildar) | default del rubro si se deja vacío |
| **accent / frontTheme** | vacío → sugerido del rubro (magra = oxblood) | |

**Qué pasa con el gate:**
- Si RLS **está** activo → el alta crea `Tenant` + OWNER (scrypt) + `BusinessSettings` + catálogo mínimo del blueprint, transaccional e idempotente por slug. Muestra la **contraseña de bootstrap UNA vez** en la ficha del tenant.
- Si por error RLS **no** estuviera activo → `provisionTenant` aborta con
  `"GATE ADR-018 — ALTA ABORTADA... Este tenant NO fue creado."` (la consola muestra el
  error, no lo esconde). O sea: es **imposible** crear el 2º tenant sin aislamiento.

**Verificación (🟢):** `/operador` lista ahora 2 tenants; el badge "Gate 2º tenant (RLS)"
pasa a **ARMADO**; entrar al `/admin` de cada uno muestra solo su propio dato.

---

## Paso 4 — Dominio propio + DNS wildcard + `APP_BASE_DOMAIN` (🔴 DNS/secrets + 🟡 fix de código)

Hoy la resolución de tenant es **por subdominio** (`src/lib/tenant.ts`, `extractSubdomain`).
En el `.netlify.app` pelado **no se puede** separar tenants por dirección (no hay wildcard),
y `APP_BASE_DOMAIN` **no está seteado** → todo cae al fallback single-tenant. Con 2 tenants,
un request sin subdominio **falla fail-closed**. Por eso, para 2 tenants hace falta:

1. 🔴 **Dominio propio** conectado en Netlify (ej. `tudominio.com`).
2. 🔴 **DNS wildcard**: registro `*.tudominio.com` → Netlify (además del apex), y agregar los
   dominios en Netlify. Así `chestetica.tudominio.com` y `magra.tudominio.com` resuelven.
3. 🔴 **Variable `APP_BASE_DOMAIN`** = `tudominio.com` en Netlify + redeploy. Recién con esto
   `extractSubdomain` empieza a resolver por subdominio.
4. 🔴 En `/operador`, setear el `subdomain` de cada tenant: CH → `chestetica`, Magra → `magra`
   (Magra ya lo trae del Paso 3). Verificar: `chestetica.tudominio.com/admin` abre CH,
   `magra.tudominio.com/admin` abre Magra.

   *(Guía detallada existente: `docs/GO-LIVE-RUNBOOK.md` → PARTE 2.)*

### Fix del storefront en `/` (🟡 cambio de código, verificable, NO toca prod hasta deploy)

**Problema real (verificado):** el root `/` lo sirve `src/app/(site)/page.tsx`, que es la
**landing de estética de CH** (servicios, equipo, reserva de turno). La vidriera de Magra
(carnicería, rubro-aware) vive en **`/tienda`** (`src/app/tienda/page.tsx`). Hoy, entrar a
`magra.tudominio.com/` mostraría la landing con forma de spa — **la equivocada**.

**Fix (una sesión de código, no prod):** hacer el root `/` **consciente del blueprint** del
tenant resuelto:
- Tenant de **servicios/estética** (CH) → landing `(site)` actual.
- Tenant **retail/mostrador** (Magra y rubros de `src/blueprints/retail/`) → la vidriera de
  `/tienda` (o un redirect `/` → `/tienda` para esos blueprints).

El wiring de resolución por tenant ya existe (`getCurrentTenantSlug`, `getStorefront`,
`getTenantAccent`); es enrutar el root según el blueprint, no construir vidriera nueva.
Se verifica con `tsc`+build y visualmente en preview. **Marcarlo como pendiente en
`docs/PROXIMOS-PASOS.md` y hacerlo antes de anunciar la URL pública de Magra.**

---

## Resumen de OKs del dueño (lo único que no se hace solo)

1. 🔴 Acceso a Neon para crear el **branch de ensayo** (Paso 1) — *sin riesgo, es desechable*.
2. 🔴 **Gate 2:** aplicar RLS a prod + rotar `DATABASE_URL` a `app_user` + `RLS_ENFORCEMENT=on` + deploy (Paso 2) — **irreversible**.
3. 🔴 Password de `app_user` y confirmación del **email real** del dueño de Magra (secrets/dato).
4. 🔴 Crear el tenant Magra en prod desde `/operador/alta` (Paso 3).
5. 🔴 Dominio + DNS wildcard + `APP_BASE_DOMAIN` (Paso 4).

Todo lo 🟢/🟡 (pre-flight, ensayo en branch, fix del `/`) se puede preparar y verificar
**antes**, sin tocar prod, para que el día del go-live sea *revisar y aplicar*.
