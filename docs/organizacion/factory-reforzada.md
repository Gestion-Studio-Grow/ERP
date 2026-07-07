# Factory reforzada — estructura de equipos sobre la política de economía

> **Qué es esto:** el diseño de la factory de agentes *agrandada sin dejar gaps*, aprovechando la política de
> modelos ya vigente (`/economia` por default, `/boost` para sprints críticos, y el **Gate GSG siempre en
> Opus** como excepción dura). Formaliza **dos capas** (Opus = juicio, Sonnet = ejecución) unidas por un
> **loop de revisión** (Opus audita la salida de Sonnet antes del merge). Complementa la medición de
> `docs/metricas/costo-uso-factory.md` y se apoya en el método de `docs/METODO-ROLES.md` y en la política de
> `.claude/commands/economia.md` + `boost.md`.
>
> **Autorización:** el dueño autorizó agrandar la estructura. Este doc es diseño/gobernanza — no toca
> producción ni deploy.

---

## 1. Principio de diseño

De la medición (`costo-uso-factory.md`) salen dos verdades que ordenan todo:

1. **Opus es 77% del gasto, pero buena parte es ejecución delegable, no juicio.** El refuerzo consiste en
   **empujar la frontera Opus hacia el núcleo de juicio** y mover el volumen de ejecución a Sonnet.
2. **La calidad no se economiza en el control.** El Gate GSG (auditoría SAP Fiori + sello de Marca GSG)
   corre **siempre en Opus**, aunque la ejecución haya sido Sonnet. Ese es el seguro anti-degradación.

De ahí, la regla de oro de la factory:

> **Sonnet ejecuta el volumen; Opus decide lo caro-de-revertir y audita todo antes del merge.**
> Ningún entregable pasa a `main` sin cruzar el Gate GSG en Opus.

---

## 2. Las dos capas

### Capa OPUS 4.8 — Juicio (alto criterio, alto riesgo, irreversible)
Reservada para trabajo donde un error es caro o difícil de revertir. Roles:

| Rol | Responsabilidad | Cuándo entra |
|---|---|---|
| **PMO / Arquitecto jefe** | Gobierno, prioridades, límites de dominio, ADRs, dispatch de células | Siempre (conduce la factory) |
| **Auditor GSG** | Gate de Excelencia (SAP Fiori 5 principios + accesibilidad + consistencia + sello Marca GSG). **SIEMPRE Opus, sin excepción** | En cada merge (el loop de §3) |
| **Seguridad** | RLS/aislamiento multi-tenant, auth, superficies expuestas, secretos | Cambios que tocan seguridad; go-lives |
| **Fiscal / Dinero** | Cobros, ARCA/facturación, representación de importes (Decimal), caja, conciliación | Cambios que tocan plata |

Regla: la capa Opus **no hace volumen**. Explora en Sonnet, escala a Opus solo para el tramo de decisión y
para el gate. (Es el criterio ya escrito en `economia.md`: "empezá en Sonnet, escalá a Opus para el tramo
crítico, volvé a Sonnet para ejecutar".)

### Capa SONNET 5 — Ejecución (volumen, criterio acotado, reversible)
El caballo de batalla. Una célula por frente:

| Célula | Responsabilidad |
|---|---|
| **Producto por rubro** | Features y branding por tenant/rubro (retail, carnicería, velas, pádel…) |
| **Diseño / vidrieras** | UI, design tokens, primitivos, vidrieras públicas, responsive |
| **Docs / playbooks** | Runbooks, onboarding, preventa, ADRs en borrador (Opus los ratifica) |
| **Tests / QA de ejecución** | Fixtures, harness de tests, cobertura, reproducción de bugs |
| **Exploración / diagnóstico** | Lectura de código, búsquedas, mapeo de subsistemas (read-only) |
| **Provisioning / onboarding** | Alta de tenants siguiendo playbook ya escrito |
| **Arquitecto de Solución** | Ejecuta lo **reversible** de los planes (doc/wiring, backlog, refactors NO-prod tras flag, blueprints, estructura de células) y **eleva lo irreversible** al dueño (puertas Type 1/2, estilo Amazon). Sonnet por defecto; Opus en el borde. Ver **`docs/adr/ADR-048`** + charter `docs/organizacion/arquitecto-de-solucion.md` |

Regla: la capa Sonnet **entrega borradores listos para auditar**, no mergea sola nada sensible (§3).

### Subagentes (Task/Workflow)
Grunt work paralelo (grep masivo, verificación de un finding, lectura de N archivos). **Default Sonnet o
Haiku, nunca Opus** — hoy corren Opus por herencia y es gasto tirado (ver gap G4). El subagente devuelve
dato estructurado; la síntesis de alto juicio la hace la capa Opus.

---

## 3. El loop de revisión = el Gate GSG

El corazón de la factory reforzada: **ninguna salida de Sonnet llega a `main` sin auditoría Opus.**

```
  ┌─────────────┐   borrador    ┌──────────────────┐   ¿pasa?   ┌─────────┐
  │ Sonnet 5    │ ────────────▶ │ Auditor GSG      │ ─────────▶ │  main   │
  │ (ejecución) │   entregable  │ (Opus 4.8, Gate) │   sí       │ (merge) │
  └─────────────┘               └──────────────────┘            └─────────┘
        ▲                              │ no / correcciones
        └──────────────────────────────┘
                 feedback concreto
```

**Reglas del loop:**
1. La célula Sonnet ejecuta y **auto-verifica** (Definición de terminado de `METODO-ROLES.md`: `tsc` verde,
   `npm run build` verde, preview si cambió pantalla). No entrega lo que no probó.
2. El **Auditor GSG (Opus)** corre el Gate completo sobre el entregable: SAP Fiori (5 principios +
   accesibilidad + consistencia) + sello Marca GSG + revisión de correctitud. Emite **pasa / no pasa** con
   feedback concreto.
3. **Pasa** → merge por pathspec a `main` (nunca `-A`; working tree compartido). **No pasa** → vuelve a la
   célula con correcciones puntuales; se repite.
4. **Escalada de riesgo:** si el entregable toca seguridad, plata o arquitectura, el gate **suma** el rol
   Opus correspondiente (Seguridad / Fiscal / Arquitecto), no solo el auditor de UI.
5. El gate **nunca se degrada de modelo**: aunque la sesión esté en `/economia`, la auditoría escala a Opus
   (`/boost` o `/model opus`) y vuelve a Sonnet después. Es la excepción dura ya escrita en `economia.md`.

**Por qué funciona económicamente:** el Gate es output-liviano (leer + veredicto), y el costo lo domina el
contexto, no la generación (§3 de métricas). Auditar en Opus cuesta poco *por auditoría* y compra el seguro
de que nada sale bajo nivel GSG. Es el mejor dólar de Opus que gasta la factory.

---

## 4. Gaps actuales y cómo cubrirlos

Roles/capacidades que hoy faltan o están implícitos, y que al agrandar **no deben quedar como hueco**:

| # | Gap | Síntoma / riesgo hoy | Cobertura propuesta | Capa |
|---|---|---|---|---|
| **G1** | **QA / Testing dedicado** | Los tests los hace quien programa; no hay rol que *rompa a propósito* | Célula **QA** Sonnet (casos borde, regresión, repro de bugs) + verificación adversarial en el gate Opus | Sonnet + gate Opus |
| **G2** | **Growth / Conversión** | Se construye producto sin dueño de embudo/activación/retención | Rol **Growth** que define métricas de conversión por vidriera/tenant y prioriza features por impacto | Opus (estrategia) + Sonnet (implementación de instrumentación) |
| **G3** | **Observabilidad / Telemetría de COSTO** | El gasto se descubrió *a mano* recién ahora; no hay serie temporal | `scripts/finops/parse-claude-usage.mjs` versionado + corrida semanal + tablero de costo por célula/modelo. Dueño: PMO | Automatizado + Opus revisa |
| **G4** | **Modelo de subagentes** | Subagentes corren **Opus por herencia** → gasto tirado (US$ 37 medidos) | Fijar Sonnet/Haiku como default de subagente; Opus solo si el subagente hace juicio | Config |
| **G5** | **Higiene de contexto** | 86% del costo es acarreo de contexto; sesiones de 50 h que se releen a sí mismas | Política de `/compact`, cerrar sesiones largas, células de contexto acotado, evitar cache 1h innecesario | Método |
| **G6** | **SRE / Reliability continuo** | Existe la célula pero es ad-hoc; sin runbook de guardia ni SLOs | Formalizar SLOs + runbook de incidentes; Sonnet ejecuta hardening, Opus decide arquitectura de resiliencia | Sonnet + Opus |
| **G7** | **Data / Migraciones de prod** | Gate DB ya existe (migrate deploy pausado) pero sin rol dueño del ciclo de datos | Rol **Data** (Opus) dueño de migraciones, RLS, integridad; único que propone tocar Neon | Opus |
| **G8** | **Release management** | Deploy es gate manual, pero sin dueño del tren de releases ni checklist único | Rol **Release** que orquesta el tren (batch de merges → build → gate → deploy con OK) | Opus coordina |
| **G9** | **Documentación viva / índice** | Muchos docs; riesgo de deriva entre `main` y lo escrito | Célula Docs Sonnet mantiene `TABLERO-SESIONES.md` + índices ADR sincronizados; parte de la Definición de terminado | Sonnet |

**Prioridad de cobertura (primero lo que más duele/ahorra):**
1. **G4 + G3** (ahorro inmediato y visibilidad): subagentes a Sonnet/Haiku + telemetría de costo semanal.
2. **G5** (el 86% del gasto): higiene de contexto como regla dura del método.
3. **G1** (calidad): QA dedicada alimentando el gate.
4. G6–G8 (escala operativa) a medida que crece el número de tenants/células.
5. G2, G9 (crecimiento y orden) en paralelo, sin bloquear.

---

## 5. Cómo se opera el día a día

- **Default = `/economia` (Sonnet 5).** Toda célula arranca en Sonnet. Es el 100% del volumen de ejecución.
- **Escalada puntual a Opus** para el tramo de decisión (arquitectura, seguridad, plata, metodología) y
  **siempre** para el Gate GSG. Volver a Sonnet para ejecutar.
- **`/boost` (todo Opus)** solo para sprints críticos de punta a punta (go-lives, migraciones, lanzamientos)
  donde el juicio pesa más que el gasto — sabiendo que cuesta ~13% más que economía a igual volumen, y más
  aún porque infla contexto (ver métricas §6).
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

> **Una capa Opus chica y cara que decide y audita; una capa Sonnet grande y barata que ejecuta; y un Gate
> GSG en Opus que nadie saltea antes de `main`.** Se agranda sumando células Sonnet (barato) y cubriendo los
> gaps G1–G9, mientras el núcleo de juicio Opus se mantiene angosto y el gasto se vigila con telemetría
> semanal.

---

*Documento de organización/gobernanza. No toca producción ni deploy. Se apoya en `docs/METODO-ROLES.md`,
`.claude/commands/economia.md`, `.claude/commands/boost.md` y `docs/metricas/costo-uso-factory.md`.*
