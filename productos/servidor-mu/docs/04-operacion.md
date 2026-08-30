# Operar el servidor

## Backups — lo único que no es opcional

Toda tu configuración, cuentas y personajes viven en la base. Sin backup, un disco que se
rompe o un cambio mal hecho se lleva el servidor entero.

```bash
./scripts/backup.sh                      # guarda en backups/, deja los últimos 14
./scripts/restaurar.sh backups/xxx.gz    # restaura (pide confirmación, pisa la base)
```

Automatizalo. En Linux/Mac, `crontab -e`:

```cron
0 5 * * * cd /ruta/a/productos/servidor-mu && ./scripts/backup.sh >> backups/cron.log 2>&1
```

En Windows, el Programador de tareas apuntando al script vía WSL o Git Bash.

**Y copiá `backups/` afuera de esa máquina** — un pendrive, otro disco, la nube. Un backup
que vive en el mismo disco que la base no es un backup, es una ilusión.

## Actualizar

```bash
./scripts/actualizar.sh     # backup + pull + recreate
```

`OPENMU_TAG=latest` sigue el master de OpenMU, que está en desarrollo activo: te llegan
mejoras, pero también cambios. **Cuando tengas el servidor como te gusta y con gente adentro,
pineá una versión concreta** en el `.env` (`OPENMU_TAG=<tag>`) y actualizá cuando vos decidas,
no cuando salga un commit.

## Jugar con amigos

### La IP que anuncia el server (RESOLVE_IP)

Conectarse tiene dos pasos: el cliente le pega al **connect server** (la IP que vos escribís
en el cliente) y este le responde "el game server está en **tal IP**". Esa segunda IP la
decide `RESOLVE_IP` en el `.env`, y si está mal, el síntoma es siempre el mismo: **la lista
de servers aparece, pero al elegir uno no entra**.

| Cómo juegan | `RESOLVE_IP` |
|---|---|
| En tu casa / LAN (incluida la misma máquina) | `local` (el default de este stack) |
| Por Tailscale | Tu IP de Tailscale, ej. `RESOLVE_IP=100.101.102.103` |
| Puertos abiertos en el router | `public` |

Ojo: el default de OpenMU *sin* esta variable es `public` (averigua tu IP pública con una API
externa) — por eso este stack la fija en `local`. Después de cambiarla: `./scripts/levantar.sh`
recrea el contenedor con el valor nuevo.

**Si la variable no te hace efecto**, el mismo ajuste está en el panel: **Configuration →
System → IP Resolver** (con su parámetro al lado). Esa es la vía documentada por OpenMU y la
que manda; la variable de entorno es el atajo para no tener que entrar al panel. Si tu versión
de la imagen no la toma, cambialo desde ahí y listo.

### La opción buena: Tailscale (VPN, gratis)

Instalás [Tailscale](https://tailscale.com/) en tu máquina y en la de cada amigo, todos
entran con la misma cuenta o los invitás a tu red, y listo: cada uno recibe una IP `100.x.x.x`
y se conectan a esa. **No abrís ningún puerto al mundo.** Para un server privado es
exactamente lo que querés: cero exposición, cero configuración de router, y funciona aunque
tengas IP dinámica o CGNAT (el caso de la mayoría de las conexiones hogareñas en Argentina).

### La opción riesgosa: abrir puertos en el router (o correr esto en un VPS)

Si hacés port forwarding de 44405 y 55901-55906, tu servidor queda visible en internet, lo
van a escanear en cuestión de horas, y OpenMU está en desarrollo — no está endurecido contra
alguien que quiera romperlo. Si aun así lo hacés:

- **Nunca** expongas el panel de admin (`PANEL_BIND_ADDR` se queda en `127.0.0.1`; si lo
  necesitás remoto, entrá por Tailscale o por un túnel SSH).
- Abrí **solo** los puertos del juego, ninguno más.
- Borrá las cuentas `test*` antes, no después.

**Y si esto corre en un VPS, leé esto dos veces:** en un VPS no hay router ni port
forwarding. `BIND_ADDR=0.0.0.0` (el default) significa que los puertos del juego están
publicados **en internet desde el primer `levantar.sh`**. Si querés que solo entren tus
amigos por Tailscale, poné `BIND_ADDR=127.0.0.1` en el `.env` y que la IP de Tailscale sea
la que usen — o poné directamente la IP `100.x` de Tailscale en `BIND_ADDR`.

### Docker se saltea tu firewall (el error clásico del VPS)

Esto sorprende a gente con años de Linux, así que va derecho: **`ufw` y `firewalld` NO tapan
los puertos que publica Docker.** Docker escribe sus propias reglas de NAT que se evalúan
*antes* que las tuyas. Podés tener `ufw status` diciendo "deny incoming" y aun así tener el
44405 y el 8080 abiertos al mundo.

Concretamente: `sudo ufw deny 8080` **no** protege el panel. Lo único que decide quién ve el
panel es `PANEL_BIND_ADDR` en el `.env`. Lo mismo para los puertos del juego con `BIND_ADDR`.

**La forma correcta de verificar qué está expuesto de verdad**, desde afuera de la máquina:

```bash
# desde OTRA máquina, no desde el servidor
nc -vz IP-DEL-SERVIDOR 8080     # el panel: NO tiene que conectar
nc -vz IP-DEL-SERVIDOR 44405    # el juego: conecta si lo abriste a propósito
```

O más rápido: `./scripts/diagnostico.sh` tiene una sección **Exposición de red** que te dice
en una línea qué está escuchando y para quién.

### Túnel SSH al panel, desde otra máquina

```bash
ssh -L 8080:127.0.0.1:8080 usuario@ip-del-servidor
```
Y abrís `http://127.0.0.1:8080` en tu navegador local.

## Seguridad, en serio

El modelo de amenaza de un server privado no es un hacker de película. Son tres cosas, y las
tres pasan seguido:

1. **El panel o la base quedan expuestos sin querer.**
2. **Un amigo con acceso a la máquina se lleva más de lo que le diste.**
3. **Un escaneo automático encuentra tus puertos abiertos.** Esto pasa en horas, no en meses.

### El panel de admin es el servidor entero

Desde el panel se cambian rates, se crean cuentas, se dan GMs y se toca la base. **Quien
entra al panel es dueño del server.** Por eso:

- El default es `PANEL_BIND_ADDR=127.0.0.1`: solo se lo ve desde la máquina donde corre.
- Si lo cambiás a otra cosa, **los scripts se niegan a levantar** hasta que agregues
  `PANEL_EXPONER_A_LA_RED=si` al `.env`. No es burocracia: es para que la decisión sea tuya
  y consciente, y no el resultado de copiar un `.env` de un tutorial.
- Cuando lo exponés, `levantar.sh` le pone a nginx un **usuario y contraseña propios**
  (`auth_basic`) delante del panel, con las credenciales de `OPENMU_ADMIN_*`. Es una capa
  independiente del login de OpenMU. Si el panel por algún motivo arrancara sin login,
  esta capa igual frena.
- **Aun así va por HTTP sin cifrar.** En una red que no controlás, esa contraseña viaja en
  claro. Por eso la respuesta correcta casi siempre es no exponerlo (Tailscale / túnel SSH).

### La ventana del primer arranque

Entre que corrés `levantar.sh` por primera vez y terminás el **Setup**, la base todavía está
vacía. Un panel cuya base está vacía no tiene contra qué autenticarte: **el primero que llega
es el que instala y se queda con el servidor.** Con el panel en loopback eso no es un problema
(el primero que llega sos vos). Es exactamente por eso que el default es loopback y por eso
existe la capa de nginx si lo exponés.

Corolario práctico: **hacé el Setup completo antes de abrir nada**, no después.

### Quién puede leer tus contraseñas

- El `.env` queda en `600` (solo tu usuario) — los scripts lo fuerzan en cada corrida.
- **Cualquiera que pueda correr `docker` puede leer todas las contraseñas**, con
  `docker inspect mu-server` o `docker compose config`. Es así en todo stack de Docker, no
  tiene arreglo desde acá. Y va más lejos: estar en el grupo `docker` **es** ser root en esa
  máquina (se monta el disco entero adentro de un contenedor y listo).
  → **No metas a un amigo en el grupo `docker` ni le des sudo.** Si querés que juegue, dale
  una cuenta del juego, no una cuenta de la máquina.
- Los **backups** (`backups/*.sql.gz`) tienen todas las cuentas de tus jugadores. Se crean en
  `600` y la carpeta en `700`. Cuando los copiás afuera, que no sea a una carpeta compartida
  ni a un Drive público.
- `./scripts/diagnostico.sh` **tacha los passwords del `.env`** antes de imprimir, porque los
  logs de .NET a veces incluyen la cadena de conexión completa cuando falla la base. Aun así,
  pegale una leída antes de pegar la salida en un Discord.

### Cuentas del juego

- **Las cuentas `test*` del Setup son el agujero más obvio.** `test0/test0`, y las `testgm*`
  son **GM con contraseña conocida**. Un amigo que las prueba tiene comandos de GM.
  Lo mejor es **no crearlas** (destildá la opción en el Setup) y crear tu cuenta desde el
  panel. Si las creaste, **borralas hoy**, no "cuando termine de probar".
- OpenMU no tiene límite de intentos de login pensado para internet. Otra razón más para que
  el server viva detrás de Tailscale y no en una IP pública.

### Restaurar backups ajenos

Un `.sql` es código, no datos: se ejecuta con todos los permisos adentro de Postgres.
**Restaurá solo backups que hiciste vos con `backup.sh`.** Si alguien te pasa un "backup de
mi server para que lo pruebes", no lo restaures sobre nada que te importe.

### Si pensás que entraron

1. `./scripts/bajar.sh` — cortá primero, investigá después.
2. `./scripts/backup.sh` no: ese backup ya puede estar contaminado. Guardá el volumen tal cual
   está y restaurá desde un backup **anterior** al problema.
3. Cambiá `DB_ADMIN_PW` y `OPENMU_ADMIN_PASSWORD` en el `.env`, y las contraseñas de las
   cuentas de juego desde el panel.
4. `PANEL_BIND_ADDR=127.0.0.1` y sacá el port forwarding hasta entender qué pasó.

### La lista corta

- Passwords largos en el `.env` (el archivo está en `.gitignore`: no lo commitees nunca).
- La base **no publica el puerto 5432** y vive en una red de Docker **sin salida a internet**:
  solo le habla OpenMU. nginx ni siquiera la ve.
- El panel escucha en loopback por defecto. Cambiarlo requiere un opt-in explícito.
- Cuentas `test*` borradas (mejor: nunca creadas).
- `OPENMU_TAG` pineado a una versión concreta cuando el server ya tiene gente.

## Qué mirar cuando algo anda mal

```bash
./scripts/estado.sh          # ¿está todo arriba?
./scripts/estado.sh --logs   # logs en vivo de los tres contenedores
./scripts/diagnostico.sh     # TODO junto: estado, salud, logs, disco, backups
```

`diagnostico.sh` está pensado para las 2 de la mañana: una sola corrida junta lo que un humano
pediría para ayudarte, sin passwords, listo para pegar donde sea.

| Síntoma | Causa habitual |
|---|---|
| El cliente no llega al connect server | El game server no está en **Start** en el panel, o el firewall del host |
| El cliente conecta pero no lista servers | El connect server está arriba pero el game server no |
| Lista los servers pero no entra al juego | `RESOLVE_IP` mal: el server anuncia una IP que ese jugador no alcanza (ver arriba) |
| Desconexiones al entrar al juego | Mirá los logs de `mu-server`: suele ser data de la config que quedó inconsistente |
| El panel carga y se congela | Reverse proxy sin WebSockets — el `nginx/openmu.conf` de este repo ya los tiene |
| Todo lento | Fijate la RAM: cada game server pesa. Bajá la cantidad a uno |

— Elaborado por GSG
