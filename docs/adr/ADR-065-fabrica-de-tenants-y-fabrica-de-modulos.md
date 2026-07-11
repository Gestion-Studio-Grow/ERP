---
id: ADR-065
nivel: fundacional
dominio: [Plataforma, Arquitectura]
depends_on: [ADR-019, ADR-021, ADR-034, ADR-054, ADR-055]
---
# ADR-065: Fábrica de tenants (provisioning) + fábrica de módulos (método repetible)

**Estado:** Aceptado — **fundamento de plataforma**. Nombra las dos "fábricas" del motor compartido (ADR-061):
cómo se dan de alta **tenants** y cómo se construyen **módulos** de forma repetible y auditable.
**Fecha:** 2026-07-10
**Depende de:** ADR-019 (provisioning: script idempotente/transaccional), ADR-021 (plano de plataforma),
ADR-034 (preset por IA como motor de alta), ADR-054 (catálogo de módulos/plugins), ADR-055 (variante)
**Relacionado:** ADR-061 (fábrica de altas = motor compartido), ADR-060 (alta en la base del producto),
ADR-042 (autorización del cliente), ADR-040 (Gate bloqueante del preset) · `docs/metodologia/generador-preset-ia.md`

---

## Contexto

Con dos productos (ADR-060), alto volumen self-serve en el micro (ADR-058 P5) y catálogo de módulos por rubro
(ADR-054), el alta y la construcción **no pueden ser artesanales**: son el cuello de la economía (la mano de
obra, ADR-007). Hay que declarar dos **fábricas** como fundamento del motor compartido: una para **instanciar
tenants** y otra para **construir módulos** con método repetible, ambas auditables por el Gate.

## Decisión

### A · Fábrica de TENANTS (provisioning único, transaccional + saga durable + dry-run)
El alta de un tenant es **una sola vía de fábrica**, no scripts sueltos por cliente:
- **Provisioning único y transaccional** (extiende ADR-019): idempotente por `slug`, siembra tenant + OWNER +
  catálogo blueprint mínimo editable (nunca vacío), en la **base del producto** correspondiente (ADR-060).
- **Saga durable** para los pasos que cruzan sistemas y no son atomizables en una sola tx (crear tenant →
  branding/preset → módulos → credenciales fiscales por tenant, ADR-066): pasos con estado persistido,
  **reintentables** y **compensables**, para que un alta a medias se pueda **reanudar o revertir** sin dejar
  basura (mismo espíritu del outbox de ADR-022).
- **Dry-run obligatorio**: toda alta se puede **simular** (qué se crearía) antes de escribir — barrera contra
  el alta accidental y insumo del preset IA (ADR-034) antes de mostrar.
- **Preset por IA** (ADR-034) es el motor de alta del **micro**: ingesta de marca → preset → dry-run → Gate →
  recién ahí se instancia/muestra. **Autorización del cliente primero** (ADR-042), sin OK no se genera.

### B · Fábrica de MÓDULOS (método repetible, no improvisación)
Sumar una capacidad al catálogo (ADR-054) sigue **siempre el mismo método**:
1. **Requisitos desde EVIDENCIA pública** (la red/web del rubro, la competencia) — no desde suposición.
2. **Spec lean firmada por el funcional** (ADR-068): el consultor firma el alcance mínimo antes de construir.
3. **Sobre el MOTOR compartido** (ADR-061): el módulo es plugin aislado con manifiesto (ADR-054), config no
   fork; respeta la variante (objeto + ABM de asignación, ADR-055) y RLS (ADR-062).
4. **Tests-gate**: el módulo entra con sus invariantes/tests y cruza el Gate (ADR-040) — sin verde no se activa.

> **En una línea:** *tenants y módulos salen de una fábrica —dry-run, transaccional/saga, spec firmada,
> tests-gate—, no de scripts a mano; así el alta escala self-serve y los módulos se suman sin drift.*

## Consecuencias

- **(+)** El alta se vuelve **auto-servible y segura** (dry-run + saga reanudable) → sostiene el volumen del
  micro sin mano de obra por cliente (ADR-007/058).
- **(+)** Los módulos crecen con **método uniforme y auditable** (evidencia → spec firmada → motor → tests) →
  catálogo consistente, sin forks (ADR-061/054).
- **(+)** La saga durable evita **altas a medias** (tenant sin branding, sin módulos, sin credenciales) — se
  reanuda o se compensa.
- **(−)** Construir la fábrica (saga + dry-run + registro de casos) es inversión de plataforma por adelantado;
  se justifica por el volumen self-serve, no para 4 tenants a mano. **Definir ≠ construir**: este ADR fija el
  método; la saga/dry-run son construcción posterior con Gate.
- **(−)** El alta real toca infra/secretos/credenciales fiscales (ADR-066) → **Gate del dueño** (irreversible,
  ADR-041/048).

## Alternativas descartadas

- **Un script de alta por cliente/rubro.** Rápido para los primeros, pero no escala y diverge (cada script su
  criterio). Rechazada: una sola fábrica con config por rubro (ADR-055).
- **Alta 100% manual por el operador.** Máximo control pero es exactamente el cuello de mano de obra que la
  economía no soporta (ADR-007). Rechazada para el micro; aceptable solo para enterprise puntual.
- **Módulos ad-hoc sin spec firmada ni tests-gate.** Más veloz pero reintroduce el "a todos con todo" y el
  drift (causa raíz A-1/DX-6/DX-7, ADR-055). Rechazada: método repetible obligatorio.

— Elaborado por GSG (Arquitecto de Solución — fundamento de plataforma; la fábrica es construcción POST-definición con Gate)
