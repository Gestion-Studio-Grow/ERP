# Eventos de dominio · catálogo v1

<!-- GENERADO desde src/eventos/catalogo.ts con `npx tsx src/eventos/generar-doc.ts`. No editar a mano: el test del catálogo falla si queda viejo. -->

Convención `dominio.hecho@N`. Cada evento viaja en un sobre común y se guarda en el outbox (`OutboxEvent.type = "tipo@N"`).

```json
{ "id": "evt_…", "tipo": "pedido.cobrado", "version": 1, "negocio": "<tenantId>", "ocurridoEn": "<ISO 8601>", "clave": "pedido:<id>:cobrado", "datos": { … }, "enlaces": { … } }
```

Reglas:

1. Agregar un campo opcional **no** sube la versión; sacar, renombrar o cambiar el tipo **sí** (`@2`), y durante una ventana se emiten las dos.
2. `clave` es única por hecho y por negocio: reemitir el mismo hecho no duplica (la de `@N≥2` se guarda con el sufijo `@N`).
3. Los eventos de plata se emiten **dentro de la transacción** que produce el hecho: si el hecho vuelve atrás, el evento también.
4. Datos personales: ids y montos. Nunca teléfono ni documento en claro; los campos `…Enmascarado` llevan `******1234` y los textos libres se redactan (emails y tiradas de 6+ dígitos enmascarados).
5. Hasta que se aplique `N2_hub.sql` (Gate 2) la clave viaja en `payload._clave`; con la migración, en la columna `OutboxEvent.clave` (única por negocio).
6. Hasta la tanda P3 (despachante y webhooks) nadie entrega estos eventos: quedan en el outbox con `processedAt` NULL. El despacho de ARCA toma sólo `InvoiceCreated`. P3 decide qué hace con lo acumulado (una suscripción nueva no recibe eventos de antes de existir).
7. `externalRef` es la referencia que manda el integrador por la API (`ext:<ref>`) y viaja tal cual, sin redactar: es para cruzar con su sistema. No lleva datos personales.

Total: **51 eventos** en el catálogo · **5 emitidos hoy** (P2) · el resto, pendiente de la tanda que se indica.

| Evento | Familia | Emisión | Plata |
|---|---|---|---|
| `pedido.creado@1` | retail | P2 |  |
| `pedido.confirmado@1` | retail | pendiente · tanda de avanzar-pedido |  |
| `pedido.listo@1` | retail | pendiente · tanda de avanzar-pedido |  |
| `pedido.entregado@1` | retail | pendiente · tanda de avanzar-pedido |  |
| `pedido.cancelado@1` | retail | P2 | sí |
| `pedido.cobrado@1` | retail | P2 | sí |
| `pago.acreditado@1` | compartido | pendiente · ingesta MP (P5) | sí |
| `pago.devuelto@1` | compartido | pendiente · ingesta MP (P5) | sí |
| `factura.autorizada@1` | compartido | P2 | sí |
| `factura.rechazada@1` | compartido | P2 | sí |
| `stock.bajo@1` | retail | pendiente · tanda de inventario |  |
| `stock.ajustado@1` | retail | pendiente · tanda de inventario |  |
| `producto.actualizado@1` | retail | pendiente · tanda de catálogo |  |
| `cliente.creado@1` | compartido | pendiente · tanda de client-actions |  |
| `deuda.vencida@1` | retail | pendiente · tanda de debts (barrido) | sí |
| `caja.cerrada@1` | compartido | pendiente · M1 (cierre-diario) | sí |
| `caja.abierta@1` | retail | pendiente · M1 (caja) | sí |
| `balanza.lectura@1` | retail | pendiente · opcional (pos-peso.ts) |  |
| `turno.reservado@1` | club | pendiente · B1 (booking-core) |  |
| `turno.confirmado@1` | club | pendiente · B1 |  |
| `turno.cancelado@1` | club | pendiente · B1 |  |
| `turno.reprogramado@1` | club | pendiente · B1 |  |
| `turno.completado@1` | club | pendiente · B1 |  |
| `turno.ausente@1` | club | pendiente · B1 |  |
| `turno.recordatorio.enviado@1` | club | pendiente · B1 |  |
| `clase.pedida@1` | club | pendiente · B1 (padel/core.ts) |  |
| `clase.confirmada@1` | club | pendiente · B1 (padel/core.ts) |  |
| `clase.cancelada@1` | club | pendiente · B1 (padel/core.ts) |  |
| `clase.pagada@1` | club | pendiente · B1 (padel/core.ts) | sí |
| `socio.alta@1` | club | pendiente · módulo club |  |
| `socio.baja@1` | club | pendiente · módulo club |  |
| `cuota.generada@1` | club | pendiente · módulo club |  |
| `cuota.cobrada@1` | club | pendiente · módulo club | sí |
| `cuota.vencida@1` | club | pendiente · módulo club (barrido) |  |
| `credito.cargado@1` | club | pendiente · módulo club (credito-core.ts) | sí |
| `credito.consumido@1` | club | pendiente · módulo club (credito-core.ts) | sí |
| `buffet.pedido.creado@1` | club | pendiente · módulo club (buffet-core.ts) |  |
| `mensaje.recibido@1` | club | pendiente · P6 (webhook WhatsApp) |  |
| `mensaje.estado@1` | club | pendiente · P6 (statuses de Meta) |  |
| `turno.sena.pagada@1` | n2 | pendiente · B1 | sí |
| `turno.garantia.ejecutada@1` | n2 | pendiente · B7 | sí |
| `espera.ofrecida@1` | n2 | pendiente · B8 |  |
| `espera.asignada@1` | n2 | pendiente · B8 |  |
| `caja.turno.cerrada@1` | n2 | pendiente · B4 (club) y M1 (retail) | sí |
| `reparto.salio@1` | n2 | pendiente · M6 | sí |
| `reparto.rendido@1` | n2 | pendiente · M6 | sí |
| `pedido.transferencia.verificada@1` | n2 | pendiente · M2 | sí |
| `lote.por.vencer@1` | n2 | pendiente · M3a (barrido diario) |  |
| `lote.vencido@1` | n2 | pendiente · M3a (barrido diario) |  |
| `club.luz.cambio@1` | n2 | pendiente · B1 (comando luz) |  |
| `producto.balanza.sincronizada@1` | n2 | pendiente · M5 |  |

## Retail (comercio, carnicería, perfumería, pádel-tienda, supermercado)

### `pedido.creado@1`

- **Cuándo:** insertOrder / createExternalOrder (src/lib/order-core.ts, external-orders.ts), en la transacción del alta
- **Emisión:** P2
- **Clave:** `pedido:<pedidoId>:creado`
- **datos:** `{ pedidoId: id, codigo: entero, canal: MOSTRADOR | ONLINE | API | WHATSAPP, entrega: RETIRA | DELIVERY, total: monto (ARS), items: [{ productoId: id | null, sku: texto | null, nombre: texto libre (se redacta), cantidad: número, precioUnitario: monto (ARS) }], clienteId: id | null, externalRef: texto | null }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.creado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:creado",
  "datos": {
    "pedidoId": "ord_01",
    "codigo": 1042,
    "canal": "MOSTRADOR",
    "entrega": "RETIRA",
    "total": 18900,
    "items": [
      {
        "productoId": "prd_01",
        "sku": null,
        "nombre": "Vacío",
        "cantidad": 1.5,
        "precioUnitario": 12600
      }
    ],
    "clienteId": "cli_01",
    "externalRef": null
  }
}
```

### `pedido.confirmado@1`

- **Cuándo:** avance PENDING→CONFIRMED (avanzar-pedido)
- **Emisión:** pendiente · tanda de avanzar-pedido
- **Clave:** `pedido:<pedidoId>:confirmado`
- **datos:** `{ pedidoId: id, codigo: entero, listoEstimado?: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.confirmado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:confirmado",
  "datos": {
    "pedidoId": "ord_01",
    "codigo": 1042,
    "listoEstimado": "2026-10-28T13:30:00-03:00"
  }
}
```

### `pedido.listo@1`

- **Cuándo:** avance →READY
- **Emisión:** pendiente · tanda de avanzar-pedido
- **Clave:** `pedido:<pedidoId>:listo`
- **datos:** `{ pedidoId: id, codigo: entero, entrega: RETIRA | DELIVERY }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.listo",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:listo",
  "datos": {
    "pedidoId": "ord_01",
    "codigo": 1042,
    "entrega": "DELIVERY"
  }
}
```

### `pedido.entregado@1`

- **Cuándo:** avance →DELIVERED
- **Emisión:** pendiente · tanda de avanzar-pedido
- **Clave:** `pedido:<pedidoId>:entregado`
- **datos:** `{ pedidoId: id, codigo: entero, entregadoEn: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.entregado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:entregado",
  "datos": {
    "pedidoId": "ord_01",
    "codigo": 1042,
    "entregadoEn": "2026-10-28T14:10:00-03:00"
  }
}
```

### `pedido.cancelado@1`

- **Cuándo:** anulación de la venta (anularVentaInTx, src/lib/order-anulacion.ts), en su transacción
- **Emisión:** P2 · evento de plata (dentro de la transacción)
- **Clave:** `pedido:<pedidoId>:cancelado`
- **datos:** `{ pedidoId: id, codigo: entero, motivo: texto libre (se redacta), reintegro?: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.cancelado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:cancelado",
  "datos": {
    "pedidoId": "ord_01",
    "codigo": 1042,
    "motivo": "El cliente se arrepintió",
    "reintegro": 18900
  }
}
```

### `pedido.cobrado@1`

- **Cuándo:** botón «Cobrar» y aviso de pago de MP (cobrarPedidoEnTx, que usa cobros-actions vía cobrarPedidoPorAvisoDePago), venta de mostrador que nace cobrada (insertOrder) y cobro parcial que salda el pedido o la deuda de su fiado (applyCollectionInTx, src/lib/settlement/collection-repo.ts: monto = total del pedido, medio = el del cobro que cierra el saldo); en la transacción del cobro. Entregar al fiado (clientes/fiado.ts) y la venta a cuenta NO emiten: no entró plata
- **Emisión:** P2 · evento de plata (dentro de la transacción)
- **Clave:** `pedido:<pedidoId>:cobrado`
- **datos:** `{ pedidoId: id, codigo: entero, monto: monto (ARS), medio: EFECTIVO | MP | TRANSFERENCIA | TARJETA, pagoExterno?: id, cobradoEn: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.cobrado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:cobrado",
  "datos": {
    "pedidoId": "ord_01",
    "codigo": 1042,
    "monto": 18900,
    "medio": "MP",
    "pagoExterno": "1325478890",
    "cobradoEn": "2026-10-28T14:03:11-03:00"
  }
}
```

### `stock.bajo@1`

- **Cuándo:** tras cada movimiento del ledger (src/lib/inventario) si disponible <= minimo
- **Emisión:** pendiente · tanda de inventario
- **Clave:** `stock:<productoId>:bajo:<movimientoId>`
- **datos:** `{ productoId: id, sku: texto | null, nombre: texto, disponible: número, minimo: número, deposito?: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "stock.bajo",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "stock:<productoId>:bajo:<movimientoId>",
  "datos": {
    "productoId": "prd_01",
    "sku": null,
    "nombre": "Vacío",
    "disponible": 2.5,
    "minimo": 5
  }
}
```

### `stock.ajustado@1`

- **Cuándo:** stock-adjustment-actions.ts / mermas
- **Emisión:** pendiente · tanda de inventario
- **Clave:** `stock:movimiento:<movimientoId>`
- **datos:** `{ productoId: id, delta: número, motivo: texto libre (se redacta), movimientoId: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "stock.ajustado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "stock:movimiento:<movimientoId>",
  "datos": {
    "productoId": "prd_01",
    "delta": -0.8,
    "motivo": "Merma por recorte",
    "movimientoId": "smv_01"
  }
}
```

### `producto.actualizado@1`

- **Cuándo:** catálogo: precio o estado (aumento-core.ts)
- **Emisión:** pendiente · tanda de catálogo
- **Clave:** `producto:<productoId>:<cambioId>`
- **datos:** `{ productoId: id, sku: texto | null, precio: monto (ARS) | null, activo: sí/no, cambios: [texto] }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "producto.actualizado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "producto:<productoId>:<cambioId>",
  "datos": {
    "productoId": "prd_01",
    "sku": null,
    "precio": 13200,
    "activo": true,
    "cambios": [
      "precio"
    ]
  }
}
```

### `deuda.vencida@1`

- **Cuándo:** barrido diario de cuentas a cobrar (src/lib/debts)
- **Emisión:** pendiente · tanda de debts (barrido) · evento de plata (dentro de la transacción)
- **Clave:** `deuda:<deudaId>:vencida:<AAAA-MM-DD>`
- **datos:** `{ clienteId: id, deudaId: id, monto: monto (ARS), venciaEl: fecha ISO 8601, diasVencida: entero }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "deuda.vencida",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "deuda:<deudaId>:vencida:<AAAA-MM-DD>",
  "datos": {
    "clienteId": "cli_01",
    "deudaId": "ar_01",
    "monto": 32000,
    "venciaEl": "2026-10-20",
    "diasVencida": 8
  }
}
```

### `caja.abierta@1`

- **Cuándo:** corte inicial
- **Emisión:** pendiente · M1 (caja) · evento de plata (dentro de la transacción)
- **Clave:** `caja:<cierreId>:abierta`
- **datos:** `{ cierreId: id, fecha: fecha ISO 8601, inicial: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "caja.abierta",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "caja:<cierreId>:abierta",
  "datos": {
    "cierreId": "cie_01",
    "fecha": "2026-10-28",
    "inicial": 20000
  }
}
```

### `balanza.lectura@1`

- **Cuándo:** sólo si el negocio lo pide (pos-peso.ts); nunca por webhook, sólo API local
- **Emisión:** pendiente · opcional (pos-peso.ts) · sólo API local, nunca por webhook
- **Clave:** `balanza:<balanzaId>:<lecturaId>`
- **datos:** `{ peso: número, unidad: kg | g, productoId?: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "balanza.lectura",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "balanza:<balanzaId>:<lecturaId>",
  "datos": {
    "peso": 1.234,
    "unidad": "kg",
    "productoId": "prd_01"
  }
}
```

## Compartidos (retail y club)

### `pago.acreditado@1`

- **Cuándo:** ingesta de Mercado Pago (ingest.ts)
- **Emisión:** pendiente · ingesta MP (P5) · evento de plata (dentro de la transacción)
- **Clave:** `pago:<proveedor>:<pagoExterno>:acreditado`
- **datos:** `{ pagoExterno: id, proveedor: texto, monto: monto (ARS), estado: texto, referencia: { tipo: texto, id: id } }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pago.acreditado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pago:<proveedor>:<pagoExterno>:acreditado",
  "datos": {
    "pagoExterno": "1325478890",
    "proveedor": "mercadopago",
    "monto": 18900,
    "estado": "approved",
    "referencia": {
      "tipo": "pedido",
      "id": "ord_01"
    }
  }
}
```

### `pago.devuelto@1`

- **Cuándo:** EstadoPago = refunded
- **Emisión:** pendiente · ingesta MP (P5) · evento de plata (dentro de la transacción)
- **Clave:** `pago:<proveedor>:<pagoExterno>:devuelto`
- **datos:** `{ pagoExterno: id, monto: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pago.devuelto",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pago:<proveedor>:<pagoExterno>:devuelto",
  "datos": {
    "pagoExterno": "1325478890",
    "monto": 18900
  }
}
```

### `factura.autorizada@1`

- **Cuándo:** registerFiscalDocument (src/lib/invoice-core.ts), en la transacción que guarda el CAE. InvoiceCreated (v0, ARCA) sigue igual
- **Emisión:** P2 · evento de plata (dentro de la transacción)
- **Clave:** `factura:<facturaId>:autorizada`
- **datos:** `{ facturaId: id, tipoComprobante: entero, puntoVenta: entero, numero: entero, cae: texto, caeVencimiento: fecha AAAAMMDD, clase: FACTURA | NOTA_DEBITO | NOTA_CREDITO | OTRO, total: monto (ARS), pedidoId?: id, turnoId?: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "factura.autorizada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "factura:<facturaId>:autorizada",
  "datos": {
    "facturaId": "inv_01",
    "tipoComprobante": 6,
    "puntoVenta": 3,
    "numero": 1287,
    "cae": "76123456789012",
    "caeVencimiento": "20261107",
    "clase": "FACTURA",
    "total": 18900,
    "pedidoId": "ord_01"
  }
}
```

### `factura.rechazada@1`

- **Cuándo:** markInvoiceRejected (src/lib/invoice-core.ts), en la transacción que registra el rechazo
- **Emisión:** P2 · evento de plata (dentro de la transacción)
- **Clave:** `factura:<facturaId>:rechazada:<envioId> (una factura reabierta puede rechazarse otra vez)`
- **datos:** `{ facturaId: id, motivo: texto libre (se redacta) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "factura.rechazada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "factura:<facturaId>:rechazada:<envioId>",
  "datos": {
    "facturaId": "inv_01",
    "motivo": "10015: el documento del receptor no es válido"
  }
}
```

### `cliente.creado@1`

- **Cuándo:** client-actions.ts
- **Emisión:** pendiente · tanda de client-actions
- **Clave:** `cliente:<clienteId>:creado`
- **datos:** `{ clienteId: id, nombre: texto libre (se redacta), telefonoEnmascarado: enmascarado (******1234) | null }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "cliente.creado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "cliente:<clienteId>:creado",
  "datos": {
    "clienteId": "cli_01",
    "nombre": "Marta G.",
    "telefonoEnmascarado": "******7788"
  }
}
```

### `caja.cerrada@1`

- **Cuándo:** cierre del día (cierre-diario.ts)
- **Emisión:** pendiente · M1 (cierre-diario) · evento de plata (dentro de la transacción)
- **Clave:** `caja:<cierreId>:cerrada`
- **datos:** `{ cierreId: id, fecha: fecha ISO 8601, esperado: monto (ARS), contado: monto (ARS), diferencia: monto (ARS), porMedio: { EFECTIVO?: monto (ARS), MP?: monto (ARS), TRANSFERENCIA?: monto (ARS), TARJETA?: monto (ARS) } }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "caja.cerrada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "caja:<cierreId>:cerrada",
  "datos": {
    "cierreId": "cie_01",
    "fecha": "2026-10-28",
    "esperado": 412300,
    "contado": 412000,
    "diferencia": -300,
    "porMedio": {
      "EFECTIVO": 210000,
      "MP": 202000
    }
  }
}
```

## Club (club social/deportivo, pádel-clases, buffet, cuotas)

### `turno.reservado@1`

- **Cuándo:** booking-core.ts (y createBooking del bot WA)
- **Emisión:** pendiente · B1 (booking-core)
- **Clave:** `turno:<turnoId>:reservado`
- **datos:** `{ turnoId: id, servicioId: id, profesionalId?: id, recursoId?: id, inicio: fecha ISO 8601, fin: fecha ISO 8601, clienteId: id, canal: texto, sena?: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.reservado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:reservado",
  "datos": {
    "turnoId": "trn_01",
    "servicioId": "srv_01",
    "recursoId": "cancha_2",
    "inicio": "2026-10-28T19:00:00-03:00",
    "fin": "2026-10-28T20:30:00-03:00",
    "clienteId": "cli_01",
    "canal": "WHATSAPP",
    "sena": 6000
  }
}
```

### `turno.confirmado@1`

- **Cuándo:** confirmación por WhatsApp/panel
- **Emisión:** pendiente · B1
- **Clave:** `turno:<turnoId>:confirmado`
- **datos:** `{ turnoId: id, confirmadoEn: fecha ISO 8601, canal: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.confirmado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:confirmado",
  "datos": {
    "turnoId": "trn_01",
    "confirmadoEn": "2026-10-28T12:00:00-03:00",
    "canal": "WHATSAPP"
  }
}
```

### `turno.cancelado@1`

- **Cuándo:** cancelación (panel o whatsapp/route.ts)
- **Emisión:** pendiente · B1
- **Clave:** `turno:<turnoId>:cancelado`
- **datos:** `{ turnoId: id, motivo: texto libre (se redacta), quien: CLIENTE | NEGOCIO, fueraDeTermino: sí/no, reintegroSena?: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.cancelado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:cancelado",
  "datos": {
    "turnoId": "trn_01",
    "motivo": "Lluvia",
    "quien": "NEGOCIO",
    "fueraDeTermino": false,
    "reintegroSena": 6000
  }
}
```

### `turno.reprogramado@1`

- **Cuándo:** reprogramación
- **Emisión:** pendiente · B1
- **Clave:** `turno:<turnoId>:reprogramado:<inicioNuevo>`
- **datos:** `{ turnoId: id, inicioAnterior: fecha ISO 8601, inicioNuevo: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.reprogramado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:reprogramado:<inicioNuevo>",
  "datos": {
    "turnoId": "trn_01",
    "inicioAnterior": "2026-10-28T19:00:00-03:00",
    "inicioNuevo": "2026-10-29T19:00:00-03:00"
  }
}
```

### `turno.completado@1`

- **Cuándo:** cierre del turno
- **Emisión:** pendiente · B1
- **Clave:** `turno:<turnoId>:completado`
- **datos:** `{ turnoId: id, montoCobrado?: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.completado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:completado",
  "datos": {
    "turnoId": "trn_01",
    "montoCobrado": 24000
  }
}
```

### `turno.ausente@1`

- **Cuándo:** no-show
- **Emisión:** pendiente · B1
- **Clave:** `turno:<turnoId>:ausente`
- **datos:** `{ turnoId: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.ausente",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:ausente",
  "datos": {
    "turnoId": "trn_01"
  }
}
```

### `turno.recordatorio.enviado@1`

- **Cuándo:** cron/reminders (reminder-sweep.ts)
- **Emisión:** pendiente · B1
- **Clave:** `turno:<turnoId>:recordatorio:<plantilla>`
- **datos:** `{ turnoId: id, canal: texto, plantilla: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.recordatorio.enviado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:recordatorio:<plantilla>",
  "datos": {
    "turnoId": "trn_01",
    "canal": "WHATSAPP",
    "plantilla": "recordatorio_turno"
  }
}
```

### `clase.pedida@1`

- **Cuándo:** padel/core.ts (PadelClase)
- **Emisión:** pendiente · B1 (padel/core.ts)
- **Clave:** `clase:<claseId>:pedida`
- **datos:** `{ claseId: id, alumnoId: id, empiezaEn: fecha ISO 8601, estado: texto, pagoEstado: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "clase.pedida",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "clase:<claseId>:pedida",
  "datos": {
    "claseId": "cls_01",
    "alumnoId": "cli_01",
    "empiezaEn": "2026-10-28T19:00:00-03:00",
    "estado": "PEDIDA",
    "pagoEstado": "PENDIENTE"
  }
}
```

### `clase.confirmada@1`

- **Cuándo:** padel/core.ts (PadelClase)
- **Emisión:** pendiente · B1 (padel/core.ts)
- **Clave:** `clase:<claseId>:confirmada`
- **datos:** `{ claseId: id, alumnoId: id, empiezaEn: fecha ISO 8601, estado: texto, pagoEstado: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "clase.confirmada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "clase:<claseId>:confirmada",
  "datos": {
    "claseId": "cls_01",
    "alumnoId": "cli_01",
    "empiezaEn": "2026-10-28T19:00:00-03:00",
    "estado": "CONFIRMADA",
    "pagoEstado": "PENDIENTE"
  }
}
```

### `clase.cancelada@1`

- **Cuándo:** padel/core.ts (PadelClase)
- **Emisión:** pendiente · B1 (padel/core.ts)
- **Clave:** `clase:<claseId>:cancelada`
- **datos:** `{ claseId: id, alumnoId: id, empiezaEn: fecha ISO 8601, estado: texto, pagoEstado: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "clase.cancelada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "clase:<claseId>:cancelada",
  "datos": {
    "claseId": "cls_01",
    "alumnoId": "cli_01",
    "empiezaEn": "2026-10-28T19:00:00-03:00",
    "estado": "CANCELADA",
    "pagoEstado": "PENDIENTE"
  }
}
```

### `clase.pagada@1`

- **Cuándo:** cobro de la clase
- **Emisión:** pendiente · B1 (padel/core.ts) · evento de plata (dentro de la transacción)
- **Clave:** `clase:<claseId>:pagada`
- **datos:** `{ claseId: id, monto: monto (ARS), medio: EFECTIVO | MP | TRANSFERENCIA | TARJETA }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "clase.pagada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "clase:<claseId>:pagada",
  "datos": {
    "claseId": "cls_01",
    "monto": 15000,
    "medio": "TRANSFERENCIA"
  }
}
```

### `socio.alta@1`

- **Cuándo:** alta de socio
- **Emisión:** pendiente · módulo club
- **Clave:** `socio:<socioId>:alta:<desde>`
- **datos:** `{ socioId: id, categoria: texto, desde: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "socio.alta",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "socio:<socioId>:alta:<desde>",
  "datos": {
    "socioId": "soc_01",
    "categoria": "ACTIVO",
    "desde": "2026-10-01"
  }
}
```

### `socio.baja@1`

- **Cuándo:** baja de socio
- **Emisión:** pendiente · módulo club
- **Clave:** `socio:<socioId>:baja:<desde>`
- **datos:** `{ socioId: id, categoria: texto, desde: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "socio.baja",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "socio:<socioId>:baja:<desde>",
  "datos": {
    "socioId": "soc_01",
    "categoria": "ACTIVO",
    "desde": "2026-10-31"
  }
}
```

### `cuota.generada@1`

- **Cuándo:** generación mensual
- **Emisión:** pendiente · módulo club
- **Clave:** `cuota:<cuotaId>:generada`
- **datos:** `{ cuotaId: id, socioId: id, periodo: texto, monto: monto (ARS), vence: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "cuota.generada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "cuota:<cuotaId>:generada",
  "datos": {
    "cuotaId": "cuo_01",
    "socioId": "soc_01",
    "periodo": "2026-11",
    "monto": 18000,
    "vence": "2026-11-10"
  }
}
```

### `cuota.cobrada@1`

- **Cuándo:** cobro de la cuota
- **Emisión:** pendiente · módulo club · evento de plata (dentro de la transacción)
- **Clave:** `cuota:<cuotaId>:cobrada`
- **datos:** `{ cuotaId: id, monto: monto (ARS), medio: EFECTIVO | MP | TRANSFERENCIA | TARJETA, pagoExterno?: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "cuota.cobrada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "cuota:<cuotaId>:cobrada",
  "datos": {
    "cuotaId": "cuo_01",
    "monto": 18000,
    "medio": "MP",
    "pagoExterno": "1325478891"
  }
}
```

### `cuota.vencida@1`

- **Cuándo:** barrido diario
- **Emisión:** pendiente · módulo club (barrido)
- **Clave:** `cuota:<cuotaId>:vencida:<AAAA-MM-DD>`
- **datos:** `{ cuotaId: id, socioId: id, diasVencida: entero, monto: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "cuota.vencida",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "cuota:<cuotaId>:vencida:<AAAA-MM-DD>",
  "datos": {
    "cuotaId": "cuo_01",
    "socioId": "soc_01",
    "diasVencida": 5,
    "monto": 18000
  }
}
```

### `credito.cargado@1`

- **Cuándo:** buffet / cuenta corriente (club/credito-core.ts)
- **Emisión:** pendiente · módulo club (credito-core.ts) · evento de plata (dentro de la transacción)
- **Clave:** `credito:<movimientoId>`
- **datos:** `{ socioId: id, monto: monto (ARS), saldo: monto (ARS), origen: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "credito.cargado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "credito:<movimientoId>",
  "datos": {
    "socioId": "soc_01",
    "monto": 10000,
    "saldo": 25000,
    "origen": "carga en mostrador"
  }
}
```

### `credito.consumido@1`

- **Cuándo:** buffet / cuenta corriente (club/credito-core.ts)
- **Emisión:** pendiente · módulo club (credito-core.ts) · evento de plata (dentro de la transacción)
- **Clave:** `credito:<movimientoId>`
- **datos:** `{ socioId: id, monto: monto (ARS), saldo: monto (ARS), origen: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "credito.consumido",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "credito:<movimientoId>",
  "datos": {
    "socioId": "soc_01",
    "monto": 3500,
    "saldo": 21500,
    "origen": "buffet"
  }
}
```

### `buffet.pedido.creado@1`

- **Cuándo:** club/buffet-core.ts
- **Emisión:** pendiente · módulo club (buffet-core.ts)
- **Clave:** `buffet:<pedidoId>:creado`
- **datos:** `{ pedidoId: id, socioId?: id, items: [{ productoId: id | null, sku: texto | null, nombre: texto libre (se redacta), cantidad: número, precioUnitario: monto (ARS) }], total: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "buffet.pedido.creado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "buffet:<pedidoId>:creado",
  "datos": {
    "pedidoId": "buf_01",
    "socioId": "soc_01",
    "items": [
      {
        "productoId": "prd_09",
        "sku": null,
        "nombre": "Gatorade",
        "cantidad": 2,
        "precioUnitario": 1750
      }
    ],
    "total": 3500
  }
}
```

### `mensaje.recibido@1`

- **Cuándo:** webhook WhatsApp (ya canónico en E3)
- **Emisión:** pendiente · P6 (webhook WhatsApp)
- **Clave:** `mensaje:<idMensaje>:recibido`
- **datos:** `{ conexionId: id, remitenteEnmascarado: enmascarado (******1234), clase: texto, idMensaje: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "mensaje.recibido",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "mensaje:<idMensaje>:recibido",
  "datos": {
    "conexionId": "con_01",
    "remitenteEnmascarado": "******7788",
    "clase": "texto",
    "idMensaje": "wamid.HBg…"
  }
}
```

### `mensaje.estado@1`

- **Cuándo:** statuses de Meta
- **Emisión:** pendiente · P6 (statuses de Meta)
- **Clave:** `mensaje:<idMensaje>:<estado>`
- **datos:** `{ idMensaje: id, estado: texto }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "mensaje.estado",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "mensaje:<idMensaje>:<estado>",
  "datos": {
    "idMensaje": "wamid.HBg…",
    "estado": "read"
  }
}
```

## Agregados por el plan del nivel 2 (§4.1.2)

### `turno.sena.pagada@1`

- **Cuándo:** B1 al aplicar senaPagada
- **Emisión:** pendiente · B1 · evento de plata (dentro de la transacción)
- **Clave:** `turno:<turnoId>:sena:<ref>`
- **datos:** `{ turnoId: id, ref: texto, monto: monto (ARS), medio: EFECTIVO | MP | TRANSFERENCIA | TARJETA, pagoExterno?: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.sena.pagada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:sena:<ref>",
  "datos": {
    "turnoId": "trn_01",
    "ref": "sena-trn_01",
    "monto": 6000,
    "medio": "MP",
    "pagoExterno": "1325478892"
  }
}
```

### `turno.garantia.ejecutada@1`

- **Cuándo:** B7
- **Emisión:** pendiente · B7 · evento de plata (dentro de la transacción)
- **Clave:** `turno:<turnoId>:garantia`
- **datos:** `{ fijoId: id, turnoId: id, monto: monto (ARS), motivo: texto libre (se redacta) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "turno.garantia.ejecutada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "turno:<turnoId>:garantia",
  "datos": {
    "fijoId": "fij_01",
    "turnoId": "trn_01",
    "monto": 12000,
    "motivo": "Ausente sin aviso"
  }
}
```

### `espera.ofrecida@1`

- **Cuándo:** B8
- **Emisión:** pendiente · B8
- **Clave:** `espera:<esperaId>:ofrecida:<turnoId>`
- **datos:** `{ esperaId: id, turnoId?: id, ofrecidoA: [id], venceEn: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "espera.ofrecida",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "espera:<esperaId>:ofrecida:<turnoId>",
  "datos": {
    "esperaId": "esp_01",
    "turnoId": "trn_01",
    "ofrecidoA": [
      "cli_01",
      "cli_02"
    ],
    "venceEn": "2026-10-28T18:30:00-03:00"
  }
}
```

### `espera.asignada@1`

- **Cuándo:** B8
- **Emisión:** pendiente · B8
- **Clave:** `espera:<esperaId>:asignada`
- **datos:** `{ esperaId: id, turnoId?: id, ofrecidoA: [id], venceEn: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "espera.asignada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "espera:<esperaId>:asignada",
  "datos": {
    "esperaId": "esp_01",
    "turnoId": "trn_01",
    "ofrecidoA": [
      "cli_01",
      "cli_02"
    ],
    "venceEn": "2026-10-28T18:30:00-03:00"
  }
}
```

### `caja.turno.cerrada@1`

- **Cuándo:** B4 (club) y M1 (retail, cierre de turno)
- **Emisión:** pendiente · B4 (club) y M1 (retail) · evento de plata (dentro de la transacción)
- **Clave:** `caja:turno:<cierreId>:cerrada`
- **datos:** `{ cierreId: id, turno: texto, quien: id, esperado: monto (ARS), contado: monto (ARS), diferencia: monto (ARS), motivo?: texto libre (se redacta) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "caja.turno.cerrada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "caja:turno:<cierreId>:cerrada",
  "datos": {
    "cierreId": "cie_01",
    "turno": "mañana",
    "quien": "usr_03",
    "esperado": 120000,
    "contado": 119500,
    "diferencia": -500,
    "motivo": "Faltó cambio"
  }
}
```

### `reparto.salio@1`

- **Cuándo:** M6
- **Emisión:** pendiente · M6 · evento de plata (dentro de la transacción)
- **Clave:** `reparto:<repartoId>:salio`
- **datos:** `{ repartoId: id, cadeteId: id, envios: entero, efectivoEsperado: monto (ARS), efectivoEntregado: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "reparto.salio",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "reparto:<repartoId>:salio",
  "datos": {
    "repartoId": "rep_01",
    "cadeteId": "usr_07",
    "envios": 6,
    "efectivoEsperado": 48500,
    "efectivoEntregado": 48500
  }
}
```

### `reparto.rendido@1`

- **Cuándo:** M6
- **Emisión:** pendiente · M6 · evento de plata (dentro de la transacción)
- **Clave:** `reparto:<repartoId>:rendido`
- **datos:** `{ repartoId: id, cadeteId: id, envios: entero, efectivoEsperado: monto (ARS), efectivoEntregado: monto (ARS) }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "reparto.rendido",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "reparto:<repartoId>:rendido",
  "datos": {
    "repartoId": "rep_01",
    "cadeteId": "usr_07",
    "envios": 6,
    "efectivoEsperado": 48500,
    "efectivoEntregado": 48500
  }
}
```

### `pedido.transferencia.verificada@1`

- **Cuándo:** M2
- **Emisión:** pendiente · M2 · evento de plata (dentro de la transacción)
- **Clave:** `pedido:<pedidoId>:transferencia-verificada`
- **datos:** `{ pedidoId: id, verificadoPor: id, verificadoEn: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "pedido.transferencia.verificada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "pedido:<pedidoId>:transferencia-verificada",
  "datos": {
    "pedidoId": "ord_01",
    "verificadoPor": "usr_03",
    "verificadoEn": "2026-10-28T14:05:00-03:00"
  }
}
```

### `lote.por.vencer@1`

- **Cuándo:** M3a (barrido diario)
- **Emisión:** pendiente · M3a (barrido diario)
- **Clave:** `lote:<loteId>:por-vencer`
- **datos:** `{ loteId: id, productoId: id, vence: fecha ISO 8601, kg: número }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "lote.por.vencer",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "lote:<loteId>:por-vencer",
  "datos": {
    "loteId": "lot_01",
    "productoId": "prd_01",
    "vence": "2026-10-31",
    "kg": 12.5
  }
}
```

### `lote.vencido@1`

- **Cuándo:** M3a (barrido diario)
- **Emisión:** pendiente · M3a (barrido diario)
- **Clave:** `lote:<loteId>:vencido`
- **datos:** `{ loteId: id, productoId: id, vence: fecha ISO 8601, kg: número }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "lote.vencido",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "lote:<loteId>:vencido",
  "datos": {
    "loteId": "lot_01",
    "productoId": "prd_01",
    "vence": "2026-10-31",
    "kg": 12.5
  }
}
```

### `club.luz.cambio@1`

- **Cuándo:** B1 (comando luz)
- **Emisión:** pendiente · B1 (comando luz)
- **Clave:** `luz:<canchaId>:<cambioId>`
- **datos:** `{ canchaId: id, encendida: sí/no, turnoId?: id }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "club.luz.cambio",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "luz:<canchaId>:<cambioId>",
  "datos": {
    "canchaId": "cancha_2",
    "encendida": true,
    "turnoId": "trn_01"
  }
}
```

### `producto.balanza.sincronizada@1`

- **Cuándo:** M5
- **Emisión:** pendiente · M5
- **Clave:** `balanza:<balanzaId>:sync:<confirmadaEn>`
- **datos:** `{ balanzaId: id, productos: entero, confirmadaEn: fecha ISO 8601 }`

```json
{
  "id": "evt_8f2c…",
  "tipo": "producto.balanza.sincronizada",
  "version": 1,
  "negocio": "<tenantId>",
  "ocurridoEn": "2026-10-28T17:03:11.000Z",
  "clave": "balanza:<balanzaId>:sync:<confirmadaEn>",
  "datos": {
    "balanzaId": "bal_01",
    "productos": 184,
    "confirmadaEn": "2026-10-28T07:00:00-03:00"
  }
}
```

— Elaborado por GSG · Gestión Studio Grow
