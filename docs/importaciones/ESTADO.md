# ESTADO — Frente Importaciones GSG

> **Foto viva del frente.** Se actualiza en cada sesión que toca `docs/importaciones/`. Ver
> `.claude/commands/impo.md` para visión, roles y roadmap completo.

## Fase actual

**Fase 0 — Fundamento: CERRADA (2026-07-06).**
`fundamento-mercado-ar.md` documenta qué puede importar HOY la Argentina (régimen, licencias, aranceles
por categoría, tipo de cambio/acceso a divisas). Corrido en **Sonnet 5** (arranque a pedido del dueño; el
resto del roadmap escala a Opus 4.8 cuando el dueño decida boost de juicio).

**Fase 1 — Detección de oportunidades: CERRADA (2026-07-06), preselección de PMO.**
`shortlist-oportunidades.md` — 5 candidatos filtrados por criterio del dueño (bajo costo + sustentable),
cruzados contra el cimiento de Fase 0. Corrido **en solitario por el PMO** (Sonnet 5), sin abrir la ola de
analistas todavía — sigue en modo ahorro/tope de 4 concurrentes. Top 2: **botellas/termos reutilizables
de acero inoxidable** (antidumping recién eliminado 2025) y **línea zero-waste de bambú**.

**Fase 2 — Análisis detallado por oportunidad: NO INICIADA.** Requiere abrir Ola 1 (Analista de
oportunidades + proveedores China + costos/logística/aduana) para profundizar el costeo landeado real
por NCM de los candidatos del shortlist — el dueño decide cuándo sumar esa ola.

## Qué hay armado

- `fundamento-mercado-ar.md` — cimiento de régimen (Fase 0), con fuentes y "a confirmar" marcados donde
  el dato depende del producto puntual o cambia seguido.
- `shortlist-oportunidades.md` — 5 candidatos priorizados (Fase 1), con qué se descartó y por qué.
- `ESTADO.md` (este archivo).

## Qué falta (siguiente paso propuesto)

1. **OK del dueño sobre el shortlist** — confirmar si arranca por #1 (termos) + #2 (bambú), o si quiere
   reordenar/sumar otro candidato antes de abrir la Ola 1.
2. **Ola 1 (recién ahí, máx. 4 sesiones):** PMO + Analista de oportunidades + Analista de proveedores
   China + Analista de costos/logística/aduana — costeo landeado por NCM de los 1-2 candidatos elegidos,
   sourcing puntual en Alibaba/1688 (MOQ, muestras, proveedor).
3. **Ola 2:** Analista de mercado local/pricing + Analista de logística/fulfillment.

## Worktree / branch de este frente

- Worktree: `estetica-erp-importaciones` · branch `frente/importaciones` (base: `origin/main` limpio,
  aislado del WIP de otras sesiones sobre `main`).
- Push por pathspec, nunca `-A` (working tree compartido entre frentes).

— Elaborado por GSG
