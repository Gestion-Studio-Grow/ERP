---
name: gsg-regla
description: Convierte una corrección del usuario en una regla permanente del proyecto, eligiendo el lugar correcto (lint determinista, regla por ruta, o CLAUDE.md). Usar cuando el usuario dice "guardalo como regla" o corrige algo por segunda vez.
disable-model-invocation: true
argument-hint: <la corrección, con tus palabras>
---
# Regla GSG

Corrección a convertir: "$ARGUMENTS". Si está vacía, usá la última corrección que me hiciste en esta conversación y confirmámela en una línea.

## Decidí el destino, en este orden
1. **¿Se puede chequear automáticamente?** (una fuente, un color, un easing, una propiedad, un patrón de código) → agregala a `.claude/hooks/design-lint.config.json` (listas allowedFonts / allowedHexColors) o como nueva regla en `design-lint.js`, con un mensaje de error que explique el porqué. Probala con un archivo que la viole y mostrame el error.
2. **¿Aplica solo a ciertos archivos?** → `.claude/rules/<tema>.md` con frontmatter `paths`.
3. **¿Es general?** → CLAUDE.md, en la sección que corresponda.

## Reglas de escritura
- Una línea, verificable, con el porqué entre paréntesis.
- No contradigas reglas existentes: buscá primero en CLAUDE.md, `.claude/rules/` y DESIGN.md. Si hay conflicto, mostrámelo y preguntá cuál gana.
- CLAUDE.md no crece: lo nuevo va a `.claude/rules/` salvo que sea una regla de gobierno general. Las reglas del repo (CLAUDE.md, `.claude/rules/skills-externas.md`) ganan sobre el kit.

## Cierre
Aplicá el cambio y mostrá el diff exacto en el reporte (sin esperar ok; lo owner-level se escala en texto). Recordá que la regla llega al equipo recién cuando se comitea por pathspec.
