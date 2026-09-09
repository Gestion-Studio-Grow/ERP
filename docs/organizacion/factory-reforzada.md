# Factory reforzada — estructura de equipos sobre la política de economía

> ## ⚖️ NORMA INVERTIDA EL 2026-09-09 — leer antes que nada
> Este documento se escribió cuando **el default era Sonnet**. **Ya no lo es.** Por bajada del dueño
> (**ADR-091**): **el default es OPUS para todo — juicio y ejecución. Sonnet salió de la factory.**
> **Fable** es la única alternativa y se elige **explícitamente**, sólo para **generación de volumen** ya
> decidida. Donde abajo diga "Sonnet ejecuta", leé **"Opus ejecuta; Fable genera volumen cuando se lo
> declara"**. **El Gate GSG en Opus no cambió: sigue siendo la excepción dura y ahora es un piso.**
>
> **Lo que NO se deroga:** la medición de `docs/metricas/costo-uso-factory.md` sigue siendo válida y no se
> toca. Cambió qué se optimiza, no lo que se midió. El análisis de gaps **G1–G9** de §6 también sigue
> vigente **como diagnóstico**; lo único que caduca es el remedio "mandalo a Sonnet".

> **Qué es esto:** el diseño de la factory de agentes *agrandada sin dejar gaps*, aprovechando la política de
> modelos vigente (**Opus por default**, `/boost` para sprints críticos sin ruteo a Fable, y el **Gate GSG
> siempre en Opus** como excepción dura). Formaliza **dos capas** (**Opus = default y juicio, Fable =
> generación declarada**) unidas por un **loop de revisión** (Opus audita toda salida antes del merge). Complementa la medición de
> `docs/metricas/costo-uso-factory.md` y se apoya en el método de `docs/METODO-ROLES.md` y en la política de
> `.claude/commands/economia.md` + `boost.md`.
>
> **Autorización:** el dueño autorizó agrandar la estructura. Este doc es diseño/gobernanza — no toca
> producción ni deploy.

---

## 1. Principio de diseño

De la medición (`costo-uso-factory.md`) salen dos verdades que ordenan todo:

1. **Opus era 77% del gasto, y parte era ejecución delegable.** *(Diagnóstico original, 2026-07.)* La
   respuesta de entonces fue mover volumen a Sonnet. **ADR-091 la revirtió:** el ahorro real era menor al
   de lista porque **el 86% del gasto es acarrear contexto, no generar** — bajar de modelo no toca ese 86%.
   Hoy la frontera se corre distinto: **todo es Opus, y sólo la generación de volumen ya decidida va a Fable.**
2. **La calidad no se economiza en el control.** El Gate GSG (auditoría SAP Fiori + sello de Marca GSG)
   corre **siempre en Opus**, corriera donde corriera el frente. Ese es el seguro anti-degradación.

De ahí, la regla de oro de la factory:

> **Opus decide y ejecuta; Fable genera volumen cuando se lo declara; y Opus audita todo antes del merge.**
> Ningún entregable pasa a `main` sin cruzar el Gate GSG en Opus.

---

## 2. Las dos capas

### Capa OPUS 4.8 — Juicio (alto criterio, alto riesgo, irreversible)
Reservada para trabajo donde un error es caro o difícil de revertir. Roles:

| Rol | Responsabilidad | Cuándo entra |
|---|---|---|
| **PMO puro (autor de planes)** | Gobierno, prioridades, límites de dominio, ADRs, backlog/roadmap/metodología; **propone** planes. **NO ejecuta** producto: el sombrero de **ejecutor/merge** se mudó al **Arquitecto de Solución** (ADR-048/049). | Siempre (autora y conduce; no ejecuta) |
| **Auditor GSG** | Gate de Excelencia (SAP Fiori 5 principios + accesibilidad + consistencia + **ángulo argentino, ADR-044** + sello Marca GSG). **SIEMPRE Opus, sin excepción** | En cada merge (el loop de §3) |
| **Seguridad** | RLS/aislamiento multi-tenant, auth, superficies expuestas, secretos | Cambios que tocan seguridad; go-lives |
| **Fiscal / Dinero** | Cobros, ARCA/facturación, representación de importes (Decimal), caja, conciliación | Cambios que tocan plata |

Regla (**revisada por ADR-091**): la capa Opus **sí hace volumen** — es el default. Lo que se rutea a
Fable es la **producción de lo ya decidido**, declarándolo explícito. El criterio de `economia.md` pasó a
ser: *¿esto es decidir, o producir lo que ya se decidió?*

### Capa de EJECUCIÓN — hoy en **Opus** (default), con **Fable** para generación declarada
El caballo de batalla. Una célula por frente. *(Decía "Capa Sonnet" antes de ADR-091.)*

| Célula | Responsabilidad |
|---|---|
| **Producto por rubro** | Features y branding por tenant/rubro (retail, carnicería, velas, pádel…) |
| **Diseño / vidrieras** | UI, design tokens, primitivos, vidrieras públicas, responsive |
| **Docs / playbooks** | Runbooks, onboarding, preventa, ADRs en borrador (Opus los ratifica) |
| **Tests / QA de ejecución** | Fixtures, harness de tests, cobertura, reproducción de bugs |
| **Exploración / diagnóstico** | Lectura de código, búsquedas, mapeo de subsistemas (read-only) |
| **Provisioning / onboarding** | Alta de tenants siguiendo playbook ya escrito |
| **Arquitecto de Solución** | Ejecuta lo **reversible** de los planes (doc/wiring, backlog, refactors NO-prod tras flag, blueprints, estructura de células) y **eleva lo irreversible** al dueño (puertas Type 1/2, estilo Amazon). **Opus** (ADR-091: separar reversible de irreversible *es* el juicio). Ver **`docs/adr/ADR-048`** + charter `docs/organizacion/arquitecto-de-solucion.md` |

Regla: la capa de ejecución **entrega borradores listos para auditar**, no mergea sola nada sensible (§3).

### Subagentes (Task/Workflow)
Grunt work paralelo (grep masivo, verificación de un finding, lectura de N archivos). **Default Opus; Fable o
Haiku, nunca Opus** — hoy corren Opus por herencia y es gasto tirado (ver gap G4). El subagente devuelve
dato estructurado; la síntesis de alto juicio la hace la capa Opus.

---

## 3. El loop de revisión = el Gate GSG

El corazón de la factory reforzada: **ninguna salida llega a `main` sin auditoría Opus.**

```
  ┌─────────────┐   borrador    ┌──────────────────┐   ¿pasa?   ┌─────────┐
  │ Ejecución   │ ────────────▶ │ Auditor GSG      │ ─────────▶ │  main   │
  │ (ejecución) │   entregable  │ (Opus 4.8, Gate) │   sí       │ (merge) │
  └─────────────┘               └──────────────────┘            └─────────┘
        ▲                              │ no / correcciones
        └──────────────────────────────┘
                 feedback concreto
```

**Reglas del loop:**
1. La célula de ejecución trabaja y **auto-verifica** (Definición de terminado de `METODO-ROLES.md`: `tsc` verde,
   `npm run build` verde, preview si cambió pantalla). No entrega lo que no probó.
2. El **Auditor GSG (Opus)** corre el Gate completo sobre el entregable: SAP Fiori (5 principios +
   accesibilidad + consistencia) + **ángulo argentino (ADR-044)** + sello Marca GSG + revisión de
   correctitud. Emite **pasa / no pasa** con
   feedback concreto.
3. **Pasa** → merge por pathspec a `main` (nunca `-A`; working tree compartido). **No pasa** → vuelve a la
   célula con correcciones puntuales; se repite.
4. **Escalada de riesgo:** si el entregable toca seguridad, plata o arquitectura, el gate **suma** el rol
   Opus correspondiente (Seguridad / Fiscal / Arquitecto), no solo el auditor de UI.
5. El gate **nunca se degrada de modelo**: aunque la sesión esté en `/economia`, la auditoría escala a Opus
   en Opus, sin excepción. Es la excepción dura ya escrita en `economia.md` — hoy un piso, no una escalada.

**Por qué funciona económicamente:** el Gate es output-liviano (leer + veredicto), y el costo lo domina el
contexto, no la generación (§3 de métricas). Auditar en Opus cuesta poco *por auditoría* y compra el seguro
de que nada sale bajo nivel GSG. Es el mejor dólar de Opus que gasta la factory.

---

## 4. Gaps actuales y cómo cubrirlos

Roles/capacidades que hoy faltan o están implícitos, y que al agrandar **no deben quedar como hueco**:

| # | Gap | Síntoma / riesgo hoy | Cobertura propuesta | Capa |
|---|---|---|---|---|
| **G1** | **QA / Testing dedicado** | Los tests los hace quien programa; no hay rol que *rompa a propósito* | Célula **QA** (casos borde, regresión, repro de bugs) + verificación adversarial en el gate Opus | Opus + gate Opus |
| **G2** | **Growth / Conversión** | Se construye producto sin dueño de embudo/activación/retención | Rol **Growth** que define métricas de conversión por vidriera/tenant y prioriza features por impacto | Opus |
| **G3** | **Observabilidad / Telemetría de COSTO** | El gasto se descubrió *a mano* recién ahora; no hay serie temporal | `scripts/finops/parse-claude-usage.mjs` versionado + corrida semanal + tablero de costo por célula/modelo. Dueño: PMO | Automatizado + Opus revisa |
| **G4** | **Modelo de subagentes** | Subagentes corren **Opus por herencia** → gasto tirado (US$ 37 medidos) | Fijar Sonnet/Haiku como default de subagente; Opus solo si el subagente hace juicio | Config |
| **G5** | **Higiene de contexto** | 86% del costo es acarreo de contexto; sesiones de 50 h que se releen a sí mismas | Política de `/compact`, cerrar sesiones largas, células de contexto acotado, evitar cache 1h innecesario | Método |
| **G6** | **SRE / Reliability continuo** | Existe la célula pero es ad-hoc; sin runbook de guardia ni SLOs | Formalizar SLOs + runbook de incidentes; Opus ejecuta hardening y decide arquitectura de resiliencia | Opus |
| **G7** | **Data / Migraciones de prod** | Gate DB ya existe (migrate deploy pausado) pero sin rol dueño del ciclo de datos | Rol **Data** (Opus) dueño de migraciones, RLS, integridad; único que propone tocar Neon | Opus |
| **G8** | **Release management** | Deploy es gate manual, pero sin dueño del tren de releases ni checklist único | Rol **Release** que orquesta el tren (batch de merges → build → gate → deploy con OK) | Opus coordina |
| **G9** | **Documentación viva / índice** | Muchos docs; riesgo de deriva entre `main` y lo escrito | Célula Docs mantiene `TABLERO-SESIONES.md` + índices ADR sincronizados; parte de la Definición de terminado | Opus (Fable para redacción larga) |

**Prioridad de cobertura (primero lo que más duele/ahorra):**
1. **G4 + G3** (ahorro inmediato y visibilidad): subagentes a Sonnet/Haiku + telemetría de costo semanal.
2. **G5** (el 86% del gasto): higiene de contexto como regla dura del método.
3. **G1** (calidad): QA dedicada alimentando el gate.
4. G6–G8 (escala operativa) a medida que crece el número de tenants/células.
5. G2, G9 (crecimiento y orden) en paralelo, sin bloquear.

---

## 5. Cómo se opera el día a día

- **Default = OPUS.** Toda célula arranca en Opus, para juicio y para ejecución (ADR-091).
- **Ruteo puntual a Fable** sólo para **generación de volumen ya decidida** (código sobre spec cerrada,
  scaffolding, documentos largos con el criterio ya fijado). Se **declara**; nunca se hereda.
- **Nunca sale de Opus:** arquitectura, seguridad, plata/fiscal, gobernanza, lo irreversible y **el Gate**.
- **`/boost`** dejó de ser un cambio de modelo y pasó a ser una **postura**: este sprint no rutea nada a
  Fable, ni siquiera la generación.
- **Merge:** siempre por pathspec, nunca `-A` (working tree compartido; ver memoria de commit-race).
- **Gates innegociables** (de `METODO-ROLES.md`): deploy solo con OK explícito; `migrate deploy` pausado y
  reportado; destructivo bloqueado por config.

---

## 6. Presupuesto y control

- **Burn a full** (todas las células): ~US$ 110–135/hora; ~US$ 880–1.080 por jornada de 8 h saturada
  (`costo-uso-factory.md` §5). Sirve como techo para dimensionar cuántas células correr en paralelo.
- **Palanca de ahorro real** (en orden de impacto): (1) higiene de contexto, (2) subagentes fuera de Opus,
  (3) mover ejecución Opus→Sonnet, (4) cache 5m en vez de 1h donde no haga falta persistir. El swap de modelo
  a igual trabajo es la palanca **más chica** — el gran ahorro está en el contexto y en *qué* corre en Sonnet.
- **Regla de gobierno costo-vs-calidad** (memoria PMO): la calidad no se negocia en arquitectura, seguridad y
  fiscal; se evita el desperdicio y la sobre-ingeniería en todo lo demás. El Gate GSG en Opus es
  calidad-no-negociable; los subagentes en Opus son desperdicio evitable.

---

## 7. Resumen en una línea

> **Opus decide, ejecuta y audita; Fable produce el volumen que Opus ya decidió; y un Gate GSG en Opus que
> nadie saltea antes de `main`.** Se agranda sumando células y cubriendo los gaps G1–G9, con el gasto
> vigilado por telemetría semanal — que ahora mide una factory más cara a propósito (ADR-091).

---

*Documento de organización/gobernanza. No toca producción ni deploy. Se apoya en `docs/METODO-ROLES.md`,
`.claude/commands/economia.md`, `.claude/commands/boost.md` y `docs/metricas/costo-uso-factory.md`.*
