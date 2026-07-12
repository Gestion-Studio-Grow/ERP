# Backoffice carnicería — spec de adaptación (MAGRA)

**Alcance:** qué se adaptó del `/admin` para operar una carnicería boutique **sin tocar el schema**, y qué
requiere **schema nuevo** (Gate 2, migración preparada **sin aplicar**). Contexto competitivo en
`analisis-brecha-bistrosoft.md`; veredicto en `veredicto-reemplazo.md`.

---

## Parte A — Adaptado SIN migración (ya construido en este sprint)

El modelo ya soportaba venta por peso (`Product.saleUnit=WEIGHT` + `pricePerKg` + `trackStock`, extensión
retail de ADR-002) y la server action `createProduct/updateProduct` ya parseaba esos campos
(`parseRetailFields`). **Lo que faltaba era la UI del backoffice para operarlos** y que el panel dejara de
sentirse de spa. Cambios:

1. **`/admin/catalogo` consciente del rubro** (`src/lib/carniceria/rubro.ts`): si el tenant es retail/
   carnicería, el catálogo muestra la **sección de Cortes** en vez de las secciones de spa (boxes,
   profesionales, servicios, asignación) que para un mostrador van vacías y ensucian. El path de
   servicios (CH Estética) queda **byte-idéntico**.
2. **Sección de Cortes** (`CortesSection.tsx`): góndolas por categoría (Vaca · Cerdo · Pollo · Achuras ·
   Preparados · Gourmet), y por corte: **forma de venta** (por kilo/por unidad), **precio por kilo**,
   **stock** en kg, y **margen** sobre el último costo de compra con semáforo (rojo <20% · ámbar 20–35% ·
   verde ≥35%). Alta/edición exponen el selector kg/unidad y el precio correspondiente.
3. **Clasificador de cortes puro** (`src/lib/carniceria/cortes.ts` + tests): deriva la góndola del nombre
   (mientras no exista `Product.category`, ver Parte B §1) y calcula el margen. 10 tests.

**Estado:** tsc + 980 tests verdes. Renderizado y verificado con `npm run demo` (PGlite, tenant `magra`
carnicería). Screenshots en `docs/preventa/magra/` (catálogo de cortes, compras con proveedores reales).

**Qué YA existía y opera para carnicería (no requirió tocar nada):** `/admin/caja` (arqueo), `/admin/pedidos`
(canal + delivery), `/admin/compras` (compra a proveedor + costo → suma stock), `/admin/cuentas-a-cobrar`
(fiado), `/admin/cuentas-a-pagar` (cheque diferido), `/admin/devoluciones-proveedor`, `/admin/libros`
(libro IVA), `/admin/inventario` (valuación a último costo — **hoy gateada por el flag `PROFILES_ENABLED`**;
encenderla es reversible, no requiere schema).

---

## Parte B — Requiere schema (Gate 2 · migración preparada `prisma/pending-gate2/CarniceriaRubro.sql`)

> **✅ Construido (2026-07-12, 2ª iteración):** todo lo de esta parte ya está **implementado en el código**
> (pantallas `/admin/lotes`, `/admin/despiece`, `/admin/inventario` por góndola, `category`/`cost` en el
> catálogo), con acceso por **SQL crudo tolerante a schema** (`src/lib/carniceria/*` + `hasCarniceriaSchema()`):
> **sin la migración aplicada, las pantallas muestran "En preparación" y prod NO rompe**; al aplicarla se
> encienden solas. La migración incluye las **policies RLS** de las 3 tablas. Lógica pura testeada
> (`cortes`/`lotes`/`despiece`.test.ts). Renderizado y verificado en base local efímera (screenshots en
> `docs/preventa/magra/`). **Falta solo aplicar la migración** (Gate 2, OK del dueño).

Todo lo de acá está **especificado, IMPLEMENTADO y con la migración escrita, NO aplicada**. Aplicar =
`prisma migrate deploy` sobre Neon = **irreversible = OK del dueño** (ADR-018). Es **aditiva** (2 columnas
nullable en `Product` + 3 tablas + 2 enums; no toca nada vivo).

### §1 · `Product.category` (góndola explícita)
- **Hoy:** la góndola se **deriva del nombre** (`classifyCorte`) — funciona (ver screenshots) pero es una
  heurística; el dueño no puede recategorizar un corte que el clasificador ubicó mal.
- **Con schema:** columna `category TEXT` nullable. El clasificador pasa a ser **sugerencia/fallback**; la
  categoría explícita gana. `String` (no enum) para no cerrar la taxonomía (otros rubros retail traen otras
  góndolas).
- **Costo/beneficio:** bajo esfuerzo, alto orden. **Recomendado como primer paso** post-venta.

### §2 · `Product.cost` (costo de referencia por corte)
- **Hoy:** el margen usa el **último `StockPurchaseItem.unitCost`**; si no hubo compra cargada, sale "sin
  costo".
- **Con schema:** columna `cost DOUBLE PRECISION` nullable como costo de referencia editable. El margen
  usa `cost` si está, si no cae al último costo de compra (mismo criterio actual). Da margen desde el día 1
  sin exigir cargar compras.

### §3 · Lotes / envasado al vacío — `ProductBatch` + enum `BatchStatus`
Resuelve **tres cosas que Bistrosoft no tiene** y una carnicería boutique necesita:
- **Trazabilidad del vacío:** lote (`code`), **fecha de envasado** (`packedAt`), **vencimiento**
  (`expiresAt`), proveedor (`supplierId`), costo del lote (`unitCost`).
- **Peso variable por paquete:** `netWeightKg` (peso real del lote) + `packages` (cuántos paquetes al
  vacío) — un vacío nunca pesa exacto; el lote guarda el peso real.
- **Cadena de frío / FEFO:** índice por `(tenantId, expiresAt)` para vender/alertar por *primero el que
  vence antes*, y `status` (AVAILABLE/DEPLETED/EXPIRED/WITHDRAWN) para retirar lotes vencidos.
- **App-layer (post-migración):** pantalla `/admin/lotes`, alta de lote al recibir/envasar, alerta de
  vencimientos en el dashboard, y (opcional) referencia del lote en la línea de venta.

### §4 · Despiece / rendimiento — `ProcessingRun` + `ProcessingOutput` + enum `ProcessingStatus`
El corazón de la rentabilidad cárnica: **entra una media res** (peso + costo), **salen cortes** con su
peso; el sistema calcula:
- **Rendimiento por corte** = `output.weightKg / run.inputWeightKg`.
- **Merma** = `inputWeightKg − Σ outputs.weightKg` (grasa/hueso/pérdida) — *donde se pierde plata*.
- **Costo real por corte** = prorrateo del `inputCost` por rendimiento → alimenta `Product.cost` (§2) y el
  margen real, en vez de un costo inventado.
- Cada output puede **generar su lote** (`ProductBatch`) y sumar stock del corte.
- **App-layer (post-migración):** pantalla `/admin/despiece` (cargar media res → cortes → ver rendimiento/
  merma), integrada al ledger de stock (`recordMovement`).

### §6 · RLS (obligatorio al aplicar)
`ProductBatch`, `ProcessingRun`, `ProcessingOutput` son **de-tenant** → al aplicar la migración hay que
sumar sus **políticas RLS** en `prisma/rls/` (fuera de `migrations/`, a propósito) y actualizar el conteo
de cobertura de `gate:rls`. Sin RLS, esas tablas quedarían fuera del aislamiento multi-tenant.

---

## Orden recomendado (post-venta)

1. **Encender `/admin/inventario`** (flag, reversible, sin schema) — valuación + stock bajo ya funcionan.
2. **§1 `category` + §2 `cost`** (migración chica, alto orden) — categoría editable + margen desde el día 1.
3. **§3 Lotes/vacío** — trazabilidad + vencimientos (diferencial vs Bistrosoft).
4. **§4 Despiece/rendimiento** — rentabilidad real por media res (diferencial vs Bistrosoft).
5. En paralelo (no cárnico): **ARCA real** (cert + homologación, Gate 4) y **multi-canal de precios**
   (brecha vs Bistrosoft, §5 del análisis).

> **Nada de la Parte B se aplica sin OK del dueño.** La migración vive en `prisma/pending-gate2/` y
> `prisma migrate deploy` no la mira hasta moverla a `prisma/migrations/`.

— Elaborado por GSG
