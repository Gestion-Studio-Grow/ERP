# Break Point Pádel — día de prueba real en el local

Guía para Roberto Ronco y Majo Gimenez (dueños) y para recepción. Es una prueba **en el local, con clientes de
verdad, sin servidor y sin costo**: todo se guarda en la compu del mostrador. Después del día de prueba se hace la
**limpieza para el go-live** y se sigue usando igual (ver al final).

## Front y back: qué ve cada uno

| Quién | Dirección | Qué es |
|---|---|---|
| **Clientes** (front) | **https://breakpointpadel.gsgapp.com.ar/** | Portada del club → «Reservá tu cancha» (`/turnero`): eligen día y horario y lo **piden por WhatsApp**; el club confirma. Sin «demo», sin acceso a la gestión. |
| **El club** (back) | **https://breakpointpadel.gsgapp.com.ar/club** | La gestión: agenda, buffet, caja, clientes, configuración. No se linkea desde el front y no aparece en buscadores. |
| Prospectos (demo) | `/club?demo=1` · `/turnero?demo=1` | La demo con datos de ejemplo. No toca nada del club. |

Lo que el front muestra fijo (WhatsApp del club, precios por hora y tienda) sale de
`src/tenants/breakpoint/publico.json`: se copia del «Link para clientes» de Configuración y lo publica GSG. Mientras
esté vacío, el turnero muestra los horarios **sin precios**, sin tienda, y WhatsApp abre para elegir el chat. El link
para clientes de Configuración ya lleva todo y se puede mandar igual.

## Cómo se arranca (una sola vez, en la compu del mostrador)

1. Abrí **https://breakpointpadel.gsgapp.com.ar/club** en Chrome (no incógnito). Esa compu queda en «jornada
   real». (Si esa compu ya había entrado con `?modo=real`, sigue con lo que tiene: no se pierde nada.)
2. Aparece la **consola de configuración**:
   - **Los dueños arman su PIN.** Roberto y Majo eligen cada uno 2 números que sólo sepa él o ella y los repiten.
     No pueden ser iguales.
   - **Avisos por WhatsApp** (opcional): el celular de cada dueño (ahí llegan los pedidos de crédito), el WhatsApp
     del club y el alias para la seña.
   - **Recepción** (opcional, también se hace después): nombre de cada persona → el sistema le da un PIN, que se ve
     **una sola vez**. Anotalo y dáselo.
   - **Precios y caja:** el precio por hora (valle y pico) y el **fondo de caja** (el cambio que hay en el cajón).
   - **Abrir el club.** Queda bloqueado: entra el dueño con su PIN.
3. **Antes del primer turno**, un dueño:
   - revisa los precios del buffet y de la tienda en Stock → «Precios y rentabilidad»;
   - carga el **conteo de stock** de lo que se vende con stock (Stock → Editar → «Stock actual»). Mientras no se
     cuenta, el producto se vende sin tope y no avisa reposición;
   - da de baja lo que el club no vende.
4. Desde ahí, **Configuración** (sólo dueños) tiene todo: jornada y respaldo, avisos, usuarios y accesos (alta, PIN
   nuevo, sacar acceso, cambiar mi PIN), reglas, precios y horarios.

## Durante el día

- **La cuenta del turno, en un solo lugar.** Al tocar un turno: arriba, «Cuenta del turno» con la cancha, los
  cargos y lo que falta cobrar, y una fila por jugador con lo suyo.
  - **Cobrar todo** con un medio.
  - **Cobrar a un jugador**: su parte de la cancha y sus cargos juntos.
  - **«A cargo de»** para la cancha y para los cargos: el que invita paga lo del otro.
- **Se termina el turno y se quedan a comer**: «Cobrar la cancha y cerrarla · la mesa sigue». La cancha se cobra,
  se apaga la luz y queda libre para el turno siguiente. Los cargos siguen abiertos (**Buffet → Mesas que siguen
  cargando**) y se suman los que pidan. Cuando se van: «Cobrar y cerrar los cargos», o pasar los cargos a cuenta
  corriente.
- **Fiar.** Si un cliente no tiene cuenta corriente, en su cuenta aparece «Pedir OK para fiar».
  1. Recepción toca «Avisar a Roberto/Majo por WhatsApp». Al dueño le llega un link.
  2. El dueño lo abre en su celular, pone su PIN y le sale un código de 6 letras. Lo manda por WhatsApp.
  3. Recepción tipea el código y ya puede pasarlo a la cuenta corriente.
  4. Si el dueño está en el club, lo aprueba directo en la pantalla.

  Hay 5 intentos por pedido. Si hay pedidos esperando, los dueños ven el aviso 🔔 arriba.
- **Turnos y tienda para los clientes.** En Configuración está el **link para clientes**
  (`/turnero?modo=pedido&wa=<número del club>`). Con ese link el cliente:
  - ve horarios, precios y la tienda;
  - **pide el turno o el encargo por WhatsApp**.

  El club lo carga a mano:
  - el turno, con «+ Turno»;
  - el encargo, pegando el mensaje en **Buffet → «Pedido de la tienda por WhatsApp»**. Queda en «Pedidos de la
    tienda» y se entrega y cobra ahí.
- **Novedades del club** (pestaña «Novedades y redes», dueños).
  1. Se arma la novedad (tipo, título, texto) y se elige a quién le llega: a todos, a los que jugaron este mes,
     a los que no vienen hace un mes o a los que tienen cuenta corriente.
  2. «Preparar el envío» deja dos caminos:
     - **lista de difusión** de WhatsApp Business: copiar el mensaje y descargar los contactos;
     - **uno por uno**: cada nombre abre WhatsApp con el mensaje listo y queda tildado.

  El mensaje lleva «respondé BAJA». Al que pide la baja no le llega más. **Studio de redes**: imágenes y textos
  para Instagram con la marca del club.

## Al cerrar el día

1. **Cerrar la caja** (con PIN). Se cierra una sola vez. La caja va de 12 a 12: lo cobrado antes de las 12 es de
   la caja del día anterior. Si quedó sin cerrar, la pantalla de Caja lo avisa en rojo y deja cerrarla.
   Si abren antes de las 12: **a las 12 cerrá la caja de la mañana y retirá ese efectivo dejando el fondo**, así
   la caja de la noche cuadra.
2. **Configuración → Descargar respaldo**. Guardá el archivo en un lugar privado: **tiene los PIN y los datos de
   los clientes**, no lo mandes a un grupo. Si la compu se rompe o se borran los datos del navegador, el respaldo
   se restaura desde Configuración.

## Lo que hay que saber (límites de la prueba, sin servidor)

- **Todo vive en esa compu y en ese navegador.**
  - No pasa a otras compus ni a los celulares.
  - No usar ventana de incógnito.
  - No borrar los datos del sitio.
  - Una sola pestaña del club: si se abre otra, avisa y no deja trabajar ahí.
- **Al recargar**, vuelve bloqueada y pide el PIN. La hora es la de la compu: que esté bien puesta.
- **El turnero de los clientes no reserva solo**: pide por WhatsApp y el club confirma. La reserva automática
  desde cualquier celular, la sincronía entre compus y la aprobación de crédito sin código son el siguiente paso,
  con servidor, después de la venta.
- **Los PIN son de 2 dígitos.** El código de aprobación vale lo que vale el PIN del dueño: no se presta. Cinco PIN
  mal en la pantalla bloqueada hacen esperar (30 s, después 2 min, después 10 min), aunque se recargue.
- **Desde la demo no se borra la jornada real.** Si alguien vuelve a la demo, sólo puede «Seguir la jornada real
  guardada», y para entrar pide el PIN real. Empezar otra jornada se hace desde adentro, con PIN de dueño. La
  anterior queda apartada en la compu y se descarga un respaldo solo.
- **El link para clientes lleva los precios y la tienda de esa compu.** Si cambian precios o productos, volvé a
  copiar el link.

## Cómo se verificó

`npm run test:club-torneo`: el UAT de un **sábado de torneo** en Chromium, de punta a punta, con 61 de 61 en
verde. Cubre:
- la consola de configuración y los dueños;
- recepción con 4 canchas completas, 4 jugadores y mucho buffet;
- «a cargo de», el cierre de cancha con la mesa abierta y el turno siguiente;
- cobro total, por jugador y fiado con código desde el celular de Majo;
- la tienda desde el celular de un cliente y el pedido pegado en el club;
- recarga, segunda pestaña, novedades por difusión, alta de usuario, respaldo y cierre de caja;
- la caja igual a lo cobrado, la medianoche y la pantalla a 390 px.

## Go-live: después del día de prueba

1. Cerrá la caja del día y **descargá el respaldo** (Configuración).
2. Configuración → «Limpieza para el go-live» → PIN de dueño. Antes de borrar, el sistema descarga otro respaldo y
   deja una copia en la compu.
   - **Se borra** lo de la prueba: turnos, cuentas de cargos, caja (movimientos y cierres), pedidos de la tienda,
     pedidos de crédito, novedades enviadas y el registro.
   - **Se conserva** lo maestro: canchas, horarios, precios, productos, usuarios y PIN, clientes, proveedores,
     turnos fijos, calendario de redes y el fondo de caja.
   - **Saldos** (cuenta corriente, créditos y faltas de los clientes; deuda con proveedores): se conservan por
     defecto, porque es plata real. Si la prueba fue sólo de mentira, se destilda y quedan en cero.
   - **Stock contado:** se conserva por defecto; destildado, vuelve a «sin controlar» para contar de nuevo.
   - **Turnos por jugar** (los de hoy que todavía no empezaron y los de los próximos días) **quedan, con su seña**.
   - **No corre si hay algo pendiente:** canchas en juego, cuentas de cargos abiertas con saldo o con algo
     alquilado, turnos que ya pasaron sin abrir ni marcar la falta, plata para devolver, faltas sin cobrar o cajas
     sin cerrar. La pantalla lo lista: resolvelo y volvé a intentar.
   - Los pedidos de crédito que estaban esperando al dueño se borran: si hace falta, se piden de nuevo.
3. Desde ahí es el día 1: mismo `/club`, mismos usuarios y PIN, caja en cero.

## Cuando la compu se llena: archivar días cerrados

El navegador guarda unos 5.000 KB por sitio. Con las 4 canchas llenas, la jornada crece unos 3.000 KB por mes: en 3 a
5 semanas no entra más. Por eso, **una vez por semana** (o cuando avise), un dueño archiva lo viejo.

- **Cuándo:** cuando arriba aparece «⚠ Se está llenando: archivar días cerrados», o cuando en Configuración → Jornada
  real la jornada pasa los 2.500 KB. Si directamente dice «no se pudo guardar», es urgente: descargá un respaldo y
  archivá en ese momento.
- **Cómo:** Configuración → Jornada real → **«Archivar días cerrados»**. Se abre una ventana con el PIN de dueño y
  dos pasos:
  1. **«Descargar el respaldo para archivar»**: baja **un solo archivo** (`breakpoint-respaldo-y-archivo-….json`) con
     el respaldo completo de ahora y la historia de los días que se archivan. Todavía no se achica nada.
  2. **«Ya lo guardé: achicar»**: elegís ese archivo desde Descargas. El sistema comprueba que es el mismo que se va a
     archivar y **recién ahí** achica lo guardado en la compu («Archivo verificado: achicado»).

  Si la descarga no se hizo (el navegador la frenó o se canceló), no hay archivo para elegir y **no se achica nada**.
  Si entre un paso y el otro se cobró o se cerró algo de esos días, pide descargar de nuevo.
  **Guardá ese archivo** en un lugar privado (tiene los datos de los clientes): es la historia de esos días y, si hace
  falta, se restaura con «Restaurar desde un archivo» (vuelve la jornada de antes de archivar).
- **Qué se archiva:** lo de hace **más de 3 semanas** que ya está cerrado: turnos jugados, cancelados o con la falta
  cobrada, cuentas de cargos cerradas, los movimientos de las cajas que se cerraron, pedidos de la tienda entregados.
  En el sistema queda un resumen de cada día: en la misma tarjeta, «Días archivados» muestra una línea por día con la
  fecha, los turnos y lo cobrado.
- **Qué NO se toca:** las últimas 3 semanas, los turnos por jugar, las mesas abiertas, **las cajas que nadie cerró**,
  lo que tenga plata pendiente (señas en suspenso, plata para devolver, faltas sin cobrar) y lo de cada cliente: su
  cuenta corriente (queda una línea «Saldo anterior» con el mismo saldo), sus créditos y sus faltas.
- **Si algo no se archiva** es porque su caja no se cerró: cerrala en Caja (aparece en rojo) y volvé a archivar.
- **Copias viejas:** en la misma tarjeta aparecen las copias que dejaron la limpieza del go-live, «Empezar otra
  jornada en blanco» y una jornada que no se pudo leer, con lo que ocupa cada una. Si no las necesitás, «Descargar y
  borrar» (con PIN de dueño): la descargás, elegís el archivo descargado, el sistema comprueba que es igual a la copia
  y recién ahí la borra de la compu. Nunca se borran solas.

— Elaborado por GSG
