---
name: gsg-review
description: Revisión completa de una pieza de GSG antes de entregar. Gates del repo, QA clic por clic, verificación visual con Playwright, guardián de marca, auditoría de animaciones y guías de diseño web. Entrega un reporte con semáforo en castellano simple.
disable-model-invocation: true
argument-hint: [ruta del componente o URL local de la pieza]
---
# Review GSG

Objetivo: decir, sin jerga, si la pieza está lista. Sin `AskUserQuestion` ni menús.

## Pasos
1. Identificá los archivos cambiados (`git diff --name-only` contra `main`) y la URL local de la pieza (`$ARGUMENTS` si se pasó).
2. Gates del repo: `npm run gates` · `npx tsc --noEmit` · `npm test` · `npm run build`. Si alguno está rojo, el reporte es 🔴 y se frena acá.
3. Delegá en paralelo:
   - **qa** (o `gsg-qa`): recorrido end-to-end clic por clic según los criterios del brief; callejones sin salida.
   - **visual-verifier**: capturas en 375, 768 y 1440 px; consola sin errores; prefers-reduced-motion activado.
   - **brand-guardian**: cambios contra DESIGN.md y `.claude/rules/`.
4. Aplicá la skill **review-animations** sobre el diff y **web-design-guidelines** sobre los archivos tocados.
5. Si hay servidor local, corré Lighthouse (`npx lighthouse <url> --only-categories=performance,accessibility,best-practices --quiet --chrome-flags="--headless"`). Si no se puede, decilo.
6. Guardá capturas y reporte en `docs/reviews/<AAAA-MM-DD>-<slug>/`.

## Formato del reporte (obligatorio)
```
🟢/🟡/🔴 Gates (gates · tsc · test · build) — una línea
🟢/🟡/🔴 QA clic por clic — una línea
🟢/🟡/🔴 Marca — una línea
🟢/🟡/🔴 Movimiento — una línea
🟢/🟡/🔴 Responsive — una línea
🟢/🟡/🔴 Accesibilidad — una línea
🟢/🟡/🔴 Performance — puntajes Lighthouse
```
Cada 🟡 o 🔴 lleva debajo: qué pasa, dónde (archivo o captura), cómo se arregla. Los 🔴 se corrigen en la misma sesión; los 🟡 quedan en la lista de pendientes. Sólo lo owner-level (gasto, cliente, producción) se escala como pregunta en texto.
