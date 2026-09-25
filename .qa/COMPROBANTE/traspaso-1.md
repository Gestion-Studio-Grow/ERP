# COMPROBANTE + ENG-023 · traspaso de la porción 1

## Hecho (partes 1 y 2 del pedido: tipo de comprobante y armado del XML)
- `src/plugins/arca/domain/catalogos.ts`: CDI = 87; CondicionIvaReceptorId 8, 9, 10, 16; `tipoFacturaCorrespondiente` da A para RI → monotributista (RG 5003/2021). Queda sólo como referencia: un test la cruza con la decisión.
- `src/plugins/arca/domain/comprobante.ts`: `decidirDelEvento(ev, fechaDeEnvio)` llama a `decidirComprobante` (núcleo aprobado, sin tocarlo) con `exigirPeriodoDeServicio: true`; `comprobanteDeLaDecision` toma de la decisión el tipo, la condición, el documento, el concepto, las fechas, el asociado o el período y las leyendas; `construirComprobante(ev, fechaDeEnvio = ev.fecha)` sólo con estado "lista", si no lanza `ComprobanteSinDecisionError` con los motivos.
- `src/plugins/arca/core-contract.ts`: el evento suma `emisor.regimenFacturaA`, `importeExento`, `importeNoGravado`, `clase`, `asociado` y `periodoAsociado` (todos opcionales).
- `src/plugins/arca/afip/soap.ts`:
  - FchServDesde/Hasta/VtoPago salen del comprobante; si faltan, el armado lanza error, sin rellenarlas.
  - ImpTrib pasa a ir ANTES de ImpIVA, como en la secuencia del WSDL; antes iba después.
  - ImpTotConc e ImpOpEx salen del comprobante.
  - Se arma CbtesAsoc o PeriodoAsoc; con los dos lanza error.
  - Sin alícuotas no se manda un `<Iva>` vacío.
  - Sin CondicionIVAReceptorId lanza error: ya no manda 5 por defecto.
- `src/plugins/arca/domain/validacion.ts`:
  - condición obligatoria y admitida por la letra (ENG-316);
  - CbtesAsoc o PeriodoAsoc, uno solo, y una nota necesita uno de los dos;
  - exento y no gravado al centavo, no negativos y en 0 en C;
  - total = neto + IVA + exento + no gravado.
- `src/plugins/arca/handler.ts`:
  - `HandlerDeps.fechaDeEnvio` es obligatorio (el plugin no mira el reloj) y lo pone `arca-dispatch.ts` con `fechaFiscalDelDia`.
  - Una emisión nueva sale sólo si la decisión quedó "lista"; si no, `ComprobanteInvalidoError` con los motivos y sin llamar a ARCA.
  - Con número anotado (ENG-020) se reconoce el comprobante con la decisión del día de su fecha.
- Guarda de dependencias `src/lib/dinero/redondeo.test.ts` (del plugin al Core): permite `@/lib/fiscal/decidir-comprobante`, porque así lo pide el encargo.

## Tests (evidencia en esta carpeta)
- Nuevos: `src/plugins/arca/domain/tipo-segun-la-rg.test.ts`, con 28 tests: 11 casos emisor × receptor y el XML de cada uno contra la secuencia de WSFEv1, CH, notas de crédito, exento y no gravado, y condición. Estaban en rojo antes (`rojo-antes.txt`: 26 de 28 fallaban) y ahora pasan (`verde-1.txt`).
- `src/plugins/arca/handler-decision.test.ts`: 4 tests. La mutación que usa la fecha del comprobante en vez de la del envío da 1 rojo (`mutacion-ventana.txt`).
- Tests existentes ajustados: `comprobante.test.ts` (CUIT válidos; RI → monotributo ahora espera A, que es el arreglo), `validacion.test.ts`, `soap.test.ts`, `decision-y-envio-arca.test.ts` (fixtures con la condición del receptor) y `contrato-arca.test.ts` (dep fechaDeEnvio).
- `suite-final.txt`: 508 tests, 507 pasan, 0 salteados. El único rojo es `redondeos-locales.test.ts` («redondeos a mano nuevos»). Lo causan `src/app/admin/(dashboard)/caja/CajaRenglon.tsx:51` y `locales/LocalesRenglon.tsx:52`, dos pantallas del rediseño que esta porción no tocó. `paridad-menu` está en verde.
- `tsc.txt`: 0 errores. `eslint.txt`: 0 con --max-warnings=0 sobre los archivos tocados.

## Falta (parte 3: ENG-023)
- `src/lib/order-anulacion.ts:223` (`planAnulacionVenta`) y `:339` (`anularVentaInTx`): con una factura AUTHORIZED de la orden (`Invoice.orderId`), rechazar con un motivo claro y dejar el pedido sin anular.
  - Decidir también qué pasa con una PENDING con envío abierto: propuesta, rechazar igual, porque el CAE puede llegar después.
- `src/lib/turnos/anulacion.ts:339` (`anularCobroTurnoInTx`): lo mismo, por `Invoice.appointmentId`.
- Tests: de dominio (el plan) y de integración contra Postgres con el arnés (`src/test/base-efimera.ts`, `src/test/accion-de-servidor.ts`), ejecutando la Server Action real de anulación.
- ENG-024: la parte de umbral y ventana ya la aplica el plugin a los 6 caminos (la decisión corre en el despacho). Falta un test por camino que lo ejecute (pedido, turno, MP, facturita, bancos, API externa) y la regla "inscripto sin alícuota por producto no emite" (`ventas/factura.ts:94`, pantalla: no se toca).

## Riesgos anotados
- Envíos en vuelo, creados con el código anterior, cuya decisión ahora no da comprobante: se rechazan sin consultar el número anotado. Con la facturación apagada en producción no hay envíos así; no lo medí en Neon.
- Un consumidor final sin identificar por encima del umbral de la RG 5700 ahora se frena antes de ARCA. Antes lo rechazaba ARCA.
