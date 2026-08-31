# El camino propio: construir la season vos mismo

Los documentos 06, 07 y 08 dicen por qué comprar y por qué MuEmu no alcanza.
Este dice **cómo se empieza si igual querés construirla**. Porque es tu decisión,
es legal, y "no se termina" no es lo mismo que "no se empieza".

## La idea

Un emulador no se escribe: se **descubre**. Nadie se sienta a programar Season 21
de memoria. Lo que se hace es poner un servidor propio delante del cliente y ver
qué dice. Cada paquete que entendés es un pedazo de protocolo que pasa a ser
tuyo. Es lento, es acumulativo, y es exactamente lo que hicieron OpenMU y todos
los demás.

La herramienta para eso está en [`../lab-protocolo/`](../lab-protocolo/).

## El límite que no se cruza

Esto se hace **con tu cliente y contra tu servidor**. El cliente de MU Online lo
distribuye Webzen gratis desde su sitio: bajátelo de ahí, es legítimo.

Lo que no se hace: poner el espía en el medio del servidor oficial de Webzen para
sniffear su tráfico, ni decompilar sus binarios. Además de dónde te deja parado,
es un atajo que no sirve: lo que aprendés así queda atado a una versión y no te
enseña el protocolo.

## Paso 1 — Aprendé a leer con un caso donde ya sabés la respuesta

**No arranques por lo desconocido.** Primero poné el espía entre tu cliente de
Season 6 y tu servidor OpenMU, que ya funciona:

```bash
cd lab-protocolo
node espia.mjs --proxy --puerto 45405 --destino 127.0.0.1:44405 --nombre s6-calibracion
```

Apuntá el cliente de S6 al puerto **45405** en vez del 44405. Va a funcionar
igual —el espía pasa todo— pero ahora ves cada paquete de las dos direcciones.

Andá hasta entrar al juego y mirá la captura. Vas a reconocer la secuencia:
el saludo, la lista de servidores, el login, la lista de personajes, la entrada
al mapa. **Compará eso contra la documentación de paquetes de OpenMU**, que para
S6 está completa. Cuando puedas mirar un volcado hexadecimal y decir "esto es el
login", sabés leer. Recién ahí seguí.

Este paso no es opcional y no es pérdida de tiempo: es la única forma de saber si
lo que ves después lo estás interpretando bien o inventando.

## Paso 2 — El primer dato que no tiene nadie

Ahora sí. Bajá el cliente de la season nueva, apuntalo a tu máquina, y poné el
espía a escuchar:

```bash
node espia.mjs --puerto 44405 --nombre s21-primer-contacto
```

Nadie le va a contestar, así que se va a cortar. **Eso está bien.** Lo que
importa es lo que mandó antes de cortarse: los primeros bytes que un cliente
emite sin haber recibido nada son la puerta de entrada al protocolo entero.

Posibles resultados, todos informativos:

| Lo que ves | Lo que significa |
|---|---|
| Nada, ni una conexión | El cliente no llegó a la red. Revisá IP, puerto y firewall **antes** de sacar conclusiones |
| Paquetes `C1`/`C2` legibles | Excelente. El framing es el de siempre y tenés por dónde empezar |
| Todo `C3`/`C4` desde el primer byte | El saludo viene cifrado. Es el escenario duro: hay que resolver el cifrado antes que nada |
| `BASURA` desde el arranque | El framing cambió. Es la peor noticia posible y mejor saberla el día uno |

Ese resultado, que se consigue en una tarde, **vale más que todas las
estimaciones de los documentos anteriores** — incluidas las mías.

## Paso 3 — Escalar los hitos

De ahí en adelante es un ciclo: mirás un paquete que no entendés, deducís qué
pide, escribís la respuesta, y el cliente avanza un paso más. Los hitos, en orden:

1. El cliente **no se corta** al conectarse.
2. Aparece la **lista de servidores**.
3. Llegás a la **pantalla de login**.
4. El login es **aceptado**.
5. Aparece la **lista de personajes**.
6. **Entrás al mapa** y ves tu personaje parado.

Cada uno es una victoria real y verificable. El hito 6 es donde se trabó el autor
de MuEmu, y ahí se quedó: *"client closed on map join"*, marzo de 2023. Que
alguien con años de experiencia en esto haya llegado hasta ahí y no más te dice
dos cosas: que los primeros cinco hitos son alcanzables, y que el sexto es un
muro de verdad.

Después del hito 6 empieza el trabajo largo: combate, inventario, drops,
habilidades, monstruos, mapas, eventos. Ahí es donde viven los persona-años del
documento 06.

## Qué esperar, sin endulzar

- **Los primeros hitos son alcanzables** para una persona con tiempo y ganas.
  No es un salto de fe: es leer, probar y repetir.
- **El juego completo no.** Los números del doc 06 no cambian porque tengas mejores
  herramientas: la traba es descubrir, y descubrir no se paraleliza como el código.
- **Lo que sí ganás:** el mapa del protocolo de una season que hoy no tiene nadie
  escrito en abierto. Eso tiene valor por sí solo, y es publicable.
- **Y si lo abandonás a mitad**, no perdiste: aprendiste a leer un protocolo, que
  es una habilidad que no se te va nunca.

## La honestidad final

Si tu objetivo es **jugar Season 21 con amigos el mes que viene**, este camino no
es el camino: comprá la licencia. Si tu objetivo es **construir algo tuyo y
aprender en serio**, este camino es real, es legal, y empieza con un comando.

Los dos son objetivos legítimos. Son distintos, nada más.

— Elaborado por GSG
