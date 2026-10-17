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
| `archivo` (opcional) | Resumen de lo que ya se archivó (abajo). Un estado que nunca archivó **no lo tiene** | `hasta`, `dias[]`, `clientes{}`, `anexos[]` |

## `archivo`: lo que queda de los días archivados

Lo agrega `archivarDiasCerrados` (Configuración → «Archivar días cerrados»). Es un **cambio aditivo**: `v` sigue en 1,
un respaldo sin `archivo` se lee igual que siempre y `hidratarEstado` descarta un `archivo` roto en vez de rechazar el
respaldo.

```jsonc
"archivo": {
  "hasta": "2026-09-26",          // se archivó todo lo cerrado hasta este día (inclusive)
  "dias": [{                      // un renglón por día archivado
    "dia": "2026-09-26",
    "turnos": 41, "faltas": 1, "cancelados": 2,   // por la FECHA del turno
    "vendidoCanchas": 1722000,                    // Σ precio de los turnos jugados
    "cobradoCanchas": 1680000, "cobradoCuentas": 512000, "monedero": 42000, // por el DÍA DE CAJA del cobro
    "ingresosCaja": 2192000, "egresosCaja": 8500, "movimientos": 190,      // por la caja del movimiento
    "cuentas": 120, "pedidos": 2
  }],
  "clientes": { "cl12": { "jugados": 9, "ultima": "2026-09-25" } }, // turnos jugados como titular y último día que jugó
  "anexos": [{ "desde": "2026-09-01", "hasta": "2026-09-26", "fecha": "2026-10-17", "min": 1470, "por": "Majo", "conteos": { … } }]
}
```

`clientes` sirve para que la seña de la web («turnos de confianza») y las audiencias de las novedades («los que
jugaron en 30 días», «los que no vienen hace un mes») sigan contando lo archivado.

En la cuenta corriente de cada cliente, los movimientos archivados se reemplazan por **una** línea
`{ concepto: "Saldo anterior (…)", importe, saldo, saldoAnterior: true }` con la misma suma y el mismo saldo: la
`deuda` no cambia y `Σ movCC[].importe` sigue dando la deuda.

## El anexo (`breakpoint-archivo-AAAA-MM-DD.json`)

Lo que sale del estado al archivar se descarga en un archivo aparte, **autocontenido**: es el registro histórico y el
puente para la migración al ERP. Junto con él se descarga un respaldo completo de antes de archivar.

```jsonc
{
  "v": 1, "tipo": "anexo-jornada", "club": "Break Point Pádel",
  "desde": "2026-09-01", "hasta": "2026-09-26",
  "generado": { "fecha": "2026-10-17", "min": 1470 }, "por": "Majo",
  "corteCaja": 720,                       // para calcular el día de caja sin el estado
  "resumen": [ …mismos renglones que archivo.dias, sólo de este anexo… ],
  "cierres": [ …copia de los cierres de caja de esos días (también quedan en el estado)… ],
  "clientes": [{ "id", "nombre" }], "canchas": [{ "id", "nombre" }], // para leerlo sin el estado (sin teléfonos)
  "reservas": [], "cuentas": [], "movimientos": [], "pedidos": [], "novedades": [], "difusiones": [],
  "solicitudesAcceso": [], "espera": [], "bloqueos": [], "log": [],  // con el mismo formato que en el estado
  "movCC":  [{ "clienteId", "nombre", "movimientos": [] }],            // los movimientos de cuenta corriente que salieron
  "fiados": [{ "clienteId", "nombre", "fiados": [] }]                  // los fiados ya usados
}
```

**Qué se archiva:** sólo lo **terminado** de días hasta `hasta` con la **caja cerrada**: turnos finalizados,
cancelados o con falta (y suspendidos sin plata) con todos sus cobros en cajas cerradas; cuentas de cargos cerradas;
los movimientos de las cajas cerradas; pedidos de la tienda entregados, cancelados o a cuenta; pedidos de crédito ya
resueltos; difusiones viejas (la última se queda); registro, lista de espera y bloqueos de esos días; movimientos
viejos de cuenta corriente y fiados usados. Un cobro hecho **después** de cerrar su caja entró en la caja siguiente:
esa también tiene que estar cerrada.

**Qué NO se archiva nunca:** turnos reservados o en cancha, con seña en suspenso, con plata para devolver o con una
falta sin cobrar; cuentas abiertas (y el turno de una mesa que sigue); lo de cajas sin cerrar; la última semana; y lo
maestro: clientes con sus saldos (deuda, créditos, faltas, cuenta corriente), productos y stock, usuarios y PIN,
canchas, proveedores con sus remitos y pagos, turnos fijos, configuración y calendario de redes. Los `cierres` de caja
se quedan.

**Invariante (testeado):** día por día, la plata del estado antes de archivar = la del estado archivado + la del
anexo, al peso (`plataPorDia`). Archivar dos veces lo mismo no cambia nada.

**Para la migración:** se cargan los anexos (en orden de `hasta`) y después el respaldo de la jornada; juntos tienen
todo. El resumen `archivo.dias` sirve para verificar los totales de cada día sin abrir los anexos.

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
