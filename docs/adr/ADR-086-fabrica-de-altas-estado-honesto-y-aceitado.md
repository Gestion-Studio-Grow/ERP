---
id: ADR-086
nivel: evolutiva
dominio: [Plataforma, Operaciones]
depends_on: [ADR-074, ADR-065, ADR-019, ADR-041]
---
# ADR-086: Fábrica de altas — estado HONESTO y aceitado (los stubs mentían; ahora los efectos no mienten)

**Estado:** Aceptado — aceita la fábrica de alta sobre la saga de ADR-074 y el core de ADR-019. Trabajo en la
rama **`fase2/aceitar-alta`**; **no mergeado** aún (el SQL de idempotencia sí está en `main`, ver abajo).
**Fecha:** 2026-07-11
**Depende de:** ADR-074 (`provisionTenant` como saga: máquina de estados + compensación), ADR-065 (fábrica de
tenants: provisioning único, dry-run), ADR-019 (core de provisioning: commit transaccional por `slug`),
ADR-041 (los secretos de los efectos externos los pega el dueño)
**Relacionado:** ADR-083 (por qué `ProvisioningRun` NO va en `schema.prisma`: anti schema-ahead), ADR-087
(el gate RLS es el bloqueante duro del 2º tenant), ADR-055 (`edicion→profile` es dato del tenant) ·
`src/lib/provisioning/external-adapters.ts` · `prisma/pending-gate2/ProvisioningRun.sql` ·
`docs/runbooks/alta-tenant-auditoria-y-aceitado-fase2.md`

---

## Contexto

La fábrica de ADR-074 dejó los efectos externos **stubbeados** — correcto para no tocar Vercel/DNS/email sin
credenciales. Pero al auditar el alta end-to-end apareció un problema de **honestidad**: los stubs **mentían**.
El `HostBinder` marcaba el host **asignado** y el `Inviter` la invitación **enviada** sin hacer nada, y la saga
declaraba el alta **ACTIVE**. Un operador leería "listo" cuando **no** se ató el dominio ni se invitó a nadie.
Un estado que miente es peor que un estado incompleto: esconde trabajo pendiente y rompe la confianza en la
consola. Además faltaba **persistir la idempotencia** (un reintento podía duplicar efectos) y **`edicion→
profile`** (deuda de ADR-074).

## Decisión

**El alta reporta el estado real; los efectos externos no mienten.** Se aceita el proceso así:

1. **Efectos externos honestos, gateados por credenciales:** `VercelHostBinder` + `EmailInviter`
   (`external-adapters.ts`) son **reales**, pero **gateados por env** (SEC-1: los secretos los pega el dueño,
   ADR-041):
   - **Sin env → se saltan HONESTO:** devuelven `{bound|sent: false, note}` y **encolan un followup**; el alta
     igual llega a ACTIVE, pero **marcada** con lo que falta. No dice "hecho" lo que no se hizo.
   - **Con env → hacen la llamada real;** un fallo real **compensa** (saga de ADR-074).
   - El puerto ahora devuelve `{bound|sent, note}`, **no `void`** — el resultado del efecto es observable.
2. **Idempotencia persistente:** `ProvisioningRunStore` (`idempotency-store.ts`) usa la tabla `ProvisioningRun`.
   Un reintento no re-ejecuta un alta ya terminada.
3. **Reintento seguro tras fallo:** la saga cachea como **terminal SOLO** un alta **ACTIVE**; un
   `FAILED_COMPENSATED` **se re-ejecuta** (no queda pegado en un estado fallido).
4. **`edicion→Tenant.profile` persistido** (deuda de ADR-074 cerrada): `provisionTenant` acepta
   `platform.profile`; `editionToProfile` (comercio→`lite`, empresa→`enterprise`) corre en el committer
   (coherente con ADR-055: el perfil es dato del tenant).
5. **`ProvisioningRun` NO se agrega a `schema.prisma`** — decisión de diseño **no obvia y deliberada**: se deja
   como **SQL crudo** (`prisma/pending-gate2/ProvisioningRun.sql`) + un store que **degrada a in-memory** si la
   tabla no existe (catch `42P01` → fallback). **Motivo:** evitar el estado *schema-ahead-of-DB* que rompió CH
   en prod (2026-07-09) — como `main` auto-deploya (ADR-083), un modelo Prisma nuevo generaría un client que
   consulta una tabla inexistente. Con el store fail-safe, **aplicar o no la migración es inocuo**; aplicarla es
   Gate 2 (`psql -f prisma/pending-gate2/ProvisioningRun.sql`).

> **En una línea:** *el alta dice la verdad — lo que no se pudo hacer (sin credenciales) queda marcado como
> followup, no disfrazado de "hecho"; y la persistencia de la saga entra sin adelantarse a la DB.*

## Consecuencias

- **(+)** **Estado confiable:** la consola muestra lo que realmente pasó; el operador sabe qué falta (host/
  invitación) en vez de creer que está listo.
- **(+)** **Reanudable e idempotente de verdad:** reintentos seguros, sin duplicar efectos ni quedar pegado en
  fallo.
- **(+)** **No repite el incidente CH:** la persistencia de la saga es *fail-safe* ante schema viejo (ADR-083).
- **(+)** Cierra dos deudas de ADR-074 (`edicion→profile` + idempotencia persistente).
- **(−)** El patrón "SQL crudo + fallback in-memory" es **menos ergonómico** que un modelo Prisma (sin tipos
  generados, queries a mano) — es el precio de no adelantarse a la DB. Deuda anotada: promover a modelo cuando
  se unifique la disciplina de migraciones.
- **(−)** Los efectos "saltados honestos" **dejan followups** que alguien debe cerrar (atar host, reenviar
  invitación) cuando lleguen las credenciales — trabajo real diferido, ahora **visible** en vez de oculto.

## Estado

- **En `main`:** `prisma/pending-gate2/ProvisioningRun.sql` (la migración, sin aplicar — Gate 2).
- **En rama `fase2/aceitar-alta` (no mergeada):** `external-adapters.ts` + tests, `editionToProfile`, store de
  idempotencia, y los runbooks `alta-tenant-auditoria-y-aceitado-fase2.md` + `levantar-gate-rls-2do-tenant.md`.
- **Bloqueante duro para un cliente real nuevo:** el **gate RLS** (ADR-087) sigue siendo el freno del 2º tenant.

## Alternativas descartadas

- **Dejar los stubs que "marcan hecho".** Rechazada de raíz: un estado que miente es la peor falla de una
  consola de operación. Honestidad > comodidad.
- **Agregar `ProvisioningRun` a `schema.prisma`** (lo natural). Rechazada **a propósito**: `main` auto-deploya
  (ADR-083) → un modelo sin su tabla aplicada rompería prod como en CH. El SQL crudo + fallback lo evita.
- **Bloquear el alta si faltan credenciales de host/email.** Rechazada: el alta del tenant (DB + OWNER +
  catálogo) tiene valor sin el dominio/invitación; esos efectos se difieren como followup honesto, no frenan el
  alta.

— Elaborado por GSG (Plataforma / Operaciones — aceitado del alta; aplicar la migración = Gate 2)
