# 🧾 Log de veredictos de los validadores — memoria que aprende de sí misma

> **Por qué existe:** los 3 validadores de GSG tienen que ser **siempre los mismos** y **aprender de su
> propio feedback**. Para eso su feedback no puede vivir en la cabeza de una sesión (memoria volátil): vive
> **acá, versionado, append-only**. Cada corrida deja su veredicto; la siguiente lo **lee en su Paso 0** y no
> repite el error anterior. Es el cierre del loop de retroalimentación (ADR-047) aplicado a los validadores.

## Los 3 validadores (definición fija en `.claude/agents/`)
1. **`gate.md`** ← **`auditoria-gsg-gate`** — el Gate de Excelencia (Opus siempre). Aprueba/rechaza el merge.
2. **`challenger.md`** ← **`challenger`** — desafía el fundamento (ADR-045). Rúbrica de scoring fija.
3. **`verificador-visual.md`** ← **`verificador-visual`** — render real + screenshot. "DOM ≠ verificado".

## Regla de uso (para cada validador)
- **Append-only:** se **agrega** una fila arriba de todo; **no se edita ni se borra** lo viejo (es historia).
- **Una entrada por corrida**, con el formato de cada archivo. Enlazá el commit/rama y, si hubo, el hallazgo
  que se cazó o el que se **escapó** (un falso ✅ es la entrada más valiosa: enseña qué chequear la próxima).
- **Paso 0 del validador:** antes de auditar/desafiar/rendir, **leé las últimas entradas de tu log** para
  calibrar contra tus propios aciertos y errores.
- **Cierre de sprint (ADR-047):** si un veredicto destapó una lección nueva, se sube a `registro.md` con su ID
  y se enlaza acá.

— Elaborado por **Gestión Studio Grow (GSG)**.
