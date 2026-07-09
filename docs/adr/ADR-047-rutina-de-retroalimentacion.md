---
id: ADR-047
nivel: evolutiva
dominio: [Operaciones]
depends_on: [ADR-008, ADR-016]
---
# ADR-047: Rutina obligatoria de retroalimentación — 3 palancas (memoria · casos · skills/briefs) + 2 cadencias

**Estado:** Aceptado — vigente (rutina de mejora continua)
**Fecha:** 2026-07-07
**Modelo:** **Sonnet 5 por defecto** (ultra-ahorro); la revisión Advisory+Challenger sigue su asignación (ADR-045)
**Depende de:** ADR-008 (repo como memoria), ADR-016 (handoff persistido)
**Relacionado:** ADR-045 (Advisory + Challenger), ADR-032 (modelo de trabajo / economía), ADR-039 (cierre del sprint)
**Fuente viva (detalle):** `CLAUDE.md` → "Rutina de retroalimentación"

---

## Contexto
Sin una rutina, **el aprendizaje de cada sprint se pierde**: la **memoria** queda desactualizada, los
**casos** reales no se registran, y los **briefs/skills** de las células no mejoran con la experiencia — se
repiten los mismos errores. Hace falta un **loop de mejora continua** obligatorio, **barato** y **automático**.

## Decisión
Rutina **obligatoria** de retroalimentación, con **3 palancas** y **2 cadencias**:

**3 palancas:**
1. **Memoria** — los *facts* persistentes que cada célula mantiene al día (qué es verdad hoy del proyecto).
2. **Casos** — registro de casos reales (qué pasó, qué funcionó/falló): material de entrenamiento.
3. **Skills / Briefs** — los prompts/instrucciones de cada célula, que se **mejoran con lo aprendido**.

**2 cadencias automáticas:**
- **(a) Al CIERRE de cada sprint, por célula (ligero):** actualizar **memoria** + registrar **1 caso** +
  proponer **1 mejora breve** de brief/skill. Es parte de la **Definición de terminado** del sprint (ADR-039).
- **(b) Consolidación periódica (semanal o cada N sprints):** **destilar los casos** acumulados en mejoras
  concretas de **skills/briefs**, **limpiar/depurar la memoria** (merge de duplicados, poda de *stale*), y
  **revisión Advisory + Challenger de las bases** (ADR-045) para robustecerlas.

**Modelo (economía):** corre en **Sonnet por defecto** (ultra-ahorro; es trabajo de volumen acotado); el
tramo de juicio (revisión de bases) usa la asignación de ADR-045; se escala a Opus solo donde el juicio pesa.

## Consecuencias
- **(+)** **Mejora continua estructural:** el sistema aprende de cada sprint en vez de repetir errores; los
  briefs/skills mejoran **con evidencia** (casos), no por opinión.
- **(+)** **Barato y automático:** cadencia (a) ligera por célula; (b) periódica y batcheada.
- **(−)** Requiere **disciplina**: si no se corre, la memoria y los briefs **derivan**. La cadencia (a) atada
  a la Definición de terminado del sprint es lo que la hace no-opcional.

> **Destino de la palanca "casos":** el registro vivo es **`docs/lecciones-aprendidas/registro.md`**
> (síntoma → causa → fix → lección → **guardarraíl** → refs). La cadencia (a) **suma o actualiza** una
> entrada por cierre de sprint; la (b) las **destila** y promueve guardarraíles recurrentes a regla dura.
> Ese registro es **lectura obligatoria de calibración** de PMO y Arquitecto (y de las células antes de
> tocar áreas de riesgo).

> **Exposición cross-estructura (ADR-053):** cuando un agente se prestó a otra estructura, la cadencia (a)
> **suma la exposición del cruce** (en qué nodo ejecutó/entrenó + qué aprendió) al registro — así el pool se
> **entrena rotando** y se puede detectar quién necesita más exposición.

## Estado
**Aceptado — vigente.** Rutina de mejora continua de GSG; cadencia (a) en el cierre de sprint (ADR-039),
cadencia (b) en consolidación con revisión Advisory+Challenger (ADR-045). Registro vivo:
`docs/lecciones-aprendidas/registro.md`. Referenciada desde `CLAUDE.md`.
