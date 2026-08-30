# Servidor de MU Online privado

Stack listo para levantar tu propio servidor de MU Online en casa (o en un VPS),
con un comando, y operarlo sin depender de nadie: backups, restore, updates.

```bash
cp .env.example .env      # y cambiá los CAMBIAME
./scripts/levantar.sh
```

Panel de administración: `http://127.0.0.1:8080` · El cliente se conecta al puerto `44405`.

---

## Antes que nada: qué es esto y qué NO es

Pediste **"una réplica exacta de la última season, como los que comercializa IGCN"**.
Te digo derecho viejo dónde está el límite, porque cambia lo que recibís:

**Lo que este repo te da (y anda hoy):** un servidor **completo y funcional de Season 6
Episodio 3**, sobre [OpenMU](https://github.com/MUnique/OpenMU) — un emulador **open source
(licencia MIT)**, escrito de cero en C#/.NET, que **no** deriva de binarios de Webzen.
Rates, drops, eventos, spots, balance, cantidad de game servers: todo configurable desde el
panel, igual que en un files comercial. Es gratis, es tuyo, y lo podés modificar.

**Lo que NO te da:** la **última season** (S19/S20) **exacta**. No existe implementación open
source de las seasons nuevas, y "réplica exacta" significa reproducir el servidor comercial
que Webzen tiene corriendo hoy. Eso es justamente lo que venden IGCN y compañía: files
propietarios, con licencia paga y protecciones, derivados del servidor de Webzen. **No voy a
crackear, piratear ni reimplementar esos files** — ni los de IGCN ni los de Webzen.

**Si querés sí o sí una season nueva**, el camino limpio está en
[`docs/05-seasons-nuevas.md`](docs/05-seasons-nuevas.md): comprás la licencia al proveedor y
yo te ayudo con toda la parte de infraestructura, deploy, seguridad, backups y operación —
que es, casualmente, la parte donde la mayoría de los servers privados se cae.

Mi consejo, sin vueltas: **arrancá con esto**. Season 6 Ep3 es la season más jugada de la
historia del juego en servers privados, tenés el código fuente completo para tocar lo que
quieras, y si mañana comprás files de S20 ya vas a tener la infra armada y probada.

---

## Los documentos

| Documento | Para qué |
|---|---|
| [`docs/00-que-estas-montando.md`](docs/00-que-estas-montando.md) | Las piezas, cómo encajan, y la parte legal sin humo |
| [`docs/01-instalacion.md`](docs/01-instalacion.md) | Paso a paso, de cero a servidor andando |
| [`docs/02-cliente.md`](docs/02-cliente.md) | Conectar el cliente del juego |
| [`docs/03-configuracion.md`](docs/03-configuracion.md) | Rates, drops, eventos, game servers, GMs |
| [`docs/04-operacion.md`](docs/04-operacion.md) | Backups, updates, seguridad, jugar con amigos |
| [`docs/05-seasons-nuevas.md`](docs/05-seasons-nuevas.md) | El camino honesto a S19/S20 |

## Los comandos

| Comando | Qué hace |
|---|---|
| `./scripts/levantar.sh` | Levanta todo (valida el `.env` antes) |
| `./scripts/bajar.sh` | Apaga todo, sin tocar los datos |
| `./scripts/estado.sh` | Qué está corriendo (`--logs` para ver logs en vivo) |
| `./scripts/backup.sh` | Backup de la base, con retención de 14 |
| `./scripts/restaurar.sh <archivo>` | Restaura un backup (pide confirmación) |
| `./scripts/actualizar.sh` | Backup + pull + recreate |

## Requisitos

- **Docker** con el plugin `compose` (Docker Desktop en Windows/Mac ya lo trae).
- **~4 GB de RAM libres** y ~5 GB de disco para arrancar cómodo.
- **El cliente del juego** — el servidor no lo incluye. Ver [`docs/02-cliente.md`](docs/02-cliente.md).
- Windows, Linux o Mac: al ir todo en contenedores, da igual.

---

**Estado de verificación:** los archivos de este stack están escritos contra la documentación
oficial de OpenMU, pero **no se levantaron end-to-end** todavía (el entorno donde se armaron no
tiene daemon de Docker). El primer `./scripts/levantar.sh` en tu máquina es la prueba real; si
algo chilla, los logs lo van a decir y se ajusta.

— Elaborado por GSG
