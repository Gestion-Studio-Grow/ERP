---
description: Modo BOOST — TODO en Opus (máxima capacidad, sin ahorro) para sprints críticos
model: claude-opus-5
---

# 🚀 Modo BOOST — todo en Opus (máxima capacidad)

**Qué hace:** pone el trabajo en **Opus** (`claude-opus-5`), la máxima capacidad, **sin optimizar
costo**. Es lo opuesto a `/economia` (el default). Usalo cuando la calidad/juicio pesa más que el gasto.

## Cuándo usar BOOST
- **Sprints críticos** de punta a punta (lanzamientos, migraciones, go-lives).
- Trabajo denso de **arquitectura, seguridad, dinero/fiscal, metodología** sostenido por varias tareas.
- Cuando querés el mejor criterio disponible en TODO el flujo, no solo en el tramo decisivo.

## Cuándo NO
- Nada: **Opus ya es el default del proyecto** desde ADR-091, así que BOOST dejó de ser un cambio de
  modelo y pasó a ser una **declaración de postura**: este sprint no se rutea nada a Fable, ni siquiera
  la generación de volumen. Para repartir generación a Fable, ver `/economia` (ahora "modo generación").

> **Cómo activarlo:** este comando corre en Opus. Para que **toda la sesión/sprint** quede en Opus,
> además elegí Opus en el selector de modelo (o `/model opus`) — así persiste más allá de este
> comando. Al terminar el sprint crítico, volvé a `/economia` (default del proyecto) para no seguir
> gastando Opus en trabajo rutinario.
