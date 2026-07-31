---
id: MP-12
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-12] `ESTADO-ACTUAL.md` con drift INTERNO — el HANDOFF avanza pero el §1/§8 quedan viejos

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> en FASE 0, **verificar contra git (no contra el propio doc)** los 3 anclas duras — `main HEAD` (§1), estado de frentes (§7-bis) y `.claude/agents/` (§8) — y reconciliar TODAS las secciones que citen esos hechos, no solo el banner. "Gana el repo" aplica también a las contradicciones internas.

**Lección:** el drift no es solo doc-vs-repo; también es **sección-vs-sección dentro del mismo doc**. Actualizar el HANDOFF no equivale a actualizar la foto.

## Detalle

- **Síntoma:** en FASE 0, el banner HANDOFF ya marcaba F1 mergeado (`debb3c5`) pero el **§1** (`main HEAD` = `29e9dcb`), el **§7-bis** (F1 "WIP sin mergear") y el **§8** (`.claude/agents/` "NO existe") seguían en el snapshot viejo. El commit de cierre tocó solo la parte de arriba y dejó las tablas de abajo desincronizadas dentro del **mismo archivo**.
- **Causa raíz:** el cierre de sprint actualiza el HANDOFF (lo que se lee primero) pero no re-barre las secciones de detalle; el doc queda **coherente arriba, stale abajo**, y quien lee §1/§8 saca una foto falsa.
- **Fix:** FASE 0 reconcilió contra git puro (`main` real `6c88719`, 18 archivos en `.claude/agents/`): §1 `29e9dcb`→`6c88719`, §8 "NO existe"→"18 agentes materializados", §7-bis F1→MERGEADO, footer "Para retomar" al día. Doc-only, reversible, sin tocar prod.
- **Lección:** el drift no es solo doc-vs-repo; también es **sección-vs-sección dentro del mismo doc**. Actualizar el HANDOFF no equivale a actualizar la foto.
- **Guardarraíl:** en FASE 0, **verificar contra git (no contra el propio doc)** los 3 anclas duras — `main HEAD` (§1), estado de frentes (§7-bis) y `.claude/agents/` (§8) — y reconciliar TODAS las secciones que citen esos hechos, no solo el banner. "Gana el repo" aplica también a las contradicciones internas.
- **Refs:** MP-5 (sin la foto no se despacha), ADR-039 (FASE 0), ADR-047 (retro).

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
