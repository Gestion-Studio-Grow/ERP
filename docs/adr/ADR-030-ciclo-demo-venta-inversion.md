---
id: ADR-030
nivel: evolutiva
dominio: [Producto, Negocio]
depends_on: [ADR-028, ADR-031]
---
# ADR-030: Ciclo DEMO → VENTA → INVERSIÓN — no se invierte hasta vender

**Estado:** Aceptado (2026-07-06) — norma de negocio vigente, no salteable
**Fecha:** 2026-07-06
**Depende de:** ADR-031 (dos fases de credenciales), ADR-028 (modelo de entrega)
**Relacionado:** ADR-032 (prioridades P1/P2/P3)

---

## Contexto
Riesgo de **comprometer capital** (comprar dominio, activar cómputo/persistencia, cargar datos reales)
**antes de tener una venta**. Prioridad explícita del dueño: **costo sobre velocidad**. Hace falta una
regla dura que ordene *cuándo* se gasta.

## Decisión
Regla de gasto **obligatoria**, aplicable a **todos** los negocios/preventas: **no se invierte un peso
hasta que la venta está concretada.**
1. **DEMO — antes de la venta:** gratis, en la **URL gratuita** (app del flujo en modo demo / probador
   sandbox), **sin datos reales, sin passwords, sin persistencia, sin dominio propio**.
2. **VENTA — el disparador:** la inversión se habilita **recién** con el OK comercial del cliente.
3. **INVERSIÓN — después de la venta:** se compra el **dominio propio** y/o se activa el **tenant con
   datos reales** (persistencia + login, RLS enforced). Los secretos **los pega siempre el dueño**
   (FASE 2, ADR-031).

## Consecuencias
- **(+)** Cero capital comprometido en prospectos; el gasto se concentra en lo que vende (alineado con las
  prioridades P1/P2/P3 de ADR-032 y el costo-cero del playbook de demo).
- **(+)** Los gates de plata (deploy, dominio, Neon) quedan atados a un disparador comercial claro.
- **(−)** Un consolidado no "se ve completo" (persistencia real) hasta que se vende/activa; hay que ser
  explícito sobre qué es demo.
- **Toca:** `CLAUDE.md` ("CICLO DEMO → VENTA → INVERSIÓN"), `docs/metodologia/demo-publica-costo-cero.md`.

## Estado
**Aceptado.** Documentado como norma dura en `CLAUDE.md`. Se apoya en las dos fases de credenciales
(ADR-031) y el modelo de entrega (ADR-028).
