---
name: gsg-ship
description: Cierra una pieza de GSG. Revisa que no haya secretos, corre los gates del repo, hace un commit por pathspec explícito y pushea en una sola tirada verificando origin. Usar solo después de un /gsg-review en verde.
disable-model-invocation: true
---
# Ship GSG

Política del repo: push-libre a GitHub con Gate de Excelencia tildado; **un push por sesión**; sin `AskUserQuestion` ni menús. Nunca `--force`, nunca `reset --hard`, nunca `git add -A` / `git add .`.

1. `git status` y `git diff`: confirmá que no hay `.env`, tokens, claves ni archivos generados de más. Si encontrás algo, no lo agregues y reportalo.
2. Gates del repo una última vez: `npm run gates` · `npx tsc --noEmit` · `npm test` · `npm run build`. Rojo = no se shippea.
3. Si hay servidor local, corré Lighthouse sobre la pieza y anotá los puntajes. Si no se puede, decilo.
4. Tildá los 4 bloques del Gate de Excelencia (CLAUDE.md); ítem que no aplica → N/A + por qué.
5. Commit **por pathspec explícito** (lista de archivos, nunca `-A` ni `.`), mensaje Conventional Commits, y todo en una sola tirada:
   `git add <archivo1> <archivo2> … && git commit -m "<tipo>: <qué>" && git push origin <rama> && git log origin/<rama> -1 --oneline`
   Si la rama es `main`: listo. Si es otra rama: `gh pr create` con qué se hizo (3 líneas), capturas del último `/gsg-review`, puntajes de Lighthouse y pendientes. No hagas merge.
6. Si el push falla por carrera con otra sesión: `git pull --rebase` y reintentá una vez; a la segunda falla, pará y reportá el problema con opciones.
7. Reportá en 3 líneas: qué se shippeó (hash en origin), cómo se verificó, qué falta. Deploy a producción y migraciones de DB NO se corren desde acá (Gate 1 y Gate 2 de CLAUDE.md).
