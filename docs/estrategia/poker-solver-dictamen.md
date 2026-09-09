# Dictamen — ¿le construimos un *poker solver* a un cliente jugador?

> **Pedido del dueño:** *"con un orquestador y un equipo de agentes expertos, ¿podrías desarrollar un
> poker solver? para un jugador que es cliente y quiere aumentar su winrate"*
>
> **Estado:** dictamen para decisión del dueño. **No adoptado como fundamento** (ADR-045: nada se
> adopta sin pasar por el Challenger, y la síntesis la firma el dueño).
> **Fecha:** 2026-09-09 · **Rama:** `claude/poker-solver-orchestrator-agents-hq26vd`

---

## 1. Respuesta corta

**Sí, técnicamente se puede — y hay código andando que lo prueba. Pero "construir un solver" es la
respuesta equivocada al problema del cliente, y recomendarlo sería venderle humo caro.**

Las tres cosas separadas, porque se mezclan todo el tiempo:

| Pregunta | Respuesta |
|---|---|
| ¿Puede la factory construir un motor de equilibrio que dé números correctos? | **Sí, y está demostrado.** Ver §4: motor CFR+ propio, validado contra la solución analítica de Kuhn poker con 7 decimales. |
| ¿Conviene construir un solver postflop completo que compita con PioSOLVER/GTO Wizard? | **No.** Meses de ingeniería en C++/CUDA para llegar a algo peor que un producto de USD 75-475. |
| ¿Podemos subirle el winrate al cliente? | **Sí, y por otro camino:** el cuello de botella del jugador no es el acceso al solver, es el proceso de estudio. Ahí es donde GSG agrega valor real. |

---

## 2. Cómo se produjo este dictamen (gobernanza aplicada)

Se corrió el modelo de trabajo obligatorio de GSG, no una opinión suelta:

- **Fase 0 obligatoria** (`CLAUDE.md`): `npm run brain` + foto derivada del repo (`brain/10-estado/ESTADO.md`,
  sobre `0476abe`), `git status`, migraciones (41 en el repo, con la colisión de timestamp
  `20260711140000` ya conocida y anotada), y calibración por ADR-052.
- **Par tesis/antítesis obligatorio** (ADR-045): se abrió el **Advisory Board** (la tesis) y el
  **Challenger / red-team** (la antítesis) en paralelo, ambos calibrados sobre el corpus. Ninguna
  línea de negocio nueva se adopta sin ese cruce.
- **Evidencia de ingeniería propia** en vez de estimación: se construyó una prueba de concepto real y
  se **midió** (§4). Un dictamen sobre viabilidad técnica que no corre código es una corazonada.
- **Zona de de-sesgo** (ADR-046): este documento es negocio/estrategia → voz humana y criolla. El
  código y los números son zona estándar → precisos y convencionales.

---

## 3. Tesis y antítesis (lo que dijeron los dos frentes)

### 3.1 Lo que trajo el Advisory Board (tesis)

El motor de cálculo GTO **ya es un commodity**. Relevamiento de mercado del frente (fuentes citadas al
pie del documento del Advisory):

| Producto | Precio relevado | Qué es |
|---|---|---|
| PioSOLVER | Pro USD 249 · Edge USD 475, pago único | El estándar. Calculadora de equilibrio postflop; no enseña, no coachea. |
| GTO+ | USD 75, pago único | Motor equivalente a Pio en spots comparables. |
| GTO Wizard | Free / ~USD 39 / ~USD 99 / ~USD 129+ por mes | Soluciones **pre-resueltas** + trainer + reportes. Lo más parecido a coaching empaquetado. |
| DeepSolver | desde ~USD 19-29/mes | Motor propio más liviano, nicho low-cost. |
| Simple Postflop | — | Obsoleto, ya no se recomienda. |

Dónde **sí** hay lugar para un estudio chico: **la capa de arriba del motor.** Coaching en castellano
rioplatense (todo el ecosistema es en inglés), *leak-finder* sobre el historial de manos propio del
jugador, plan de estudio personalizado, drilling en el celular, precio en pesos y soporte por WhatsApp.

Ranking del Advisory por **impacto en winrate por hora nuestra**:

1. **Leak-finder + rangos preflop** sobre las manos reales del cliente ← máximo impacto
2. **Drill trainer** con sus propios leaks (repetición espaciada)
3. **Plan de estudio semanal** con seguimiento
4. **Solver postflop propio desde cero** ← **el de menor impacto por hora**

### 3.2 Lo que trajo el Challenger (antítesis)

- **Un solver no es una feature, es una plataforma en otro dominio matemático.** Abstracción de
  bet-sizes, abstracción/isomorfismo de cartas, árbol de 3 calles. Cifras del relevamiento: 16 GB de
  RAM alcanzan para postflop de complejidad media; árboles grandes piden 12 GB+ solo en postflop y el
  preflop completo 64-128 GB. Los productos comerciales son C++/CUDA por eso, no por gusto.
- **Un solver levemente incorrecto es PEOR que ningún solver.** El jugador lo trata como verdad
  matemática y memoriza líneas falsas con la confianza de "esto lo calculó una máquina".
- **El solver nunca fue el cuello de botella del winrate.** Lo es el proceso de estudio, la disciplina
  de revisar manos y el control en mesa.
- **Costo de oportunidad:** es P3 por definición (`CLAUDE.md`, línea de negocio nueva) mientras el foco
  declarado son las demos que cierran venta del ERP. Cada slot del pool de 5 puesto en un motor
  numérico de un solo cliente es un slot que no está en P1.
- **Riesgo reputacional asimétrico:** si el output está mal y el cliente pierde bankroll siguiéndolo,
  la marca queda pegada a eso.
- **Kill-argument más fuerte:** ya existe algo mejor, más barato y más validado que cualquier cosa que
  construyamos.
- **Survive-argument más fuerte:** si el alcance se reduce a **estudio sobre las manos propias, sin
  nada en vivo, montado sobre un motor ya validado**, deja de ser "construir un CFR desde cero" y pasa
  a ser una capa de producto que la factory sí sabe hacer bien.

---

## 4. Evidencia de ingeniería — lo que se construyó y se midió

Para no dictaminar de oído, se construyó una prueba de concepto real en `productos/poker-solver/`:
**cero dependencias**, ESM plano, corre con `node --test`. No toca el ERP ni su pipeline.

### 4.1 Lo que está andando

| Módulo | Qué resuelve |
|---|---|
| `src/cards.mjs` | Naipes como enteros 0..51, máscaras de bits para bloqueos. |
| `src/evaluator.mjs` | Evaluador de 5 a 7 naipes → entero comparable. |
| `src/range.mjs` | Notación de rango real (`QQ+, A2s+, T9s-76s, 76s:0.5`) → combos con peso, con *card removal*. |
| `src/cfr.mjs` | **Motor CFR+ vectorial** agnóstico del juego + medición de **explotabilidad** por mejor respuesta. |
| `src/kuhn.mjs` | Kuhn poker: el patrón de calibración del motor. |
| `src/showdown.mjs` | Masa de showdown con bloqueos en O(n log n) + oráculo de fuerza bruta. |
| `src/river.mjs` | **Solver exacto de subjuego de river** con rangos completos y árbol de apuestas configurable. |
| `bin/resolver-river.mjs` | CLI: imprime la solución legible por clase de mano (el jugador no lee `Float64Array`). |

**41 tests, todos verdes, en 1,7 s.** Detalle de uso y del mapa de módulos en
[`productos/poker-solver/README.md`](../../productos/poker-solver/README.md).

### 4.2 Las mediciones (esto es el punto)

**Calibración contra verdad analítica.** Kuhn poker tiene equilibrio de Nash resuelto desde 1950: el
valor del juego para el primer jugador es **exactamente −1/18**. El motor da:

```
iters   explotabilidad     valor P0
  100        2.797e-3     -0.0556169
 1000        1.727e-4     -0.0555568
 3000        4.943e-5     -0.0555557
30000        1.529e-5     -0.0555556   ← −1/18 = −0.0555556
```

Y reproduce las estrategias de equilibrio publicadas, incluida la relación fina que liga dos nodos
distintos del árbol: el primer jugador apuesta el rey **3×** más que la jota, nunca apuesta la reina, y
defiende la reina con frecuencia **α + 1/3** donde α es la misma α de la apuesta con jota. Si los
*reach* estuvieran mal propagados, esas dos frecuencias no cerrarían.

**Un hallazgo que vale la pena contar**, porque muestra la diferencia entre "anda" y "anda bien": la
primera versión convergía a la respuesta correcta pero con explotabilidad cayendo como **1/√T** — el
ritmo de CFR vanilla. La causa era actualizar los dos jugadores en la misma iteración. Con
actualizaciones **alternadas** (lo que hacen los solvers reales) la explotabilidad a 3.000 iteraciones
pasó de `2,05e-3` a `4,94e-5`: **40× mejor con el mismo cómputo**. Sin medir explotabilidad ese error
era invisible — el motor daba el valor correcto en las dos versiones.

**Calibración de la cadena completa, con naipes reales.** Kuhn valida el motor CFR en abstracto. Falta
saber si evaluador + rangos + showdown con bloqueos + CFR dan bien **juntos**. Para eso está el **juego
del clarividente**, que también tiene solución cerrada: con pote P y apuesta B, los faroles deben ser
`B/(P+B)` del valor y el bluff-catcher debe pagar `P/(P+B)`. Con P=100 y B=50 el motor da **faroles 1/3
y pago 2/3**, sobre un board real y con bloqueos activos.

**Rendimiento medido** (JavaScript plano, sin dependencias, peor caso realista: 481 combos por lado,
árbol de 16 nodos con tres tamaños de apuesta más all-in y una subida):

| Iteraciones | Tiempo | Explotabilidad |
|---:|---:|---:|
| 200 | 0,5 s | 0,275% del pote |
| 800 | 1,6 s | 0,039% del pote |
| 2.000 | 3,8 s | **0,009% del pote** |

Un spot típico (30 vs 37 combos) converge a 0,039% del pote en **0,41 s**. La masa de showdown con
bloqueos se resolvió en O(n log n) con sumas prefijas por naipe: a 615 combos por lado, **0,098 ms**
contra **4,79 ms** de la fuerza bruta (**~49×**, y la ventaja crece con el ancho del rango), con
**coincidencia exacta** entre las dos implementaciones (diferencia máxima 0,0).

Ese último dato es la respuesta concreta a la objeción más fuerte del Challenger — que no podríamos
hacerle QA a un motor numérico sin *ground truth*: **se le hace QA con una segunda implementación
obviamente correcta.** Y vale anotar cómo se llegó al número, porque es la norma en acción: la medición
de 49× la hizo esta sesión **re-verificando** una cifra que había reportado el frente de cálculo (que
midió a otro ancho de rango). No se publica un número que no se midió acá (lección **MP-15**).

### 4.3 Lo que el motor encuentra solo

Vale contarlo porque es la diferencia entre "calcula" y "juega". En un spot armado con **desventaja de
rango severa** para OOP (gana con 3 de 13 combos), el solver **no apuesta las nuts: pasa con todo y
tiende una trampa.** Apostar con un rango capado es transparente — el rival foldea y las nuts cobran
apenas el pote. Entonces pasa, deja que el rival apueste el 76%, y paga. Y en ese mismo nodo el
bluff-catcher (`QQ`) mezcla **exactamente 50/50**, que es la firma de la indiferencia en el equilibrio.

Nada de eso está programado: sale de resolver el juego. Es el tipo de línea por la que un jugador paga
un coach.

### 4.4 Lo que esta evidencia SÍ prueba y lo que NO

**Sí prueba:**
- La factory puede escribir matemática de equilibrio correcta y **verificarla contra una verdad
  externa**, que es la parte que el Challenger marcaba como no-tenemos-cómo-hacer.
- El **subjuego de river es exacto y no necesita abstracción**: en el river no vienen más cartas, así
  que CFR+ con rangos completos da el equilibrio sin error de abstracción. En ese pedazo del árbol el
  número de un motor propio **no es peor que el de PioSOLVER: es el mismo número.**
- La disciplina de "medir explotabilidad o no decir que convergió" ya está incorporada al código.
- **La objeción de QA del Challenger tiene respuesta:** dos implementaciones independientes (una rápida y
  una obviamente correcta) que dan el mismo número hacen ese número auditable.

**No prueba, y hay que decirlo con todas las letras:**
- **No hay solver de flop ni de turn.** Ahí aparecen la abstracción de cartas y el árbol de 3 calles,
  que es donde viven los años de C++/CUDA y los 12-128 GB de RAM. **La antítesis tiene razón en eso.**
- Node/JS no es el runtime para un motor de producción de árbol completo.
- Un motor correcto **no es un producto**: falta todo lo que convierte números en winrate.

---

## 5. Síntesis — la recomendación

**El punto donde tesis y antítesis coinciden es el mismo, y es la recomendación:**

> **NO construir un solver postflop propio que compita con los comerciales. SÍ construir la capa que
> ninguno de ellos da: el estudio sobre las manos reales del jugador, en castellano, con plan y
> seguimiento — apoyada en un motor de equilibrio ya validado, y con un solver de river exacto propio
> como pieza de verificación.**

El motor propio deja de ser "nuestro PioSOLVER" y pasa a ser dos cosas mucho más defendibles:

1. **Verificador.** Un segundo motor independiente para cruzar contra el de terceros. Cuando dos
   implementaciones distintas dan el mismo número, ese número es confiable. Es lo que responde la
   objeción más fuerte del Challenger ("no podemos dar QA de un motor que no podemos validar").
2. **Resolvedor de river a demanda.** Exacto, sin abstracción, para los spots concretos que le
   aparecen al cliente en su propio historial.

### 5.1 Lo que efectivamente movería el winrate, en orden

1. **Leak-finder sobre su historial** — importar sus manos, cruzarlas contra soluciones y ordenar los
   errores por **pesos perdidos por cada 100 manos**, no por "gravedad" abstracta. Ataca errores
   sistemáticos y baratos de corregir. Máximo impacto por hora nuestra.
2. **Resolver exacto de sus rivers reales** — con el motor de §4, sobre los spots que él realmente jugó.
3. **Drill trainer con sus propios leaks** — repetición espaciada en el celular.
4. **Plan de estudio semanal con seguimiento** — la parte que ningún producto del mercado le da.

### 5.2 La línea roja — no negociable

**No se construye asistencia en tiempo real (RTA), ni aunque el cliente la pida y la pague.**

- Viola el ToS de **todos** los sitios de póker online; termina en baneo y **confiscación de fondos**
  (caso documentado Fedor Kruse), y en algunas jurisdicciones puede ser fraude.
- El caso **Odin** es la advertencia exacta: nació como trainer legítimo y pasó a ser señalado como
  herramienta de RTA al quitarle el delay.
- **Frases que hay que escuchar como alarma**, porque son RTA disfrazada: *"que corra mientras juego"*,
  *"que me avise en el momento"*, *"que se integre con el cliente de póker"*, *"sacale el delay"*.
- Nada de screen-scraping, nada de overlay que sugiera acción durante una mano en curso, nada que lea
  el estado de la mesa en vivo. **Todo el output es post-sesión o fuera de mesa.** Va explícito en el
  contrato con el cliente.

Las herramientas **off-table** (estudio, review post-sesión, drills) son 100% legales: es lo que vende
toda la industria relevada en §3.1.

---

## 6. El equipo — orquestador y células (lo que preguntó el dueño)

Sí se puede hacer con la factory, y así se reparte. Cada célula **declara su modelo explícitamente**
(§4 del modelo de trabajo): una sesión sin modelo declarado está fuera de norma.

| Frente | Célula / agente | Capa | Modelo |
|---|---|---|---|
| Orquestación, plan, reporte al dueño | **PMO / Arquitecto jefe** | Alto juicio | Opus |
| Reversible vs. irreversible del plan | **Arquitecto de Solución** (ADR-048) | Alto juicio | Opus en el borde |
| Tesis/antítesis de la línea | **Advisory + Challenger** (ADR-045) | Gobernanza | Sonnet |
| **Matemática del motor** (CFR, showdown con bloqueos, explotabilidad) | análisis/cálculo complejo | Alto juicio | **Fable** |
| Ingesta de hand histories, leak-finder, backoffice | **backoffice-producto + backoffice-ingeniería** | Ejecución | Sonnet |
| Drill trainer, UI, probador | **QA / Probador + Diseño** | Ejecución | Sonnet |
| Precio y planes | **Pricing & Packaging** | Ejecución | Sonnet |
| **Gate de Excelencia pre-merge** | **Auditoría GSG** | Control | **Opus, siempre** |

El Gate **nunca se degrada de modelo** (§3 del modelo de trabajo), ni siquiera en modo economía.

**Encaje organizacional:** no es ERP ni pyme fiscal argentina, así que **no entra en Agencia Digital**
tal como está escrito su charter, y tampoco es un negocio propio del grupo (Agencia Grow). Es un
**encargo a medida para un tercero**. Si el dueño quiere abrirlo, va como **línea nueva con su propio
ADR**; si no, es trabajo fuera de alcance y se cobra aparte, **sin tocar el Core** (guardarraíl
anti-consultora: un solo Core, nunca un fork).

**Prioridad:** **P3**. Corre con capacidad sobrante del pool de 5, **no se abre un sexto slot**, y en
congestión **cede el lugar a las demos que cierran venta** del ERP.

---

## 7. Plan por fases, atado a DEMO → VENTA → INVERSIÓN

Regla de gasto (`CLAUDE.md`): **no se invierte un peso hasta que la venta está concretada.**

| Fase | Qué se hace | Gasto | Disparador |
|---|---|---|---|
| **0 — Dictamen** | Este documento + la prueba de concepto de §4. **Hecho.** | **$0** | — |
| **1 — DEMO** | Correr el solver de river sobre 3 spots reales que traiga el cliente y mostrarle el reporte. Todo local, sin infra, sin datos suyos persistidos, sin login. | **$0** | OK del dueño |
| **2 — VENTA** | El cliente acepta. Recién acá se habilita gasto. | — | OK comercial |
| **3 — INVERSIÓN** | Licencia de terceros para el motor de flop/turn (**la paga el cliente**), ingesta de su historial, leak-finder, drill trainer, plan de estudio. | Post-venta | Venta cerrada |

Los secretos y credenciales de la fase real **los pega siempre el dueño, nunca el agente** (FASE 2 de
credenciales).

**Precio sugerido** (a validar con Pricing & Packaging): ARS 15.000-30.000/mes por el servicio de
estudio, con la licencia del motor de terceros a cargo del cliente. El ángulo de distribución es
**precio en pesos + soporte por WhatsApp**, no la tecnología: los productos relevados cobran en USD con
tarjeta internacional, que es fricción real para el jugador argentino.

---

## 8. Go / no-go

**GO** solo si se cumplen las tres:

1. El dueño confirma que **abre esta línea** fuera de ERP/Grow, con su propio ADR.
2. El cliente **firma que el alcance es off-table** (sin RTA) y se hace cargo de la licencia del motor
   de terceros para flop/turn.
3. Hay **capacidad sobrante** del pool de 5 sin tocar P1.

**NO-GO** automático si: se pide construir el solver postflop completo desde cero · aparece **cualquier**
pedido de asistencia en vivo · compite por slots con las demos del ERP en congestión.

---

## 9. Deuda y supuestos anotados

- **Supuesto:** los precios de §3.1 vienen del relevamiento web del Advisory (fuentes citadas en su
  informe); no se re-verificaron uno por uno en este dictamen. Antes de cotizarle al cliente, confirmar.
- **Deuda:** la prueba de concepto es `.mjs` sin dependencias porque `node_modules` no está instalado en
  esta sesión y así corre ya, sin tocar el `tsc`/build del ERP. Si la línea se adopta, la versión de
  producción va en TypeScript (o Rust para el motor).
- **Alcance del motor propio:** solo river. Flop y turn requieren abstracción de cartas y no están.
- **Pendiente si hay GO:** ADR de la línea, RACI del frente, y entrada en el registro de lecciones
  (ADR-047) al cierre.

---

*— Elaborado por GSG*
