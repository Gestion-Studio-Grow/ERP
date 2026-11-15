# 04 · Plata y fiscal: invariantes y tests de carrera

> Toda factura es plata fiscal del cliente. Lo que sigue son **invariantes**: si un test de esta lista no
> existe o está rojo, nivel 2 (emitir solo) no se prende. Los tests de carrera corren en Postgres real
> (patrón `*-postgres.test.ts`, dos conexiones), nunca en Neon.

## 1. Invariantes

| # | Invariante | Quién lo garantiza (base, no sólo código) |
|---|---|---|
| **I1** | **Un movimiento, a lo sumo una factura viva.** | Índice único `CobroFacturado(tenantId, clave)` + candado por clave (`tomarClaves`) + claim `lista → emitida`. Una factura RECHAZADA no cuenta (se puede volver a emitir y la fila apunta a la nueva, regla vigente). |
| **I2** | **El mismo extracto dos veces no duplica** (ni en otro formato, ni pasado por Excel, ni solapado). | Único `ImportacionBancaria(tenantId, sha256)` (archivo) + **cobertura por día**: un día ya cargado sólo se acepta si coincide (saldo de cierre o conjunto de importes con signo); si no, o si era parcial, el día entero va a revisar, nunca solo; control de re-fechado ±3 días; filas viejas cuentan como cobertura y su hash viejo se busca en el libro (`02-diseno.md` §3). En la base, `hash = clave` sobre el único `MovimientoImportado(tenantId, hash)` existente. |
| **I3** | **Dos cobros legítimos iguales dan dos facturas.** | Ordinal `#n` en la clave y deduplicación de `reglas.ts` por clave (B2). Arregla H1 (hoy se pierde el segundo). Si el día ya estaba cargado o era parcial, el día va a revisar: no se pierde. |
| **I4** | **Un pago de MP, una factura, por el bruto**, venga por el aviso, por la conexión o por el CSV de actividad. | Clave `mp:<id de operación>` en los tres caminos (sólo en cuentas de MP); del CSV sólo el id, importe bruto de la operación. En Factoque, una sola vía de emisión automática (03 §5.1). La liquidación de MP en el banco es «no es venta» sólo con MP del período cargado. |
| **I5** | **Lo emitido sólo se deshace con nota de crédito.** | Comprobante autorizado inmutable (test existente `comprobante-autorizado-inmutable-postgres.test.ts`). El agente no tiene la tarea `anular` (techo 3). Ningún `DELETE` sobre `Invoice` ni `CobroFacturado` en el camino del agente. |
| **I6** | **El cupo del plan no se pasa nunca**, ni con lotes en paralelo ni con manual + lote. | Candado `facturita-cupo:` y recuento **dentro** de la transacción en el camino del agente. Arregla H2 también para el producto A. |
| **I7** | **Los topes de la autorización no se pasan.** | Contador atómico `UPDATE ... WHERE monto + x <= tope` en la misma transacción que la factura. |
| **I8** | **Sin autorización viva, el agente no emite.** | La autorización se lee dentro de la transacción de emisión con `FOR SHARE`, junto con los frenos; disparador `irreversible` (revocar no se deshace). |
| **I9** | **El importe de la factura es el del movimiento**, al centavo. | Lo copia el código; IVA con `calcularImpuestos`; redondeos con `@/lib/dinero/redondeo`. La IA no escribe importes. |
| **I10** | **Ninguna factura sale con fecha fuera de lo que ARCA acepta.** | Fecha = cobro, o la más vieja permitida (ventana 5/10 días) y nunca anterior a la de la última factura creada y no rechazada del punto de venta y tipo (con las pendientes del outbox); con servicios, vencimiento = máx(cobro, factura). *A verificar en homologación.* |
| **I11** | **Aislamiento por negocio.** | RLS `tenant_isolation` en las tablas nuevas; FK de dos columnas `(tenantId, conceptoId)`; nada con `operatorPrisma`. |
| **I12** | **Un archivo con columnas mal leídas no emite.** | Prueba de saldos por día y en el sentido del archivo; si no cierra, todo a «Para revisar». Un archivo sin saldo no emite solo (nivel 1). |
| **I13** | **Debajo del umbral de identificación, solo; arriba, persona.** | `UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL` (vigencias) y el tope `importe_max_por_factura` por debajo. |

## 2. Orden de candados (anti abrazo mortal)

`lote-factoque:<t>` → `facturita-cupo:<t>` → `cobro-facturado:<t>:<clave>` (ordenadas).
La emisión manual ya es `facturita-emision:<t>:<clave>` → `facturita-cupo:<t>`; la anulación toma `facturita-cupo:<t>`;
los abonos, `lote-abonos` → `facturita-cupo`. **Ningún camino puede tomar `cobro-facturado` antes que
`facturita-cupo`**: hoy el aviso de MP y el extracto del producto A toman `cobro-facturado` sin `facturita-cupo`.
Si se les suma el cupo (arreglo de H2), tiene que ir **antes**. Lo verifica el test C15.

## 3. Tests de carrera (listados; los escribe la tanda 2 y la certificación guarda reservados)

| # | Carrera | Esperado |
|---|---|---|
| C1 | El mismo archivo subido dos veces a la vez | Una importación; la otra «ya lo subiste»; movimientos una vez. |
| C2 | Dos extractos que se solapan, subidos a la vez | Cada movimiento una vez (por clave). |
| C3 | Dos lotes de emisión a la vez (rutina + persona) | Cada movimiento ≤ 1 factura viva; cupo intacto. |
| C4 | Lote vs factura manual con el cupo en `tope − 1` | Total del mes ≤ tope; exactamente una de las dos pasa el último lugar. |
| C5 | Aviso de MP (modo automático) vs fila del CSV de MP de la misma operación | Una factura; la otra queda vinculada. |
| C6 | Liquidación de MP en el banco vs la venta en MP | Con MP del período cargado, la del banco es «no es venta»; sin MP cargado, `falta_mp`. Nunca dos facturas. |
| C7 | Lote vs anulación (nota de crédito) en el mismo negocio | La nota no ocupa cupo; el recuento del lote nunca ve una nota a medio crear. |
| C8 | Revocar la autorización a mitad de un lote | Ninguna factura con `modo = REGLA` después del commit de la revocación. |
| C9 | Editar un concepto (versión nueva) a mitad de un lote | Las propuestas de la versión vieja vuelven a «Para revisar» (`concepto_cambio`); ninguna sale con la regla nueva sin firmar. |
| C10 | ARCA rechaza y se vuelve a emitir mientras corre otro lote | Nunca dos facturas vivas del mismo cobro; el libro apunta a la nueva. |
| C11 | Dos cobros legítimos idénticos en el mismo día; después, el mismo archivo otra vez | Dos facturas; la segunda subida, cero. |
| C12 | Dos lotes a la vez con los contadores de la autorización cerca del tope (por día y por importe) | Nunca pasan el tope. |
| C13 | Factura manual con fecha de hoy autorizada entre el armado y la emisión del lote | Las del lote salen con fecha ≥ la de esa factura. |
| C14 | El plan vence (o baja) a mitad del mes con un lote corriendo | Rige el cupo nuevo desde la transacción siguiente. |
| C15 | Aviso de MP + lote + manual, los tres a la vez | Sin abrazo mortal (timeout del test = falla); orden de candados del §2. |
| C16 | Negocio A sube un extracto con una contraparte que es regla del negocio B | No coincide; RLS probada con el rol de la app (no con el dueño de las tablas). |
| C17 | El mismo período en dos formatos (leyenda recortada, referencia en notación científica de Excel) | Cero facturas nuevas en la segunda subida. |
| C18 | Primero un archivo que corta el día a la mañana; después el día completo con un cobro igual a la tarde | Día parcial → `dia_distinto`: ni perdido ni duplicado. |
| C19 | CSV de MP con varias filas del mismo id (cobro, comisión, retención) | Una factura por el bruto; si no cierra, a revisar. |
| C20 | Negocio Factoque Gratis con MP en modo `automatico` y 5 facturas ya emitidas | Ninguna factura más por `mercadopago-auto`; el pago entra como movimiento y el lote lo frena por cupo (5). |
| C21 | Extracto por WhatsApp de un teléfono que no es de un usuario con permiso | Propuestas en nivel 1; nada sale solo. |
| C22 | Dos cuotas iguales en días seguidos y una factura manual del mismo importe | Una sola va a `posible_duplicado`; la otra sigue. Las cuotas no se marcan entre sí. |
| C23 | Un freno (tope menor) cargado a mitad de un lote | Rige desde la transacción siguiente. |
| C24 | ARCA rechaza una factura emitida por el agente | Los contadores de la autorización devuelven el lugar (o se cuentan sólo las no rechazadas); el cobro puede volver a emitirse una vez. |
| C25 | El mismo cobro fechado D en un exporte y D+1 en otro | El segundo va a `posible_repetido`; nunca sale solo. |
| C26 | El archivo A corta el día D a la mañana; el B empieza D a la tarde con un cobro del mismo importe | Día parcial → `dia_distinto`; el cobro de la tarde no se pierde. |
| C27 | Dos cuentas del mismo banco y últimos 4 (pesos y dólares); un débito y un crédito del mismo importe | No se confunden (cuenta y signo en la base); la de dólares a revisar. |
| C28 | Negocio con filas del formato viejo (producto A) sube el mismo período con el formato nuevo | Días con filas viejas a revisar; un cobro con `banco:<hash viejo>` en el libro es «ya facturado». |

**Determinismo:** fechas con reloj inyectado, sin `sleep`; las carreras se fuerzan con dos conexiones y un candado
de prueba (patrón `topes-carrera-postgres.test.ts` de `agentes/tanda-1`).

## 4. Fiscal: lo que hay que confirmar (contadora, provisional a confirmar)

1. **Fecha de una factura de un cobro viejo** (fuera de la ventana): ¿fecha permitida más vieja, o de hoy? (D4).
2. **Servicios:** período = el mes del cobro y vencimiento = la más tardía entre el cobro y la factura. ¿Correcto para un abono que se
   paga adelantado?
3. **Correlatividad de fechas por punto de venta y tipo** (I10): verificar el código de rechazo en homologación.
4. **Liquidaciones de MP en el banco:** confirmar que nunca son una venta aparte (las retenciones de MP, tampoco).
5. **Umbral de identificación** vigente (`vigencias.ts`) y si el tope `importe_max_por_factura` debe estar por debajo.
6. **Retención del extracto** (Ley 25.326): propuesta 30 días sellado y después sólo la fila (como `ExtractoRecibido`).
