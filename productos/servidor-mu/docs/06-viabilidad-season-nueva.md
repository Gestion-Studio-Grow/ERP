# ¿Se pueden CREAR los files de una season nueva? — Estudio de viabilidad

**Pregunta:** en vez de comprarle la licencia a IGCN, ¿se puede escribir un servidor propio de
la season nueva (Webzen va por **Season 21 Part 1-2**, agosto 2026) por el camino limpio —
reimplementación clean-room, como hizo OpenMU?

**Respuesta corta: técnicamente sí, es legal y ya hay gente haciéndolo de a pedacitos. Pero el
tamaño del trabajo es de 10–20 persona-años, contra un blanco que se mueve dos veces por año.
Para un particular que quiere jugar con amigos, no es un proyecto: es una vida.** El detalle y
los números, abajo. Todo lo **[VERIFICADO]** tiene fuente; lo **[INFERIDO]** está marcado como tal.

**Alcance:** este estudio cubre únicamente la reimplementación limpia (código propio escrito
contra documentación pública del protocolo y observación de tráfico de un cliente propio). No
cubre ni evalúa ninguna otra vía.

---

## 1. El punto de calibración: qué costó OpenMU

OpenMU es la mejor vara que existe para medir cuánto cuesta esto, porque es exactamente el
mismo tipo de proyecto: un servidor clean-room, MIT, escrito de cero en C#.

Datos tomados directamente del repo ([github.com/MUnique/OpenMU](https://github.com/MUnique/OpenMU)),
clonado y medido el 30/08/2026 — todos **[VERIFICADOS]**:

| Métrica | Valor |
|---|---|
| Primer commit | 24 de septiembre de 2016 |
| Último commit | 30 de agosto de 2026 (activo **hoy**) |
| Edad | **10 años justos** |
| Commits | **5.068** |
| Autores | **82**, pero el líder (sven-n) tiene 3.408 commits = **67%** del total |
| Código | **~152.800 líneas de C#** en 3.224 archivos (incluye tests y packets generados) |
| Stars / forks | 1.150 / 590 |
| Issues abiertos | 53 |
| Estado declarado | "currently under development **without any release**" (README) |
| Alcance | Season 6 Ep. 3 (protocolo ENG) + versiones 0.75 / 0.95d / 0.97d |

Dos datos que dimensionan mejor que cualquier discurso:

- **Castle Siege — un sistema núcleo de S6 — se terminó de implementar en agosto de 2026**,
  al año diez del proyecto (issues [#720–#735](https://github.com/MUnique/OpenMU/issues/724),
  cerrados el 23/08/2026). **[VERIFICADO]**
- Un contribuidor escribió en marzo 2026 que OpenMU "ya es jugable ('production ready', como
  dicen otros usuarios) **para configuraciones de seasons bajas**"
  ([issue #707](https://github.com/MUnique/OpenMU/issues/707)). Jugable sí; completo, todavía no.
  **[VERIFICADO]**

**Lectura [INFERIDA]:** 10 años de calendario con un líder que hizo dos tercios del trabajo.
Si asumimos que sven-n le dedicó un 0,3–0,5 FTE sostenido (ritmo alto para un hobby, y los
5.068 commits lo respaldan), son **3–5 persona-años** de él solo, más **1,5–2,5** del resto
(33% de los commits repartido en 81 personas). **Total: ~5–8 persona-años efectivos para
llegar a un S6 jugable, aún sin release formal.** Ese es el precio de UNA implementación
limpia de S6, hecha por gente que sabe.

## 2. Qué hay documentado del protocolo

- OpenMU mantiene la documentación de paquetes **generada desde XML fuente**: **501 archivos**
  de descripción de mensajes cliente↔servidor en `docs/Packets/`, más el tracker de progreso
  por handler (`docs/Progress.md`). **[VERIFICADO** — contado en el clone**]**
- Esa documentación cubre **S6 Ep. 3 más las extensiones propias del proyecto**. No hay
  documentación de paquetes S7+ en el repo, ni ramas ni issues apuntando a seasons
  posteriores: busqué issues con "season" en el título (0 resultados), "newer season"
  (0 resultados) y "season 17" (0 resultados). **[VERIFICADO]**
- El README declara la dirección del proyecto sin ambigüedad: el foco es S6 Ep. 3, y "el foco
  de largo plazo es el **cliente open source**" ([sven-n/MuMain](https://github.com/sven-n/MuMain),
  264 stars, activo) "que soporta un protocolo de red levemente extendido". Es decir: el plan
  de los mantenedores para superar S6 **no es perseguir el protocolo de Webzen**, sino
  controlar ambos extremos y extender el protocolo propio. **[VERIFICADO** el texto del README;
  la lectura es mía**]**

No encontré ninguna declaración de los mantenedores comprometiéndose a soportar seasons nuevas.
Lo que hay apunta a lo contrario: profundizar S6 y el cliente propio.

## 3. ¿Hay algún emulador open source arriba de S6? Sí, uno — y es el hallazgo del informe

Búsqueda sobre GitHub (agosto 2026), descartando repos muertos:

| Proyecto | Lenguaje | Apunta a | Estado | Veredicto |
|---|---|---|---|---|
| [MUnique/OpenMU](https://github.com/MUnique/OpenMU) | C# | S6 Ep3 | Muy activo (commit hoy) | El estándar. No pasa de S6. |
| **[Yomalex/MuEmu](https://github.com/Yomalex/MuEmu)** | C# | **S6 Kor, S9 Eng, S12 Kor, S16 Kor, S17 Kor** | Vivo pero lento | **El único que apunta arriba de S6** |
| [pafa7a/mu-online-js](https://github.com/pafa7a/mu-online-js) | TypeScript | cliente MuMain (≈S6) | Activo, temprano | No apunta más alto |
| kessiler/muOnline-season6, vethrfolnir-mu, emu-server | C++/Java | S6 | Abandonados hace años | Descartados |

**MuEmu en detalle** (clonado y medido, **[VERIFICADO]**): MIT, ~52.000 líneas de C#,
**235 commits**, último el **11/01/2026**, y es esencialmente **una sola persona** (Yomar
Camejo / Yomalex, con un segundo contribuidor ocasional). El README lista soporte de S9 a S17
con capturas de S17 Kor andando.

**Lo que esto prueba y lo que no [INFERIDO]:** prueba que **el conocimiento de protocolo de
seasons altas existe parcialmente en abierto** — una persona logró que clientes hasta S17 se
conecten y jueguen algo. Lo que NO prueba es completitud: 235 commits y 52 KLOC de una persona
contra 5.068 commits y 153 KLOC de 82 personas que en 10 años recién completan S6. La
completitud real de MuEmu por season no está documentada y **no la pude verificar** — no hay
tracker de progreso equivalente al de OpenMU. Asumí lo razonable: es una base jugable parcial,
no un S17 completo. Ojo aparte: MuEmu cubre el **servidor**; el cliente lo tenés que resolver
vos, como con cualquier emulador.

## 4. El tamaño del salto S6 → S21

Fuente principal: [AlighieriDemiurgs/MuHistory](https://github.com/AlighieriDemiurgs/MuHistory)
(historial comunitario S0–S21, creado en julio 2026) — fuente **comunitaria, no oficial**;
los hitos de S21 están confirmados por notas de prensa de Webzen
([Season 21-1: clase Crusader](https://muonline.webzen.com/en/events/Season21Part1/PreEvent/PreRegister),
[Season 21-1 2nd: Sanctuary of Aquilas, nivel 1.750](https://www.gamespress.com/en-US/WEBZEN-Updates-MU-Online-with-Sanctuary-of-Aquilas-Ancestral-Imperial-),
ambas de agosto 2026). **[VERIFICADO en ese carácter]**

Entre S6 (2011) y S21 (2026) hay **~14 releases mayores** (eX700–702, S8 a S21). El delta:

- **8–9 clases nuevas** (Grow Lancer, Rune Mage, Slayer, Gun Crusher, White Wizard, Mage,
  Illusion Knight, Alchemist, Crusader) — S6 trae 7. Cada clase es: skills, fórmulas, items
  propios, quests, balance.
- **Level cap de 400 (+master) a 1.750**, con 4ta y 5ta clase, árboles de skill enhancement.
- **Sistemas enteros que no existen en S6:** Pentagramas/Errtels (un subsistema de combate
  elemental paralelo completo) · **Ruud + Mastery gear** (una economía y progresión de
  equipamiento paralela) · Muun · Seed Spheres niveles 4–10 · alas de 4to y 5to nivel ·
  Guardian Mounts · Artifact System · Ability Cards · Talisman of Chaos Assembly · eventos
  nuevos (Tormented Square, Battle Core, Arka War…) · decenas de mapas.
- OpenMU no tiene **nada** de esto: en su código no hay rastro de pentagramas, Ruud ni Muun
  (grepeado en el clone). **[VERIFICADO]**

**Magnitud [INFERIDA, con el listado de arriba como evidencia]:** en cantidad de sistemas de
juego, el delta S6→S21 es **al menos comparable, y probablemente mayor**, que todo lo que
OpenMU implementó en 10 años. Y encima el blanco se mueve: Webzen metió dos updates de S21
solo en agosto de 2026.

## 5. La estimación

**[INFERIDO — todo esto es estimación, construida así:]**

- Calibración: S6 clean-room jugable = **~5–8 persona-años** efectivos (sección 1).
- El delta S6→S21 ≥ el trabajo de S6 entero (sección 4), **sin** documentación de paquetes
  pública equivalente a la que OpenMU generó para S6 (sección 2) — el camino limpio obliga a
  levantar esa documentación observando tráfico del cliente propio, que es trabajo previo al
  trabajo. A favor: OpenMU ya te regala la arquitectura (red, persistencia, plugins) y MuEmu
  demuestra que parte del protocolo alto ya se conoce.
- Neteando lo que ya está resuelto contra lo que falta y el blanco móvil:

> **Servidor de season nueva (S20/S21-equivalente) jugable, partiendo de OpenMU:
> 10–20 persona-años de trabajo calificado.**
>
> - Hobbista solo, 0,25 FTE: **40–80 años calendario.** No es un proyecto, es una vida.
> - Equipo de 3–4 full-time: **3–5 años calendario**, persiguiendo un juego que se actualiza
>   dos veces por año. Valuado a cualquier sueldo de developer, son **cientos de miles de
>   dólares** para replicar gratis algo que se alquila por cientos de euros al mes.
>
> Y esto es solo el **servidor**: el cliente oficial de S21 no es open source, y hacerlo
> hablar con tu server es un problema adicional que acá ni está costeado.

### La versión intermedia: portar sistemas puntuales a OpenMU como plugins

Acá hay algo real, con una restricción dura: **el cliente S6 no puede mostrar lo que no
conoce**. Clases nuevas, mapas nuevos, la UI de Ruud o de pentagramas necesitan soporte del
lado del cliente. Eso parte los candidatos en dos:

**Rendidores (no tocan el cliente) — [INFERIDO] 1–3 meses-persona cada uno:**
1. **Eventos nuevos armados con piezas S6** (mapas existentes + spawns + drops + lógica
   custom): es lo que mejor paga. OpenMU tiene el sistema de plugins pensado para esto.
2. **QoL de seasons nuevas server-side**: monedas alternativas modeladas como ítems,
   recompensas por participación, rates por franja horaria, etc.
3. **Balance/progresión estilo seasons altas** sobre el contenido S6 (curvas de XP, resets,
   master tree extendido dentro de lo que el cliente ya renderiza).

**Caros (requieren cliente) — [INFERIDO] 6–12 meses-persona cada uno:**
sistemas como pentagramas o Ruud exigen extender también el cliente. La única vía limpia es
**MuMain**, el cliente open source del propio autor de OpenMU — que es exactamente la
dirección de largo plazo que el proyecto declara. Es desarrollo C++ de cliente + C# de server,
de a un sistema por vez. Interesante como hobby técnico; jamás te entrega "la season nueva",
te entrega un S6 enriquecido.

## 6. Recomendación

Para el caso concreto — **jugar en privado con amigos**:

| Opción | Costo | Tiempo hasta jugar | Riesgo |
|---|---|---|---|
| **(a) Quedarse en S6 (lo que ya tenés)** | **$0** | **Hoy** | Bajo: proyecto de 10 años, activo, MIT |
| (b) Licencia comercial (IGCN) | €330 el 1er mes del escalón S6 **[VERIFICADO]**; suscripción **obligatoria** para que el software corra **[VERIFICADO, FAQ de IGCN]**; escalones de season nueva más caros (no pude verificar el detalle) + VPS Windows + SQL Server | Semanas | Medio: costo recurrente de por vida del server, dependencia total del proveedor |
| (c) Construir la season nueva | 10–20 persona-años **[INFERIDO]** | Años (equipo) o décadas (solo) | Altísimo: blanco móvil, sin doc de protocolo S7+, sin cliente |

**Veredicto, sin diplomacia: (a). No es el premio consuelo — es la única opción racional del
cuadro.** S6 Ep3 sigue siendo la season más jugada en servers privados, ya la tenés levantada,
y es gratis.

- **(c) no es una opción para un particular.** Es una opción para un proyecto open source de
  década, y ese proyecto ya existe: se llama OpenMU y decidió no perseguir a Webzen. Si lo que
  te tira es el desafío técnico, la versión racional de (c) es **contribuir a OpenMU o a
  MuEmu** — portar UN sistema como plugin es un proyecto de meses, realista y divertido. Todo
  lo demás es tirar años a un pozo.
- **(b) tiene sentido en exactamente un caso:** que "la season nueva exacta" sea innegociable
  Y haya presupuesto recurrente (files + VPS Windows + el tiempo de operarlo). Para un server
  de amigos es pagar mantenimiento de infraestructura comercial para 8 personas.
- Y si algún día vas a (b), todo lo que aprendas operando (a) — backups, updates, seguridad,
  rates — se transfiere. Empezar por (b) sin haber operado nunca es la receta del VPS caro
  apagado a los dos meses.

### Lo que no pude verificar (queda dicho, no estimado)

- El **costo exacto del salto de season en IGCN** (la cifra de "hasta €150" que circula): el
  sitio de IGCN está bloqueado desde esta red; verifiqué el €330 del primer mes del escalón S6
  y la obligatoriedad de la suscripción vía resultados de búsqueda, no el tarifario completo.
- La **completitud real de MuEmu** por season (no publica tracker de progreso).
- El **esfuerzo real en horas de OpenMU**: los persona-años salen de commits y calendario, no
  de un registro de horas. Están marcados como inferencia por eso.

**Fuentes principales:**
[OpenMU](https://github.com/MUnique/OpenMU) (repo clonado y medido 30/08/2026) ·
[OpenMU issue #707](https://github.com/MUnique/OpenMU/issues/707) ·
[OpenMU issue #724 (Castle Siege)](https://github.com/MUnique/OpenMU/issues/724) ·
[MuEmu](https://github.com/Yomalex/MuEmu) (clonado y medido) ·
[mu-online-js](https://github.com/pafa7a/mu-online-js) ·
[MuMain](https://github.com/sven-n/MuMain) ·
[MuHistory S0–S21](https://github.com/AlighieriDemiurgs/MuHistory) ·
[Webzen — Season 21-1](https://muonline.webzen.com/en/events/Season21Part1/PreEvent/PreRegister) ·
[Games Press — S21-1 2nd Update](https://www.gamespress.com/en-US/WEBZEN-Updates-MU-Online-with-Sanctuary-of-Aquilas-Ancestral-Imperial-) ·
[IGCN — IGC.Premium](https://www.igcn.mu/store/product/3-igcpremium/) ·
[IGCN — FAQ Pre-Sale](https://www.igcn.mu/faq/pre-sale/)

— Elaborado por GSG
