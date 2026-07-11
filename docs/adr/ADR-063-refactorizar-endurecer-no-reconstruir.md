---
id: ADR-063
nivel: fundacional
dominio: [Arquitectura, Operaciones]
depends_on: [ADR-006, ADR-010]
---
# ADR-063: Refactorizar y endurecer, NO reconstruir de cero (decidido con evidencia del ground-truth)

**Estado:** Aceptado — **fundamento de estrategia técnica**. Ratifica y generaliza el "Camino A" de ADR-010
(evolucionar, no reescribir) sobre la evidencia medida del repo: **~65% de madurez**.
**Fecha:** 2026-07-10
**Depende de:** ADR-006 (motores: construir 4, diferir 4 — no todo de una), ADR-010 (Camino A: evolucionar el
piloto Next.js, no reescribir)
**Relacionado:** ADR-061 (motor compartido), ADR-064 (núcleo transaccional: cimientos correctos + 3 cierres),
ADR-062 (RLS cableado + gaps), ADR-040 (Gate) · `docs/estrategia/mapa-grounded-sistema-2026-07-09.md`

---

## Contexto

Ante la escala de la visión (dos productos, ADR-060; motor compartido, ADR-061; núcleo transaccional completo,
ADR-064) aparece siempre la tentación del **rewrite** ("arranquemos limpio"). La decisión de construir se tomó
**con evidencia**, no con intuición: el mapa de verdad de terreno (`mapa-grounded-sistema-2026-07-09.md`)
midió el estado real del código y lo situó en **~65% de madurez** — no un prototipo desechable, sino una base
funcional con huecos localizados:

- **Cimientos correctos ya construidos:** multi-tenant con aislamiento de aplicación + RLS cableado (ADR-062),
  ledger append-only de stock y caja, calculadoras puras testeadas, venta atómica orden+stock con outbox fiscal,
  plugin ARCA scaffold, harness de tests (`node:test`), design system + primitivos.
- **Huecos localizados, no estructurales:** los "3 cierres" del núcleo transaccional (ADR-064: idempotencia de
  factura por venta, atomicidad venta+caja, pricing unificado), los 3 gaps de RLS (ADR-062), la adopción del
  design system, la parametrización por producto (ADR-061).

Reescribir tiraría el 65% que ya pasó por producción y validación, para reintroducir sus mismos problemas.

## Decisión

**Se refactoriza y se endurece lo existente; NO se reconstruye de cero.** El trabajo es **cerrar huecos
localizados sobre una base madura**, no reemplazar la base.

**Principios operativos:**
1. **Evidencia antes que impulso.** Toda propuesta de "rehacer X" se contrasta contra el ground-truth
   (`mapa-grounded-sistema`) — se rehace solo lo que la evidencia muestra estructuralmente roto, no lo que
   "se ve viejo".
2. **Aditivo y reversible por defecto** (mismo criterio ADR-055/059): entidades/índices nuevos, flags OFF,
   detrás de puerta — no mutar los campos vivos. El ledger convive con el campo-caché (ADR-064 §2.2).
3. **Endurecer = tests + invariantes + gates**, no reescribir. El progreso se mide cerrando invariantes
   (ADR-064 I1–I7) y gaps (ADR-062), verificados por el Gate (ADR-040), no por líneas nuevas.
4. **Rewrite acotado solo con caso probado.** Reemplazar un módulo puntual es válido **si** la evidencia lo
   justifica y queda detrás de flag; un rewrite **total** no está autorizado.

> **En una línea:** *tenemos el 65% construido y probado en producción — el trabajo es cerrar el 35% de
> huecos con disciplina aditiva, no tirar lo que funciona para reintroducir sus bugs.*

## Consecuencias

- **(+)** Preserva el capital ya validado (código en prod, tests, aprendizaje) y **acelera**: cerrar huecos es
  más rápido y menos riesgoso que reconstruir.
- **(+)** Menor riesgo de regresión: lo que hoy funciona en prod sigue funcionando; los cambios son aditivos y
  gateados.
- **(+)** Encaja con la economía (ADR-007/032): no se gastan tokens/tiempo re-fabricando lo que ya existe.
- **(−)** Convivencia de patrones (ledger + campo-caché, viejo + nuevo detrás de flag) durante la transición —
  más superficie mientras dura. Se acota con flags y deuda anotada (Gate, ADR-040 bloque 3).
- **(−)** Requiere **disciplina para no "rewritear por comodidad"**: es más tentador rehacer que entender el
  código existente. Lo frena la regla "evidencia antes que impulso" + el Gate.

## Alternativas descartadas

- **Rewrite total desde cero.** Base "limpia" pero tira el 65% probado, reintroduce bugs ya resueltos, y
  detiene la entrega de valor durante meses. Rechazada: contradice la evidencia (ADR-010 Camino A) y la economía.
- **Congelar y solo parchear** (ni refactor ni rewrite). Evita riesgo a corto plazo pero deja los huecos
  estructurales abiertos (los 3 cierres, los 3 gaps) → deuda que explota con la escala. Rechazada.
- **Reescribir "los módulos feos" sin criterio de evidencia.** Rewrite selectivo guiado por estética, no por
  datos. Rechazada: solo se rehace lo que el ground-truth muestra roto, y siempre detrás de flag.

— Elaborado por GSG (Arquitecto de Solución — fundamento de estrategia técnica, reversible/doc-only)
