# 04 · Plata y fiscal: invariantes y tests de carrera

> Toda factura es plata fiscal del cliente. Lo que sigue son **invariantes**: si un test de esta lista no
> existe o está rojo, nivel 2 (emitir solo) no se prende. Los tests de carrera corren en Postgres real
> (patrón `*-postgres.test.ts`, dos conexiones), nunca en Neon.

## 1. Invariantes

| # | Invariante | Quién lo garantiza (base, no sólo código) |
|---|---|---|
| **I1** | **Un movimiento, a lo sumo una factura viva.** | Índice único `CobroFacturado(tenantId, clave)` + candado por clave (`tomarClaves`) + claim `lista → emitida`. Una factura RECHAZADA no cuenta (se puede volver a emitir y la fila apunta a la nueva, regla vigente). |
| **I2** | **El mismo extracto dos veces no duplica.** | Único `ImportacionBancaria(tenantId, sha256)` (archivo) + único `MovimientoImportado(tenantId, clave)` con ordinal (movimiento). Solapes resueltos por la clave (`02-diseno.md` §3). |
| **I3** | **Dos cobros legítimos iguales dan dos facturas.** | Ordinal `#n` en la clave. Arregla H1 (hoy se pierde el segundo). |
| **I4** | **Un pago de MP, una factura**, venga por el aviso, por la conexión o por el CSV de actividad. | Clave `mp:<id de operación>` en los tres caminos; la de banco que liquida MP se clasifica «no es venta». |
| **I5** | **Lo emitido sólo se deshace con nota de crédito.** | Comprobante autorizado inmutable (test existente `comprobante-autorizado-inmutable-postgres.test.ts`). El agente no tiene la tarea `anular` (techo 3). Ningún `DELETE` sobre `Invoice` ni `CobroFacturado` en el camino del agente. |
| **I6** | **El cupo del plan no se pasa nunca**, ni con lotes en paralelo ni con manual + lote. | Candado `facturita-cupo:` y recuento **dentro** de la transacción en el camino del agente. Arregla H2 también para el producto A. |
| **I7** | **Los topes de la autorización no se pasan.** | Contador atómico `UPDATE ... WHERE monto + x <= tope` en la misma transacción que la factura. |
| **I8** | **Sin autorización viva, el agente no emite.** | La autorización se lee dentro de la transacción de emisión; disparador `irreversible` (revocar no se deshace). |
| **I9** | **El importe de la factura es el del movimiento**, al centavo. | Lo copia el código; IVA con `calcularImpuestos`; redondeos con `@/lib/dinero/redondeo`. La IA no escribe importes. |
| **I10** | **Ninguna factura sale con fecha fuera de lo que ARCA acepta.** | Fecha = cobro, o la más vieja permitida (ventana 5/10 días) y nunca anterior a la última autorizada del punto de venta y tipo. *A verificar en homologación.* |
| **I11** | **Aislamiento por negocio.** | RLS `tenant_isolation` en las tablas nuevas; FK de dos columnas `(tenantId, conceptoId)`; nada con `operatorPrisma`. |
| **I12** | **Un archivo con columnas mal leídas no emite.** | Prueba de saldos antes de proponer; si no cierra, todo a «Para revisar». |
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
| C6 | Liquidación de MP en el banco vs la venta en MP | La del banco es «no es venta»; si alguien la fuerza, `posible_duplicado`. |
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

**Determinismo:** fechas con reloj inyectado, sin `sleep`; las carreras se fuerzan con dos conexiones y un candado
de prueba (patrón `topes-carrera-postgres.test.ts` de `agentes/tanda-1`).

## 4. Fiscal: lo que hay que confirmar (contadora, provisional a confirmar)

1. **Fecha de una factura de un cobro viejo** (fuera de la ventana): ¿fecha permitida más vieja, o de hoy? (D4).
2. **Servicios:** período = el mes del cobro y vencimiento = la fecha del cobro. ¿Correcto para un abono que se
   paga adelantado?
3. **Correlatividad de fechas por punto de venta y tipo** (I10): verificar el código de rechazo en homologación.
4. **Liquidaciones de MP en el banco:** confirmar que nunca son una venta aparte (las retenciones de MP, tampoco).
5. **Umbral de identificación** vigente (`vigencias.ts`) y si el tope `importe_max_por_factura` debe estar por debajo.
6. **Retención del extracto** (Ley 25.326): propuesta 30 días sellado y después sólo la fila (como `ExtractoRecibido`).
