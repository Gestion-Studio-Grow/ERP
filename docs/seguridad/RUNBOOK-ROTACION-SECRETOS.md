# 🔐 Runbook — Rotación de secretos (acción del dueño)

**Autor:** Célula de Seguridad (Opus) · **Fecha:** 2026-07-06
**Regla dura:** ningún secreto vive en el repo, en el chat, ni en un campo de la app. Todos se cargan
como **variables de entorno** (`.env` local / **Netlify → Site settings → Environment variables**) y los
**carga el dueño**. Este runbook es el *procedimiento*; los valores nunca salen acá.

> **Por qué ahora:** dos secretos quedaron **expuestos** y deben tratarse como **comprometidos**:
> `NEON_API_KEY` (pasó por el chat, quedó comentada en `.env`) y la **password de `app_rls`** (rol de
> app con acceso a la DB de prod). Rotarlos es **pre-requisito de cobros online**.

---

## Regla de oro del orden (no invertir)

**Deploy del código ANTES de rotar el secreto de conexión** (`DATABASE_URL` / rol de DB). Invertir el
orden cierra el candado sobre código que todavía no lo entiende → CH deja de ver sus datos. El rollback
de un cambio de secreto es *volver a poner el valor anterior + republicar* (ver `hardening-produccion.md` §4).

---

## 1. `NEON_API_KEY` — asumida comprometida 🔴

La API key del proyecto Neon permite crear/borrar branches y leer metadata del proyecto. **No** es la
`DATABASE_URL` (esa es la credencial de conexión); es la key de la **API de management** de Neon.

1. **Neon Console → Account settings → API keys** → localizar la key actual → **Revoke**.
2. **Create new API key** → copiarla **una sola vez** (Neon no la vuelve a mostrar).
3. Cargarla donde se use la automatización de branches (máquina del dueño / CI), **como env var**
   `NEON_API_KEY`. **No** committear, **no** pegar en el chat, **no** dejar comentada en `.env`.
4. Quitar la línea comentada de `NEON_API_KEY` del `.env` local (higiene — el `.env` no se versiona,
   pero no debe conservar el valor viejo ni de referencia).
5. Verificar: la key vieja revocada debe fallar (401) contra la API de Neon; la nueva, funcionar.

> **Impacto de rotarla:** ninguno sobre la app en runtime (la app conecta por `DATABASE_URL`, no por la
> API key). Es seguro rotarla en cualquier momento, sin deploy.

---

## 2. Password de `app_rls` — rol de DB de la app 🔴

`app_rls` es el rol **NOBYPASSRLS** con el que corre la app en prod (aísla por tenant vía RLS). Su
password viaja dentro de `DATABASE_URL`. Rotar la password = rotar `DATABASE_URL`.

1. **Neon Console → Roles → `app_rls` → Reset password** (o `ALTER ROLE app_rls WITH PASSWORD '<nuevo>'`
   conectado como `neondb_owner`). Generar una password fuerte y única.
2. Construir el nuevo `DATABASE_URL` con la plantilla (host/pooler igual, solo cambia la password):
   `postgresql://app_rls:<NUEVA_PASSWORD>@ep-little-credit-act3cxpe-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
3. **Netlify → Environment variables → `DATABASE_URL`** → pegar el nuevo valor.
4. **Re-deploy** (Gate 1, decisión del dueño) para que la app tome el nuevo secreto.
5. Verificar `GET /api/health` OK + smoke de CH y Magra (login + una lectura por tenant). Confirmar que
   el **aislamiento sigue verde** (ctx=CH no ve Magra) — si hay branch de staging, correr
   `node prisma/rls/verify-rls.mjs` ahí primero.
6. La sesión con la password vieja queda inválida al reciclar conexiones; forzar re-deploy la corta ya.

> **`OPERATOR_DATABASE_URL`** (rol `neondb_owner`, para migraciones) es un secreto aparte. Rotar su
> password **solo si también se considera expuesta**; mismo procedimiento, va a la env var
> `OPERATOR_DATABASE_URL`. No se usa en el path de request normal.

---

## 3. Secretos a **verificar seteados** antes de cobros (no necesariamente rotar)

Cargados como env var en prod (Netlify). Fail-closed: sin ellos, la superficie que protegen responde cerrada.

| Secreto | Qué protege | Estado esperado en prod |
|---|---|---|
| `OPERATOR_PASSWORD` | Login del operador | Seteada y fuerte (sin ella, dev acepta `"operador"`; prod la exige) |
| `OPERATOR_SECRET` | Firma de la cookie de operador | Seteada, distinta del secreto de admin |
| `CRON_SECRET` | Endpoint `/api/cron/reminders` | Seteada — **ahora fail-closed**: sin ella el cron responde 503 (no corre) |
| `MP_WEBHOOK_SECRET` | Firma del webhook de Mercado Pago | Setear **al activar MP real** (con invoicing ON y sin ella → webhook 503) |
| `EXTERNAL_ORDERS_API_KEY[S]` | API pública de ingesta `/public/v1/*` | Setear por tenant que use ingesta externa (sin ella → 503, cerrado) |

> Todos son **fail-closed**: la ausencia rechaza, no abre. Verificar presencia ≠ ver el valor: alcanza con
> que la env var exista en Netlify.

---

## 4. Checklist de cierre

- [ ] `NEON_API_KEY` vieja **revocada**, nueva cargada como env var, línea vieja borrada del `.env`.
- [ ] Password de `app_rls` rotada → `DATABASE_URL` actualizada en Netlify → re-deploy → health + smoke OK.
- [ ] Aislamiento por tenant verde tras la rotación (CH ↔ Magra).
- [ ] `OPERATOR_PASSWORD`, `OPERATOR_SECRET`, `CRON_SECRET` verificadas en prod.
- [ ] `MP_WEBHOOK_SECRET` y `EXTERNAL_ORDERS_API_KEY[S]` seteadas antes de activar cobros / ingesta.
- [ ] Contraseña de bootstrap del OWNER de Magra rotada por canal seguro + email real confirmado.
