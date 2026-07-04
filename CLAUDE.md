@AGENTS.md

## Modo de trabajo autónomo

Las sesiones corren en modo autónomo. No usar `AskUserQuestion` ni ningún prompt/menú interactivo. Ante cualquier duda, asumir el criterio más simple y correcto, dejar el supuesto anotado y seguir sin frenar. Reportar todo por texto.

## Autorización y gates (política push-libre)

- **Autónomo hasta GitHub:** código → build → `tsc`/verificación → commit → **push a `main` (GitHub)** sin re-preguntar. GitHub es el destino por defecto de todo el trabajo.
- **Gate 1 — deploy a producción/Netlify:** el auto-publish de Netlify está apagado (`stop_builds`), así que el push a `main` **no publica ni gasta créditos**. Publicar en producción requiere OK explícito de Maxi (*"deployá"*). Ver `docs/METODO-ROLES.md` §4.
- **Gate 2 — `prisma migrate deploy`:** cambiar la estructura de la DB de producción (Neon) se **pausa y se reporta**; no se corre solo. Es lo único irreversible.
- **Neon en PLAN GRATUITO — cuidá el consumo:** minimizá conexiones y queries contra la DB de prod, evitá operaciones pesadas / escaneos completos / benchmarks contra prod, cuidá el compute time y el límite de horas del plan free. Para análisis o pruebas, leé schema/migraciones del **repo** (`prisma/schema.prisma`, `prisma/migrations/`) en vez de golpear la base real salvo que sea imprescindible.
- **Destructivo bloqueado** por config (force push, `reset --hard`, `migrate reset`, DROP, `rm -rf`).

