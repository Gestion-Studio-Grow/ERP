# Ecosistema de MuEmu — ¿hay comunidad atrás, o es un repo lindo y nada más?

**Pregunta:** antes de adoptar [Yomalex/MuEmu](https://github.com/Yomalex/MuEmu) para un server privado
de amigos en season alta, ¿qué hay alrededor? Cliente, comunidad, gente que lo levantó, alternativas y
qué pasa el día que el autor se cansa.

**Respuesta corta: el código puede estar bueno — eso lo mira otro —, pero el ECOSISTEMA no existe.
Un solo autor, actividad en caída libre (69 commits en 2021 → 1 en lo que va de 2026), 1 issue abierto
sin responder desde abril, el único aporte externo que tocaba S17 fue rechazado con tres palabras, cero
forks con trabajo propio, cero reportes de terceros que lo hayan levantado, y ningún cliente abierto que
hable seasons altas. Para S6 tenés OpenMU con 82 contribuidores y un Discord de 1.834 personas. Para S16/S17
tenés a una persona en Ecuador que hace un año y medio no toca esa parte del código.**

Todo lo **[VERIFICADO]** tiene fuente. Lo **[INFERIDO]** está marcado.

**Alcance y límite duro:** este informe cubre el ecosistema (comunidad, mantenimiento, alternativas
abiertas). **No** trata de dónde conseguir clientes, files comerciales ni software filtrado, y no lleva
links de ese tipo. Cuando algo relevante cae en esa categoría, se nombra como *categoría excluida* y sin
URL, justamente para que quede claro que no es un camino.

---

## 0. Qué pude mirar y qué no (para que puedas descontar)

| Fuente | Estado |
|---|---|
| GitHub (páginas web: repo, issues, PRs, forks, topics, perfiles) | OK |
| Clone local de MuEmu (git log, configs) | OK |
| `api.github.com` | **Bloqueada** desde esta red (HTTP 403 del proxy) — todo lo de GitHub sale de las páginas HTML |
| **RaGEZONE** (`forum.ragezone.com`), el foro histórico del rubro | **Bloqueado por política de egress** de la red. No pude leer los hilos; solo tengo los títulos y snippets que devuelve el buscador |
| Discord (`discord.com`) | **Bloqueado**. No pude verificar si el Discord que linkea MuEmu sigue vivo |
| `muemu.tech` | **Bloqueado** |

Los tres bloqueos pegan justo donde vive la comunidad de MU. Lo digo de entrada: la sección 3
(experiencias de terceros) es la más débil del informe por eso, y lo que afirmo ahí está acotado a
lo que sí pude ver.

---

## 1. El problema del cliente: qué necesitás y si existe algo abierto

### 1.1 Qué cliente pide MuEmu, season por season

MuEmu trae un directorio `ClientConfig/` con un archivo `.ini` por **build exacto de cliente**
([árbol del repo](https://github.com/Yomalex/MuEmu/tree/master/ClientConfig)) — medido en el clone,
**[VERIFICADO]**:

| Archivo de config | Build de cliente | Season a la que corresponde |
|---|---|---|
| `Config_1.4.5.0.ini` | 1.04.05 | seasons viejas (el propio log del repo habla de "S3 Client" en dic-2025) |
| `Config_1.5.25.0.ini` | 1.05.25 | **Season 9** — el ejemplo del README usa `<Season>Season9Eng</Season>` con `<Version>10525</Version>` ([README](https://github.com/Yomalex/MuEmu/blob/master/README.md)) |
| `Config_1.18.70.0.ini` | 1.18.70 | S12–S15 **[INFERIDO** por el número de build**]** |
| `Config_1.19.46.0.ini` | 1.19.46 | **Season 16** — confirmado por un proyecto independiente: [MuClientTools16](https://github.com/VDraven/MuClientTools16) dice trabajar con "test files obtained from client Lgd_Test (1.19.46)" para *Season 16 part 1.1* |
| `config_1.19.74.0.ini` / `config_1.19.75.0.ini` | 1.19.74 / 1.19.75 | **Season 17** — el commit del propio autor dice *"New protocol for client S17kor 1.19.75"* (17/03/2024) y la rama se llama `Season17-75` |

Traducido: **una season = un build puntual del cliente oficial de Webzen**. No es "el cliente de S17",
es *ese* .exe con *ese* número de versión. Cambiás de season, cambiás de cliente.

Y hay algo más pesado: esos `.ini` **no son configuración de red, son direcciones de memoria**. Ejemplo
real del archivo de S16 (`Config_1.19.46.0.ini`): secciones `[OFFSET]` con `SendS16=00CEB249`,
`CoreA=00D23872`, `ParsePacket=...`, más `[CheckIntegrity]`, y en el de S12 hasta `[JUMPS]` y `[Call]`
con parches de direcciones. **[VERIFICADO** — leído en el clone**]**. Es decir: MuEmu no solo necesita el
cliente oficial, necesita **parchearlo en memoria en direcciones hardcodeadas**. Si el cliente que
conseguís no es *exactamente* el build para el que están calculados esos offsets, no arranca. **[INFERIDO
de lo anterior, pero es la mecánica estándar de esta técnica]**.

**Y no termina en el cliente:** el README, última línea, dice que el emulador *"requires common files from
MuOnline servers, it is designed to read Season 6 version files"* — o sea que además del cliente necesitás
los **archivos de datos de un paquete de servidor** existente (items, monstruos, mapas) para alimentarlo.
**[VERIFICADO** — [README](https://github.com/Yomalex/MuEmu/blob/master/README.md)**]**.

### 1.2 ¿El proyecto documenta esto?

**No.** **[VERIFICADO]**

- No hay carpeta `docs/`, ni wiki, ni guía de instalación en el repo (revisado en el clone).
- El issue [#15 "Do you have an installation tutorial?"](https://github.com/Yomalex/MuEmu/issues/15)
  (abierto 01/12/2025) se cerró el 27/06/2026 — siete meses después — sin respuesta visible.
- Cuatro de los once issues cerrados son gente trabada exactamente acá:
  [#2 "Client"](https://github.com/Yomalex/MuEmu/issues/2),
  [#7 "How to start game Client?"](https://github.com/Yomalex/MuEmu/issues/7),
  [#12 "Client connecting to server ERROR"](https://github.com/Yomalex/MuEmu/issues/12),
  [#14 "Client S9 not connecting to the server"](https://github.com/Yomalex/MuEmu/issues/14).
  Es el patrón dominante del tracker.
- **Bandera roja de higiene:** el único puntero a "cliente" que da el README es un link a **otro repo del
  propio autor** que republica el **paquete de un proveedor comercial de files** (sin licencia, con carpeta
  de cliente adentro). **No reproduzco ese link y no es un camino** — lo menciono solo porque dice algo del
  proyecto: la vía que el README insinúa para conseguir cliente es material de terceros redistribuido, no
  algo abierto. **[VERIFICADO** que el link existe en el README y que apunta a un repo sin licencia con
  material de un vendor comercial**]**.

### 1.3 ¿Existe algún cliente open source para seasons altas?

**No. Ninguno.** Lo que hay, todo, habla **protocolo Season 6 o más viejo**:

| Cliente abierto | Qué es | Protocolo que habla |
|---|---|---|
| [sven-n/MuMain](https://github.com/sven-n/MuMain) (264★, activo 29/08/2026) | cliente C++ del autor de OpenMU | S6 Ep3 |
| [bernatvadell/muonline](https://github.com/bernatvadell/muonline) (129★, .NET 10 + MonoGame, 687 commits) | cliente cross-platform | **S6** — el README es explícito: usa *assets* de Season 20 (1.20.61) pero la red es "Season 6 (S6) protocol implementation" |
| [xulek/muonline](https://github.com/xulek/muonline) (49★, act. 06/08/2026) | cliente MonoGame | S6 |
| [afrokick/UniMU](https://github.com/afrokick/UniMU) | cliente Unity3D | v1.04d |
| [xulek/MuOnlineConsoleClient](https://github.com/xulek/MuOnlineConsoleClient) | cliente de consola sobre la librería de red de OpenMU | S6 |

**[VERIFICADO]** en cada caso por la descripción/README del repo.

El caso de `bernatvadell/muonline` es el más ilustrativo de todos: **puede renderizar assets de Season 20
pero habla S6**. Es la prueba de dónde está la frontera real — lo que la comunidad abierta sabe hacer es
*dibujar* contenido nuevo, no *hablar* el protocolo nuevo.

De seasons altas lo único abierto que apareció es **herramienta de archivos de cliente, no cliente**:
[MuClientTools16](https://github.com/VDraven/MuClientTools16) (MIT, C++, 98★, última actualización jul-2022),
[VDraven/MuOnline-WorldEditor](https://github.com/VDraven/MuOnline-WorldEditor) (editor in-game para S16e1)
y [Maikiller/Mu_Editor_Season16](https://github.com/Maikiller/Mu_Editor_Season16). Sirven para
extraer/convertir formatos, no para jugar.

> **En una línea:** para cada season, MuEmu necesita un build específico del cliente oficial de Webzen
> parcheado en memoria — y **no existe ningún cliente open source que hable arriba de S6**, así que del
> lado del cliente no hay salida limpia para S9/S12/S16/S17.

---

## 2. Señales de vida del proyecto

### 2.1 La curva de actividad (lo más elocuente del informe)

Commits por año, contados en el clone — **[VERIFICADO]**:

| Año | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|
| Commits | 11 | 15 | 50 | **69** | 51 | 13 | 21 | **4** | **1** |

- Primer commit: **07/04/2018**. Último: **11/01/2026** ("Added support for client version 1.4.5.0").
- Total: **235 commits** en 8 años.
- Autoría: **Camejo Yomar = 232 commits (98,7%)**; un segundo contribuidor (Francisco Gonzales /
  linuxer41) con 2; dependabot con 1. **Bus factor = 1.**

**Y el dato que más importa para quien quiere S16/S17:** el trabajo reciente va **hacia atrás**, no hacia
adelante. Los últimos tres commits sustantivos son *"basic support to S3 Client"* (dic-2025) y *"support for
client version 1.4.5.0"* (ene-2026). **[VERIFICADO** en el git log**]**.

### 2.2 La línea de tiempo de S16/S17, en palabras del propio autor

Del git log, filtrando por season **[VERIFICADO]**:

- **24/03/2022** — "Season 17 Base working, loginbox don't appear"
- **30/03/2022** — "Season 16 working login, character select, join map"
- **05/03/2023** — "Client Season 17 Working Select Character, **Client closed on map join**"
- **17/03/2024** — "New protocol for client S17kor 1.19.75 added some packets"
- **07/06/2025** — "CashShop Buy item working, **S16 Tested**"

O sea: el último registro concreto de S17 lo deja **crasheando al entrar al mapa** (2023) y con "algunos
paquetes" agregados (2024). Desde marzo de 2024 **no hay un solo commit que mencione S17**. La rama
[`Season17-75`](https://github.com/Yomalex/MuEmu/branches/all) quedó congelada en **19/03/2024**.
**[VERIFICADO]**

### 2.3 Issues: 12 en ocho años

**[VERIFICADO]** ([tracker](https://github.com/Yomalex/MuEmu/issues?q=is%3Aissue)):

- **1 abierto:** [#16 "Season 17 Korean"](https://github.com/Yomalex/MuEmu/issues/16), del 30/04/2026.
  Un tipo pregunta el estado de la interacción con el cliente S17 **porque quiere contribuir**.
  **Cuatro meses después (31/08/2026) sigue sin respuesta.** Esto es lo peor que le puede pasar a un
  proyecto: llega un voluntario y no hay nadie del otro lado.
- **11 cerrados**, varios en tandas el mismo día (#13 y #14 los dos el 25/03/2025; #7 y #9 los dos el
  12/01/2024), lo que parece limpieza periódica más que resolución caso por caso **[INFERIDO]**.
- En ninguna de las páginas de issues que abrí aparecen respuestas del mantenedor. Lo marco como
  **[INFERIDO]**: el renderizado de GitHub que puedo leer no siempre trae los comentarios (en los PR sí
  los trajo), así que no puedo jurar que no haya respondido nunca — pero sí que no hay conversación
  visible en el tracker.

### 2.4 Pull requests: el dato más filoso

Solo 3 PRs en toda la vida del repo **[VERIFICADO]**
([lista](https://github.com/Yomalex/MuEmu/pulls?q=is%3Apr)):

| # | Título | Autor | Resultado |
|---|---|---|---|
| 5 | Bump Newtonsoft.Json | dependabot | mergeado (dic-2022) |
| 11 | Set skill values | linuxer41 | mergeado (mar-2024) |
| **10** | **"Fix s17 protocols 80%"** | **cobyzero** | **CERRADO SIN MERGE** |

El [PR #10](https://github.com/Yomalex/MuEmu/pull/10) es *exactamente* el aporte que necesitaría alguien
que quiere S17: 7 commits arreglando protocolos de Season 17, abierto el 14/03/2024 contra la rama
`Season17-75`. Se cerró el 24/03/2024 con el comentario del dueño: **"can't be merged"**. Sin
contrapropuesta ni seguimiento visible. **[VERIFICADO]**

**[INFERIDO]** Diez días abierto, tres palabras de respuesta y a la basura: es el desenlace típico de
proyectos de un solo autor sobre una base que solo él entiende. El contribuidor (cobyzero) siguió por su
cuenta — hoy tiene repos propios de MU ([MuSeason13](https://github.com/cobyzero/MuSeason13),
[MuEvi](https://github.com/cobyzero/MuEvi), MuRemake) — pero **fuera** de MuEmu.

### 2.5 Forks: 77 en total, ninguno vivo

De los [forks](https://github.com/Yomalex/MuEmu/forks?include=active&sort=stargazers), GitHub lista **11
"activos" en los últimos 2 años**. Fui a ver los dos más recientes:

- [lchannng/MuEmu](https://github.com/lchannng/MuEmu) (jul-2026): **235 commits** = idéntico al upstream.
- [TubroDog/MuEmu](https://github.com/TubroDog/MuEmu) (abr-2026): **235 commits** = idéntico al upstream.
- [ADMTec/MuEmu-1](https://github.com/ADMTec/MuEmu-1) (jun-2025): **232 commits** = *atrasado* respecto del
  upstream.

**[VERIFICADO]. Ningún fork tiene un solo commit propio.** La fecha de "Updated" de un fork no es trabajo;
es haberlo clonado. **No hay un fork más vivo que el original: no hay ningún fork vivo, punto.**

### 2.6 Releases y presencia

- **Un solo release en 8 años**: [v0.1.0-alpha "Server Test Release"](https://github.com/Yomalex/MuEmu/releases),
  pre-release, para "a client 1.06.35", pidiendo **.NET Core 2** (framework que ya está fuera de soporte).
  **[VERIFICADO]**
- **147★ / 77 forks** ([topic muonline](https://github.com/topics/muonline)). Comparación en la misma
  página: OpenMU **1.2k★**, actualizado el 30/08/2026. **[VERIFICADO]**
- El autor: [Camejo Yomar](https://github.com/Yomalex), Ecuador, se define "Mechanic Engineer with love for
  games and programming", 32 seguidores, y **el perfil avisa "I may be slow to respond"**. **[VERIFICADO]**
  Es un hobbista, y lo dice él. No es una crítica: es el dato con el que hay que calibrar la expectativa.
- El README tiene un badge de **Discord** (invite `Yfwu8hQ`). No pude verificar si el server sigue vivo
  (discord.com bloqueado desde esta red). Dato indirecto: en el issue
  [#3 "Status."](https://github.com/Yomalex/MuEmu/issues/3) (jun-2021) ya pedían **actualizar el link de
  invitación**. **[NO VERIFICADO]**
- Referencia de contraste: el Discord de **OpenMU** figura con **1.834 miembros**
  ([invite público](https://discord.com/invite/2u5Agkd), dato del buscador — tampoco pude entrar).

---

## 3. Experiencias reales de terceros: no encontré ninguna

Busqué en inglés, español y portugués: reportes de instalación, reviews, videos, hilos de foro. **No
encontré un solo reporte fundamentado de alguien que haya levantado Yomalex/MuEmu y contado cómo le fue.**
**[VERIFICADO en el sentido de "busqué y no aparece"; no es prueba de que no exista]**

Lo que sí encontré, y conviene saberlo antes de googlear:

- **⚠️ Hay una colisión de nombres que envenena toda la búsqueda.** Existe **"MUEMU" (muemu.tech)**, un
  producto **distinto y comercial** de files de MuOnline (S1/S6/S9/S12), con canal de YouTube propio
  ([MUEMU Servers](https://www.youtube.com/channel/UCswVZPdykxPcmeMi6pRb_ow)), hilo propio en RaGEZONE
  ("MUEMU TECH EMULATOR") y versión 6.1.2.1 de mayo de 2026. **Casi todo el contenido comunitario que
  aparece buscando "MuEmu" —videos, tutoriales, hilos— es de ESE producto, no del repo de Yomalex.**
  No lo evalúo (files comerciales = fuera de alcance) y no linkeo el sitio; lo marco para que no confundas
  la actividad de uno con la del otro. **[VERIFICADO** que son proyectos distintos: uno es un repo MIT en
  GitHub, el otro un producto comercial con su propio sitio y versionado**]**
- En RaGEZONE aparecen hilos cuyo título menciona MuEmu como *fuente para desarrollar* ("Clarification about
  Mu Online files / emulators / developers", "MU Online C# Emulator"), pero **no pude leerlos**: el foro
  está bloqueado por la política de egress de esta red. Queda como **[NO VERIFICADO]**.
- Los issues del repo son, indirectamente, los únicos "reportes de uso" que hay: gente de 2020 a 2026
  intentando conectar el cliente y trabándose (#2, #6, #7, #12, #14). Todos cerrados sin solución visible.
  **[VERIFICADO]**

**Lectura [INFERIDA]:** 147 estrellas y 77 forks con cero forks trabajando, cero reportes de terceros y un
tracker que solo junta gente trabada = **el patrón clásico de "proyecto que se mira, no que se usa"**.
Ojo, esto es *ausencia de evidencia*, no evidencia de ausencia — y con RaGEZONE bloqueado, el margen de
error acá es real.

---

## 4. ¿Se nos escapó algún otro proyecto abierto apuntando a seasons altas?

Busqué en inglés, español, portugués, ruso y chino (奇迹MU), más los índices
[topic `muonline`](https://github.com/topics/muonline) (34 repos) y
[topic `mu-online`](https://github.com/topics/mu-online) (19 repos), leídos completos. Resultado:

| Proyecto | Lenguaje | Licencia | Season declarada | Última actividad | ¿Vivo? |
|---|---|---|---|---|---|
| [MUnique/OpenMU](https://github.com/MUnique/OpenMU) | C# | MIT | S6 Ep3 | 30/08/2026 | **Sí, muy vivo** (1.2k★) |
| [Yomalex/MuEmu](https://github.com/Yomalex/MuEmu) | C# | MIT | S6/S9/S12/**S16/S17** | 11/01/2026 | Técnicamente sí, en la práctica dormido |
| [cobyzero/MuSeason13](https://github.com/cobyzero/MuSeason13) | C++ | sin licencia declarada | **S13** | jul-2025 | **No** — 5 commits, 0★, sin README |
| [cobyzero/MuEvi](https://github.com/cobyzero/MuEvi) | Unity/ShaderLab | s/d | cliente Unity | ago-2025 | Experimento personal |
| [actfuns/mu_server](https://github.com/actfuns/mu_server) | s/d | s/d | 全民奇迹 (**MU Origin, el juego móvil**) | 19 commits, 11★ | No aplica: otro juego |
| [mikiones/MuOnline](https://github.com/mikiones/MuOnline) | Java | Apache-2.0 | descendiente del viejo "OpenMu" de Google Code | 144 commits, 1★ | **Abandonado** |
| [kyleruss/emu-server](https://github.com/kyleruss/emu-server) | C++ | — | S6 | **may-2018** | **Muerto** |
| [tehKaiN/muserver](https://github.com/tehKaiN/muserver) | C | — | from scratch | **dic-2017** | **Muerto** |
| [darfink/muonline-packet](https://github.com/darfink/muonline-packet) | Rust | — | estructura de paquetes | **ene-2019** | **Muerto** |
| [kessiler/muOnline-season6](https://github.com/kessiler/muOnline-season6) | C++ | s/d | S6 | 47 commits, 92★ | Sin actividad reciente |

**[VERIFICADO]** — fechas y estrellas de las páginas de topics y de cada repo.

**Conclusión de la búsqueda: no apareció ningún proyecto nuevo relevante.** El único hallazgo genuino es
**cobyzero** — el mismo tipo del PR de S17 rechazado — que armó `MuSeason13` (C++, 5 commits, sin README,
0 estrellas). Es un embrión, no una alternativa. **El cuadro del doc 06 sigue en pie: MuEmu es el único
proyecto open source que apunta arriba de S6, y sigue siendo una persona.**

**Categoría que quedó excluida por regla, y que conviene que sepas identificar:** buscando "season 16/17/18
open source" aparecen varios repos de GitHub que en realidad **republican paquetes de emuladores
comerciales o filtrados** (suites de vendors conocidos, "customization from" tal source), **sin licencia**.
No los listo, no los linkeo y no son una opción — pero son la mayoría de lo que un buscador te va a
devolver si buscás "MU season 16 open source". Que algo esté en GitHub no lo hace abierto: **licencia o
nada**. **[VERIFICADO** que existen repos así, con descripciones que acreditan el origen comercial**]**

---

## 5. El costo real de un emulador de un solo mantenedor

### El patrón, con los datos de arriba

Los emuladores de MU tienen un cementerio bastante prolijo y todos murieron igual: **[VERIFICADO** las
fechas; **INFERIDO]** el patrón:

1. **Un autor arranca fuerte** (MuEmu: 50 y 69 commits en 2020-2021).
2. **La curva cae** cuando el hobby compite con la vida (MuEmu: 13 en 2023, 4 en 2025, 1 en 2026).
3. **Llega un voluntario y rebota**: el aporte externo no se puede integrar porque solo el autor entiende
   la base (PR #10, "can't be merged"). El voluntario se va a hacer lo suyo (cobyzero → MuSeason13).
4. **Nadie forkea de verdad.** Los 77 forks de MuEmu tienen exactamente cero commits propios. Forkear no
   es continuar: continuar es entender 52.000 líneas de otro sin documentación.
5. **El repo queda de museo.** Igual que emu-server (2018), muserver (2017), muonline-packet (2019),
   mikiones/MuOnline — que ya era el descendiente huérfano de un "OpenMu" anterior alojado en Google Code.
   Esa cadena se repitió al menos una vez y terminó igual.

**El contraejemplo que confirma la regla es OpenMU**, y vale la pena mirar *por qué* sobrevivió: está en una
**organización** (MUnique) y no en una cuenta personal, tiene **82 contribuidores** (aunque el líder haga el
67%), documentación de protocolo generada (501 archivos de paquetes), un Discord con **1.834 personas** y
diez años de continuidad. Aun así, el bus factor de OpenMU **también** es alto — la diferencia es que si
sven-n se va, hay 81 personas que tocaron el código, una org que puede dar permisos y una comunidad que se
entera. En MuEmu, si Yomar deja de aparecer, **no se entera nadie y no hay a quién darle las llaves**.
**[VERIFICADO** los números de OpenMU (doc 06 + repo); **INFERIDO** la comparación**]**

### Qué significa en la práctica, para vos

**[INFERIDO, pero es aritmética simple]** Adoptar MuEmu para S16/S17 te deja como **único responsable de
soporte**: no hay foro, no hay Discord verificable, no hay guía de instalación, no hay releases usables
(el único es alpha de .NET Core 2), no hay nadie que haya publicado cómo lo levantó, y el propio autor
avisa que responde lento. Cada cosa que se rompa la arreglás vos leyendo C# ajeno — y encima con la parte
S17 en el estado que el propio git log describe: *"client closed on map join"*.

---

## 6. Veredicto

**El ecosistema de MuEmu no alcanza para adoptarlo como base de un server de amigos en season alta.** No es
por la calidad del código (eso lo evalúa el otro frente); es porque **alrededor no hay nada**: un autor
hobbista que se corrió a otras seasons, cero comunidad, cero forks activos, cero reportes de uso, el único
aporte de S17 rechazado y ningún cliente abierto que hable seasons altas.

Ordenado por lo que realmente decide:

1. **El cliente es el tapón, y es infranqueable por vía limpia.** Para jugar S16/S17 necesitás un build
   exacto del cliente oficial parcheado en memoria + archivos de datos de un paquete de servidor. Ningún
   proyecto abierto llega ahí, y el mejor cliente open source que existe (MonoGame, 129★, activo) elige
   renderizar assets modernos **hablando S6**. Esa elección, hecha por gente que sabe, es la respuesta a la
   pregunta.
2. **La actividad dice "dormido", no "muerto"** — pero dormido para lo que a vos te importa: lo último que
   tocó el autor son clientes viejos (S3, 1.04.05), no S17.
3. **Si el objetivo es jugar, la conclusión del doc 06 no se mueve:** S6 con OpenMU, hoy, gratis, con
   comunidad. **Si el objetivo es hackear por gusto**, MuEmu es un juguete legítimo y MIT — pero entrás
   como mantenedor de facto, no como usuario.
4. **Si igual querés probarlo**, el orden barato es: montarlo en local contra la season que el propio autor
   dice haber testeado más recientemente (**S16**, "S16 Tested", jun-2025) antes que S17, y abrir vos el
   issue de S17 sumándote al [#16](https://github.com/Yomalex/MuEmu/issues/16) — si el autor contesta ahí,
   cambia todo el análisis; si no contesta, ya sabés.

## Lo que no pude verificar (queda dicho, no estimado)

- **Los hilos de RaGEZONE**: el foro está bloqueado por la política de egress de esta red. Es *la* fuente
  histórica del rubro y no la pude leer. Si hay experiencias reales de MuEmu documentadas, están
  probablemente ahí. **Es el hueco más grande de este informe.**
- **El Discord de MuEmu** (invite del README): no pude comprobar si existe, cuánta gente hay ni si el autor
  participa. discord.com está bloqueado. Lo mismo para el conteo de OpenMU (1.834), que sale del buscador y
  no de la página.
- **Si el autor respondió alguna vez en los issues**: las páginas que puedo leer no muestran comentarios en
  los issues (sí los mostraron en el PR #10). Lo tomo como "no hay conversación visible", no como "nunca
  respondió".
- **`muemu.tech`** (el producto comercial homónimo): bloqueado. Solo tengo lo que devuelve el buscador, lo
  suficiente para saber que **es otra cosa** y advertir la confusión.
- **El mapeo build↔season de 1.18.70**: lo marqué inferido; solo confirmé con fuente independiente el
  1.19.46 → S16, y con el git log del propio repo el 1.19.75 → S17 y el 1.05.25 → S9.
- **Cuánta gente usa MuEmu en privado sin decir nada**: es imposible de medir. Todo lo de la sección 3 es
  ausencia de evidencia pública, y lo trato como tal.

**Fuentes principales:**
[Yomalex/MuEmu](https://github.com/Yomalex/MuEmu) (repo + clone medido 31/08/2026) ·
[README de MuEmu](https://github.com/Yomalex/MuEmu/blob/master/README.md) ·
[ClientConfig/](https://github.com/Yomalex/MuEmu/tree/master/ClientConfig) ·
[issues](https://github.com/Yomalex/MuEmu/issues?q=is%3Aissue) ·
[issue #16 (S17, sin responder)](https://github.com/Yomalex/MuEmu/issues/16) ·
[issue #15](https://github.com/Yomalex/MuEmu/issues/15) ·
[issue #3](https://github.com/Yomalex/MuEmu/issues/3) ·
[PR #10 "Fix s17 protocols 80%"](https://github.com/Yomalex/MuEmu/pull/10) ·
[PRs](https://github.com/Yomalex/MuEmu/pulls?q=is%3Apr) ·
[forks](https://github.com/Yomalex/MuEmu/forks?include=active&sort=stargazers) ·
[branches](https://github.com/Yomalex/MuEmu/branches/all) ·
[releases](https://github.com/Yomalex/MuEmu/releases) ·
[perfil del autor](https://github.com/Yomalex) ·
[lchannng/MuEmu](https://github.com/lchannng/MuEmu) ·
[TubroDog/MuEmu](https://github.com/TubroDog/MuEmu) ·
[ADMTec/MuEmu-1](https://github.com/ADMTec/MuEmu-1) ·
[MUnique/OpenMU](https://github.com/MUnique/OpenMU) ·
[sven-n/MuMain](https://github.com/sven-n/MuMain) ·
[bernatvadell/muonline](https://github.com/bernatvadell/muonline) ·
[xulek/muonline](https://github.com/xulek/muonline) ·
[afrokick/UniMU](https://github.com/afrokick/UniMU) ·
[VDraven/MuClientTools16](https://github.com/VDraven/MuClientTools16) ·
[Maikiller/Mu_Editor_Season16](https://github.com/Maikiller/Mu_Editor_Season16) ·
[cobyzero/MuSeason13](https://github.com/cobyzero/MuSeason13) ·
[mikiones/MuOnline](https://github.com/mikiones/MuOnline) ·
[topic muonline](https://github.com/topics/muonline) ·
[topic mu-online](https://github.com/topics/mu-online)

— Elaborado por GSG
