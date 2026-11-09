# CH Estética · Vouchers de La Alameda y conciliación con OpenKey

Pedido del dueño (05/11/2026). CH es cliente vivo en producción: todo lo de acá es aditivo, atrás de un interruptor y sin tocar la caja.

## Objetivo
Los vecinos de La Alameda pagan (total o parcialmente) con un **voucher**: número, lote y cliente asociado. CH necesita (1) ver el número en un reporte, (2) exportarlo y (3) que cada voucher cobrado se dé de baja en **OpenKey**, el sistema del barrio, que es la **fuente de la verdad** de qué voucher sigue disponible. La integración corre una vez por día, al cierre.

## Modelo (migración aditiva, se escribe sin aplicar · Gate 2)
- **El voucher es un cobro y un medio de pago** (corrección del dueño, 05/11: «se concilia con la liquidación de OpenKey»). Se suma `VOUCHER` a `enum PaymentMethod` (`prisma/schema.prisma:47`), igual que Débito y Crédito: el `ALTER TYPE` es **IRREVERSIBLE**, así que no va en `prisma/migrations/` (el build de Vercel lo aplicaría solo) sino en el paquete `prisma/pending-gate2/CH_voucher_enum.sql`, que aplica el dueño (Gate 2). Hasta entonces el código no escribe `VOUCHER` (`sePuedeEscribirValorEnum`) y la pantalla dice «falta un paso de base de datos».
- El cobro con voucher es una fila `Collection` (medio `VOUCHER`) por el camino de cobro de turno de siempre: salda el turno, cuenta para comisiones (que restan lo pagado con voucher: `src/lib/comisiones/base.ts`) y **no entra al cajón**: el libro de caja no traduce `VOUCHER` y el cierre del día lo muestra en un renglón propio, «a cobrar a OpenKey». Lo que el voucher no cubre se cobra con los medios de siempre.
- La plata del voucher entra cuando OpenKey paga su **liquidación**: `Voucher.liquidadoEn`, `montoLiquidado`, `liquidacionRef`.
- `VoucherLote`: tenantId, numero, fecha, cantidad.
- `Voucher`: tenantId, numero, loteId, clientId, estado (`String` con CHECK: DISPONIBLE / USADO / ANULADO), appointmentId (**único**), valorCubierto, usadoEn, usadoPor, estadoOpenKey + fechaFotoOpenKey (última foto importada), bajaOpenKeyEn. Unique `(tenantId, numero)`.
- `VoucherConciliacion`: una fila por corrida (fecha, origen manual/rpa, resumen JSON).
- Interruptor del negocio **«vouchers»** (`src/cambios/interruptores.ts`, apagado por defecto, sin columna nueva): lo prende GSG cuando CH lo pide. El código tolera que la migración no esté aplicada (tabla ausente = «falta un paso de base de datos», sin 500).

## Cobro con voucher (y doble uso)
Desde el turno, con el flag prendido, se ingresa el número. Validaciones, en una sola transacción: el voucher es del tenant, está DISPONIBLE, pertenece **al cliente del turno** y la última foto de OpenKey no lo marca como usado/anulado (si OpenKey dice «usado» y el ERP no lo tiene, **no se puede usar**: OpenKey manda). Voucher de otro cliente o anulado → rechazo con mensaje claro («Este voucher es de otro vecino», «Este voucher ya fue usado en OpenKey»).
Contra el doble uso: `updateMany where {id, tenantId, estado:'DISPONIBLE', clientId}` y se exige `count === 1`; la clave `voucher:<id>` del cobro y el `collectionId` único hacen que el doble clic no cobre dos veces. El cobro y el cambio de estado van en la misma tx, con la frontera del día cerrado (DB-5).
**Anular**: se anula el cobro por el camino de anulación de siempre y el voucher vuelve a DISPONIBLE, **sólo si todavía no tiene `bajaOpenKeyEn`**. Si ya se dio de baja en OpenKey, no se devuelve desde el ERP: se resuelve con La Alameda y se anota.

## Reporte y exportación
Pantalla en el backoffice con el **número de voucher a la vista**, filtros por fecha, lote, cliente y estado, y columnas: número, lote, cliente, turno, fecha de uso, valor cubierto, estado ERP, estado OpenKey, baja en OpenKey. Exportación **CSV con BOM** (abre bien en Excel), mismas columnas y filtros que la pantalla. Es el insumo que CH manda hoy a mano a La Alameda, y lo que la RPA va a automatizar.

## Conciliación diaria (ERP vs OpenKey)
Se compara la foto de OpenKey (importación manual de su CSV/exportación en Tanda 1; lectura por RPA en Tanda 2) con lo usado en el ERP. Tres resultados:
- Usado en ERP y **disponible** en OpenKey → **falta dar de baja** (lo toma la RPA o se hace a mano).
- Usado en OpenKey **sin cobro** en el ERP → **alerta**: se cobró afuera o se usó mal; lo revisa CH.
- **Anulado** en OpenKey y usado en el ERP → **alerta**: hay un turno con descuento sin respaldo.
Y contra la **liquidación** que paga OpenKey (su CSV, columnas provisionales: número, monto, fecha, referencia): cobrado y no liquidado (con antigüedad) · liquidado sin cobro en el ERP · monto liquidado ≠ cobrado.
Cada corrida queda en `VoucherConciliacion` con el resumen; las alertas se muestran en el reporte.

## RPA (Tanda 2)
GitHub Actions programado (cron al cierre) con Playwright, credenciales de OpenKey como **secreto de GitHub** (§C: las pega el dueño, nunca se imprimen ni se commitean). Se desarrolla contra un **OpenKey simulado** hasta tener acceso real. Reglas: sólo toma vouchers `USADO` sin `bajaOpenKeyEn`; **verifica en OpenKey antes de cada baja** (si ya está dado de baja, sólo marca `bajaOpenKeyEn`); nunca baja duplicada; reintento con backoff; si falla, aviso al dueño (issue o correo) y la corrida queda registrada. Idempotente: correrla dos veces no cambia nada.

## Tandas
- **Tanda 1 (sin RPA):** modelo + flag · cobro/desaplicación con voucher en el turno · reporte + CSV · importación manual de la exportación de OpenKey para conciliar. Tests: doble uso concurrente, voucher de otro cliente, desaplicar con y sin baja, saldo del turno antes/después.
- **Tanda 2:** RPA en Actions contra OpenKey simulado, luego contra el real cuando CH consiga acceso y autorización.

## [A VALIDAR con CH y OpenKey]
- Autorización **escrita** de CH para automatizar su cuenta de OpenKey (es su usuario; sin eso no corre la RPA).
- Términos de uso de OpenKey: ¿hay API o exportación oficial? Si la hay, reemplaza al scraping. Investigación web (05/11): sería la app «OpenKey Country / OPK Country» de barrios privados (invitaciones, reservas, incidentes); no se encontró API pública, términos ni mención de vouchers, y nada confirma que La Alameda (Nordelta o Canning) la use. Las columnas del CSV de importación son **provisionales a confirmar** con una exportación real.
- Ley 25.326 (datos de vecinos): se guarda el mínimo necesario (número, lote, cliente ya existente en el ERP); nada más de OpenKey.
- Liquidación de OpenKey: frecuencia, formato del archivo (columnas) y si paga por voucher o en un total por período; si viene neta de comisión de OpenKey, el «monto distinto» se calibra con eso.
- Valor del voucher: ¿precio vecino del servicio, monto fijo por voucher, o según lote?

## Liquidación del lunes con la administración del country (regla del dueño, 08/11/2026)
Fuente: `Factory-GSG/00-ESTADO/VOUCHERS-CH-2026-11-08.md`. Quien paga el voucher es la **administración de La Alameda**, no el vecino ni OpenKey. Reemplaza a la importación del CSV de liquidación de OpenKey (la acción `importarLiquidacion` queda cerrada: dos caminos que marcan «liquidado» descuadrarían la cuenta).
- **Cuenta corriente de la administración** (`src/lib/vouchers/liquidacion-core.ts`): débitos = vouchers USADOS (derivados, no copiados: anular el cobro devuelve el voucher y el débito se va solo); créditos = `VoucherPagoAdministracion` (el pago de cada liquidación conciliada y los pagos a cuenta). Saldo = débitos − créditos; negativo = pre-pago a favor de la administración. Soporta pos-pago (lectura tomada) y pre-pago. Nunca toca el cajón ni el libro de caja.
- **Liquidación semanal** (`VoucherLiquidacion`, única por negocio y domingo): toma los vouchers usados sin liquidar hasta el domingo (los rezagados de semanas anteriores entran en la próxima). Un voucher tomado no se anula desde el turno (`voucher-en-liquidacion`; CHECK en la base). Abierta, se puede descartar.
- **Conciliación**: monto pagado + vouchers que la administración no pagó → cada voucher PAGADO (`liquidadoEn`, `montoLiquidado`) o IMPAGO (sigue en el saldo); `diferencia` = pagado − aceptado. Una sola vez (ABIERTA→CONCILIADA con `updateMany` + clave `liq:<id>`).
- **Reporte del lunes**: `/admin/vouchers/liquidacion/<id>` (imprimir/guardar PDF) y su planilla CSV. El envío lo decide CH.
- Turno con la comisión ya pagada: no se cobra con voucher (`comision-pagada`).
- Migración aditiva `20261108140000_voucher_liquidacion_semanal`. Permiso: `cash:manage`. Interruptor «vouchers» (sólo `beauty-spa`, después de publicar).
- [A CONFIRMAR] pos-pago vs pre-pago; valor del voucher (hoy: lo que cubre del servicio); numeración/validación; facturación ARCA al vecino o a la administración; si el pago de la administración se asienta en caja/banco (hoy no).
