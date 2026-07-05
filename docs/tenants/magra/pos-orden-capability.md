# Capability POS/Orden + venta por kg — lo implementado (ciclo 2026-07-04)

**Tipo:** registro de implementación · **Rol:** Fullstack + Arquitecto
**Ancla:** ADR-003 ("Orden/Venta" universal + Fase 2 POS), ADR-002 (mec. A extensión
sobre `Product`), FUNDAMENTOS §2 (magra = tenant, no fork), `blueprint-carniceria-brief.md`.

## Qué se hizo y por qué acá

El MVP de magra pedía **checkout / toma de pedidos** (era lo que faltaba del scaffold
previo). En vez de migrar el scaffold Next standalone (fork prohibido), se construyó
la pieza equivalente **como Capability del Core**, RLS-ready y reutilizable por
cualquier vertical retail — la carnicería es su primer consumidor.

> **Por qué es Core y no del blueprint carnicería:** un `Order`/`OrderItem` genérico
> lo reusa cualquier retail futuro (kiosco, autoservicio). El blueprint carnicería
> sólo *activa* esta capability y siembra cortes con precio/kg (decisión 2 del brief).

## Alcance entregado

- **Schema (migración `20260704180000_add_pos_orders`, SIN aplicar — Gate 2):**
  - Extensión retail sobre `Product` (mec. A ADR-002, **sin tabla nueva**):
    `saleUnit` (`UNIT`|`WEIGHT`), `price`, `pricePerKg`. Todo aditivo/nullable →
    el tenant spa vivo no se entera (sigue con `saleUnit=UNIT`, sin precio).
  - Modelos `Order` + `OrderItem` (Core): estados, canal (mostrador/online),
    fulfillment (retiro/envío), snapshot de cliente, totales, pago simple, líneas
    con snapshot de precio/nombre. `tenantId` en cada tabla + índices → RLS-ready.
  - Enums: `ProductSaleUnit`, `OrderStatus`, `OrderChannel`, `FulfillmentType`.
- **Capabilities (`src/lib/capabilities.ts`):** `orders:read` / `orders:manage`.
  OWNER (todo) y RECEPTION (trabajo de mostrador, como agenda/espera). Catálogo/
  precios sigue solo-OWNER.
- **Server actions (`src/lib/order-actions.ts`):** `getPosData` (loader), `createOrder`
  (el checkout — venta de mostrador `CONFIRMED` o pedido online `PENDING`; calcula
  línea por kg/unidad, snapshotea precio, correlativo por tenant), `advanceOrderStatus`,
  `setOrderPaid`, `cancelOrder`. Cada write escribe `tenantId` (fail-closed ADR-015)
  y audita (`auditAdmin`).
- **ABM de productos (`src/lib/catalog-actions.ts`):** `createProduct`/`updateProduct`
  aceptan los campos retail *sólo si el form los envía* (no pisan precios al editar
  desde el form del spa).
- **UI backoffice (`src/app/admin/(dashboard)/pedidos/`):** POS con armado de líneas
  y total en vivo (venta por kg), toma de pedido con retiro/envío, y bandeja de
  pedidos con avance de estado / cobro / cancelación. Ítem "Pedidos" en el nav.

## Decisiones y supuestos (modo autónomo)

1. **Venta por kg = columnas típadas nullable** sobre `Product`, no JSONB. Más
   simple y type-safe que un validador JSONB; el brief lo preveía como JSONB, pero
   simple-y-correcto-hoy (FUNDAMENTOS §6) gana. Si aparecen atributos ralos de
   corte (lote, media res, trazabilidad) se reevalúa hacia JSONB o capability propia.
2. **Pago simple en `Order`** (`paymentMethod` + `paid`), no el modelo `Payment`
   (hoy atado a `Appointment` por `appointmentId @unique`). Un ledger de Pago
   unificado es trabajo futuro; forzarlo ahora tocaba el flujo vivo del spa.
3. **La factura fiscal NO vive acá:** la resuelve el Plugin `arca` vía outbox
   (ADR-022). `Order` sólo modela la venta.
4. **Correlativo `code` = max+1 por tenant** con `@@unique([tenantId, code])`.
   Suficiente para el volumen MVP; secuencia por tenant si el volumen lo pide.
5. **`scheduledFor`** (horario de retiro/entrega) se interpreta en hora local del
   server — provisional; unificar con la TZ del tenant (AMD-004) cuando la vidriera
   pública lo consuma.

## Verificación (costo 0, sin tocar Neon)

- `prisma validate` ✅ · `prisma generate` ✅ · `tsc --noEmit`: **0 errores en los
  archivos de esta capability**. La migración **no se aplicó** (Gate 2 requiere OK).
- **No se levantó dev server contra Neon**: la migración está sin aplicar (las tablas
  no existen en prod) y no se escriben datos de prueba a la DB de producción.

## Lo que falta para que corra como demo del tenant real (orden forzado)

1. **Gate #0 — RLS + resolución de tenant por request** (ADR-018). *En construcción
   en paralelo por otra línea de trabajo (`src/lib/rls.ts`, `tenant-context.ts`,
   `prisma/rls/` aparecieron en el working tree este ciclo).*
2. **Provisioning** (`scripts/provision-tenant.ts`, ADR-019) — el script ya existe;
   parametrizar `--blueprint=carniceria` y sembrar cortes con precio/kg.
3. **Blueprint carnicería en código** (`src/blueprints/carniceria/`) — activa esta
   capability + seed de catálogo.
4. **Aplicar** `migrate deploy` de esta migración (Gate 2, con OK).
5. **Vidriera pública por tenant + theming** — la misma `createOrder` la consume.

Recién con (1)–(4) hay tenant magra vivo; hasta entonces, demo con el prototipo
standalone (costo 0), como fija `PROXIMOS-PASOS.md`.
