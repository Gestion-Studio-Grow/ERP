---
id: ADR-032
nivel: evolutiva
dominio: [Negocio, Operaciones]
depends_on: [ADR-008]
---
# ADR-032: Economía de modelos + Gate GSG siempre en Opus + tope de concurrencia + prioridades P1/P2/P3 (factory de dos capas)

**Estado:** Aceptado (2026-07-06) — norma de alto nivel vigente
**Fecha:** 2026-07-06
**Depende de / extiende:** ADR-008 (costo de tokens de Claude)
**Relacionado:** ADR-030 (demo→venta→inversión), ADR-033 (Gate GSG)

---

## Contexto
La medición de costo/uso mostró que **Opus era la mayor parte del gasto**, pero **buena parte era
ejecución delegable, no juicio**. ADR-008 ya fijó "modelo barato para lo mecánico"; al **agrandar la
factory de agentes** hace falta formalizar el modelo completo (qué corre en qué modelo, cuántas sesiones a
la vez, y con qué prioridad) sin degradar el control de calidad.

## Decisión
Factory de **DOS CAPAS** con estas reglas duras:
1. **Default = Sonnet 5** para TODA la ejecución. **Opus 4.8** solo para la **capa de alto juicio**
   (PMO/Arquitecto, Seguridad, Preset IA) y **SIEMPRE para la Auditoría GSG** (excepción dura: el **Gate
   nunca se degrada de modelo**, ni en `/economia`).
2. Comandos **`/economia`** (Sonnet) y **`/boost`** (Opus, sprints críticos). ~~**Subagentes** en
   **Sonnet/Haiku, nunca Opus por herencia**.~~ → **DEROGADO** por la enmienda del 2026-08-11 (abajo):
   los subagentes pueden correr en **Opus 5**; lo que sigue prohibido es el modelo *accidental*.
3. **Cada célula ETIQUETA su modelo explícitamente** (`/model …` o el parámetro del subagente) — **no
   depende del default de la cuenta**.
4. **Tope de concurrencia: ≤ 4 sesiones corriendo a la vez**; se abre/mueve **en olas chicas** (abrir
   worktrees de más está OK; el límite es cuántas *corren*).
5. **Prioridades:** **P1** (demos y venta) siempre corre · **P2** (habilitadores) si hay lugar · **P3**
   (bajo impacto) se pausa en congestión.

## Consecuencias
- **(+)** Gasto concentrado donde el error es caro/irreversible; **calidad de control intacta** (el Gate
  audita en Opus). Servicio **no se satura** (tope 4 + olas).
- **(+)** Asignación **auditable y reproducible** (etiquetado explícito), no dependiente de la cuenta.
- **(−)** Requiere disciplina de etiquetado, de olas y de priorización en congestión.
- **Toca / documentado en:** `CLAUDE.md` ("MODELO DE TRABAJO DE GSG" y "CONCURRENCIA Y PRIORIDADES"),
  `docs/organizacion/factory-reforzada.md`, `docs/organizacion/asignacion-modelos-sprint.md`,
  `.claude/commands/economia.md` + `boost.md`.

---

## Enmienda 2026-08-11 — subagentes habilitados en Opus 5

**Decisión del dueño.** Se **deroga la prohibición** del punto 2 ("subagentes en Sonnet/Haiku, **nunca
Opus** por herencia") y se **actualiza el tier Opus de 4.8 a Opus 5** (`claude-opus-5`) en toda la norma
de asignación de modelos.

**Qué queda vigente y qué cambia:**

| Punto de la decisión original | Estado |
|---|---|
| 1. Default Sonnet 5 para ejecución | **Vigente** |
| 1. Gate GSG siempre en Opus (nunca se degrada) | **Vigente** — ahora Opus 5 |
| 2. `/economia` y `/boost` | **Vigente** |
| 2. Subagentes **nunca** Opus | **DEROGADO** — ver abajo |
| 3. Cada célula etiqueta su modelo explícitamente | **Vigente y reforzado** |
| 4. Tope de concurrencia · 5. Prioridades P1/P2/P3 | **Vigente** |

**Regla nueva:** un subagente **puede correr en Opus 5** cuando la tarea lo amerita (juicio, síntesis,
investigación, auditoría). Para volumen mecánico el default sigue siendo Sonnet/Haiku, no por prohibición
sino porque ahí Opus no compra nada. **Todo subagente declara su modelo explícitamente al despacharlo.**

**Por qué la enmienda es coherente con el contexto original (y no una vuelta atrás):** MP-4 midió US$ ~37
tirados en subagentes corriendo Opus **por herencia** — es decir, sin que nadie lo eligiera. El defecto
era el modelo *accidental*, no el tier. La prohibición total fue el remedio más rápido, pero también
prohibía el caso legítimo: el subagente que hace juicio y cuyo resultado flojo se paga caro aguas abajo
(una investigación de mercado mal hecha, un finding mal verificado). Con el etiquetado explícito del
punto 3 —que sigue vigente— el gasto vuelve a ser una **elección auditable**, que es lo que ADR-032 buscaba.

**Consecuencia (−) asumida:** el gasto de tokens puede subir. El punto 3 (etiquetado explícito) y la
telemetría de `docs/metricas/costo-uso-factory.md` son el control; si el costo se dispara, se revisa acá.

**Riesgo abierto:** los 25 agentes de `.claude/agents/` **no declaran `model:`** en su frontmatter, así que
heredan el modelo del padre. Bajo la norma anterior eso era una violación (MP-4/MP-9); bajo esta enmienda
la herencia deja de estar prohibida, pero **sigue sin ser una elección explícita**. Queda **elevado al
dueño** decidir qué modelo fija cada agente en su frontmatter.

---

## Estado
**Aceptado, con enmienda del 2026-08-11** (arriba). Vigente siempre (usuario/App/GSG). Extiende ADR-008
(que queda como antecedente del criterio "modelo barato para lo mecánico").
