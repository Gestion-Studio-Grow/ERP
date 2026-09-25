# COMPROBANTE + ENG-023 · traspaso de la porción 4

## Hecho
1. Guarda del lado de la factura, pedido (ENG-023):
   - `src/lib/invoice-core.ts`: `VentaAnuladaError` (exportada) y `tomarPedidoNoAnulado` (privada). `createInvoiceInTx` la llama al principio cuando el origen es ORDER, antes de crear o de reabrir una rechazada. `SELECT status FROM "Order" WHERE id AND "tenantId" FOR SHARE`: CANCELLED lanza `VentaAnuladaError`; sin fila lanza "No se encontró la venta a facturar.".
   - `src/lib/order-actions.ts` (`facturarVenta`): traduce `VentaAnuladaError` a `{ ok:false, error: "La venta está anulada: no se factura." }`.
   - `src/lib/invoice-core.test.ts`: el doble suma `$queryRaw` (contesta el estado del pedido) y un test "un pedido anulado no se factura".
   - `src/lib/facturar-venta-anulada-postgres.test.ts` (nuevo, 3 tests, Postgres con RLS, código real):
     - pedido anulado: no se crea factura ni envío; con factura rechazada, «Volver a facturar» no la reabre;
     - anulación primero (UPDATE sostenido abierto): `facturarVenta` espera (> 400 ms) y termina con el motivo, sin factura;
     - facturación primero (`createInvoiceInTx` sostenida abierta): `anularVenta` espera, ve la factura en camino y no anula.
2. Facturita (ENG-024, pendiente de la porción 3): `emitirFacturitaAction` relee la factura después del despacho; REJECTED → `{ ok:false, error: "ARCA no autorizó la factura: <motivo>", invoiceId }`. El tipo suma `invoiceId?` en la rama ok:false (la pantalla `EmitirForm.tsx` sólo lee `error` ahí: no cambia). Test en `umbral-en-los-seis-caminos-postgres.test.ts` (camino facturita, más el control de un peso menos → ok y AUTHORIZED).
3. BACKLOG ENG-023 y ENG-024: estado actualizado.

## Evidencia (esta carpeta)
- Rojo antes: `eng023-guarda-rojo-antes.txt` (3 de 3) y `facturita-rechazo-rojo-antes.txt` (1 de 1, respondía ok:true).
- Verde: `eng023-guarda-verde.txt` (15 de 15: los 3 de Postgres + invoice-core) y `facturita-rechazo-verde.txt` (7 de 7, CI=1, 0 salteados).
- Mutaciones:
  - `eng023-guarda-mutacion-sin-candado.txt`: sin la guarda, 3 de 3 en rojo.
  - `eng023-guarda-mutacion-sin-for-share.txt`: con la lectura sin `FOR SHARE`, caen las 2 carreras.
- `tsc-4.txt`: 0 errores. `eslint-4.txt`: 0 sobre los 6 archivos.
- `suite-4.txt`: 3953 tests, 3947 pasan, 6 fallan, los mismos ajenos (xlsx ×4, redondeos-locales, `hoja.test.ts`). `paridad-y-rg-4.txt`: paridad-menu y la tabla emisor × receptor de la RG, 32 de 32.
- `porcion4-tracked.diff`: el diff acumulado de los archivos con seguimiento que tocó esta porción.

## Falta
1. Guarda del lado de la factura, turno. Diseño (no hecho):
   - `anularCobroTurnoInTx` corre en Serializable y no escribe la fila del turno. Un `FOR SHARE` de la facturación no le alcanza: su foto es anterior a la factura.
   - Propuesta:
     - la facturación del turno (origen APPOINTMENT en `createInvoiceInTx`) hace un UPDATE real de la fila `Appointment`, dentro del negocio;
     - la anulación toma esa fila `FOR UPDATE` antes de leer las facturas (`actions.ts:1204`, la lectura del turno, o `anulacion.ts:352`).
   - Resultado esperado:
     - facturación confirmada después de la foto: la anulación recibe 40001 y se reintenta (`tenantTransaction` ya reintenta en Serializable) y ahí ve la factura;
     - anulación primero: la facturación espera.
   - Falta decidir qué ve la facturación después de esperar. El monto se lee fuera de la transacción (`invoice-from-appointment.ts:77-84`), así que hay que releer el cobro neto adentro (Σ `Collection` del turno) y no facturar si quedó en 0.
   - Test: el mismo molde de `facturar-venta-anulada-postgres.test.ts`.
2. `umbralIdentificacionDelNegocio` en `decidirDelEvento`: sin hacer, a propósito. Los $600.000 son una regla de bancos y de MP automático (`plugins/bancos/domain/reglas.ts:31`), sin configuración por negocio. Aplicarla en el plugin a todos los caminos rechazaría ventas que la ley permite. Si se quiere, primero hay que tener la configuración por negocio. Es una decisión de producto.
3. Facturita:
   - una factura que queda PENDING (despacho diferido) sigue respondiendo «Factura emitida»;
   - no medí si el tope de 5 por mes (`bancos-glue.ts:519`) cuenta las rechazadas.
4. Inscripto en facturita, bancos y API externa: sigue sin test ejecutable, porque falta la columna de la condición (`fiscal.ts:236-246`). Igual que en la porción 3.
5. ENG-023, criterio 2 (nota de crédito): R4-F2.

## CH
- La condición de IVA no se guarda: la columna no existe (`fiscal.ts:236-246`).
- En homologación, el perfil asume MONOTRIBUTO (`fiscal.ts:219-230`); en producción (`arcaHomologacion = false`), sin condición, lanza `PerfilFiscalIncompletoError` (`fiscal.ts:210-216`).
- La tabla de la RG fija CH → Factura C (`tipo-segun-la-rg.test.ts`, verde).
- No medí Neon.
