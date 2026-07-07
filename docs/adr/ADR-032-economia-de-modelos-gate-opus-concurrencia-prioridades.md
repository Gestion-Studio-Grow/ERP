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
2. Comandos **`/economia`** (Sonnet) y **`/boost`** (Opus, sprints críticos). **Subagentes** en
   **Sonnet/Haiku, nunca Opus por herencia**.
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

## Estado
**Aceptado.** Vigente siempre (usuario/App/GSG). Extiende ADR-008 (que queda como antecedente del criterio
"modelo barato para lo mecánico").
