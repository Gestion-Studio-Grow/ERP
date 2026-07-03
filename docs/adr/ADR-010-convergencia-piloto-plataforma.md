# ADR-010: Convergencia del piloto Beauty & Spa hacia la plataforma de los ADR

**Estado:** Aceptado — **Camino A confirmado** (2026-07-02)
**Fecha:** 2026-07-02
**Depende de:** ADR-001 a 009 + AMENDMENTS
**Contexto:** El piloto "Beauty & Spa" (Carolina Haponiuk) ya está construido, desplegado en Netlify y con un cliente real usándolo. Decisión de negocio tomada: **este piloto ES la Fase 1 del blueprint "Servicios" y debe evolucionar hacia las decisiones de los ADR, no descartarse.** Este ADR mide la brecha entre lo construido y lo decidido, y la secuencia para cerrarla sin reescribir de más.

---

## 1. Verdad incómoda de entrada

El piloto se construyó **antes** de que existieran estos ADR, con criterio de "producto funcionando rápido para un cliente real". Eso significa que hoy **contradice dos de las reglas más enfáticas de los ADR**:

- **ADR-001, regla 1:** *"Toda tabla de negocio lleva `tenant_id` desde la primera migración. No es opcional, no se agrega después."* → El piloto es **mono-tenant**. Ninguna tabla tiene `tenant_id`. Es la regla que el ADR marca como la más cara de diferir, y es exactamente la que está incumplida.
- **ADR-004:** rechaza explícitamente la *"Alternativa A (validar en el código antes de insertar)"* por race condition, y recomienda `EXCLUDE USING GIST`. → El piloto previene overbooking **con una transacción a nivel de aplicación** — o sea, es literalmente la Alternativa A que el ADR descarta.

No es un fracaso: el piloto cumplió su objetivo (validar que un cliente real usa el producto — la métrica de éxito del ADR-009 §6). Pero al declararlo "Fase 1", estas dos brechas pasan de "aceptables en un throwaway" a "deuda que hay que planificar".

## 2. Stack: la bifurcación que gatea todo lo demás

El ADR-005 especifica **NestJS + TypeScript** para el backend. El piloto está en **Next.js (App Router) con Server Actions + Prisma**. No es una diferencia cosmética: es un modelo de ejecución distinto.

Hay dos caminos honestos, y **esta es la única decisión que necesito que tomes vos antes de armar el plan concreto** (el resto se deriva de acá):

| Camino | Qué implica | A favor | En contra |
|---|---|---|---|
| **A. Evolucionar el codebase Next.js actual** | Se le agrega `tenant_id`, RLS, soft-delete, audit, RBAC, el constraint de exclusión, etc., **sobre lo que ya existe**. Se acepta divergir de ADR-005 en el stack de backend. | Conserva el piloto vivo y el cliente real sin interrupción. Prisma soporta RLS y `EXCLUDE` de Postgres. Time-to-value inmediato. | Diverge del stack canónico de los ADR. Next.js Server Actions no dan la estructura modular DDD que NestJS da "gratis" para Core/Blueprint/Plugin (ADR-002). El día que haya un 2º blueprint, la estructura de capabilities cuesta más. |
| **B. Tratar el piloto como referencia funcional y reconstruir la plataforma en NestJS** | El piloto actual queda como spec viva / demo. La "plataforma real" (multi-tenant, Core/Blueprint/Plugin) se construye desde cero en NestJS siguiendo los ADR, y Carolina se migra a ella cuando esté lista. | Nace 100% alineado con los ADR. La estructura de capabilities y plugins queda bien desde el día 1. | Es más trabajo por delante antes de tener valor nuevo. Riesgo clásico de "reescritura del 2º sistema". Carolina sigue en el piloto mono-tenant mientras tanto (aceptable, ya funciona). |

**Mi recomendación como arquitecto:** los propios ADR predican no sobre-construir hasta que el caso lo justifique (001, 005, 006 lo repiten). Con **un solo blueprint y un solo cliente**, la abstracción Core/Blueprint/Plugin de ADR-002 **todavía no paga** — está diseñada para evitar forks *entre verticales*, y no tenés un 2º vertical aún. Por eso:

> **Recomiendo Camino A con una condición**: evolucionar el Next.js actual cerrando **solo las brechas foundacionales caras de diferir** (las que tocan el modelo de datos y son dolorosas de retrofitear), y **posponer explícitamente** las abstracciones de plataforma (Core/Blueprint/Plugin, Metadata Engine, NestJS) hasta que aparezca el 2º cliente o el 2º vertical — que es el disparador que los propios ADR usan para justificar esa complejidad.

Es decir: convergemos en el **modelo de datos y la seguridad** (lo caro de arreglar después), no en el **stack de aplicación** (lo que se puede cambiar cuando el 2º blueprint lo justifique).

## 3. Gap analysis detallado

### Ya alineado con los ADR (no tocar)
| Decisión ADR | Estado en el piloto |
|---|---|
| ADR-003: **Profesional ≠ Usuario** | ✅ Cumplido. Los profesionales se cargan sin login; no son entidad de auth. |
| ADR-003: fasificación (pago manual, factura interna en Fase 1) | ✅ Pago se confirma manualmente; no hay CAE todavía (correcto para Fase 1). |
| ADR-004 + AMD: **horarios de atención por profesional** | ✅ Recién construido (`WorkingHours` por día). |
| ADR-009: **agenda como home**, mobile-first operativo, estados vacíos con acción | ✅ Mayormente. La agenda es el eje; los vacíos ofrecen la acción. |
| ADR-009: catálogo con plantilla, no pantalla vacía | 🟡 Parcial (hay seed de ejemplo, falta wizard de onboarding). |

### Brechas foundacionales — CARAS de diferir (cerrar durante la convergencia)
| # | Brecha | ADR | Por qué es cara de diferir |
|---|---|---|---|
| G1 | **`tenant_id` en toda tabla + RLS** | 001 | El ADR entero es "diseñá esto desde el día 1 o sufrí". Retrofitear multi-tenancy sobre datos productivos es la migración más dolorosa que existe. **Máxima prioridad.** → **Mitad de datos ✅ (2026-07-02)**: modelo `Tenant` + `tenantId` NOT NULL indexado en las 12 tablas, backfill de la base viva sin pérdida, threading en cada create vía `src/lib/tenant.ts`. **Mitad de RLS diferida** hasta el 2º tenant (con 1 tenant no hay leak posible; RLS+pooling es el mayor footgun). |
| G2 | **Overbooking en el motor (`EXCLUDE USING GIST` + `TSTZRANGE`)** | 004 | Hoy es Alternativa A (la rechazada). Migrarlo es acotado (una tabla) pero hay que hacerlo antes de que el volumen de reservas concurrentes crezca. |
| G3 | **Soft-delete (`deleted_at`)** | AMD-001 | Hoy hacemos DELETE físico. Necesario para audit trail y "borré por error". Cada día que pasa se pierden datos irrecuperables. |
| G4 | **Audit trail (`audit_log` append-only)** | 009 §4 | *"No es Fase 3: es Fase 1. Retrofitear deja un agujero histórico permanente."* Cada mutación sin auditar hoy es historia que nunca vamos a poder reconstruir. |
| G5 | **Precio congelado + notas libres en el Turno** | AMD-003 | Barato de agregar, alto valor de UX y evita disputas de precio. Cuanto antes, mejor (los turnos viejos no lo van a tener). |
| G6 | **Zona horaria explícita (UTC en DB, zona = config del tenant)** | AMD-004 | Hoy hay fechas en hora local implícita. Ordenarlo ahora es barato; después de tener datos, es una migración con riesgo. |

### Brechas importantes — pero NO caras de diferir (planificar, no urgente)
| # | Brecha | ADR | Cuándo |
|---|---|---|---|
| G7 | **RBAC 3 roles (Dueño/Recepción/Profesional)** | 009 §3 | Cuando el negocio tenga más de una persona operando. Hoy es 1 contraseña. No destruye datos si se difiere. |
| G8 | **Auth: MFA (TOTP) + rate limit en login** | AMD-005 | Antes de escalar a varios clientes. Rate limit es más urgente que MFA. |
| G9 | **Bloqueo de agenda por profesional (vacaciones/franco)** | AMD-004 | Hoy el bloqueo es por box (`BoxBlock`), no por profesional. Se resuelve con la misma estructura de rangos. |
| G10 | **Email transaccional vía proveedor (Resend/SES) como Plugin** | AMD-007 | La infra de recordatorios ya existe en modo simulado; falta conectar el proveedor real. |

### Brechas de plataforma — DIFERIR explícitamente (no antes del 2º cliente/vertical)
| # | Brecha | ADR | Razón para diferir |
|---|---|---|---|
| G11 | Estructura Core / Business Capabilities / Blueprint / Plugin | 002 | Paga recién con el 2º blueprint. Hoy sería sobre-ingeniería (el propio ADR-002 lo dice: evitar forks *entre verticales* que no existen aún). |
| G12 | Metadata Engine + campos de extensión + `DynamicForm` | 006, 009 §2 | Idem: su valor aparece cuando un blueprint necesita campos que otro no tiene. |
| G13 | Outbox pattern + event bus (pg-boss) + Plugins desacoplados | 002 | Hoy no hay ningún consumidor de eventos real. Se introduce cuando llegue el Plugin ARCA o MP. |
| G14 | Migrar a NestJS | 005 | Solo si/ cuando el Camino B se active. Ver §2. |
| G15 | Feature Flags, Rules/Tax/AI engines, Marketplace | 006 | El propio ADR-006 ya los difiere o simplifica. Sin cambios. |

## 4. Secuencia recomendada de convergencia (si se elige Camino A)

**Ola 1 — Cimientos de datos (lo irreversible primero):**
1. G3 Soft-delete + G5 precio congelado/notas + G6 zona horaria → migraciones de modelo aditivas, bajo riesgo, alto retorno.
2. G4 Audit trail → interceptar en un solo punto las mutaciones (hoy las server actions de `lib/`), tabla `audit_log`. Empezar a auditar YA aunque sea rústico.
3. G1 `tenant_id` + RLS → **la decisión de fondo.** Se agrega `tenant_id` a cada tabla (con el tenant "Beauty & Spa" como primer registro), políticas RLS, y el contexto de tenant en la sesión. Es la ola más grande.

**Ola 2 — Features del relevamiento con el cliente (ADR-011) + integridad del dominio:**
4. G16 Categorías de servicios (+ carga de Ducha escocesa / Pileta climatizada bajo "Spa").
5. G9 Novedades/disponibilidad por profesional (`ProfessionalBlock`, ver ADR-011 §2).
6. G18 Comisión por (profesional, servicio) — tabla de unión explícita.
7. G2 Overbooking al motor (`EXCLUDE USING GIST`) **+ G17 recursos con capacidad** (máquinas/gabinetes) — comparten la lógica de solapamiento temporal, se hacen juntos (ADR-011 §3).
8. G8 Rate limit en login (rápido) → luego MFA para Admin.

**Ola 3 — Operación multi-usuario:**
7. G7 RBAC 3 roles.
8. G10 Email real como primer Plugin bien hecho (prepara el terreno de G13).
9. Onboarding wizard + importador CSV (ADR-009 §5).

**Diferido a disparador de negocio (2º cliente / 2º vertical):** G11-G15.

## 5. Riesgo principal de este ADR

El riesgo no es técnico, es de **secuenciación de esfuerzo**: intentar cerrar las 15 brechas de una vez replica el error que los ADR advierten (construir los 8 motores antes de terminar el piloto). La disciplina es: **Ola 1 primero, y validar que Carolina sigue operando sin fricción después de cada ola** — porque la métrica de éxito sigue siendo ADR-009 §6 (la recepcionista elige el sistema sobre el cuaderno), no "cuántos ADR cumplimos".

## 6. Decisión tomada

**Camino A confirmado (2026-07-02).** Se evoluciona el codebase Next.js actual. Se cierran las brechas foundacionales (§3, G1-G6) siguiendo la secuencia de §4. Las abstracciones de plataforma (G11-G15) quedan diferidas explícitamente hasta el disparador de negocio (2º cliente o 2º vertical). El stack de backend diverge de ADR-005 (Next.js Server Actions en vez de NestJS) por decisión consciente, no por omisión — se revisará esa divergencia cuando aparezca el 2º blueprint.

### Convención de convergencia (derivada)
- Cada brecha cerrada se referencia en su commit como `[ADR-010 GX]`.
- Después de cada Ola, verificar que Carolina sigue operando sin fricción (métrica ADR-009 §6) antes de pasar a la siguiente.
- Toda migración sobre la base productiva de Neon: aditiva primero (columna nullable → backfill → constraint), nunca un cambio bloqueante en una sola transacción sobre datos vivos (costo oculto de ADR-007).
