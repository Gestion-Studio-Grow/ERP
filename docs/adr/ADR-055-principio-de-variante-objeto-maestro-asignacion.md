# ADR-055: Principio de VARIANTE — el objeto se crea una vez (dato maestro) y se ASIGNA (SAP argentinizado)

**Estado:** Aceptado — **principio vigente**. La **construcción** del ABM (UI + modelo) es **reingeniería → Balde B** (Opus, mañana); hoy solo se **documenta** (definir ≠ construir).
**Fecha:** 2026-07-07
**Depende de:** ADR-002 (Core/Blueprint/Plugin), ADR-003 (capabilities de "Servicios")
**Relacionado:** ADR-054 (repo de plugins/catálogo), ADR-044 (Argentinizar SAP), ADR-009 (UX)
**Lecciones que lo originan:** `docs/lecciones-aprendidas/registro.md` → **A-1 · DX-6 · DX-7** (asignación profesional↔servicio real y **distinta** por entidad)

---

## Contexto
El módulo de **Servicios** conectaba **"a todos con todo"** (todo profesional quedaba con todos los
servicios). Esa fue la **causa raíz de A-1 / DX-6 / DX-7**: la relación **no era deliberada ni distinta por
entidad**, así que un profesional aparecía ofreciendo servicios que **no da**. En SAP, el **dato maestro** se
crea **una vez** y se vincula con **relaciones explícitas** (asignaciones); hay que **argentinizar** ese
patrón — potente pero simple, con su ABM claro.

## Decisión — PRINCIPIO DE VARIANTE
1. **El SERVICIO es un OBJETO / dato maestro**, con su **ABM propio** (Alta / Baja / Modificación). Se crea
   **una sola vez**.
2. **Se ASIGNA al PROFESIONAL mediante una relación explícita**, que **también tiene su ABM**
   (asignar / desasignar por profesional).
3. **NUNCA "a todos con todo":** la asignación es **deliberada y distinta por entidad** — cada profesional
   tiene **su** set de servicios asignados; cada servicio, **su** set de profesionales.
4. **Generalizable (mismo patrón objeto-maestro → asignación)** a todo el catálogo:
   **producto ↔ categoría**, **módulo/plugin ↔ tenant** (ADR-054), **rubro ↔ blueprint**, etc. El **objeto
   vive una vez**; la **asignación** es la relación, con su **propio ABM**.

## Consecuencias
- **(+) Datos correctos:** cada entidad muestra **solo lo asignado** → mata la causa raíz de A-1/DX-6/DX-7.
- **(+) Reutilización sin duplicar:** el objeto maestro no se copia; se **asigna** (coherente con "un solo
  Core, nunca fork").
- **(+) Consistencia SAP + catálogo:** "módulo ↔ tenant" del repo de plugins (ADR-054) **es** una asignación
  de este mismo patrón.
- **(−)** Más UI: **dos ABM** (objeto + asignación) en vez de un checkbox "todos". Es **deliberado** — la
  fricción evita el dato incorrecto.
- **Construcción diferida:** el ABM (UI backoffice + modelo de la relación) es **reingeniería** → **Balde B**
  (`plan-ventana` — Opus mañana). Hoy **no se construye**.

## Estado
**Aceptado como principio de producto/arquitectura.** Documentado también en `docs/fundamentos/bases-gsg.md §8`
(fundamento de producto) y `CLAUDE.md`. El **módulo de Servicios y el catálogo se rehacen bajo este principio**
(objeto-maestro con ABM + asignación con ABM) en la reingeniería del Balde B.

> **📌 Amendment 2026-07-07 — el eje MÓDULO↔TENANT ya tiene su fundación.** La generalización #4
> (módulo/plugin ↔ tenant, ADR-054) se **materializó** como `src/modules/` (objeto-maestro
> `ModuleDescriptor` + asignación por `Tenant.modules[]`, con el guardarraíl "nunca todos con todo").
> Reversible y detrás de flag — ver `docs/arquitectura/repositorio-de-modulos.md`. Lo que **sigue en
> reingeniería (Balde B)** es el ABM de **Servicios** (servicio↔profesional): UI backoffice + modelo de
> esa relación.
