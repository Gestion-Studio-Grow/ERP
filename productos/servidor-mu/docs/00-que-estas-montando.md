# Qué estás montando

## Las piezas

```
   Cliente MU  ──44405──▶  ┌──────────────────────────────┐
   (tu PC)                 │  mu-server  (OpenMU)         │
                           │  ├─ connect server   44405/6 │
   Navegador   ──8080──▶   │  ├─ game servers  55901-55906│
   (panel)         │       │  ├─ chat server         55980│
                   │       │  ├─ login server             │
              ┌────▼─────┐ │  └─ admin panel         8080 │
              │ mu-panel │ └──────────────┬───────────────┘
              │ (nginx)  │                │
              └──────────┘         ┌──────▼──────┐
                                   │   mu-db     │
                                   │ PostgreSQL  │
                                   └─────────────┘
```

**Tres contenedores:**

- **`mu-server`** — OpenMU entero. El *connect server* es lo primero que toca el cliente: le
  devuelve la lista de servers. Los *game servers* son los "canales" que ves en la lista.
- **`mu-db`** — PostgreSQL. Acá viven las cuentas, los personajes, los items y **toda la
  configuración del juego** (rates, drops, monstruos, mapas). Por eso el backup de la base
  es el backup del servidor: no hay archivos de config sueltos que copiar.
- **`mu-panel`** — nginx delante del admin panel. Está para que el panel **no** quede
  publicado directo: por defecto escucha solo en `127.0.0.1`.

## Por qué la base guarda la configuración

En los files comerciales editás `.ini` y `.txt` y reiniciás. OpenMU se maneja distinto:
todo el modelo del juego (cada monstruo, cada item, cada skill, cada mapa) está en la base,
y se edita desde el panel. Ventaja: cambiás rates sin reiniciar y sin romper un `.ini` a mano.
Consecuencia: **si perdés la base, perdiste el servidor**. De ahí que `backup.sh` sea el
script más importante de la carpeta.

## La parte legal, sin humo

- **OpenMU es MIT.** Es software libre, escrito de cero, explícitamente no derivado de
  binarios de Webzen. Usarlo, modificarlo y correrlo es legítimo.
- **El cliente de MU Online es de Webzen.** El servidor no lo incluye ni lo puede incluir.
  Hay clientes open source (ver `02-cliente.md`) que evitan el tema del todo.
- **Un server privado abierto al público es otra cosa.** Mientras sea para vos y tus amigos,
  en tu casa, es lo mismo que cualquier server de juego autohospedado. Si un día lo abrís al
  público, y peor si cobrás, entrás en el terreno donde Webzen manda cartas documento — y ahí
  ya no es un tema técnico.
- **Lo que no vas a encontrar acá:** nada para crackear, parchear o evadir la licencia de
  files comerciales (IGCN u otros). Si querés esos files, se compran.

— Elaborado por GSG
