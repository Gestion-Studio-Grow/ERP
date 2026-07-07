# ADR-051: Roster completo de GSG — organigrama total (gobernanza + divisiones + células) como estructura estándar

**Estado:** Aceptado — vigente
**Fecha:** 2026-07-07
**Depende de:** ADR-050 (roster de sprint), ADR-049 (RACI), ADR-032 (modelo de trabajo)
**Relacionado:** ADR-048 (Arquitecto), ADR-045 (Advisory+Challenger), ADR-038 (impo), ADR-034 (Preset IA), ADR-052 (calibración)
**Doc canónico (organigrama + equipos + faltantes):** `docs/organizacion/roster-completo-gsg.md`

---

## Contexto
El **roster de sprint** (ADR-050) fija el **núcleo de ejecución**, pero la **estructura total de GSG** —todas
las divisiones, toda la gobernanza y todas las células, con **qué agentes componen cada nodo**— no estaba
escrita en un solo lugar. Sin ese mapa completo es difícil ver **huecos** (agentes que deberían existir y no
están) y **quién compone cada división**.

## Decisión
Se fija el **Roster completo de GSG** como estructura estándar, documentado en
`docs/organizacion/roster-completo-gsg.md`. Contiene:
- **Gobernanza (transversal):** Dueño · Dispatch · PMO puro (autor) · Arquitecto de Solución (ejecutor) ·
  Advisory Board + Challenger · QA/Probador · Seguridad · Auditoría GSG (Gate).
- **Divisiones y sus células:** (1) **ERP core** (Pagos·Caja·Inventario/POS·Fiscal·Plataforma/Deploy·Diseño·
  Reliability·Data/DBA); (2) **Agencia Digital** (Consultores·Devs·PMO·Growth·WhatsApp·Soporte); (3)
  **Agencia Grow** (Panel del Dueño·Cartera propia·Pricing); (4) **Preset IA** (Ingesta·Adaptación); (5)
  **Importaciones `impo`** (6 células); (6) **Transversales** (Producto por rubro·Delivery·Docs·FinOps·
  Release·Legal).
- **Estado por agente:** ✅ existe · 📐 definido (sin instanciar) · 🟡 parcial · 🆕 propuesto (faltante).
- **Agentes faltantes (§4 del doc):** propuestos con misión/IO/modelo/división, **pendientes de OK del dueño**.

## Consecuencias
- **(+)** Un **mapa único** de la compañía: se ve qué agente compone cada nodo y **dónde faltan** (huecos
  explícitos en vez de implícitos).
- **(+)** Base para el **diagrama** que se entrega al dueño y para decidir **qué faltantes activar**.
- **(−)** Documento vivo: hay que mantenerlo al día cuando se crean/activan agentes (tarea de Docs/PMO).
- **No instancia** ningún agente; los 🆕 requieren OK del dueño para nacer.

## Estado
**Aceptado — vigente.** El detalle (organigrama + equipos por nodo + briefs de faltantes) vive en
`docs/organizacion/roster-completo-gsg.md`; el diagrama en `docs/organizacion/estructura-gsg.mermaid`.
