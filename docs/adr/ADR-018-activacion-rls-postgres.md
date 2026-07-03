# ADR-018: Activación de RLS de Postgres — mecanismo y momento (gate del 2º tenant)

**Estado:** Aceptado — pendiente de implementación (2026-07-03)
**Depende de:** ADR-001 (estrategia multi-tenant: shared schema + `tenant_id` + RLS), ADR-010 (G1 / convergencia — RLS diferido), ADR-015 (resolución fail-closed)
**No implementa código.** La salida es esta decisión; la implementación es una `/sesion-feature` posterior que dispara el gate de §3.

---

## 1. Problema

Hoy el aislamiento multi-tenant es **solo a nivel de aplicación**: cada query pasa por `getCurrentTenantId()` (ADR-010, G1) y la resolución es fail-closed (ADR-015, `src/lib/tenant.ts`). Falta la segunda línea de defensa que ADR-001 dejó decidida en abstracto — Row-Level Security de Postgres — pero **sin** definir *con qué mecanismo* se activa ni *en qué momento*.

Ese hueco importa por una razón concreta, no teórica: el propio INDEX marca la activación de RLS como *"el tramo más riesgoso de tocar sin necesidad"* y advierte contra *"activarlo bajo presión"*. Y `tenant.ts:19-24` ya deja escrito, como comentario, el mecanismo previsto (`SET LOCAL app.current_tenant_id` por transacción) y el trigger (el alta del 2º tenant). Mientras eso viva solo como comentario, el día que entre el 2º tenant se va a improvisar bajo presión la parte más delicada del sistema. Esta decisión existe para que ese trabajo esté **decidido con calma antes**, no descubierto en caliente.

Esto **no** fuerza a construir RLS ahora (no hay 2º tenant ni fecha). Fuerza a fijar el mecanismo y el momento, que es puro diseño y no toca la producción viva.

## 2. Alternativas evaluadas

### 2.a — Mecanismo de enforcement

**A. App-level para siempre + un guard (middleware/lint) que exija filtro `tenantId`**
- **Costo:** bajo. Sin cambios de rol ni de DB.
- **Riesgo:** un solo `$queryRaw` o un filtro olvidado = leak cross-tenant, sin ninguna red debajo. Es cinturón sin backstop. En una base que es producción real (Neon), el modo de falla es datos del tenant equivocado en silencio.
- **Descartada:** ADR-001 ya eligió RLS como backstop de DB precisamente para no depender de que la app nunca se equivoque. Quedarse en app-level lo contradice.

**B. RLS policies + `SET LOCAL app.current_tenant_id` por transacción, vía extensión de Prisma Client, con rol de app sin `BYPASSRLS` *(elegida)***
- **Costo:** medio. Migración que crea las policies (`USING (tenant_id = current_setting('app.current_tenant_id'))`) y un rol de app que **no** tenga `BYPASSRLS`; una extensión de Prisma (`$allOperations`) que envuelve cada operación en una transacción precedida por `SET LOCAL`. Overhead: cada read pasa a ser transacción.
- **A favor:** backstop real a nivel DB aunque una query olvide el filtro. `SET LOCAL` es transaction-scoped → **pooling-safe** (no depende de estado de sesión, que el pooler de Neon en modo transacción no preserva). Detalle fijado: como `tenantId` es `cuid` (texto, verificado en `schema.prisma`), la policy compara texto **sin cast a uuid**.
- **En contra:** la extensión y el "todo read es transacción" agregan complejidad y un poco de latencia. Aceptable como precio del backstop.

**C. Schema/DB por tenant (válvula de escape de ADR-001)**
- **Costo:** alto. Provisioning pesado, migraciones ×N tenants, más costo de infra.
- **Descartada:** ADR-001 ya la reservó para enterprise puntual. Para el modelo shared-schema del piloto es sobredimensionada.

### 2.b — Momento de activación

**T1. Activar ya en producción con el tenant único**
- Testea con riesgo cero de leak (hay un solo tenant), pero mete el overhead de transacción-por-read y el riesgo de la migración de policies/rol **en producción** para un beneficio que una branch de ensayo también da. Contradice "no tocar sin necesidad".
- **Descartada.**

**T2. Gate duro antes del 2º tenant, ensayado en branch de Neon *(elegida)***
- No se da de alta un 2º tenant sin RLS vivo; la activación se **ensaya primero en una branch de Neon** con un tenant sintético, que caza los bugs de la extensión y del pooling con calma y sin tocar el tenant vivo. Recién con el ensayo verde se aplica a producción, en el mismo trabajo que provisiona el tenant #2.
- **A favor:** cero riesgo sobre el tenant de Carolina; convierte el "bajo presión" que teme el INDEX en un ensayo controlado.

**T3. Diferir indefinido, quedarse en app-level**
- Deja la DB sin backstop pasado el gate. Es 2.a-A por otra vía. **Descartada.**

## 3. Decisión

Se adopta **B + T2**.

- **Mecanismo:** RLS de Postgres con policies por `tenant_id`, resueltas por `current_setting('app.current_tenant_id')` seteado con `SET LOCAL` dentro de una transacción por request, vía extensión de Prisma Client; el rol con el que la app se conecta **no** tiene `BYPASSRLS`. La resolución del tenant por request (subdominio/sesión) reemplaza el supuesto "un solo tenant" de `getCurrentTenantId()`.
- **Momento:** gate **duro** — el alta del 2º tenant no ocurre sin RLS activo, y la activación se ensaya en una branch de Neon con un tenant sintético antes de tocar producción.

Regla de diseño (el porqué que se lee en 6 meses): **el backstop de aislamiento de un multi-tenant shared-schema se activa como prerrequisito del 2º tenant, no como reacción a él — y se ensaya en una copia desechable de la base antes de tocar la viva.** El fail-closed de ADR-015 es el que garantiza que este orden se respete: hasta que RLS exista, `getCurrentTenantId()` lanza error si aparece un 2º tenant, así que es imposible saltarse este gate en silencio. Los dos ADR encajan: ADR-015 detiene, ADR-018 dice qué hacer cuando detiene.

**Aclaración explícita (restricción viva de la sesión de arquitectura):** este ADR **no** adelanta la activación de RLS — el diferimiento de ADR-010/ADR-001 sigue en pie. Lo que cambia es que el intervalo "sin RLS" deja de tener el mecanismo y el trigger sin escribir: ahora están decididos, listos para ejecutarse el día del gate.

## 4. Impacto

- **ADR que toca:** enmienda el estado de G1 en el INDEX y en ADR-010 — de "RLS diferida, sin plan" a "RLS diferida, con mecanismo (B) y gate (T2) decididos". Refuerza ADR-015 (le da el "qué sigue" a su throw) y concreta el backstop que ADR-001 dejó en abstracto. No pisa el diferimiento.
- **Código (implementación en `/sesion-feature` posterior, no en esta sesión):**
  - Migración: policies RLS `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (tenant_id = current_setting('app.current_tenant_id'))` en cada tabla de negocio; rol de app sin `BYPASSRLS`.
  - Extensión de Prisma Client (`$allOperations`) que envuelve cada operación en `$transaction` con un `SET LOCAL app.current_tenant_id = $1` inicial.
  - `src/lib/tenant.ts` — resolución por request (subdominio/sesión) que reemplaza el `findMany take:2`; conservar el assert fail-closed como red durante la transición.
  - Ensayo previo obligatorio en branch de Neon con tenant sintético.
- **Migración:** sí, pero es trabajo de la feature-session disparada por el gate, no de ahora.
- **BACKLOG:** sin ítems de negocio invalidados (RLS es infra, no feature de negocio).

## 5. Decisión final

Se acepta **B + T2**: RLS con `SET LOCAL` vía extensión de Prisma y rol sin `BYPASSRLS`, activada como gate duro previo al 2º tenant y ensayada en branch de Neon. Cero código y cero riesgo sobre producción hoy; lo que se gana es que la parte más riesgosa del sistema queda decidida con calma en vez de improvisada bajo presión. La implementación es una `/sesion-feature` que leerá este ADR el día que se provisione el tenant #2.
