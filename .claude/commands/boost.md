---
description: Modo BOOST — TODO en Opus 5 (máxima capacidad, sin ahorro) para sprints críticos
model: claude-opus-5
---

# 🚀 Modo BOOST — todo en Opus 5 (máxima capacidad)

**Qué hace:** pone el trabajo en **Opus 5** (`claude-opus-5`), la máxima capacidad, **sin optimizar
costo**. Es lo opuesto a `/economia` (el default). Usalo cuando la calidad/juicio pesa más que el gasto.

## Cuándo usar BOOST
- **Sprints críticos** de punta a punta (lanzamientos, migraciones, go-lives).
- Trabajo denso de **arquitectura, seguridad, dinero/fiscal, metodología** sostenido por varias tareas.
- Cuando querés el mejor criterio disponible en TODO el flujo, no solo en el tramo decisivo.

## Cuándo NO
- Volumen rutinario (implementación acotada, docs, tests, UI de rubro, exploración) → eso es `/economia`
  (Sonnet 5). Dejar BOOST puesto para eso **gasta de más sin ganar calidad**.

> **Cómo activarlo:** este comando corre en Opus 5. Para que **toda la sesión/sprint** quede en Opus,
> además elegí Opus 5 en el selector de modelo (o `/model opus`) — así persiste más allá de este
> comando. Al terminar el sprint crítico, volvé a `/economia` (default del proyecto) para no seguir
> gastando Opus en trabajo rutinario.
