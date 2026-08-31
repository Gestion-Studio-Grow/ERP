# De dónde sale información confiable sobre las seasons nuevas

**Pregunta:** un emulador necesita números, no descripciones. Fórmulas de daño y defensa, tablas
de experiencia, tasas de éxito de la Chaos Machine, cómo funciona cada sistema nuevo
(Master/Majestic, Pentagrama/Errtel, Ruud, Mastery, Muun, Artifacts), horarios y condiciones de
eventos, comportamiento de monstruos. ¿Quién publica eso, y a quién se le puede creer?

Este documento **mapea y califica las fuentes**. No investiga los formatos de datos del cliente
(eso va en otro lado). No cubre files comerciales ni filtrados, ni nada que implique tocar el
servicio en vivo de Webzen: **fuera de alcance, taxativo**.

---

## 0. Nota de método — qué pude abrir y qué no (leelo antes que nada)

Esta investigación corrió detrás de un **proxy de egress corporativo que bloquea casi toda la
web**. Concretamente, **verifiqué a mano**:

- ✅ `github.com` y `raw.githubusercontent.com` — abiertos. Leí código y documentos reales.

Y me **rebotaron con `EGRESS_BLOCKED`** (probados uno por uno, no es suposición):

- ❌ `muonline.webzen.com` (sitio oficial global) · ❌ `www.muonline.co.kr` (oficial Corea) ·
  ❌ `company.webzen.com`
- ❌ `muonline.fandom.com` · ❌ `muonlinefanz.com` · ❌ `strategywiki.org` · ❌ `en.wikipedia.org`
- ❌ `forum.ragezone.com` · ❌ `forum.muonlinehelp.com`
- ❌ `wiki.devilzmu.net` · ❌ `www.muonline.ai` · ❌ `web.archive.org`

Sobre esas fuentes solo tuve **resultados y resúmenes de buscador**, que es evidencia de
segunda mano. Por eso todo el documento marca:

- **[VERIFICADO]** — lo abrí y lo leí con estas manos.
- **[VÍA BUSCADOR]** — sé que existe y de qué habla por metadatos/resúmenes, pero **no abrí la
  página**. Tratalo como pista fuerte, no como dato.
- **[INFERIDO]** — juicio mío, construido sobre lo anterior.

**Para el usuario esto es una buena noticia disfrazada:** desde una máquina normal, sin proxy,
casi todas esas fuentes abren. El bloqueo es de este entorno de investigación, no del mundo.

---

## 1. Fuentes oficiales de Webzen

### 1.1 La Guide Library del sitio global

Webzen mantiene una **biblioteca de guías con URLs numeradas** en
`muonline.webzen.com/en/gameinfo/guide/`, con índice en `/guide/total` y páginas individuales en
`/guide/detail/<id>`. Confirmé por buscador la existencia de estas páginas concretas
**[VÍA BUSCADOR]**:

| Guía | URL |
|---|---|
| Índice de todas las guías | https://muonline.webzen.com/en/gameinfo/guide/total |
| Guías nuevas por update | https://muonline.webzen.com/en/gameinfo/guide/update |
| Season 20-1 | https://muonline.webzen.com/en/gameinfo/guide/detail/369 |
| Season 12 | https://muonline.webzen.com/en/gameinfo/guide/detail/109 |
| Season 9 | https://muonline.webzen.com/en/gameinfo/guide/detail/76 |
| **Sistema de EXP y conveniencia** | https://muonline.webzen.com/en/gameinfo/guide/detail/45 |
| **Ventana de información del personaje** | https://muonline.webzen.com/en/gameinfo/guide/detail/43 |
| Artifact | https://muonline.webzen.com/en/gameinfo/guide/detail/303 |
| Season Pass & Tempest Muun (S18-2) | https://muonline.webzen.com/en/gameinfo/guide/detail/317 |
| Chaos Castle | https://muonline.webzen.com/en/gameinfo/guide/detail/119 |
| Chaos Castle (Battle) | https://muonline.webzen.com/en/gameinfo/guide/detail/164 |
| Devil Square | https://muonline.webzen.com/en/gameinfo/guide/detail/126 |
| Sistema Elemental (EX700) | https://muonline.webzen.com/en/events/EX700Guide/pop_attribute |
| Burning Kethotum Elite Zone | https://muonline.webzen.com/en/gameinfo/guide/detail/269 |

Las categorías del índice incluyen *Beginner's Guide, How to Start, Play Guide, Recommended
Guides, **Maps & Monsters**, **Characters**, **Mastery Items*** **[VÍA BUSCADOR]**.

**Qué nivel de detalle dan realmente.** Acá está el punto y hay que decirlo derecho:

- **Sí publican números discretos y reglas duras.** Ejemplos que salieron en los resúmenes: la
  guía de Chaos Castle da la relación participantes/monstruos (*"100 menos la cantidad de
  participantes = cantidad de monstruos"*, tope de 70 participantes); la guía de la ventana de
  personaje describe qué campos existen (daño elemental, tasa de éxito de ataque elemental,
  defensa elemental) **[VÍA BUSCADOR]**.
- **Sí publican fórmulas de composición**, del tipo multiplicativo. La fórmula de EXP que anunció
  Webzen en S8-3 (19/03/2014) es:
  `Base Exp × (Channel + Exp Event) × (1 + Ascension + Wealthy + Healing + Pet + Ring + Bonus Exp) × (1 + Premium Exp Bonus)`
  — o sea, te dicen **cómo se combinan los multiplicadores**, pero `Base Exp` "depende del
  monstruo que mates" y **ese número no lo publican** **[VÍA BUSCADOR]**.
- **No publican el núcleo.** No hay tabla de EXP por nivel hasta 1.750, no hay fórmula de daño
  físico, no hay tasa de acierto en función de attack rate vs defense rate, no hay stats de
  monstruo (HP, defensa, EXP), no hay porcentajes de la Chaos Machine, no hay tablas de drop.
  **[INFERIDO, con alta confianza]** — busqué específicamente esas cosas en el dominio oficial y
  lo que devuelve el buscador son siempre páginas descriptivas.

**Veredicto — confiabilidad: MÁXIMA. Rendimiento para un emulador: MEDIO-BAJO.**
Es la **única fuente que define qué hace cada sistema sin riesgo de error**: si querés saber qué
es un Errtel de Radiance, qué gatilla el Artifact System o cuáles son las condiciones de entrada
a un evento, esto es la verdad. Pero **casi nunca te da el número que el emulador necesita**.
Usala como **especificación funcional**, no como fuente de constantes.

### 1.2 Los sitios regionales — y por qué Corea importa más

**Corea (`www.muonline.co.kr`) es la fuente oficial más profunda**, y esto sí lo tengo
**[VERIFICADO]** de manera indirecta pero sólida: los dos historiales comunitarios serios que
encontré en GitHub (§3.1) citan como fuente primaria, nota por nota,
`https://www.muonline.co.kr/news/patch-note` y las notas de prensa de Webzen en coreano. El
autor de uno de ellos incluso documenta que *"MU Korea cambió el sitio en 2005; los links previos
a 2005 están muertos"* y que preservó lo que pudo vía Wayback Machine.

Datos concretos de patch notes KR que salieron por buscador **[VÍA BUSCADOR]**: S21 Parte 1
2° update (oct-2025) subió el nivel máximo de **1.700 a 1.750**; el 3° update (nov-2025) agregó
la zona élite del Santuario de Aquilas. Ese grano —"qué cambió, con qué número, en qué fecha"—
es exactamente lo que el sitio global no da con la misma prolijidad.

- Patch notes KR: http://www.muonline.co.kr/news/patch-note
- Eventos de update KR (una landing por parte de season, con detalle): https://event.muonline.co.kr/season21-1/ , https://event.muonline.co.kr/season21part2/updatecommemoration , https://event.muonline.co.kr/season21-3/thanks
- Notas de prensa corporativas: https://company.webzen.com/en/pr

También existe el sitio en **español** (`muonline.webzen.com/es/gameinfo/guide/detail/45`) — mismo
contenido traducido, útil si el inglés molesta, sin detalle extra **[VÍA BUSCADOR]**.

**Veredicto: confiabilidad MÁXIMA, rendimiento MEDIO.** Vale el traductor. Si vas a seguir una
season viva, **el feed de patch notes coreano es la suscripción número uno**.

---

## 2. Wikis comunitarias

Acá hay que hacer una separación que la mayoría de la gente no hace, y que es **la diferencia
entre un emulador que se parece al juego y uno que inventa**:

> **Wiki del juego oficial ≠ wiki de un servidor privado.** La segunda documenta *la configuración
> de ese servidor*, que casi siempre está modificada (rates, horarios, tasas de la máquina).
> Copiar números de ahí es copiar el balance de otro, no el de Webzen.

### 2.1 MU Online Fanz — la mejor de la vereda comunitaria

- Sitio: https://muonlinefanz.com/
- Bases de datos: https://muonlinefanz.com/tools/mobs/ (monstruos) · https://muonlinefanz.com/tools/items/ (items) · https://muonlinefanz.com/tools/maps/ (mapas) · https://muonlinefanz.com/tools/npc/ (NPCs)
- Mecánica de combate: https://muonlinefanz.com/guide/systems/combat-mechanics/
- Ejemplo de ficha: https://muonlinefanz.com/tools/mobs/data/mobdb/Mutant.php · https://muonlinefanz.com/tools/npc/data/npcdb/Chaos%20Goblin%20Machine.php

**Por qué la pongo primera de las comunitarias [VÍA BUSCADOR]:**

1. Existe desde **2012** y se declara **"operado bajo permiso de Webzen Inc."**. Un sitio fan con
   permiso explícito del titular es una señal de seriedad que ninguna otra wiki de MU tiene.
2. Documenta **el juego oficial**, no un servidor privado. Es la diferencia clave.
3. Tiene **bases de datos estructuradas** (una URL por monstruo, por mapa, por NPC) con stats,
   spots, drop tables y **combinaciones de crafteo por NPC** — o sea, el formato exacto que un
   emulador necesita para poblar tablas.
4. **Sigue las seasons nuevas**: tiene guía de la clase *Mage (Lemuria)*, que es contenido S19+.
5. **Documenta cambios de fórmula con fecha**: la nota "New EXP Formula!" del 19/03/2014
   (https://www.muonlinefanz.com/news/data/php/posts/20140319New_EXP_Formual/) registra el cambio
   de fórmula de EXP de S8-3 — eso es trabajo de archivo, no memoria.
6. Documenta detalle fino verificable en pantalla: los colores del daño (blanco = miss, naranja =
   normal, azul = crítico, verde = excellent, cian = true, rosa = reflect, rojo = PvP, amarillo =
   mastery, gris = punish) y que *excellent damage = crítico × 1,1* con 5% base de chance.

**Debilidad honesta:** no vi que citen fuente número por número. Los stats de monstruo salen de
algún lado que no declaran. **No es una wiki con citas: es una wiki con reputación.** Alcanza para
usarla como *candidato a verdad*, no como *verdad*.

**Veredicto: confiabilidad ALTA (la más alta de la comunidad). Rendimiento MUY ALTO.**

### 2.2 Mu Online Wiki en Fandom

- https://muonline.fandom.com/wiki/MU_Online_Wiki

Cubre hasta **Season 20** y sigue viva **[VÍA BUSCADOR]** (hay además un volcado de WikiTeam de
julio 2022 archivado en https://archive.org/details/wiki-muonlinefandomcom, útil como respaldo).
No pude medir su profundidad. **[INFERIDO]** por cómo funcionan las wikis de Fandom: buena para
enciclopedia (qué es cada mapa, cada item, cada clase), floja para constantes de simulación, y
sin cultura de citas. **Confiabilidad MEDIA. Rendimiento MEDIO-BAJO.**

### 2.3 StrategyWiki

- https://strategywiki.org/wiki/Mu_Online/Chaos_Machine

Tiene una página dedicada a la Chaos Machine **[VÍA BUSCADOR]**. StrategyWiki como plataforma es
más rigurosa que Fandom, pero el contenido de MU ahí es **viejo** —cubre el MU clásico, no S21—.
**Útil como referencia de S6 con criterio, inútil para seasons nuevas. [INFERIDO]**

### 2.4 Wikis de servidores privados — usar solo para entender, NUNCA para copiar números

Existen y son muchas: `wiki.infinitymu.net`, `wiki.devilzmu.net`, `wiki.realmu.net`,
`wiki.bless.gs`, `guide.fortmu.com`, `mu.lv/guides`, `globalmuonline.com/guides`,
`guidemuonline.com`, `mutop100.com/guides`, `www.muonline.ai/guides`, `guias-muonline.ru`
**[VÍA BUSCADOR]**.

**El riesgo, con un caso concreto:** busqué horarios de eventos. Lo que devuelve la web son
horarios *precisos y contradictorios entre sí* — Blood Castle cada 2 h a las :30, Devil Square
cada 2 h en punto, Chaos Castle en horarios impares — todos publicados por **servidores privados
distintos**, que **configuran su propio calendario**. Ninguno prueba nada sobre el servidor
oficial. Si un emulador copia eso, está copiando la config de un tercero.

**Regla dura para el proyecto:** de estas wikis se toma **la mecánica cualitativa** (qué hay que
hacer para entrar, cómo se gana, qué recompensa) y **jamás el número**. **Confiabilidad BAJA
para datos. Rendimiento ALTO para entender rápido un sistema que no conocés.**

**Excepción interesante:** `guias-muonline.ru/guides/monsters.html` publica un listado de
monstruos de **Season 20 Parte 1-1** por mapa (Acheron, Alkmaar, Ubaid, Debenter, Uruk Mountain,
Nars, Deep Dungeon, Swamp of Darkness, Kubera Mine, Abyss of Atlans, Scorched Canyon, Red Smoke
Icarus, Arenil Temple, Ashen Aida, Blaze Kethotum, Kanturu Undergrounds, Ignis Volcanos)
**[VÍA BUSCADOR]**. La comunidad rusa es históricamente fuerte en MU. Vale abrirlo y ver si trae
stats; si los trae, es un candidato de triangulación (§6).

---

## 3. La comunidad técnica

### 3.1 GitHub — el único canal que pude verificar de punta a punta, y rinde

**Historiales de patch notes con citas (los dos mejores hallazgos de esta categoría):**

| Repo | Qué es | Juicio |
|---|---|---|
| [AlighieriDemiurgs/MuHistory](https://github.com/AlighieriDemiurgs/MuHistory) | Historia versión por versión desde el alfa cerrado (feb-2001) hasta **S20 Parte 1-3** (abr-2025). Un README, **168 commits**. **Cita fuentes oficiales**: patch notes de MU Korea, notas de prensa de Webzen en coreano, y Wayback Machine para links muertos. | **[VERIFICADO]** — abierto y leído. **La mejor cronología comunitaria que existe, y con citas.** Es narrativa: **no** trae tablas de EXP, drops ni fórmulas. |
| [Khdoop/mu-online-history](https://github.com/Khdoop/mu-online-history) (`source.md`) | Lo mismo, de **S0 a S20 Parte 1** (12/02/2001 → 24/09/2024), con referencias numeradas `[[1]]` a `muonline.co.kr/news/patch-note`. | **[VERIFICADO]** — abierto y leído. Documenta el problema de archivo: *"MU Korea cambió el sitio en 2005, los links hasta 2005 están muertos"*. Igual que el anterior: **cero tablas numéricas**. |

**Lo que estos dos repos te dan y nadie más:** el **índice cronológico de qué se agregó y cuándo**,
apuntando a la nota oficial. Con eso armás el orden de trabajo y, para cada sistema, sabés a qué
patch note oficial ir a leer. **Es el índice de la bibliografía, no la bibliografía.**

**Lo que NO hay en GitHub [VERIFICADO por búsqueda]:** busqué específicamente repositorios de
documentación de fórmulas, tablas de EXP o datos extraídos para seasons altas —
`"Chaos Machine" success rate table`, `"Master Level" experience table formula`,
`"Errtel" "Pentagram" .md`, `mu online formula damage defense wiki`, `muonline documentation wiki
guide formulas`— y el resultado es **prácticamente nulo**: 0 a 1 resultados, y el único que
aparece siempre es `mu-online-history`. **No existe, en GitHub, un corpus abierto de constantes de
juego de seasons nuevas.**

**Advertencia obligatoria:** la búsqueda de GitHub por términos de seasons altas devuelve, además,
**repos que son volcados de files de servidor comerciales o filtrados**. Están **fuera de alcance
por regla dura** de este proyecto: no se leen, no se linkean, no se usan como fuente. Los menciono
solo para que sepas que el ruido está ahí y que hay que descartarlo a propósito, no por accidente.

**Confiabilidad de GitHub como canal: ALTA para lo que hay (código y docs auditables).
Rendimiento: ALTO para cronología y protocolo S6, NULO para constantes S21.**

### 3.2 RaGEZONE — el histórico, **bloqueado en este entorno**

- https://forum.ragezone.com/community/mu-online.192/ (raíz) · `/mu-online-development.508/` ·
  `/mu-online-releases.197/` · `/tags/muonline-development/`

**No pude abrirlo: `EGRESS_BLOCKED` en `forum.ragezone.com`.** Lo digo explícito porque es la
fuente que todo el mundo cita y **no la verifiqué**.

Lo que sé por buscador **[VÍA BUSCADOR]**: sigue **activa en agosto de 2026**, con subforos
separados de desarrollo, releases y servidores; y hay hilos técnicos específicamente sobre lo que
buscamos, por ejemplo *"Formulas for attack rate, defense rate and defense"*
(https://forum.ragezone.com/threads/formulas-for-attack-rate-defense-rate-and-defense.1225027/),
*"Formulas ingame"* (https://forum.ragezone.com/threads/formulas-ingame.274516/) y *"Calculation of
experience depending on a level"*
(https://forum.ragezone.com/threads/calculation-of-experience-depending-on-a-level.99573/).
También ahí se anunció OpenMU en su momento.

Un dato que sale de esos hilos y que **conviene tener presente antes de entusiasmarse**: los
propios desarrolladores discuten la fórmula de probabilidad de acierto sin cerrarla — alguien
propone `defense_rate / attack_rate * 100` y otro reporta que **no reproduce lo observado** en
personajes basados en Energía **[VÍA BUSCADOR]**. O sea: **ni siquiera la comunidad técnica tiene
consenso sobre las fórmulas de combate**. Eso baja mucho la expectativa sobre "buscar la fórmula
en un foro" y sube el valor del método empírico (§5).

**Confiabilidad: MEDIA y muy variable por hilo** — conviven ingeniería seria y "me parece que es
así". **Regla:** de RaGEZONE se toma **la hipótesis**, y se **verifica contra otra fuente** antes
de codearla. **Rendimiento: potencialmente ALTO, no verificable desde acá.**

### 3.3 Alternativas a RaGEZONE

Como el bloqueo es de este entorno y no del mundo, no busqué "reemplazos" sino **canales
complementarios**, que además tienen mejor señal/ruido:

- **El Discord y los issues de OpenMU** — https://github.com/MUnique/OpenMU (Discord linkeado en el
  README) y https://munique.net/ (blog del proyecto). El README **pide explícitamente
  contribuciones de no-desarrolladores**, incluyendo *"descripciones de paquetes o documentación
  sobre conceptos y mecánicas del juego"* **[VÍA BUSCADOR sobre texto del README; el README lo
  leí [VERIFICADO] y la orientación general coincide]**. Para este proyecto es la comunidad de
  mejor calidad técnica disponible, y encima **querés lo mismo que ellos**.
- **`forum.muonlinehelp.com`** — tiene una sección "Guides for server administrators" con un hilo
  *"Character calculation formulas"*
  (https://forum.muonlinehelp.com/topic29-character-calculation-formulas.html) **[VÍA BUSCADOR]**.
  **Bloqueado acá.**
- **`tapatalk.com/groups/lordzmu`** — hilo *"Calculation Formula [From muonline.com]"*
  (https://www.tapatalk.com/groups/lordzmu/calculation-formula-from-muonline-com-t71.html)
  **[VÍA BUSCADOR]**. El título es la pista importante: **hubo una época en que Webzen publicó
  las fórmulas de cálculo de personaje en su propio sitio**, y la comunidad las espejó. Eso
  explica por qué circulan fórmulas como `Min damage = str/6`, `Max damage = str/4`,
  `Attack rate PvM = lvl*5 + (agi*3)/2 + str/4`, `Defense rate PvM = agi/3` — **son de origen
  oficial, aunque de las seasons viejas**.
- **`namu.wiki`** (wiki coreana, https://namu.wiki/w/뮤%20온라인) — el equivalente coreano de una
  wiki enciclopédica. Suele tener detalle que no llega al inglés. **[VÍA BUSCADOR]**, no
  evaluada.

---

## 4. OpenMU como fuente de mecánica (no solo de protocolo)

Esto es lo que **sí pude auditar de verdad**, y es donde está el hallazgo más fuerte del informe.

### 4.1 Qué documenta OpenMU y dónde vive

- **Protocolo:** `docs/Packets/` (501 descripciones de mensajes generadas desde XML) y
  `docs/Progress.md` — este último **[VERIFICADO]**: es una tabla de **~120 handlers de paquete**
  con columnas *Feature · Packet code · Progress % · Complexity (1-10) · Note*. Es el mapa de qué
  está hecho y qué no.
  https://github.com/MUnique/OpenMU/blob/master/docs/Progress.md
- **Documentación de sitio** (`docs-website/docs/`) **[VERIFICADO]**: carpetas `admin-panel`,
  `deployment`, `development`, `getting-started`, `reference` (solo `packets.md` y `ports.md`) y
  `server-features`. **Es documentación de operación y de protocolo, no de mecánica.**
- **La mecánica no está en los docs: está en el código y en los inicializadores de datos.** Ese es
  el punto que hay que entender para usar OpenMU como bibliografía:
  - `src/Persistence/Initialization/VersionSeasonSix/` — la configuración de juego S6 como código.
  - `src/Persistence/Initialization/Updates/Fix*PlugIn*.cs` — cada corrección de fórmula, aislada
    y fechada.
  - `src/GameLogic/` — el motor.

### 4.2 Las fórmulas que leí, textuales

**Experiencia [VERIFICADO** — `src/Persistence/Initialization/GameConfigurationInitializerBase.cs`**]:**

```
ExperienceFormula:
  if(level == 0, 0,
     if(level < 256,
        10 * (level + 8) * (level - 1) * (level - 1),
        (10 * (level + 8) * (level - 1) * (level - 1)) + (1000 * (level - 247) * (level - 256) * (level - 256))))

MasterExperienceFormula:
  (505 * level * level * level) + (35278500 * level) + (228045 * level * level)
```

**Chaos Machine [VERIFICADO** — `src/Persistence/Initialization/VersionSeasonSix/ChaosMixes.cs`**]:**
Frutas 90% · Poción de Bless 100% · Poción de Soul 100% · Dinorant 70% · Shield Potion pequeña 50%
/ mediana 30% / grande 30% · Life Stone 100% · Fenrir etapa 1 70% / 2 50% / 3 30% · Gemstone
Refinery 80%. Alas nivel 2: `MaximumSuccessPercent = 90`; alas nivel 3: 60 y 40 por etapa. Chaos
Weapon y alas nivel 1 usan `MoneyPerFinalSuccessPercentage` (o sea, la tasa se compra con zen).
Subida de nivel de item: `éxito = 60 - ((nivelObjetivo - 10) / 2 * 5)`.

**Daño [VERIFICADO** — `src/Persistence/Initialization/Updates/FixDamageCalcsPlugInSeason6.cs`**]:**
no hay "una" fórmula: hay un **sistema de atributos con relaciones y constantes**. Ejemplos
textuales: buff Berserker con multiplicador de maná `1/3000` por punto de Energía y decremento de
vida `-0.4` más `1/6000` por Energía; daño físico mínimo `140` + `1/50` de (Fuerza+Agilidad) y
máximo `160` + `1/30`; Nova `1/2` de Fuerza total; Earthshake `1/10` Fuerza + `1/5` Liderazgo +
`10` por nivel de montura; skills de Lord `1/25` Fuerza + `1/50` Energía.

**Dato clave sobre la confiabilidad de OpenMU como fuente: en ninguno de esos archivos hay un
comentario que cite de dónde salió el número. [VERIFICADO]** Son valores derivados de observación
y ajuste del propio proyecto. **OpenMU es una implementación con reputación, no una fuente citada.**

### 4.3 La prueba de que el método de triangulación funciona

Esto lo hice y da **[VERIFICADO]**. Tomé la `MasterExperienceFormula` de OpenMU y la comparé
contra la tabla de Master Level publicada por una guía comunitaria en español
(https://www.guiamuonline.com/tabla-de-experiencia-master-level, valores **[VÍA BUSCADOR]**):

| Nivel Master | Tabla comunitaria (EXP del nivel) | Fórmula OpenMU (acumulada, diferencia entre niveles) | ¿Coincide? |
|---|---|---|---|
| 1 | 35.507.050 | 505 + 228.045 + 35.278.500 = **35.507.050** | ✅ exacto |
| 2 | 35.966.170 | 71.473.220 − 35.507.050 = **35.966.170** | ✅ exacto |
| 3 | 36.428.320 | 107.901.540 − 71.473.220 = **36.428.320** | ✅ exacto |
| 30 (acumulado) | 1.277.230.500 | 13.635.000 + 205.240.500 + 1.058.355.000 = **1.277.230.500** | ✅ exacto |

Y lo mismo con la experiencia normal: la tabla comunitaria dice que el nivel 2 pide **100** de
EXP; la fórmula de OpenMU da `10 × (2+8) × (2−1)² = 100` **[VERIFICADO el cálculo; el 100
[VÍA BUSCADOR]]**.

**Lo que esto prueba:** dos fuentes independientes —el código de un emulador clean-room y una
tabla comunitaria hecha por jugadores— **coinciden dígito por dígito**. Ninguna de las dos, sola,
es citable. **Las dos juntas, sí.** Ese es el método (§6).

### 4.4 Cuánto de esa mecánica sobrevive a S21

Sin acceso a las seasons nuevas, esto es **[INFERIDO]** — pero con base en lo que vi:

**Estable, sirve de esqueleto:**
- La **arquitectura**: sistema de atributos compuestos, relaciones entre atributos, plugins de
  fórmula, configuración como datos. Eso no envejece; es lo que te permite cambiar la fórmula sin
  reescribir el juego. **Es el activo más valioso de OpenMU para este proyecto.**
- La **forma polinómica de la EXP normal** (cúbica con quiebre en 256) y de la **Master EXP**.
  Que Webzen haya extendido el techo a 1.750 no implica que haya tirado la forma; casi seguro
  agregó otro tramo, como ya hizo en 256. La forma es la hipótesis, el ajuste es empírico.
- La **estructura de la Chaos Machine**: mezcla = lista de ingredientes + porcentaje base +
  modificadores. Los sistemas nuevos (Mastery, Errtel) usan **el mismo patrón** con otros números.
- El **framing y el núcleo del protocolo**, hasta donde el doc 09 lo confirme empíricamente.

**Cambió o directamente no existe:**
- Todos los **valores concretos**: EXP de monstruo, stats, tasas, drops. Con 14 releases mayores
  encima, asumir continuidad numérica es un error.
- Los **sistemas nuevos completos**: Pentagrama/Errtel, Ruud, Mastery, Muun, Artifacts, Ability
  Cards, Seed Spheres 4-10. El doc 06 ya lo dejó **[VERIFICADO]**: en el código de OpenMU **no
  hay rastro** de pentagrama, Ruud ni Muun.
- El **modelo de daño elemental** (Pentagrama) es una **segunda capa de combate paralela** —
  atributo elemental propio y del enemigo, tabla de ventajas (±20%, con 120% para ventaja y para
  atacar a alguien "sin elemento"), +30% elemental en PvP **[VÍA BUSCADOR]**. No hay nada
  equivalente en S6: **es diseño nuevo, no ajuste de parámetro**.

**Veredicto — confiabilidad: ALTA (auditable, se puede leer el código y correrlo).
Rendimiento: MUY ALTO para S6 y para arquitectura; NULO como fuente directa de números de S21.**

---

## 5. El método empírico: jugar y anotar

**El encuadre, para que no haya confusión:** crear una cuenta gratuita en el servidor oficial,
jugar como cualquier jugador y **anotar lo que la pantalla muestra**. Nada de sniffear tráfico del
servicio, nada de bots, nada de automatización contra su servicio. Es observación manual de la
propia partida.

### 5.1 Lo que lo hace viable: el cliente de MU muestra los números

Esto no es un juego que esconde sus stats. **[VÍA BUSCADOR, y consistente con S6]**:

- **El daño sale en pantalla, tipado por color** — blanco miss, naranja/dorado normal, azul
  crítico, verde excellent, cian true, rosa reflect, rojo PvP, amarillo mastery, gris punish. O
  sea: **cada golpe te dice el número y qué tipo de golpe fue**. Es un regalo para medir.
- **La ventana de información del personaje muestra los stats exactos**, incluyendo, en seasons
  nuevas, daño elemental, tasa de éxito de ataque elemental, defensa elemental y tasa de éxito de
  defensa elemental, **ya sumando pentagrama y errteles equipados**.
- **Los tooltips del árbol de Master/Majestic dan el valor exacto por nivel** — el propio buscador
  me devolvió progresiones del tipo *Attack Success Rate Increase: +511 / +857 / +1.179...* por
  nivel, y *Defense Success Rate Increase: +90,16% en nivel 20*. Esos números **están escritos en
  la interfaz**: no hay que estimarlos, hay que **transcribirlos**.
- La barra y el contador de EXP permiten leer **delta exacto** de experiencia.

### 5.2 Qué se puede medir, con qué precisión y cuánto cuesta

| Qué | ¿Se puede? | Precisión alcanzable | Costo estimado **[INFERIDO]** |
|---|---|---|---|
| **Valores por nivel del árbol Master/Majestic** | Sí — **transcripción, no medición** | **Exacta** | 2-4 h por clase. Es el mejor ratio dato/hora de todo el informe |
| **Stats y opciones de items** (tooltips) | Sí, de lo que puedas ver/equipar | **Exacta** para lo visto | Continuo, se acumula jugando |
| **EXP requerida por nivel** | Sí, la ventana de personaje da actual/requerida | **Exacta nivel por nivel** | Trivial por nivel; **imposible cubrir 1.750 niveles**. Se muestrean niveles bajos y se **ajusta la forma** contra tablas comunitarias |
| **EXP que da un monstruo** | Sí, delta de EXP por kill | ±2% con ~50 kills del mismo mob | ~30 min por tipo de monstruo. Hay **cientos** de monstruos → no escala solo |
| **Daño de un skill** | Sí, número en pantalla | Buena para el **rango** (mín/máx) con ~100 muestras; **mala para la fórmula** si no podés variar stats de a uno | Días. Requiere resetear/redistribuir puntos para aislar variables |
| **Condiciones de entrada a eventos** | Sí — NPC, item requerido, nivel mínimo, cupo | **Exacta** | Una sesión por evento |
| **Horarios de eventos** | Sí — anuncio en pantalla | **Exacta**, y es **el único modo confiable** de saber los del server oficial (§2.4) | 24-48 h de observación pasiva |
| **HP / defensa de un monstruo** | **No directo** — hay que inferirlo del daño acumulado | Pobre; se contamina con evasión, resistencias, crítico | Alto costo, bajo retorno |
| **Tasas de la Chaos Machine** | **En la práctica, no** | Para distinguir 70% de 60% con confianza necesitás **cientos de intentos**, cada uno consumiendo materiales caros | **Prohibitivo.** Descartar |
| **Tasas de drop** | **No** | Miles de kills por item | **Prohibitivo.** Descartar |
| **Fórmula de acierto (attack vs defense rate)** | Parcialmente | Requiere variar stats de a uno y contar miss sobre cientos de golpes | Muy alto. Y es justo donde **la comunidad técnica tampoco tiene consenso** (§3.2) |

### 5.3 Veredicto del método empírico

**Es una fuente de primera clase para una parte del problema, y una trampa de tiempo para la otra.**

- **Es la única fuente primaria disponible.** Todo lo demás es alguien contándote lo que vio. Acá
  lo ves vos, en el servidor oficial, en la season actual.
- **Su mejor uso no es medir: es transcribir.** Las tablas de Master/Majestic, los stats de items,
  las condiciones y horarios de eventos **están escritos en la pantalla**. Sacarlos de ahí es
  trabajo de escriba, no de estadístico, y da **datos exactos**. Ahí el rendimiento por hora es
  altísimo.
- **Su segundo mejor uso es de árbitro.** Cuando dos fuentes se contradicen, una tarde de juego
  cierra la discusión. Ese rol —**verificador**, no descubridor— es donde más vale por hora.
- **Su peor uso es estimar probabilidades** (chaos machine, drops, acierto). Ahí el costo crece
  con el cuadrado de la precisión que querés y no llegás nunca.
- **Y no escala.** Con cientos de monstruos por season y un blanco que se mueve dos veces por año,
  no vas a medir el juego entero de a un mob por vez. **[INFERIDO]** Un jugador dedicado saca, con
  suerte, **el 5-10% de las constantes que un emulador necesita**, en meses.

**Confiabilidad: MÁXIMA (es observación directa). Rendimiento: MUY ALTO en transcripción y
arbitraje; MUY BAJO en probabilidades y en cobertura masiva.**

---

## 6. El ranking

### Por confiabilidad (¿a quién le creo el número?)

| # | Fuente | Confiabilidad | Por qué |
|---|---|---|---|
| 1 | **Observación propia en el servidor oficial** (§5) | Máxima | Fuente primaria. Sin intermediarios. Season actual |
| 2 | **Webzen oficial** — Guide Library + patch notes KR (§1) | Máxima **de lo que publica** | Es el titular. Pero publica **semántica**, casi nunca constantes |
| 3 | **OpenMU, código auditable** (§4) | Alta | Se lee, se corre, se verifica. Pero **sin citas** y **solo S6** |
| 4 | **Historiales con citas en GitHub** (§3.1) | Alta **como índice** | Citan la fuente oficial nota por nota. No traen números |
| 5 | **MU Online Fanz** (§2.1) | Alta | 14 años, permiso de Webzen, DBs estructuradas, cubre seasons nuevas. Sin citas |
| 6 | **Comunidad técnica (RaGEZONE, foros)** (§3.2) | Media, variable por hilo | Ingeniería seria y opinión mezcladas. Sirve como **hipótesis a verificar** |
| 7 | **Wikis enciclopédicas** (Fandom, StrategyWiki, namu) (§2.2-2.3) | Media | Buenas para "qué es", flojas para "cuánto vale" |
| 8 | **Wikis de servidores privados** (§2.4) | **Baja para datos** | Documentan **otra configuración**. Alta para entender un sistema rápido |

### Por rendimiento (información útil por hora invertida)

| # | Fuente | Rendimiento |
|---|---|---|
| 1 | **OpenMU (código + `Progress.md` + `docs/Packets/`)** | Máximo. Miles de constantes S6 y una arquitectura completa, gratis, hoy |
| 2 | **Transcripción de tooltips en el juego** | Muy alto. Datos **exactos** de seasons nuevas, con lápiz y paciencia |
| 3 | **MU Online Fanz (bases de datos)** | Muy alto. Ya viene tabulado y cubre seasons nuevas |
| 4 | **MuHistory / mu-online-history** | Alto **como índice**. Te dice a qué patch note oficial ir |
| 5 | **Patch notes oficiales KR** | Medio-alto. Denso, en coreano, pero es la verdad con fecha |
| 6 | **Guide Library oficial global** | Medio. Define bien, numera poco |
| 7 | **RaGEZONE** | Alto en potencia, **no verificable desde acá** |
| 8 | **Wikis de privados** | Bajo para el emulador (pero rápido para entender un sistema) |

### La mejor fuente, y por qué

**No hay una sola: hay un método de tres patas, y ese método es la respuesta.**

> **La fuente más confiable de este proyecto es la TRIANGULACIÓN: un número solo vale cuando dos
> fuentes independientes lo dicen igual y una tercera —la pantalla del juego— no lo desmiente.**

Lo probé en este mismo informe: la fórmula de Master EXP de OpenMU y una tabla comunitaria hecha
por jugadores **coinciden dígito por dígito en los cuatro puntos que verifiqué**. Por separado,
ninguna es citable. Juntas, es un número que yo pondría en producción.

**Si me obligan a elegir una para empezar hoy: OpenMU.** Por tres razones:

1. **Es lo único que puedo verificar de punta a punta.** Lo abrí, lo leí, cité líneas. Todo lo
   demás en este informe pasó por un buscador.
2. **Te da la forma, que es más valiosa que el valor.** Saber que la EXP es una cúbica con quiebre,
   que la Chaos Machine es "ingredientes + porcentaje base + modificadores", que el daño es un
   grafo de atributos compuestos — eso **define la estructura de datos del emulador**. Los números
   se cambian después, en el panel; la estructura equivocada se paga reescribiendo.
3. **Es la vara de calibración.** Todo lo que midas jugando y todo lo que copies de una wiki tiene
   contra qué contrastarse. Sin ese ancla, no sabés si estás midiendo bien o inventando — que es,
   exactamente, la misma lógica del **Paso 1 del doc 09**: aprendé a leer con un caso donde ya
   sabés la respuesta.

### El orden de arranque que recomiendo

1. **Semana 1 — OpenMU como base.** Leé `docs/Progress.md`, `docs/Packets/`, y sobre todo
   `src/Persistence/Initialization/VersionSeasonSix/`. Salís con el vocabulario, la arquitectura y
   un set completo de constantes S6 de referencia.
2. **Semana 1-2 — armá el índice.** [MuHistory](https://github.com/AlighieriDemiurgs/MuHistory) +
   [mu-online-history](https://github.com/Khdoop/mu-online-history) → una lista ordenada de cada
   sistema nuevo con su patch note oficial. **Ese es tu backlog de investigación**, y sale de dos
   READMEs.
3. **Semana 2 — semántica oficial.** Para cada sistema del backlog, la guía oficial correspondiente
   (`/gameinfo/guide/detail/<id>`) + el patch note KR. Definís **qué hace** cada cosa antes de
   preguntarte cuánto vale.
4. **Semana 3 — cosecha comunitaria.** MU Online Fanz (DBs) y las tablas que aparezcan. Anotá cada
   número **con su fuente**. Todavía no le creas a ninguno.
5. **Semana 3-4 — la partida.** Cuenta gratuita, y **arrancá por transcripción**: tooltips del
   árbol Master/Majestic, stats de items, condiciones y horarios reales de eventos. Después, la
   medición de EXP por monstruo en unos pocos mobs de referencia.
6. **Permanente — triangulá y registrá.** Una tabla con cuatro columnas: **valor · fuente A ·
   fuente B · verificación en pantalla**. Lo que tiene las tres, entra. Lo que tiene una, queda
   como hipótesis marcada. **Eso, publicado, es un aporte que hoy no existe en ningún lado** — y
   OpenMU pide explícitamente ese tipo de contribución.

---

## 7. Lo que NO pude verificar (declarado, no escondido)

1. **Nada de Webzen.** `muonline.webzen.com`, `www.muonline.co.kr` y `company.webzen.com` están
   bloqueados por el proxy de egress de este entorno. **Todo lo que digo en §1 sobre el nivel de
   detalle de las guías oficiales es [VÍA BUSCADOR] o [INFERIDO].** Es la afirmación más
   importante del informe y es la que menos pude comprobar. **Chequealo vos: son 20 minutos.**
2. **RaGEZONE.** Bloqueado. No leí un solo hilo. Sé que existe, que está viva y que hay hilos con
   los títulos correctos. **No puedo opinar sobre la calidad real de su contenido en 2026.**
3. **MU Online Fanz.** Bloqueado. Le doy la calificación más alta de la comunidad **por señales
   indirectas** (antigüedad, permiso declarado de Webzen, estructura de sus DBs, cobertura de
   clases S19+). **No vi una sola ficha completa.** Si esa evaluación se cae, el ranking cambia.
4. **La cobertura real de las wikis.** No pude entrar a Fandom, StrategyWiki ni a las de privados.
   La calificación es **[INFERIDA]** de cómo funciona cada plataforma, no de lo que tienen.
5. **Cuánto detalle numérico traen los patch notes coreanos.** Sé que existen y que los historiales
   serios los citan como primarios. **No leí ninguno.** Es la incógnita con más upside del informe.
6. **El comportamiento de monstruos** (IA, agro, patrones, respawn). **No encontré ninguna fuente
   —oficial ni comunitaria— que lo documente.** Es el ítem peor cubierto de todo el pedido:
   probablemente solo salga de observación propia, y con mucha paciencia.
7. **Las tablas comunitarias que triangulé (§4.3)** las tomé de resúmenes de buscador. **Los
   cálculos contra la fórmula de OpenMU los hice yo y dan exacto [VERIFICADO]**, pero **la tabla
   de origen no la abrí**. Antes de apoyarse en ella, abrila.

---

**En una línea:** *Webzen te dice qué hace cada cosa pero no cuánto vale; OpenMU te dice cuánto
valía en S6 y con qué forma; la comunidad te tira números sin citar; y la pantalla del juego es
el único árbitro. El dato bueno es el que sobrevive a los cuatro.*

— Elaborado por GSG
