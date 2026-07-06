---
description: Modo ECONOMÍA (default) — Sonnet 5 para la mayoría; Opus 4.8 solo cuando lo amerita
model: claude-sonnet-5
---

# 🪙 Modo ECONOMÍA — política de modelos vigente (DEFAULT ACTIVO)

**Objetivo:** economía de costo/tokens **sin bajar la calidad donde importa**. Es el **modo por defecto**
del proyecto (default también fijado en `.claude/settings.json`). Para sprints críticos donde no se
quiere ahorrar, usá `/boost` (todo en Opus 4.8).

## Regla por defecto → **Sonnet 5** (`claude-sonnet-5`)
Usá Sonnet 5 para **la mayoría del trabajo**, que es la mayor parte del volumen:
- Implementación de features acotadas, UI de rubro/branding, componentes.
- Documentación, runbooks, playbooks, edición de docs.
- Tests, fixtures, scripts de tooling.
- Exploración/lectura de código, búsquedas, diagnósticos read-only.
- Provisioning/onboarding rutinario que sigue un playbook ya escrito.
- Cambios mecánicos, refactors locales, fixes de lint/tsc.

## Escalá a **Opus 4.8** (`claude-opus-4-8`) SOLO cuando lo amerita
Reservá Opus para lo de **alto juicio o alto riesgo**, donde un error es caro:
- **Arquitectura y diseño de sistema** — ADRs, límites de dominio, decisiones estructurales multi-tenant.
- **Seguridad** — RLS/aislamiento, auth, superficies expuestas, revisiones de seguridad.
- **Dinero / fiscal** — cobros, facturación/ARCA, representación de importes (Float↔Decimal), caja.
- **Metodología / gobernanza** — Gate de Excelencia, estándares transversales, reglas del sprint.
- **Auditorías de excelencia críticas** — SAP Fiori + sello GSG sobre entregables sensibles.
- **Decisiones de alto juicio o riesgo** — algo irreversible, ambiguo, o que toca prod/Neon/deploy.

## Criterio para decidir (rápido)
Preguntate: **¿un error acá es caro o difícil de revertir, o requiere criterio experto de sistema?**
- **Sí** → Opus 4.8 (`/boost` o `/model opus`).
- **No** (la mayoría) → **Sonnet 5**, seguí en economía.

En la duda dentro de una tarea grande: **empezá en Sonnet** (explorar, plan, borrador) y **escalá a
Opus** solo para el tramo de decisión crítica; volvé a Sonnet para ejecutar. No pagues Opus por volumen.

> **Cómo activarlo:** este comando corre en Sonnet 5. Para que TODA la sesión quede en Sonnet, además
> elegí Sonnet 5 en el selector de modelo (o `/model sonnet`). El default del proyecto ya es Sonnet
> (`.claude/settings.json`), así que las sesiones nuevas arrancan en economía. Para un sprint crítico
> completo en Opus → `/boost`.
