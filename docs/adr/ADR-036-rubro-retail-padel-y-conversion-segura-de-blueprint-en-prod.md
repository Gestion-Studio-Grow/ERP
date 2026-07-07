# ADR-036: Rubro retail `padel`/deportes + conversión segura de blueprint de un tenant en prod

**Estado:** Aceptado (2026-07-06) — implementado (rubro consolidado; reglas aplicadas)
**Fecha:** 2026-07-06
**Depende de:** ADR-002 (blueprints = config), ADR-018 (RLS), ADR-015 (resolución fail-closed)
**Relacionado:** ADR-028 (modelo de entrega), ADR-019 (provisioning)

---

## Contexto
Sumar un **rubro nuevo** (retail deportes/**pádel** para A Dos Manos — comercio de palas+zapatillas, no
reservas de cancha) y, a veces, **convertir el blueprint de un tenant que YA está en prod** (Neon es
producción real). Tocar datos de prod es **riesgoso**: un seed o un borrado global puede pisar o borrar
datos reales de otro tenant.

## Decisión
- **(a) Rubro = CONFIG, no fork:** el rubro `padel`/deportes se agrega como **blueprint retail** en
  `src/blueprints/retail/rubros.ts` (coherente con ADR-002: blueprints son configuración pura, cero schema
  propio). Sumar un rubro es config, no código a medida.
- **(b) Conversión de blueprint de un tenant en prod — reglas de seguridad duras:**
  - **SURFACE-BEFORE-OVERWRITE:** mirar y **reportar** lo que ya hay **antes** de pisar nada.
  - **NUNCA correr seed contra prod** (los seeds son para demo/alta, no para reconvertir datos vivos).
  - **Borrado puntual SIEMPRE scopeado por `tenantId`** (nunca global): ninguna operación de limpieza sin
    el predicado del tenant.

## Consecuencias
- **(+)** Rubros nuevos entran como **config** (rápido, sin fork); las conversiones en prod **no producen
  accidentes cross-tenant** ni pérdida silenciosa.
- **(−)** Requiere **disciplina y verificación manual** antes de convertir (no se automatiza contra prod).
- **Toca:** `src/blueprints/retail/rubros.ts`, `src/blueprints/index.ts`, `order`/`product` actions. Se
  apoya en RLS/aislamiento (ADR-018) y en el fail-closed de resolución de tenant (ADR-015).

## Estado
**Aceptado — implementado.** Rubros `padel` y `carniceria` consolidados como blueprints retail; las
conversiones de tenant en prod se hicieron con estas reglas.
