---
id: MP-9
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-9] Frente reversible corriendo en Opus (modelo mal etiquetado)

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> **ningún frente arranca sin modelo declarado**; reversible → Sonnet; una sesión sin modelo etiquetado está **fuera de norma** y se corrige antes de trabajar.

**Lección:** un frente reversible en Opus **gasta juicio caro donde no hace falta** — el control (Gate) es lo único que va siempre en Opus, la ejecución reversible va en Sonnet.

## Detalle

- **Síntoma:** F3 (`frente/demo-vendible`) — trabajo **reversible** (demo sin datos reales) — corrió en **Opus**, cuando por norma le correspondía **Sonnet** (Plan de Ventana: Sonnet por defecto, Opus solo Gate/juicio crítico).
- **Causa raíz:** la sesión **no etiquetó/forzó su modelo** al abrir (o heredó Opus del contexto) — se saltó la §4 del Modelo de Trabajo ("cada célula declara y fija su modelo explícito").
- **Fix:** al despachar/abrir cada frente, **fijar el modelo explícito** (`/model sonnet` para ejecución reversible) como Paso 0 junto con la calibración; el PMO **verifica el etiquetado** al despachar.
- **Lección:** un frente reversible en Opus **gasta juicio caro donde no hace falta** — el control (Gate) es lo único que va siempre en Opus, la ejecución reversible va en Sonnet.
- **Guardarraíl:** **ningún frente arranca sin modelo declarado**; reversible → Sonnet; una sesión sin modelo etiquetado está **fuera de norma** y se corrige antes de trabajar.
- **Refs:** ADR-032, ADR-049; `docs/organizacion/asignacion-modelos-sprint.md`; Plan de Ventana 2026-07-08.


## Decisiones relacionadas

- [ADR-032](../30-decisiones/ADR-032.md)
- [ADR-049](../30-decisiones/ADR-049.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
