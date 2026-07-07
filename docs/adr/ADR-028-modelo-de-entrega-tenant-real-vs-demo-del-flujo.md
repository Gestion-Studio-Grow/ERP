# ADR-028: Modelo de entrega — cliente consolidado = tenant real en su URL; demo = app del flujo; fin de los previews estáticos

**Estado:** Aceptado (2026-07-06) — en reconversión (ver `docs/PLAN-RECONVERSION-CLIENTES.md`)
**Depende de:** ADR-001 (multi-tenant), ADR-029 (ruteo por hostname), ADR-019 (provisioning)
**Relacionado:** ADR-030 (ciclo demo→venta→inversión), ADR-031 (demo navegable), ADR-034 (preset por IA)

---

## Contexto
Las demos se venían sirviendo como **páginas estáticas** en `public/previews/*` (láminas). Eso confunde
"lámina" con "producto": a medida que hay **clientes reales** (CH Estética vivo, Magra ya tenant real) y
**prospectos**, hace falta definir con precisión qué es el entregable de un negocio, y dejar de mantener
maquetas estáticas en paralelo al producto real (que divergen y engañan).

## Decisión
El entregable de un negocio es **el PRODUCTO REAL del ERP multi-tenant (front + backoffice) servido en su
URL con nombre de cliente** (`<cliente>-erp.vercel.app`), no una página estática. Distinción dura:
- **CLIENTES CONSOLIDADOS** (A Dos Manos · CH Estética · Magra · Shine) = **producto real** con **datos
  reales** (FASE 2), **sin preview estático**. Son clientes, no maquetas.
- **DEMO / prospecto** (ej. Break Point) = el **mismo front+back pero salido del flujo** (Generador de
  Preset / Adaptador, ADR-034) en **modo demo, sin datos reales** (FASE 1), servido igual en una URL con
  nombre de cliente.
- **`public/previews/*` estáticos → DEPRECADOS** para los consolidados: se **retiran cuando el producto
  real sirve la URL** (no antes, para no dejar la URL sin nada). El estático es transición, no destino.

## Consecuencias
- **(+)** Un solo artefacto —la app real— sirve demo y producción; no se mantienen láminas paralelas que
  divergen del producto.
- **(+)** El cliente ve **su producto**, no una maqueta; la demo del prospecto es la app de verdad en modo
  demo.
- **(−)** Cada consolidado debe ser **tenant real** para dejar de depender del estático: A Dos Manos y
  Shine requieren alta en Neon (**Gate 2**); publicar cada URL es **Gate 1**.
- **Toca:** `docs/metodologia/demo-publica-costo-cero.md` ("concepto corregido"),
  `docs/PLAN-RECONVERSION-CLIENTES.md`, `public/previews/*`, `TENANT_HOST_MAP` (ADR-029).

## Estado
**Aceptado.** Documentado en el playbook de demo y en el plan de reconversión. Retiro de previews y altas
de A Dos Manos/Shine **pendientes y gated** (publish = Gate 1; Neon = Gate 2). CH ✅ real/vivo; Magra tenant
real pendiente de publicar.
