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
| 3 · cambios | frena si el PR toca `.github/`, `scripts/publicar/`, `scripts/release/`, el build de Vercel, las vallas, `vercel.json` o los `scripts` de `package.json`; si modifica/borra/renombra una migración existente; si una migración nueva **o cualquiera de las que nombra `prisma/lote-deploy.txt`** (el build aplica el lote) **no es aditiva**: DROP, ALTER TYPE/enum, DELETE, TRUNCATE, MERGE, upsert, RENAME, cambio de tipo, SET NOT NULL, UPDATE que pisa columnas existentes, RLS apagado o prendido sobre una tabla existente, políticas/triggers/reglas sobre tablas existentes, GRANT/REVOKE, roles, search_path, CALL, ALTER de funciones/vistas/secuencias, CREATE OR REPLACE, SQL dinámico u ofuscado. Además rige una **lista permitida**: el SQL se tokeniza (comentarios, strings, `"identificadores"`, `$$…$$`; así `UPDATE"Venta"SET…` se lee igual que con espacios) y cada sentencia tiene que ser CREATE TABLE, CREATE TYPE … AS ENUM, CREATE INDEX, ALTER TABLE … ADD COLUMN (nullable o con DEFAULT si la tabla existe) / ADD CONSTRAINT / SET DEFAULT (nunca sobre `tenantId`), el idioma RLS por tenant sobre tablas nuevas, políticas/triggers/INSERT sólo sobre tablas nuevas o un UPDATE de backfill de columnas nuevas, sin llamar funciones fuera de una lista corta del sistema; todo lo demás (SELECT f(), LOCK, INHERIT, OWNER, VALIDATE, CREATE FUNCTION, EVENT TRIGGER, otro esquema…) frena; si una migración nueva no está en el lote; o si hay migraciones y Vercel Production no tiene `MIGRATE_DATABASE_URL` | frena |
| 4 · respaldo | crea en Neon la rama `respaldo-pre-pr-<n>-<AAAAMMDD-hhmmss>` (UTC) desde la rama de producción | frena |
| 5 · merge | vuelve a chequear que el PR siga etiquetado, sin commits nuevos y que main no se haya movido; arma el commit de merge `Merge PR #n: …` con padres **exactos** (main verificado + el sha que pasó el CI) y mueve `main` con `force:false` (compare-and-swap): si main se movió en el medio, GitHub lo rechaza y **no se mergea nada** | frena |
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

**Primero, el environment `produccion`** (los secretos van ahí, **no** a nivel repo):

1. GitHub → repo `erp` → **Settings → Environments → New environment** → nombre `produccion`.
2. **Deployment branches and tags** → *Selected branches and tags* → agregar la regla `main` (sólo `main`).
   El workflow usa `pull_request_target`, que corre en el contexto de main: pasa la regla. Cualquier job
   lanzado desde otra rama (por ejemplo un workflow nuevo que alguien agregue en un PR) no puede usar el
   environment ni leer sus secretos.
3. **No** poner *Required reviewers* ni *Wait timer*: la aprobación del dueño es la etiqueta (si se ponen,
   cada publicación queda esperando un clic).
4. Si los secretos ya estaban cargados a nivel repo (*Settings → Secrets and variables → Actions → Repository
   secrets*), **borrarlos de ahí** después de cargarlos en el environment: a nivel repo los puede leer
   cualquier workflow de cualquier rama.

Además el workflow sólo arranca para PR **contra main** (`branches: [main]`).

**Secrets del environment `produccion`** (Settings → Environments → `produccion` → *Environment secrets*):

| Secreto | Qué es | De dónde sale |
|---|---|---|
| `NEON_API_KEY` | API key de Neon (puede ser una de proyecto) con permiso para crear ramas | Neon → Account/Project settings → API keys |
| `NEON_PROJECT_ID` | id del proyecto de producción (`xxx-xxx-12345678`) | Neon → Project settings → General |
| `VERCEL_TOKEN` | token de Vercel con acceso de lectura al proyecto `erp-ch` (deploys y nombres de variables) | Vercel → Account Settings → Tokens (scope: el team del proyecto) |
| `VERCEL_PROJECT_ID` | id del proyecto `erp-ch` (`prj_…`) | Vercel → proyecto → Settings → General |
| `PUBLICAR_GH_TOKEN` | token de GitHub que mergea. Fine-grained PAT del dueño, sólo repo `erp`, permisos *Contents: Read and write* y *Pull requests: Read and write*. Hace falta (no alcanza el `GITHUB_TOKEN`): un merge hecho con `GITHUB_TOKEN` no dispara el CI de main. El merge mueve `main` directo (ver paso 5): si algún día se protege `main`, el dueño del token tiene que poder saltear la protección (*bypass*) | GitHub → Settings → Developer settings → Fine-grained tokens |

**Variables** (pueden quedar a nivel repo, pestaña *Variables*, o en el environment; no son secretas):

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
- **El detector de migraciones es conservador, no un parser de Postgres.** No puede saber qué hace una función que ya existe en la base si una migración la llama dentro de un SELECT (CALL sí frena). Ante la duda frena (p. ej. un `DROP`
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
- **Sin ventana de carrera en el merge:** `main` se mueve sólo si sigue donde se verificó (fast-forward al
  commit de merge con padres exactos). Si alguien empuja a main en el medio, el paso 5 frena sin tocar main.
- **Ids de cuentas:** `NEON_PROJECT_ID` y `VERCEL_PROJECT_ID` se enmascaran en el log (`::add-mask::`) y se
  tachan (`***`) de todo lo que va al comentario del PR, incluidos los mensajes de error de las APIs.
- **«Sin errores nuevos» en Vercel** se mide con READY + `/api/health` sirviendo el commit + `/api/ready` 200.
  No lee los logs de runtime.

## Tests

`npm run test:publicar` (o `node --test scripts/publicar/*.test.mjs`): detector de migraciones (incluye
calibración contra el historial real de `prisma/migrations`), comparación de CI por job, clasificación de
archivos y un recorrido completo del script contra un GitHub/Vercel/Neon falsos (camino feliz, simulación y
cada freno, incluidos los intentos de evasión de la certificación adversarial). Corren en el CI dentro de `release.yml` (job «tren»).
