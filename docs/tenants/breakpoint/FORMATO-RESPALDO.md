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
| `usuarios[]` | Accesos | `id, nombre, rol ("duenio"\|"recepcion"), pin (dueño 4 dígitos, recepción 2; un dueño del piloto puede tener todavía uno de 2 y se lee igual), activo` — **el PIN va en el archivo: el respaldo se guarda como dato sensible** |
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
| `archivo` (opcional) | Resumen de lo que ya se archivó (abajo). Un estado que nunca archivó **no lo tiene** | `hasta`, `dias[]`, `clientes{}`, `anexos[]`, `codigos{}` |

## `archivo`: lo que queda de los días archivados

Lo agrega `archivarDiasCerrados` (Configuración → «Archivar días cerrados»). Es un **cambio aditivo**: `v` sigue en 1,
un respaldo sin `archivo` se lee igual que siempre y `hidratarEstado` descarta un `archivo` roto en vez de rechazar el
respaldo. Renglón por renglón: un día o un anexo sin fecha `AAAA-MM-DD` se descarta, un número que no es número queda en
0 y un código que no tiene la forma `T-XXXX` / `BP-XXXX` se va (la foto no se rechaza por eso).

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
  "anexos": [{ "desde": "2026-09-01", "hasta": "2026-09-26", "fecha": "2026-10-17", "min": 1470, "por": "Majo", "conteos": { … } }],
  "codigos": { "pedidos": ["T-YV23"], "refs": ["BP-K7QM"] } // códigos de pedidos y de señas que salieron al archivo
}
```

`codigos` sirve para que un código nuevo de pedido o de seña no repita uno archivado y para que el WhatsApp de un pedido
ya entregado y archivado no se vuelva a cargar.

`clientes` sirve para que la seña de la web («turnos de confianza») y las audiencias de las novedades («los que
jugaron en 30 días», «los que no vienen hace un mes») sigan contando lo archivado.

En la cuenta corriente de cada cliente, los movimientos archivados se reemplazan por **una** línea
`{ concepto: "Saldo anterior (…)", importe, saldo, saldoAnterior: true }` con la misma suma y el mismo saldo: la
`deuda` no cambia y `Σ movCC[].importe` sigue dando la deuda.

## El anexo (`breakpoint-archivo-AAAA-MM-DD.json`)

Lo que sale del estado al archivar es un anexo **autocontenido**: es el registro histórico y el puente para la migración
al ERP. No se descarga solo: va adentro del archivo para archivar (abajo), junto con el respaldo completo de antes de
archivar.

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

## El archivo para archivar (`breakpoint-respaldo-y-archivo-AAAA-MM-DD-HHMM.json`)

Archivar es en **dos pasos**, y nada se achica sin el paso 2:

1. **«Descargar el respaldo para archivar»** (PIN de dueño): baja **un solo** archivo (el navegador suele frenar la
   segunda descarga del mismo clic) con el respaldo completo de ahora y el anexo de los días que salen.
2. **«Ya lo guardé: achicar»** (habilitado sólo después del paso 1, PIN de dueño): el dueño **elige** el archivo que
   bajó. Se recalcula lo que se va a archivar con el estado de ese momento y se compara: mismo `anexo.hasta`, mismos
   `conteos` y misma `huella`. También se controla el respaldo de adentro (el que sirve para «Restaurar»): su
   `huellaRespaldo` tiene que coincidir, tiene que abrir, y archivado hasta el mismo día tiene que dar ese mismo anexo.
   Si coincide todo, se achica. Si el archivo está dañado o es otro, no pasa nada. Si es el del
   paso 1 pero algo de esos días cambió en el medio, pide descargar de nuevo.

```jsonc
{
  "v": 1, "tipo": "respaldo-y-archivo", "club": "Break Point Pádel",
  "hasta": "2026-09-26",                 // = anexo.hasta
  "conteos": { "reservas": 595, … },     // los mismos que quedan en archivo.anexos[].conteos
  "huella": "1a2b3c4d5e6f7a8b",          // huellaAnexo(anexo): dos FNV-1a de 32 bits (16 hex) del anexo SIN `generado` ni `por`
  "huellaRespaldo": "9f8e7d6c5b4a3f2e",  // huellaRespaldo(respaldo): lo mismo sobre el respaldo completo
  "respaldo": { "v": 1, "estado": { … }, "secuencia": 123, "usuario": "u-rober", "guardado": 1760640000000 }, // el sobre v1 de siempre
  "anexo": { "v": 1, "tipo": "anexo-jornada", … }                                                         // el anexo (abajo)
}
```

La huella no es criptográfica: prueba que el archivo elegido es el mismo que se va a archivar (y que no se cortó), no
protege contra alguien que lo arme a mano. La fuente de verdad es `paqueteParaArchivar`, `huellaAnexo`, `huellaRespaldo` y
`verificarPaqueteArchivo` en `motor.mjs`.

**«Restaurar desde un archivo»** acepta el respaldo de siempre o este archivo (restaura su `respaldo`: la jornada de
antes de archivar). Si se elige un anexo solo (`tipo: "anexo-jornada"`), explica que es la historia de los días
archivados y no un respaldo (`respaldoDesdeArchivo`).

**Borrar una copia vieja** (`bp-jornada-v1-antes-golive`, `-anterior`, `-ilegible-…`) sigue la misma idea: se descarga
(`breakpoint-copia-…json`), el dueño elige ese archivo, se compara letra por letra con la copia y recién ahí se borra.

**Qué se archiva:** sólo lo **terminado** de días hasta `hasta` con la **caja cerrada**: turnos finalizados,
cancelados o con falta (y suspendidos sin plata) con todos sus cobros en cajas cerradas; cuentas de cargos cerradas;
los movimientos de las cajas cerradas; pedidos de la tienda entregados, cancelados o a cuenta; pedidos de crédito ya
resueltos; difusiones viejas (la última se queda); registro, lista de espera y bloqueos de esos días; movimientos
viejos de cuenta corriente y fiados usados. Un cobro hecho **después** de cerrar su caja entró en la caja siguiente
(siguiendo la cadena de cierres, como `cajaAbierta`: si esa noche también se cerró la siguiente, entró en la otra):
esa también tiene que estar cerrada.

**Qué NO se archiva nunca:** turnos reservados o en cancha, con seña en suspenso, con plata para devolver o con una
falta sin cobrar; turnos suspendidos con plata (a propósito, conservador: ocupan poco — nota M9 del Gate); cuentas abiertas (y el turno de una mesa que sigue); lo de cajas sin cerrar; la última semana; y lo
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
- Los PIN (4 dígitos los dueños, 2 recepción) **no** se migran como credenciales: en el ERP cada usuario entra con login.

## Propuesta: que el sobre diga de qué negocio es (no aplicada)

El sobre v1 **no dice de qué negocio es**. Hoy «otro club» se reconoce por `estado.config.nombre` (lo pone el motor al
armar el club y nadie lo cambia) y «la demo» por los PIN de ejemplo de los dueños: lo hacen la pantalla del ERP
(`configuracion-core.ts` → `leerRespaldo`) y, desde el Gate del 18/10/2026, las acciones del servidor
`revisarRespaldoDelClub` / `restaurarRespaldoDelClub` contra la foto vigente. Dos clubes con el mismo nombre, o un
respaldo sin nombre, pasan.

Propuesta para cuando terminales toque el almacén (no se cambia el formato del vanilla, que sigue generando v1):

```jsonc
{ "v": 1, "estado": { ... }, "secuencia": 123, "usuario": "u-rober", "guardado": 1760640000000,
  "negocio": "breakpoint"   // OPCIONAL: el slug del negocio del ERP que lo descargó
}
```

- Es un campo **opcional** del sobre: `hidratarEstado` no lo mira, así que un v1 sin él se sigue leyendo igual (no
  sube `v`). Lo escribe sólo el almacén del ERP al descargar (el vanilla no sabe de negocios).
- Al restaurar: si el respaldo trae `negocio` y no es el de la sesión, se rechaza («Ese respaldo es de otro negocio»);
  si no lo trae (los del vanilla, los viejos), vale el control de hoy por nombre y PIN de ejemplo.
- El servidor lo compara con el slug de la sesión (`getCurrentTenantSlug`), nunca con lo que diga el navegador.

— Elaborado por GSG


## PIN con hash (desde el 21/10/2026)

- `usuarios[].pin` ya no va en claro: `h1:<hex>` = PBKDF2-SHA256(PIN, `estado.salPin`, `VUELTAS_PIN` = 2000), y
  `usuarios[].pinLargo` (2 o 4) para saber si un dueño tiene todavía el viejo de 2. `estado.salPin` es UNA por club.
- Un PIN en claro (respaldo o foto de antes) sigue sirviendo (`pinCoincide`) y pasa a hash cuando la jornada real del
  ERP abre la foto (`pasarPinesAHash`, en el almacén) o cuando se cambia. El club de hoy (vanilla) lo pasa al cambiarlo.
- El link del pedido de crédito lleva `s` (la sal): el código de aprobación es `codigoAprobacion` con `hash(PIN, sal)`.
  Un link viejo sin `s` da el código con el PIN en claro: si el club ya tiene sal, ese código no sirve y hay que
  reenviar el pedido.
- Lo que NO cuida: con 4 números hay 10.000 PIN; quien tenga la foto y tiempo los prueba todos (cada intento cuesta
  ~50 ms en una PC). Y el hash hace de PIN para el código de aprobación: quien tiene la foto puede firmar
  aprobaciones. Las fotos viejas con PIN en claro siguen en el historial de la base hasta que la poda las borra
  (14 días, estado-repo.ts) y en las copias locales («antes de restaurar», «lo que quedó aparte»). Lo que cuida al PIN es
  que la foto no salga del club, el tope de intentos y G8 (src/lib/club/delicado.ts).

— Elaborado por GSG
