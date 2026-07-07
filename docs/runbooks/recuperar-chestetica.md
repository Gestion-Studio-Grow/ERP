# Runbook — Recuperar / republicar CH Estética en Vercel

> **Contexto:** no se perdió nada. El backoffice completo (agenda, caja, catálogo,
> comisiones, panel del dueño, ARCA, clientes, flujo "vecino/a de La Alameda") está
> en `main`, y los datos reales viven en Neon (tenant `beauty-spa`, subdomain
> `chestetica`: 149 servicios, agenda, profesionales reales). "Recuperar" = **volver
> a publicar** el deploy que ya sirve todo eso. NO se rehace ninguna funcionalidad.
>
> **El dueño ejecuta y carga los secretos. Claude no toca secretos.**

---

## 🔴 REGLA DE ORO

> **NUNCA correr `npm run seed` (ni `prisma db seed`) contra la base de producción.**
> `prisma/seed.ts` arranca con `deleteMany()` de TODAS las tablas y **borraría los
> datos reales de CH**. El seed es solo para altas demo en una base vacía.

---

## 1. Proyecto Vercel a usar

**Usar el proyecto existente `erp-ch`** (el mismo repo, multi-tenant). **No crear uno
nuevo para CH.**

- El ERP es **una sola app multi-tenant**: el mismo deploy sirve CH, Magra, Shine
  Velas y Ados Manos, y decide el tenant por el **host** del request
  (`TENANT_HOST_MAP` / subdominio). Un proyecto por tenant duplicaría deploys,
  variables y base sin ningún beneficio.
- CH entra en ese proyecto como un host más: `chestetica-erp.vercel.app → chestetica`.

---

## 2. Variables de entorno (Production)

Cargar en **Vercel → Project `erp-ch` → Settings → Environment Variables** (ambiente
**Production**). Fuente y detalle: [`.env.vercel.template`](../../.env.vercel.template).

**🔑 = secreto (lo pega el dueño, mismos valores que ya usa en prod) · ⚙️ = config (valor fijo, abajo).**

### Obligatorias (sin estas la app no arranca sana)

| Variable | Tipo | Para qué / valor |
|---|---|---|
| `DATABASE_URL` | 🔑 | Conexión a **Neon** con el rol de la app. **El mismo Neon de siempre** (`ep-little-credit…`, donde están los datos reales). |
| `OPERATOR_DATABASE_URL` | 🔑 | Conexión a Neon con el rol **owner** (`neondb_owner`) para el control-plane `/operador` (cross-tenant). Si falta, el operador queda bloqueado por RLS. |
| `AUTH_SECRET` | 🔑 | Secreto HMAC que firma la cookie de sesión del panel del tenant (`/admin`). |
| `OPERATOR_SECRET` | 🔑 | Secreto HMAC de la cookie del operador (`/operador`) — llavero **separado** del de `/admin`. |
| `OPERATOR_PASSWORD` | 🔑 | Contraseña de la consola `/operador/login`. (El código lee `OPERATOR_PASSWORD`, **no** `ADMIN_PASSWORD`.) |
| `RLS_ENFORCEMENT` | ⚙️ | Candado RLS de Postgres (aislamiento por fila). Valor exacto: **`on`**. |
| `TENANT_HOST_MAP` | ⚙️ | Ruteo host→tenant para URLs `.vercel.app` gratis. Valor (una línea): `chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra;shinevelas-erp.vercel.app=shinevelas;adosmanos-erp.vercel.app=adosmanos` |

> ⚠️ **`APP_BASE_DOMAIN`: NO setear** en este deploy `.vercel.app` sin dominio propio.
> Ponerle `vercel.app` rompería el ruteo (trataría `chestetica-erp` como subdominio).
> El match de CH lo resuelve `TENANT_HOST_MAP` → `chestetica`, que es el `subdomain`
> real del tenant en Neon. ✔ verificado.

### Recomendada

| Variable | Tipo | Para qué |
|---|---|---|
| `CRON_SECRET` | 🔑 | Protege `/api/cron/reminders`. Sin ella el endpoint queda abierto (fail-open). |

### Opcionales (dejar vacías hasta activar cada feature)

`MP_WEBHOOK_SECRET` (cobros MP reales) · `RESEND_API_KEY` + `RESEND_FROM_EMAIL`
(emails; sin key → modo simulado) · `EXTERNAL_ORDERS_API_KEY(S)` (ingesta pedidos
externos) · `ARCA_INVOICING_ENABLED` (facturación ARCA; requiere cert + homologación).

### ❌ NO setear

- `FORCE_TENANT_SLUG` → fijaría **todo** el proyecto a un solo tenant y rompería el
  multi-tenant por host.
- `ADMIN_PASSWORD` → legacy, el runtime no la lee.
- `VERCEL_GIT_COMMIT_SHA`, `NODE_ENV` → las provee Vercel sola.

---

## 3. Pasos, en orden

1. **Cargar las variables** de la sección 2 en `erp-ch` (Production). Secretos con
   los mismos valores que ya se usan en prod (Neon + los HMAC actuales).
2. **Deploy de `main`** — en Vercel → Deployments → *Redeploy* del último commit de
   `main` (o push a `main`, que dispara build). **No** correr migraciones ni seed:
   la base ya está migrada y poblada.
3. **Verificar** (con el deploy arriba, en `https://chestetica-erp.vercel.app`):
   - [ ] **Home pública** carga con la **marca CH** (wordmark "CH · Estética") y el
         **toggle "¿Sos vecino/a de La Alameda?"** recalcula precios al activarlo.
   - [ ] **`/admin`** entra con login del tenant y muestra **datos reales**:
     - [ ] **Agenda / Turnos** con boxes y turnos existentes.
     - [ ] **Caja** operativa.
     - [ ] **Catálogo** con los **149 servicios reales** y sus precios (incl. precio
           vecino/a donde corresponde).
   - [ ] Sanidad: `GET /api/health` responde OK (commit del deploy).

Si algo del checklist falla, **NO tocar la base** — revisar variables (típico:
`TENANT_HOST_MAP` mal pegado, o `APP_BASE_DOMAIN` seteado por error) y volver a
deployar.

---

## 4. Qué queda a salvo (para tranquilidad)

- **Front real + backoffice completo** → código en `origin/main` (sincronizado).
- **Datos reales** → intactos en Neon (no se tocan en todo este runbook).
- **Flujo "vecino/a de La Alameda" (ADR-013)** → modelo (`residentPrice`,
  `isResidentBooking`), gate server-side (precio congelado, revalidado) y UI, todo
  en `main`. Se conserva tal cual.

**Recuperar CH = cargar variables + redeploy + verificar. Cero desarrollo.**
