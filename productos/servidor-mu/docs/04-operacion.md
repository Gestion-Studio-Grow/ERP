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

### La opción riesgosa: abrir puertos en el router

Si hacés port forwarding de 44405 y 55901-55906, tu servidor queda visible en internet, lo
van a escanear en cuestión de horas, y OpenMU está en desarrollo — no está endurecido contra
alguien que quiera romperlo. Si aun así lo hacés:

- **Nunca** expongas el panel de admin (`PANEL_BIND_ADDR` se queda en `127.0.0.1`; si lo
  necesitás remoto, entrá por Tailscale o por un túnel SSH).
- Abrí **solo** los puertos del juego, ninguno más.
- Borrá las cuentas `test*` antes, no después.

### Túnel SSH al panel, desde otra máquina

```bash
ssh -L 8080:127.0.0.1:8080 usuario@ip-del-servidor
```
Y abrís `http://127.0.0.1:8080` en tu navegador local.

## Higiene de seguridad

- Passwords largos en el `.env` (el archivo está en `.gitignore`: no lo commitees nunca).
- La base **no publica el puerto 5432**: solo se la habla desde la red interna de Docker.
- El panel escucha en loopback por defecto. Si lo cambiás, sabé lo que estás haciendo.
- Cuentas `test*` borradas apenas terminaste de probar.

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
