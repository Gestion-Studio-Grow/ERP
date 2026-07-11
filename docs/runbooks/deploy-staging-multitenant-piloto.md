# 🌐 Config de deploy — staging multi-tenant del PILOTO (4 tenants por host)

> **Qué es:** el mapa EXACTO de variables de Vercel + `host → tenant` para servir los 4 tenants demo (CH ·
> Magra · Shine · A Dos Manos) desde **un solo proyecto de staging**, cada uno con su **front (vidriera `/`)
> y su back (`/admin`)** correctos. **Lo configura el dueño en Vercel** (el agente no toca deploy).
> **Anclado en el resolver real** (`src/lib/tenant.ts`: `FORCE_TENANT_SLUG` → `TENANT_HOST_MAP` → subdominio
> por `APP_BASE_DOMAIN` → fallback 1-tenant → fail-closed si >1). **Autor:** S5 (Gate + deploy) · 2026-07-09.

---

## 0. La restricción real (por qué NO hay subdominios libres en el piloto)
En `*.vercel.app` **no se pueden crear subdominios arbitrarios** (`magra.miproyecto.vercel.app`) sin dominio
propio. Lo que Vercel Hobby **sí** permite: agregar **muchos dominios `.vercel.app` PLANOS** a un proyecto
(hasta ~50). Por eso el piloto resuelve por **hostname exacto** (`TENANT_HOST_MAP`), no por subdominio de una
base. El resolver ya está hecho para esto (`hostMapSubdomain` se evalúa ANTES que el método de subdominio).

---

## 1. ✅ APPROACH RECOMENDADO para el piloto — `TENANT_HOST_MAP` con alias `.vercel.app` planos
**Un solo proyecto de staging sirve los 4 tenants**, cada uno por su host plano. Cero código, cero dominio propio.

### 1.a Dominios a agregar (Vercel → Project → Settings → Domains)
Cuatro alias `.vercel.app` (usar los que estén libres; ejemplo):
```
chestetica-erp.vercel.app
magra-erp.vercel.app
shinevelas-erp.vercel.app
adosmanos-erp.vercel.app
```

### 1.b El mapeo host → tenant (el corazón)
El resolver hace: **host → `TENANT_HOST_MAP` → `Tenant.subdomain` → tenant → `Tenant.slug` → branding**.
Por eso hay que alinear **3 cosas por tenant**: el valor del map, la columna `Tenant.subdomain`, y el `slug`
(que debe ser una clave de `BRAND_BY_SLUG` para que la marca resuelva — **ojo: CH es `beauty-spa`, no
`chestetica`**).

| Tenant | host (dominio Vercel) | `Tenant.subdomain` (= valor del map) | `Tenant.slug` (= clave de branding) |
|---|---|---|---|
| CH Estética | `chestetica-erp.vercel.app` | `chestetica` | **`beauty-spa`** ⚠️ |
| Magra | `magra-erp.vercel.app` | `magra` | `magra` |
| Shine | `shinevelas-erp.vercel.app` | `shinevelas` | `shinevelas` |
| A Dos Manos | `adosmanos-erp.vercel.app` | `adosmanos` | `adosmanos` |

> ⚠️ **Requisito de datos (lo siembra S1):** cada tenant demo en la base de staging debe tener su
> **`subdomain`** seteado (= valor del map) **y** su **`slug`** = clave de `BRAND_BY_SLUG`
> (`beauty-spa`/`magra`/`shinevelas`/`adosmanos`), o la vidriera cae a la marca por defecto ("ERP"). *(Si S1
> usa slugs distintos —p.ej. `magra-demo`—, o se agrega la clave a `BRAND_BY_SLUG`, o se alinea el slug.)*

### 1.c Variables de entorno (Vercel → Settings → Environment Variables)
```bash
# ── Ruteo multi-tenant (lo específico del piloto) ──
TENANT_HOST_MAP=chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra;shinevelas-erp.vercel.app=shinevelas;adosmanos-erp.vercel.app=adosmanos
# APP_BASE_DOMAIN=            ← DEJAR VACÍO / NO setear (con .vercel.app rompería el ruteo)
# FORCE_TENANT_SLUG=          ← NO setear (fijaría 1 solo tenant; acá queremos 4)

# ── Base / seguridad (mismas de siempre; valores de STAGING, no prod) ──
DATABASE_URL=<neon dev branch qa-empresa>        # NUNCA la de prod
OPERATOR_DATABASE_URL=<qa-empresa, rol owner>
AUTH_SECRET=<secreto de staging>                 # ⚠️ obligatorio: sin esto cae al inseguro "dev-secret"
OPERATOR_SECRET=<secreto de staging>
OPERATOR_PASSWORD=<password consola de staging>
RLS_ENFORCEMENT=on
CRON_SECRET=<valor de staging>

# ── Flags del incremento (QA del piloto) ──
PROFILES_ENABLED=on
NAV_GROUPING_ENABLED=on
UPGRADE_TEASER_ENABLED=off
ARCA_INVOICING_ENABLED=off
# (el flag de la identidad GSG del piloto S4 se agrega acá cuando cierre — lo confirmo en el Gate)
```

### 1.d El apex del proyecto (dominio default, p.ej. `erp-staging.vercel.app`)
No está en el map → con >1 tenant cae en **fail-closed** (`getCurrentTenantId` lanza). **Ya no rompe** (el
hotfix defensivo del layout público degrada en vez de crashear), pero muestra una vidriera genérica. **Opción
limpia:** en Vercel → Domains, configurar el apex como **Redirect** a uno de los 4 hosts (p.ej. a
`chestetica-erp.vercel.app`). Cero código.

### 1.e Verificación (por tenant, tras configurar)
- `https://magra-erp.vercel.app/` → **vidriera de Magra** · `/admin/login` → **back de Magra** (login con el
  usuario OWNER sembrado). Idem los otros 3. Cada host = front + back del MISMO tenant.

---

## 2. Alternativas evaluadas (por qué NO para el piloto)

| Approach | Cómo | Veredicto |
|---|---|---|
| **B · `FORCE_TENANT_SLUG` por deploy** | **Un proyecto Vercel por tenant** (4 proyectos), cada uno con `FORCE_TENANT_SLUG=<slug>`. Resolución trivial (sin host-map). | Válido y a prueba de balas (aislamiento total), **pero** son 4 proyectos + 4 deploys + 4 sets de env → operativamente pesado para un staging. **Úsese solo si el host-map se complica.** |
| **C · Path-based** (`erp.vercel.app/t/magra`) | Resolver por path. | ❌ **El resolver actual es por HOST, no por path** → requiere cambio de código. Fuera del piloto. |

---

## 3. 🎯 Con DOMINIO PROPIO (`gsg-erp` u otro) — subdominios REALES (estado futuro)
Cuando haya dominio propio, se pasa a subdominios de verdad (más limpio y vendible):
- Comprar el dominio (`gsg-erp.com`), agregar **`*.gsg-erp.com`** (wildcard) + el apex al proyecto en Vercel.
- **`APP_BASE_DOMAIN=gsg-erp.com`** → el resolver saca el subdominio solo (`extractSubdomain`).
- Cada tenant en **`<subdomain>.gsg-erp.com`**: `chestetica.gsg-erp.com`, `magra.gsg-erp.com`, etc.
  (`Tenant.subdomain` = el label).
- **Quitar `TENANT_HOST_MAP`** (ya no hace falta; el subdominio real lo reemplaza).
- Apex `gsg-erp.com` → landing de marketing o redirect a un tenant.
- **Cero cambio de código** — el mismo resolver ya soporta `APP_BASE_DOMAIN`; solo cambia la config.

> **Ruta de migración:** el piloto arranca en 1.a–1.c (`.vercel.app` + host-map); el día del dominio propio,
> se setea `APP_BASE_DOMAIN`, se agrega el wildcard, y se puede retirar el host-map. Sin tocar código.

---

## 4. Dependencias (para que el piloto funcione end-to-end)
- **Migraciones aplicadas en `qa-empresa`** (incl. `Tenant.subdomain` de `control_plane_tenant` + las §C) — ya
  hecho por el dueño.
- **4 tenants demo sembrados** con `slug` (clave de branding) + `subdomain` (valor del map) + **usuario OWNER**
  para login (lo hace S1). *(El seed debe correr contra `qa-empresa`, con la baranda anti-prod.)*
- **`AUTH_SECRET` real** en el env (si falta, sesiones firmadas con el inseguro `dev-secret` — riesgo).

— Elaborado por GSG (S5 · Gate + config de deploy). Config, no ejecución: la aplica el dueño en Vercel.
