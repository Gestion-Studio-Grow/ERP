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
3. Worktree FUERA de la carpeta de la sesión: `git worktree add -b reing-<cliente>-t<n> /tmp/wt/<cliente>-t<n> <base>`,
   con `node_modules` (`cp -al`) y `src/generated` (o `npx prisma generate`).
4. Del extracto, armá: archivos propios, archivos que no se tocan, criterios (IDs + una línea) y riesgos
   (`plata`, `seguridad`, `concurrencia`, `datos` o vacío si es sólo visual).
5. Llamá a la herramienta Workflow con `name: "tanda-gsg"` y `args`:
   `{ cliente, tanda, worktree, rama, base, extracto, archivosPropios, noTocar, criterios, riesgos, factory, scratch,
   trailers }` — `trailers` son las dos líneas de atribución de commits de la sesión.

Al terminar: relayá al dueño el resultado del workflow en ≤ 10 líneas (qué quedó, verificación, certificación, fallas
abiertas, decisiones suyas). Después, `node <factory>/entorno/tokens/medir-consumo.mjs <carpeta de transcripts de la
sesión> --max-inicial 40000 --max-llamadas 80` y anotá el consumo de la tanda en el relevo. Nada de push a `main` ni
migraciones aplicadas: eso sigue siendo del dueño.
