# ADR-050: Roster fijo de sprint — estructura estándar de convocatoria (núcleo-siempre + frentes por sprint)

**Estado:** Aceptado — vigente
**Fecha:** 2026-07-07
**Depende de:** ADR-032 (modelo/concurrencia/prioridades), ADR-049 (RACI), ADR-048 (Arquitecto), ADR-045 (Advisory+Challenger)
**Relacionado:** ADR-039 (metodología del sprint), ADR-040 (Gate), ADR-047 (retro), ADR-046 (de-sesgo)
**Wiring:** `.claude/commands/sprint.md` → "Roster fijo de sprint"

---

## Contexto
Cada sprint se armaba **ad-hoc**: qué agentes se convocan quedaba a criterio del momento, con el riesgo de
**olvidar** piezas críticas (el Gate, QA, Seguridad) o de improvisar la conducción. El dueño quiere que
**cada vez que se abre un sprint se convoque SIEMPRE a los mismos agentes**, con estructura fija, y que los
frentes de ejecución se activen **según el frente del sprint** — todo respetando el **tope ≤ 4** en olas y
las prioridades **P1/P2/P3**.

## Decisión
Se fija el **Roster canónico de sprint**, en dos anillos:

### A. NÚCLEO — SIEMPRE convocado (gobernanza + control)
| Rol | Modelo | Función | Cuándo corre |
|---|---|---|---|
| **Dueño** | — (humano) | **APRUEBA** el plan y lo irreversible | gate de aprobación |
| **Dispatch** | — (canal) | **conductor/canal único** con el dueño; releva status; eleva | continuo (lado dueño) |
| **PMO (autor)** | **Opus** | FASE 0 + **propone el plan** + secuencia lo compartido + tablero | arranca el sprint (ola 0) |
| **Arquitecto de Solución (ejecutor)** | **Sonnet** (Opus en el borde) | **ejecuta lo reversible** del plan aprobado; **eleva lo irreversible** | ola de ejecución |
| **Advisory + Challenger** | **Sonnet** | **tensionan** la estrategia (tesis/antítesis) antes de fundamento | puntual (hay decisión de fundamento) |
| **QA / Probador** | **Sonnet** | **prueba como usuario real**; repro de bugs; verifica antes de cerrar | ola de ejecución + pre-cierre |
| **Seguridad** | **Opus** | RLS/aislamiento/auth/secretos; on-call + parte del Gate | puntual (toca su área) + go-lives |
| **Auditoría GSG (el Gate)** | **Opus (siempre)** | corre el Gate completo antes de **cada merge** | en cada merge |

### B. FRENTES — se activan SEGÚN el frente del sprint
| Frente | Modelo | Se activa cuando… |
|---|---|---|
| **Preset IA (Ingesta + Adaptación)** | Opus | hay **alta/onboarding** de cliente nuevo |
| **Producto por rubro** | Sonnet | features/branding por rubro |
| **Adaptador / Delivery por cliente** | Sonnet | **entrega/operación** de un cliente (`tenant/<slug>`) |
| **ERP cores** — Pagos · Caja · Inventario/POS · Fiscal · Plataforma/Deploy · Diseño | Sonnet (escala a Opus/Seguridad/Fiscal en su tramo) | el sprint toca ese dominio |
| **Agencia Digital** — Consultores/Mercado · Desarrolladores · PMO proactivo · Growth · WhatsApp | Sonnet (estrategia → Opus) | el sprint incluye el sector |
| **(Importaciones `impo`)** | Opus | trigger **propio** (`impo`), no `sprint` — mencionado por completitud |

### C. Concurrencia y olas (≤ 4)
- El **PMO orquesta** (1 sesión sobre `main`). El tope **≤ 4 corriendo** aplica a las **sesiones de
  ejecución**: el PMO despacha en **olas de ≤ 4** por prioridad.
- El **núcleo de control entra PUNTUAL, no ocupa cupo permanente:** el **Gate** corre al merge, **Seguridad**
  cuando toca su área, **Advisory+Challenger** cuando hay decisión de fundamento. Así el ≤ 4 se respeta.
- **En congestión: solo P1** (demos/venta), ≤ 4; P2 espera; P3 pausado (ADR-032).

### D. Orden canónico de arranque
1. **Ola 0 — PMO:** FASE 0 (foto `ESTADO-ACTUAL.md`) → **propone el plan** → **Dueño aprueba** (vía Dispatch).
2. **Ola de ejecución (P1, ≤ 4):** Arquitecto ejecuta lo **reversible** + hasta 3 frentes del plan; **QA prueba** lo que sale.
3. **Puntual:** Advisory+Challenger si hay fundamento; Seguridad si toca su área; **Gate GSG en cada merge**.
4. **Irreversible → se ELEVA** al Dueño (Dispatch). **Cierre:** **retro** (ADR-047) + **backup** (tag `snapshot/`).

**Flujo canónico:** **PMO propone → Dueño aprueba → Arquitecto ejecuta reversible / eleva irreversible → Dispatch releva** (ADR-049).

## Consecuencias
- **(+)** Todo sprint arranca con **la misma estructura** → nada crítico se olvida (Gate, QA, Seguridad
  siempre presentes); la conducción es predecible.
- **(+)** Respeta el ≤ 4 porque el **control entra puntual** (no ocupa cupo fijo); los frentes se activan
  solo si el sprint los toca (no se abre de gusto).
- **(−)** Requiere **disciplina de olas** y que el PMO clasifique bien P1/P2/P3 al despachar.

## Estado
**Aceptado — vigente.** Wireado en `.claude/commands/sprint.md` ("Roster fijo de sprint").
