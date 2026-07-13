# 🎓 Auditoría de calibración de agentes — que lo aprendido VIVA en ellos (2026-07-12)

> **Pedido del dueño (prioridad 1):** calibrar los agentes para que **todo lo aprendido viva en ellos**, y que
> los **validadores sean SIEMPRE los mismos** para que **aprendan de su propio feedback**. El problema: cada
> sesión nueva vuelve a tropezar con lo mismo porque las lecciones existen (`registro.md`, memorias, ADRs)
> pero **no están cableadas a los agentes** que hacen el trabajo, y los validadores no eran consistentes.

---

## PASO 1 — Auditoría: qué había, qué faltaba

### Lo que YA estaba bien (y por eso NO se duplicó — honestidad primero)
- **Los agentes NO se improvisan por sesión.** Hay **25 agentes versionados** en `.claude/agents/`, cada uno
  con **Paso 0 · Calibración** (ADR-052), zona de de-sesgo (ADR-046) y referencia al Gate. El molde común es
  `docs/organizacion/charter-generico-agente.md`. La preocupación "un agente se improvisa cada vez" estaba
  **mayormente resuelta**.
- **El conocimiento está bien capturado.** `docs/lecciones-aprendidas/registro.md` tiene **40+ lecciones** con
  formato fijo (síntoma→causa→fix→lección→guardarraíl→refs) por categoría (PD/DB/MT/DX/MP/SEC). Las memorias
  (`MEMORY.md`) y los ADRs de metodología complementan.
- **El arranque ya apuntaba al registro.** `CLAUDE.md → Arranque de sesión` ya marcaba `registro.md` como
  "lectura obligatoria de calibración".
- **2 de los 3 validadores ya existían:** `auditoria-gsg-gate` (el Gate, Opus siempre) y `challenger` (ADR-045).

### La BRECHA real (lo que el dueño detectó bien)
1. **No existía un `verificador-visual`.** El único verificador era `revisor-verificador` (**en pausa**), que
   corre `tsc`+`build`+diff pero **NO renderiza la pantalla**. Es **exactamente el hueco** por el que un
   **login roto llegó a prod con `tsc` + 929 tests + `build` en verde** (MP-16). La lección más cara **no
   tenía dueño**.
2. **Los validadores no tenían log de feedback.** Leían lecciones pero **no escribían su veredicto** en ningún
   lado durable → no podían "aprender de su propio feedback" (memoria volátil, no persistente).
3. **La rúbrica del Challenger no estaba escrita.** El scoring que llevó **Shine de 4.5 a 8.5** vivía en la
   cabeza de una sesión, no en el repo.
4. **Cableado blando.** Las lecciones duras estaban "andá a leer `registro.md`", no **embebidas** en los
   agentes que deben obedecerlas.
5. **Lecciones huérfanas** — reales, pagadas con incidentes, pero **ni en el registro ni en ningún agente**:
   render real (MP-16) y colisión `--spacing`↔`max-w` + "no hay defecto visual menor" (DX-8).

---

## PASO 2 — Lecciones duras consolidadas (que ningún agente vuelva a pisarlas)
- **Nuevo `docs/lecciones-aprendidas/GUARDARRAILES.md`** — la destilación de **una página**, verificable,
  categorizada (Verificación · Producción · Datos/Seguridad · Proceso), con **ancla** a la entrada completa
  del registro. Es la fuente única que se embebe en todos lados.
- **2 lecciones huérfanas ahora tienen entrada** en `registro.md`:
  - **MP-16** — "verificado por DOM ≠ verificado" → render real obligatorio o el gate FALLA (el incidente del
    login roto con 929 tests verdes).
  - **DX-8** — "no existe el defecto visual menor" (regla textual del dueño) + colisión `--spacing`↔`max-w` de
    Tailwind v4.

## PASO 3 — Los 3 validadores, SIEMPRE los mismos, con log que aprende
| Validador | Definición fija | Qué se consolidó | Log de feedback |
|---|---|---|---|
| **Gate de Excelencia** | `.claude/agents/auditoria-gsg-gate.md` | **Checklist DURO estable** embebido (render real, migración-antes-de-merge, RLS 43/43, I1–I7, secretos, pathspec, deviación-de-ADR-con-rastro) | `veredictos/gate.md` |
| **Challenger** | `.claude/agents/challenger.md` | **Rúbrica de scoring 0–10 escrita** (5 dimensiones, umbral ≥7) — la que subió Shine 4.5→8.5 | `veredictos/challenger.md` |
| **Verificador Visual** | `.claude/agents/verificador-visual.md` (**NUEVO**) | Regla #1 render real+screenshot; regla #2 si no se puede rendir el gate FALLA; owns MP-16/DX-8 | `veredictos/verificador-visual.md` |

Cada validador **lee su propio log en el Paso 0** antes de actuar → cierra el loop de retroalimentación
(ADR-047) sobre sí mismo. Los logs son **append-only** (`docs/lecciones-aprendidas/veredictos/`).

## PASO 4 — Cómo se garantiza que se lea solo (que una sesión no pueda ignorarlo)
Tres capas, ninguna depende de que alguien "se acuerde":
1. **Siempre en contexto:** `CLAUDE.md → Arranque de sesión` (auto-cargado en toda sesión) ahora nombra
   `GUARDARRAILES.md` como "lectura innegociable" y a los 3 validadores por nombre.
2. **En cada agente futuro:** `charter-generico-agente.md → Paso 0` (el molde de TODO agente nuevo) incluye
   `GUARDARRAILES.md` en el corpus obligatorio → cualquier agente que se cree lo hereda.
3. **En cada validador que corre:** los 3 validadores **embeben** sus reglas en su propia definición → cuando
   se convocan, las reglas **ya están en su system prompt**, no dependen de un doc externo.

---

## Entregables (todo doc-only / definición de agentes — reversible, no toca prod)
- `docs/lecciones-aprendidas/GUARDARRAILES.md` — reglas duras de una página (**nuevo**).
- `docs/lecciones-aprendidas/registro.md` — **+MP-16, +DX-8**, índice corregido (MP-15 nunca indexado).
- `.claude/agents/verificador-visual.md` — validador de render real (**nuevo**).
- `.claude/agents/auditoria-gsg-gate.md` — checklist duro estable + log de veredictos.
- `.claude/agents/challenger.md` — rúbrica de scoring fija + log de veredictos.
- `docs/lecciones-aprendidas/veredictos/` — README + 3 logs append-only (**nuevo**).
- `docs/organizacion/charter-generico-agente.md` — Paso 0 embebe GUARDARRAILES + log de validador.
- `CLAUDE.md` — arranque nombra GUARDARRAILES + los 3 validadores.
- `docs/organizacion/roster-completo-gsg.md` — +Verificador Visual; nota de agentes superseded.

## Qué lección estaba HUÉRFANA y ahora tiene dueño
- **"Verificado por DOM NO es verificado" (render real)** — la más cara, sin dueño. **Ahora:** lección
  **MP-16** + agente **`verificador-visual`** + regla **G-V1/G-V2** en GUARDARRAILES + checklist del Gate.
- **"No existe el defecto visual menor" + colisión `--spacing`↔`max-w`** — en memoria suelta, sin agente.
  **Ahora:** lección **DX-8** + reglas **G-V3/G-V4**, dueño **`verificador-visual`** + Diseño.

## Honestidad — qué NO se tocó porque ya estaba bien
- Los 25 agentes existentes y su Paso 0 (buenos; solo se reforzaron los 2 validadores + el charter).
- El registro y su formato (excelente; solo se sumaron las 2 huérfanas y se corrigió el índice).
- El flujo RACI, el modelo por capas Opus/Sonnet, la economía de modelos — vigentes, no se duplicaron.

— Elaborado por **Gestión Studio Grow (GSG)**.
