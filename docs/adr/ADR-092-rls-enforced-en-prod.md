---
id: ADR-092
nivel: fundacional
dominio: seguridad
depends_on: [ADR-062, ADR-018, ADR-001]
---

# ADR-092 — RLS está enforced en producción (corrige la creencia anterior) + gate del 2º tenant CUMPLIDO

**Estado:** Aceptada (evidencia de terreno 2026-07-12) · **Depende de:** ADR-062 (RLS pool shared-schema como línea base), ADR-018 (activación de RLS · gate del 2º tenant), ADR-001 (multi-tenant) · **Corrige:** el estado "enforced en vivo A CONFIRMAR" de `ESTADO-ACTUAL.md` / `ESTADO-Y-ROADMAP.md`.

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

El estado anterior (07-10) marcaba RLS como **"cableado, enforced en vivo A CONFIRMAR"** — cobertura estática de 38 tablas, pero sin prueba de que la base rechazara de verdad el cruce de tenants. El gate del 2º tenant (ADR-018) figuraba abierto, lo que **bloqueaba dar de alta clientes**.

**Verificado 2026-07-12 contra prod (Neon):**
- **Flag de enforcement ON.**
- **43/43 tablas con `tenantId`** cubiertas por la policy `tenant_isolation` (`prisma/rls/0001_enable_rls.sql`) — **0 sin cubrir**. Subió de 38 a 43 al incorporarse tablas nuevas (fiscal por tenant, cartera de cliente, etc.), cada una con su policy en el mismo release.
- **El runtime usa el rol `app_rls`, que es `NOBYPASSRLS`.** No evade el aislamiento.
- El gate `isRlsActive` (en `provisionTenant`, con centinelas sobre `Appointment` + `Client`) **mide bien y YA pasa en prod**.

## Decisión

1. **Declarar RLS enforced en producción.** Corrige toda mención de "A CONFIRMAR": la base **aísla de verdad** (flag on + 43/43 policies + runtime `app_rls` `NOBYPASSRLS`).
2. **El gate del 2º tenant (ADR-018) está CUMPLIDO** → **el alta de clientes está desbloqueada** (candado abierto). El chequeo `isRlsActive` es el que lo certifica y ya pasa.
3. **Toda tabla nueva con `tenantId` agrega su policy en el MISMO release** (o el `check-coverage.mjs` falla). Es condición dura para cualquier migración — incluye al rediseño del core.

## Consecuencias

**Habilita:** dar de alta clientes reales sin la barrera del 2º tenant; construir sobre RLS con confianza (es la red de seguridad, no una promesa).

**A-3 latente (no fuga viva):** varios **loaders `/admin` no filtran por `tenantId` de forma explícita**. Hoy **RLS los cubre** (la policy inyecta el predicado), así que **no hay fuga**, pero son **latentes**: si algún día se corriera con un rol con BYPASSRLS o se desactivara RLS, filtrarían. Al reescribir loaders, **agregar el predicado `tenantId` explícito** (defensa en profundidad).

**Footgun conocido:** el `.env` local de desarrollo usa el **rol owner contra la base de PROD**. Cuidado con correr scripts que escriban. Y el rol legacy **`app_user` (BYPASSRLS) NUNCA** debe usarse como `DATABASE_URL` (revocarlo sigue pendiente, pre-cobros — ADR-062 gap).

— Elaborado por GSG · 2026-07-12
