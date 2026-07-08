# Postora — Retro del frente (ADR-047)

— Frente D del sprint · Célula de Negocios Digitales · 2026-07-07 · Opus

## 3 palancas

### 1. Memoria (facts al día)
- Postora dejó de ser "solo análisis": ya es MVP con SPEC+ARQ+PLAN+código+demo, patrón idéntico a
  kudos/fantasma/testigo/plantillería. Vive en `celula-negocios-digitales/productos/postora/`.
- Node 24 corre TS nativo pero en **strip-only mode**: no soporta *parameter properties*
  (`constructor(private x)`) ni enums. Escribir campos explícitos y uniones de string literales.
- Los productos de la célula no necesitan node_modules del repo: son autocontenidos (typescript para
  `tsc`, `node --test` para tests con stripping nativo). Se corren con los binarios del worktree principal.

### 2. Casos (qué funcionó / qué falló)
- **Funcionó:** clavar las 3 objeciones del red-team como requisitos de diseño desde el minuto 0
  (moat = Kit de Marca; margen = routing+caching+tope+imagen-por-crédito; churn = Reporte de Resultados
  atado a ventas). El producto salió coherente porque el SPEC se organizó alrededor de esos antídotos.
- **Funcionó:** separar la identidad de Postora (chrome producto) de la marca del cliente (posteos
  cálidos) en el demo web — resuelve el cliché "crema+terracota+serif" que justo es la paleta del comercio
  demo, y de paso es la tesis del producto ("tu marca, nuestro motor").
- **Falló y se corrigió:** primeros tests rojos por *parameter property* en `GeneradorPostora` (Node
  strip-only). Fix: campo explícito. Los tests `node:test` necesitaron un `.d.ts` ambiental para que `tsc`
  valide sin `@types/node`.
- **Flaky:** `preview_screenshot` timeouteó contra `python http.server`; se verificó por eval/CSSOM/inspect
  (charset, render, interactividad, tokens de color) — proof suficiente sin la captura.

### 3. Mejora de brief/skill (1)
- Para la célula: agregar al brief de "nuevo producto" un recordatorio de **restricciones de Node
  strip-only** (sin parameter properties ni enums) y del patrón de tests (`node:test` + `.d.ts` ambiental
  para compilar sin `@types/node`). Ahorra el ciclo rojo→fix que tuvimos acá.

## Vallas + Gate
`tsc --noEmit` ✔ · 28 tests ✔ · build ✔ · Gate de Excelencia ✔ (SAP+GSG+Arq+Confiabilidad, ver PLAN.md).

## Unit economics — el número que importa
COGS medido ~US$0,0025/posteo (Haiku ideación + Sonnet copy, Kit cacheado). Contra ticket US$29–59 y
excedente US$1,00–1,50/posteo (>150× el COGS), **ningún cliente pesado deja el margen en rojo** — verificado
en test (`planes.test.ts`) y en el demo interactivo (Barrio + cliente pesado = 99% margen).
