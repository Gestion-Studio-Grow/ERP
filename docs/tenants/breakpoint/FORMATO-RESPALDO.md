# Break Point — formato del respaldo de la jornada real (v1)

Es el archivo que se descarga desde Configuración → «Descargar respaldo», con nombre
`breakpoint-jornada-AAAA-MM-DD-HHMM.json`. Es la misma foto que se guarda en el navegador, en la clave de
localStorage `bp-jornada-v1`.

**Es el puente para migrar los datos reales del piloto al ERP** cuando el club pase al backoffice React
(ADR-054/055). La fuente de verdad del formato es `public/previews/breakpoint/club/motor.mjs`: `serializarEstado`,
`hidratarEstado` y `crearEstado`.

## Sobre

```jsonc
{
  "v": 1,                  // VERSION_ESTADO: un cambio que rompa la lectura sube este número
  "estado": { ... },       // el estado del club (abajo)
  "secuencia": 123,        // contador de ids: al volver a abrir, no se repiten
  "usuario": "u-rober",    // quién estaba usando el sistema (sólo en localStorage y en el respaldo)
  "guardado": 1760640000000 // ms epoch del último guardado
}
```

`hidratarEstado` rechaza un `v` distinto, un `estado` sin `config` ni `caja`, o que no tenga las listas
`canchas`, `usuarios`, `productos`, `reservas`, `cuentas` y `clientes`. Completa las listas que falten.

## `estado`

Los montos van en **pesos enteros**. Las fechas van como `"AAAA-MM-DD"` y los horarios como **minutos desde las
00:00 de esa fecha**: la madrugada pasa de 1440, así que la 01:00 del día que abrió es 1500. Los sellos de tiempo
son `{ fecha, min }`.

| Campo | Qué es | Campos clave |
|---|---|---|
| `config` | Reglas del club | `modo: "real"`, `configurado`, `horarios[0..6] {abre, cierra}`, `tarifas[] {nombre, desde, hasta, precioHora}`, `politica {senaPct, toleranciaMin, …}`, `cobro.alias`, `bloqueoMin`, `duracionTurno`, `paso`, `corteCaja` |
| `canchas[]` | Canchas | `id, nombre, cubierta, panoramica, estado ("ok"\|"mantenimiento")` |
| `usuarios[]` | Accesos | `id, nombre, rol ("duenio"\|"recepcion"), pin (2 dígitos), activo` — **el PIN va en el archivo: el respaldo se guarda como dato sensible** |
| `clientes[]` | Fichas | `id, nombre, tel, nivel, strikes, monedero` (créditos), `deuda` (cuenta corriente), `cc {habilitada, limite}`, `movCC[] {fecha, min, concepto, importe, saldo}`, `fiados[] {monto, aprobo, usado}`, `aceptaNovedades`, `activo` |
| `reservas[]` | Turnos (la cuenta de la CANCHA) | `id, canchaId, fecha, inicio, duracion, tipo, estado ("reservada"\|"en_cancha"\|"finalizada"\|"cancelada"\|"no_show"\|"suspendida"), clienteId, titular, precio, sena {monto, pagada}, pagos[] {medio, monto, jugador, fecha, min}, jugadores[] {nombre, clienteId, pagado, saldado, pagadoPor, aCargoDe}, origen, ref, checkIn, cierre, aCuentaCorriente` |
| `cuentas[]` | Cuentas de cargos (buffet) | `id, clienteId, titular, reservaId, jugadorIdx, estado ("abierta"\|"cerrada"), items[] {productoId, nombre, cant, precioUnit, manual, alquiler, devuelto, transferidoDe}, pagos[] {medio, monto, pagadoPor?}, aCargoDe` (id de la cuenta que paga), `aCuentaCorriente` |
| `productos[]` | Catálogo y stock | `id, nombre, categoria, precio, costo, stock (null = plato sin stock), minimo, codigo, codigoExterno, alquiler, plato, tienda, activo` |
| `caja` | Caja de 12 a 12 | `fondo`, `movimientos[] {id, tipo ("ingreso"\|"egreso"), medio, monto, concepto, reservaId, usuario, fecha, min, caja}` (`caja` = el día de caja), `cierres[] {dia, responsable, fecha, min, esperado, contado, diferencia, ingresos, egresos}` |
| `novedades[]` | Pedidos de crédito | `id, tipo ("cc"\|"fiado"), clienteId, cuentaId, monto, limite, pidio, estado, resolvio, porCodigo, intentos, bloqueadoHasta` |
| `pedidos[]` | Tienda | `id, codigo ("T-XXXX"), items[] {productoId, nombre, cant, precioUnit}, total, nombre, tel, origen ("web"\|"whatsapp"), estado ("pendiente"\|"entregado"\|"a_cuenta"\|"cancelado"), cobrado {medio, monto}` |
| `difusiones[]` | Novedades por WhatsApp | `id, tipo, titulo, texto, audiencia, destinatarios[] (clienteId), enviados[] (clienteId), autor` |
| `contenido[]` | Calendario de redes | `id, fecha, hora, canal, titulo, texto, estado, autor` |
| `proveedores[]`, `remitos[]`, `pagosProveedor[]` | Proveedores y su cuenta corriente | ver `registrarRemito`, `pagarProveedor` |
| `fijos[]`, `bloqueos[]`, `espera[]`, `solicitudesAcceso[]`, `luces`, `clima`, `log[]` | Turnos fijos, bloqueos, lista de espera, pedidos de acceso, luces, plan lluvia, registro | — |

## Medios de pago

Los medios de pago son `efectivo`, `mercadopago`, `transferencia`, `debito` y `monedero` (créditos del cliente:
**no** entra a la caja).

## Para la migración

- Cobrado de una cancha: `Σ reservas[].pagos[].monto`.
- Cobrado de los cargos: `Σ cuentas[].pagos[].monto`.
- La caja es la suma de los dos sin `monedero`, más lo cobrado en la tienda y la venta rápida, que entran como
  cuentas (`reservaId` `tienda-…` o `mostrador-…`).
- Lo que se le debe a un cliente o lo que debe: `clientes[].deuda` con su detalle en `movCC`.
- Los PIN de 2 dígitos **no** se migran como credenciales: en el ERP cada usuario entra con login.

— Elaborado por GSG
