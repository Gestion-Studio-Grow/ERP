---
name: gsg-build
description: Construye una pieza visual de GSG a partir de un brief: plan corto en castellano simple, implementación, verificación con los gates del repo y QA clic por clic. Usar después de /gsg-brief.
disable-model-invocation: true
argument-hint: <ruta del brief, ej. docs/briefs/hero-landing.md>
---
# Build GSG

Entrada: el brief en `$ARGUMENTS`. Si no existe, pedí la ruta en texto y no sigas.

## Fase 1 · Contexto (sin escribir código)
- Leé el brief, DESIGN.md y las reglas en `.claude/rules/`.
- Detectá el stack real en package.json (Next, Tailwind, GSAP, Motion, three/R3F y sus versiones).
- Si algo del brief contradice DESIGN.md o las reglas, gana DESIGN.md: anotá el supuesto y seguí.

## Fase 2 · Plan (y avanzar)
Máximo 15 líneas, castellano simple, sin jerga: qué archivos se tocan y por qué; qué librería de animación y por qué; cómo se verifica; riesgos.
**No esperes aprobación.** Decidí con criterio y avanzá. Frená y reportá sólo si el trabajo toca producción, migraciones de DB, gasto o exposición a un cliente (lo owner-level). Sin `AskUserQuestion` ni menús.

## Fase 3 · Construcción
- Seguí las skills de diseño y movimiento instaladas (impeccable, emil-design-eng).
- Sin fuentes, colores ni easings fuera de DESIGN.md. Solo tokens. Animar solo transform y opacity; prefers-reduced-motion contemplado.
- Contenido real del brief; sin lorem ipsum. Sin dependencias nuevas sin preguntar.

## Fase 4 · Verificación técnica (la del repo)
`npm run gates` · `npx tsc --noEmit` · `npm test` · `npm run build`. Si algo falla, arreglalo antes de avanzar. Si el hook design-lint reporta algo, corregilo.

## Fase 5 · QA real
- Delegá al agente **qa** (o `gsg-qa`) un recorrido end-to-end clic por clic de la pieza: entrar, navegar, interactuar según los criterios del brief, marcar callejones sin salida. "Que cargue" no es QA.
- Delegá al agente **visual-verifier** capturas en 375/768/1440 px, consola sin errores y prefers-reduced-motion.
- Corregí lo que reporten y repetí hasta que pase.

## Fase 6 · Simplificación
Delegá al agente **code-simplifier** sobre los archivos nuevos. Volvé a correr `npx tsc --noEmit` y `npm run gates`.

## Fase 7 · Cierre
3 líneas: qué se hizo, cómo se verificó (con rutas de capturas), qué falta. Tildá el Gate de Excelencia de CLAUDE.md. Sugerí `/gsg-review`.
