# Publicar a producción por GitHub Actions (etiqueta `gsg:publicar`)

Opción E del relevo de la orquestadora (`Factory-GSG/10-GOBIERNO/relevo-orquestadora-alternativas.md`),
aprobada por el dueño el 08/11/2026. Ninguna sesión publica a producción: una sesión (o el dueño) pone la
etiqueta en el PR y el workflow `.github/workflows/publicar.yml` hace la publicación con las reglas del
dueño (Factory-GSG `CLAUDE.md`, «la orquestadora gestiona las cuentas» y «Autorización del dueño:
publicar PR»), siempre igual y auditada en el PR.

## Cómo se usa

1. El PR apunta a `main`, no es borrador, viene de una rama del mismo repo y está **al día con `main`**
   (si quedó atrás: «Update branch» y esperar el CI).
2. Se le pone la etiqueta **`gsg:publicar`**.
3. El workflow comenta «en cola» y, cuando le toca (uno a la vez), corre:

| Paso | Qué verifica / hace | Si falla |
|---|---|---|
| 1 · precondiciones | quien etiquetó tiene write o más (y figura en `PUBLICAR_QUIENES` si está cargada); PR abierto, no borrador, no fork, mergeable, 0 commits atrás de main; el último deploy de producción está READY (ni en curso ni en ERROR) y `/api/health` responde | frena |
| 2 · CI igual que main | espera que terminen `gates.yml` y `release.yml` del commit del PR y compara **job por job** contra la última corrida de main. Un rojo que main también tiene (p. ej. la deuda de lint) no frena; un rojo nuevo, un job que falta o un job salteado que en main corre, sí | frena |
| 3 · cambios | frena si el PR toca `.github/`, `scripts/publicar/`, `scripts/release/`, el build de Vercel, las vallas, `vercel.json` o los `scripts` de `package.json`; si modifica/borra/renombra una migración existente; si una migración nueva **no es aditiva** (DROP, ALTER TYPE/enum, DELETE, TRUNCATE, RENAME, cambio de tipo, SET NOT NULL, RLS apagado, REVOKE, roles, CREATE OR REPLACE, SQL dinámico u ofuscado); si una migración nueva no está en `prisma/lote-deploy.txt`; o si hay migraciones y Vercel Production no tiene `MIGRATE_DATABASE_URL` | frena |
| 4 · respaldo | crea en Neon la rama `respaldo-pre-pr-<n>-<AAAAMMDD-hhmmss>` (UTC) desde la rama de producción | frena |
| 5 · merge | vuelve a chequear que el PR siga etiquetado, sin commits nuevos y que main no se haya movido; mergea **el sha exacto** que pasó el CI (merge commit `Merge PR #n: …`) | frena |
| 6 · Vercel | espera el deploy de producción del commit de merge hasta READY; después `/api/health` tiene que servir ese commit y `/api/ready` dar 200 | frena y avisa que el merge ya está en main |
| 7 · comentar | comenta el resultado en el PR (siempre) y quita la etiqueta | — |

Las migraciones las aplica `prisma migrate deploy` **dentro del build de Vercel** (`scripts/vercel-build.mjs`),
con sus propios frenos (lote declarado, árbitros del dinero, rol de la app). El workflow no toca la base salvo
para crear la rama de respaldo.

**Para reintentar:** corregir lo que dice el comentario y volver a poner la etiqueta.
**Para cancelar antes del merge:** quitar la etiqueta (el paso 5 lo verifica).
**Para pausar todo:** variable de repo `PUBLICAR_PAUSADO=1`.

## Modo simulación (por defecto)

Sin la variable `PUBLICAR_MODO`, o con cualquier valor distinto de `real`, el workflow corre **en simulación**:
hace todas las verificaciones (incluye leer Neon y Vercel con los tokens) pero **no crea el respaldo ni mergea**,
y comenta «SIMULACIÓN OK». El diseño pide una semana así antes de pasar a `PUBLICAR_MODO=real`.

## Qué tiene que cargar el dueño (una vez)

GitHub → repo `erp` → **Settings → Secrets and variables → Actions**.

**Secrets** (pestaña *Secrets*):

| Secreto | Qué es | De dónde sale |
|---|---|---|
| `NEON_API_KEY` | API key de Neon (puede ser una de proyecto) con permiso para crear ramas | Neon → Account/Project settings → API keys |
| `NEON_PROJECT_ID` | id del proyecto de producción (`xxx-xxx-12345678`) | Neon → Project settings → General |
| `VERCEL_TOKEN` | token de Vercel con acceso de lectura al proyecto `erp-ch` (deploys y nombres de variables) | Vercel → Account Settings → Tokens (scope: el team del proyecto) |
| `VERCEL_PROJECT_ID` | id del proyecto `erp-ch` (`prj_…`) | Vercel → proyecto → Settings → General |
| `PUBLICAR_GH_TOKEN` | token de GitHub que mergea. Fine-grained PAT del dueño, sólo repo `erp`, permisos *Contents: Read and write* y *Pull requests: Read and write*. Hace falta (no alcanza el `GITHUB_TOKEN`): un merge hecho con `GITHUB_TOKEN` no dispara el CI de main y la protección de rama puede rechazarlo | GitHub → Settings → Developer settings → Fine-grained tokens |

**Variables** (pestaña *Variables*):

| Variable | Valor | Obligatoria |
|---|---|---|
| `PUBLICAR_MODO` | `real` para publicar de verdad; vacía = simulación | no (default simulación) |
| `VERCEL_TEAM_ID` | `team_…` si el proyecto está en un team | sí si el proyecto es de un team |
| `PROD_URL` | dominio de producción (ya la usa `monitor-caidas.yml`; default `https://chestetica-erp.vercel.app`) | no |
| `NEON_BRANCH_ID` | `br-…` de la rama de producción, si no es la rama por defecto del proyecto | no |
| `PUBLICAR_QUIENES` | lista de usuarios de GitHub separados por coma que pueden publicar con la etiqueta | no (default: cualquiera con write) |
| `PUBLICAR_PAUSADO` | `1` para frenar toda publicación automática | no |

Además, una vez: crear la etiqueta `gsg:publicar` en el repo (Issues → Labels → New label).

Si falta un secreto, el workflow frena en el paso 1 y comenta cuál.

## Límites conocidos (léase antes de confiar)

- **No reemplaza la revisión del PR.** Verifica las reglas de publicación, no que el código sea bueno. Un PR que
  borra tests de la app y deja el CI verde se publica: la revisión del código sigue siendo de quien etiqueta.
- **El detector de migraciones es conservador, no un parser de Postgres.** Ante la duda frena (p. ej. un `DROP`
  dentro de un string de un `COMMENT`, o un `CREATE OR REPLACE` de una función nueva). Lo que frena ahí es
  owner-level: lo publica el dueño a mano o con orden explícita. El SQL dinámico (`EXECUTE`) sólo pasa en el
  idioma de RLS por tenant de los módulos (ENABLE RLS + DROP POLICY IF EXISTS + CREATE POLICY `tenant_isolation`
  con el predicado de `app.current_tenant_id`) y **sólo sobre tablas que la misma migración crea**.
- **El build de Vercel corre todo el código de la app con las variables de producción.** El workflow frena los
  cambios al build y a las vallas, pero cualquier código de la app se ejecuta en `next build`.
- **Cola de GitHub:** sólo queda una corrida esperando por grupo de concurrencia. Si se etiquetan tres PR
  seguidos, el del medio se cancela antes de empezar (el comentario «en cola» lo advierte): volver a etiquetarlo.
- **Respaldos de Neon:** el workflow crea ramas y **no las borra** (borrar es owner-level). El plan free de
  Neon tiene un tope de ramas por proyecto: cuando se llega, el paso 4 frena y el dueño borra las viejas.
- **Ventana de carrera:** entre el chequeo «main no se movió» y el merge pasan segundos; si alguien empuja a
  main justo ahí, el commit de merge lo incluye. El paso 5 verifica después que los padres del merge sean
  exactamente (main chequeado, commit del PR) y, si no, frena y lo dice.
- **«Sin errores nuevos» en Vercel** se mide con READY + `/api/health` sirviendo el commit + `/api/ready` 200.
  No lee los logs de runtime.

## Tests

`npm run test:publicar` (o `node --test scripts/publicar/*.test.mjs`): detector de migraciones (incluye
calibración contra el historial real de `prisma/migrations`), comparación de CI por job, clasificación de
archivos y un recorrido completo del script contra un GitHub/Vercel/Neon falsos (camino feliz, simulación y
cada freno). Corren en el CI dentro de `release.yml` (job «tren»).
