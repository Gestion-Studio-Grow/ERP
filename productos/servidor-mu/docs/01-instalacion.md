# Instalación, de cero a servidor andando

## 1. Docker

- **Windows / Mac:** instalá [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  y abrilo (tiene que quedar corriendo, con la ballena en la barra).
- **Linux:** `curl -fsSL https://get.docker.com | sh` y después
  `sudo usermod -aG docker $USER` (cerrá sesión y volvé a entrar).

Comprobá: `docker compose version` tiene que responder algo.

## 2. El `.env`

```bash
cd productos/servidor-mu
cp .env.example .env
```

Abrí el `.env` y **cambiá los dos `CAMBIAME`** (el password de la base y el del panel).
Passwords largos — solo letras, números, `-` y `_` — aunque sea "para vos nomás": el panel
de admin controla el servidor entero, y esa base va a tener tus cuentas.

Si vas a jugar con amigos por Tailscale, ajustá también `RESOLVE_IP` (está explicado en el
mismo `.env`). Para jugar en tu casa/LAN, el default ya está bien.

Los scripts se niegan a levantar si quedó un `CAMBIAME` — a propósito. Y también se niegan
si tocaste `PANEL_BIND_ADDR` para que el panel de admin escuche fuera de esta máquina: eso
necesita un `PANEL_EXPONER_A_LA_RED=si` explícito, y está explicado en
[`04-operacion.md`](04-operacion.md#seguridad-en-serio). El panel controla el servidor entero;
la idea es que nunca quede abierto por copiar un `.env` de otro lado.

## 3. Levantar

```bash
./scripts/levantar.sh
```

La primera vez baja ~1 GB de imágenes. Después arranca en segundos.

Si algo no levanta: `./scripts/estado.sh --logs`.

## 4. El Setup (solo la primera vez)

Entrá a **http://127.0.0.1:8080** y logueate con el `OPENMU_ADMIN_USER` /
`OPENMU_ADMIN_PASSWORD` del `.env`.

Vas a caer en la página de **Setup**. Ahí elegís:

- **Versión del juego:** `Season 6 Episode 3 (English)` — es la que está completa.
- **Cantidad de game servers:** 1 alcanza y sobra para uso privado. Cada uno es un "canal"
  más en la lista y consume RAM.
- **Cuentas de prueba: DESTILDALAS.** Crean `test0`…`test9`, `test300`, `test400`, `testgm`,
  `testgm2` y alguna más, **todas con la contraseña igual al nombre de usuario**, y las
  `testgm*` son **Game Master**. O sea: cualquiera que sepa que existe OpenMU prueba
  `testgm/testgm` y se convierte en GM de tu servidor. Crear tu cuenta a mano desde el panel
  (**Accounts → Create**) te lleva treinta segundos y te ahorra el agujero.
  Si igual las tildaste para probar rápido: **borralas hoy**, no "cuando termine".

Dale **Install**. Tarda un rato largo (está sembrando miles de registros: monstruos, items,
mapas, drops). No lo interrumpas. Ojo: correr el Setup de nuevo más adelante **borra todo lo
que haya en la base** (cuentas, personajes, config) — es para instalar, no para reconfigurar.

**Mientras dura el Setup, la base está vacía y el panel no tiene contra qué autenticarte.**
Con el default (`PANEL_BIND_ADDR=127.0.0.1`) eso no importa: el único que llega al panel sos
vos. Pero es la razón por la que **el Setup se hace antes de abrir nada**, nunca después.

## 5. Arrancar los servidores

En el panel, sección **Servers**: dale **Start** al connect server, al chat server y al game
server. Cuando el game server queda en verde, ya podés entrar con el cliente.

Seguí con [`02-cliente.md`](02-cliente.md).

## Si algo sale mal

| Síntoma | Qué mirar |
|---|---|
| `levantar.sh` dice que falta el `.env` | `cp .env.example .env` y cambiá los CAMBIAME |
| El panel no abre | `./scripts/estado.sh` — ¿está `mu-panel` arriba? Los logs de `mu-server` te dicen si murió al arrancar |
| "port is already allocated" | Otro programa usa ese puerto. Cambiá `PANEL_PORT` en el `.env` |
| El Setup se cuelga | Miralo con `./scripts/estado.sh --logs`: casi siempre es la base todavía inicializando |
| No sé ni por dónde empezar | `./scripts/diagnostico.sh` junta todo (estado, logs, disco) en una salida para leer o pegar pidiendo ayuda |
| Quiero empezar de cero | `docker compose down -v` borra los volúmenes. **No hay vuelta atrás**: hacé backup antes |

— Elaborado por GSG
