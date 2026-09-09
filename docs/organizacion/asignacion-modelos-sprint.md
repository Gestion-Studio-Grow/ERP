# Asignación de MODELO por sesión del `sprint` (cableado)

> **Qué es esto:** la regla dura de **qué modelo abre cada sesión** cuando se dispara `sprint`. Formaliza
> las dos capas de `docs/organizacion/factory-reforzada.md` (**Opus = default/juicio, Fable = generación
> declarada**; Sonnet derogado por ADR-091) y las
> **cablea a la estructura de frentes** del sprint, de modo que al invocar `sprint` cada sesión aislada
> nazca **con su modelo asignado**, sin decidirlo a mano cada vez.
>
> **Fuente de la política:** `docs/organizacion/factory-reforzada.md` (§2 dos capas, §3 Gate GSG siempre
> Opus, §5 operación día a día). Este doc es el **mapa sesión→modelo** que operacionaliza esa política
> dentro de `.claude/commands/sprint.md`. Doc de gobernanza — no toca producción ni deploy.

> **⚖️ Carácter — OBLIGATORIO Y ESTRICTO, no opcional.** Esto no es solo del comando `sprint`: es el
> **modelo de trabajo obligatorio de GSG**, vigente **siempre** a nivel usuario / App / GSG (desktop y
> móvil, se use o no `sprint`). El fundamento de alto nivel vive en `CLAUDE.md` → "MODELO DE TRABAJO DE
> GSG"; este doc es su detalle operativo.

---

## 1. Regla de oro (Opus es el default; Fable sólo para generación declarada)

> **OPUS es el default de TODA sesión — juicio y ejecución. Sonnet salió de la factory. FABLE es la única
> alternativa y se elige EXPLÍCITAMENTE, sólo para generación de volumen ya decidida.**

- **Default = Opus** (`claude-opus-5`). Una sesión que no declara modelo corre en Opus, y está bien.
- **Fable** (`claude-fable-5-1`) = **capa de generación**, nunca de decisión: código largo sobre una spec
  cerrada, scaffolding, consolas, análisis extensos cuyo marco ya fijó Opus, fixtures y tareas mecánicas.
  **Se declara; no se hereda.**
- **Sonnet: fuera de norma.** Una sesión o charter que todavía diga Sonnet se corrige antes de trabajar.
- **Excepción dura, no negociable:** la **Auditoría GSG / Gate de Excelencia** corre **siempre en Opus**,
  aunque la generación del frente haya corrido en Fable. Es el seguro anti-degradación
  (`factory-reforzada.md §3`). Con el default en Opus, deja de ser una escalada y pasa a ser un **piso**.

> **⚖️ Esta regla se invirtió el 2026-09-09** (bajada del dueño, **ADR-091**). La versión anterior ponía
> *Default = Sonnet* para ahorrar. **La medición que la sostenía (`docs/metricas/costo-uso-factory.md`)
> sigue siendo válida y no se toca** — lo que cambió es qué se optimiza: **la consistencia del juicio en
> toda la cadena por encima del ahorro por tarea**. El propio análisis ya avisaba que el ahorro real era
> menor al de lista, porque **el 86% del gasto es acarrear contexto, no generar**.

---

## 2. Mapa sesión → modelo (lo que `sprint` abre automáticamente)

Al invocar `sprint`, la creación automática de sesiones (regla 1 de la metodología) abre cada frente
**con el modelo de esta tabla**.

### Capa OPUS — el default (todos los frentes, salvo que se declare Fable)

| Sesión | Rol | Ancla en la estructura del sprint |
|---|---|---|
| **PMO puro (AUTOR de planes)** | Genera/mantiene **backlog · roadmap · metodología · ADRs**; **propone** planes. **NO ejecuta** cambios de producto — el sombrero de ejecutor/merge está en el **Arquitecto de Solución** (ADR-048/049). | Capa PMO (sobre `main`, sin worktree) — `factory-reforzada.md §2` · **ADR-049** |
| **Auditoría GSG / Excelencia (el Gate)** | **SIEMPRE Opus, sin excepción.** Gate completo (SAP Fiori + accesibilidad + consistencia + **ángulo argentino, ADR-044** + sello GSG) antes de cada merge. | Loop de revisión `factory-reforzada.md §3`; Gate de `METODOLOGIA-SPRINT.md` |
| **Seguridad** | RLS/aislamiento multi-tenant, auth, superficies expuestas, secretos. | Rol "Seguridad" (`factory-reforzada.md §2`) |
| **Preset IA — Ingesta + Adaptación** | Fidelidad de marca del cliente y **Gate bloqueante del preset**. | `docs/metodologia/generador-preset-ia.md` |
| **Arquitecto de Solución** | Ejecuta lo **reversible** y **eleva lo irreversible** (puertas Type 1/2). Separar reversible de irreversible **es** el juicio: por eso no baja de Opus. | **ADR-048** · `docs/organizacion/arquitecto-de-solucion.md` |
| **Probador interactivo** | Verificación/preview, repro de bugs, QA. | Célula QA (`factory-reforzada.md §2`) |
| **Adaptador para cliente** | Delivery/onboarding por cliente. **No toca el core compartido** (regla 4). | Delivery `tenant/<slug>` |
| **Plataforma / Deploy / Infra** | Perf, observabilidad, reporting, tren de deploy; RLS/tenancy/auth con Seguridad. | Core **Plataforma** + Release/Infra |
| **Productos por rubro** | Features y branding por tenant/rubro. | Célula "Producto por rubro" |
| **Growth / Agencia Digital** | Conversión y ejecución del sector. | Sector B Agencia Digital |
| **Mesa de Dinero** | Investigación de rentabilidad; **no opera**. Todo Opus salvo `mesa-datos` (Fable). | **ADR-090** · `docs/organizacion/mesa-de-dinero.md` |

### Capa FABLE — generación de volumen (se DECLARA, nunca se hereda)

| Cuándo | Ejemplos |
|---|---|
| La decisión ya está tomada y lo que queda es **producir** | Consolas y herramientas internas sobre spec cerrada (ej. `mesa-datos`), conectores, scaffolding, componentes repetitivos, fixtures/datasets, documentos y análisis extensos cuyo criterio fijó Opus |

**Nunca en Fable:** arquitectura/ADRs · seguridad · plata/fiscal · gobernanza · lo irreversible · **el Gate**.

---

## 3. Criterio de asignación (una sola pregunta)

> **¿Esto es DECIDIR, o es PRODUCIR lo que ya se decidió?**

- **Decidir → Opus.** Es el default: **ante la duda, Opus.**
- **Producir volumen ya decidido → Fable**, y sólo si se declara explícito.

Dimensiones que **fijan** Opus sin discusión:

1. **Irreversibilidad / riesgo** — arquitectura, límites de dominio, migraciones, go-lives.
2. **Seguridad** — RLS/aislamiento multi-tenant, auth, secretos, superficies expuestas.
3. **Plata (Fiscal/Dinero)** — cobros, ARCA, importes (Decimal), caja, conciliación, **y toda la Mesa de
   Dinero** (ADR-090).
4. **Juicio de marca/producto de cara al cliente** — Gate GSG y Gate del Preset.
5. **El Gate, siempre** — todo merge cruza la Auditoría GSG en Opus, corriera donde corriera el frente.

### Subagentes (Task/Workflow)
Heredan **Opus**. Pueden despacharse a **Fable** para generación de volumen, declarándolo en el parámetro
de modelo. **Nunca a Sonnet.** El subagente devuelve dato estructurado; la síntesis de alto juicio la hace
la capa Opus.

### Los agentes declaran el modelo en el FRONTMATTER, no en la prosa
Un charter que dice "capa Opus" en el encabezado pero no trae `model:` en el frontmatter **no fija nada**:
el subagente hereda el modelo del padre. Es la causa exacta de **MP-4** y **MP-9**. Los 31 agentes de
`.claude/agents/` traen `model:`; **`npm run brain` lo audita** y marca en rojo al que no.

---

## 4. Cómo se cablea (mecánica de "cada sesión abre con su modelo")

`sprint` abre **1 frente = 1 worktree = 1 sesión**. El modelo se fija al abrir cada sesión, según la
tabla §2, por cualquiera de estas vías equivalentes:

- **Dentro de la sesión orquestadora (PMO despacha subagentes):** al despachar el subagente de un frente
  (Agent tool / `Task`), el PMO pasa el **modelo de la tabla §2** en el parámetro de modelo del subagente
  (**Opus por default**; Fable sólo si el frente es generación de volumen declarada). El subagente ES la
  sesión aislada del frente y nace con su modelo.
- **Desde el móvil / Dispatch (N sesiones `claude` separadas):** cada sesión se abre con su modelo
  (`/model opus` —el default— o `/model fable` según §2; `/economia` = modo generación, `/boost` = todo
  Opus sin ruteo a Fable).
- **Gate GSG:** aunque la generación del frente haya corrido en Fable, la Auditoría GSG **se corre en
  Opus**, sin excepción. No se degrada nunca de modelo.

### Etiquetado explícito de modelo (regla dura)
**Cada célula declara y fija su modelo de forma explícita** —`/model opus` | `/model fable`, o el
parámetro de modelo al despachar el subagente (Agent/`Task`)— según §2. **Nunca se apoya en el default de
la cuenta ni lo asume.** Una sesión que arranca sin modelo declarado está **fuera de norma**: se corrige
antes de trabajar. El **PMO verifica el etiquetado** al despachar cada frente; el etiquetado explícito es
lo que hace la asignación auditable y reproducible (no depende de cómo esté configurada la cuenta).

> **Default de seguridad:** si una sesión llegara a abrirse sin modelo declarado, **corre en Opus** — que
> es el default del proyecto (`.claude/settings.json`) y el lado seguro del error. Igual se declara: lo que
> hace la asignación auditable es el etiquetado explícito, no el default.

---

## 5. Reconciliación con los cores del sprint (ERP)

La tabla §2 es la **vista por capa de juicio**. Los cores de dominio del sprint
(`METODOLOGIA-SPRINT.md` → Mapa de sectores y cores) se mapean así:

| Core del sprint | Modelo | Puede rutear generación a Fable en… |
|---|---|---|
| **Pagos** | **Opus** | nada — toca plata; se queda entero en Opus |
| **Caja** | **Opus** | nada — toca arqueo/plata |
| **Fiscal (ARCA)** | **Opus** | nada — toca facturación/importes |
| **Plataforma** | **Opus** | nada cuando toca RLS/tenancy/auth; scaffolding de observabilidad, sí |
| **Inventario/POS** | **Opus** | componentes repetitivos de UI sobre spec cerrada |
| **Diseño** | **Opus** | variantes de componentes sobre tokens ya decididos |
| **Agencia Digital** | **Opus** | producción de contenido largo con el ángulo ya fijado |

El patrón es uniforme: **base Opus siempre; Fable sólo para producir lo ya decidido, y nunca donde hay
plata, seguridad o irreversibilidad; Gate GSG siempre Opus**.

---

## 6. Resumen en una línea

> **Todo `sprint` abre en Opus. Fable sólo se declara para producir lo que ya se decidió. Sonnet salió de
> la factory. Y el Gate GSG en Opus no lo saltea nadie antes de `main`.**

---

*Documento de organización/gobernanza. Operacionaliza `docs/organizacion/factory-reforzada.md` y se
cablea en `.claude/commands/sprint.md`. No toca producción ni deploy.*
