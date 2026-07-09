---
id: ADR-015
nivel: evolutiva
dominio: [Plataforma, Seguridad]
depends_on: [ADR-001, ADR-010]
---
# ADR-015: Resolución de tenant fail-closed (blindar G1 antes del 2º tenant)

**Estado:** Aceptado — pendiente de implementación (2026-07-03)
**Depende de:** ADR-001 (estrategia multi-tenant), ADR-010 (G1 / convergencia — RLS diferido)
**No reemplaza:** el diferimiento de RLS de Postgres sigue en pie (ver §4).

---

## 1. Problema

La descripción del estado de G1 (en INDEX, en `schema.prisma` y en `src/lib/tenant.ts`) dice que "con un solo tenant no hay leak cross-tenant posible". Verificado contra el código real, esa afirmación es más optimista que la implementación.

`getCurrentTenantId()` no resuelve el tenant por request: hace `prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } })` y cachea el resultado en memoria de proceso. Traducido: **no** es "agarrá el tenant de esta request", es "agarrá el tenant más viejo que exista, asumiendo que hay uno solo".

El hueco: el aislamiento no depende de que haya un solo tenant *conceptualmente*, depende de que la tabla `Tenant` tenga exactamente una fila *de hecho*. Si aparece una segunda fila por cualquier vía no-productiva — un script de seed de prueba, una migración mal corrida, un experimento en la base (que es Neon, producción real), el alta manual de un tenant #2 sin haber hecho antes el trabajo de RLS — la función sigue devolviendo "el más viejo" **en silencio**, y todo el tráfico puede leer/escribir contra el tenant equivocado sin que nada lo frene. No hay RLS todavía, así que no hay segunda línea de defensa.

Esto no fuerza a construir el multi-tenant real ahora. Fuerza a corregir una afirmación de seguridad que hoy es falsa: el sistema no es seguro *porque hay un tenant*, es seguro *si y solo si nadie inserta un segundo antes de que exista RLS*, y esa condición no está garantizada por ningún assert en el código.

## 2. Alternativas evaluadas

### A. Statu quo — dejar `findFirstOrThrow` y documentar el riesgo
- **Costo:** cero.
- **Riesgo:** un segundo tenant accidental produce cross-tenant silencioso, en producción, sin señal. La probabilidad es baja pero no nula (base de producción, seeds de prueba, altas manuales), y el modo de falla es el peor posible: silencioso y con datos reales.
- **Descartada:** el costo de cerrarlo es tan bajo que aceptar un modo de falla silencioso en producción no se justifica.

### B. Adelantar el multi-tenant real ahora — resolución por request + RLS + `SET LOCAL` por transacción
- **Costo:** alto. Exige decidir el mecanismo de resolución (subdominio / header / sesión), tocar el pooling de Neon (RLS + pgbouncer es, por el propio ADR-010, "el tramo más riesgoso"), y garantizar que ninguna query se cuele sin pasar por la transacción con el contexto seteado.
- **Riesgo:** sin un 2º tenant real contra el cual probar, es más fácil introducir un bug de aislamiento nuevo que ganar seguridad real. Es exactamente el trabajo especulativo que ADR-006 evita.
- **Descartada:** construye para una escala (2º tenant) que todavía no tiene fecha ni compromiso en BACKLOG.

### C. Blindar solo la resolución de tenant, fail-closed — sin tocar RLS ni pooling *(elegida)*
- **Costo:** bajo. Una función; sin migración, sin tocar Postgres ni el pooler.
- **Qué hace:** la resolución falla ruidosamente (throw) si la tabla `Tenant` tiene más de una fila, en vez de elegir "la más vieja" en silencio. Con exactamente una fila se comporta idéntico a hoy.
- **Qué NO hace:** no diseña el multi-tenant real. Ese trabajo sigue esperando al 2º tenant con fecha (ADR propio, opción B, el día que exista).

## 3. Decisión

Se adopta **C**. `getCurrentTenantId()` pasa de "el más viejo, cacheado" a **fail-closed**: mientras haya exactamente un tenant, devuelve ese; si detecta cero o más de uno, lanza un error explícito en vez de adivinar.

Regla de diseño (el porqué que se lee en 6 meses): **en un sistema multi-tenant sin RLS, la ausencia de un segundo tenant es una precondición de seguridad, no una casualidad benigna — y toda precondición de seguridad se afirma con un assert que falla ruidoso, nunca se asume.** Un cross-tenant silencioso en producción es un incidente de datos; un throw en el arranque de una request es un bug visible y contenido. Se elige siempre el segundo.

Corolario operativo: el día que se cree deliberadamente un 2º tenant, este throw es la señal de diseño de que **primero** hay que hacer el trabajo de RLS + resolución por request (opción B, ADR propio). El fail-closed no es un obstáculo a remover con un parche — es el recordatorio de que ese trabajo es prerrequisito, no posterior.

**Aclaración explícita (restricción viva de la sesión de arquitectura):** este ADR **no** pisa el diferimiento de RLS de ADR-010/ADR-001. Lo refuerza: RLS sigue diferido; lo que cambia es que el intervalo "sin RLS" deja de apoyarse en una asunción tácita y pasa a estar protegido por un assert.

## 4. Impacto

- **ADR que toca:** enmienda el estado de G1 descrito en ADR-010 y en el INDEX — la frase "con uno solo no hay leak posible" se corrige a "con uno solo y con la resolución fail-closed no hay leak posible". El diferimiento de RLS de ADR-001 queda intacto.
- **Código (implementación en `/sesion-feature` posterior, no en esta sesión):**
  - `src/lib/tenant.ts` — `getCurrentTenantId()` fail-closed: `count()` de tenants; si `!== 1`, throw con mensaje que apunta a este ADR. Revisar la conveniencia del cache en memoria bajo esta lógica (el cache no debe enmascarar la aparición de un 2º tenant en caliente).
  - Comentarios de `schema.prisma` (modelo `Tenant`) y del propio `tenant.ts`: corregir la afirmación "no hay leak posible" según §3.
- **Migración:** ninguna (no cambia el schema).
- **BACKLOG:** sin ítems invalidados. El diseño de RLS real + resolución por request (opción B) queda como candidato de arquitectura futura, disparado por el alta del 2º tenant.

## 5. Decisión final

Se acepta C: blindar `getCurrentTenantId()` como fail-closed. Cambio de bajo costo, sin migración, que cierra un modo de falla silencioso en producción sin construir nada especulativo y sin tocar el diferimiento de RLS. La implementación es una `/sesion-feature` que leerá este ADR.
