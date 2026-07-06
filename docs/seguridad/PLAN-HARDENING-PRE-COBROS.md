# 🛡️ Plan priorizado de hardening — antes de cobros online

**Autor:** Célula de Seguridad (Opus, alto juicio) · **Fecha:** 2026-07-06
**Base:** `docs/runbooks/hardening-produccion.md` (Célula 2) + `docs/ESTADO-ACTUAL.md` + pase
`docs/seguridad/PASE-SEGURIDAD-2026-07-05.md`.
**Objetivo:** dejar el ERP seguro para **operar con datos reales y cobrar online**.

El foco de "cobros" agrega superficie nueva: **el webhook de Mercado Pago mueve plata** (dispara
auto-factura y marca pagos), y **la API pública de ingesta** crea pedidos con valor económico. La barra
de seguridad sube respecto de un ERP solo-lectura.

---

## Estado de seguridad relevado (foto 2026-07-06)

| Superficie | Estado | Veredicto |
|---|---|---|
| **RLS (aislamiento por tenant)** | Activo y enforced en prod (`app_rls`, NOBYPASSRLS); gate estático `npm run gate:rls` en cada cambio | ✅ candado puesto; mantener verde |
| **Rate limiting — logins** | `src/lib/rate-limit.ts`, 5 fallos/15min por IP en `/admin` y `/operador` | ✅ ya cerrado |
| **Rate limiting — API pública `/public/v1/*`** | **Aplicado esta sesión** (60 req/min por IP, 429 + Retry-After) | ✅ **cerrado esta sesión** |
| **Webhook Mercado Pago** | Firma HMAC-SHA256 validada, fail-closed (sin secreto → 503, firma mala → 401) antes de tocar DB | ✅ código listo; falta `MP_WEBHOOK_SECRET` en prod |
| **Cron `/api/cron/reminders`** | **Era fail-OPEN** (sin `CRON_SECRET` quedaba abierto) → **ahora fail-closed** (503) | ✅ **cerrado esta sesión** |
| **Auth API pública** | api-key por tenant, timing-safe, fail-closed | ✅ sólido |
| **Auth operador / admin** | HMAC edge-safe, cookie firmada, timing-safe | ✅ sólido; verificar secretos en prod |
| **Secretos expuestos** | `NEON_API_KEY` + password `app_rls` comprometidas | 🔴 **rotar** (runbook aparte) |
| **Timeouts a APIs externas** (MP/WhatsApp/ARCA) | Sin `AbortController` → una API lenta cuelga el request | 🟡 pendiente (reliability) |

---

## Lo aplicado esta sesión (seguro, cubierto por tests, sin tocar prod)

1. **Cron reminders → fail-CLOSED.** `src/lib/cron-auth.ts` (`authorizeCron`, puro y testeado):
   sin `CRON_SECRET` → **503** (no ejecuta); con secreto, exige el bearer exacto en **tiempo constante**
   → 401 si no coincide. Cableado en `src/app/api/cron/reminders/route.ts`. Cierra el endpoint que un
   atacante podía disparar a voluntad (spam de recordatorios, quema de compute de Neon).
   Tests: `src/lib/cron-auth.test.ts` (6 casos).

2. **Rate limiting en la API pública `/public/v1/*` → anti-flood.** Extensión de `src/lib/rate-limit.ts`
   (`PUBLIC_API_RULE` 60 req/min por IP, `publicApiKey`, `clientIpFromRequest`, `checkPublicApiRate`),
   cableado en `POST /orders` y `GET /orders/{code}` → **429 con `Retry-After`** al superar el límite.
   Protege la superficie con valor económico contra flood que quemaría compute de Neon (free tier).
   Tests: `src/lib/rate-limit.test.ts` (+7 casos).

**Verificación:** `tsc` 🟢 · tests nuevos 🟢 (18/18) · `npm run gates` → tsc/test/rls-coverage/build 🟢
(lint 🔴 preexistente en archivos de OTRAS sesiones, ninguno tocado por Seguridad) · aditivo,
**sin schema/migración, sin tocar prod**.

> **Nota de integración (árbol compartido):** el **helper de rate-limit + tests + el cron fail-closed +
> estos docs** se commitean por pathspec en esta sesión. El **cableado del rate-limit en los 2 routes
> públicos** quedó *entrelazado* con un refactor en vuelo de otra sesión (eliminación del módulo
> `request-context`), así que NO se commitea acá para no arrastrar trabajo ajeno: el cableado ya vive en
> el árbol compartido y referencia el helper que sí se sube, por lo que aterriza en `main` junto con ese
> refactor. La protección es efectiva en runtime en cuanto ese commit entre.

---

## Prioridad 1 — BLOQUEANTE antes de activar cobros (🔑 acción del dueño)

Sin esto no se habilita Mercado Pago real:

1. **Rotar los secretos comprometidos** — `NEON_API_KEY` + password de `app_rls`. Procedimiento en
   `docs/seguridad/RUNBOOK-ROTACION-SECRETOS.md`. Asumirlos comprometidos = tratarlos como filtrados.
2. **`MP_WEBHOOK_SECRET` en prod** — el webhook lo exige fail-closed con invoicing ON. Sin él, MP no se
   puede activar (el webhook responde 503). Va a env var, **nunca a un campo**.
3. **Verificar secretos de auth en prod** — `OPERATOR_PASSWORD`, `OPERATOR_SECRET`, `CRON_SECRET`
   seteados (el cron ahora depende de `CRON_SECRET` para funcionar).
4. **`EXTERNAL_ORDERS_API_KEY[S]`** por tenant que use ingesta externa (sin ella la API responde 503).

## Prioridad 2 — Fuerte recomendación antes de escalar tráfico/plata

5. **Timeouts en llamadas externas** (MP / WhatsApp / ARCA SOAP) — envolver `fetch` con
   `AbortController` (~8s) para que una API externa lenta no cuelgue el request ni agote conexiones a
   Neon. *Follow-up de la célula de Reliability* (toca `src/plugins/pagos`, `wa-*`, `arca` — árbol
   compartido, coordinar por pathspec). No se aplicó acá para no colisionar con esas sesiones.
6. **Idempotencia del webhook MP** — asegurar que un reenvío del mismo evento (MP reintenta) no
   duplique factura/pago. Verificar que el `OutboxEvent`/dedupe cubra el `id` de pago de MP.
7. **CI real** — cablear `npm run gates` en un GitHub Action `on: [push, pull_request]` (propuesta lista
   en `hardening-produccion.md` §6) → el gate de aislamiento deja de depender de disciplina manual.

## Prioridad 3 — Infra / respaldo (🔑 acción del dueño, palanca de plan Neon)

8. **Plan pago de Neon** — PITR real (7–30 días) para poder recuperar un borrado/UPDATE malo de datos
   reales (con plata de por medio, imprescindible). Habilita además staging persistente.
9. **`pg_dump` cifrado periódico** fuera de Neon — mitigación mientras el plan sea free.
10. **Monitor de uptime + alertas** — UptimeRobot (free) → Telegram sobre `/api/health`; alertas de uso
    de Neon. Mínimo para enterarse de una caída con clientes cobrando.

---

## Fuera de alcance de esta sesión (y por qué)

- **Rotación efectiva de secretos y set en Netlify** → los carga el dueño (regla dura: ningún secreto en
  chat/campo/repo). Entregado el runbook.
- **Timeouts en adapters externos / idempotencia webhook** → tocan módulos de otras células (pagos/arca/
  wa) sobre árbol compartido; se dejan como recomendación priorizada para evitar commit-race y respetar
  el dueño de cada frente.
- **Deploy / migraciones / cualquier cosa contra Neon** → Gate 1/Gate 2, requieren OK explícito.
