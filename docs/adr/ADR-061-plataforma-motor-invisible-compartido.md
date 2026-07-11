---
id: ADR-061
nivel: fundacional
dominio: [Arquitectura, Producto]
depends_on: [ADR-002, ADR-006, ADR-054, ADR-058, ADR-060]
---
# ADR-061: Plataforma / motor invisible compartido entre productos (config-sobre-código)

**Estado:** Aceptado — **fundamento de arquitectura**. Fija qué comparten los dos productos (ADR-060) por
debajo de la marca: un **motor invisible** común, diferenciado **por configuración, no por código**.
**Fecha:** 2026-07-10
**Depende de:** ADR-002 (Core/Blueprint/Plugin), ADR-006 (motores de plataforma), ADR-054 (catálogo de
módulos/plugins), ADR-058 (un Core, dos motores), ADR-060 (dos productos, dos bases)
**Relacionado:** ADR-055 (variante), ADR-062 (RLS), ADR-064 (núcleo transaccional), ADR-065 (fábricas),
ADR-034 (preset IA), ADR-022 (plugin ARCA), ADR-070 (un solo deploy)

---

## Contexto

ADR-060 comercializa **dos productos** con marca, módulos, flujos, precio y onboarding **100% distintos**.
El riesgo obvio es que "dos productos" degenere en **dos códigos** (fork) → doble mantenimiento y drift. La
visión GSG (`FUNDAMENTOS`) y ADR-002/058 ya dicen "un Core"; falta **declarar explícitamente la frontera**:
qué es **motor compartido** (se construye una vez) y qué es **diferenciación** (se configura por producto),
para que la promesa "un Core, dos motores" (ADR-058) no se erosione en la práctica.

## Decisión

Existe **un solo motor invisible compartido** por ambos productos; la diferencia entre productos es
**configuración sobre ese motor, nunca una bifurcación de código**.

### Lo que se COMPARTE (motor invisible, se construye una vez)
1. **Seguridad y aislamiento** — multi-tenant pool shared-schema + **RLS** (ADR-001/062), resolución de tenant
   fail-closed (ADR-015), roles de DB, plano de plataforma separado (ADR-021).
2. **Facturación ARCA** — el plugin fiscal (ADR-022/024/025) y el Tax Engine del Core (ADR-006); **una sola**
   implementación de autorización fiscal para los dos productos.
3. **Núcleo transaccional** — calculadoras puras en Decimal, ledger append-only, fronteras atómicas,
   invariantes I1–I7 (ADR-064/057). La plata y el stock se calculan igual para micro y empresa.
4. **Fábrica de altas** — provisioning de tenants y activación de módulos (ADR-065), incluido el preset por IA
   (ADR-034) como motor de alta del micro.
5. **Toolkit UI** — design system + primitivos + densidades (ADR-059 D4/D6), lenguaje Fiori argentinizado
   (ADR-044). Un solo sistema de diseño, dos densidades/tonos.

### Lo que se DIFERENCIA 100% (configuración por producto, cero código nuevo de motor)
**Marca · módulos activos · flujos/onboarding · precio.** Se expresan como **datos/config**: Blueprint por
rubro (ADR-002), `modules[]` + catálogo (ADR-054/055), branding/preset (ADR-034/043), perfil `lite`/`enterprise`
(ADR-058), pricing→feature flags (ADR-006). Cambiar un producto = cambiar **configuración**, no `if producto`.

> **Regla dura:** ninguna diferencia entre productos se implementa como **rama de código por producto**. Si
> aparece la tentación de `if (producto === "empresa")` en el motor, es señal de que falta un **eje de
> configuración** (módulo, flag, perfil, blueprint) — se agrega el eje, no la rama. (Mismo espíritu anti-fork
> de ADR-002 y anti-"a todos con todo" de ADR-055.)

## Consecuencias

- **(+)** **Un solo núcleo que mantener** para dos negocios: fixes de seguridad/fiscal/plata benefician a los
  dos productos a la vez; un solo pipeline de release los despliega (ADR-070).
- **(+)** **Diferenciación real sin fork:** marca/módulos/precio/flujos divergen todo lo necesario porque son
  config, no código — sostenible a escala.
- **(+)** **Testabilidad:** el motor compartido (calculadoras puras, RLS, fiscal) concentra los tests de mayor
  riesgo una sola vez (ADR-064 I1–I7).
- **(−)** **Disciplina permanente:** cada feature obliga a preguntar "¿motor o config?". Sin gobierno, el
  código de producto se cuela en el motor. Lo vigila el Gate (ADR-040, ángulo consistencia/arquitectura).
- **(−)** **El motor debe ser suficientemente parametrizable** desde el diseño (régimen fiscal por tenant,
  método de valuación, set de módulos, densidad UI) — trabajo de diseño extra por proceso, asumido como el
  precio de no forkear.

## Alternativas descartadas

- **Dos motores/código por producto (fork).** Máxima libertad por producto, pero duplica el núcleo (seguridad,
  fiscal, plata) y garantiza drift. Rechazada: contradice ADR-002/058.
- **Un motor con ramas `if producto` embebidas.** "Compartido" en apariencia, pero el motor se llena de lógica
  de producto y se vuelve infra-mantenible. Rechazada a favor de **ejes de configuración** explícitos.
- **Micro-servicios por capacidad desde el día uno.** Aislamiento fuerte pero sobre-ingeniería para la escala
  actual (ADR-006 ya difirió motores); el monolito modular + plugins alcanza. Rechazada por costo/complejidad.

— Elaborado por GSG (Arquitecto de Solución — fundamento de arquitectura, reversible/doc-only)
