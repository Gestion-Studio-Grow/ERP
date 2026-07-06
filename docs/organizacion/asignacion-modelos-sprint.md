# Asignación de MODELO por sesión del `sprint` (cableado)

> **Qué es esto:** la regla dura de **qué modelo abre cada sesión** cuando se dispara `sprint`. Formaliza
> las dos capas de `docs/organizacion/factory-reforzada.md` (Opus = juicio, Sonnet = ejecución) y las
> **cablea a la estructura de frentes** del sprint, de modo que al invocar `sprint` cada sesión aislada
> nazca **con su modelo asignado**, sin decidirlo a mano cada vez.
>
> **Fuente de la política:** `docs/organizacion/factory-reforzada.md` (§2 dos capas, §3 Gate GSG siempre
> Opus, §5 operación día a día). Este doc es el **mapa sesión→modelo** que operacionaliza esa política
> dentro de `.claude/commands/sprint.md`. Doc de gobernanza — no toca producción ni deploy.

---

## 1. Regla de oro (economía por defecto, Opus donde pesa el juicio)

> **Sonnet 5 es el default de TODA sesión de ejecución (`/economia`). Opus 4.8 se reserva para la capa
> de alto juicio y para la Auditoría GSG, que corre SIEMPRE en Opus sin excepción.**

- **Default = Sonnet 5** — el 100% del volumen de ejecución arranca en Sonnet (regla de `factory-reforzada.md §5`).
- **Opus 4.8 = capa angosta y cara** — solo lo caro-de-revertir, la seguridad, la plata, la arquitectura y
  el **Gate de Excelencia/GSG**. La capa Opus **no hace volumen**: explora/ejecuta en Sonnet y escala a
  Opus solo para el tramo de decisión (criterio ya escrito en `economia.md`).
- **Excepción dura, no negociable:** la **Auditoría GSG / Gate de Excelencia** corre **siempre en Opus**,
  aunque la ejecución del frente haya sido Sonnet y aunque la sesión esté en `/economia`. Es el seguro
  anti-degradación (`factory-reforzada.md §3`).

---

## 2. Mapa sesión → modelo (lo que `sprint` abre automáticamente)

Al invocar `sprint`, la creación automática de sesiones (regla 1 de la metodología) abre cada frente
**con el modelo de esta tabla**. Dos capas:

### Capa OPUS 4.8 — alto juicio (caro de revertir / seguridad / plata / arquitectura / gate)

| Sesión | Por qué Opus (criterio §3) | Ancla en la estructura del sprint |
|---|---|---|
| **PMO / Arquitecto jefe** | Conduce la factory: prioridades, límites de dominio, ADRs, secuencia lo compartido, merge-master. Error de gobierno/arquitectura = caro e irreversible. | Capa PMO (sobre `main`, sin worktree) — `factory-reforzada.md §2` |
| **Auditoría GSG / Excelencia (el Gate)** | **SIEMPRE Opus, sin excepción.** Corre el Gate completo (SAP Fiori + accesibilidad + consistencia + sello Marca GSG + correctitud) antes de cada merge. Es la excepción dura. | Loop de revisión `factory-reforzada.md §3`; Gate de Excelencia de `METODOLOGIA-SPRINT.md` |
| **Seguridad** | RLS/aislamiento multi-tenant, auth, superficies expuestas, secretos. Un error de aislamiento es caro e irreversible. | Rol Opus "Seguridad" (`factory-reforzada.md §2`); escala cuando **Plataforma** toca RLS/auth |
| **Preset IA — Ingesta + Adaptación** | Fidelidad de marca del cliente, extracción de identidad, y el **Gate bloqueante del preset**: decisiones de calidad/adaptación difíciles de revertir de cara al cliente. | Generador de Preset IA (`docs/metodologia/generador-preset-ia.md`; memorias preset ingesta/adaptación) |

### Capa SONNET 5 — ejecución (volumen, criterio acotado, reversible)

| Sesión | Por qué Sonnet (criterio §3) | Ancla en la estructura del sprint |
|---|---|---|
| **Probador interactivo** | Verificación/preview, repro de bugs, QA de ejecución. Volumen, reversible, criterio acotado. | Célula QA/verificación (`factory-reforzada.md §2` + gap G1) |
| **Adaptador para cliente** | Delivery/onboarding por cliente (config, datos, deliverables). **No toca el core compartido** (regla 4 de delivery). | Delivery por cliente `tenant/<slug>` (`METODOLOGIA-SPRINT.md` regla 4) |
| **Plataforma / Deploy / Infra** | Perf, observabilidad, reporting, tren de deploy: ejecución sobre archivos propios. **Escala a Opus/Seguridad** cuando toca RLS/tenancy/auth (cimiento compartido). | Core **Plataforma** (`frente/plataforma`) + Release/Infra |
| **Productos por rubro** | Features y branding por tenant/rubro (retail, carnicería, velas, pádel…). Volumen, reversible. | Célula "Producto por rubro" (`factory-reforzada.md §2`); cores ERP de dominio |
| **Growth / Agencia Digital** | Instrumentación de conversión y ejecución del sector Agencia Digital. La **estrategia** escala a Opus; la implementación es Sonnet. | Sector B Agencia Digital + gap G2 Growth |

---

## 3. Criterio de asignación (por qué cada sesión lleva su modelo)

La decisión **modelo por sesión** sale de una sola pregunta: **¿el error de esta sesión es caro o difícil
de revertir?** Si sí → Opus; si no → Sonnet. Dimensiones que empujan a **Opus**:

1. **Irreversibilidad / riesgo** — cambios caros de deshacer: arquitectura, límites de dominio, migraciones,
   go-lives. (PMO, Data/Migraciones, Release en su tramo de decisión.)
2. **Seguridad** — RLS/aislamiento multi-tenant, auth, secretos, superficies expuestas.
3. **Plata (Fiscal/Dinero)** — cobros, ARCA/facturación, representación de importes (Decimal), caja,
   conciliación. **Nota:** los cores **Pagos** y **Fiscal** del sprint ejecutan volumen en Sonnet, pero su
   **tramo de decisión sobre plata escala a Opus** (rol "Fiscal/Dinero" de `factory-reforzada.md §2`).
4. **Juicio de marca/producto de cara al cliente** — el Gate GSG y el Gate del Preset: lo que sale con el
   sello GSG se audita en Opus.
5. **El Gate, siempre** — cualquier merge cruza la Auditoría GSG en Opus, sin importar en qué modelo se
   ejecutó el frente.

Todo lo demás — volumen de ejecución, reversible, criterio acotado — es **Sonnet por default** (`/economia`).
La palanca de swap de modelo a igual trabajo es la más chica; el gran ahorro está en el contexto y en *qué*
corre en Sonnet (`factory-reforzada.md §6`). Por eso la capa Opus se mantiene **angosta**.

### Escalada dentro de una sesión Sonnet (patrón `economia.md`)
Una sesión Sonnet **no cambia de dueño** cuando necesita juicio: **escala puntualmente a Opus** para el
tramo crítico (arquitectura, seguridad, plata, metodología) y **vuelve a Sonnet** para ejecutar. La
Auditoría GSG es el punto fijo de escalada: **todo entregable pasa por Opus antes de `main`**.

### Subagentes (Task/Workflow) — nunca Opus por herencia
El grunt work paralelo (grep masivo, verificar un finding, leer N archivos) corre en **Sonnet o Haiku**,
**nunca Opus** (`factory-reforzada.md §2` + gap G4). El subagente devuelve dato estructurado; la síntesis
de alto juicio la hace la capa Opus.

---

## 4. Cómo se cablea (mecánica de "cada sesión abre con su modelo")

`sprint` abre **1 frente = 1 worktree = 1 sesión**. El modelo se fija al abrir cada sesión, según la
tabla §2, por cualquiera de estas vías equivalentes:

- **Dentro de la sesión orquestadora (PMO despacha subagentes):** al despachar el subagente de un frente
  (Agent tool / `Task`), el PMO pasa el **modelo de la tabla §2** en el parámetro de modelo del subagente
  (Opus para la capa de juicio y el Gate; Sonnet para ejecución). El subagente ES la sesión aislada del
  frente y nace con su modelo.
- **Desde el móvil / Dispatch (N sesiones `claude` separadas):** cada sesión se abre con su modelo
  (`/model opus` o `/model sonnet` según §2; `/economia` = Sonnet por default, `/boost` = todo Opus solo
  para sprints críticos de punta a punta).
- **Gate GSG:** aunque el frente haya corrido en Sonnet, la Auditoría GSG **escala a Opus** (`/boost` o
  `/model opus`) para correr el Gate y **vuelve a Sonnet** después. No se degrada nunca de modelo.

> **Default sin instrucción:** si una sesión se abre sin modelo explícito, **asume Sonnet 5** (`/economia`).
> Solo la capa de juicio de §2 y el Gate arrancan en Opus.

---

## 5. Reconciliación con los cores del sprint (ERP)

La tabla §2 es la **vista por capa de juicio**. Los cores de dominio del sprint
(`METODOLOGIA-SPRINT.md` → Mapa de sectores y cores) se mapean así:

| Core del sprint | Modelo base | Escala a Opus cuando… |
|---|---|---|
| **Pagos** | Sonnet | toca plata/conciliación (rol Fiscal/Dinero) o el Gate |
| **Caja** | Sonnet | toca arqueo/plata (rol Fiscal/Dinero) o el Gate |
| **Inventario/POS** | Sonnet | cambia schema compartido (decisión de arquitectura) o el Gate |
| **Fiscal (ARCA)** | Sonnet | toca facturación/importes (rol Fiscal/Dinero) o el Gate |
| **Plataforma** | Sonnet | toca RLS/tenancy/auth (rol Seguridad) o el Gate |
| **Diseño** | Sonnet | siempre pasa el Gate GSG (Opus) antes de `main` |
| **Agencia Digital** | Sonnet | estrategia/diferencial (juicio) o el Gate |

El patrón es uniforme: **base Sonnet, escalada puntual a Opus por dimensión de riesgo (§3), Gate GSG
siempre Opus**.

---

## 6. Resumen en una línea

> **Todo `sprint` abre en Sonnet salvo la capa de juicio —PMO, Seguridad, Preset IA— y la Auditoría GSG,
> que son Opus; y el Gate GSG en Opus no lo saltea nadie antes de `main`.**

---

*Documento de organización/gobernanza. Operacionaliza `docs/organizacion/factory-reforzada.md` y se
cablea en `.claude/commands/sprint.md`. No toca producción ni deploy.*
