# ADR-025: Ingesta de Mercado Pago + facturación automática masiva (producto monotributista)

**Estado:** Aceptado — diseño de producto; núcleo con stubs, sin credenciales reales (2026-07-04)
**Amplía:** ADR-024 (MP como plugin que factura un pago). Acá MP deja de ser "facturar un pago suelto" y pasa a ser una **capability-producto**: detectar **todo** lo que le entra a un comerciante por Mercado Pago y facturárselo automáticamente.
**Depende de:** ADR-022 (Plugin ARCA: `InvoiceCreated` → CAE), ADR-024 (toggle, flag, MP hexagonal), ADR-002 (outbox, plugins hexagonales), ADR-006 (Core dueño del impuesto; Feature Flags), ADR-001 (multi-tenant: credenciales MP por comerciante).

---

## 1. Visión de producto

**El dolor:** un monotributista / comercio chico cobra por Mercado Pago **muchas operaciones chicas** y hoy tiene que **facturar cada una a mano** (o no factura y queda en falta). No tiene un ERP grande ni lo quiere.

**El producto:** conectar la cuenta de Mercado Pago del comerciante y que arca **detecte cada pago acreditado y emita la factura AFIP/ARCA sola**. Se vende en dos formas, mismo núcleo:
- **arca standalone** — app de "facturá tus ventas de Mercado Pago automáticamente". El caso testigo de este ADR.
- **plugin del ERP** — el mismo motor dentro de estetica-erp para tenants que cobran por MP.

**Público:** monotributistas y comercios chicos con **alto volumen de operaciones de bajo monto**. La factura típica: **Factura C a Consumidor Final** (Monotributo no discrimina IVA), montos chicos, muchas por día.

> Este ADR es **diseño**. El núcleo se avanza con **stubs/simulador** (feed de pagos MP de un monotributista); adapters reales + credenciales, diferidos.

## 2. Las dos fuentes de pagos (convergen en un solo camino)

La ingesta tiene **dos modos** que terminan en la **misma** operación idempotente "facturar el pago `X`":

| Modo | Qué es | Cuándo | Port |
|---|---|---|---|
| **Backfill / sync histórico** | Traer el historial de pagos acreditados de la cuenta MP, paginado, desde un cursor/fecha | Al conectar la cuenta y como red de seguridad periódica (por si se perdió un webhook) | `listPayments(criterio)` |
| **Webhook / tiempo real** | Notificación de MP de un pago nuevo | Operación normal, baja latencia | `getPayment(id)` (ADR-024) |

**Por qué los dos:** el webhook da baja latencia pero **no es confiable solo** (se pierden, MP reintenta, hay downtime). El backfill garantiza que **ningún pago quede sin facturar**. Como ambos pasan por la misma puerta idempotente, ver un pago por los dos lados **no duplica** la factura.

## 3. Idempotencia y no-duplicación (el corazón del diseño)

A alto volumen, con dos fuentes y reintentos, **duplicar una factura es el peor error** (fiscalmente costoso). Reglas:

1. **Clave natural = `payment_id` de Mercado Pago.** Es único y estable.
2. **Registro de conciliación** (`ReconciliacionPort`): mapea `payment_id → invoice_id | estado`. Antes de facturar un pago se consulta; si ya está facturado (o en curso), **se saltea**.
3. **Marca transaccional:** "reservar el `payment_id`" y "crear la factura" ocurren de forma que un segundo intento del mismo pago no cree una segunda factura (unique constraint sobre `payment_id` en la tabla de conciliación → el segundo insert falla y se descarta).
4. La conciliación es también el **estado del producto**: cuántos pagos entraron, cuántos facturados, cuántos con error → el dashboard del comerciante.

## 4. Volumen: outbox + cola + rate limit

Muchas operaciones chicas ⇒ el pipeline es asíncrono, no en el request:

- Cada "pago a facturar" se **encola** (reusa el **outbox** de ADR-002 / el evento `InvoiceCreated`): la ingesta detecta y encola; un **worker** drena y pide el CAE. Desacopla la detección (rápida) de la autorización (lenta, con límites de ARCA).
- **Rate limit / batching hacia ARCA:** WSFEv1 tiene límites; el worker regula el ritmo y puede usar el modo batch de `FECAESolicitar` (varios comprobantes por request) cuando el volumen lo justifique.
- **Reintentos** con backoff para pagos que fallaron por error transitorio (ARCA caído); los rechazos determinísticos no se reintentan (ADR-024).

## 5. Per-operación vs. agrupado (criterio fiscal)

- **Default: una Factura C por pago acreditado.** Cada pago es una venta; es lo más simple, trazable y conciliable 1:1 con MP.
- **Agrupado (diferido, opcional):** consolidar el día en un comprobante (estilo cierre Z) puede tener sentido para volúmenes muy altos de monto ínfimo. Se deja como **opción de configuración futura**, no default: agrupar rompe la conciliación 1:1 y mete criterio fiscal que conviene validar con un contador antes de ofrecerlo.

## 6. Arquitectura (hexagonal, ADR-002)

```
Fuentes                      Núcleo (plugin MP + Core)                     Salida
─────────                    ─────────────────────────                     ──────
webhook  ─┐                  ingest.ts (algoritmo puro):                   createInvoice
          ├─► MercadoPagoClient.getPayment / listPayments                   (Core, ADR-024)
backfill ─┘        │                                                             │
                   ▼                                                             ▼
            ¿ya facturado? ── ReconciliacionPort ──► marcar(payment→invoice)  outbox → worker
                   │  no                                                       → Plugin ARCA → CAE
                   ▼
            facturarPagoMP(pago) ──► CreateInvoiceInput (fiscal.ts) ──► createInvoice
```

**Ports nuevos/extendidos (todos con stub para el simulador):**
- `MercadoPagoClient.listPayments(criterio) → PaginaPagos` (historial paginado) + `getPayment` (ADR-024).
- `ReconciliacionPort`: `yaFacturado(paymentId)`, `marcarFacturado(paymentId, invoiceId)`, `marcarError(paymentId, motivo)`. Stub en memoria ahora; tabla DB después.
- `facturarPagoMP(pago, tenantId)` — comando del Core que arma la Factura C directa desde un pago MP (sin turno): es el camino **standalone** (una venta MP no es un turno del ERP). Reusa `fiscal.ts`.

**Multi-tenant (ADR-001):** las credenciales de MP (`accessToken`) y el perfil fiscal son **por comerciante/tenant**. La ingesta se scopea por tenant; un worker no mezcla cuentas.

## 7. Simulador (lo que se construye ahora, sin credenciales)

- `StubMercadoPagoClient` gana `listPayments` (paginado sobre pagos en memoria) + un generador `simularFeedMonotributista(n)` que produce **N operaciones chicas** aprobadas (montos y fechas variados) — emula la cuenta de un monotributista con mucho volumen.
- `ReconciliacionEnMemoria` — stub del registro de conciliación (dedup por `payment_id`).
- `sincronizarPagos(deps, criterio)` — algoritmo de ingesta **puro y testeable**: pagina, filtra aprobados + no facturados, factura cada uno, marca. Re-ejecutarlo **no duplica** (idempotencia demostrada en test).

## 8. Alcance

**Ahora:** este ADR (diseño) + port/stub/ingest con stubs + `facturarPagoMP` (Core) + smoke que corre un feed simulado de muchas operaciones probando idempotencia. Cero DB, cero red, cero prod.

**Diferido (`docs/PROXIMOS-PASOS.md` / BACKLOG como producto):** tabla de conciliación (`ProcessedMpPayment`/`Reconciliation`) + su migración; adapter real de MP (OAuth de la cuenta del comerciante + API de pagos + firma de webhook); worker de cola con rate-limit hacia ARCA; modo batch de WSFEv1; dashboard de conciliación (pagos vs facturas); opción "agrupado"; onboarding standalone (conectar cuenta MP). Todo gateado por el flag de facturación y por credenciales reales.

## 9. Decisión final

La capability Mercado Pago de arca es un **producto de facturación automática para monotributistas de alto volumen**: ingesta de **todos** los pagos acreditados de la cuenta MP del comerciante por **dos fuentes convergentes** (backfill histórico + webhook), **idempotentes por `payment_id`** vía un registro de conciliación que también es el estado del producto, **facturación asíncrona por outbox+worker** con rate-limit hacia ARCA, y **una Factura C por operación** por default (agrupado, opcional futuro). Núcleo hexagonal con stubs (simulador de feed de monotributista) ahora; adapters reales, tabla de conciliación y worker de volumen, diferidos. Sirve igual como **arca standalone** y como **plugin del ERP**: mismo motor, misma puerta `facturarPagoMP`.
