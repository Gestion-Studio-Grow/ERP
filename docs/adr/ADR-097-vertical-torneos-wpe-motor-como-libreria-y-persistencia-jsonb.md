---
id: ADR-097
nivel: evolutiva
dominio: [Arquitectura, Multi-tenant, Plataforma]
depends_on: [ADR-002, ADR-018, ADR-036, ADR-054, ADR-055, ADR-074]
---
# ADR-097: Vertical Torneos (WPE) — el motor como librería + persistencia JSONB por tenant

**Estado:** Aceptado — **FASE 1 + FASE 2 construidas** (reversibles, flag `TORNEOS_ENABLED` default OFF, sin
migraciones aplicadas). FASE 3+ planificadas, **no ejecutadas**. La demo `circuito-wpe.vercel.app` queda
**intacta** (no se toca hasta paridad verificada).
**Fecha:** 2026-07-13
**Depende de:** ADR-002 (Core/Blueprint/Plugin), ADR-054 (repositorio de plugins / catálogo de módulos),
ADR-055 (principio de variante), ADR-018 (multi-tenant/RLS), ADR-036 (blueprint por rubro), ADR-074
(precedente `pending-gate2` para schema preparado-sin-aplicar).

---

## Contexto

**Circuito WPE** es un producto de gestión de torneos de pádel que **se está vendiendo ahora** (demo en
`circuito-wpe.vercel.app`). Tiene un **motor de torneos probado** (`torneo-engine.js`, ~1.7k líneas, **JS
puro ES2018, UMD, sin dependencias, 76 tests determinísticos**) pero **no tiene backend ni base**: persiste
en `localStorage` y sus datos son semilla de demo. El dueño aprobó **unificarlo con el ERP**: mismo repo,
misma base (Neon), mismo pipeline, misma consola de operador, mismo aislamiento por tenant — **sin romper la
demo** (se construye en paralelo; el corte del deploy viejo es posterior y solo con paridad verificada).

El riesgo a evitar: que el torneo entre como un **injerto** (código pegado al costado que no respeta el
modelo del ERP). Debe encajar en **núcleo + plugins/módulos** (ADR-002/054), con su aislamiento por tenant
de fábrica (ADR-018) y su activación por rubro (ADR-055).

## Decisión

### 1. El motor entra como LIBRERÍA verbatim — se envuelve, no se toca
`torneo-engine.js` se copia **byte a byte** (SHA verificado) a `src/plugins/torneos/engine/`. Es UMD sin
dependencias → corre en Node tal cual. Sus **76 tests** se traen **byte-idénticos** (`.mjs`) y corren
**dentro del CI del ERP** (`npm test` amplía su glob a `src/**/*.test.mjs`). Un `.d.ts` describe su
superficie (el default export = el objeto `api` del UMD) y un `index.ts` lo re-expone tipado. **Regla dura:
el motor es código probado y determinístico; cualquier cambio de comportamiento va contra el repo
`circuito-wpe`, no contra esta copia.**

### 2. Es un `capability` de primera parte, no una integración
Se define como `ModuleDescriptor` (ADR-054) con `kind: "capability"` (vertical propio con su dominio y su
schema), **no** `kind: "plugin"` (que es integración externa por eventos/comandos, como ARCA). Compatibilidad
`rubros: ["torneos"]` — **solo** el blueprint `torneos` lo activa (ADR-036); la **asignación** sigue siendo
por tenant (variante ADR-055, nunca "todos con todo"). El descriptor queda **definido y validado** pero **no
cableado** al catálogo vivo ni a la consola todavía (definir ≠ instanciar; el cableado es FASE 3).

### 3. Persistencia: SNAPSHOT JSONB por tenant, empezando simple
El estado del torneo es un objeto plano con `serializar()`/`deserializar()` (JSON). Se persiste como **un
snapshot JSONB por torneo** en una tabla `Torneo` (`id`, `tenantId`, `snapshot`), **scopeada por `tenantId`
con su policy de RLS** (ADR-018). **No se normaliza a tablas relacionales todavía**: la normalización llega
recién si aparece una query que la pida (ranking cross-torneo, etc.), no antes. Las mutaciones del motor
devuelven `{ ok, torneo, ... }`; la orquestación **persiste solo si `ok`** (un rechazo no escribe nada).

### 4. Nada toca la DB hasta Gate 2 — sin schema-ahead
La tabla `Torneo` se prepara como **SQL crudo en `prisma/pending-gate2/Torneo.sql`** (con su `ENABLE RLS` +
`POLICY tenant_isolation` explícitas), **fuera** de `prisma/migrations/` — mismo criterio que `ProvisioningRun`
(ADR-074). **No se agrega el modelo a `schema.prisma`** para no dejar el cliente Prisma *schema-ahead* de la
DB (el footgun que tiró CH prod). El adaptador real toca la tabla por `$queryRaw` dentro de `tenantTransaction`
y **prueba su existencia por `information_schema` antes** de tocarla (falla claro si el flag se prende sin
migrar). Todo detrás de `TORNEOS_ENABLED` (default OFF): reversible por flag o `git revert`.

## Consecuencias

- **(+)** El torneo vive en el ERP sin ser injerto: encaja en el catálogo (ADR-054), respeta el aislamiento
  (ADR-018) y la variante por rubro (ADR-055); su motor probado queda intacto.
- **(+)** La persistencia JSONB es el MVP más barato que reemplaza `localStorage` sin sobre-ingeniería; se
  normaliza solo cuando el negocio lo pida.
- **(+)** Cero riesgo para prod: sin migración aplicada, sin modelo en schema, todo tras flag OFF; la demo
  vendible sigue viva e intacta.
- **(−)** El adaptador real (`prisma-store.ts`) **no se puede validar en vivo** hasta aplicar Gate 2 (no hay
  tabla) — su corrección se prueba por revisión + el harness de test se ejercita contra el store en memoria.
- **(−)** Con snapshot JSONB, una query cross-torneo (ranking global) exige leer y deserializar; si eso se
  vuelve caliente, dispara la normalización (deuda anotada, no adelantada).

## Alcance de esta iteración (FASES)

- **FASE 1 — motor como librería:** ✅ hecho. Engine verbatim + 76 tests en el CI del ERP.
- **FASE 2 — persistencia Neon:** ✅ hecho. Orquestación + store en memoria testeados; adaptador real +
  migración `pending-gate2/Torneo.sql` (con RLS) **preparados, sin aplicar** (Gate 2).
- **FASE 3+ — superficie web multi-tenant, backoffice del torneo en la consola (`requireOperator`/auth del
  tenant), app Expo contra el API del ERP, corte del deploy viejo con paridad (incluida performance):**
  planificadas, **no ejecutadas**. Ver el plan detallado en el reporte de la sesión.

> **Nota de convergencia (cross-branch):** la formalización "núcleo + módulos instalables por producto" vive
> en un ADR posterior (rama no mergeada a `main` al momento de escribir esto). Cuando ambas líneas lleguen a
> `main`, este ADR debe cruzar-linkearse con esa formalización; hoy se apoya en su base directa (ADR-054/055).

— Elaborado por GSG
