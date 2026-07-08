# Gate de Excelencia — Plantillería AR demo (auditado en Opus 4.8)

> Frente C · sprint · 2026-07-07. Los 4 bloques del Gate (CLAUDE.md) tildados **antes de pushear**.
> Elaborado por GSG.

## Bloque 1 — Auditoría SAP Fiori (7 ángulos) + ángulo argentino
- **Rol-based:** ✅ el visitante-comprador es el único rol; no hay backoffice en esta demo (venta pura). N/A el rol operador.
- **Coherente:** ✅ un solo sistema de tokens/CSS; header, cards, badges y botones consistentes en las 10 páginas.
- **Simple:** ✅ 3 clics de landing a "compra" (agregar → carrito → pagar); sin registro, sin fricción.
- **Adaptable (responsive + branding):** ✅ mobile-first, verificado **sin overflow horizontal a 375px**; grid del checkout colapsa a 1 columna < 720px. Marca del producto (Plantillería.ar) visible; sello GSG discreto.
- **Delightful/enterprise:** ✅ hero claro, emojis livianos (cero assets externos), toast al agregar, checkout con estética Mercado Pago reconocible.
- **Accesibilidad:** ✅ `lang="es-AR"`; `<details>`/`<summary>` nativos para FAQ (teclado); `aria-label` en carrito, qty y radios; `role="note"` en la cinta demo; `role="radiogroup"` en medios de pago; foco visible en inputs; contraste de marca (azul #2563eb sobre blanco) ok.
- **Consistencia:** ✅ no duplica patrones — la lógica de carrito vive **una sola vez** en `checkout.ts` (render server + cliente comparten el mismo módulo bundleado).
- **🇦🇷 Ángulo argentino (Argentinizar SAP):** ✅ copy criollo (ADR-046 zona humana); normativa real (ARCA, monotributo A–K, recategorización ene/jul, SAC Ley 27.073, LCT art. 150, dólar MEP/blue); **Mercado Pago** como medio (tarjeta/dinero en cuenta/Pago Fácil-Rapipago); precio USD con **referencia en ARS**; disclaimer ARCA/AFIP obligatorio en cada ficha y footer.

## Bloque 2 — Sello de marca GSG
- ✅ `<meta name="generator" content="Gestión Studio Grow">` en todas las páginas.
- ✅ Crédito discreto en el footer ("Hecho con estándar de calidad — Gestión Studio Grow") sin pisar la marca del producto (Plantillería.ar conserva su identidad visible).
- ✅ Trailer del equipo GSG en el commit.

## Bloque 3 — Excelencia de arquitectura
- ✅ **Capas/límites:** datos (`data/catalogo.ts`, fuente única) → lógica pura (`src/checkout.ts`, isomórfica, sin DOM) → render (`src/render.ts`) / cliente (`src/client.ts`). El precio se resuelve **siempre** contra el catálogo, no contra el storage (el cliente no puede inflar precios — test dedicado).
- ✅ **Testabilidad:** 18 tests `node:test` (lógica pura + smoke de render), sin DB ni red.
- ✅ **Escalabilidad/mantenibilidad:** agregar una plantilla = un objeto en el array (principio de dato maestro, ADR-055). Sin backend que escale.
- ✅ **Seguridad:** cero secretos, cero backend, cero datos reales; todo el estado en `localStorage` del visitante. Nada que aislar (demo sin multi-tenancy).
- ✅ **Deuda anotada:** los archivos `.xlsx/Sheet` reales de las 5 plantillas no están construidos (hoy el catálogo es copy real); anotado en PUBLICAR.md y SPEC.

## Bloque 4 — Confiabilidad de producción
- ✅ **tsc** `--noEmit` verde (strict, `noUnusedLocals`/`Parameters`).
- ✅ **tests** 18/18 verdes.
- ✅ **build** verde → `out/` (10 páginas + `globals.css` + `app.js` 13.6kb).
- ✅ **Manejo de errores:** parse de `localStorage` en try/catch (nunca rompe la página); `normalizarCarrito` descarta basura sin lanzar.
- ✅ **No rompe prod:** producto **aislado** en `celula-negocios-digitales/` (excluido del tsconfig del ERP); no toca `src/`, `prisma/`, ni el runtime del ERP. Sin migraciones, sin DB → sin Gate 2.

## Ciclo de gasto (ADR-030/031)
- ✅ DEMO puro: sin gasto, sin datos reales, sin persistencia server, sin secretos. Publicar (URL) es la acción §C que se **eleva al dueño** (Gate 1) — ver `PUBLICAR.md`.

**Veredicto:** ✅ los 4 bloques pasan. Apto para push a `frente/plantilleria` y para elevar la publicación a §C.
