# Conectar el cliente

OpenMU es **solo el servidor**: no trae cliente, igual que un servidor de Minecraft no trae
el juego. Tenés dos caminos.

## Camino A — Cliente open source (el limpio)

No dependés de archivos de Webzen. Son proyectos activos que hablan el protocolo de OpenMU
por el puerto **44406**:

| Cliente | Qué es |
|---|---|
| [sven-n/MuMain](https://github.com/sven-n/MuMain) | El más alineado con OpenMU (del mismo autor del server) |
| [bernatvadell/muonline](https://github.com/bernatvadell/muonline) | Multiplataforma, .NET + MonoGame |
| [JPZV/MuOnlinux](https://github.com/JPZV/MuOnlinux) | Port a Linux |
| [afrokick/UniMU](https://github.com/afrokick/UniMU) | Cliente Unity3D del 1.04d |

Vienen apuntando a `127.0.0.1:44406`, así que si jugás en la misma máquina del servidor casi
no hay nada que configurar. Ojo: están en desarrollo, no esperes el pulido del cliente original.

## Camino B — Cliente original (Season 6 Ep3, v1.04d)

El cliente clásico se conecta al puerto **44405**. Es software de Webzen: conseguilo por tu
cuenta, este repo no lo distribuye ni te dice de dónde bajarlo.

Para apuntarlo a tu servidor hay que editar la IP del connect server en el cliente (los
launchers de los packs de servers privados suelen traer un campo para eso).

### La trampa clásica: 127.0.0.1

**El cliente original bloquea `127.0.0.1`.** Si servidor y cliente están en la misma máquina,
usá cualquier otro loopback: **`127.0.0.2`**, `127.1.2.3`, lo que sea `127.x.x.x` distinto de
`127.0.0.1`. Es el error que hace perder más tiempo al arrancar.

En Windows puede que tengas que darle de alta ese loopback:
```
netsh interface ipv4 add address "Loopback Pseudo-Interface 1" 127.0.0.2 255.0.0.0
```

## Qué IP poner

| Dónde jugás | IP del connect server |
|---|---|
| Misma máquina que el servidor | `127.0.0.2` (¡no `127.0.0.1`!) |
| Otra PC de tu casa | La IP LAN del servidor (`192.168.x.x`) |
| Un amigo, por Tailscale | La IP `100.x.x.x` que le da Tailscale (ver [`04-operacion.md`](04-operacion.md)) |

## Primer login

Con las cuentas de prueba activadas: usuario `test0`, contraseña `test0`. `testgm` te da
comandos de GM. Si no las creaste, registrá una cuenta desde el cliente (OpenMU la crea sola
en el primer login) o desde el panel.

— Elaborado por GSG
