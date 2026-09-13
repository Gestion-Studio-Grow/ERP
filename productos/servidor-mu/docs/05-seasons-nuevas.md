# "Quiero la última season, exacta"

Es un pedido razonable y merece una respuesta derecha, no una excusa.

## Por qué no te la puedo entregar

**No existe en open source.** OpenMU es el emulador libre más avanzado que hay y llega a
**Season 6 Episodio 3**. De ahí para arriba (S9, S13, S16, S18, S19, S20…) no hay ninguna
implementación libre, y no es por falta de ganas: cada season suma protocolo nuevo, sistemas
nuevos y data nueva, y reproducir eso desde cero es trabajo de años de un equipo.

**"Réplica exacta" quiere decir el servidor de Webzen.** Los files que venden IGCN y los
demás proveedores no son reimplementaciones: son el servidor comercial de Webzen, obtenido y
adaptado, y revendido con licencia y protecciones propias. Ahí no entro: no voy a piratear ni
crackear esos files, ni los de IGCN ni los de Webzen. No es prudencia excesiva — es que el
producto que estarías pidiendo *es* la copia de un producto ajeno.

## Los caminos que sí existen

### 1. Season 6 con OpenMU (lo que ya tenés en esta carpeta)

Gratis, legal, con el código fuente para tocar lo que quieras. Para jugar en privado con
amigos es, de lejos, la mejor relación resultado/dolor de cabeza. Y S6 Ep3 sigue siendo la
season más jugada en servers privados: no es un premio consuelo.

### 2. Comprar la licencia de files de season nueva

Si querés S19/S20 sí o sí, se compra. IGC-Network y otros proveedores venden files con
soporte; hay planes desde el orden de los cientos de dólares. Vas a necesitar además:

- Un **VPS con Windows Server** (esos files son Windows, no Linux/Docker) — presupuestá
  bastante más que lo que te sale correr esto.
- El **cliente de la season correspondiente**, que te da el proveedor.
- **SQL Server**, no PostgreSQL.

Nada de eso corre en el stack de esta carpeta: es otra arquitectura entera.

**En eso sí te acompaño de punta a punta:** dimensionar el VPS, dejar el server endurecido,
armar backups automáticos, monitoreo, el proceso de update, y todo lo de operación. Que es —
mirá vos — justo donde se cae la mayoría de los servers privados que sí tienen los files
buenos. Lo que no hago es la parte de conseguir o destrabar los files.

### 3. Empujar OpenMU hacia arriba

Es open source. Se puede aportar protocolo y sistemas de seasons posteriores, y de hecho hay
features nuevas portadas como plugins. Es un proyecto largo, pero si lo que te copa es la
parte técnica, es el camino más interesante de los tres.

**¿Qué tan largo es "largo"?** Está medido con números en
[`06-viabilidad-season-nueva.md`](06-viabilidad-season-nueva.md): cuánto costó OpenMU llegar
a S6, cuánto es el salto S6→S21, qué otro emulador open source apunta más alto, y la
estimación en persona-años de construir una season nueva por el camino limpio.

## La recomendación

**Arrancá con el punto 1.** Levantás el servidor hoy, jugás esta semana, y aprendés operando:
rates, eventos, backups, cómo entran tus amigos. Si más adelante comprás files de S20, la
infra, el proceso y los reflejos ya los vas a tener. Al revés — empezar comprando files de una
season nueva sin haber operado nunca un servidor — es la receta para tener un VPS caro apagado
en dos meses.

— Elaborado por GSG
