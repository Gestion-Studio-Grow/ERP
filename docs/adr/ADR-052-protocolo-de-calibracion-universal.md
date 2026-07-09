---
id: ADR-052
nivel: evolutiva
dominio: [Operaciones]
depends_on: [ADR-032, ADR-046, ADR-047]
---
# ADR-052: Protocolo de Calibración Universal — todo agente calibra (lee el corpus + declara sus principios) antes de actuar

**Estado:** Aceptado — vigente y obligatorio para TODO agente
**Fecha:** 2026-07-07
**Depende de:** ADR-047 (retro / registro de lecciones), ADR-046 (de-sesgo), ADR-032 (modelo de trabajo)
**Relacionado:** ADR-039 (FASE 0), ADR-040 (Gate), ADR-050/051 (roster), ADR-049 (RACI)
**Wiring:** `CLAUDE.md` → "Protocolo de calibración universal" · `.claude/commands/sprint.md` (roster)

---

## Contexto
El método que entrena al **PMO** y al **Arquitecto** —calibrarse leyendo el corpus antes de actuar— funciona
y debería aplicar a **todos los agentes**. Sin calibración, un agente arranca con el **sesgo del modelo** y
sin los **guardarraíles** de lo que ya nos pasó → repite errores conocidos. El dueño quiere un **método de
entrenamiento universal**.

## Decisión
> **REGLA DE ARRANQUE (dura, sin excepción): NINGÚN agente empieza a operar sin calibrarse primero** —leer
> el corpus + los ADRs de su rol + la memoria de lecciones aprendidas, y escribir su resumen de principios—.
> **Aplica a TODO agente: los existentes Y toda CREACIÓN FUTURA de agente** que se instancie de acá en
> adelante. Un agente nuevo que arranca sin el Paso 0 está fuera de norma y no opera. El molde de creación es
> el **charter genérico de agente** (`docs/organizacion/charter-generico-agente.md`), cuyo **Paso 0 es esta
> calibración**.

**Todo agente, al arrancar y antes de actuar, corre el Protocolo de Calibración** (3 pasos):
1. **Leer el corpus** relevante a su rol (lista mínima abajo): el fundamento (`CLAUDE.md`), los **ADRs de su
   rol**, las **bases/roadmap** (`ESTADO-ACTUAL.md` / plan vigente) y la **memoria de lecciones aprendidas**
   (`docs/lecciones-aprendidas/registro.md` — sus guardarraíles de área de riesgo).
2. **Escribir un resumen breve** (3–5 bullets) de los **principios que guían sus decisiones** — incluyendo su
   **zona de de-sesgo** (ADR-046): *¿soy zona humana/criolla o zona estándar/precisa?* Es su "declaración de
   calibración".
3. **Recién entonces actuar.** Sin los pasos 1–2, el agente está **fuera de norma**.
4. **Si es un PRÉSTAMO cross-estructura (ADR-053):** la calibración se **EXTIENDE** — además de su corpus, el
   agente prestado lee el **contexto de la estructura destino** (briefs de la célula anfitriona + su parte
   del corpus). **Al cerrar el préstamo**, vuelca al **registro de lecciones aprendidas** lo aprendido en el
   cruce, para que el conocimiento **fluya entre estructuras**; luego **vuelve a su célula de origen** (no se
   re-parenta ni se duplica).

### Lista mínima de lectura por tipo de rol
- **TODOS (base):** `CLAUDE.md` (modelo de trabajo · Gate · gates · DEMO→VENTA→INVERSIÓN · concurrencia) +
  `docs/lecciones-aprendidas/registro.md` (guardarraíles de su área) + **FASE 0** (`ESTADO-ACTUAL.md`).
- **Gobernanza** (PMO · Arquitecto · Advisory · Challenger): + ADR-032/039/045/048/049/050/051 +
  `factory-reforzada.md` + `asignacion-modelos-sprint.md`.
- **Cores ERP** (por dominio): + los ADRs de su core — Pagos/Fiscal → 022/024/025 · Plataforma →
  001/015/018/023/029 · Diseño → 009/043/044 · Inventario → 002/036.
- **Seguridad:** + ADR-018/041 + entradas **SEC-** del registro.
- **Data/DBA:** + ADR-018/019/023 + entradas **DB-** del registro.
- **Preset IA:** + ADR-034/033/042/044 + `generador-preset-ia.md`.
- **QA/Probador:** + `auditoria-sap-fiori.md` (Gate) + entradas de defectos del registro.
- **Agencia (Digital/Grow/Growth/Pricing):** + charter del sector + análisis de mercado + ADR-027/044.

## Consecuencias
- **(+)** Todo agente arranca **calibrado y de-sesgado**, con los guardarraíles cargados → **menos errores
  repetidos**; la declaración de principios hace **auditable** su criterio.
- **(+)** Barato: la calibración es **lectura + 3–5 bullets** (Sonnet), una vez al arrancar.
- **(−)** Suma un paso de arranque; se mitiga porque la lista mínima acota **qué** leer (no todo el corpus).
- **Se retroalimenta:** el resumen de calibración y lo aprendido en la sesión **alimentan la retro**
  (ADR-047), que actualiza el registro que el próximo agente lee.

## Estado
**Aceptado — vigente, obligatorio para todo agente.** Wireado en `CLAUDE.md` (onboarding) y en el roster de
sprint (`sprint.md`: todo agente convocado calibra primero).
