# Control de push y despliegues de Vercel (plan gratis)

Orden del dueño del 15/11/2026: seguir en el plan gratis de Vercel sin llegar al tope de **100 despliegues
por día** (https://vercel.com/docs/plans/hobby). Los cancelados también cuentan
(https://vercel.com/docs/project-configuration/project-settings). Método completo: Factory-GSG
`10-GOBIERNO/despliegues-vercel.md`. Decisión sobre las ramas viejas (VERCEL-RAMAS-VIEJAS, opción A):
un control que rechace el push. **No se borra ninguna rama.**

## 1. Qué despliega

`vercel.json` → `git.deploymentEnabled`: `"**": false`, `"main": true`, `"tanda/**": false`. Si una rama
cumple varias reglas, despliega cuando al menos una es `true`
(https://vercel.com/docs/project-configuration/git-configuration). Así, **sólo `main` despliega**.

¿Por qué `tanda/**` pasó a `false`? `scripts/vercel-ignore.mjs` cancela toda rama que no sea main y no
traiga «[preview]», y nadie usa «[preview]» (no aparece en `docs/` ni en `.claude/`). Cada push a una rama
`tanda/` gastaba un despliegue cancelado. El smoke de `release.yml` sólo corre cuando Vercel avisa de un
despliegue terminado bien (`deployment_status` = success): sobre una tanda nunca corría. Lo que verifica
una tanda hoy:

- el CI del PR de la tanda (`gates.yml`, con build);
- `npm run release:preparar` en local;
- después del merge, el paso 6 de `publicar.yml` y el smoke de producción de `release.yml`.

Si alguna vez hace falta una vista previa real de una tanda, la decide el dueño: cuesta un despliegue.

## 2. El control de push

`scripts/git-hooks/pre-push.mjs` es un gancho `pre-push` de git. Frena **antes de que el push salga de la
máquina**, así que GitHub no lo recibe y Vercel tampoco. Rechaza el push si el `vercel.json` del commit
empujado no trae `git.deploymentEnabled` con `"**": false`. Es lo mismo que «la rama no trae `fbf64d7`»,
pero sirve también en clones superficiales, como los de la nube.

- **Se instala solo** en cada sesión de Claude Code, nube o local: lo hace el SessionStart
  (`.claude/scripts/preparar-nube.sh`). A mano: `node scripts/git-hooks/pre-push.mjs --instalar`.
- Se copia a `.git/hooks/`, así que sigue andando aunque se cambie a una rama vieja que no trae el script.
- Si rechaza, la salida es traer main: `git fetch origin main && git merge origin/main && git push`.

### Qué deja pasar

| Camino | Por qué pasa |
|---|---|
| `git push --no-verify` | git saltea los ganchos. |
| Escrituras desde la web o la API de GitHub: editar un archivo, «Update branch», merge hacia una rama, `push_files`, `create_or_update_file`, `create_branch` o `update_pull_request_branch` por MCP | No hay git local, así que no corre ningún gancho. |
| Una sesión creada con `source_revision` en una rama vieja | Arranca con el SessionStart viejo, que no instala el control. |
| Un clon donde nunca se abrió Claude Code ni se corrió `--instalar` | El gancho vive en el clon, no en el repo. |
| Un clon con `core.hooksPath`, o con otro `pre-push` propio | No se pisa: el instalador avisa y no instala. |
| Deploy hooks y la CLI `vercel` | No son un push. Los deploy hooks sólo se apagan con `github.enabled=false` (https://vercel.com/docs/deploy-hooks). |

### Por qué no hay un freno del lado del servidor

- GitHub.com no admite ganchos `pre-receive`: son sólo de GitHub Enterprise Server.
- Un workflow `on: push` corre con el archivo del commit empujado. Sobre una rama vieja corre el workflow
  viejo, así que un control nuevo ahí nunca se ejecuta para ellas. Además, llega después de Vercel.
- Un *ruleset* de GitHub puede restringir actualizaciones por **nombre** de rama, pero no por «contiene tal
  commit». Cubriría la web y la API sólo si el trabajo nuevo usara un prefijo nuevo. Es una configuración del
  repo: la decide el dueño y no se tocó.

**Sin fuente oficial:** qué `vercel.json` lee Vercel para `deploymentEnabled`, si el del commit empujado o el
de la rama de producción. Este control parte del caso peor: el del commit.

## 3. `publicar.yml` sólo acepta tandas y urgentes

El paso «precondiciones» (`scripts/publicar/publicar.mjs` → `ramaPublicable`) acepta dos tipos de rama
para el PR:

- `tanda/…`: la tanda. Muchos PR, un solo despliegue de producción (regla 1).
- `urgente/…`: el arreglo urgente de producción o de seguridad, que sale solo (regla 6). El informe pide
  anotarlo en la bitácora.

Cualquier otra rama frena antes del respaldo y del merge, y lo comenta en el PR. Como el workflow corre con
el script de `main`, el cambio rige recién cuando llega a main.
