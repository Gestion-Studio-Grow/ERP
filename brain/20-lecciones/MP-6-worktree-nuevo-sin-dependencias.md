---
id: MP-6
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-6] Worktree nuevo sin dependencias

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> **`npm install` una vez por worktree**; no copiar `node_modules` ni depender de junctions para el build.

**Lección:** cada worktree necesita sus deps propias, instaladas limpias.

## Detalle

- **Síntoma:** un worktree nuevo no compila/testea; el build de Turbopack rechaza el `node_modules` por junction.
- **Causa raíz:** `git worktree add` **no** trae `node_modules` (gitignore); un junction sirve a `tsc`/test pero **no** al build.
- **Fix:** **`npm install` real** en cada worktree (materializar deps, no copiar/junction).
- **Lección:** cada worktree necesita sus deps propias, instaladas limpias.
- **Guardarraíl:** **`npm install` una vez por worktree**; no copiar `node_modules` ni depender de junctions para el build.
- **Refs:** ADR-039; memoria worktree.

## Decisiones relacionadas

- [ADR-039](../30-decisiones/ADR-039.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
