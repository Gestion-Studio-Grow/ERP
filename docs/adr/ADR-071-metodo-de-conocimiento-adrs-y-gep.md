---
id: ADR-071
nivel: fundacional
dominio: [Operaciones, IA]
depends_on: [ADR-008, ADR-040, ADR-047]
---
# ADR-071: Método de conocimiento — ADRs + GEP como memoria organizacional ("nada listo sin artefacto + evidencia")

**Estado:** Aceptado — **fundamento de método**. Declara cómo GSG **recuerda y decide**: los ADRs + la
Gestión de Estructura del Proyecto (GEP, RFC-001) son la memoria organizacional, con una regla dura de cierre.
**Fecha:** 2026-07-10
**Depende de:** ADR-008 (costo de tokens: decisiones como ADR, índice liviano), ADR-040 (Gate de Excelencia),
ADR-047 (rutina de retroalimentación)
**Relacionado:** ADR-045 (Advisory/Challenger), ADR-052 (calibración: leer el corpus), ADR-068 (firma sobre
evidencia), Constitución C-001…C-005 · `docs/rfc/RFC-001-evolucion-gestion-conocimiento.md` · `docs/adr/graph.json`

---

## Contexto

Un desarrollo 100%-IA a través de muchas sesiones **pierde memoria** si cada decisión vive solo en un chat. El
repo ya adoptó piezas del método —ADRs como decisiones persistidas (ADR-008), Constitución como índice-puntero
(C-001…C-005), grafo de ADRs, scripts de gobernanza (`adr-graph`/`adr-context`/`adr-linkcheck`), retro
(ADR-047)— pero faltaba **declararlo como el método de conocimiento** y fijar la **regla de cierre** que evita
el drift entre "lo que decimos" y "lo que hay". Es la contracara de la calibración (ADR-052: leer el corpus
antes de actuar): para leerlo, el corpus tiene que estar **escrito y al día**.

## Decisión

El **método de conocimiento de GSG** es **ADRs + GEP como memoria organizacional**, con una **regla de cierre
dura**:

1. **Toda decisión que perdura = un ADR** (prosa: Contexto/Decisión/Consecuencias/Alternativas), con **ID
   inmutable** (RFC-001 R1), enlazado en el **grafo** (`graph.json`, derivado del header `Depende de:`) y
   citado en el **INDEX**. La Constitución (C-001…C-005) cristaliza lo no-negociable como **índices-puntero** a
   esos ADRs (no los reescribe, ADR-008/H1).
2. **GEP (RFC-001) = la estructura viva del conocimiento**: niveles (Constitución / Fundacional / Evolutiva),
   frontmatter (`nivel`/`dominio`/`depends_on`), grafo + scripts de gobernanza (`adr-graph`, `adr-context`,
   `adr-linkcheck`) que corren como **subproducto del ritual** (Gate/retro, ADR-040/047). El conocimiento se
   agrega **aditivo** (nunca renumerar/mover/reescribir).
3. **Regla dura de cierre — "nada se marca listo sin ARTEFACTO + EVIDENCIA".** Un ítem no está "hecho" por
   afirmarlo: exige **(a)** un artefacto versionado (ADR, doc, código, test, runbook) y **(b)** evidencia
   verificable (tests verdes, gate:rls sin drift, invariante I1–I7, salida de un script). Es la misma vara que
   "firma sobre evidencia" (ADR-068) y que el Gate (ADR-040): sin artefacto + evidencia, es **provisional**, no
   listo.
4. **Cadencia de mantenimiento** (ADR-047): cada cierre de sprint actualiza memoria + registra caso; la
   consolidación periódica destila y limpia, y re-corre el grafo/linkcheck para que la memoria no derive.

> **En una línea:** *lo que decidimos vive como ADR en un grafo navegable (GEP), no en un chat; y nada se da
> por listo sin un artefacto versionado y su evidencia verificable.*

## Consecuencias

- **(+)** **Memoria que sobrevive a las sesiones**: cualquier sesión nueva calibra leyendo el corpus (ADR-052)
  porque el corpus está escrito, enlazado y al día → menos re-decidir, menos drift.
- **(+)** **Trazabilidad de decisiones**: el grafo responde "¿qué se cae si cambio X?" (`dependents`), y el
  linkcheck garantiza que no haya IDs colgados.
- **(+)** La regla "artefacto + evidencia" **corta el auto-engaño** ("está listo" sin prueba) y alimenta las
  firmas humanas (ADR-068) y el Gate (ADR-040).
- **(+)** Barato en tokens (ADR-008): índice liviano de entrada, detalle cargado bajo demanda, IDs estables.
- **(−)** **Disciplina permanente**: escribir el ADR, mantener el grafo y exigir evidencia es trabajo por
  cada decisión/cierre. Se mitiga con los scripts (subproducto del ritual) y la cadencia de la retro (ADR-047).
- **(−)** Riesgo de **burocracia** si se aplica a lo trivial → se acota: ADR solo para lo que **perdura**; lo
  efímero no genera ADR (ADR-008).

## Alternativas descartadas

- **Conocimiento en el chat / la cabeza del que estuvo.** Cero fricción hoy, amnesia mañana: cada sesión
  re-decide y el sistema deriva (RFC-001 R5). Rechazada: es exactamente lo que el GEP previene.
- **Wiki/documento plano sin grafo ni IDs inmutables.** Se puede escribir, pero sin `depends_on`/`dependents`
  no responde "qué depende de qué" y se renumera/reescribe → drift. Rechazada: grafo derivado + IDs inmutables.
- **"Listo" por declaración del que ejecuta** (sin artefacto/evidencia). Rápido pero es la puerta del
  auto-engaño y del bug en prod. Rechazada: la regla dura de cierre lo prohíbe.

— Elaborado por GSG (PMO / S5 Juicio Crítico — fundamento de método, reversible/doc-only)
