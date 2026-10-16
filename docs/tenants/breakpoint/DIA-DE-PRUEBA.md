# Break Point Pádel — día de prueba real en el local

Guía para Roberto Ronco y Majo Gimenez (dueños) y para recepción. Es una prueba **en el local, con clientes de
verdad, sin servidor y sin costo**: todo se guarda en la compu del mostrador.

## Cómo se arranca (una sola vez, en la compu del mostrador)

1. Abrí **https://breakpointpadel.gsgapp.com.ar/club?modo=real** en Chrome. Esa compu queda en «jornada real».
   La demo de ejemplo de `/club` no se toca: cualquier otra compu sigue viendo la demo.
2. Aparece la **consola de configuración**:
   - **Los dueños arman su PIN.** Roberto y Majo eligen cada uno 2 números que sólo sepa él o ella y los repiten.
     No pueden ser iguales.
   - **Avisos por WhatsApp** (opcional): el celular de cada dueño (ahí llegan los pedidos de crédito), el WhatsApp
     del club y el alias para la seña.
   - **Recepción** (opcional, también se hace después): nombre de cada persona → el sistema le da un PIN, que se ve
     **una sola vez**. Anotalo y dáselo.
   - **Abrir el club.** Queda bloqueado: entra el dueño con su PIN.
3. Desde ahí, **Configuración** (sólo dueños) tiene todo: jornada y respaldo, avisos, usuarios y accesos (alta, PIN
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

1. **Cerrar la caja** (con PIN). Se cierra una sola vez.
2. **Configuración → Descargar respaldo**. Guardá el archivo (o mandátelo por WhatsApp). Si la compu se rompe o
   se borran los datos del navegador, el respaldo se restaura desde Configuración.

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
- **Los PIN son de 2 dígitos.** El código de aprobación vale lo que vale el PIN del dueño: no se presta.

## Cómo se verificó

`npm run test:club-torneo`: el UAT de un **sábado de torneo** en Chromium, de punta a punta, con 54 de 54 en
verde. Cubre:
- la consola de configuración y los dueños;
- recepción con 4 canchas completas, 4 jugadores y mucho buffet;
- «a cargo de», el cierre de cancha con la mesa abierta y el turno siguiente;
- cobro total, por jugador y fiado con código desde el celular de Majo;
- la tienda desde el celular de un cliente y el pedido pegado en el club;
- recarga, segunda pestaña, novedades por difusión, alta de usuario, respaldo y cierre de caja;
- la caja igual a lo cobrado, la medianoche y la pantalla a 390 px.

— Elaborado por GSG
