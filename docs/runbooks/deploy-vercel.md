# 🚀 Runbook — Deploy en Vercel (un solo deploy, subdominios por tenant)

**Objetivo:** servir **todos los tenants desde UN solo proyecto de Vercel** (plan Hobby), cada uno por
su **subdominio** (`chestetica.<dominio>`, `magra.<dominio>`). Es la **Opción B** (dominio propio +
routing por subdominio) que reemplaza a la Opción A de Netlify (un sitio por tenant con
`FORCE_TENANT_SLUG`).

- **Autor:** Célula 2 (Confiabilidad/SRE) · **Fecha:** 2026-07-06 · **Rama:** `frente/reliability`
- **Qué preparó el repo (esta sesión):** `vercel.json` (build con Prisma + cron), CI `gates.yml`, y
  este runbook. **No se tocó prod/Neon/deploy.** El dueño ejecuta los pasos con sus credenciales.
- **Regla de secretos:** los valores van al panel de **Environment Variables de Vercel** (o `.env`
  local), **nunca en un campo de la app ni en el repo**.

---

## 1. Arquitectura — cómo resuelve cada subdominio a su tenant

La resolución vive en `src/lib/tenant.ts` (`getCurrentTenantId`), **fail-closed** (ADR-015/ADR-018 §4):

```
Request host                     →  tenant servido
─────────────────────────────────────────────────────────
chestetica.<APP_BASE_DOMAIN>     →  Tenant.subdomain = "chestetica"
magra.<APP_BASE_DOMAIN>          →  Tenant.subdomain = "magra"
<APP_BASE_DOMAIN> (apex) / www   →  si hay 1 tenant → ese;  si hay >1 → ERROR (ver §1.b)
host ajeno / sin APP_BASE_DOMAIN →  fallback single-tenant (1 tenant) o ERROR
```

- **`APP_BASE_DOMAIN`** es el dominio base (ej. `miapp.com`). `extractSubdomain()` saca el label de
  más a la izquierda: `magra.miapp.com` → `"magra"`.
- El subdominio se matchea contra **`Tenant.subdomain`** (columna `@unique`, no el `slug`). Cada tenant
  debe tener su `subdomain` cargado (ver §1.a).
- **RLS sigue siendo el candado real:** el `tenantId` que resuelve esto alimenta el GUC de la policy.
  El routing elige el tenant; RLS impide ver datos de otro aunque el routing fallara.

### 1.c URLs `.vercel.app` GRATIS por tenant (sin dominio propio) — `TENANT_HOST_MAP`
Para demos hoy, **sin comprar dominio**: Vercel Hobby permite agregar muchos dominios `.vercel.app`
gratis al proyecto (hasta 50). Se le da a cada tenant su URL plana (ej. `chestetica-erp.vercel.app`),
todas apuntando al mismo proyecto `erp-ch`. Como NO son subdominios de un dominio base común,
`tenant.ts` resuelve por **hostname exacto** vía la env `TENANT_HOST_MAP` (mapa `host=subdomain;…`),
que se evalúa **ANTES** del método de subdominio (que sigue intacto para el día del dominio propio).

- **Agregar en Vercel → Domains** (una por tenant, gratis): `chestetica-erp.vercel.app`,
  `magra-erp.vercel.app`, `shinevelas-erp.vercel.app`, `adosmanos-erp.vercel.app`.
- **Setear la env:**
  `TENANT_HOST_MAP=chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra;shinevelas-erp.vercel.app=shinevelas;adosmanos-erp.vercel.app=adosmanos`
- **DEJAR `APP_BASE_DOMAIN` vacío** en este deploy (con dominio propio a futuro se setea y el mapa se
  puede quitar). El valor del mapa es el `Tenant.subdomain` (mismo lookup y fail-closed que el subdominio).
- El apex del proyecto (`erp-ch.vercel.app`, sin entrada en el mapa) cae al fail-closed con >1 tenant
  (§1.b) → usalo solo para `/demo` (estático) o agregale su propia entrada al mapa si querés fijarlo.

### 1.a Prerrequisitos de datos (⚠️ Gate 2 — migración; acción del dueño con OK)
Para que el routing por subdominio funcione en prod:
1. **Migración `20260705120000_control_plane_tenant` aplicada** — agrega la columna `Tenant.subdomain`.
   Si no está aplicada, el query por subdominio rompe. Verificar con `npm run predeploy-check` (no toca
   datos, solo el catálogo). Aplicar con `prisma migrate deploy` es **Gate 2** (con OK explícito).
2. **Cada tenant con su `subdomain` seteado** en la DB:
   - CH Estética → `subdomain = "chestetica"` (o el label que se use en la URL).
   - Magra → `subdomain = "magra"`.
   - Se puede setear vía la consola de operador o un `UPDATE` puntual (con OK). **Sin esto, el
     subdominio da 404-tenant fail-closed.**

### 1.b El apex (`miapp.com` sin subdominio) con 2+ tenants → ERROR a propósito
Con más de un tenant y sin subdominio, `tenant.ts` **lanza fail-closed** (no adivina a quién servir).
Eso significa que entrar al **dominio pelado** o a `www.` daría un error 500 del server. Es correcto en
seguridad, pero feo como UX. **Decisión del dueño** (elegir una):
- **(recomendado) Redirigir el apex/www a un tenant por defecto** — en Vercel → Project → Domains,
  configurar `miapp.com` y `www.miapp.com` como **Redirect** a `https://chestetica.miapp.com`. Cero
  código.
- Dejar el apex para una futura landing de marketing (hoy no existe) — mientras no exista, usar el
  redirect de arriba.

> **NO setear `FORCE_TENANT_SLUG`** en este deploy: fija TODO el proyecto a un solo tenant e ignora el
> host → rompería el multi-tenant por subdominio. Es una var de la Opción A (un sitio por tenant), que
> acá NO se usa.

---

## 2. Variables de entorno (cargar en Vercel → Settings → Environment Variables)

**Solo nombres y para qué sirven — sin valores.** Ambientar en **Production** (y Preview si se usa).
Los valores de DB/secretos ya existen en la config actual de prod (Neon/Netlify); se copian tal cual.

### Obligatorias (sin estas, la app no funciona bien en prod)
| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Conexión a Neon con el **rol `app_rls`** (RLS enforced). Es la conexión de la app. |
| `OPERATOR_DATABASE_URL` | Conexión a Neon con el **rol owner (`neondb_owner`)** para el control-plane `/operador` (cross-tenant). **Si falta, cae a `DATABASE_URL` (app_rls) y el operador queda bloqueado por RLS.** |
| `AUTH_SECRET` | Secreto HMAC que firma la cookie de sesión del panel del tenant (`/admin`). |
| `OPERATOR_SECRET` | Secreto HMAC de la cookie del operador (`/operador`) — **llavero separado** del tenant. |
| `OPERATOR_PASSWORD` | Contraseña de la consola de operador. Obligatoria en prod (sin ella, no se entra). |
| `RLS_ENFORCEMENT` | Poner en **`on`** para activar el candado RLS (aislamiento por fila). |
| `APP_BASE_DOMAIN` | Dominio base para routing por subdominio (ej. `miapp.com`). **Con dominio propio.** En el deploy `.vercel.app` **dejar vacío** (ver §1.c). |
| `TENANT_HOST_MAP` | Mapa `hostname=subdomain;…` para URLs `.vercel.app` gratis por tenant (§1.c). Se evalúa antes del subdominio. Alternativa a `APP_BASE_DOMAIN` mientras no haya dominio propio. |

### Recomendadas
| Variable | Para qué sirve |
|---|---|
| `CRON_SECRET` | Protege `/api/cron/reminders`. **Vercel Cron inyecta el `Authorization: Bearer` automáticamente** cuando esta var existe → el cron autentica solo. Sin ella, el endpoint queda abierto (fail-open). |

### Opcionales (encienden features; sin ellas, la feature queda inerte/simulada)
| Variable | Para qué sirve |
|---|---|
| `MP_WEBHOOK_SECRET` | Valida la firma de los webhooks de Mercado Pago. Necesaria **solo al activar cobros MP reales** (con facturación ON, sin ella el webhook responde 503 fail-closed). |
| `RESEND_API_KEY` | API key de Resend para enviar emails (recordatorios/notificaciones). Sin ella → modo simulado (no envía). |
| `RESEND_FROM_EMAIL` | Remitente de los emails (default genérico si falta). |
| `EXTERNAL_ORDERS_API_KEY` | Clave única de la API pública de ingesta de pedidos externos (front WordPress/Woo). |
| `EXTERNAL_ORDERS_API_KEYS` | Variante multi-tenant: JSON `{"<slug>":"<key>"}`. Usar esta O la anterior, según haya 1 o varios. |
| `ARCA_INVOICING_ENABLED` | Flag de facturación electrónica ARCA (off por default; requiere cert + homologación). |

### Las provee Vercel automáticamente — **NO cargarlas**
| Variable | Nota |
|---|---|
| `VERCEL_GIT_COMMIT_SHA` | Commit del deploy; lo lee `/api/health`. Vercel la inyecta sola. |
| `NODE_ENV` | Vercel la pone en `production` en el deploy. |

### NO usar en este deploy
| Variable | Por qué |
|---|---|
| `FORCE_TENANT_SLUG` | Fijaría todo el proyecto a un solo tenant (Opción A). Rompe el routing por subdominio. |

> **Nunca cargar en Vercel** las vars de tooling local: `LOAD_TEST_*`, `PREDEPLOY_*`,
> `RLS_VERIFY_DATABASE_URL`, `RLS_AUDIT_DATABASE_URL` (son de scripts que corren en local/staging).

---

## 3. Paso a paso del deploy (dueño)

1. **Crear el proyecto en Vercel** → *Add New… → Project* → importar el repo de GitHub. Vercel detecta
   Next.js. El `vercel.json` del repo ya define el build (`prisma generate && next build`) y el cron.
   - **Node:** dejar el default (20/22) — Next 16 lo requiere. No hace falta tocar nada.
   - **No deployar todavía:** primero cargar las env vars (paso 2) para que el primer build ya arranque
     con todo.
2. **Cargar las variables de entorno** (§2) en *Settings → Environment Variables*, ambiente
   **Production**. Copiar `DATABASE_URL`/`OPERATOR_DATABASE_URL` y los secretos desde la config actual
   de prod (no inventar; son los mismos que hoy).
3. **Confirmar el prerrequisito de datos** (§1.a): migración `control_plane_tenant` aplicada y
   `Tenant.subdomain` seteado para CH y Magra. Si falta la migración → aplicarla es **Gate 2** (con OK).
4. **Agregar el dominio y los subdominios** → *Settings → Domains*:
   - **Opción simple (recomendada para pocos tenants):** agregar cada subdominio explícito
     (`chestetica.miapp.com`, `magra.miapp.com`) → Vercel pide un **CNAME** por cada uno hacia el CNAME
     del proyecto. Agregar además `miapp.com` + `www.miapp.com` como **Redirect** al subdominio primario
     (§1.b). Hobby permite hasta 50 dominios por proyecto.
   - **Opción escalable (N tenants sin tocar DNS cada vez):** agregar el **wildcard `*.miapp.com`**.
     Vercel exige el **método nameservers** (apuntar los NS del registrador a Vercel). Con esto, cualquier
     `nuevo.miapp.com` resuelve sin configurar DNS por tenant.
5. **Setear `APP_BASE_DOMAIN`** = `miapp.com` (el dominio base, sin subdominio).
6. **Deploy** (Vercel → Deploy, o push a la rama conectada). El build corre `prisma generate && next
   build`.
7. **Verificar** (§4).

---

## 4. Verificación post-deploy

- **Liveness:** `GET https://chestetica.miapp.com/api/health` → `{ status: "ok", commit: <sha> }`.
  El `commit` debe coincidir con el deploy publicado.
- **Aislamiento por subdominio:** entrar a `chestetica.miapp.com` y `magra.miapp.com` → cada uno debe
  mostrar **su** negocio (login del tenant correcto, catálogo correcto). Nunca datos cruzados.
- **Apex:** `miapp.com` → debe redirigir (si se configuró el redirect) y **no** mostrar un 500.
- **Operador:** `https://<cualquier-sub>.miapp.com/operador/login` entra con `OPERATOR_PASSWORD`.
- **Cron:** Vercel → Project → Cron Jobs → ver que `/api/cron/reminders` figura y su próxima corrida.

---

## 5. Notas de plataforma (Hobby)

- **Cron diario, no horario (límite de Hobby):** Hobby **solo permite cron una vez por día** — un
  `0 * * * *` (horario) **hace fallar el deploy**. Por eso `vercel.json` usa `0 12 * * *` (una vez al
  día, ~09:00 ART, precisión ±59 min). ⚠️ **Implicancia:** el motor de recordatorios estaba pensado para
  correr cada hora (ventana ±1h por servicio); con una sola corrida diaria, **sólo avisa los turnos cuya
  hora de recordatorio cae cerca de esa corrida**. **Decisión del dueño:** (a) upgrade a **Pro** para
  volver al cron horario, o (b) follow-up para convertir los recordatorios en un **digest diario** (avisar
  todos los turnos de las próximas 24h en la corrida). Documentado como deuda.
- **Región (opcional):** Neon está en `sa-east-1` (São Paulo). Co-locar las funciones en la región
  `gru1` (São Paulo) baja la latencia app↔DB. Se puede setear en *Settings → Functions Region* si el
  plan lo permite; no es bloqueante.
- **Prisma:** el build usa el **driver adapter `@prisma/adapter-pg`** (no el engine Rust) → **no hacen
  falta `binaryTargets`** ni configuración extra de Prisma para Vercel. El `prisma generate` del build
  genera el cliente en `src/generated/prisma` (sin conectar a la DB).
- **Auto-publish:** a diferencia de Netlify (que se dejó con `stop_builds`), en Vercel cada push a la
  rama conectada **publica**. Si se quiere mantener el Gate 1 (deploy con OK explícito), conectar Vercel
  a una rama que NO reciba push automático, o desactivar los auto-deploys del proyecto.

---

## 6. Checklist del dueño

- [ ] Proyecto Vercel creado desde el repo (Next.js autodetectado).
- [ ] Env vars **obligatorias** cargadas (§2) en Production.
- [ ] `RLS_ENFORCEMENT=on` y `OPERATOR_DATABASE_URL` = rol owner.
- [ ] Migración `control_plane_tenant` aplicada + `Tenant.subdomain` seteado (CH, Magra).
- [ ] Dominio + subdominios (o wildcard) configurados; apex con redirect.
- [ ] `APP_BASE_DOMAIN` seteada al dominio base.
- [ ] Deploy hecho y verificado (§4): health, aislamiento por subdominio, operador, cron.
- [ ] Decidido el esquema de recordatorios en Hobby (Pro horario / digest diario).
