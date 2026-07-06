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

**Fase 2 — Análisis detallado por oportunidad: EN CURSO (2026-07-06).** OK del dueño sobre el shortlist
recibido. Primer análisis consolidado (NCM+arancel, costo landeado, proveedores, precio de venta,
competencia, margen) hecho por el **PMO en solitario** (Sonnet 5) para los 2 candidatos top —
**todavía sin abrir las 3 células analistas** (modo ahorro / tope de 4 concurrentes, hay un equipo de QA
corriendo en paralelo en otro frente). El candidato #3 recibió un plan de prueba vía courier en vez de
análisis completo.

- **#1 Botellas/termos de acero inoxidable** — `analisis/analisis-termos-botellas-acero.md`. Margen bruto
  estimado 54-63% (rangos provisionales). Riesgo regulatorio bajo; ventana temprana post-antidumping.
- **#2 Línea zero-waste de bambú** — `analisis/analisis-bambu-zerowaste.md`. Margen bruto estimado
  55-74%. Demanda ya validada en Mercado Libre; ticket unitario chico, compensa con pack/combo.
- **#3 Bolsas/envases reutilizables** — `analisis/prueba-courier-bolsas-reutilizables.md`. Plan de
  muestra vía régimen courier, sin costeo landeado completo todavía.

**Pendiente de esta fase (cuando se abra la Ola 1):** cotización firme de proveedor, arancel exacto
(NCM 9617.00.10 y 9603.21.00) vía despachante/VUCE, y precio de venta confirmado con listados reales de
Mercado Libre — los números de hoy son estimaciones de mercado marcadas *provisional*, no un costeo
cerrado para aprobar una orden.

## Qué hay armado

- `fundamento-mercado-ar.md` — cimiento de régimen (Fase 0), con fuentes y "a confirmar" marcados donde
  el dato depende del producto puntual o cambia seguido.
- `shortlist-oportunidades.md` — 5 candidatos priorizados (Fase 1), con qué se descartó y por qué.
- `analisis/analisis-termos-botellas-acero.md` · `analisis/analisis-bambu-zerowaste.md` ·
  `analisis/prueba-courier-bolsas-reutilizables.md` — Fase 2, primer análisis consolidado por PMO.
- `ESTADO.md` (este archivo).

## Qué falta (siguiente paso propuesto)

1. **Abrir Ola 1 (máx. 4 sesiones, cuando el dueño/PMO decida sumar cupo):** Analista de proveedores
   China (cotización firme de 2-3 proveedores para termo y línea de bambú) + Analista de
   costos/logística/aduana (cerrar arancel exacto vía VUCE/despachante, angostar el rango de costo
   landeado) — profundizan lo que el PMO dejó en estimación *provisional*.
2. **Correr en paralelo (bajo costo):** la prueba de muestra courier del candidato #3.
3. **Ola 2 (después):** Analista de mercado local/pricing (confirmar precio de venta con scraping real de
   Mercado Libre) + Analista de logística/fulfillment.
4. **Recién con todo eso cerrado:** el PMO arma el carrito curado (`carrito/`) para aprobación del dueño.

## Worktree / branch de este frente

- Worktree: `estetica-erp-importaciones` · branch `frente/importaciones` (base: `origin/main` limpio,
  aislado del WIP de otras sesiones sobre `main`).
- Push por pathspec, nunca `-A` (working tree compartido entre frentes).

— Elaborado por GSG
