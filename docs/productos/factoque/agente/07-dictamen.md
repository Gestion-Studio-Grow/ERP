# 07 · Dictamen adversarial (plata y fiscal) sobre 01–06

> `gsg-certificador`, 14/11/2026, sobre `main` @ `0cc6a10`. Sólo lectura, sin Neon.
> Prueba ejecutada (scratchpad, fuera del repo): fallan las 3 que reproducen B1 y B3.

## Veredicto: **NO CUMPLE**

3 bloqueantes; por B1 cae el punto 2 de la vara (doble factura o cobro perdido). Se arregla en texto y briefs.

## Hallazgos

| id | sev. | Qué | Evidencia | Arreglo |
|---|---|---|---|---|
| B1 | bloq. | **La clave cambia entre exportes.** La base lleva leyenda, contraparte y referencia. Otro formato, Excel (referencia de 22 dígitos → `2,85059E+21`) o leyenda recortada dan clave nueva: **se refactura el solape** (§2.3.3 «avisa y sigue»). **Cobro perdido:** un archivo que empieza a mitad del día («últimos N») numera `#1` al cobro de la tarde, que choca con el `#1` ya facturado. | `02-diseno.md` §3, §2.3; prueba ejecutada | Base = `cuenta\|fecha\|importe en centavos`, más el ordinal. Por (cuenta, día, importe), el excedente *m−k* sobre lo ya cargado va a revisar, nunca solo. Días extremos del archivo, parciales. Tests C17 y C18. |
| B2 | bloq. | **H1 no queda arreglado.** `hash` es NOT NULL y único por negocio, y `generarPropuestas` descarta el segundo cobro igual. §7 no lo cambia; el test puro de la tanda 1 da verde falso. | `schema.prisma:1493`, `:1528`; `reglas.ts:147`, `:160` | `hash` nulable (aditivo) o `hash = clave`. Deduplicar por clave. Test en Postgres. |
| B3 | bloq. | **Mercado Pago por la conexión emite por otro camino:** `mercadopago-auto` en modo `automatico` emite solo, sin firma (contradice I8 y D1). Su tope tampoco es el de Factoque: **probado, Gratis da 159 en vez de 5 y Plus 159 en vez de 40.** El brief 2b no corrige de dónde sale el tope. | `mercadopago-clasificacion.ts:142`; `limites-del-negocio-en-tx.ts:33`; `planes/catalogo.ts:48` | En un negocio Factoque, el pago de MP entra al circuito de conceptos y sale por `emitir-lote`. El tope sale de `planFactoqueEnTx`, como en `cartera-abonos.ts:275`. Test C20. |
| A1 | alta | **C8 no se puede cumplir:** la autorización se lee sin bloquear. Una revocación confirmada entre esa lectura y el commit deja salir una factura `REGLA` más. | `03-encaje-motor.md` §5, paso 2 | `SELECT … FOR SHARE` de la autorización viva en el paso 2. |
| A2 | alta | **El extracto que llega por WhatsApp se procesa como `RUTINA`, con el permiso del agente.** Contradice el dictamen 1506c9c0 (punto 5) y no se declara como excepción. | `03-encaje-motor.md` §2 | Lo que sale de un archivo subido es `PEDIDO`, con `solicitadoPor` = quien lo subió. |
| A3 | alta | **`posible_duplicado` choca con I3:** marca todo cobro del mismo total ±3 días. Con cuotas iguales, casi todo va a revisar. Y falta en el paso 5 de §4: no frena duplicados contra manuales ni abonos del estudio. | `bancos-glue.ts:477`; `cartera-abonos.ts:145` | Comparar sólo contra facturas que no están en el libro de cobros, y usar cada una una sola vez. Obligatorio en nivel 2. Test C22. |
| A4 | alta | **El CSV de MP puede facturar de menos:** repite el id en varias filas con montos netos, y la primera fija el importe. Y la liquidación de MP que entra al banco se da por facturada aunque no se haya cargado MP de ese período. | `02-diseno.md` §1.3, §2.1; I9 | Del CSV sólo se toma el id; el importe es el bruto de la operación. Sin MP cargado del período, a revisar. |
| M1 | media | **Vencimiento = cobro** queda anterior a la factura cuando la fecha se corre, y la validación de hoy lo rechaza. «Última autorizada» no ve una manual pendiente en el outbox. | `facturita-core.ts:251`; §4.1 | Vencimiento = la fecha más tardía entre el cobro y la factura. Comparar contra la última factura creada y no rechazada. |
| M2 | media | **«Achicar sin firma» no tiene dónde guardarse:** la autorización es inmutable. Y despausar un concepto vuelve a ampliar sin firma. | enmienda, AgenteAutorizacion; 03 §3.2 | Frenos en una tabla propia. Despausar cuenta como ampliar. |
| M3 | media | **Prueba de saldos:** no contempla extractos ordenados del más nuevo al más viejo. Sin columna de saldo, I12 no se cumple. | brief de la tanda 1, punto 3 | Detectar el sentido y validar por día. Sin saldo, sólo nivel 1. |
| M4 | media | **`AgentePropuesta.clave` no está definida.** | 03 §5, paso 6 | Que sea la clave del movimiento. |
| M5 | media | **Hoy cualquier `referencia` del banco se convierte en `mp:<ref>`.** | `bancos-glue.ts:744` | Usar `mp:` sólo en una cuenta de MP. |
| L1 | baja | **Citas y referencias:** `bancos-glue.ts:762` es `tenantId` (la fecha está en `:766`). 06 cita un `README.md` que no existe. `requireTenantFacturita` no se exporta. | `facturita-actions.ts:59` | Corregir. |

**Tests de carrera que faltan:** C17, C18, C20 y C22 (en la tabla); C19, el CSV de MP con varias filas del mismo id; C21, el extracto por WhatsApp; C23, un tope que baja a mitad de un lote; C24, el rechazo de ARCA frente a los contadores.

## Citas verificadas: **79 de 80**

Se abrieron una por una en el relevamiento: plugin `bancos`, `bancos-glue`, `cobros-facturados`, `emision-manual`, MP, planes, `schema.prisma`, ADR-076 y `permisos-core:33`. La única corrida es `:762`.

## Lo que quedó bien

El relevamiento es preciso (H1, H2, H5 y H6 son reales) y el libro de cobros es el árbitro correcto. La IA nunca fija importe, receptor ni concepto, ni dispara una emisión. El orden de candados coincide con el código. La excepción de ARCA está declarada. `PEDIDO` toma el permiso menor. La batería es de 300 casos con reservados. D0 a D7 traen recomendada y riesgo. Los briefs miden entre 1084 y 1642 bytes.
