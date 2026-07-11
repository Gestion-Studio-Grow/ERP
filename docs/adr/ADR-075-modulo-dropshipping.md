---
id: ADR-075
nivel: evolutiva
dominio: [Producto, Plataforma, Fiscal, Multi-tenant]
depends_on: [ADR-002, ADR-054, ADR-055, ADR-064, ADR-074, ADR-024, ADR-022, ADR-057, ADR-030, ADR-066]
---
# ADR-075: Módulo de Dropshipping — conectores a proveedores locales + saga cobro→orden→fulfillment (nacional puro)

**Estado:** Aceptado — **spec / decision-grade** (esta iteración NO implementa código de producción, NO toca
`schema.prisma`, NO agrega migración, NO toca prod, NO llama a ningún proveedor real). Todo efecto externo
(proveedor, tracking, reembolso) entra descrito **detrás de un puerto** para la iteración de construcción.
**Fecha:** 2026-07-11
**Insumo:** [`docs/estrategia/verticales/dropshipping-analisis.md`](../estrategia/verticales/dropshipping-analisis.md)
— análisis de viabilidad decision-grade (SGS Labs, 11/07/2026). Esta ADR **baja el veredicto de ese análisis a
arquitectura**: viable **solo como módulo del ERP**, formato **nacional puro** (proveedor mayorista AR → cliente
AR), validado con **una tienda piloto** (opción c validada por opción b del análisis §6/§7).
**Depende de:** ADR-002 (Core/Blueprint/Plugin — config sobre código, eventos/outbox), ADR-054 (repositorio de
módulos: plugin aislado en `src/modules/` con manifiesto, activable por tenant/rubro), ADR-055 (VARIANTE: el
objeto maestro se crea una vez y se **asigna** con su propio ABM — Supplier ↔ oferta por SKU), ADR-064 (núcleo
transaccional: ledger append-only + calculadoras Decimal + invariantes como gates), ADR-074 (fábrica de tenants
como saga — reusamos el patrón saga/estado/compensación, no lo reinventamos), ADR-024 (plugin Mercado Pago:
pago acreditado → auto-factura), ADR-022 (plugin ARCA: evento `InvoiceCreated` + comando `RegisterFiscalDocument`),
ADR-057 (dinero `number` + `Decimal(14,2)` en el borde fiscal), ADR-030 (DEMO→VENTA→INVERSIÓN), ADR-066
(credenciales/integración del cliente **por tenant**, no por entorno).
**Relacionado:** ADR-001/018 (multi-tenant + RLS — todo scopeado `tenantId`) · ADR-036 (rubro retail nuevo =
**blueprint config**, no fork; conversión segura de tenant) · ADR-025 (ingesta MP paginada + idempotencia por id
— mismo patrón de idempotencia y outbox+worker con rate-limit) · ADR-040 (Gate) · ADR-041 (secretos los pega el
dueño/cliente) · ADR-006 (Tax Engine — el impuesto es del Core).

---

## Contexto

El análisis de viabilidad (archivado como vertical de SGS Labs) cierra con un veredicto claro y con evidencia
regulatoria 2026: hacer dropshipping en Argentina **sin pérdidas y de baja carga** es viable **en un solo
formato — nacional puro** (proveedor mayorista argentino → cliente argentino, cobrando **antes** de comprarle al
proveedor). El **cross-border** es frágil (ARCA anunció el fin de la franquicia courier de USD 400; el cupo de 5
envíos/año por persona impide escalar) y **exportar** es otro negocio. Y la conclusión estratégica es que a GSG
**no le conviene montar un negocio propio de dropshipping** (rinde poco, carga riesgo reputacional y legal), sino
**sumar un módulo de dropshipping al motor de tiendas del ERP** y vendérselo a los clientes que lo quieran:
*vender palas en la fiebre del oro*.

La razón por la que el encaje es tan bueno: **GSG ya tiene ~80% de lo que un dropshipper necesita** —
tiendas Next.js multi-tenant (ADR-001/029), Mercado Pago (ADR-024), factura ARCA nativa (ADR-022), fábrica de
tenants (ADR-074), núcleo transaccional con invariantes (ADR-064) y repositorio de módulos activables por tenant
(ADR-054). **Lo único que falta es la capa de conectores a proveedores locales** y la orquestación cobro→orden→
fulfillment. Este ADR especifica exactamente esa pieza faltante, y **nada más**.

**Talón de Aquiles que la arquitectura debe respetar, no esconder** (análisis §3): por el **art. 34 de la Ley
24.240**, el **vendedor** (el tenant) paga el costo de la devolución y responde por la garantía **aunque el stock
sea de un tercero**. La reputación del vendedor depende de despachos que ejecuta el proveedor. El módulo puede
*mitigar* (sincronizar stock, exigir margen con colchón, permitir multi-proveedor) pero **no elimina** ese riesgo:
por diseño, el riesgo operativo queda del lado del **tenant-usuario del módulo**, no de GSG.

---

## Decisión

El **Módulo de Dropshipping** es un **plugin/módulo aislado** (ADR-054) en `src/modules/dropshipping/`,
**activable por tenant** vía `modules[]` del blueprint, que agrega tres cosas al motor existente: **(1)** un
modelo de datos para proveedores, catálogo sin stock propio y ruteo de órdenes; **(2)** una **capa de conectores**
(`SupplierConnector`) con adaptadores por proveedor; **(3)** una **saga** cobro→factura→orden-al-proveedor→
tracking con compensación por reembolso. Todo lo externo va detrás de **puertos** (patrón hexagonal de ADR-024/074);
esta iteración lo **especifica**, no lo construye.

### 1. Modelo de datos (spec — NO migración; se aplica en la iteración de build, Gate 2)

Cuatro objetos nuevos + una política sobre el `Product` que ya existe. Todos con `tenantId` (ADR-001/018).
Se respeta ADR-055 (**objeto maestro con ABM propio + asignación con ABM propio**), que es justo la lección de
raíz A-1/DX-6/DX-7: nada de "a todos con todo".

- **`Supplier`** (dato maestro, ABM propio) — el proveedor mayorista local. Campos: `id`, `tenantId`, `nombre`,
  `connectorType` (`csv-feed` | `api`), `connectorConfig` (endpoint/feed url / mapeo de columnas — **dato, no
  código**, como los blueprints), `credentialRef` (puntero al secreto **por tenant**, ADR-066 — el connector
  jamás lleva el secreto embebido), `condicionFiscal` (RI / Monotributo → determina si puede emitir **Factura A**
  con crédito fiscal para el vendedor), `slaDespachoHs` (SLA declarado), `estado` (`activo`/`pausado`).

- **`SupplierProduct`** (catálogo del proveedor — **snapshot sincronizado**, no es el `Product` del Core) — lo
  que el feed/API del proveedor expone: `supplierId`, `supplierSku`, `titulo`, `costo` (`Decimal`, moneda ARS),
  `stock` (entero informado por el proveedor), `syncedAt`. Es efímero/reemplazable: la fuente de verdad del stock
  y el costo **es el proveedor**, y este objeto es su fotografía más reciente.

- **`SupplierOffer`** (la **ASIGNACIÓN**, ABM propio — ADR-055) — liga un `Product` del Core (lo que el negocio
  **vende**, con su precio de venta y su marca) con uno o más `SupplierProduct` (de qué proveedor se **surte**):
  `productId` (Core) ↔ `supplierId` + `supplierSku`, con `prioridad` (para multi-proveedor / fallback),
  `costoVigente`, `pisoDePrecio` (calculado, ver DS3), `activa`. **Multi-proveedor por SKU** es de primera clase
  en el modelo (mitigación del riesgo "el proveedor falla" del análisis §4), aunque la **selección automática con
  fallback en caliente** se difiere (ver *qué NO hace*).

- **`Product` (reuso, con política de stock)** — no se crea una entidad nueva de producto: el `Product` del Core
  gana una `stockPolicy = "dropship"`. Con esa política **no hay contador de stock propio**; la disponibilidad la
  dicta el `SupplierProduct` sincronizado a través de la `SupplierOffer`. Esto materializa **DS2** (no se puede
  vender lo que el proveedor no tiene) sin duplicar el concepto de inventario.

- **`DropshipOrder`** (ruteo + estado de fulfillment — la máquina de estados de la saga, §3) — nace cuando una
  `Order` del Core queda **pagada**: `orderId` (Core), `supplierId` elegido, `supplierOrderRef` (id del pedido en
  el proveedor, se completa al rutear), `estado` (máquina de §3), `idempotencyKey` (DS4), `costoReal` (`Decimal`),
  `tracking` (`carrier`, `trackingNumber`, `url`, `estadoEnvio`), timestamps por transición. El **tracking** vive
  acá y se refresca desde `getTracking` del connector.

- **`Rma`** (devolución / garantía — art. 34, §4) — `orderId`, `motivo` (arrepentimiento 10 días | garantía |
  falla proveedor), `estado` (`SOLICITADA → APROBADA → EN_TRANSITO_INVERSA → RECIBIDA → REEMBOLSADA|REPUESTA`),
  `costoLogisticaInversa` (**a cargo del vendedor**, DS5), `notaCreditoRef` (nota de crédito ARCA al reembolsar).

### 2. Capa de conectores — `SupplierConnector` (puerto) + adaptadores (config sobre código)

Un único **puerto** que aísla al motor de cada proveedor (mismo patrón hexagonal que el port de MP de ADR-024).
Contrato mínimo:

```
interface SupplierConnector {
  // Sincronización de catálogo/stock/precio (pull; paginado o feed completo)
  syncCatalog(): AsyncIterable<SupplierProductSnapshot>            // { supplierSku, titulo, costo, stock }
  getStockAndPrice(supplierSku): { stock, costo, moneda }          // consulta puntual al confirmar checkout (DS2)

  // Ruteo de la orden al proveedor — IDEMPOTENTE por idempotencyKey (DS4)
  placeOrder(input: { items[], comprador, envioA, idempotencyKey }): { supplierOrderRef }

  // Seguimiento
  getTracking(supplierOrderRef): { estadoEnvio, carrier, trackingNumber, url }

  // Compensación (saga) — puede no existir en todos los proveedores → degradación explícita
  cancelOrder?(supplierOrderRef): { ok }
}
```

**Adaptadores** (empezar con 1–2, config sobre código — cada `Supplier` declara su connector y su config en
**dato**, ADR-002; sumar un proveedor **no** es un fork):

- **`CsvFeedConnector`** — el más barato y universal: el proveedor publica un **feed CSV/planilla** de catálogo
  (`syncCatalog` lo parsea con el mapeo de columnas de `connectorConfig`). Como muchos mayoristas locales **no
  tienen API**, `placeOrder` en este adaptador puede ser **semi-manual** (genera la orden y deja el ref pendiente
  de que el operador la confirme en el portal del proveedor y pegue el `supplierOrderRef`). Honesto: es más carga
  operativa que el ideal, pero es lo que permite arrancar con proveedores reales sin esperar integraciones.
- **`ApiConnector` por proveedor** — para los que sí exponen API (según el análisis §2.1: Unidrop, Droppers,
  Dropdeal, TornadoStore). `placeOrder`/`getTracking` reales, idempotentes.

La **selección de connector es dato** (`Supplier.connectorType`), resuelta por un pequeño registry — mismo espíritu
que `resolveBlueprint` (ADR-002) y el catálogo de módulos (ADR-054).

### 3. Flujo end-to-end — la saga (reusa el patrón de ADR-074)

```
  cliente compra
      │
      ▼
  Order (Core, PENDING) ──cobro Mercado Pago (ADR-024)──▶ payment.approved
      │                                                        │
      │   (DS1: NADA se le pide al proveedor antes de este punto)
      ▼                                                        ▼
  factura ARCA (ADR-022: InvoiceCreated)          DropshipOrder: PENDING_PAYMENT → PAID
      │                                                        │
      ▼                                                        ▼
  placeOrder(idempotencyKey)  ──ok──▶  ROUTED ──accept──▶ ACCEPTED ──ship──▶ SHIPPED ──▶ DELIVERED
      │
      └── fallo definitivo (sin stock / rechazo del proveedor)
                 │
                 ▼
          FAILED_REFUNDED   (COMPENSACIÓN, DS6: reembolso MP + nota de crédito ARCA + aviso al cliente;
                             el cobro nunca queda huérfano y NUNCA se le pagó al proveedor de más)
```

- El **único disparo hacia el proveedor** ocurre **después** de `payment.approved` (**DS1** — cobro antes de
  compra, *dropshipping puro por diseño*, exactamente lo que el motor ya habilita con MP).
- **La factura ARCA se emite en la venta** (ADR-024: pago acreditado → auto-factura), no cuando despacha el
  proveedor: el vendedor es quien factura al cliente.
- `placeOrder` es **idempotente** (`idempotencyKey` por `DropshipOrder`, **DS4**): si el worker muere entre
  `PAID` y `ROUTED`, reintentar **no** duplica el pedido al proveedor — mismo principio que la idempotencia por
  `payment_id` de ADR-025 y la doble idempotencia de la saga de ADR-074.
- **Compensación** (**DS6**): si el proveedor no puede cumplir tras el cobro, la saga ejecuta reembolso (MP) +
  **nota de crédito ARCA** + notificación al cliente, en orden inverso. El tenant queda sin fulfillment pero
  **sin cobro huérfano ni pérdida** hacia el proveedor.
- Igual que ADR-025, el ruteo y el tracking van por **outbox + worker con rate-limit** para tolerar volumen y
  caídas del proveedor sin bloquear el checkout.

### 4. Devoluciones y garantía — modelar la responsabilidad legal del vendedor (art. 34)

El análisis §3 lo marca como el talón de Aquiles: **el vendedor es el responsable legal aunque el stock sea de un
tercero**. La arquitectura lo hace explícito en vez de esconderlo:

- **Botón de arrepentimiento embebido** (Res. 424/2020 + Disp. 954/2025): el módulo lo trae por default en el
  front del tenant — cumplimiento sin trabajo manual (análisis §4).
- **Flujo RMA** (entidad `Rma`, §1): arrepentimiento (10 días corridos, irrenunciable) / garantía / falla del
  proveedor. El `costoLogisticaInversa` se imputa **al vendedor** (**DS5**), y ese costo lo **financia el colchón
  de devolución** que DS3 exige dentro del margen. Al reembolsar se emite **nota de crédito ARCA** (cierra el
  circuito fiscal).
- **Honestidad del modelo:** el colchón es una *provisión*, no un seguro. Una racha de devoluciones puede exceder
  el colchón de una venta puntual; por eso el análisis (y este ADR) empujan a **nichos de baja devolución** y a
  **describir bien el producto**, no solo a proteger con un número.

### 5. Encaje con lo existente (por qué el esfuerzo marginal es bajo)

- **Multi-tenant + RLS (ADR-001/018):** `Supplier`, `SupplierProduct`, `SupplierOffer`, `DropshipOrder`, `Rma` y
  las credenciales del connector van **scopeados por `tenantId`**; el connector corre con credenciales **del
  tenant** (ADR-066), nunca cross-tenant.
- **Fábrica de tenants (ADR-074) + rubro/blueprint "dropshipping" (ADR-036):** el alta de una tienda dropshipping
  es un **blueprint retail nuevo = config, no fork**; el módulo se activa por `modules[]` (ADR-054). Alta
  instantánea con el motor de dry-run/saga que ya existe.
- **Mercado Pago (ADR-024/025):** cobro antes de ordenar = **dropshipping puro por diseño** (DS1 sale gratis).
- **ARCA (ADR-022/024):** factura por venta + nota de crédito en la devolución — el **diferencial** frente a
  Tiendanube+plugins (análisis §6).
- **Dinero (ADR-057/064):** costos/precios/piso con las **calculadoras Decimal** del núcleo; `Decimal(14,2)` en
  el borde fiscal. El **pricing con piso** (DS3) es una calculadora pura, testeable sin DB (patrón ADR-026/064).
- **Módulo/plugin (ADR-054):** manifiesto declara rubros (`dropshipping`), capabilities, **eventos** (consume
  `PaymentApproved`/`InvoiceCreated`, emite `SupplierOrderRouted`/`FulfillmentUpdated`) y **migraciones aditivas**
  (Gate 2). RLS intacto.

---

## Invariantes del módulo (DS1–DS7 — en la línea de las I1–I7 de ADR-064)

Se numeran **DS** para no colisionar con las I1–I7 del núcleo transaccional (ADR-064), que estas **extienden** en
el dominio dropshipping. Son **gates**: el módulo no se integra si alguna se puede violar.

1. **DS1 — No-pérdida / cobro antes de compra.** NUNCA se emite ni se paga la orden al proveedor antes de que el
   pago del cliente esté **acreditado** (`payment.approved`). El ruteo está *gated* por el estado de pago. (Extiende
   la I de orden de pago del ledger, ADR-064.)
2. **DS2 — No sobreventa.** No se permite vender (ni publicar como disponible) un SKU cuyo proveedor no tiene stock
   confirmado. La fuente de verdad es el proveedor (`stockPolicy=dropship`), sincronizado; al checkout se
   **reconfirma** con `getStockAndPrice` cuando el connector lo soporta.
3. **DS3 — Piso de precio que cubre TODO el stack.** `precioVenta ≥ costoProveedor + IVA-no-recuperable (si
   monotributo) + comisión MP + IIBB + envío + colchón-de-devolución + margen-objetivo`. Un precio por debajo del
   `pisoDePrecio` calculado **no es publicable** (guardarraíl en el pricing, calculadora Decimal pura).
4. **DS4 — Idempotencia del ruteo.** Rutear una orden al proveedor es **idempotente** por `idempotencyKey`
   (`DropshipOrder`): reintentos por caída/timeout **no** generan pedidos duplicados al proveedor.
5. **DS5 — Responsabilidad del vendedor (art. 34).** La devolución/garantía se modelan **del lado del vendedor**
   (tenant): el `costoLogisticaInversa` es suyo y lo financia el colchón de DS3. El proveedor puede ejecutar el
   despacho, pero **no** es el responsable legal frente al consumidor.
6. **DS6 — Sin cobro huérfano / compensación total.** Si el proveedor no cumple tras el cobro, la saga **compensa**
   (reembolso MP + nota de crédito ARCA + aviso), en orden inverso. Nunca queda un cobro sin fulfillment **ni** un
   pago al proveedor sin cobro previo.
7. **DS7 — Aislamiento por tenant.** Catálogos, mapeos SKU, órdenes de fulfillment, RMAs y **credenciales de
   connector** están scopeados por `tenantId` (RLS ADR-018) y el connector usa credenciales **del tenant**
   (ADR-066). El módulo nunca lee ni surte de otro tenant.

---

## Garantías (el contrato del módulo)

1. **Cero pérdida hacia el proveedor:** DS1 + DS6 hacen imposible pagarle al proveedor antes de cobrar y garantizan
   compensación si algo falla después.
2. **Cero sobreventa estructural:** DS2 + `stockPolicy=dropship` + reconfirmación al checkout.
3. **Margen sano por construcción:** DS3 vuelve **no publicable** un precio que no cubra el stack — el error de
   "vender barato y perder en la devolución" se ataja en el pricing, no en la buena voluntad.
4. **Idempotencia y reanudación:** DS4 + saga estilo ADR-074; reintentar es seguro.
5. **Cumplimiento AR nativo:** factura ARCA por venta + nota de crédito en devolución + botón de arrepentimiento
   embebido = *argentinizar SAP* (ADR-044) por default.
6. **Reuso, no fork:** MP, ARCA, fábrica de tenants, núcleo Decimal, RLS y módulos ya existen; el módulo **solo**
   agrega la capa de proveedores (ADR-055: construir encima, no reinstanciar).

---

## Qué NO hace esta iteración (límites duros)

- **No** implementa código de producción, **no** modifica `schema.prisma`, **no** agrega migración (el modelo de
  §1 es **Gate 2**, iteración de build), **no** toca Neon/prod, **no** llama a ningún proveedor real.
- **No** hace **cross-border** ni **exportación** — el análisis los descarta como base (§2.2/§2.3); quedan
  **explícitamente fuera del alcance** hasta que la norma de ARCA se aclare.
- **No** implementa **selección automática de proveedor con fallback en caliente** (multi-proveedor está en el
  *modelo* pero la reasignación automática se difiere).
- **No** trae API reales de todos los proveedores: arranca con **1–2** (CSV-feed primero; API donde exista).
- **No** automatiza recategorización de monotributo ni conciliación fiscal masiva (eso es territorio de ADR-025).

---

## Alcance mínimo del piloto (baja carga, sin pérdidas) — opción (b) del análisis

Banco de pruebas del módulo con **una tienda piloto real** sobre el motor GSG (análisis §7, paso 2), **para
validar el flujo end-to-end, no para facturar**:

1. **1 tenant piloto**, blueprint `dropshipping`, módulo activado (ADR-054/074).
2. **1–2 proveedores** reales dados de alta como `Supplier`, connector **`CsvFeedConnector`** (lo más barato).
3. **20–40 SKUs** de un **nicho de baja devolución** (evitar indumentaria/calzado y frágiles — análisis §4).
4. **Flujo mínimo verificable:** sync stock/precio (programado) → publicar **solo** con stock+margen OK (DS2+DS3)
   → checkout **Mercado Pago** → **factura ARCA** → ruteo al proveedor (MVP: `placeOrder` semi-manual con el
   operador confirmando en el portal del proveedor y pegando el `supplierOrderRef`) → tracking (CSV/manual) →
   **botón de arrepentimiento** + RMA embebidos.
5. **Métrica de validación** (análisis §7, paso 3): margen neto real, tasa de devolución, tiempo de despacho del
   proveedor, horas/semana reales — para contrastar con los supuestos de la §5 del análisis **antes** de ofrecer
   el módulo a clientes.

Todo bajo **DEMO→VENTA→INVERSIÓN** (ADR-030): mientras no haya venta, el piloto va en la URL gratuita, sin datos
reales sensibles; la persistencia real y las credenciales las pega **el dueño** (ADR-041), nunca el agente.

---

## Consecuencias y trade-offs honestos

**A favor:** el módulo convierte una fricción del mercado (cumplir ARCA + Defensa del Consumidor + sincronizar
proveedores es tedioso) en el **valor diferencial de GSG**, reutilizando ~80% de lo construido. El esfuerzo
marginal de desarrollo es acotado y el riesgo operativo se traslada al **tenant-usuario**, no a GSG.

**En contra / deuda anotada:**
- **La reputación del tenant depende de despachos de terceros** — el módulo mitiga (sync de stock, multi-proveedor
  en el modelo, SLA declarado, botón/RMA por default) pero **no elimina** el riesgo del art. 34 (DS5). Es una
  característica del negocio dropshipping, no un bug del módulo.
- **`CsvFeedConnector` es barato pero el stock puede quedar viejo entre syncs** → ventana de sobreventa (DS2). Se
  mitiga con **ventana de sync corta** + **reconfirmación al checkout** (`getStockAndPrice`), no se elimina.
- **Ruteo semi-manual en el MVP** = más carga operativa que el ideal automatizado, hasta que haya proveedores con
  API. Es una elección consciente para arrancar con proveedores reales.
- **`[SUPUESTO]`** — márgenes, comisiones, tasas y break-even provienen del análisis (§5, marcados `[SUPUESTO]`);
  **no** son datos verificados de mercado y se actualizan cada seis meses / por provincia. El `pisoDePrecio` (DS3)
  debe alimentarse con los **valores reales** del tenant al operar (ARCA, panel MP, IIBB provincial).
- **`[SUPUESTO]`** — el ahorro de "5–10 h/semana" con automatización (análisis §5) es la promesa de valor del
  módulo; el piloto es justamente lo que la mide antes de venderla.
- **Riesgo regulatorio (cross-border):** al dejar cross-border **fuera** (por decisión), el módulo **no** queda
  expuesto al anunciado fin de la franquicia USD 400 — pero el roadmap **no** debe comprometer nada cross-border
  hasta que la norma se publique (análisis §7, paso 5).
- **No somos estudio contable/legal:** los textos fiscales/legales citados (art. 34, monotributo, IVA) deben
  validarse con un contador al operar (nota de método del análisis).

---

## Próxima iteración (no en este ADR)

1. **Build del modelo de datos** (§1) como migración aditiva (**Gate 2**) + calculadora `pisoDePrecio` (DS3) pura
   con tests (patrón ADR-026/064), **sin** tocar prod.
2. **Puerto `SupplierConnector` + `CsvFeedConnector`** stubbeado tras interfaz (patrón ADR-024/074), con la saga
   cobro→factura→ruteo→tracking como **reducer puro + máquina de estados** (reuso ADR-074), todo testeable sin DB.
3. **Blueprint `dropshipping`** (rubro retail, config — ADR-036) + activación por `modules[]` (ADR-054) + alta por
   la fábrica de tenants (ADR-074).
4. **Tienda piloto** (opción b) para medir la economía unitaria real y depurar el módulo **antes** de ofrecerlo a
   clientes.

Todo lo anterior pasa por el **Gate de Excelencia** (ADR-040) antes de integrarse a `main`.

— Elaborado por GSG (Arquitecto de Solución)
