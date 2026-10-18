# CH Estética — cómo se factura un turno con saldo (para decidir con la contadora)

**Estado:** el cambio está hecho y probado en la rama `claude/uat-1610-ch-tests` (commits `13febad0` y `8dbd047f`),
**sin publicar**. Hoy en producción sigue el comportamiento de abajo («Hoy»). Se publica cuando la contadora elija.

## El problema (hoy, en producción)

Cuando recepción termina un turno y elige «dejar saldo a cobrar», el sistema factura **sólo lo cobrado hasta ese
momento** (por ejemplo, la seña). Cuando después entra el saldo, **ese saldo no se factura nunca**
(`src/lib/invoice-from-appointment.ts:79-82`).

Ejemplo: servicio de $40.000, seña de $10.000. Hoy sale una factura por $10.000 y los $30.000 restantes quedan sin
comprobante.

## Lo que hace el cambio preparado

- Si al terminar el turno queda saldo, **la factura espera**.
- Cuando el turno queda saldado, sale **una sola factura por el total cobrado** ($40.000 en el ejemplo).
- Si el saldo se da de baja (no se va a cobrar), sale una factura sólo por lo que sí se cobró.
- Sin plata cobrada no se factura nada.
- Los turnos ya facturados antes del cambio no se tocan.

## La pregunta para la contadora

La Ley de IVA (art. 5 inc. b) dice que, en las prestaciones de servicios, el hecho imponible nace al terminar la
prestación **o** al percibir el precio, total o parcialmente, lo que ocurra primero. Con esa regla, cobrar la seña
antes del servicio podría hacer nacer la obligación por ese monto **en ese momento**.

El cambio preparado **demora la factura de la seña hasta que el turno se salda**. Eso es lo que tiene que validar.
Hay dos caminos:

| Opción | Cómo factura | Qué implica |
|---|---|---|
| **A** (la preparada) | Una factura por el total cuando el turno queda saldado | Sale ya, sin cambios en la base. Demora la factura de la seña. |
| **B** | Una factura por la seña al cobrarla y otra por el saldo al cobrarlo | Necesita un cambio en la base (hoy hay un comprobante por turno). Se prepara y aplica con OK del dueño. |

**Decisión de la contadora:** A / B / otra. Con su respuesta se publica A, o se prepara B.

— Elaborado por GSG
