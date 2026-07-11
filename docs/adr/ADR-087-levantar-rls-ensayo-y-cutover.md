---
id: ADR-087
nivel: evolutiva
dominio: [Seguridad, Datos]
depends_on: [ADR-018, ADR-062, ADR-015, ADR-067]
---
# ADR-087: Levantar RLS — ENSAYO (evidencia) y plan de CUTOVER (con el hueco que se cerró)

**Estado:** Aceptado — baja a ejecución la activación de RLS que ADR-018 dejó decidida y ADR-062 fijó como
línea base. Trabajo en la rama **`seguridad/levantar-rls`**; el **ensayo en vivo contra un branch de Neon y el
cutover son actos del dueño** (infra irreversible). **No mergeado** aún.
**Fecha:** 2026-07-11
**Depende de:** ADR-018 (mecanismo y momento de RLS: `SET LOCAL` por tx + rol sin `BYPASSRLS`, gate previo al
2º tenant), ADR-062 (RLS pool shared-schema como línea base no negociable + gaps), ADR-015 (resolución de
tenant fail-closed que RLS refuerza), ADR-067 (Neon plan pago + DR: condición de la fase con datos reales)
**Relacionado:** ADR-086 (el alta del 2º tenant es el disparador del gate), ADR-083 (cutover en prod = acto de
deploy del dueño) · `prisma/rls/` · `docs/runbooks/gate-rls-ensayo-y-cutover-2026-07-11.md`

---

## Contexto

RLS estaba **decidido** (ADR-018) y **cableado** como línea base (ADR-062), con el diferimiento justificado
mientras hubiera **un solo tenant** y la resolución fuese fail-closed (ADR-015). El disparador real es el
**alta del 2º tenant** (crear la 2ª fila en `Tenant` rompe `getCurrentTenantId()` sin RLS). Antes del cutover
en prod hacía falta **ensayar** que el aislamiento efectivamente aísla, y **encontrar los huecos** que sólo
aparecen con RLS *enforced*. Complicación de entorno: la sesión **no** tenía `psql`, `neonctl` ni `NEON_API_KEY`
(`OPERATOR_DATABASE_URL` tampoco; sólo `DATABASE_URL`=prod), así que el ensayo **en vivo contra un branch de
Neon** requiere que el dueño provea la connection string de un branch desechable o un `NEON_API_KEY` temporal.

## Decisión

**Se ensaya RLS con evidencia dura offline, se documenta el hueco encontrado y se fija el plan de cutover con
rollback; el ensayo en vivo y el cutover los ejecuta el dueño.**

1. **Ensayo offline VÁLIDO con PGlite (Postgres real):** PGlite soporta RLS, roles y `set_config`, así que
   corren `verify-wiring.mts`, `verify-async-tenant-isolation.mts` y `verify-rls-offline-pglite.mts`. Evidencia
   obtenida:
   - **Cobertura `check-coverage.mjs` = 41/41** tablas de-tenant (ya no 38).
   - Aislamiento verificado **por ID, por include (relaciones) y por JOIN**; `WITH CHECK` en INSERT/UPDATE;
     **UPDATE cross-tenant** bloqueado; **fail-closed** sin contexto de tenant; y **no-filtrado entre
     conexiones reutilizadas** del patrón pooler (una conexión reciclada no arrastra el contexto de la anterior).
   - Lo único que el offline **NO** reproduce: el **pooler real de Neon (pgbouncer)** → eso es lo que exige el
     ensayo en branch en vivo.
2. **Hueco cerrado (el hallazgo que justifica el ensayo):** el CLI de la fábrica (`provision-tenant.ts`
   `main()`) **conectaba con `DATABASE_URL` (rol de app) en vez del rol owner** → **habría fallado post-cutover**
   (el rol de app sin `BYPASSRLS` no puede sembrar cross-tenant en el alta). El cableado de RLS
   (`rls.ts`/`tenant-context`/`db.ts`/`operator-db` + crons) ya estaba correcto; el hueco real era ese camino de
   alta por CLI. Cerrado.
3. **Plan de cutover con rollback** (runbook `gate-rls-ensayo-y-cutover-2026-07-11.md`): (a) ensayo en branch
   de Neon con el **pooler real**; (b) aplicar `0001` (policies) y `0002_app_role.sql` (fuerza el rol
   `app_user` a **NOBYPASSRLS**, cerrando el gap de ADR-062); (c) verificar `check-rls-live.mjs` **enforced en
   vivo**; (d) **rollback** = revertir las policies/rol si el ensayo falla, sin datos reales de por medio
   (se ensaya en branch, no en prod).

> **En una línea:** *el offline con PGlite prueba el aislamiento con evidencia dura y destapó el hueco del alta
> por CLI; lo que falta es el ensayo con el pooler real de Neon y el cutover — actos del dueño.*

## Consecuencias

- **(+)** El cutover deja de ser un salto a ciegas: hay **evidencia reproducible** del aislamiento y el hueco
  más peligroso (alta por CLI con rol equivocado) **ya está cerrado** antes de tocar prod.
- **(+)** El ensayo offline no cuesta infra ni toca prod (cumple la política de no golpear Neon del plan free).
- **(+)** Desbloquea el **2º tenant** (ADR-086) una vez que el dueño corra el ensayo en vivo + cutover.
- **(−)** **Queda un tramo que sólo el dueño puede correr** (branch de Neon + `check-rls-live` + revocar
  `app_user` `BYPASSRLS`): sin eso, el estado *enforced en vivo* sigue **A CONFIRMAR** (no darlo por hecho).
- **(−)** El offline **no** cubre el comportamiento del **pgbouncer** de Neon → el ensayo en branch es
  indispensable antes del cutover (no se puede saltear con "pasó offline").
- **(−)** Gotchas de entorno Windows anotadas: `psql` ausente → aplicar `.sql` con runner `pg`
  (`apply-sql.mjs`, con guarda anti-prod); `node_modules` por junction deja correr tsx/tsc/tests pero **`next
  build` (Turbopack) rechaza el junction**.

## Alternativas descartadas

- **Cutover directo en prod sin ensayo** (confiando en que "está cableado"). Rechazada: RLS *enforced* cambia
  el comportamiento de cada query; sin ensayo, un policy mal escrito rompe prod o, peor, filtra. El ensayo es
  la red.
- **Dar por válido sólo el ensayo offline y saltar el branch de Neon.** Rechazada: el pooler real (pgbouncer)
  es justo lo que el offline no reproduce, y es donde vive el riesgo de arrastre de contexto entre conexiones.
- **Que el agente cree el branch de Neon / corra el cutover.** No hay credenciales (`neonctl`/`NEON_API_KEY`) y
  es infra irreversible = **Gate del dueño** (ADR-018/067). Rechazada.
- **Adelantar RLS antes del 2º tenant.** Rechazada (ADR-018): con un solo tenant y resolución fail-closed
  (ADR-015) no hay fuga posible; activar antes es tocar el tramo más riesgoso sin necesidad.

— Elaborado por GSG (Seguridad / Datos — ensayo y plan; el ensayo en vivo y el cutover son Gate del dueño)
