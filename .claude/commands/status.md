---
description: Parte de STATUS del sprint — resumen ejecutivo sin tecnicismos + semáforo por ola + global % + roadmap visual, SIEMPRE reconstruido del repo (no de memoria).
---

Entregá el **parte de STATUS** siguiendo AL PIE el **Ritual de STATUS** canónico de
`docs/estrategia/prompts-arranque-sprint.md §9`. Sos el **PMO** (vía Dispatch).

**Regla dura — reconstruí SIEMPRE desde el repo, nunca de memoria:**
1. Leé `docs/ESTADO-ACTUAL.md` (banner HANDOFF) + el Plan de Ventana vigente.
2. `git fetch --all --prune` + `git branch -a` + `git worktree list` + estado de gates y migraciones.
3. Reconciliá contra `ESTADO-ACTUAL`; si algo no coincide, **gana el repo**.

**Entregá los 4 bloques (formato fijo de §9):**
1. **Resumen ejecutivo SIN tecnicismos** — cada ítem en criollo simple (ADR-046 zona humana) + su **% de avance**.
2. **Por ola/frente** con semáforo: 🟢 listo (100%) · 🟡 en curso (%) · 🔵 planeado sin trabas · 🔴 espera OK del dueño (§C — decí QUÉ necesita: credencial/deploy/dato/migración).
3. **Global** — % agregado (aprobado + en curso) + 1 línea de lectura.
4. **Roadmap visual** — **ofrecé armarlo** (global GSG + ERP, por fases/olas, color por estado); si el dueño acepta, prepará el gráfico (SVG/HTML/mermaid).

**El % sale de evidencia del repo** (tests verdes, merge hecho, Gate pasado, migración aplicada), nunca inventado.
Read-only: no abras worktrees ni toques prod. — Elaborado por GSG.
