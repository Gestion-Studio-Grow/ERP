# ADR-054: Repositorio de plugins / catálogo de módulos — arquitectura

**Estado:** 🟢 **FUNDACIÓN IMPLEMENTADA** (reversible, detrás de flag) — 2026-07-07, Opus (reingeniería, Balde B del plan-ventana confirmado por el dueño). Falta **nutrir el catálogo** y **cablear el backoffice/consola** (trabajo posterior, con su Gate).
**Fecha:** 2026-07-07
**Depende de:** ADR-002 (Core/Blueprint/Plugin), ADR-006 (motores/manifiesto de plugin), ADR-001/018 (multi-tenant/RLS)
**Se complementa con:** **ADR-055 (principio de variante)** — el "cómo" de la activación por tenant
**Relacionado:** ADR-022 (plugin ARCA), ADR-024/025 (plugin Mercado Pago), ADR-036 (blueprints por rubro), ADR-053 (pool de agentes)
**Workstream:** `docs/estrategia/roadmap-gsg.md §6` (Catálogo de módulos / Repositorio de plugins)

---

> **📌 Amendment 2026-07-07 — fundación construida.** El diseño de abajo se materializó como
> `src/modules/` (contrato + registro/catálogo + asignación por variante + flag) más el primer
> módulo real migrado (**ARCA**, `src/plugins/arca/module.ts`). Es **reversible** (código nuevo,
> flag `MODULE_REGISTRY_ENABLED` default OFF, `git revert`), **sin migraciones aplicadas** (usa
> `Tenant.modules[]` existente) y **verde** (tsc + 492 tests + build). Diseño detallado:
> `docs/arquitectura/repositorio-de-modulos.md`. Principio de activación: **ADR-055**. Migración
> opcional `TenantModule` elevada como dry-run: `docs/arquitectura/propuesta-migracion-tenant-module.md`.

## Contexto
Al backoffice **le faltan módulos** para ser vendible como ERP pyme argentino (gap en `roadmap §6.1`). Hoy
los módulos se construyen ad-hoc; hay **dos plugins reales** (`src/plugins/arca`, `src/plugins/mercadopago`)
pero **no un repositorio/catálogo formal** que permita **sumar módulos como plugins reutilizables**,
activables por tenant/rubro. El dueño quiere **nutrir ese repositorio ANTES de vender**. Esta es la
**propuesta de diseño** para que el dueño apruebe; la ejecución es del Arquitecto + células.

## Decisión (propuesta)
Formalizar el **Repositorio de Plugins** como **extensión del patrón ya existente** (ADR-002/006), no como
algo nuevo:

1. **Un plugin = un módulo aislado** en `src/plugins/<modulo>/`, con un **manifiesto** declarativo:
   `id`, **`semver`**, **rubros compatibles**, **capabilities requeridas**, **eventos in/out**, y sus
   **migraciones aditivas** (carpeta propia). El plugin **no accede a datos del Core directo**: se comunica
   por **eventos + outbox** (ADR-002/006) con `tenantId` en todo mensaje.
2. **Activación por tenant/rubro:** el **blueprint del rubro** (config, ADR-002/036) declara el **set de
   plugins por default**; cada tenant **activa/desactiva** por `modules[]` / `feature_flag`. Un plugin
   inactivo no cablea nada.
3. **Multi-tenant/RLS intactos:** cada plugin respeta el aislamiento (predicado `tenantId` / `tenantTransaction`,
   ADR-018) y **pasa el Gate de Excelencia** por sí mismo (ADR-040) antes de entrar al catálogo.
4. **Catálogo / registry:** un **índice de plugins** (doc + registro en código) con **estado de madurez por
   rubro** — el "qué hay disponible para vender", que alimenta el gate de venta (`roadmap §6.3`).
5. **Versionado:** **semver por plugin**; **migraciones siempre aditivas** (nunca destructivas); la
   **aplicación** de migraciones sigue siendo **Gate 2** (OK del dueño). Compatibilidad declarada en el manifiesto.

## Consecuencias
- **(+)** Sumar un módulo pasa a ser **agregar un plugin al catálogo** (aislado, versionado, activable por
  rubro), no un parche ad-hoc → escala y no rompe el Core único (ADR-002).
- **(+)** El **gate de venta** (roadmap §6.3) se vuelve **medible**: "¿el rubro tiene su set mínimo de
  plugins activos?".
- **(−)** Requiere disciplina de **manifiesto + migraciones aditivas + eventos** (nada de acceso directo a
  datos del Core); y un **dueño del catálogo** que lo cure (roadmap §6.4).
- **(−)** No aporta valor si no se **nutre**: el diseño es el molde; el trabajo es **llenar el catálogo** con
  los 🔴/🟠 del gap.

## Estado
**PROPUESTO.** No se construye hasta el OK del dueño. Al aprobarse: el **Arquitecto** integra el andamiaje
del repo (reversible), y las **células (Producto por rubro / cores)** llenan el catálogo módulo por módulo,
cada uno con su Gate; las migraciones de cada plugin quedan **sin aplicar** hasta Gate 2.
