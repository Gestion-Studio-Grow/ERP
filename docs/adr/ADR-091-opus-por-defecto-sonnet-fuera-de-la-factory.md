---
id: ADR-091
nivel: fundacional
dominio: organizacion
depends_on: [ADR-032, ADR-040]
---

# ADR-091 — Opus por defecto; Sonnet fuera de la factory; Fable para generación

**Estado:** Aceptada (bajada de línea del dueño, 2026-09-09) · **Supersede en parte:** ADR-032 (economía de modelos) · **Actualiza el modelo de:** ADR-045, ADR-047, ADR-048 · **No toca:** ADR-040 (el Gate).

> Numeración provisional — verificar colisión al mergear: los números 081 a 088 estaban libres al momento de escribir.

## Contexto

`CLAUDE.md` §2 y ADR-032 fijaban **Default = Sonnet 5** para toda la ejecución, reservando Opus a una capa
angosta de alto juicio. La regla nació de una medición real (`docs/metricas/costo-uso-factory.md`, 89
sesiones): Opus era el 77% del gasto y buena parte de eso era ejecución delegable.

**Esa medición sigue siendo verdadera y no se deroga.** Lo que el dueño cambió es **qué se optimiza**.

Tres cosas empujaron la inversión:

1. **El ahorro era menor de lo que parecía.** La propia medición ya lo advertía: **el 86% del gasto es
   acarrear contexto (cache read + cache write), no generar** — sólo el 12,9% es output. Bajar de modelo
   abarata el 13% y no toca el 86%. La palanca de swap de modelo a igual trabajo era, en el propio
   análisis, "la más chica".
2. **El costo del juicio degradado no aparece en la factura de tokens.** Aparece como retrabajo, como un
   Gate que rebota, como una decisión mal tomada que se descubre tres sprints después. Ese costo no se
   midió nunca, y es el que el dueño decidió dejar de pagar.
3. **La regla tenía una fuga estructural.** `npm run brain` destapó que **31 de 31 agentes declaraban su
   capa en la prosa del encabezado pero ninguno traía `model:` en el frontmatter**, así que al despachar
   **heredaban el modelo del padre**. La asignación de modelo era, en los hechos, ficción — la causa exacta
   de las lecciones **MP-4** (Opus por herencia) y **MP-9** (modelo mal etiquetado).

## Decisión

1. **El default es OPUS** (`claude-opus-5`) para **todo** — juicio y ejecución. Una sesión, célula o
   subagente que no declara modelo **corre en Opus**, y eso es correcto.
2. **Sonnet sale de la factory.** Deja de ser el default de ejecución y deja de ser una capa disponible.
   Una sesión o charter que todavía diga Sonnet está **fuera de norma** y se corrige antes de trabajar.
3. **Fable (`claude-fable-5-1`) es la única alternativa**, y se elige **explícitamente — nunca por
   herencia**, sólo para **generación de volumen ya decidida**: código largo sobre spec cerrada,
   scaffolding, consolas, componentes repetitivos, fixtures, documentos y análisis extensos cuyo marco y
   criterio ya fijó Opus.
4. **La pregunta que reparte el trabajo es una sola:** *¿esto es **decidir**, o es **producir** lo que ya
   se decidió?* **Decidir → Opus (default). Producir volumen decidido → Fable, si se declara.** Ante la
   duda, Opus.
5. **Nunca salen de Opus:** arquitectura y ADRs · seguridad · plata y fiscal (incluida toda la Mesa de
   Dinero, ADR-090) · metodología y gobernanza · todo lo irreversible (prod, Neon, deploy, migraciones) ·
   **y el Gate**.
6. **El Gate de Excelencia sigue SIEMPRE en Opus** (ADR-040 intacto). Con el default en Opus deja de ser
   una *escalada* y pasa a ser un **piso que no se puede bajar**.
7. **Todo agente declara `model:` en el frontmatter.** La prosa del encabezado no fija nada. `npm run brain`
   audita el roster y marca en rojo al que no lo traiga. Los 31 agentes de `.claude/agents/` ya lo traen.
8. **`/economia` cambia de significado, no se borra:** pasa de "modo ahorro con Sonnet" a **"modo
   generación"** (rutear volumen a Fable, con el juicio y el Gate en Opus). **`/boost`** deja de ser un
   cambio de modelo y pasa a ser una **postura**: este sprint no rutea nada a Fable.

## Consecuencias

**Acepta como costo, a sabiendas:** **la factory es más cara por token.** Es una decisión deliberada de
priorizar la consistencia del juicio por encima del ahorro por tarea, no un descuido. La telemetría de
`finops-costo-uso` ahora mide una factory más cara **a propósito**, y esa serie hay que leerla con este
ADR al lado, no como una alarma.

**Habilita:** que la capa de modelo **signifique algo** — antes era prosa y herencia; ahora es una
instrucción declarada y auditable. Cierra MP-4 y MP-9 de raíz. Y elimina la clase entera de error
"ejecuté en un modelo degradado sin darme cuenta".

**Deuda / a vigilar:**
- **El riesgo real es el gasto**, y la mitigación no es bajar de modelo: es lo que el propio análisis
  señalaba como la palanca grande — **acarrear menos contexto** (el segundo cerebro, `npm run brain`,
  sesiones más chicas, un tema por sesión). Si el gasto se dispara, se ataca ahí, no volviendo a Sonnet.
- Revisar en la próxima consolidación (ADR-047) si el reparto Opus/Fable se está usando o si todo terminó
  en Opus por comodidad — que Fable exista en el papel y nadie lo declare sería volver a ADR-032 al revés.
- `docs/metricas/costo-uso-factory.md` **se conserva sin tocar** como el registro de lo que se midió
  entonces. No es una norma vigente; es evidencia histórica.

---

— Elaborado por GSG
