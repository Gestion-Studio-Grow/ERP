# Charter — Advisory Board + Challenger (gobernanza de decisiones estratégicas)

> **Qué es esto:** el charter operativo del par **Advisory Board (tesis) + Challenger (antítesis)**. La
> decisión y el porqué están en **`docs/adr/ADR-045`**; este doc es el *cómo* del día a día — a qué corre,
> quién lo dispara, qué produce y dónde queda. Doc de gobernanza — no toca producción ni deploy.

---

## 1. Cuándo se activa (alcance)

Solo para **decisiones estratégicas** — no para ejecución ni para features. Dispara sobre:

- **Bases/fundamentos de compañía** (misión, columna vertebral, posicionamiento) — p. ej.
  `docs/fundamentos/bases-gsg.md`.
- **Roadmap de producto y estrategia de escala** — p. ej. `docs/estrategia/roadmap-gsg.md`.
- **Segmentación de mercado** (low/mid/big o el criterio vigente) y **cualquier cambio a esa
  segmentación**.
- **Cualquier otra decisión que el dueño marque explícitamente como "estratégica"** antes de adoptarla
  como canon.

**No dispara** sobre: features del backlog, refactors, ADRs de arquitectura técnica puntual (esos ya
tienen su propia valla: el Gate de Excelencia, ADR-040), ni decisiones operativas del Arquitecto de
Solución (ADR-048, que ejecuta lo reversible sin necesitar tesis/antítesis).

## 2. Flujo (tesis → antítesis → síntesis)

1. **Advisory Board propone** — panel de asesores de alto nivel produce la propuesta **con rigor y
   evidencia** (datos del repo/código, no supuestos). Sale como documento nuevo o enmienda, en
   `docs/fundamentos/` o `docs/estrategia/` según corresponda.
2. **Challenger desafía** — **mismos skills, postura opuesta** (red-team). Para cada propuesta: caso
   contrario, riesgos, supuestos débiles/no examinados, modos de falla, alternativas concretas. Sale como
   documento espejo (p. ej. `docs/estrategia/challenger-contrapuntos.md`), **de solo lectura** sobre la
   propuesta del Advisory — no la edita, la tensiona.
3. **Síntesis / decisión del dueño** — el dueño decide **con tesis y antítesis sobre la mesa**. La
   síntesis adoptada se persiste como ADR (ADR-008: toda decisión cerrada es un ADR) o como actualización
   del doc de fundamento, citando qué tensión del Challenger se resolvió y cómo.

**Regla dura:** nada pasa al paso 3 sin haber pasado por el paso 2. Un documento de bases/roadmap sin su
Challenger correspondiente **no está listo para adoptarse**.

## 3. Quién lo dispara y modelo

- Lo dispara el **dueño** (o el PMO en su nombre) cuando detecta que una decisión es de fundamento, no de
  ejecución. El Arquitecto de Solución (ADR-048) puede **sugerir** que algo necesita Advisory+Challenger,
  pero no lo resuelve él mismo — lo eleva.
- **Modelo:** Sonnet 5 por defecto (el debate es texto/juicio acotado, alto volumen → ultra-ahorro); escala
  a Opus **solo** cuando el dueño lo pide o el tramo de la decisión lo amerita.
- **Concurrencia:** cada rol (Advisory, Challenger) corre en su propia sesión/subagente — nunca la misma
  sesión hace de tesis y antítesis a la vez (perdería el valor adversarial). Cuenta dentro del tope global
  de ≤ 4 sesiones concurrentes (`CLAUDE.md → CONCURRENCIA Y PRIORIDADES`).

## 4. Dónde queda el resultado

| Artefacto | Vive en | Quién lo escribe |
|---|---|---|
| Propuesta del Advisory | `docs/fundamentos/*.md` o `docs/estrategia/*.md` | Advisory Board |
| Contrapuntos del Challenger | `docs/estrategia/challenger-contrapuntos.md` (o el archivo espejo del tema) | Challenger |
| Síntesis / decisión | ADR nuevo (`docs/adr/ADR-0XX-*.md`) referenciando ambos documentos | El dueño (con quien lo redacte) |

## 5. Relación con las otras vallas de GSG

- **No reemplaza el Gate de Excelencia** (ADR-040): el Gate audita *entregables* (código/UI/docs de
  producto); Advisory+Challenger audita *decisiones de fundamento* antes de que existan entregables.
- **No reemplaza al Arquitecto de Solución** (ADR-048): el Arquitecto ejecuta lo reversible del día a día;
  Advisory+Challenger es la valla previa a que algo se vuelva "fundamento" que el Arquitecto después
  respeta como marco.
- **Alimenta la retro** (ADR-047): la consolidación periódica incluye explícitamente una revisión
  Advisory+Challenger de las bases vigentes.

## Estado

**Aceptado — vigente.** Operacionaliza `docs/adr/ADR-045-advisory-board-challenger-contrarian.md`.

— Elaborado por **Gestión Studio Grow (GSG)**.
