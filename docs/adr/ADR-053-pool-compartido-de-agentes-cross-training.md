# ADR-053: Pool compartido de agentes + entrenamiento cross-estructura — los agentes se prestan, no se duplican

**Estado:** Aceptado — vigente
**Fecha:** 2026-07-07
**Depende de:** ADR-051 (roster completo), ADR-052 (calibración), ADR-032 (concurrencia ≤4)
**Relacionado:** ADR-048 (Arquitecto coordina lo reversible), ADR-047 (retro/lecciones), ADR-045 (Advisory), ADR-050 (roster sprint)
**Enmienda:** agrega a ADR-052 el paso de **calibración cross-estructura** en préstamos

---

## Contexto
Con la estructura por divisiones/células (ADR-051) aparece un riesgo: tratar a los agentes como **silos** y
**crear un agente nuevo dedicado** cada vez que una estructura necesita una skill que **ya existe en otra**.
Eso **duplica** agentes, **satura** el tope de concurrencia (ADR-032) y **encapsula** el conocimiento por
división. El dueño fija que los agentes son un **pool reutilizable**, no silos.

## Decisión
1. **Pool compartido (no silos):** los agentes forman un **pool reutilizable**. Para un caso puntual en otra
   estructura —ej.: **alinear el front de Magra** = Diseño + Adaptador/Delivery + QA— se **PRESTAN** agentes
   existentes del pool, en vez de crear dedicados.
2. **Préstamo y retorno:** al terminar el caso, el préstamo se **cierra** y cada agente **QUEDA ASIGNADO EN
   SU CÉLULA/DIVISIÓN DE ORIGEN** — **no se re-parenta ni se duplica**. El préstamo es **temporal**; la
   asignación de origen es **permanente**.
3. **Regla dura antes de crear:** **antes de instanciar un agente NUEVO, verificar si un agente existente del
   pool cubre el caso prestado.** Crear nuevo **solo si no hay rol adecuado** en el pool (evita duplicados y
   respeta el tope ≤ 4).
4. **Entrenamiento cross-estructura:** cuando un agente se presta a otra estructura, su **calibración
   (ADR-052) se EXTIENDE**: además de su corpus, lee el **contexto de la estructura destino** (briefs de la
   célula anfitriona + su parte del corpus). **Al cerrar**, registra en la **memoria de lecciones aprendidas**
   lo aprendido en el cruce → el conocimiento **fluye entre estructuras**, no queda encapsulado.
5. **Coordinación:** el **Arquitecto de Solución** coordina los préstamos (prestar/devolver es **ejecución
   reversible**: no toca prod/irreversible).

## Consecuencias
- **(+)** **Menos duplicación** de agentes; el tope de concurrencia se respeta mejor (se **reusa** en vez de
  multiplicar).
- **(+)** El **conocimiento fluye** entre estructuras (cross-training) en lugar de encapsularse por división.
- **(+)** **Refuerza el default "crear generoso / activar en olas"** de la síntesis de estrategia (v3): muchas
  necesidades se cubren **PRESTANDO** del pool, no creando.
- **(−)** El agente prestado debe **calibrar con la estructura destino** (paso extra) y el préstamo debe
  **cerrarse bien** (volver a origen + volcar aprendizaje) para no dejar un agente "colgado" fuera de su célula.

## Estado
**Aceptado — vigente.** Wireado en `CLAUDE.md` (pool/factory + cross-training), `charter-generico-agente.md`
(préstamo y retorno), roster de sprint (los prestados vuelven a su asignación) y el charter del Arquitecto
(coordina los préstamos). Enmienda ADR-052 (calibración cross-estructura).
