# Runbook — Alta de Magra en producción (2º tenant + activación de RLS)

> **Estado:** PLAN APROBADO PARA PREPARAR — **no ejecutar todavía.** Cada paso
> irreversible (migración/rotación en prod, DNS, secrets) requiere **OK explícito del
> dueño** en el momento. Este documento es el guion; no dispara nada solo.
>
> **Contexto (verificado en código, deploy `f0a13f0`):** hoy prod tiene **1 tenant**
> (CH Estética, slug `beauty-spa`). Magra está **preparado pero no provisionado**
> (branding `src/lib/branding.ts:58`, blueprint `src/blueprints/retail/rubros.ts` (rubro `carniceria`),
> vidriera `/tienda`, playbooks en `docs/tenants/magra/`). El alta del 2º tenant está
> **bloqueada a propósito** por el gate ADR-018 (`scripts/provision-tenant.ts:191-202`)
> hasta que RLS de Postgres esté activo. Por eso este runbook activa RLS **primero**.

> ### 🔥 ESTADO REAL DE PROD (auditado 2026-07-05, solo lectura) — LEER ANTES DE EJECUTAR
> Prod **NO** está "de cero" en RLS. Auditoría (`check-rls-live.mjs`) encontró:
> 1. **RLS ya aplicado parcialmente:** `ENABLE RLS` + policy en **24/33 tablas** de-tenant.
> 2. **DRIFT — 9 tablas sin proteger:** `Order, OrderItem, Invoice, OutboxEvent, CashMovement,
>    CashSession, StockMovement, StockPurchase, StockPurchaseItem` (POS/facturación/caja/stock).
>    Filtrarían entre tenants si se activa el enforcement sin cerrarlas.
> 3. **`app_user` existe con `BYPASSRLS=true`** → rotar `DATABASE_URL` a él daría **CERO
>    aislamiento**, en silencio. **Y es INARREGLABLE por `neondb_owner`:** `ALTER ROLE app_user
>    … NOBYPASSRLS` → *"permission denied"* (quitar BYPASSRLS necesita superuser, que Neon no da).
>
> **Secuencia CORREGIDA (reemplaza el "aplicar de cero" y el viejo "patchear app_user"):** re-correr
> `0001` **cierra el drift** (es data-driven → cubre 33/33, verificado offline); `0002` **crea un rol
> NUEVO `app_rls`** —limpio, nace `NOBYPASSRLS`— en vez de intentar arreglar el `app_user` inarreglable,
> y se rota `DATABASE_URL` a **`app_rls`**. El `app_user` legacy queda intacto e inofensivo (nadie
> conecta con él). Correr `check-rls-live.mjs` **antes y después** para confirmar 33/33 y `app_rls`
> sin bypass. *(Hallazgo del ensayo en branch de Neon, 2026-07-05, 🟢 VERDE 8/8.)*

## Leyenda de riesgo

- 🟢 **Verificable sin riesgo** — corre local o contra un branch desechable de Neon; no toca prod. Se puede hacer sin OK.
- 🟡 **Cambio de código** — verificable con `tsc`+build+tests; no toca prod hasta deploy (Gate 1). Necesita revisión, no es irreversible.
- 🔴 **Requiere OK del dueño / acción humana** — irreversible sobre prod, o secret/DNS. **No se corre solo.**

## Lo que YA está listo (no hay que construirlo)

- SQL de RLS data-driven: `prisma/rls/0001_enable_rls.sql` (ENABLE + policy `tenant_isolation` en **toda** tabla con `tenantId` → cubre 33/33 hoy), `0002_app_role.sql` (crea el rol **NUEVO** `app_rls` sin `BYPASSRLS` — evita el `app_user` legacy inarreglable; ver hallazgo arriba), `0003_force_rls_optional.sql` (hardening opcional), `0001_rollback.sql`.
- Redes de verificación: `check-coverage.mjs` (estática), **`check-rls-live.mjs` (auditoría del drift en vivo, solo lectura — branch o prod; verifica `app_rls` sin bypass)**, `verify-rls.mjs` (funcional contra branch, como `app_rls`), **`verify-provision-gate.mts` (offline: gate + cobertura 33/33 + `app_rls` NOBYPASSRLS)**, `verify-wiring.mts` + `verify-tenant-resolution.mts` (integración del código real con PGlite). Procedimiento canónico: `prisma/rls/README.md`.
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

2. **Auditar el estado ANTES** (solo lectura — el branch copia el drift de prod):

   ```bash
   RLS_AUDIT_DATABASE_URL="$BRANCH_URL" node prisma/rls/check-rls-live.mjs
   ```
   Se espera que reporte el drift (9 tablas sin proteger + `app_user` legacy con bypass), igual que prod.

3. **Aplicar RLS sobre el branch** (por `psql`, **no** `prisma migrate deploy` — estos
   SQL viven fuera de `prisma/migrations/` a propósito). Re-correr `0001` **cierra el drift**;
   el `0002` **crea el rol NUEVO `app_rls`** (`NOBYPASSRLS` de nacimiento):

   ```bash
   psql "$BRANCH_URL" -f prisma/rls/0001_enable_rls.sql
   psql "$BRANCH_URL" -f prisma/rls/0002_app_role.sql   # crea app_rls SIN password (rol inerte)
   ```

4. **Auditar el estado DESPUÉS** — debe dar **33/33 y `app_rls` sin bypass**:

   ```bash
   RLS_AUDIT_DATABASE_URL="$BRANCH_URL" node prisma/rls/check-rls-live.mjs   # RESULTADO: SIN DRIFT ✅
   ```

5. **Verificar el aislamiento funcional** (el script se **niega** a correr si la URL
   coincide con la `DATABASE_URL` de prod del `.env` — red anti-accidente):

   ```bash
   RLS_VERIFY_DATABASE_URL="$BRANCH_URL" node prisma/rls/verify-rls.mjs
   ```

   Deben pasar las **4 aserciones**: lectura aislada, `WITH CHECK` en INSERT, bloqueo de
   UPDATE cross-tenant, y fail-closed (sin contexto → 0 filas).

4. **Ensayar la app contra el branch como `app_rls`** (opcional pero recomendado):
   levantar local con `DATABASE_URL=$BRANCH_URL?...&user=app_rls`, `RLS_ENFORCEMENT=on`,
   `OPERATOR_DATABASE_URL=$BRANCH_URL` (rol dueño). Chequear especialmente los ~12
   `$transaction` y `connection_limit` bajo (3-5) sobre el pooler (ADR-023 F6).

5. **Limpiar:** borrar el branch de Neon al terminar (o dejarlo hasta el go-live). 🟢

> **Salida esperada del Paso 1:** "las 4 aserciones en verde sobre un branch, la app
> corre como `app_rls` sin romperse". Recién con esto se pide el OK del Paso 2.

---

## Paso 2 — Activación de RLS en PROD (🔴 Gate 2 — irreversible, OK explícito del dueño por cada sub-paso)

> **No correr hasta que el Paso 1 esté en verde.** Ventana de bajo tráfico. Idealmente
> se hace en la **misma pasada** que el alta de Magra (Paso 3), porque prod pasa a tener
> 2 tenants y sin RLS eso rompería el aislamiento (ADR-015).

**Antes (checklist previo):**
- [ ] 🟢 Paso 1 en verde, documentado.
- [ ] 🔴 Definir y guardar el **password de `app_rls`** (el rol NUEVO) en el vault/secrets de Netlify (nunca al repo).
- [ ] 🔴 Confirmar que no hay migraciones de Prisma pendientes que el alta necesite (control-plane y fiscal ya aplicadas; POS/stock son aditivas).
- [ ] 🔴 Backup / snapshot de la base viva (branch de respaldo en Neon antes de tocar).

**Ejecución (cada uno requiere OK):**
1. ✅ **HECHO EN PROD (BLOQUE A, 2026-07-05, OK del dueño):** aplicados `0001` (33/33, SIN DRIFT) y
   `0002` (rol `app_rls` creado: canlogin=true, bypassrls=false, super=false, **SIN password**). Comandos
   (con `psql` contra la `DATABASE_URL` de prod, rol dueño):
   ```bash
   RLS_AUDIT_DATABASE_URL="$PROD_URL" node prisma/rls/check-rls-live.mjs   # ANTES: muestra el drift
   psql "$PROD_URL" -f prisma/rls/0001_enable_rls.sql
   psql "$PROD_URL" -f prisma/rls/0002_app_role.sql   # crea app_rls SIN password (rol inerte)
   RLS_AUDIT_DATABASE_URL="$PROD_URL" node prisma/rls/check-rls-live.mjs   # DESPUÉS: SIN DRIFT ✅ (33/33, app_rls sin bypass)
   ```
   *(El `$PROD_URL` acá es el del rol dueño `neondb_owner` — es quien crea el rol y las policies.)*
   **PENDIENTE del dueño antes del sub-paso 2:** ponerle **contraseña a `app_rls`** (Neon → Roles →
   Reset password, o `ALTER ROLE app_rls PASSWORD '<secret>'`) — sin eso el rol no autentica.
2. 🔴 **Rotar variables de entorno en Netlify** (sin esto, encender el flag solo agrega overhead sin enforcement — ver `src/lib/prisma-base.ts`). ⚠️ **NO rotar `DATABASE_URL` a `app_rls` hasta que el audit DESPUÉS confirme `app_rls` sin bypass** — si no, no habría aislamiento. **Y nunca rotarlo a `app_user`** (el legacy con BYPASSRLS inarreglable → cero aislamiento):
   - `DATABASE_URL` → connection string con el rol **`app_rls`** (creado `NOBYPASSRLS` por `0002`). **El valor lo carga el dueño** (contiene el password nuevo; no se tipea desde acá).
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
3. El rol `app_rls` puede quedar creado sin daño (no molesta si nadie conecta con él). El `app_user`
   legacy también queda como estaba (con su BYPASSRLS inarreglable) — inofensivo mientras nadie lo use.

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
| **blueprint** | `carniceria` | rubro Retail/Mostrador (`src/blueprints/retail/rubros.ts`) |
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

### Fix del storefront en `/` — ✅ HECHO (🟡 cambio de código, verificado, NO toca prod hasta deploy)

**Problema real (verificado):** el root `/` lo sirve `src/app/(site)/page.tsx`, que es la
**landing de estética de CH** (servicios, equipo, reserva de turno). La vidriera de Magra
(carnicería, rubro-aware) vive en **`/tienda`** (`src/app/tienda/page.tsx`). Antes, entrar a
`magra.tudominio.com/` mostraba la landing con forma de spa — **la equivocada**.

**Fix aplicado (2026-07-05, rama `frente/rls-redirect`):** el root `/` ahora es **consciente del
blueprint** del tenant resuelto. En `src/app/(site)/page.tsx`, al principio de `Home()`:
```ts
const slug = await getCurrentTenantSlug();
if (resolveRubroIdBySlug(slug)) redirect("/tienda");
```
- Tenant de **servicios/estética** (CH, slug no-retail) → sigue viendo la landing `(site)` de siempre.
- Tenant **retail/mostrador** (Magra y rubros de `src/blueprints/retail/`) → redirect `/` → `/tienda`.

Reusa el wiring que ya existía (`getCurrentTenantSlug` + `resolveRubroIdBySlug`, el mismo mapa
slug→rubro de la vidriera); no construye vidriera nueva. **Fail-open:** sin tenant/slug o rubro
no-retail cae a la landing histórica. Cuando exista `Tenant.blueprintId`, el chequeo pasa a leer esa
columna (un solo punto de cambio). Verificado con `tsc`+build. *(No requiere OK: es 🟡, no toca prod
hasta el deploy del Gate 1.)*

---

---

## URLs GRATIS por tenant (costo cero — sin comprar dominio)

El dueño quiere costo cero: cada negocio con su URL real y gratis, sin dominio propio ni
wildcard. Evaluadas dos opciones **contra el código real**.

> **Aclaración que aplica a A y B:** ninguna de las dos elimina la necesidad de **activar
> RLS** (Pasos 1-3). Ambos sitios/rutas pegan a la **misma** base de Neon; el aislamiento
> real entre CH y Magra lo da RLS a nivel DB. Lo que estas opciones reemplazan es **solo el
> Paso 4** (dominio + DNS wildcard + `APP_BASE_DOMAIN`) — eso es lo que pasa a costar $0.

### OPCIÓN A — un sitio Netlify por tenant, mismo repo, tenant fijado por env var ✅ recomendada

Cada negocio = un sitio Netlify con su `*.netlify.app` gratis (`chestetica.netlify.app` ya
existe; `magra-erp.netlify.app` nuevo), **todos deployando el mismo repo/branch**, y cada
sitio **fija su tenant** con una env var.

**¿El código lo soporta hoy?** Casi. **Todo** resuelve el tenant por una sola función,
`getCurrentTenantId()` (`src/lib/tenant.ts:97`), y la extensión de RLS también cae ahí
(`src/lib/rls.ts:39`). Falta un **override mínimo** al frente de esa cadena. Hoy `tenant.ts`
resuelve: subdominio → fallback single-tenant → throw. **No** lee ninguna env var de "tenant
forzado". El truco de `APP_BASE_DOMAIN` **no sirve** en `netlify.app` (habría que llamar al
sitio exactamente `magra.netlify.app`, que no está libre), así que la vía limpia es una var
propia.

**Cambio de código mínimo (🟡 ~10 líneas + 1 test, verificable, NO toca prod):** en
`getCurrentTenantId` (el wrapper cacheado, para no ensuciar `resolveTenantId` que es puro y
testeable), anteponer:

```ts
// Pin de tenant por sitio (Opción A — URLs gratis por tenant). Si está seteado,
// domina sobre el subdominio. Fail-closed: si el slug no existe, THROW (no cae al
// tenant equivocado). Resuelve por `slug` (misma clave que branding/vidriera).
const forced = process.env.FORCE_TENANT_SLUG?.trim().toLowerCase();
if (forced) {
  const t = await basePrisma.tenant.findUnique({ where: { slug: forced }, select: { id: true } });
  if (t) return t.id;
  throw new Error(`FORCE_TENANT_SLUG="${forced}" no matchea ningún tenant (fail-closed, ADR-015).`);
}
```

**¿Rompe el modelo de subdominio o el gate RLS? No.**
- **Subdominio:** intacto. El override se chequea *primero*; si `FORCE_TENANT_SLUG` no está,
  la resolución cae al subdominio y al fallback single-tenant como hoy. Es aditivo.
- **Gate RLS (ADR-018):** intacto. El gate mira `pg_class.relrowsecurity` (¿RLS activo sobre
  las tablas?), independiente de *cómo* se resuelve el tenant. `FORCE_TENANT_SLUG` no lo toca
  → sigue siendo imposible crear el 2º tenant sin RLS.
- **Aislamiento:** con RLS on + `DATABASE_URL` en `app_rls`, el pin fija el `tenantId` que la
  extensión mete en el GUC → cada sitio ve **solo** su tenant, respaldado por la policy de DB.
- **`/operador`:** no lo afecta — usa `operatorPrisma` (cross-tenant, bypass), no
  `getCurrentTenantId`. La consola sigue viendo todos los tenants desde cualquier sitio. Se
  puede dejar en `chestetica.netlify.app/operador` sin sitio dedicado.
- **Cookies/sesión:** a favor. Cada `*.netlify.app` es un **origen distinto** → jar de cookies
  separado. La sesión de admin de CH no cruza a `magra-erp.netlify.app`. Aislamiento extra gratis.

**El fix del `/` ya está aplicado** (blueprint-aware, ver Paso 4 — ✅ HECHO): con
`FORCE_TENANT_SLUG=magra`, `/tienda` muestra la vidriera de Magra y `/` **redirige a `/tienda`**
(ya no renderiza la landing de estética). CH (slug no-retail) sigue con su landing en `/`.

### OPCIÓN B — ruteo por path en un sitio único (`/t/magra/...`)

Un solo sitio; el tenant sale del path. **Más código, menos prolijo, peor aislamiento:**
- Requiere reescribir el árbol de rutas bajo `/t/[slug]/…` **o** un rewrite en `proxy.ts` que
  inyecte el slug en un header y que `getCurrentTenantId` lo lea. Superficie grande (storefront
  `/`, links, redirects, API pública, webhooks, `/operador`).
- **Riesgo de seguridad real:** todos los tenants comparten **un mismo origen → un solo jar de
  cookies**. La cookie de sesión es host-wide (`getSessionCookieName`, `src/proxy.ts`): un admin
  logueado de CH podría pegarle a `/t/magra/admin` con la misma cookie salvo que se scopeen las
  cookies por path y se endurezcan los guards. Es fácil de equivocar.
- No hay ganancia de costo sobre A (los `*.netlify.app` de A también son gratis).

### A vs B — comparación

| Criterio | A (sitio por tenant) | B (path `/t/slug`) |
|---|---|---|
| **Costo** | $0 (`*.netlify.app` gratis por sitio) | $0 |
| **Esfuerzo de código** | ~10 líneas + 1 test (🟡) | Alto: rutas/rewrite/cookies/guards |
| **Prolijidad** | URLs reales y limpias por negocio | prefijo `/t/slug` en todo |
| **Aislamiento** | Fuerte: RLS + pin + **origen separado** (cookies aparte) | Débil: **origen y cookies compartidos** → hay que endurecer |
| **Toca el modelo actual** | Aditivo, no rompe subdominio/gate | Reestructura ruteo y sesión |
| **Recomendación** | ✅ **Sí** | ❌ solo si algún día se quiere un único host |

**Veredicto técnico:** **Opción A es viable y es la recomendada.** Cambio de código mínimo,
no rompe subdominio ni el gate RLS, y el aislamiento queda más fuerte que en B (orígenes
separados + RLS). Es la forma costo-cero de reemplazar el Paso 4.

### Qué es costo cero y qué necesita acción del dueño (Opción A)

- 🟡 **Override `FORCE_TENANT_SLUG`** en `tenant.ts` + test — cambio de código, verificable con `tsc`+build+tests, no toca prod hasta deploy. (Se puede preparar ya.)
- 🟢 **Sigue dependiendo de activar RLS** (Pasos 1-3) — sin eso, dos sitios sobre la misma DB no están aislados.
- 🔴 **Crear el nuevo sitio Netlify** (`magra-erp.netlify.app` u otro nombre libre) apuntando al **mismo repo/branch** — acción humana en Netlify.
- 🔴 **Setear las env vars por sitio:** en el sitio de Magra `FORCE_TENANT_SLUG=magra` (y en el de CH, opcional, `FORCE_TENANT_SLUG=beauty-spa`); en **ambos** las vars de RLS del Paso 2 (`DATABASE_URL`→`app_rls`, `OPERATOR_DATABASE_URL`→rol dueño, `RLS_ENFORCEMENT=on`).
- ⚠️ **Nota de plan free:** cada sitio consume sus propios build-minutes/funciones/bandwidth del free tier de Netlify. Para 2-3 tenants es holgado; a escala grande se revisa. El auto-publish sigue apagado (Gate 1) por sitio.

> **Con Opción A, el Paso 4 (dominio propio + wildcard + `APP_BASE_DOMAIN`) queda OPCIONAL** —
> se puede saltar entero y quedarse en `*.netlify.app` gratis. El día que se quiera una URL de
> marca (`magra.tudominio.com`), el Paso 4 sigue disponible sin deshacer nada de A.

---

## Resumen de OKs del dueño (lo único que no se hace solo)

1. 🔴 Acceso a Neon para crear el **branch de ensayo** (Paso 1) — *sin riesgo, es desechable*.
2. 🔴 **Gate 2:** aplicar RLS a prod + crear `app_rls` + rotar `DATABASE_URL` a `app_rls` + `RLS_ENFORCEMENT=on` + deploy (Paso 2) — **irreversible**.
3. 🔴 Password de `app_rls` (el rol NUEVO) y confirmación del **email real** del dueño de Magra (secrets/dato).
4. 🔴 Crear el tenant Magra en prod desde `/operador/alta` (Paso 3).
5. **Para las URLs — elegir UNA vía** (excluyentes):
   - **5a. Costo cero (recomendada):** 🔴 crear el sitio Netlify `magra-erp.netlify.app` (mismo repo) + setear `FORCE_TENANT_SLUG` y las vars de RLS por sitio (Opción A). Requiere antes el 🟡 override en `tenant.ts`.
   - **5b. Marca propia:** 🔴 Dominio + DNS wildcard + `APP_BASE_DOMAIN` (Paso 4). Cuesta plata; opcional, se puede hacer después de 5a sin deshacer nada.

Todo lo 🟢/🟡 (pre-flight, ensayo en branch, fix del `/`, override `FORCE_TENANT_SLUG`) se
puede preparar y verificar **antes**, sin tocar prod, para que el día del go-live sea
*revisar y aplicar*.
