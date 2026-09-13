# Configurar el servidor

Todo se hace desde el panel: **http://127.0.0.1:8080**. No hay `.ini` que editar.

## Rates (exp y drop)

**Panel → Configuration → Game Configuration.**

- **Experience Rate** — el multiplicador global. `1` es como el juego oficial (durísimo).
  Para uso privado, `50`–`500` es lo normal; los "server x9999" van mucho más arriba.
- **Item Drop Rate / Money Drop Rate** — probabilidad de que caiga algo.
- **Maximum Level** — el techo. Season 6 va a 400 (más Master Level).

Aplican **sin reiniciar**. Bajá los rates de a poco: subirlos es fácil, bajarlos con gente
ya nivelada es un problema político.

## Game servers (los canales)

**Panel → Servers.** Cada game server es un canal de la lista. Para vos y unos amigos, **uno
solo alcanza**. Cada uno más son unos cientos de MB de RAM.

Podés darle a cada uno su propio multiplicador de experiencia — el truco de los servers con
un canal "hard" y otro "x1000".

## Monstruos, items, spots y drops

**Panel → Configuration** te deja tocar el modelo entero: stats de cada monstruo, cuántos
aparecen y dónde (*spawn areas*), qué dropea cada uno, qué hace cada item, cada skill, los
precios de los NPC. Es más profundo que lo que dan los files comerciales por `.txt`, porque
estás editando el modelo directo.

**Antes de una sesión larga de tuneo: `./scripts/backup.sh`.** Un cambio mal hecho en la
config del juego se deshace restaurando, y no de otra forma.

## Eventos

**Panel → Configuration → Events**: Blood Castle, Devil Square, Chaos Castle, Golden Invasion
y compañía. Se prenden, se apagan y se les cambia el horario ahí.

## Usuarios y GMs

**Panel → Accounts.** Podés crear cuentas, cambiar contraseñas, banear, y darle a una cuenta
el estado de **Game Master** (habilita los comandos de GM adentro del juego).

**Lo primero al terminar de probar: borrá las cuentas `test*`.** Tienen contraseña igual al
usuario y algunas son GM. Es el agujero más obvio que va a tener tu servidor.

## Plugins

**Panel → Plugins.** OpenMU trae el comportamiento del juego partido en plugins que se prenden
y apagan individualmente (fixes de bugs históricos del juego, variantes de balance, features
de seasons posteriores portadas). Vale la pena leer la lista una vez: ahí está buena parte de
lo que en un files comercial sería "una versión distinta".

— Elaborado por GSG
