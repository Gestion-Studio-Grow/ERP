---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0-gsg-congelada"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## Guidelines Source (congelada, sin red)

Las reglas viven en **`reglas.md`** (misma carpeta que este SKILL.md). Es una copia congelada
de `command.md` del repo `vercel-labs/web-interface-guidelines`, con su procedencia (sha y fecha)
en el encabezado del archivo.

- **Nunca** busques las reglas en internet ni uses herramientas de red para esta skill. Leé `reglas.md` con Read.
- Si `reglas.md` no existe o está vacío, frená y reportalo; no lo reemplaces por una versión bajada.
- La actualización es manual y gobernada por `.claude/rules/skills-externas.md` (bajar, diff, aprobar, commitear).

## How It Works

1. Read `reglas.md` (relative to this skill's folder).
2. Read the specified files (or prompt user for files/pattern).
3. Check against all rules in `reglas.md`.
4. Output findings in the terse `file:line` format defined in `reglas.md` ("Output Format").

## Usage

When a user provides a file or pattern argument:
1. Read `reglas.md`.
2. Read the specified files.
3. Apply all rules from `reglas.md`.
4. Output findings using the format specified in `reglas.md`.

If no files specified, ask the user which files to review.
