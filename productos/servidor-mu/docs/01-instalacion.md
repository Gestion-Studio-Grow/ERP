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

Abrí el `.env` y **cambiá los cuatro `CAMBIAME`**. Passwords largos, aunque sea "para vos
nomás": el panel de admin controla el servidor entero, y esa base va a tener tus cuentas.

Los scripts se niegan a levantar si quedó un `CAMBIAME` — a propósito.

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
- **Cuentas de prueba:** dejalas tildadas para probar rápido (crea `test0`…`test9`,
  `testgm`, etc., **con la contraseña igual al usuario**). Después borralas: son cuentas con
  password conocido y algunas son GM. Si el server va a tener gente ajena, ni las crees.

Dale **Install**. Tarda un rato largo (está sembrando miles de registros: monstruos, items,
mapas, drops). No lo interrumpas.

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
| Quiero empezar de cero | `docker compose down -v` borra los volúmenes. **No hay vuelta atrás**: hacé backup antes |

— Elaborado por GSG
