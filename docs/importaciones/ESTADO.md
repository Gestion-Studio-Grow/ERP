# ESTADO — Frente Importaciones GSG

> **Foto viva del frente.** Se actualiza en cada sesión que toca `docs/importaciones/`. Ver
> `.claude/commands/impo.md` para visión, roles y roadmap completo.

## Fase actual

**Fase 0 — Fundamento: CERRADA (2026-07-06).**
`fundamento-mercado-ar.md` documenta qué puede importar HOY la Argentina (régimen, licencias, aranceles
por categoría, tipo de cambio/acceso a divisas). Corrido en **Sonnet 5** (arranque a pedido del dueño; el
resto del roadmap escala a Opus 4.8 cuando el dueño decida boost de juicio).

**Fase 1 — Detección de oportunidades: NO INICIADA.** Sin categorías/productos en estudio todavía. No se
abrieron las células analistas (oportunidades / proveedores China / costos-logística / mercado-pricing /
fulfillment) — el dueño pidió NO abrirlas aún, solo Fase 0, para no pasar el tope de concurrencia y
decidir en conjunto si sumar analistas en olas (≤4 sesiones a la vez).

## Qué hay armado

- `fundamento-mercado-ar.md` — cimiento de régimen (Fase 0), con fuentes y "a confirmar" marcados donde
  el dato depende del producto puntual o cambia seguido.
- `ESTADO.md` (este archivo).

## Qué falta (siguiente paso propuesto)

1. **Definir con el dueño 2-3 categorías candidatas** para arrancar el primer carrito (el fundamento
   sugiere candidatos de ticket bajo/alta rotación: pequeños electrodomésticos, accesorios electrónicos
   con certificación CCC ya aceptada, juguetes) — sin esto, el Analista de oportunidades no tiene bocado.
2. **Ola 1 (recién ahí, máx. 4 sesiones):** PMO + Analista de oportunidades + Analista de proveedores
   China + Analista de costos/logística/aduana (ya tiene el cimiento, arranca el costeo landeado por NCM
   de las categorías elegidas).
3. **Ola 2:** Analista de mercado local/pricing + Analista de logística/fulfillment.

## Worktree / branch de este frente

- Worktree: `estetica-erp-importaciones` · branch `frente/importaciones` (base: `origin/main` limpio,
  aislado del WIP de otras sesiones sobre `main`).
- Push por pathspec, nunca `-A` (working tree compartido entre frentes).

— Elaborado por GSG
