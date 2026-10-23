---
description: Corre una tanda de un cliente con gasto acotado (workflow tanda-gsg) — /tanda <cliente> <n> [título de la sección del diseño]
argument-hint: <cliente> <número de tanda> [título de la sección]
---

El dueño pidió correr una tanda con el workflow guardado **`tanda-gsg`** (Método de Contexto Mínimo,
`Factory-GSG/10-GOBIERNO/economia-de-tokens.md`). Esto cuenta como su pedido explícito de usar el workflow.

Argumentos: `$ARGUMENTS` → cliente, número de tanda y, opcional, el título de la sección del diseño.

Preparación (la hace el orquestador con comandos; no lances agentes para esto):
1. Ubicá el diseño del cliente en `Factory-GSG/00-ESTADO/reingenieria-2026-10/disenos/<cliente>-DISENO.md` (o el que
   indique el relevo `RELEVO.md` de esa carpeta) y la rama/commit base que indique el relevo.
2. Extracto (≤ 5 KB): `node <factory>/entorno/tokens/extraer-seccion.mjs <diseño> "<título de la tanda>" --a
   <scratch>/extracto-<cliente>-t<n>.md`. Si hay varias secciones con el mismo título, elegí la del plan de la tanda y
   sumá la de los criterios de aceptación en un segundo extracto concatenado.
3. Worktree FUERA de la carpeta de la sesión, con un solo comando (crea la rama, enlaza `node_modules`, genera
   Prisma y, en la nube, deja el Postgres del arnés): `bash .claude/scripts/preparar-nube.sh --worktree
   /tmp/wt/<cliente>-t<n> reing-<cliente>-t<n> <base>`. En la PC (sin bash/Postgres): `git worktree add -b
   reing-<cliente>-t<n> <ruta> <base>` + `node_modules` (`cp -al` o junction) + `npx prisma generate`. No armes el
   entorno a mano llamada por llamada: cada llamada del orquestador relee todo su contexto.
4. Mapa de código de la zona que se va a tocar (en el worktree):
   `node <repo>/.claude/scripts/mapa-codigo.mjs <carpetas> --a <scratch>/mapa-<cliente>-t<n>.md` (el del repo de la
   sesión: un commit base viejo puede no traerlo). Va en el brief junto al extracto.
5. Del extracto, armá: archivos propios, archivos que no se tocan, criterios (IDs + una línea) y riesgos
   (`plata`, `seguridad`, `concurrencia`, `datos` o vacío si es sólo visual). Si la tanda junta frentes que no se
   tocan entre sí (p. ej. un parser puro y una rendición con plata), partila en `frentes` (máximo 2), cada uno con
   sus archivos, criterios y riesgos: un constructor fresco por frente carga sólo su zona.
6. Llamá a la herramienta Workflow con `name: "tanda-gsg"` y `args`:
   `{ cliente, tanda, worktree, rama, base, extracto, mapa, archivosPropios, noTocar, criterios, riesgos, factory, scratch,
   trailers, frentes? }` — `trailers` son las dos líneas de atribución de commits de la sesión; `frentes` =
   `[{ nombre, archivosPropios, criterios, riesgos }]` (si va, `archivosPropios`/`criterios` generales pueden ir vacíos).

Al terminar: relayá al dueño el resultado del workflow en ≤ 10 líneas (qué quedó, verificación, certificación, fallas
abiertas, decisiones suyas). El orquestador no lee diffs ni logs: si quedó una falla alta/media después del workflow,
la corrige un `gsg-ingeniero` fresco con el `archivoDictamen` y el test del certificador, y la recertifica un
`gsg-certificador` fresco sobre ese commit; el orquestador sólo corre la suite con `resumen-tests.mjs`.
Después, `node <factory>/entorno/tokens/medir-consumo.mjs <carpeta de transcripts de la sesión> --max-inicial 40000
--max-llamadas 80` y anotá el consumo de la tanda en el relevo. En la nube, el entorno de la sesión debería tener
apagados los conectores que la tanda no usa (Docs, navegador): cada herramienta suma contexto fijo al orquestador.
Nada de push a `main` ni migraciones aplicadas: eso sigue siendo del dueño.
