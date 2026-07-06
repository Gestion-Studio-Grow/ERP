@AGENTS.md

## Arranque de sesión — OBLIGATORIO SIEMPRE (regla de alto nivel)

**Toda sesión de trabajo sobre este proyecto debe EMPEZAR por revisar el estado del repo para una
gestión correcta del proyecto.** Es obligatorio siempre, en Claude Code (desktop) y en Dispatch
(móvil), se use o no el comando `sprint`. Antes de tocar nada, revisá como mínimo:

- **`docs/ESTADO-ACTUAL.md`** — la foto viva del sistema (main/prod, tenants, gates, migraciones,
  bugs conocidos, core→sesión). Si no existe o está desactualizada, **actualizala primero**.
- **`git status`** + tip de `main` y ramas/worktrees — WIP sin commitear y en qué estado está el árbol.
- **Migraciones pendientes** — `prisma/migrations/` vs lo aplicado (según docs; no golpear Neon),
  incluidas **colisiones de timestamp**.

Sin esa foto no se despacha ni se ejecuta nada. Cuando la sesión se abre con `sprint`, esto es su
**FASE 0 Exploración** (Paso 0 no salteable en `.claude/commands/sprint.md`); cuando no, igual aplica.

**Estructura de la compañía — TRES unidades bajo Gestión Studio Grow (estudio paraguas):** (1) **ERP
multi-tenant** (producto SaaS core); (2) **Agencia Digital** (satélite del ERP: lo vende y le suma
features; `docs/sectores/agencia-digital.md`); (3) **Agencia Grow** (los **negocios propios del grupo**,
NO satélite del ERP; `docs/sectores/agencia-grow.md`). Regla: gira alrededor del ERP → Digital; negocio
propio del grupo → Grow. Ver `docs/ESTADO-ACTUAL.md §7`.

**Sesiones del sector AGENCIA DIGITAL — Fase 0 adicional (obligatoria):** si la sesión trabaja en el
sector Agencia Digital, **antes de nada leé `docs/sectores/agencia-digital/FUNDAMENTO.md`** — define
quién sos (Consultor Experto / Desarrollador / PMO del sector), qué tenés que hacer, con qué método y
con qué objetivo. Después seguí con el charter (`docs/sectores/agencia-digital.md`) y el último análisis
de mercado (`docs/sectores/agencia-digital/analisis-mercado/`).

**Sesiones de AGENCIA GROW — Fase 0 adicional (obligatoria):** si la sesión trabaja en negocios propios
del grupo (Panel del Dueño, cartera propia), **antes de nada leé `docs/sectores/agencia-grow.md`**.

## Modo de trabajo autónomo

Las sesiones corren en modo autónomo. No usar `AskUserQuestion` ni ningún prompt/menú interactivo. Ante cualquier duda, asumir el criterio más simple y correcto, dejar el supuesto anotado y seguir sin frenar. Reportar todo por texto.

## Gate de Excelencia — OBLIGATORIO, NO SALTEABLE (regla de alto nivel)

**Ningún cambio se integra ni se pushea a `main` sin pasar el GATE DE EXCELENCIA (UX + Arquitectura +
Confiabilidad).** Aplica a **toda sesión/frente de ambos sectores**, desktop y móvil. Es adicional a
"verde antes de commitear" (tsc+build+test), no lo reemplaza. Fundamento transversal para **todos los
agentes**: filosofía **SAP/Fiori** — *rol-based · coherente · simple · adaptable · delightful · calidad
enterprise*. Checklist corto que cada frente tilda **antes de pushear**:

1. **Excelencia UX (SAP/Fiori):** rol-based · coherente (design system) · simple · adaptable
   (responsive + branding por tenant) · delightful/enterprise (estados carga/vacío/error).
2. **Excelencia Arquitectura:** capas/límites de dominio · testabilidad · escalabilidad multi-tenant
   (predicado `tenantId` / `tenantTransaction`) · seguridad/RLS (no evade aislamiento) · deuda anotada.
3. **Confiabilidad de Producción:** `tsc`+`build`+`test` verdes · aislamiento por tenant · manejo de
   errores · no rompe prod (schema = migración SIN aplicar, Gate 2).

Ítem que no aplica → **N/A + por qué**. Si no tilda los 3 bloques, **no se integra**. Detalle completo
en `docs/METODOLOGIA-SPRINT.md` → "GATE DE EXCELENCIA" (checklist para el handoff de PR/commit).

## Autorización y gates (política push-libre)

- **Autónomo hasta GitHub:** código → build → `tsc`/verificación → **gate de excelencia** → commit → **push a `main` (GitHub)** sin re-preguntar. GitHub es el destino por defecto de todo el trabajo.
- **Gate 1 — deploy a producción/Netlify:** el auto-publish de Netlify está apagado (`stop_builds`), así que el push a `main` **no publica ni gasta créditos**. Publicar en producción requiere OK explícito de Maxi (*"deployá"*). Ver `docs/METODO-ROLES.md` §4.
- **Gate 2 — `prisma migrate deploy`:** cambiar la estructura de la DB de producción (Neon) se **pausa y se reporta**; no se corre solo. Es lo único irreversible.
- **Neon en PLAN GRATUITO — cuidá el consumo:** minimizá conexiones y queries contra la DB de prod, evitá operaciones pesadas / escaneos completos / benchmarks contra prod, cuidá el compute time y el límite de horas del plan free. Para análisis o pruebas, leé schema/migraciones del **repo** (`prisma/schema.prisma`, `prisma/migrations/`) en vez de golpear la base real salvo que sea imprescindible.
- **Destructivo bloqueado** por config (force push, `reset --hard`, `migrate reset`, DROP, `rm -rf`).

