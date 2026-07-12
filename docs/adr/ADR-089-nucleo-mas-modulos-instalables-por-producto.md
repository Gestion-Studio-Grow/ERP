---
id: ADR-089
nivel: fundacional
dominio: producto
depends_on: [ADR-054, ADR-055, ADR-076]
---

# ADR-089 — Núcleo mínimo + módulos instalables (App Store por tenant) para productos de facturación

**Estado:** Aceptada (dirección de producto del dueño, 2026-07-12) · **Depende de:** ADR-054 (repositorio de plugins / catálogo de módulos), ADR-055 (principio de variante: objeto se crea y se asigna), ADR-076 (un motor, tres productos) · **Relacionado:** ADR-058/059 (perfiles), la identidad por producto (`src/lib/producto.ts`).

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

Al salir a UAT los 3 productos nuevos, el dueño detectó que el backoffice traía **funciones hardcodeadas ajenas al producto** (ej. "Agregar turno" en un Comerciante de facturación). El fix inmediato focalizó la navegación y el Inicio por producto (derivando del set de módulos del tenant). Pero el dueño propuso ir más lejos y elevarlo a modelo de producto:

> "Que los productos nuevos salgan con el núcleo básico para que el comercio opere, y el usuario o implementador le suma plugins según su operación. Agrupar los plugins por procesos o rubros, que se vea qué *scope items* contienen y si hacen fit con su necesidad. Esto sería de comerciantes para arriba; Facturita no lo contemplaría."

Es exactamente el modelo que ADR-054/055 anticiparon (módulos como dato maestro, asignados por tenant, con su ABM) pero que hoy vive **detrás del flag `MODULE_REGISTRY_ENABLED` (OFF)** — por eso todos ven todo. La decisión es **encenderlo y productizarlo** para los productos de facturación.

## Decisión

1. **Núcleo mínimo por producto de facturación** (viene instalado, el comercio opera desde el día uno): **facturación** (arca + bancos + mercadopago) + **clientes** + **reportes básicos**. Nada de agenda/POS/catálogo/stock por defecto.
2. **Todo lo demás = módulo instalable.** La nav, el Inicio y las pantallas se **componen de lo instalado** (`Tenant.modules`), nunca hardcodeado. Si un proceso no está instalado, no existe en la UI.
3. **Catálogo agrupado con *scope items*.** Cada `ModuleDescriptor` (ADR-054) se enriquece con: **grupo** (proceso — ventas, compras, stock, fidelización, atención… — y/o rubro), **scopeItems** (qué pantallas y acciones concretas trae), y un resumen "para qué sirve / a quién le hace fit". La vidriera `/admin/modulos` los muestra por grupo con su scope, para que el implementador o el cliente evalúe el fit y **instale/desinstale**.
4. **Quién instala (default):** el **implementador (GSG)** en el onboarding, con la tienda **self-serve** disponible para que el cliente sume módulos cuando quiera. Reversible: desinstalar oculta el proceso sin borrar datos.
5. **Alcance:** de **Comerciante para arriba** (Comerciante, Pyme, y los clientes del Contador). **Facturita queda EXCLUIDO** — es el commodity simple de una pantalla, sin tienda de módulos.
6. **Verticales (CH, Magra, etc.) intactos:** el modelo se enciende por producto (identidad de producto), no globalmente. El flag/gating no cambia el comportamiento de los verticales.

## Consecuencias

**Habilita:** productos que se sienten propios y crecen por composición (vender el núcleo barato y hacer upsell por módulo/proceso); un onboarding donde el implementador arma el traje a medida sin forks; una vidriera de módulos como superficie de venta (scope visible = fit visible); upgrade natural Facturita→Comerciante→Pyme como activar módulos en el mismo tenant (ADR-076), sin migrar datos.

**Deuda / a construir (fases):**
- Enriquecer los descriptores con grupo + scopeItems (dato, no código nuevo del motor).
- Encender el registro para productos de facturación (gating real por módulo, ya derivado del set del tenant en el layout) sin tocar verticales.
- La tienda `/admin/modulos` real: grupos → módulo con scope → instalar/desinstalar (ABM de asignación, ADR-055).
- Definir el mínimo instalado por producto y el criterio de agrupación (proceso vs rubro) — se baja en el diseño.

**Riesgo:** encender el gating por módulo mal configurado deja a un tenant sin acceso a algo que necesita → mitigado porque el núcleo viene instalado y desinstalar es reversible (no borra datos); y porque se enciende por producto, no global.

— Elaborado por GSG · 2026-07-12
