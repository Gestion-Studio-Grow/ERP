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

**Sesiones del sector AGENCIA GROW — Fase 0 adicional (obligatoria):** si la sesión trabaja en el
sector Agencia Grow (2º sector de la compañía), **antes de nada leé
`docs/sectores/agencia-grow/FUNDAMENTO.md`** — define quién sos (Consultor Experto / Desarrollador /
PMO del sector), qué tenés que hacer, con qué método y con qué objetivo (innovación + productos que
generen ganancias). Después seguí con el charter (`docs/sectores/agencia-grow.md`) y el último
análisis de mercado (`docs/sectores/agencia-grow/analisis-mercado/`). Es el equivalente sectorial de
esta exploración de arranque.

## Modo de trabajo autónomo

Las sesiones corren en modo autónomo. No usar `AskUserQuestion` ni ningún prompt/menú interactivo. Ante cualquier duda, asumir el criterio más simple y correcto, dejar el supuesto anotado y seguir sin frenar. Reportar todo por texto.

## Autorización y gates (política push-libre)

- **Autónomo hasta GitHub:** código → build → `tsc`/verificación → commit → **push a `main` (GitHub)** sin re-preguntar. GitHub es el destino por defecto de todo el trabajo.
- **Gate 1 — deploy a producción/Netlify:** el auto-publish de Netlify está apagado (`stop_builds`), así que el push a `main` **no publica ni gasta créditos**. Publicar en producción requiere OK explícito de Maxi (*"deployá"*). Ver `docs/METODO-ROLES.md` §4.
- **Gate 2 — `prisma migrate deploy`:** cambiar la estructura de la DB de producción (Neon) se **pausa y se reporta**; no se corre solo. Es lo único irreversible.
- **Neon en PLAN GRATUITO — cuidá el consumo:** minimizá conexiones y queries contra la DB de prod, evitá operaciones pesadas / escaneos completos / benchmarks contra prod, cuidá el compute time y el límite de horas del plan free. Para análisis o pruebas, leé schema/migraciones del **repo** (`prisma/schema.prisma`, `prisma/migrations/`) en vez de golpear la base real salvo que sea imprescindible.
- **Destructivo bloqueado** por config (force push, `reset --hard`, `migrate reset`, DROP, `rm -rf`).

