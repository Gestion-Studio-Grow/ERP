# API pública de ingesta de pedidos (backoffice-only)

**Superficie II de ADR-020** — el borde externo del Core. Es la unidad de venta
**"backoffice-only"**: un cliente que **ya tiene su web** (hecha por su estudio)
la conserva, y su front externo alimenta **nuestro** backoffice (toma de pedidos,
POS, stock, facturación). El estudio no reemplaza su sitio: le agrega una llamada
HTTP a la nuestra cuando entra un pedido.

Qué hace un pedido que entra por acá:

1. **Cae en la bandeja** `/admin/pedidos` como pedido *online* en estado
   `PENDING` (el mostrador lo confirma y prepara).
2. **Descuenta stock** de los productos vendidos (best-effort).
3. **Factura** vía el plugin ARCA / Mercado Pago **si la facturación está
   habilitada** (`ARCA_INVOICING_ENABLED=true`). Por default está OFF y el paso
   se saltea sin romper nada.

---

## Autenticación

Dos datos, ambos por header (el slug también se acepta en el body):

| Header | Valor |
|---|---|
| `Authorization` | `Bearer <api-key>` |
| `X-Tenant-Slug` | el slug del tenant (ej. `magra`) |
| `Content-Type` | `application/json` |

La api-key se configura por env en el server (no vive en la base — así el
contrato no depende de una migración):

```bash
# Una sola clave (caso single-tenant de hoy):
EXTERNAL_ORDERS_API_KEY="una-clave-larga-y-secreta"

# …o un mapa por slug (multi-tenant, cuando exista):
EXTERNAL_ORDERS_API_KEYS='{"magra":"clave-de-magra","otro":"clave-de-otro"}'
```

Sin env configurada → `503 api_not_configured` (cerrado por default). El tenant
se resuelve con el guard fail-closed del Core (ADR-015): el slug declarado debe
**coincidir** con el tenant habilitado, si no → `403 tenant_mismatch`.

---

## Crear un pedido

`POST /api/public/v1/orders`

```json
{
  "tenant": "magra",
  "customer": {
    "name": "Vecina de La Alameda",
    "phone": "1130000000",
    "address": "Av. Siempreviva 742",
    "email": "cliente@example.com"
  },
  "fulfillment": "DELIVERY",
  "items": [
    { "productId": "clx123abc", "quantity": 2 },
    { "sku": "Bondiola al vacío", "quantity": 0.75 }
  ],
  "payment": { "paid": true, "method": "MERCADOPAGO" },
  "notes": "Timbre 3B",
  "scheduledFor": "2026-07-06T18:00:00-03:00",
  "externalRef": "woo-10432",
  "invoice": true
}
```

### Campos

| Campo | Req. | Notas |
|---|---|---|
| `customer.name`, `customer.phone` | sí | Contacto del comprador. |
| `customer.address` | si `DELIVERY` | Obligatorio para envío a domicilio. |
| `items[]` | sí (≥1) | Cada item con `quantity > 0` y **una** referencia de producto. |
| `items[].productId` | — | Id interno del producto (si el estudio mapeó el catálogo). |
| `items[].sku` / `items[].name` | — | Alternativa: se matchea por **nombre exacto** del producto (case-insensitive). *Provisional: no hay columna SKU todavía.* |
| `fulfillment` | — | `PICKUP` (default) o `DELIVERY`. |
| `payment.paid` | — | `true` si el sitio externo ya cobró. Default `false`. |
| `payment.method` | — | `MERCADOPAGO` / `EFECTIVO` / `TRANSFERENCIA`. |
| `scheduledFor` | — | ISO 8601. Horario de retiro/entrega deseado. |
| `externalRef` | — | Nº del pedido en el sistema externo (queda trazado en las notas). |
| `invoice` | — | `false` para no facturar. Default `true` (el flag maestro igual manda). |

Los precios **no** se toman del body: el Core congela el precio vigente del
producto en el tenant al momento de la venta (snapshot, ADR-009 §4). El body solo
dice *qué* y *cuánto*.

### Respuesta `201`

```json
{
  "ok": true,
  "order": {
    "id": "clzorder1",
    "code": 42,
    "status": "PENDING",
    "total": 18450,
    "currency": "ARS",
    "invoiced": false
  }
}
```

`code` es el nº legible del pedido (el que ve el mostrador). Guardalo para
consultar el estado.

### Errores

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_json` / `invalid_body` / `invalid_customer` / `invalid_items` / `invalid_item_qty` / `invalid_item_ref` / `invalid_order` | Body mal formado o incompleto. |
| 401 | `missing_api_key` / `invalid_api_key` | Falta o es inválida la api-key. |
| 403 | `tenant_mismatch` | El slug no coincide con el tenant habilitado. |
| 422 | `unknown_items` | Algún producto no se pudo mapear en el tenant (se rechaza el pedido entero, no a medias). |
| 503 | `api_not_configured` | No hay api-key configurada en el server. |

---

## Consultar estado

`GET /api/public/v1/orders/{code}` — misma auth (header `Authorization` +
`X-Tenant-Slug`).

```json
{
  "ok": true,
  "order": {
    "code": 42,
    "status": "PREPARING",
    "paid": true,
    "total": 18450,
    "currency": "ARS",
    "fulfillment": "DELIVERY",
    "createdAt": "2026-07-05T21:03:00.000Z",
    "items": [{ "name": "Bondiola al vacío", "quantity": 0.75, "unitPrice": 8900, "lineTotal": 6675 }]
  }
}
```

Estados del pedido: `PENDING → CONFIRMED → PREPARING → READY → DELIVERED` (o
`CANCELLED`). El mostrador los empuja desde `/admin/pedidos`.

---

## Ejemplo rápido (curl)

```bash
curl -sS -X POST "$BASE_URL/api/public/v1/orders" \
  -H "Authorization: Bearer $EXTERNAL_ORDERS_API_KEY" \
  -H "X-Tenant-Slug: magra" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": { "name": "Test", "phone": "1130000000" },
    "fulfillment": "PICKUP",
    "items": [ { "name": "Bondiola al vacío", "quantity": 1 } ],
    "payment": { "paid": false }
  }'
```

Stub de integración WordPress / WooCommerce listo para copiar:
[`examples/wordpress/estetica-erp-orders.php`](../../examples/wordpress/estetica-erp-orders.php).

---

## Notas de diseño / provisional a confirmar

- **Ítems por SKU:** hoy `sku`/`name` matchean por nombre exacto. Cuando se
  agregue una columna `sku` a `Product` (migración futura), pasa a matchear por
  código y esta nota se retira.
- **Idempotencia:** `externalRef` se traza en las notas del pedido pero **no**
  bloquea duplicados todavía (haría falta una columna dedicada + índice). Si el
  sitio externo reintenta el POST, puede crear un segundo pedido. Provisional.
- **Multi-tenant:** la resolución de tenant es single-tenant fail-closed (ADR-015)
  con verificación de slug. El día del 2º tenant, este endpoint se ajusta junto
  con RLS + resolución por request, igual que el resto del Core.
