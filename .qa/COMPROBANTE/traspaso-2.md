# COMPROBANTE + ENG-023 · traspaso de la porción 2

## Hecho (parte 3: ENG-023, criterio 1)
- `src/lib/factura-viva.ts` (nuevo, puro): `facturaDeLaVenta(facturas)` → "sin-factura-viva" | "autorizada" | "en-camino".
  - AUTHORIZED = autorizada.
  - PENDING o un estado desconocido = en camino.
  - REJECTED no cuenta.
  - `mensajeFacturaViva(estado, "venta" | "turno")` arma el texto para el usuario.
- `src/lib/order-anulacion.ts`: `planAnulacionVenta` exige `factura` (obligatorio) y suma los motivos "facturada" y "factura-en-camino".
  - La factura se evalúa después de "ya-anulada" y antes de "dia-cerrado" y "solo-hoy".
  - `anularVentaInTx` lee `Invoice` por `{ tenantId, orderId }` antes de decidir y la vuelve a leer siempre después del compare-and-set. El bloque (1b) quedó unificado.
- `src/lib/turnos/anulacion.ts`: `planAnulacion` exige `factura` y suma los motivos "facturado" y "factura-en-camino".
  - `anularCobroTurnoInTx` lee `Invoice` por `{ tenantId, appointmentId }`.
- Las Server Actions (`order-actions.ts:950` y `actions.ts:1237`) ya traducían las excepciones a `{ ok:false, error }`. No se tocaron.
- Fakes de dos tests ajenos: sumé `invoice: { findMany: async () => [] }` (una línea y un comentario en cada uno) para que sigan ejecutando el cuerpo real.
  - `src/app/admin/(dashboard)/pedidos/plata-de-la-bandeja.test.ts`
  - `src/app/admin/(dashboard)/vender/cupon-cuenta-tope.test.ts`
- BACKLOG ENG-023: estado y pendiente de la guarda del lado de la factura.

## Tests (evidencia en esta carpeta)
- `eng023-rojo-antes.txt`: 8 rojos antes de implementar. Son el archivo factura-viva sin módulo más 7 tests de regla.
- `eng023-verde-dominio.txt`: 111 de 111 (factura-viva, order-anulacion, turnos/anulacion, cupon-cuenta-tope, plata-de-la-bandeja).
- `eng023-integracion.txt`: `src/lib/anular-venta-facturada-postgres.test.ts`, 2 de 2, contra una base efímera con RLS y las Server Actions reales `anularVenta` y `anularCobroTurno`. Casos cubiertos:
  - venta con CAE: se rechaza y el pedido sigue DELIVERED;
  - factura PENDING: se rechaza;
  - factura REJECTED: se anula;
  - el negocio B no puede anular la venta de A;
  - turno con CAE: se rechaza y el cobro y el Payment siguen en pie; con la factura pasada a REJECTED, se anula.
- Mutaciones:
  - `eng023-mutacion-sin-regla.txt`: con la regla apagada, 2 de 2 en rojo. La acción real anulaba ("Venta #1 anulada.").
  - `eng023-mutacion-relectura.txt`: sin la relectura posterior al bloqueo, 1 rojo.
- `tsc-2.txt`: 0 errores. `eslint-2.txt`: 0 con --max-warnings=0 sobre los 9 archivos tocados.
- `suite-2.txt`: 3923 tests, 3917 pasan y 6 fallan, todos ajenos a esta porción:
  - xlsx ×4;
  - `redondeos-locales`, por `caja/CajaRenglon.tsx:51` y `locales/LocalesRenglon.tsx:52`, del rediseño;
  - `src/design/hoja.test.ts`, "versión vieja", en `src/design/`, carpeta sin seguimiento del rediseño.
  - `paridad-menu`: 4 de 4 en verde.

## Falta
1. **ENG-024**: un test por cada uno de los 6 caminos que ejecute el umbral y la ventana. La decisión ya corre en el despacho del plugin (porción 1). Los caminos:
   - pedido: `invoice-from-order.ts:70`
   - turno: `invoice-from-appointment.ts:99`
   - MP: `invoice-from-mp.ts:57`
   - facturita: `facturita-actions.ts:94`
   - bancos: `bancos-glue.ts:696`
   - API externa: `external-orders.ts:241`

   Cada test tiene que mostrar que un consumidor final sin identificar por encima del umbral no emite y devuelve el motivo.
2. **ENG-024**, regla "inscripto sin alícuota por producto no emite": hoy vive sólo en la pantalla (`ventas/factura.ts:94`) y no se toca. Hay que llevarla al plugin (validación o decisión) con un test por camino.
3. Guarda del lado de la factura (anotada en BACKLOG ENG-023), fuera de mi lista de archivos:
   - `createInvoiceInTx` con origen ORDER tiene que tomar la fila del pedido FOR SHARE y rechazar si está CANCELLED;
   - `facturarOrden` hoy factura un pedido CANCELLED.
4. ENG-023 criterio 2 (nota de crédito) queda para R4-F2.

## Riesgos
- Mensaje provisional: sugiere pedirle al contador la nota de crédito y registrar la devolución en el libro de caja. Una nota de crédito emitida fuera del sistema no queda en el libro IVA.
- Una factura PENDING trabada (envío que nunca se resuelve) deja la venta sin poder anularse hasta que ARCA responda. Es a propósito.
- CH: la facturación está apagada en producción, así que no debería haber `Invoice` de CH y su anulación no cambia. No lo medí en Neon.
