# 📐 Addendum — Motor transaccional y calculadoras del ERP (núcleo: plata y stock)

> **Qué es:** el diseño decision-grade del **núcleo transaccional** (la plata y el stock) para el documento
> fundacional que firma el consultor funcional. Ancla en el estado real del repo (ver PARTE A del informe) y
> fija: calculadoras puras, ledger append-only como única fuente de verdad, fronteras transaccionales
> atómicas + ARCA idempotente, e **invariantes verificables como GATES** (cada uno con su test).
>
> **Autor:** Arquitecto de Solución (GSG) · **Fecha:** 2026-07-10 · **Base:** ADR-057 (dinero), ADR-006
> (motores/Tax), ADR-002 (Core/Plugin), ADR-022/024 (ARCA), ledger de stock (F1b/F2), settlement D9.

---

## 0. Principio rector

> **Toda la plata y todo el stock se derivan de MOVIMIENTOS inmutables, calculados por CALCULADORAS puras,
> asentados dentro de una FRONTERA transaccional atómica, y verificados por INVARIANTES que el consultor
> firma.** Nada de plata se calcula "a mano" fuera de la calculadora; ningún saldo se guarda como verdad
> mutable sin su historia; ninguna venta queda a medias.

Cuatro capas, de adentro hacia afuera:
1. **Calculadoras puras** (sin DB) — deciden *cuánto*.
2. **Movimientos (ledger)** — registran *qué pasó*, inmutable.
3. **Proyecciones** — derivan *el saldo* (stock actual, caja, cuenta corriente) de los movimientos.
4. **Fronteras transaccionales** — garantizan *todo-o-nada* por transacción de negocio + idempotencia fiscal.

---

## 1. Calculadoras como funciones PURAS y testeadas

Toda cifra de plata pasa por una función pura, sin DB, unit-testeable, con **Decimal** (o `number` con
redondeo único cerrado en el borde), **configurable por rubro/edición y por régimen fiscal del tenant**.

### 1.1 Pipeline de PRICING (una sola tubería)
`precio → descuento → impuestos → total`, en ese orden, en UNA función central:

```
computeSaleTotals(input: {
  lines: { unitPrice: Decimal, qty: Decimal, taxRate?: AlicuotaId }[],
  discounts: Discount[],            // cupón %/fijo, precio vecino, seña — todos acá
  fiscal: FiscalRegime,             // condición IVA del emisor por tenant
  rounding: RoundingPolicy,         // regla única (hoy round2 EPSILON-safe)
}): {
  subtotal: Decimal, discountTotal: Decimal, neto: Decimal,
  ivaBreakdown: SubtotalIva[], total: Decimal
}
```

- **Una sola fuente:** hoy el cálculo está **partido** (order-core arma subtotal de POS; los cupones/seña
  del turno viven en otro lado; `fiscal.calcularImpuestos` es el IVA). El addendum los **unifica** en
  `computeSaleTotals`, que orquesta sub-funciones puras: `applyDiscounts` → `calcularImpuestos` →
  `roundTotals`. POS y turno llaman a la MISMA tubería.
- **Régimen fiscal configurable por tenant** (extiende `fiscal.getFiscalProfile`, hoy hardcodeado
  provisional): Monotributo/Exento → Factura C (sin IVA discriminado); Responsable Inscripto → A/B (IVA 21%
  incluido). El régimen es **dato del tenant**, no una rama de código por cliente.
- **Redondeo único** (ya cerrado, ADR-057 R4): `round2` EPSILON-safe, la MISMA regla en POS y fiscal.

### 1.2 Valuación de STOCK (costo/método)
```
valuateInventory(products, movements, method: "ULTIMO_COSTO" | "PPP"): {
  rows: { productId, stock: Decimal, unitCost: Decimal, value: Decimal }[],
  totalValue: Decimal
}
```
- **Método configurable** por edición/rubro: `ULTIMO_COSTO` (último costo de compra, lo que hace hoy el
  inventario light) o `PPP` (precio promedio ponderado, derivable del ledger de entradas). El costo **sale
  del ledger** (`StockMovement.unitCost` de las entradas), no de un campo suelto.

### 1.3 Caja / ARQUEO
Ya existe puro (`cash-register.ts`): `summarizeMovements` + `expectedCash(openingFloat, movements)`.
El addendum lo mantiene y lo formaliza como calculadora del núcleo: **esperado = openingFloat + Σ(signo×monto)**;
`diff = contado − esperado`. El **signo lo pone el TIPO** en un solo lugar (`movementSign`).

### 1.4 MÁRGENES
`computeMargins(products, costByProduct)` (ya existe puro en `reports/margin.ts`): margen = precio − costo,
margen% = margen/precio. Se reusa; la única regla nueva es que el **costo venga del ledger** (1.2), no de un
snapshot suelto.

**Regla dura de todas las calculadoras:** **Decimal siempre** en la firma pública del núcleo. El borde de
persistencia convierte Decimal↔columna una sola vez (patrón ADR-057, ya vigente en Invoice/Collection).

---

## 2. Ledger append-only como ÚNICA fuente de verdad (plata y stock)

### 2.1 El patrón
Cada hecho económico es un **movimiento inmutable** (nunca se edita ni se borra; se corrige con un
movimiento inverso). Los **saldos son PROYECCIONES** de esos movimientos, no verdades mutables:

| Saldo | Se proyecta de | Estado hoy |
|---|---|---|
| **Stock actual** de un producto | `StockMovement` (VENTA/COMPRA/AJUSTE/CONSUMO/DEVOLUCION_PROVEEDOR) | ✅ ledger YA existe; `Product.stock` es proyección cacheada |
| **Caja** del turno | `CashMovement` (VENTA/INGRESO/EGRESO/RETIRO) + `openingFloat` | ✅ ledger YA existe; cierre congelado |
| **Cuenta corriente** (fiado / a pagar) | `Collection` (D9) contra `AccountReceivable`/`AccountPayable` | ✅ ledger de cobros YA existe (settlement) |
| **Ingresos / ventas** (plata cobrada) | *(hoy: `Payment` por turno + `Order.paid` booleano + `CashMovement`)* | 🟠 **NO unificado** — ver 2.3 |

### 2.2 Convive con los campos actuales SIN romper (patrón de migración)
El ledger de stock y de caja YA es la fuente de verdad; `Product.stock`, `CashSession.closing*` son
proyecciones/snapshots. **No hay que reescribir**: el patrón es **"ledger primero, campo como caché"**:
- **Escritura:** todo cambio de stock/plata escribe el movimiento **y** actualiza la proyección **en la
  misma transacción** (ya lo hace `recordMovement`: `updateMany` del stock + `create` del `StockMovement`).
- **Lectura:** la proyección cacheada se usa para performance; el ledger permite **reconstruir/auditar** el
  saldo (`balanceAfter` congela el resultado por movimiento).
- **Migración aditiva:** para el hueco de "ingresos" (2.3), se agrega un `CashLedger`/tipo de movimiento
  unificado **sin tocar** `Payment`/`Order` (mismo criterio que D9 `Collection`: entidad nueva, no mutar la
  vieja). Los saldos históricos se backfillean proyectando desde `Payment`+`Order`+`CashMovement` una sola vez.

### 2.3 El hueco a cerrar: NO hay un ledger unificado de "plata cobrada"
Hoy la plata cobrada vive **repartida**: `Payment` (por turno, 1:1), `Order.paid` (booleano de mostrador),
`CashMovement` (solo efectivo en caja), `Collection` (settlement de deuda). **No hay un libro único de
ingresos** que responda "cuánto cobré, por qué medio, contra qué venta" de forma reconstruible. El addendum
propone que `Collection` (D9) se generalice al **ledger de cobranza de TODA venta** (Order/Appointment/AR),
no solo de deuda — un movimiento por cobro, el saldo cobrado se proyecta. (Es extensión de lo ya construido.)

---

## 3. Fronteras transaccionales

### 3.1 Una venta = una transacción de negocio ATÓMICA
Hoy `insertOrder` es atómico para **orden + descuento de stock** (`tenantTransaction`, `recordMovement`
dentro de la MISMA tx → o se vende y se descuenta el stock, o nada). ✅ Correcto.

**El gap:** el **movimiento de caja** se asienta en una **transacción SEPARADA** (`recordCashSaleMovement`),
por decisión de negocio ("una venta cobrada no se revierte por un fallo de caja"). Es idempotente por
`orderId` (no duplica), pero **la venta y su imputación a caja no son atómicas** → puede quedar una venta
cobrada sin movimiento de caja (arqueo con "sobrante"/faltante) si la 2ª tx falla.

**Diseño:** definir la **frontera de la transacción de negocio "venta al contado"** que abarque, en UNA tx:
(a) orden + líneas, (b) descuento de stock (ledger), (c) **cobro (ledger de cobranza)**, (d) **movimiento de
caja si es efectivo**. Todo-o-nada. La facturación ARCA queda FUERA de esa tx (asíncrona, ver 3.2) porque
depende de un tercero (no se puede atomizar una llamada externa). Para el caso "no hay caja abierta", la
regla de negocio se hace explícita (rechazar la venta en efectivo, o registrar un movimiento pendiente de
imputar), no un silencioso "recorded:false".

### 3.2 Enganche ARCA idempotente (sin duplicar comprobante)
- **Outbox transaccional (ya existe):** `createInvoice` crea la factura PENDING **y** encola `InvoiceCreated`
  en la MISMA tx (`invoice-core.ts`). Un worker lo despacha; `registerFiscalDocument` solo autoriza facturas
  **en PENDING** → una re-entrega del evento es no-op (idempotente en el CAE). ✅
- **El gap:** `createInvoice` **NO es idempotente por VENTA** — dos disparos del "emitir factura" para la
  misma orden crearían DOS facturas PENDING → dos CAE = **comprobante duplicado**. **Diseño:** clave de
  idempotencia por venta usando el enlace `Invoice → origen` (D10, FK a Order/Appointment ya existe):
  `createInvoice` upsertea por `(tenantId, originType, originId)` → **una factura por venta**, reintento =
  no-op. Con eso, la cadena venta→comprobante es idempotente de punta a punta.

---

## 4. Invariantes verificables como GATES (cada uno con su test)

Los firma el consultor funcional. Cada uno es un **test automatizado** (property/integration) que corre en
el Gate (ADR-040); si falla, no se integra.

| # | Invariante | Verificación (test) | Hoy |
|---|---|---|---|
| **I1** | **Σ movimientos = saldo proyectado** (stock y caja): reconstruir el saldo desde el ledger da el mismo valor que la proyección cacheada. | property-test: para N movimientos random, `project(ledger) === cached`. Stock: reusa `balanceAfter`. Caja: `expectedCash`. | 🟢 parcial (ledger existe; falta el test de reconciliación explícito) |
| **I2** | **No hay comprobante sin su venta, ni venta facturable sin comprobante** (1:1 por `Invoice.originId`). | integration: toda `Invoice` AUTHORIZED tiene `originId` resoluble; toda venta con `facturar=sí` tiene ≤1 Invoice. | 🔴 falta (createInvoice no dedupe por venta) |
| **I3** | **El stock nunca queda negativo sin autorización** (`allowNegative` explícito). | ya cubierto por la guarda atómica `stock >= qty` (`canDecrementStock` + `updateMany` WHERE) + test. | 🟢 existe (order-core + ledger) |
| **I4** | **Todo cálculo de plata pasa por la calculadora central** (no hay aritmética de plata suelta). | test de arquitectura: grep/lint que prohíbe `*`/`+` sobre montos fuera de `src/lib/calc/*`; + los unit-tests de las calculadoras. | 🟠 parcial (calc puras testeadas, pero repartidas: order-core / fiscal / margin) |
| **I5** | **Cobro parcial nunca sobre-cobra** (Σ cobros ≤ deuda) y **el saldo cierra al centavo**. | ya existe: `computeSettlement`/`validateNewCollection` + test de concurrencia (Serializable). | 🟢 existe (D9) |
| **I6** | **Redondeo único**: toda cifra fiscal/POS usa `round2` EPSILON-safe. | unit-tests de `round2` + de las calculadoras; regla en `src/lib/round.ts`. | 🟢 existe (ADR-057) |
| **I7** | **Una venta al contado es atómica** (orden+stock+cobro+caja todo-o-nada). | integration: inyectar fallo en cada paso → no queda estado parcial. | 🔴 falta (caja en tx separada) |

**Gate del consultor:** los 7 en verde = el núcleo transaccional "cumple". Hoy: **I3/I5/I6 verdes; I1/I4
parciales; I2/I7 en rojo** — ese es el trabajo de construcción priorizado.

---

## 5. Sustentabilidad

- **Testabilidad:** las calculadoras son **puras** (sin DB/tenant/red) → 100% unit-testeables; las
  operaciones se testean por invariante (I1–I7). El repo ya tiene el harness (`node:test`) y **~15 suites**
  de esta área (round, order-core, ledger, cash-register, collection+concurrencia, libro-iva, margin,
  valuación, aging, cheque, purchase-core, invoice-idempotency).
- **Extensibilidad por rubro SIN reescribir:** el rubro/edición entra como **config** (régimen fiscal,
  método de valuación, set de módulos por `defaultModulesForBlueprint`) — no como ramas `if rubro`. Sumar un
  rubro = un descriptor + su config, la tubería no cambia (principio de VARIANTE, ADR-055).
- **Trazabilidad:** todo saldo es **reconstruible** desde su ledger (I1); cada factura enlaza a su venta
  (I2/D10); cada movimiento lleva actor + origen (`createdBy`, `orderId`/`purchaseId`/`appointmentId`) para
  el audit trail.
- **Reversibilidad:** todo lo nuevo es **aditivo** (ledger unificado + idempotencia por venta = entidades/
  índices nuevos, no mutación de los campos vivos), detrás de flag donde toque UI.

---

## 6. Resumen para la firma del consultor

El ERP **ya tiene los cimientos correctos** del núcleo transaccional: calculadoras puras (pricing POS,
IVA, arqueo, márgenes), ledger append-only de **stock** y **caja**, settlement con cobro parcial guardado
por concurrencia, y venta atómica orden+stock con outbox fiscal. **Faltan tres cierres** para "cumplir"
transaccionalmente de punta a punta: **(a)** unificar la tubería de pricing en una calculadora central
(I4); **(b)** idempotencia de la factura **por venta** para no duplicar comprobante (I2); **(c)** frontera
atómica de la "venta al contado" que incluya caja (I7) — y un ledger unificado de ingresos que hoy está
repartido (2.3). Con esos tres, los 7 invariantes cierran en verde y el consultor puede firmar.

— Elaborado por GSG (Arquitecto de Solución) · addendum del documento fundacional · anclado en el repo real.
