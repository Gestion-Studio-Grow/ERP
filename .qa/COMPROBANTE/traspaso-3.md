# COMPROBANTE + ENG-023 · traspaso de la porción 3 (ENG-024)

## Hecho
- Regla «un inscripto no emite con el IVA como 21 % parejo» llevada al plugin:
  - `src/plugins/arca/domain/iva-por-producto.ts` (nuevo, puro): `ivaSinAlicuotaPorProducto(ev)` y el motivo.
  - `src/plugins/arca/handler.ts`: la aplica en la emisión nueva, antes de decidir, con `ComprobanteInvalidoError`. No la aplica al adoptar un número ya autorizado (ENG-020).
  - `src/plugins/arca/core-contract.ts`: el evento suma `ivaPorProducto?: boolean`.
  - `src/lib/invoice-core.ts`: el campo se suma a `CreateInvoiceInput` y al payload (sólo si es true).
  - `src/lib/arca-dispatch.ts` (`aEventoPlugin`): lo pasa al plugin.
  - Ningún camino lo marca: `calcularImpuestos` aplica un 21 % parejo.
- Fixtures de inscripto en 6 tests existentes: `ivaPorProducto: true` con comentario.
  - `handler-decision`, `contrato-arca`, `arca-dispatch-postgres`, `arca-envios-concurrencia-postgres`, `arca-envios-por-negocio-postgres`, `arca-procesador-sin-operador-postgres`.
- Tests nuevos:
  - `src/plugins/arca/iva-por-producto.test.ts`: 6 tests, regla y despacho. CH/monotributo sigue emitiendo C.
  - `src/lib/umbral-en-los-seis-caminos-postgres.test.ts`: 7 tests, Postgres con RLS y los 6 caminos reales. Umbral de la tabla de vigencias; control por debajo del umbral; inscripto en pedido, turno y MP.
- BACKLOG ENG-024: estado agregado.

## Evidencia (esta carpeta)
- Rojo antes: `eng024-iva-rojo-antes.txt`. Verde: `eng024-iva-verde.txt` (6/6) y `eng024-seis-caminos.txt` (7/7, CI=1, sin saltear).
- Mutaciones:
  - `eng024-mutacion-iva-apagada.txt`: 4 rojos.
  - `eng024-mutacion-sin-umbral.txt`: 6 rojos.
- `eng024-arca-suite.txt`: 262/262. `tsc-3.txt`: 0 errores. `eslint-3.txt`: 0 sobre los 13 archivos.
- `suite-3.txt`: 3941 tests, 3935 pasan y 6 fallan, los mismos ajenos que en la porción 2 (xlsx ×4, redondeos-locales por CajaRenglon/LocalesRenglon, `src/design/hoja.test.ts`). `paridad-menu`: 4/4.

## Falta
1. Guarda del lado de la factura (ENG-023, anotada en BACKLOG):
   - `createInvoiceInTx` (`src/lib/invoice-core.ts`, origen ORDER) tiene que tomar la fila del pedido FOR SHARE y rechazar si está CANCELLED.
   - Hoy `facturarOrden` (`invoice-from-order.ts:58`) factura un pedido anulado.
   - Lo mismo para el turno.
   - Test contra Postgres: facturar un pedido anulado no crea factura; facturación y anulación simultáneas terminan en un solo resultado coherente.
2. `emitirFacturitaAction` (`src/lib/facturita-actions.ts:~100`) responde ok:true aunque el despacho rechace la factura. Leer el estado después del despacho y devolver el motivo.
3. `decidirDelEvento` no pasa `umbralIdentificacionDelNegocio`: la regla propia del negocio ($600.000 por defecto) sólo la aplican bancos y MP automático antes de crear.
4. Inscripto en facturita, bancos y API externa: no hay test que ejecute el inscripto, porque el perfil real no puede dar esa condición (falta la columna, `fiscal.ts:236-246`). Extender los tests cuando exista.
5. ENG-023 criterio 2 (nota de crédito): R4-F2.

## Riesgos
- Un inscripto (cuando exista la columna) no emite por ningún camino automático hasta que haya IVA por producto. Es a propósito y es lo mismo que ya decía la pantalla.
- En producción no hay inscriptos: todo perfil sin condición lanza (`fiscal.ts`), y CH queda como monotributo en el perfil de prueba. No lo medí en Neon.
