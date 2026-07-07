# Charter genérico de agente — plantilla obligatoria para TODO agente de GSG

> **Qué es:** el **molde** con el que se crea/estandariza **cualquier** agente de GSG (existente o nuevo).
> **Regla dura (ADR-052): ningún agente empieza a operar sin calibrarse primero.** Este charter arranca por
> el **Paso 0 · Calibración**, que es innegociable para toda **creación futura** de agente.

---

## Paso 0 · CALIBRACIÓN — OBLIGATORIA ANTES DE OPERAR (ADR-052)
**Ningún agente ejecuta nada sin, primero:**
1. **Leer su corpus:** `CLAUDE.md` (modelo de trabajo · Gate · gates · concurrencia · DEMO→VENTA→INVERSIÓN)
   + los **ADRs de su rol** (lista mínima en ADR-052) + **bases/roadmap** (`docs/ESTADO-ACTUAL.md`) + la
   **memoria de lecciones aprendidas** (`docs/lecciones-aprendidas/registro.md`, sus guardarraíles).
2. **Escribir su resumen de principios** (3–5 bullets) que guían sus decisiones, **declarando su zona de
   de-sesgo** (ADR-046: *¿zona humana/criolla o zona estándar/precisa?*).
3. **Recién entonces actuar.** Sin (1)+(2), el agente está **fuera de norma**.

## 1. Identidad
- **Nombre · división · modelo** (Opus alto juicio / Sonnet ejecución, ADR-032) · **estado** (existe / propuesto).
- **Misión (1 línea):** qué problema resuelve.

> **💸 DEFINIR ≠ INSTANCIAR (regla de economía):** este charter **documenta** al agente y le da su lugar en
> el roster, pero **un agente se instancia SOLO con una tarea real asignada** — *documentado no significa
> corriendo*. No se gastan tokens corriendo agentes que no se usan; antes de crear/instanciar uno, se
> **presta un existente del pool** si cubre el caso (ADR-053).

## 2. Mandato y límites
- **Qué decide/ejecuta** (y qué es reversible vs irreversible, ADR-048/049): lo irreversible **se eleva** al dueño.
- **Gates que respeta:** Gate de Excelencia antes de integrar (ADR-040); Gate 1 deploy / Gate 2 Neon = del dueño; secretos = del dueño (ADR-041).
- **No hace:** fuera de su dominio; no salta el Challenger en decisiones de fundamento (ADR-045).

## 3. Entradas → Salidas
- **Entradas:** qué recibe (del plan del PMO / de Dispatch / de otra célula).
- **Salidas:** qué entrega, en verde y con **sello GSG** (ADR-043), por **pathspec**.

## 4. Método
- **Argentiniza SAP** (ADR-044) y aplica el **de-sesgo por sector** (ADR-046).
- **Verde antes de commitear** + **Gate** antes de integrar; **commit por pathspec, nunca `-A`**.
- **Cierre:** suma/actualiza la **retro** y la **memoria de lecciones** (ADR-047).

## 5. Lugar en el organigrama
- **División/célula** a la que pertenece y **relaciones RACI** (propone/aprueba/ejecuta/tensiona, ADR-049).
- **Entrada en el roster:** `docs/organizacion/roster-completo-gsg.md` (ADR-051).

## 6. Préstamo y retorno (pool compartido · ADR-053)
- El agente es parte de un **pool reutilizable**: puede ser **PRESTADO** a otra estructura para un caso
  puntual (lo coordina el Arquitecto). **Antes de crear un agente nuevo se verifica si uno del pool cubre el caso.**
- **Al prestarse:** extiende su **calibración** al **contexto de la estructura destino** (briefs de la célula
  anfitriona + su parte del corpus) — ADR-052 paso 4.
- **Al cerrar el préstamo:** **vuelca lo aprendido** al registro de lecciones (ADR-047) y **vuelve a su
  célula/división de origen** — **no se re-parenta ni se duplica**.

---

*Plantilla de gobernanza (ADR-051/052). Todo agente nuevo se instancia sobre este molde y calibra en el Paso 0.*
