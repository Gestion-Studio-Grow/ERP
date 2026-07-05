# ADR-023 — Check de performance multi-tenant y restricciones de free plan

**Estado:** aceptado (decisiones). Implementación diferida a `/sesion-feature` según el orden de ataque de §4.
**Fecha:** 2026-07-04
**Contexto de sesión:** `/sesion-arquitectura`. **No implementa código** — la salida es este ADR. Los fixes se ejecutan después, cada uno con su verificación.

## Contexto

Check de calidad de la arquitectura multi-tenant con foco en escalar. Hecho **100% estático** (lectura de `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/*`, ADRs) — **cero queries contra la DB de producción**, por la restricción de free plan de Neon (ver `docs/FUNDAMENTOS-Y-VISION.md` §5).

**Tesis del check:** los cimientos de datos están bien puestos —`tenantId` en toda tabla de negocio, índices calientes que lideran con `tenantId` (`[tenantId, startsAt]`, `[tenantId, status, createdAt]`, `[tenantId, createdAt]`), soft-delete, precio congelado, payouts idempotentes—. El problema **no es el schema**: es (a) un desfasaje entre cómo está indexado y cómo consultan las queries, invisible con 1 tenant y pocos datos pero determinante a escala; (b) una promesa de ADR-004 que el código no cumple; y (c) el free plan como techo real del piloto, con el storage como primer límite.

Dos capas de decisión: **Capa 1 — fixes scale-ready (F1–F5)**, independientes del plan; **Capa 2 — restricciones del free plan (F6–F8)**, marco de hasta dónde llega el piloto.

---

## CAPA 1 — Fixes scale-ready

### F1 — CRÍTICO (escala) · Índices compuestos multi-tenant sin usar: las queries no filtran por `tenantId`

**Problema:** el schema indexó liderando con `tenantId`, pero `getAgendaDay` (`actions.ts:774`), `getDashboardData` (`:808`) y `getReportData` (`:614`) filtran por fecha/estado **sin `tenantId` en el WHERE`. Postgres no hace skip-scan → el índice compuesto queda inservible y, apenas crezcan las filas o entre el 2º tenant, esas queries degradan a **seq scan**. No hay índice por `startsAt` ni por `status` sueltos que las salve.

**Alternativas:**
1. Threadear `tenantId` en cada WHERE de las ~90 Server Actions. Explícito y barato, pero es disciplina manual repartida — fácil de olvidar en la próxima feature (así nacieron estas queries).
2. **Activar RLS (ADR-018): la policy `tenant_id = current_setting('app.current_tenant_id')` inyecta el predicado a nivel motor**, con lo que Postgres pasa a usar los índices que lideran con `tenantId`. Un solo lugar, imposible de olvidar. Costo: es el tramo más riesgoso (pooling + `SET LOCAL` por transacción), pero ya está diseñado.
3. Índices por columna suelta (`[startsAt]`, `[status]`). Parchea el scan pero no el aislamiento, duplica índices (y en free plan consume storage), y sigue escaneando filas de otros tenants antes de filtrar.

**Decisión + porqué:** **Opción 2, y se reencuadra ADR-018 como palanca de performance además de backstop de aislamiento.** El hallazgo central: la RLS diferida no es solo seguridad postergable — es *la llave que enciende los índices compuestos ya pagados*. Sin ella, a escala, esos índices no rinden. Como puente hasta el día del gate (opción 1), se adopta la convención de un helper `whereForTenant(tid, extra)` para que ninguna action nueva olvide el predicado. Descartada la 3 (no resuelve aislamiento + costo de storage).

**Impacto:** enmienda el *porqué* de **ADR-018** (+performance, no solo aislamiento). Nota en ADR-001. Toca `getAgendaDay`, `getDashboardData`, `getReportData`, `getClients` y el patrón general de `actions.ts`. **No agrega índices** — ya existen; falta que las queries los alcancen.

### F2 — CRÍTICO (correctitud) · Overbooking: ADR-004 promete `EXCLUDE USING GIST`, el código usa check-then-insert

**Problema:** ADR-004 dice "overbooking se previene con `EXCLUDE USING GIST`, no con lógica de aplicación". **Grep sobre todas las migraciones: cero GIST/EXCLUDE.** Se previene en app (`assertSlotAvailable`, `booking-core.ts:53`) leyendo conflictos y luego insertando, en una transacción en **ReadCommitted** (no hay `isolationLevel: Serializable` en el repo). Es una carrera TOCTOU: dos reservas simultáneas del mismo hueco leen ambas "libre" y ambas insertan → doble turno. No requiere escala: pasa hoy, con 1 tenant y 2 operadores concurrentes (o cliente web + recepción).

**Alternativas:**
1. Implementar el `EXCLUDE USING GIST` que ADR-004 ya decidió (requiere `btree_gist` para combinar `tenantId`/`professionalId`/`boxId` con `tstzrange`). Atómico, imposible de saltear. Contra: no expresable en Prisma → migración SQL a mano; el buffer de limpieza obliga a materializar el rango `[startsAt-buffer, endsAt+buffer]`; el índice GiST consume storage (relevante en free plan).
2. Subir las transacciones de reserva a `Serializable`. Una línea por transacción; Postgres aborta una de las dos con error de serialización → reintento. Contra: hay que manejar el retry; degrada a alta concurrencia de escritura — irrelevante al volumen de un salón.
3. Dejar como está. No: bug latente de doble-reserva + divergencia silenciosa del ADR.

**Decisión + porqué:** **corto plazo opción 2** (Serializable en las 3 transacciones de reserva: `actions.ts:191` y `:516`, `waitlist-actions.ts:222`) — cierra la carrera hoy, costo mínimo dado el volumen real, **sin consumir storage** (encaja en free plan). **Mediano plazo opción 1** cuando se toque el schema y haya plan pago. Lo innegociable: **reconciliar ADR-004 con la realidad** — o el código cumple el ADR, o el ADR se corrige. Hoy uno miente sobre el otro.

**Impacto:** **enmienda ADR-004** (reconciliación obligatoria: describir check-then-insert + Serializable como mecanismo Fase 1, con GIST como objetivo a plan pago). Toca `booking-core.ts`, las 3 transacciones citadas.

### F3 — ALTO · `getReportData` trae todo el histórico de pagos y agrega en JS

**Problema:** `actions.ts:614` hace `payment.findMany({status: APPROVED})` **sin rango de fecha ni `tenantId`**, con `include` de appointment→professional→service, y agrupa por día/prof/servicio con `Map` en Node. Carga en memoria *todos los pagos aprobados de la historia* en cada visita a Reportes. Sin réplica de lectura (free plan), se paga en el mismo compute chico.

**Alternativas:** (1) `prisma.payment.groupBy` con `_sum` y `where: { tenantId, status, createdAt: {gte,lte} }` + rango obligatorio (default 30/90 días); (2) SQL crudo con `date_trunc` en la zona del negocio; (3) vista materializada (prematuro).

**Decisión + porqué:** **opción 1** — mueve la agregación al motor y usa el índice apenas F1 aporte el `tenantId`. *Sin verificar:* el `groupBy` de Prisma no agrupa por relación anidada (`professional.name`) en una sola pasada; puede requerir agrupar por `professionalId` y resolver nombres aparte, o caer a SQL crudo (opción 2). Se decide en la implementación.

**Impacto:** reescribe `getReportData`. Puede motivar un índice `[tenantId, status, createdAt]` en `Payment` (hoy solo `@@index([tenantId])`) — evaluar contra el costo de storage al implementar.

### F4 — MEDIO · N+1 en el chequeo de recursos dentro de la transacción de reserva

**Problema:** `assertSlotAvailable` (`booking-core.ts:95`) hace un `appointment.findMany` **por cada recurso** del servicio, con filtro por relación anidada, **dentro** de la transacción de alta → k queries + k round-trips al pooler manteniendo la conexión/transacción abierta. En transaction-mode pooling, transacciones largas bajan el throughput. Hoy k es 1-2; el costo es la conexión retenida.

**Decisión:** una sola query con `resourceId: { in: [...] }` + suma por recurso en memoria — replica el patrón que la ruta de lectura (`getAvailableSlots:79`) ya resolvió bien. Achica la ventana transaccional. **Impacto:** `booking-core.ts`. Implementación, sin enmienda de ADR.

### F5 — MEDIO · `getClients` sobre-trae turnos para contar

**Problema:** `actions.ts:732` incluye `appointments: { select: { id }}` de cada cliente → trae todos los ids de turnos de todos los clientes en la lista.

**Decisión:** `include: { _count: { select: { appointments: true }}}` — el count lo hace la DB. **Impacto:** `actions.ts`. Implementación, sin enmienda de ADR.

---

## CAPA 2 — Restricciones del free plan (marco de escalado)

> Números aproximados **a verificar contra el plan vigente** de Neon: ~0.5 GB storage, compute chico (~0.25 vCPU) con autosuspend/scale-to-zero, sin réplicas, conexiones directas limitadas.

### F6 — MEDIO · Connection pooling: fijar `connection_limit` BAJO y validar RLS sobre el pooler

**Problema:** `DATABASE_URL` apunta al pooler de Neon (correcto), driver `@prisma/adapter-pg`, pero **`connection_limit` no está fijado** → `PrismaPg` levanta un Pool con default (max 10) por instancia serverless. En free plan el compute chico tiene pocos backends reales; muchas conexiones lo saturan.

**Decisión + porqué:** en free plan `connection_limit` va **bajo** (ej. 3-5 por instancia), no alto — la intuición "subir el pool para más throughput" es contraproducente acá (el límite duro es el compute, no el pooler que multiplexa). Además, sumar al checklist de RLS (ADR-018) verificar, en branch de Neon, el comportamiento de **prepared statements + `SET LOCAL` sobre pgbouncer en transaction mode** (el `SET LOCAL` por transacción es compatible con transaction-mode pooling — eso está bien elegido en ADR-018; falta confirmarlo en la práctica). **Impacto:** `.env` (`connection_limit`), enmienda al checklist de **ADR-018**, nota de pooling en ADR-005.

### F7 — BAJO / no-acción justificada · `getCurrentTenantId` sin cache

**Problema:** cada request hace `tenant.findMany({take:2})` sin cache (`src/lib/tenant.ts`, a propósito por ADR-015).

**Decisión: no tocar.** Es correcto — el assert fail-closed vale el round-trip mientras RLS esté off, y el autosuspend/cold start del free plan hace que ese query sea ruido de fondo frente al arranque del compute. Se **autoliquida** con ADR-018: el día del 2º tenant, el `tenantId` pasa a venir del contexto de request (sesión/subdominio) y este query desaparece. **Impacto:** ninguno. Se documenta para que una sesión futura no lo "optimice" sin entender el porqué.

### F8 — MEDIO (free plan) · `AuditLog` append-only vs. 0.5 GB de storage

**Problema:** `AuditLog` (`schema.prisma:497`, ADR-009 §4) es append-only y **sin retención**. Junto con `Payment`, es el candidato #1 a agotar los ~0.5 GB del free plan. Cuando el storage se llena, la DB deja de aceptar escrituras → se cae la operación, no solo los reportes. En un ERP con audit desde Fase 1, el **storage cap llega antes** que cualquier problema de performance de query.

**Alternativas:** (1) retención por ventana (agregar/borrar audit > N meses); (2) archivado a R2 (ADR-005 ya lo contempla) por job periódico, dejando en Postgres solo lo caliente; (3) nada hasta migrar a plan pago.

**Decisión + porqué:** para Fase 1 / free plan, **opción 1 con ventana holgada** (audit detallado ~12-18 meses) **+ monitoreo del % de storage como métrica de gate a plan pago**. El archivado a R2 (opción 2) es la respuesta a escala pero es sobre-ingeniería con un tenant. Lo crítico es *tener el número*: el free plan convierte "storage" en un límite operativo duro. *Sin verificar:* no se midió el tamaño actual de la DB (no se toca prod) — leer del dashboard de Neon, no por query. **Impacto:** enmienda **ADR-009** (política de retención del audit, hoy ausente) y **ADR-007** (el gate a plan pago no es solo compute/réplicas: el **storage** puede llegar primero — eje que ADR-007 no modela).

---

## §4 — Orden de ataque (para `docs/PROXIMOS-PASOS.md`)

| # | Hallazgo | Severidad | Costo | Gatillo | Tipo de sesión |
|---|---|---|---|---|---|
| F2 | Overbooking TOCTOU (ADR-004 incumplido) | 🔴 correctitud | bajo (Serializable) | **ya** — no espera escala | `/sesion-feature` |
| F1 | Índices multi-tenant muertos sin `tenantId` | 🔴 escala | medio | acoplado a RLS (ADR-018) | `/sesion-feature` (RLS) |
| F3 | Reportes agrega todo el histórico en JS | 🟠 | bajo-medio | antes de crecer datos | `/sesion-feature` |
| F4/F5 | N+1 recursos / over-fetch clientes | 🟡 | bajo | oportunista | `/sesion-feature` |
| F6 | Pooling sin límite explícito | 🟡 | bajo | checklist de RLS | con ADR-018 |
| F8 | `AuditLog` vs storage 0.5 GB | 🟡 | bajo | vigilar % storage | `/sesion-feature` |
| F7 | tenant sin cache | 🟢 | — | se autoliquida | no-acción |

## Conclusión de arquitecto

Dos ideas para llevarse:

1. **F1 y la RLS diferida son el mismo trabajo.** Hoy el proyecto trata RLS como "seguridad postergable porque hay un solo tenant". Cierto para el leak, pero **la performance a escala también está esperando esa RLS**: sin ella, los índices ya pagados no rinden. Eso sube ADR-018 de "gate del 2º tenant" a "también palanca de performance".
2. **F2 es independiente y urgente:** un bug de doble-reserva que existe hoy, con un tenant, y una divergencia silenciosa de ADR-004. Se cierra barato (Serializable) sin tocar storage.

Y el marco honesto (Capa 2): nada de esto hace escalar en Neon free — el free plan es techo de piloto, con el **storage** como primer límite duro (F8). El objetivo del trabajo de performance en esta etapa **no** es aguantar escala en free, es quedar **scale-ready a costo cero** para el día de migrar a plan pago / RDS (ADR-005, ADR-007).

## Enmiendas que dispara este ADR

- **ADR-004:** reconciliar (check-then-insert + Serializable como Fase 1; GIST a plan pago).
- **ADR-018:** ampliar el *porqué* (performance, no solo aislamiento) + checklist de pooling/prepared statements (F6).
- **ADR-009:** política de retención de `AuditLog` (F8).
- **ADR-007:** agregar el eje **storage** al gate de migración a plan pago (F8).
