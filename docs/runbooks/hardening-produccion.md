# 🛡️ Runbook — Hardening de Producción (Célula 2: Confiabilidad / SRE + QA)

**Objetivo:** que el ERP **no falle en producción** cuando entren clientes reales, con **defensa en
capas + recuperación rápida**. Este documento es el plan priorizado por impacto/riesgo, lo que ya
quedó implementado como vallas, y el **checklist "listo para clientes reales"** con lo que requiere
acción del dueño.

- **Autor:** Célula 2 (Reliability/SRE + QA) · **Fecha:** 2026-07-06
- **Base:** `docs/ESTADO-ACTUAL.md` (FASE 0). **Rama:** `frente/reliability`.
- **Regla dura respetada:** no se tocó PROD ni nada irreversible. Todo lo implementado es aditivo y
  verificado local (tsc · 273 tests · gate RLS · build-safe).

---

## 0. Foto de producción hoy (contexto que fija las decisiones)

| Dimensión | Estado real (2026-07-06) | Implicancia para confiabilidad |
|---|---|---|
| **Hosting app** | Netlify, **auto-publish APAGADO** (`stop_builds`) — push a `main` NO publica | Deploy = acción del dueño (Gate 1). Rollback de app = re-publicar un deploy previo (§4). |
| **DB** | Neon Postgres — **PLAN FREE** | Restringe PITR, staging persistente y carga. Es la **restricción #1** de todo el plan. |
| **Aislamiento** | **RLS ACTIVO y enforced** en prod (`app_rls`, `RLS_ENFORCEMENT=on`) | El candado de datos ya está puesto. Hay que **mantenerlo verde en cada cambio** (§6). |
| **Tenants reales** | **CH Estética** (vivo, operando) + **Magra** (dado de alta, sitio `magra-erp` pendiente de deploy) | Ya es multi-tenant real → una falla afecta negocios reales. |
| **Observabilidad** | Logger JSON estructurado → stdout/stderr → **logs de Netlify**; `requestId` (v2) | Base sólida; falta el **monitoreo/alerta activa** encima (§3). |
| **Health check** | `GET /api/health` **shallow** (sin DB, a propósito por el plan free) | Sirve para liveness/uptime. Readiness con DB = follow-up gateado por presupuesto. |

> **Neon FREE es el cuello de botella recurrente.** Casi todos los "🔑 acción del dueño" de abajo se
> destraban con un **plan pago de Neon** (PITR real, branch de staging persistente, más compute para
> carga). Es la palanca de infraestructura #1 para "listo para clientes reales".

---

## 1. STAGING — ambiente de pre-prod contra un branch de Neon

**Por qué:** validar migraciones y cambios de riesgo **con datos de forma real** sin tocar la DB de los
tenants vivos. El ensayo de RLS ya probó que un **branch de Neon** es el mecanismo correcto (se hizo
🟢 8/8 y se borró el branch).

### Runbook — levantar staging
1. **Crear branch de Neon** desde `main` (copy-on-write, no duplica storage): Neon Console → Branches →
   *Create branch* → nombre `staging-<fecha>`. Copia el schema y los datos al instante.
   - 🔑 **Acción del dueño / gateado por plan:** el free tier permite branches pero con **límite de
     cantidad y de horas de compute**. Para staging *persistente* (siempre arriba) → plan pago.
     Alternativa free: branch **efímero** que se crea para la prueba y se borra al terminar.
2. **Obtener la connection string del branch** (rol `app_rls` para probar con RLS enforced, o
   `neondb_owner` para aplicar migraciones).
3. **Correr la app apuntada al branch** (local o un 2º sitio Netlify de staging):
   ```
   DATABASE_URL="<branch app_rls>"  OPERATOR_DATABASE_URL="<branch owner>"  RLS_ENFORCEMENT=on
   npm run build && npm start
   ```
4. **Aplicar migraciones pendientes ahí primero** (Gate 2 se ensaya en staging, NO en prod):
   ```
   DATABASE_URL="<branch owner>" npx prisma migrate deploy
   npm run predeploy-check          # confirma que no quedó drift
   RLS_VERIFY_DATABASE_URL="<branch>" node prisma/rls/verify-rls.mjs   # aislamiento funcional 🟢
   ```
5. **Validar el cambio** (smoke manual + `npm run gates` + `npm run load-test --url http://localhost:3000`).
6. **Descartar el branch** al terminar (Neon → branch → Delete) para no consumir horas.

**Regla de oro:** todo cambio que toque **schema, RLS, o el path de cobro/caja** pasa por staging antes
de prod. Lo puramente aditivo (docs, un componente nuevo sin migración) puede ir directo a `main`.

---

## 2. PRUEBA DE CARGA / STRESS

**Implementado:** `scripts/load-test.mjs` (`npm run load-test`). Zero-dep (usa `fetch` nativo), somete
las **rutas críticas de lectura** (`/api/health`, `/` home SSR, `/reserva` agenda/turnos, `/tienda`
retail) a una **rampa de usuarios concurrentes** (5→10→25→50→100 por defecto) y reporta por escalón:
**p50/p95/p99, throughput (rps) y tasa de error**, marcando **en qué escalón se rompe** según
presupuesto (`p95 ≤ 800ms`, `error ≤ 2%`, configurables).

```
npm run load-test                                   # local, escalones por defecto
npm run load-test -- --stages 10,50,100,200 --seconds 30 --p95 1000
```

### Guardas de seguridad (verificadas)
- **⛔ Nunca contra prod:** si la URL no es `localhost`/`127.0.0.1`, **aborta** (exit 2) salvo
  `LOAD_TEST_ALLOW_PROD=1` explícito. Cargar prod quemaría compute de Neon (free) y afectaría a CH/Magra.
- **Solo GETs idempotentes:** no crea turnos ni ventas → no ensucia datos. Escritura bajo carga = script
  aparte contra staging con limpieza.
- **Smoke previo:** si `/api/health` no responde, aborta antes de generar carga.

### Dónde correrla y qué esperar
- **Local** (`npm run build && npm start`) → mide el **techo del código** (sin la red/DB de prod). Bueno
  para detectar regresiones de rendimiento entre cambios.
- **Staging (branch de Neon)** → el número más parecido a prod. **Recomendado antes de campañas** (ej.
  Magra abre delivery y espera pico de pedidos).
- **⚠️ Resultado de esta sesión:** el script quedó **implementado y verificado** (guardas 🟢, syntax 🟢),
  pero **no se corrió una pasada real**: el worktree usa `node_modules` por junction y Turbopack rechaza
  el build ahí (limitación conocida del repo), y no se levanta server en prod. **La primera corrida real
  queda para local con build nativo o contra staging** (owner puede pedirla). Los números son relativos
  al ambiente — se comparan escalones entre sí, no contra un absoluto; registrar el resultado acá.

**Umbral de referencia inicial (a calibrar con la 1ª corrida):** una estética/carnicería chica raramente
supera **20–50 usuarios concurrentes reales**. Si el sistema aguanta 100 VUs sintéticos dentro de
presupuesto, hay holgura cómoda. El riesgo real no es el volumen sino **conexiones a Neon** (free tier
tiene pool chico) → ver §5 (pooling) y §3 (alertar sobre saturación de conexiones).

---

## 3. MONITOREO + ALERTAS

**Lo que ya hay:** logs estructurados JSON en Netlify (cada `logger.error/warn/info` con `requestId`,
`tenantId`, `scope`). **Lo que falta: una capa activa que avise cuando algo se rompe** (hoy hay que ir a
mirar los logs).

### 3.a Qué medir + umbrales

| Señal | Cómo | Umbral de alerta | Severidad |
|---|---|---|---|
| **App caída** | Monitor de uptime pega a `GET /api/health` cada 1–5 min | 2 fallos seguidos (no-200) | 🔴 Crítica |
| **Deploy con commit viejo** | `health.commit` ≠ el esperado tras deploy | mismatch tras publicar | 🟠 Media |
| **Errores 5xx** | Contar `level:"error"` en logs de Netlify | > 5 en 5 min, o cualquier `scope:"global-error-boundary"` | 🔴 Crítica |
| **Fallo de aislamiento** | Log de RLS fail-closed / query sin `tenantId` ctx | **cualquiera** | 🔴 Crítica (seguridad) |
| **Saturación de Neon** | Neon Console → Monitoring: compute, conexiones activas, horas restantes | conexiones cerca del máx del pool; horas free < 20% | 🟠 Media |
| **Webhook MP fallando** | `scope` del webhook con `level:"error"` | > 3 en 10 min | 🟠 Media (cuando MP esté vivo) |
| **Latencia** | p95 de rutas críticas (de la prueba de carga periódica) | p95 > presupuesto 2 corridas seguidas | 🟡 Baja |

### 3.b Canal de alerta — propuesta (🔑 acción del dueño)
No hay canal de alerta hoy. Propuesta **costo-consciente** (ordenada de más simple a más completa):

1. **UptimeRobot (free)** apuntado a `https://<sitio>/api/health` → alerta por **email/Telegram** ante
   caída. **Es el mínimo imprescindible y es gratis.** Cubre "¿está vivo el deploy?". ← *empezar por acá.*
2. **Alerta de logs:** Netlify no alerta sobre contenido de logs en el plan base. Opción barata: un
   **cron liviano** (o el propio `/api/cron`) que relea métricas y postee a un **webhook de Telegram/Slack**
   ante umbral. Follow-up si el volumen lo justifica.
3. **Neon**: activar las **alertas de uso** del Console (horas de compute, storage) → email cuando se
   acerca al límite del free tier. Evita el "se acabaron las horas y se cayó todo" silencioso.

**Recomendación:** #1 (UptimeRobot → Telegram) + #3 (alertas de uso de Neon) cubren el 80% del riesgo con
**costo cero**. El canal de logs (#2) se agrega cuando haya más tenants.

---

## 4. BACKUPS + ROLLBACK

### 4.a Backups / PITR de Neon
- **Estado free tier:** Neon ofrece **PITR (point-in-time restore) con ventana de retención LIMITADA**
  en el plan free (típicamente ~1 día / restore corto vía branch). **No alcanza** para un negocio real
  que necesite recuperar un borrado de hace una semana.
- 🔑 **Acción del dueño (recomendada fuerte):** **plan pago de Neon** para extender la ventana de PITR
  (7–30 días según plan). Es el respaldo real de los datos de CH y Magra.
- **Mitigación free-tier mientras tanto (implementable sin plan pago):** un **`pg_dump` periódico** a
  almacenamiento externo. Se puede correr como cron (GitHub Actions programado, o la máquina del dueño):
  ```
  pg_dump "$OPERATOR_DATABASE_URL" --no-owner --format=custom -f backup-$(date +%F).dump
  ```
  Guardar cifrado fuera de Neon. **Queda propuesto** — no se implementó acá porque necesita un secreto
  de conexión y un destino de almacenamiento (decisión del dueño).

### 4.b Runbook de ROLLBACK

**Rollback de APP (Netlify)** — reversible, sin pérdida de datos:
1. Netlify → sitio → **Deploys** → elegir el último deploy **bueno conocido** (los tags
   `snapshot/*-postdeploy` marcan los commits deployados).
2. **Publish deploy** sobre ese. Netlify sirve el build viejo al instante (no re-buildea).
3. Verificar `GET /api/health` → `commit` = el del deploy restaurado, y smoke de CH + Magra.
4. **Cuándo:** un deploy nuevo rompe algo en runtime y el fix no es inmediato. Es la red de seguridad de
   Gate 1.

**Rollback de DB (Neon)** — ⚠️ el caso delicado:
1. **Si fue una migración mala:** restaurar a un **branch PITR** anterior al `migrate deploy`
   (Neon → Restore / Time Travel) y repuntar `DATABASE_URL` a ese estado. **Requiere OK del dueño** (es
   sobre prod). *Ensayar siempre primero en un branch* (§1).
2. **Si fue un borrado/UPDATE malo de datos:** PITR al minuto anterior. La ventana la fija el plan (ver
   4.a) → **otra razón para el plan pago**.
3. **Regla de oro (ya en `GO-LIVE-RUNBOOK.md`):** **deploy del código ANTES de rotar el secreto
   `DATABASE_URL`**. Invertir el orden cierra el candado sobre código que no lo entiende → CH sin ver
   nada. El rollback de un cambio de rol/secreto es *volver a poner el secreto anterior* + republicar.
4. **Migraciones son Gate 2** (irreversibles) → nunca corren solas; se ensayan en staging primero.

---

## 5. MANEJO DE ERRORES / DEGRADACIÓN

**Objetivo:** que una **falla parcial no tumbe todo** y que el cliente nunca vea un stack crudo ni una
pantalla en blanco.

### 5.a Implementado esta sesión
- **`src/app/global-error.tsx`** — **error boundary de último recurso**. Cuando una excepción escapa al
  root layout, Next monta este boundary: muestra una salida digna en español + botón **Reintentar** +
  un **código de referencia** (`error.digest`) para cruzar con los logs, en vez de pantalla en blanco.
  Es **auto-contenido** (su propio `<html>/<body>`, estilos inline, cero deps) para no depender de nada
  que pueda haber fallado (branding por-tenant toca DB; globals.css puede no haber cargado). Loguea el
  error a la consola en formato estructurado (lo ingiere Netlify). **Complementa** el boundary de ruta
  existente (`/reserva/error.tsx`).

### 5.b Gaps y recomendaciones (priorizados)

| # | Gap | Riesgo | Recomendación |
|---|---|---|---|
| 1 | **Sin timeout en llamadas externas** (Mercado Pago, WhatsApp, ARCA SOAP) | una API externa lenta cuelga el request y agota conexiones | envolver `fetch` externos con `AbortController` + timeout (ej. 8s) y fallar controlado. **Follow-up** en los adapters (`src/plugins/pagos`, `wa-*`, `arca`). |
| 2 | **Sin reintento en efectos best-effort** (auto-factura del webhook, recordatorios) | un fallo transitorio pierde el efecto silenciosamente | patrón **outbox + reintento** ya existe parcialmente (`OutboxEvent`); asegurar que los efectos best-effort no rompan el flujo principal (ya loguean, no re-tiran). |
| 3 | **Boundaries de ruta escasos** (solo `/reserva`) | un error en `/admin/caja` o `/tienda` sube al global | agregar `error.tsx` por segmento caliente (`/admin`, `/tienda`) para degradar localizado. **Follow-up** (aditivo, bajo riesgo). |
| 4 | **Pool de conexiones a Neon** (free tier, pool chico) | pico de tráfico → "too many connections" | usar el **pooler de Neon** (el `DATABASE_URL` ya apunta a `-pooler`) y mantener `connection_limit` bajo en Prisma. Verificar bajo carga (§2). |

> El **health shallow** (sin DB) es una decisión de degradación correcta: si Neon está caído, el proceso
> sigue "vivo" para el monitor, pero las rutas con DB fallan y caen al boundary. Un **readiness con
> `SELECT 1`** (endpoint separado, ej. `/api/ready`) es un follow-up gateado por presupuesto de Neon.

---

## 6. REGRESIÓN DE AISLAMIENTO — gate automático (RLS: CH no ve Magra)

**Requerimiento:** que el test de RLS quede como **gate que corre en cada cambio**.

**Implementado:** `npm run gates` (`scripts/verify-gates.mjs`) corre **en secuencia** las 3 vallas que
deben estar verdes antes de integrar/pushear:
1. **`tsc`** — el código compila.
2. **`npm test`** — la suite unitaria (273 tests) pasa.
3. **`rls-coverage`** — **regresión de aislamiento**: `prisma/rls/check-coverage.mjs` verifica que **todo
   modelo de-tenant sea protegible por RLS** (tiene `tenantId`). Es la red **estática** que corre **sin
   tocar Neon** → apta para cada cambio, cada worktree, sin costo de DB. Exit 1 si aparece un modelo
   nuevo sin `tenantId` (el leak silencioso más probable).

```
npm run gates       # tsc + tests + RLS coverage  → 🟢/🔴 agregado, exit 1 si alguna falla
npm run gate:rls    # solo la valla de aislamiento
```

**Verificado esta sesión:** `npm run gates` → **🟢 tsc · 🟢 273 tests · 🟢 rls-coverage** (exit 0).

### Dos niveles de gate RLS (importante)
- **Estático (en cada cambio):** `check-coverage.mjs` — arriba. Cero costo, corre siempre.
- **Funcional (aísla de verdad):** `prisma/rls/verify-rls.mjs` — prueba contra una **base real** que
  ctx=A no ve B, WITH CHECK bloquea cross-tenant, y fail-closed sin ctx. **Necesita un branch de Neon**
  → corre en **staging** (§1), no en cada push (por costo/plan free). Es obligatorio antes de cualquier
  cambio de RLS o de rol de DB.

### 🔑 Follow-up: CI real
No hay `.github/workflows/` en el repo — hoy las vallas corren **local** (disciplina de sesión). Cuando
haya presupuesto de setup, cablear `npm run gates` en un **GitHub Action on push/PR** convierte el gate
en **obligatorio y automático** (no dependiente de que alguien lo corra). Propuesta lista para pegar:
```yaml
# .github/workflows/gates.yml
on: [push, pull_request]
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run gates
```

---

## 7. REVISIÓN DE SEGURIDAD — superficies expuestas

Complementa el pase acotado previo (`docs/seguridad/PASE-SEGURIDAD-2026-07-05.md`, que revisó scoping por
tenant en código nuevo). Acá el foco es la **superficie de producción**: auth, `/operador`, y
**rate limiting/abuso** (hoy inexistente).

### Superficies y estado

| Superficie | Estado | Hallazgo / Riesgo | Recomendación |
|---|---|---|---|
| **Middleware `src/proxy.ts`** | Portón grueso: valida firma de cookie en `/admin` y `/operador` | Correcto como reja gruesa (el chequeo de rol por acción vive en Server Actions) | OK. |
| **Auth operador** (`operator-auth.ts`) | HMAC edge-safe, cookie propia, timing-safe, secreto propio | En dev acepta password `"operador"` si no hay `OPERATOR_PASSWORD`; en prod es **obligatoria** | 🔑 **Verificar que `OPERATOR_PASSWORD` y `OPERATOR_SECRET` estén seteadas en prod** (distintas del app). |
| **Auth API pública** (`public-api-auth.ts`) | api-key por tenant, timing-safe, **fail-closed** (sin key → 503) | Sólido. Sin key configurada rechaza cerrado | OK. |
| **⚠️ Rate limiting** | **NO EXISTE en ninguna superficie** | Login `/admin` y `/operador` sin freno → **fuerza bruta**; API pública `/public/v1/orders` sin freno → **abuso/flood** | 🔴 **Agregar rate limiting** (ver abajo). Prioridad alta. |
| **Webhook MP** (`webhooks/mercadopago`) | **Firma `x-signature` NO validada** (TODO ADR-024, hoy stub) | Cuando MP esté vivo: un POST forjado podría marcar un pago como acreditado → **auto-factura falsa** | 🔴 **Validar la firma antes de activar MP en real.** Bloqueante del go-live de cobros. |
| **Cron `/api/cron/reminders`** | Protegido con `CRON_SECRET`… | …pero **fail-OPEN**: si `CRON_SECRET` no está seteada, `if (secret)` se saltea y el endpoint queda **abierto** | 🟠 Hacer **fail-closed** (sin `CRON_SECRET` → 503) **y** 🔑 verificar que esté seteada en prod. |
| **Home / rutas públicas** | SSR con branding por tenant | Sin freno de tráfico → un flood consume compute de Neon (free) | cubierto por el rate limiting general + monitoreo de Neon (§3). |

### Rate limiting — propuesta (🔑 requiere decisión)
No hay rate limiter. Opciones costo-conscientes:
- **En Netlify:** reglas de rate limit a nivel edge (si el plan lo incluye) → lo más simple, sin código.
- **En app (middleware):** un limitador **in-memory** por IP en `proxy.ts` para `/admin/login`,
  `/operador/login` y `/public/v1/*`. Barato, sin deps, pero **no comparte estado entre instancias**
  (aceptable para el volumen actual de 1–2 tenants). Un limitador con store externo (Upstash/Redis) es
  el paso siguiente cuando escale.
- **Mínimo imprescindible antes de más clientes:** frenar **fuerza bruta en los dos logins** (ej. 5
  intentos / 15 min por IP). **Propuesto, no implementado acá** (toca `proxy.ts`, archivo del frente
  Plataforma → coordinar para no pisar; queda como follow-up de alta prioridad).

### Otros
- 🔑 **Rotar `NEON_API_KEY`** (quedó en `.env` comentada y pasó por chat) — ya flageado en
  `ESTADO-ACTUAL.md`. Asumir comprometida.
- **Secretos:** no hay hardcodeados (confirmado en el pase previo). Todo por `process.env`.
- **Email OWNER de Magra provisional** (`dueno@magra.com.ar`) → confirmar el real y rotar la contraseña
  de bootstrap por canal seguro (ya en `ESTADO-ACTUAL.md`).

---

## ✅ CHECKLIST — "Listo para clientes reales"

Marcado: ✅ hecho · 🟡 implementado, falta correr/activar · 🔑 **acción del dueño** · 🔴 bloqueante.

### Ya cubierto
- ✅ **RLS activo y enforced** en prod (`app_rls`), aislamiento verificado (CH ↔ Magra).
- ✅ **Gate de regresión de aislamiento** automatizable (`npm run gates` → tsc + tests + RLS coverage, 🟢).
- ✅ **Error boundary global** (`global-error.tsx`) — sin pantalla en blanco / stack al cliente.
- ✅ **Script de prueba de carga** (`npm run load-test`) con guardas anti-prod.
- ✅ **Health check** liveness (`/api/health`) apto para uptime monitor.
- ✅ **Pre-deploy drift check** (`npm run predeploy-check`) — atrapa migraciones sin aplicar antes de deploy.
- ✅ **Runbooks** de staging, rollback (app + DB) y go-live documentados.

### Antes de escalar a más clientes (prioridad)
- 🔴 **Rate limiting en los dos logins** (`/admin`, `/operador`) — anti fuerza bruta. *(follow-up, toca `proxy.ts`)*
- 🔴 **Validar firma del webhook de MP** antes de activar cobros online reales. *(bloquea go-live de pagos)*
- 🟠 **Cron reminders fail-closed** + 🔑 confirmar `CRON_SECRET` en prod.
- 🟡 **Correr la 1ª prueba de carga real** (local build nativo o staging) y registrar el techo acá.
- 🟡 **Timeouts en llamadas externas** (MP/WhatsApp/ARCA) — evitar cuelgues que agoten conexiones.
- 🟡 **CI**: cablear `npm run gates` en GitHub Actions (gate obligatorio, no manual).

### Acción del dueño (infra / cuentas)
- 🔑 **Plan pago de Neon** → PITR real (7–30 días) + branch de staging persistente + más compute. *(palanca #1)*
- 🔑 **Monitor de uptime** (UptimeRobot free → Telegram) sobre `/api/health`. *(mínimo, gratis)*
- 🔑 **Alertas de uso de Neon** (compute/storage/horas) en el Console.
- 🔑 **Backups `pg_dump` periódicos** a almacenamiento externo (mitigación mientras el plan sea free).
- 🔑 **Verificar secretos en prod**: `OPERATOR_PASSWORD`, `OPERATOR_SECRET`, `CRON_SECRET`, webhook secret de MP.
- 🔑 **Rotar `NEON_API_KEY`** (asumida comprometida).
- 🔑 **Email real del OWNER de Magra** + rotar contraseña de bootstrap.

---

## Apéndice — comandos rápidos de la Célula

```
npm run gates              # vallas pre-push: tsc + tests + regresión de aislamiento RLS
npm run gate:rls           # solo la valla de aislamiento (estática, sin DB)
npm run load-test          # prueba de carga (local; anti-prod por defecto)
npm run predeploy-check    # drift schema/migraciones vs base destino (antes de deploy)

# Staging (branch de Neon, §1) — ensayo funcional de RLS:
RLS_VERIFY_DATABASE_URL="<branch>" node prisma/rls/verify-rls.mjs
```
