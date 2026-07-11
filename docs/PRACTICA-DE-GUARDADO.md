# 💾 Práctica de guardado — nada vive solo en una sesión

> **Por qué existe:** el dueño perdió confianza tras una **desconexión** en la que trabajo hecho quedó fuera del
> repo. Regla dura para que **no vuelva a pasar**: *todo avance se **commitea** y se **pushea a `origin`**; nada
> queda solo en una sesión, worktree o máquina.* `origin` (GitHub, `https://github.com/Gestion-Studio-Grow/ERP.git`)
> es la fuente de verdad y el respaldo.
>
> **Autor:** GSG (PMO) · **Fecha:** 2026-07-10

---

## 1. La regla

- **Cada hito → guardar.** El PMO (o la célula) **commitea y pushea a `origin` al cerrar cada hito**, no al final
  del día. Un commit local sin push **no cuenta como guardado**.
- **Push explícito a la rama de trabajo:** `git push origin HEAD`. Nunca dejar trabajo solo en el working tree.
- **`main` pasa por Gate:** a `main` se llega por **merge revisado** (Gate de Excelencia), nunca por auto-commit
  directo. El trabajo diario vive en ramas de frente (`frente/*`, `fundacion/*`, `claude/*`) y se pushea ahí.
- **Verificar que quedó en origin:** tras push, `git log origin/<rama> -1` debe mostrar tu commit.

## 2. Guardado automático — `scripts/auto-save.mjs`

Script idempotente y seguro: si no hay cambios no hace nada; si hay, `git add -A` + commit (con timestamp) +
`git push origin HEAD`. **Nunca** auto-commitea sobre `main` (salvo `--allow-main`). Es cwd-independiente.

```bash
# guardar el repo del script (o el que indique AUTOSAVE_REPO)
node scripts/auto-save.mjs
# guardar un worktree/repo específico
AUTOSAVE_REPO="C:\\Users\\mlloveras2\\Documents\\Claude\\estetica-erp" node scripts/auto-save.mjs
# commitear sin pushear (offline)
node scripts/auto-save.mjs --no-push
```

Salidas: `0` ok/nada-que-hacer · `2` abortado por estar en `main` · `3` push falló (commit local quedó hecho).

## 3. Hook opcional — auto-push tras cada commit

`scripts/hooks/post-commit` pushea a `origin` después de cada commit (en background, nunca en `main`). Instalar:

```bash
cp scripts/hooks/post-commit .git/hooks/post-commit && chmod +x .git/hooks/post-commit
```

> En Windows sin `chmod`, alcanza con copiar el archivo a `.git/hooks/post-commit` (Git lo respeta).

## 4. Programar el auto-save (cada X minutos)

El comando exacto a programar (cwd-independiente):

```
node "C:\Users\mlloveras2\Documents\Claude\estetica-erp\scripts\auto-save.mjs"
```

- Para guardar **otro** worktree, anteponer la variable, p. ej. la rama fundacional:
  `set AUTOSAVE_REPO=<ruta-del-worktree> && node "...\scripts\auto-save.mjs"`
- **Nota:** hoy el script vive en la rama fundacional (`fundacion/consolidacion-diseno`); estará en `main`
  (`estetica-erp\scripts\auto-save.mjs`) recién **tras el merge**. Hasta entonces, apuntá `AUTOSAVE_REPO` al
  worktree fundacional o corré la copia que está ahí.
- Cadencia sugerida: **cada 5–10 min** mientras se trabaja, y **al cerrar sesión**. (La tarea programada la
  engancha el dueño / el asistente; ver el comando de arriba.)

## 5. 🔒 Política de seguridad del repo (de `00-GUIA-RECUPERACION.md`)

Para que el repo no dependa de una sola copia ni pueda destruirse por error:

- **Proteger `main` (branch protection):** prohibir **force-push** y **borrado** de `main`; exigir PR + al menos
  una revisión antes de merge. **→ acción del dueño en GitHub** (yo no puedo configurarlo por vos; ver §6).
- **Mirror / backup automático:** mantener un **espejo** del repo (segundo remoto o mirror programado) para no
  depender solo de GitHub. Comando de mirror manual:
  `git clone --mirror https://github.com/Gestion-Studio-Grow/ERP.git` y `git remote update` periódico; o un
  segundo remoto `git remote add backup <url>` + `git push backup --all --tags`. **→ el dueño elige destino.**
- **`--force-with-lease` en vez de `--force`:** si alguna vez hay que reescribir historia (raro), usar
  **`git push --force-with-lease`** (aborta si el remoto avanzó desde tu última vista) — nunca `--force` a secas.
  El auto-save **nunca** fuerza: hace push normal.
- **Guardarraíles ya vigentes (config del entorno):** `force push`, `reset --hard`, `migrate reset`, `DROP`,
  `rm -rf` están **bloqueados** por configuración. Esta política los complementa a nivel servidor (GitHub).

## 6. Acciones que quedan para el dueño (no las puedo hacer yo)

1. **GitHub → Settings → Branches → Branch protection rule para `main`:** marcar *"Require a pull request before
   merging"*, *"Do not allow force pushes"*, *"Do not allow deletions"*. (Requiere permisos de admin del repo.)
2. **Configurar el mirror/backup** (elegir destino: 2º remoto, o clon `--mirror` programado).
3. **Programar el auto-save** con el comando de §4 (o pedírmelo para engancharlo a una tarea).

— Elaborado por GSG (PMO)
