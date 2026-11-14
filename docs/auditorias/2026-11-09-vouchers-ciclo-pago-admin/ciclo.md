# Ciclo de vida del pago de la administración (vuelta 4, HEAD 02cfece) — certificador

Evidencia: v5-ciclo-postgres.test.ts (8 casos: 6 fallan = hallazgo) · v3/v4 13/13 · zona 170/170 · tsc 0.
Estados del pago: registrado pendiente (MP/OTRO→MP | cheque A_DEPOSITAR) → acreditado vía mp (enganchado) | a mano | cheque confirmado (a mano) → cheque rechazado. No existe baja/anulación del pago (sin delete/update de VoucherPagoAdministracion; descartarLiquidacion sólo ABIERTA, sin pago).

| # | Orden de eventos | Resultado | Sev | Prueba |
|---|---|---|---|---|
| 1 | registro MP → crédito (extracto/aviso) → claim/clasificador | revisión, no factura | OK | no-facturar-postgres, V4-1 |
| 2 | crédito por AVISO → registro del pago (orden natural de una transferencia) | se factura; al confirmar va «a mano» sin avisar que hay NC que hacer | ALTA | V5-1; mercadopago-auto.ts:250 lo admite |
| 3 | clasificador (candado, suelta) → registro → facturarPagoMP | se factura (mismo caso que 2: el candado no cubre la emisión) | ALTA (=2) | análisis ingest.ts:102-114 |
| 4 | cheque pendiente → crédito por AVISO → confirmación del depósito | se factura | ALTA | V5-2; liquidacion-repo.ts:1051 `destino !== "MP"` |
| 5 | cheque → confirmación a mano → crédito (extracto o aviso) | revisión | OK | V4-3, ATQ-C |
| 6 | registro → enganche con fila del aviso → mismo crédito por extracto CSV de MP (otra fila, otro hash) | el gemelo se factura | ALTA | V5-3; liquidacion-repo.ts:1043 `a?.movimientoId → continue` |
| 7 | enganche → re-proceso del mapeo de esa importación (borra y recrea) | la fila recreada se factura | ALTA | V5-4; bancos-actions.ts:232 + guard sólo «emitida» :341 |
| 8 | pago 1 fila, la administración transfiere en 2 partes | las partes se facturan | ALTA (límite del criterio al centavo) | V5-5 |
| 9 | crédito «auto» de hace 3 días, pago registrado con fecha de hoy | se factura (DIAS_ANTES=1) | ALTA (límite de ventana) | V5-6; acreditacion-core.ts:121 |
| 10 | transferencia > 10 días después de la fecha del pago | se factura | límite | acreditacion-core.ts:122 |
| 11 | dos claims del mismo movimiento | uno solo (updateMany condicionado) | OK | bancos-glue.ts:754 |
| 12 | claim vs registro / claim vs confirmación | en fila por candado | OK | no-facturar-postgres:347, V4-4 |
| 13 | aprobar venta vs confirmar acreditación a la vez | updates condicionados; uno pierde | OK | bancos-actions.ts:466, liquidacion-repo.ts:1145 |
| 14 | re-aviso / sincronizar tras «venta-confirmada» | respeta la marca; clave mp:<id> evita doble factura | OK | ATQ-A |
| 15 | re-aviso tras enganche o revisión | yaProcesado (terminal) lo saltea | OK | mercadopago-auto.ts:86 |
| 16 | re-importación del mismo extracto | hash único, skipDuplicates | OK | bancos-actions.ts:255 |
| 17 | 2 pagos y 2 créditos del mismo monto, confirmados sin elegir | nada se factura; créditos quedan en revisión con una instrucción imposible («confirmá la acreditación»); salida: marcar no facturable | BAJA | V5-7 |
| 18 | acreditado a mano → venta legítima del mismo monto dentro de conf+10 | revisión; billing:manage la aprueba | BAJA | V4-6 |
| 19 | venta legítima igual a un pago pendiente | revisión → aprobación → factura | BAJA | no-facturar-postgres |
| 20 | enganchado → «marcar no facturable» pisa la marca → otro pago igual | no se re-engancha (usados) | OK | V5-8 |
| 21 | OTRO→MP / OTRO→cajón | frena / no frena | OK | ATQ-D |
| 22 | permisos (recepción) y otro negocio | no aprueban; candado y consultas por tenantId | OK | ATQ-E, V4-7 |
| 23 | cheque rechazado tras confirmar | la acreditación sigue frenando (lado seguro) | OK | análisis liquidacion-repo.ts:1340 |
| 24 | transferencia de la administración a una cuenta BANCARIA | se factura (sólo origen mercadopago, liquidacion-repo.ts:1026) | límite (supuesto TRANSFERENCIA = MP) | análisis |

Arreglos sugeridos (de una vez):
- 2/3: frenar créditos MP iguales al total (o saldo) de una liquidación ABIERTA del negocio; y al confirmar, si hay un crédito del mismo monto en la ventana ya FACTURADO, decirlo («hacé nota de crédito»).
- 4: cheque pendiente frena de su fecha a +45 (salida: aprobar como venta).
- 6: un pago enganchado frena también otra fila con la misma referencia (o monto+fecha) del enganchado; o deduplicar el CSV contra `mp:<referencia>` al importar.
- 7: confirmarMapeoAction rechaza si hay filas con MARCA_ENGANCHE/venta-confirmada/revisión de vouchers; o `movimientoId` inexistente se trata como «a mano».
- 8/9: ventana del lado MP más generosa (DIAS_ANTES 1 → 10); partes: decisión del dueño.
- 17: motivo que diga «ya acreditado: marcalo no facturable».
