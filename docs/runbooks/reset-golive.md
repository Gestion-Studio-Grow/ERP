# Reseteo de go-live: borrar los datos de prueba de un negocio

Después del día de pruebas reales, cada negocio arranca limpio: se borran sus ventas, turnos, caja y
mensajes de prueba, y se conserva todo lo que el negocio configuró. Lo decidió el dueño en
`docs/agent/DECISIONS.md` D7.5, opción A: se pueden borrar ventas, turnos y caja de prueba; nunca
facturas con CAE ni días de caja cerrados; con respaldo previo y autorización del dueño cada vez.

Script: `scripts/reset-golive.ts` (`npm run reset-golive`). La regla de qué se borra está en
`src/lib/reset-golive.ts` y tiene tests (`reset-golive.test.ts`, y `reset-golive-postgres.test.ts`
contra una base de prueba con RLS).

## Antes de empezar

- **Autorización del dueño, por escrito, para cada negocio.** Toca datos de producción.
- **Que nadie use el sistema** de ese negocio mientras corre: ni mostrador, ni reservas online.
- **La conexión correcta:** `DATABASE_URL` con el rol `app_rls` y la conexión **directa** de Neon
  (la cadena **sin** `-pooler` en el host), y `RLS_ENFORCEMENT=on`. Con el pooler o con el dueño de
  las tablas, el script se niega a borrar.

## Pasos

1. **Respaldo en Neon.** Consola de Neon → Branches → *Create branch* desde `main`, con nombre
   `respaldo-pre-golive-AAAA-MM-DD`. El script **no** lo hace. Sin ese branch, lo borrado no vuelve.
2. **Prueba sin borrar** (es lo que hace por defecto):
   ```
   npm run reset-golive -- --tenant beauty-spa
   ```
   Muestra, tabla por tabla y en el orden en que borraría, cuántas filas saca; qué conserva y por qué;
   los comprobantes con CAE; los cupones que vuelven a cero; los ajustes de stock que asentaría.
3. **Revisar** la salida, sobre todo el bloque *Para revisar antes de aplicar*:
   - *Turnos futuros que se borran:* si alguno es de un cliente real, sumá `--conservar-futuro`
     (conserva los turnos que todavía no pasaron, con su pago, y los bloqueos de agenda vigentes).
   - *Comprobantes pendientes sin CAE:* antes de borrarlos, confirmá en ARCA el último número
     autorizado de cada punto de venta, para descartar que alguno haya quedado autorizado allá.
   - *Días cerrados:* lo que quedó en un día de caja cerrado no se borra (opción A).
   - Si querés borrar también los clientes cargados durante la prueba:
     `--clientes-creados-desde 2026-10-17T00:00:00-03:00`. Nunca borra un cliente con factura con CAE,
     con algo que se conserva, ni con datos de taller o inmobiliaria.
4. **Aplicar, un negocio por vez**, repitiendo el slug:
   ```
   npm run reset-golive -- --tenant beauty-spa --apply --confirmar beauty-spa
   ```
   Corre en una sola transacción. Si un paso borra una cantidad distinta de la planificada, o si al
   final la prueba repetida no da cero, vuelve todo atrás y no borra nada.
5. **Comprobar:** correr otra vez el paso 2. Tiene que decir `TOTAL 0`. Mirar el negocio en el panel
   (agenda vacía, catálogo y servicios intactos).
6. **Corte inicial de caja**, si el negocio maneja caja y todavía no lo hizo: con el arqueo real del
   cajón, `scripts/corte-inicial.ts` (ver `docs/producto/corte-inicial-caja.md`). Si ya tenía corte,
   se conserva tal cual.
7. Repetir del paso 2 para el siguiente negocio. Al terminar, el branch de respaldo puede quedar unos
   días y después borrarse desde la consola de Neon.

## Qué borra (en este orden)

Envíos de comprobantes → comprobantes sin CAE (primero las notas) → eventos de integración → outbox →
mensajes y conversaciones de WhatsApp → extractos bancarios importados → leads de campañas → lista de
espera → reseñas → movimientos de caja → turnos de caja → cobros → pagos → movimientos de stock de
venta, consumo y compra → compras de stock → cheques y cuentas a pagar → cuentas a cobrar (fiado) →
ítems de pedidos → pedidos → turnos → liquidaciones de comisiones → bloqueos de agenda → clientes
(sólo con la opción). Los cupones vuelven a cero usos (o a los usos de lo que se conserva).

## Qué NO hace

- **No toca los maestros:** negocio, credenciales fiscales, ajustes, usuarios, servicios, categorías,
  productos y precios, profesionales, horarios, comisiones, boxes, recursos, plantillas, proveedores,
  reglas de banco, integraciones y sus credenciales, cupones (salvo el contador de usos).
- **No borra comprobantes con CAE, y tampoco su venta.** Un CAE es un hecho fiscal: se anula con
  nota de crédito desde la venta, por el circuito normal. El pedido o turno, su caja y sus cobros
  quedan.
- **No borra días de caja cerrados** (corte inicial o cierre diario), ni el histórico importado de la
  planilla, ni el corte inicial.
- **No borra el registro de auditoría.** Agrega una fila (`operator:reset-golive`) con lo borrado.
- **No cambia el stock.** `Product.stock` queda como está (es el stock contado). Para que el
  historial lo explique, asienta un AJUSTE por producto con la diferencia. Los ajustes y el stock
  inicial que ya había se conservan.
- **No borra clientes** salvo que se pida con `--clientes-creados-desde`.
- **No hace el respaldo en Neon, no hace TRUNCATE, no toca otros negocios** y no corre migraciones.
- **No toca taller ni inmobiliaria** (ninguno de los negocios de hoy los usa).

## Stock

`--stock recalcular` (devolver al stock lo que vendieron las pruebas) **no está implementado a
propósito**: pisaría un conteo físico hecho durante la prueba y arrastraría errores de coma flotante.
Si el dueño lo necesita, lo correcto es recontar y cargar el recuento como ajuste desde el panel.

— Elaborado por GSG
