---
id: MP-2
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-2] Sesiones pisándose en el tree compartido

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> **pathspec siempre, nunca `-A`**; editar sobre `origin/main` en worktree descartable; una vez en `origin/main` es permanente.

**Lección:** en tree compartido, lo no commiteado **no es canon**; no ratificar WIP ajeno.

## Detalle

- **Síntoma:** WIP ajeno mezclado; riesgo de commitear/clobberear trabajo de otra sesión (teardown de canon).
- **Causa raíz:** **varias sesiones sobre el MISMO working tree**; `git add -A` arrastra lo ajeno.
- **Fix:** **commit por pathspec**, nunca `-A`; **verificar origin** en una tirada; **worktree temporal** para editar canon sin clobber.
- **Lección:** en tree compartido, lo no commiteado **no es canon**; no ratificar WIP ajeno.
- **Guardarraíl:** **pathspec siempre, nunca `-A`**; editar sobre `origin/main` en worktree descartable; una vez en `origin/main` es permanente.
- **Refs:** ADR-039; memoria commit-race.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
