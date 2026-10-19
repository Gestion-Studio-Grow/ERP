# Modo sin internet en el mostrador del club — diseño F0

> ⏸️ **EN ESPERA (18/10/2026, Challenger).** El Challenger recomienda el orden **A → corte de BP → B → (C) → D**,
> y este log de comandos + rebase es **D**: va sólo cuando haya de verdad dos compus que escriban en el mismo
> club. Hasta la síntesis del dueño **no se construye F0.c en adelante**. F0.a queda commiteado: es puro, no lo
> usa ninguna pantalla y no cambia nada. Ver §12.
>
> Estado: **diseño + núcleo puro**. Las pantallas todavía no lo usan. Las decisiones D4 y D6 las cierra el
> dueño en la síntesis del ADR de back separado (Advisory → Challenger). Si la síntesis cambia algo, se
> ajusta este doc antes de construir la parte afectada.
> Autores: sesión de terminales/React, con los aportes de la sesión del club (18/10/2026).

## 1. El problema, en una línea

El almacén ya opera contra la copia local; lo que se corta sin internet es **subir a la base**. Hoy, si al
volver la base avanzó desde otro equipo, lo de este equipo **se aparta entero** (`…:descartada`,
`guardado-en-la-base.ts`) y alguien lo tiene que rehacer a mano. Sin internet en un sábado de torneo eso
son horas de cobros apartados.

## 2. Por qué hace falta una capa de comandos

Hoy `almacen.ejecutar(accion)` / `aplicar(accion)` reciben **funciones sueltas** (closures) que llaman
al motor. Sólo queda la foto del estado, no *qué se hizo*. Sin saber qué se hizo no se puede re-aplicar
encima de lo que guardó el otro equipo. El motor no tiene log: son funciones puras
`M.fn(estado, …args, ahora, auth)` que mutan `estado`.

**Decisión:** las operaciones pasan a ser **comandos con nombre**:

```ts
interface Comando {
  id: string;            // uuid: idempotencia (si ya está en la base, no se aplica dos veces)
  equipo: string;        // deviceId estable del puesto
  persona: string;       // usuarioId de quien operaba con su PIN
  versionBase: number;   // versión de la base sobre la que se hizo
  motor: string;         // versión del motor (ORIGEN.json); mayor distinto → recargar, no aplicar
  nombre: NombreDeComando; // de una LISTA BLANCA: nombre → función del motor
  args: unknown[];       // JSON puro, sin funciones
  ahora: Ahora;          // la hora del mostrador cuando se hizo (viaja: no se re-lee al re-aplicar)
  azar: number;          // semilla para lo aleatorio del motor (viaja: idem)
  idsDesde: number;      // por dónde iba el contador de ids del motor (viaja: idem)
}
```

La lista blanca es el límite de seguridad: un comando con un nombre que no está **no se ejecuta**, venga
de donde venga (cola local manipulada, versión vieja de la pantalla).

### 2.1 Lo que ya ayuda

Varias pantallas ya despachan **acciones serializables** a un núcleo propio (`cuenta-core` →
`ejecutar(estado, reservaId, accion)`, `ejecutarEspera(estado, accion)`, `ciclo-core`). Esos núcleos
entran a la lista blanca **como un solo comando cada uno**, con la acción `{ tipo, … }` de argumento. La
migración de esas pantallas es cambiar el closure por `almacen.comando("cuenta", [reservaId, accion])`.

Superficie medida hoy: 23 archivos con `ejecutar`/`aplicar` (sesión del club + ésta).

## 3. Determinismo — la trampa

Re-aplicar el mismo comando sobre otro estado tiene que dar **los mismos ids y códigos** que dio en el
mostrador. Si no, el comando siguiente («cobrar la reserva `r5`») apunta a algo que no existe.

| Fuente de diferencia | Dónde | Cómo se neutraliza |
|---|---|---|
| Hora | `ahora` como argumento | Viaja en `Comando.ahora`; nunca se re-lee el reloj al re-aplicar |
| Azar de la seña | `nuevaRefPago(estado, azar)` (motor ~:863), llamada **sin `azar`** desde la alta de turno (~:905) | Hoy: `correrComando` fija `Math.random` con la semilla del comando mientras corre (sincrónico, restaurado en `finally`), **la primera vez y al re-aplicar**: misma referencia (verificado). **Pedido al vanilla (prolijidad, no bloquea):** que la alta y el pedido acepten `azar` y lo pasen |
| Azar del pedido | `nuevoCodigoPedido(estado, azar)` (~:2632), llamado sin `azar` (~:2660) | Igual que arriba |
| Contador de ids | `nuevoId` usa un contador global del módulo (~:104) que **sólo sube** (`retomarSecuencia` hace `max`) | El comando guarda `idsDesde`. Al re-aplicar después de recargar desde la base (el caso normal al volver internet) el contador quedó **por debajo**, y `retomarSecuencia(idsDesde)` lo lleva exacto: **mismos ids, sin tocar el motor** (verificado en los tests). Si la misma pestaña siguió creando ids, salen distintos: `rebasar` lo marca (`idsDistintos`) y lo encadenado cae en «Para resolver». Para cubrir ese caso, **pedido opcional al vanilla:** `conSecuencia(n, fn)` |
| PIN nuevo | `pinLibre` usa `crypto` (~:299) | Alta de usuarios **no se permite sin internet** (D4): no hace falta |

Los ids ya llevan el prefijo del equipo (`origenIds`), así que dos equipos no chocan entre sí; lo que falta
es que el **mismo** equipo reproduzca sus ids al re-aplicar.

## 4. Rebase al volver la conexión

```
estado = estadoDeLaBase ⊕ pendientes
```

1. Si la base sigue en `versionBase` del primer pendiente: se sube la foto como hoy (camino rápido, sin
   re-aplicar nada).
2. Si avanzó: se trae lo de la base y se re-aplica **cada pendiente en orden**, con su `ahora`, su `azar`
   y su `idsDesde`.
   - El motor dice `ok` → queda aplicado.
   - El motor dice que no (turno ya tomado, ya cobrado, saldo distinto) → **no se fuerza**: va a
     «Para resolver ahora» con el motivo en criollo y quién lo hizo. **Lo del otro equipo nunca se pisa.**
   - Un comando que dependía de uno rechazado (mismo id) también cae ahí, con el motivo «dependía de …».
3. Se sube el resultado con la versión nueva. Si en el medio la base volvió a avanzar, se repite (con
   tope de intentos; después, aviso y los pendientes siguen en la cola).

Esto **reemplaza** el `CAMBIO_MIENTRAS_MIRABAS` → `…:descartada` de `guardado-en-la-base.ts` para lo que
haya en la cola. La foto apartada sigue existiendo como red de seguridad para lo que no tenga comandos
(estado viejo, versión anterior de la app).

**Idempotencia:** la base guarda los `id` de los últimos comandos aplicados (en la foto). Un comando cuyo
`id` ya está, se saltea: cubre el corte justo después de subir y antes de enterarse.

## 5. Qué se permite sin internet (D4 — propuesta, la confirma el dueño)

**Versión vigente en el código: la del Challenger (más estricta), sólo lo que hace ENTRAR plata.** El PIN va
en claro en el estado (motor ~:274/290/402/413) y `codigoAprobacion` sale del PIN del dueño (~:754): quien
tenga el estado puede fabricar un OK. Por eso, sin internet, nada que saque plata o pida PIN.

| Sí, sin internet | No, sin internet |
|---|---|
| Check-in, finalizar, falta (y cobrarla en efectivo) | Cierre de caja, fondo, **egreso** |
| Cobrar en efectivo o créditos: por jugador, todo, «sólo la cancha», «la mesa sigue» | Archivar, restaurar, empezar en blanco, go-live |
| Buffet y venta de mostrador en efectivo | Cobros por Mercado Pago, transferencia o débito |
| Alta de turno presencial (si choca, a la Bandeja) *(a confirmar: no hace entrar plata)* | **Fiado**, **descuento**, **devolución** |
| | Precios, reglas, usuarios y PIN · aprobador · WhatsApp con link de cobro |

La regla vive **en la lista blanca**: cada comando declara `sinInternet: true|false`. El almacén niega
los que no, con el aviso «Esto necesita internet. Probá cuando vuelva.» La pantalla no decide.

## 6. La cola

- **Dónde:** IndexedDB `gsg-club:<slug>:<userId>:cola:v1` (localStorage no alcanza: un sábado sin
  internet son cientos de comandos y ya guardamos ~3 MB de jornada ahí).
- **Una sola pestaña:** la misma Web Lock de la jornada (`gsg-club:<negocio>:jornada`); la cola es de quien
  tiene la jornada.
- **Al abrir:** si hay cola, se re-aplica sobre lo leído antes de mostrar la recepción. Un comando con
  `motor` de **mayor distinto** no se aplica: se pide recargar la página (la app nueva trae el motor nuevo).
- **El PIN en la cola:** `auth` viaja con el comando porque el motor lo valida. Ya está en el equipo
  (la jornada guarda los usuarios con su PIN); no agrega exposición nueva, pero cuando el back esté
  separado el PIN deja de viajar y el servidor confía en `persona` firmada. Deuda anotada.

## 7. Lo que se ve

- Cinta: «Sin internet · 12 operaciones esperando» (`role="status"`, sin parpadeo; se actualiza al
  cambiar el número, no en cada latido).
- Al volver: «Se subieron 12 operaciones» o «Se subieron 10; 2 quedaron para resolver» con el botón a la
  Bandeja.
- Los botones de lo no permitido quedan visibles y explican por qué no van (no desaparecen: el operador
  tiene que saber que existe).

## 8. Recargar sin internet (D6 — a decidir)

Sin service worker la página **no abre** sin internet. En F0 vale «la pestaña queda abierta»: ya hay Web
Lock, guardado al salir y la jornada en el equipo. El SW mínimo (sólo `/admin/club` y sus chunks) queda
para la síntesis: es la diferencia entre «se cortó internet» y «se cortó la luz».

## 9. Plan por fases

| Fase | Qué | Toca pantallas | Estado |
|---|---|---|---|
| F0.a | Núcleo puro: tipos, lista blanca, `rebasar()` con tests (`comandos-core.ts`) | No | **Hecho** — 7/7, ver §11 |
| F0.b | Pedidos al vanilla: `azar` en la alta y el pedido; `conSecuencia` (los dos opcionales: F0.a ya da lo mismo sin ellos) | No | Pedido a la sesión del club |
| F0.c | `almacen.comando(nombre, args)` al lado de `ejecutar` (convivencia) + cola IndexedDB | No | Después de F0.a |
| F0.d | Migrar las pantallas, solapa por solapa (las mías y las del club, cada sesión las suyas) | Sí | Después de la síntesis |
| F0.e | `guardado-en-la-base`: rebase en lugar de apartar | No | Con la sesión del club |
| F1 | Service worker mínimo (D6) | No | Si el dueño lo aprueba |

**Nada de esto toca la base de producción ni migra el schema**: la cola y el rebase viven en el
navegador; la foto en la base sigue siendo el mismo texto con un campo más (los `id` aplicados).

## 10. Verificación prevista

- Unitarios del núcleo: re-aplicar sobre la misma base da el mismo estado (byte a byte); sobre una base
  que avanzó, aplica lo compatible y rechaza lo que choca; idempotencia; lista blanca.
- Navegador (con reloj fijo, ver lección del 18/10): cortar la red con `context.setOffline(true)`, operar,
  abrir otro contexto que guarda en la base, volver la red y verificar que nada se pisa.
- Perf: re-aplicar 500 comandos < 200 ms en un equipo de mostrador modesto (CPU ×4 en Playwright).

## 11. Lo que ya está medido (F0.a, 18/10/2026)

`src/app/admin/(dashboard)/club/comandos-core.ts` + `comandos-core.test.ts`, contra el motor real sobre la demo:

- **Misma base:** un turno presencial sin ficha (seña con código al azar) + cobrar todo en efectivo, re-aplicados
  después de «recargar» → estado **idéntico byte a byte**, misma referencia de seña, mismos ids.
- **La base avanzó:** otro equipo dio el mismo hueco → mi alta y la seña encadenada van a «Para resolver» con su
  motivo; mi cobro en efectivo del turno en juego se aplica; **el turno del otro queda intacto**.
- **Idempotencia:** un comando que la base ya tenía se saltea; no hay turno duplicado.
- **Lista blanca:** `borrarTodo`, `toString`, `__proto__`, `constructor` y otra versión del motor → no corren, el
  estado no cambia.
- **Ids en la misma pestaña:** se detectan y se marcan (`idsDistintos`), no se esconden.
- **D4:** 21 casos de qué va sin internet (efectivo/créditos sí; MP, transferencia, débito, cierre, fondo, mover,
  cancelar, descuento del dueño no; nombre desconocido o args que no son lista, no).
- **Rinde:** 500 comandos re-aplicados en **19 ms** (Node, contenedor de CI), con el estado final idéntico al del
  mostrador. La cota del mostrador modesto (CPU ×4 en el navegador) va con F0.c.

**Fiado con el código del dueño** (`credito-core`) todavía no está en la lista blanca: entra con F0.c, cuando el
almacén lo despache por nombre.

## 12. Lo que dijo el Challenger (18/10/2026) — insumo para la síntesis del dueño

- **Orden:** A (ya, 3–5 días, US$ 0 extra: foto comprimida en jsonb —hoy se bajan ≈3 MB sin comprimir por
  apertura—, **una sola compu que escribe por club** con reserva en la base transferible con PIN de dueño, las
  demás miran consultando la versión cada 15 s, router 4G, PIN fuera del estado que baja al cliente) → corte de
  BP → B (Postgres como autoridad, Ably free como «timbre», cron externo) → C (hub en Fly, si los datos lo piden)
  → **D (este doc)**.
- **Con A, el «sin internet» de un solo equipo ya no necesita rebase:** si sólo una compu escribe, al volver
  la conexión su foto es la única novedad y sube como hoy (§4, camino rápido). D hace falta recién con dos
  compus escribiendo.
- **Estado global del motor** (`secuencia`/`origenIds`, motor ~:104; prefijo con `Math.random`, nucleo ~:98):
  un proceso con varios tenants comparte el contador. Para D, los ids van en los args o en el estado; ese
  refactor lo hace la sesión del club en el vanilla si el dueño aprueba D. F0.a lo resuelve **sólo** en el
  navegador (un club por pestaña).
- **Cierre de caja con equipos desconectados:** el servidor no ve las colas ajenas → registro de equipos con
  latido, o cierre forzado por el dueño que manda lo tardío a «Para resolver».
- **Reloj desfasado:** `ahora` del cliente decide el día de caja → medir el desfase en cada sync y ponerle tope.
- **Costos para el dueño:** Neon free suspende la base de los 4 tenants (CH incluida) al agotar 100 CU-h; el
  club 14 h/día ≈ 105 CU-h → Neon pago antes de la jornada real. Vercel Hobby es no comercial (Pro US$ 20).
  Total ≈ US$ 35–45/mes.

— Elaborado por GSG
