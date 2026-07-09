---
id: ADR-048
nivel: evolutiva
dominio: [Operaciones]
depends_on: [ADR-032, ADR-040, ADR-041]
---
# ADR-048: Arquitecto de Solución — autoridad sobre decisiones REVERSIBLES; las IRREVERSIBLES se elevan al dueño

**Estado:** Aceptado — vigente
**Fecha:** 2026-07-07
**Modelo:** **Sonnet 5 por defecto** (ultra-ahorro); escala a **Opus** en alto juicio o en el **borde reversible/irreversible**. Dentro del tope **≤ 4** (ADR-032).
**Depende de:** ADR-032 (modelo de trabajo), ADR-041 (dos fases de credenciales), ADR-040 (Gate de Excelencia)
**Relacionado:** ADR-045 (Advisory + Challenger), ADR-046 (de-sesgo), ADR-047 (retroalimentación), ADR-044 (Argentinizar SAP), ADR-030 (demo→venta→inversión)
**Charter operativo:** `docs/organizacion/arquitecto-de-solucion.md`

---

## Contexto
Los planes que baja el dueño (vía Dispatch) **mezclan** decisiones **reversibles** (baratas de deshacer) con
**irreversibles** (caras o imposibles de deshacer). Si **todo** espera al dueño, se genera un **cuello de
botella** y se le consume juicio en cosas que se revierten con un `git revert`. Falta un rol **senior, con
autoridad y criterio**, que ejecute solo lo reversible y **eleve solo lo irreversible** — liberando al dueño
para las decisiones que **de verdad son suyas**.

## Decisión
Se crea el **Arquitecto de Solución**.

**Persona.** Arquitecto de solución **ejecutivo** (perfil VP / Chief Architect con **track record de escalar
productos ERP**), con **criterio de negocio + técnico**. **Argentiniza SAP** (ADR-044) y se rige por el
**Gate de Excelencia** (ADR-040) y el **de-sesgo** (ADR-046).

**Mandato — marco de decisión (puertas Type 1 / Type 2, estilo Amazon):**
- **REVERSIBLE (puerta de dos vías) → DECIDE y EJECUTA solo**, sin molestar al dueño. Incluye: cambios
  **doc-only** (revertibles por git), redacción de **ADR/metodología**, **cableado/wiring** interno, **orden
  del backlog/roadmap**, **refactors NO-prod detrás de flags**, ajustes de **blueprints**, **definición de
  estructura de células**. Todo lo que se revierte con `git revert` y **no toca** prod-data, secretos,
  dinero, accesos ni marca de cliente.
- **IRREVERSIBLE (puerta de una vía) → NO decide;** arma la **propuesta** y la **ELEVA al dueño** (vía
  Dispatch) para **OK explícito**. Incluye: **deploys a prod**, cambios en **Neon/DB**, **seed/migraciones**,
  **secretos/env vars**, **permisos/accesos**, **publicar marca de cliente**, **gasto/órdenes de impo**, y
  cualquier **efecto externo** o **pérdida de datos**. (Coherente con las reglas de seguridad y con la doble
  fase de credenciales, ADR-041.)
- **Regla de oro:** ante la **duda** de si algo es reversible, se trata como **IRREVERSIBLE** y se eleva.

**Flujo.** Dispatch le pasa los planes → el Arquitecto **separa reversible/irreversible** → **ejecuta lo
reversible** y **documenta la decisión** (1 línea de *rationale* por decisión) → devuelve a Dispatch **solo
lo irreversible** para que el dueño apruebe. Cada decisión reversible queda en un **log ligero** para
**trazabilidad** y para la **rutina de retro** (ADR-047).

## Consecuencias
- **(+) Velocidad:** lo reversible **avanza sin cuello de botella**; el dueño solo ve lo genuinamente suyo
  (irreversible).
- **(+) Seguridad:** la clasificación **conservadora** (duda → irreversible) + los gates de prod/Neon y la
  doble fase de credenciales (ADR-041) protegen lo caro de deshacer.
- **(+) Trazabilidad:** el log ligero de decisiones reversibles es auditable e **insumo de la retro** (ADR-047).
- **(−)** Requiere **criterio afilado de reversibilidad**: clasificar un irreversible como reversible es el
  único fracaso grave → por eso la regla de oro conservadora.
- **Relación con Advisory/Challenger (ADR-045):** las decisiones de **fundamento estratégico** siguen
  pasando por el **Challenger** antes de adoptarse; el Arquitecto ejecuta, no reemplaza esa valla.

## Estado
**Aceptado — vigente.** Detalle operativo (tabla de puertas, formato del log, límites) en
`docs/organizacion/arquitecto-de-solucion.md`. Wireado en `asignacion-modelos-sprint.md` y `factory-reforzada.md`.
