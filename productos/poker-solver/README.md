# Poker solver — prueba de concepto de GSG

**Qué es:** un motor de equilibrio (CFR+) que resuelve **subjuegos de river de forma exacta**, con
rangos completos y sin abstracción de cartas. Cero dependencias, ESM plano, corre con el runner de tests
de Node.

**Qué NO es:** un reemplazo de PioSOLVER ni de GTO Wizard. **No resuelve flop ni turn.** El dictamen con
el porqué de ese recorte, el análisis de mercado y la recomendación de negocio está en
[`docs/estrategia/poker-solver-dictamen.md`](../../docs/estrategia/poker-solver-dictamen.md).

---

## Por qué el river y no "un solver postflop"

En el river **ya no vienen más cartas**. Eso cambia todo:

- No hay que abstraer nada — ni buckets de manos por equity, ni equity futura, ni muestreo de turns.
- El subjuego es un juego de información imperfecta **finito y chico**.
- CFR+ con rangos completos converge al equilibrio **sin error de abstracción**.

Traducido: en el river, el número de un motor propio no es peor que el de un solver comercial — **es el
mismo número**. En flop y turn no: ahí aparecen la abstracción de cartas y el árbol de tres calles, que
es donde viven los años de ingeniería en C++/CUDA y los 12-128 GB de RAM de los productos comerciales.
Pretender lo contrario sería vender humo.

---

## Cómo se prueba que los números están bien

Un solver que no se puede validar contra una verdad externa no es un solver: es una opinión con
decimales. Acá hay tres niveles de verificación, y los tres corren en CI local:

1. **Evaluador de manos** — contrastado contra fuerza bruta: para miles de manos aleatorias de 7 naipes,
   `evaluar(7)` debe dar exactamente el máximo de `evaluar(5)` sobre las 21 combinaciones.
2. **Masa de showdown con bloqueos** — la implementación rápida (O(n log n) con sumas prefijas) se
   contrasta contra un oráculo de fuerza bruta O(n·m) obviamente correcto. Con una salvedad honesta: las
   dos son independientes en la **agregación**, pero **comparten el evaluador**, así que ese cruce no
   detectaría un error en el evaluador. Para eso está el punto 1, que es su verdad externa aparte.
3. **Motor CFR+** — calibrado contra **Kuhn poker**, cuyo equilibrio de Nash está resuelto
   analíticamente desde 1950. El valor del juego para el primer jugador es exactamente **−1/18**:

   ```
   iters   explotabilidad     valor P0
     100        2.797e-3     -0.0556169
    1000        1.727e-4     -0.0555568
    3000        4.943e-5     -0.0555557
   30000        1.529e-5     -0.0555556   ← −1/18 = −0.0555556
   ```

   Además reproduce las estrategias publicadas, incluida la relación que **liga dos nodos distintos**
   del árbol: apuesta el rey 3× más que la jota, nunca apuesta la reina, y defiende la reina con
   frecuencia **α + 1/3** con la misma α. Si los *reach* estuvieran mal propagados, no cerraría.

4. **Cadena completa con naipes reales** — contra el **juego del clarividente**, que tiene solución
   cerrada. Montaje: OOP polarizado (mitad nuts, mitad aire), IP con un bluff-catcher puro, una sola
   apuesta. Con pote P y apuesta B, la teoría dice que los faroles son `B/(P+B)` del valor y que IP paga
   `P/(P+B)`. Con P=100 y B=50 el motor da faroles 1/3 y pago 2/3, como corresponde. Este test valida
   evaluador + rangos + showdown con bloqueos + CFR **juntos**, que es lo que un test de cada pieza por
   separado no prueba.

### El hallazgo que justifica medir explotabilidad

La primera versión del motor daba **el valor correcto** pero convergía como `1/√T` — el ritmo de CFR
*vanilla*. La causa: actualizaba los dos jugadores en la misma iteración. Con actualizaciones
**alternadas** (lo que hacen los solvers reales), la explotabilidad a 3.000 iteraciones pasó de
`2,05e-3` a `4,94e-5`: **40× mejor con el mismo cómputo**.

Sin medir explotabilidad ese error era **invisible**: las dos versiones daban el mismo valor de juego.
De ahí la regla: *si no se midió la explotabilidad, no se puede decir que convergió.*

---

---

## Rendimiento medido

Peor caso realista, en JavaScript plano y sin dependencias (rangos anchos de 481 combos por lado, árbol
de 16 nodos de decisión, tres tamaños de apuesta más all-in y una subida):

Todo esto sale de `node bin/medir.mjs`, que está commiteado justamente para que los números se puedan
**reproducir** en vez de creerlos. Condiciones: Node v22.22.2, 50 corridas de calentamiento del JIT,
rangos de **615 combos por lado**, árbol de 16 nodos.

| Iteraciones | Tiempo | Explotabilidad |
|---:|---:|---:|
| 200 | 0,53 s | 0,231% del pote |
| 800 | 1,94 s | 0,032% del pote |
| 2.000 | 4,73 s | **0,009% del pote** |

Un spot típico (30 vs 37 combos) converge a 0,039% del pote en **0,49 s**.

Por debajo de **0,3% del pote** un spot se considera resuelto para estudiar. Ojo: ese umbral es **criterio
propio de GSG**, no una convención citable de la industria — está declarado como tal en el código y en el
output del CLI.

La masa de showdown con bloqueos corre en O(n log n) con sumas prefijas por naipe, contra O(n·m) de la
fuerza bruta:

| Rango | Combos | Rápida | Fuerza bruta | Factor | Coincidencia |
|---|---:|---:|---:|---:|---:|
| medio | 615 | 0,0282 ms | 4,57 ms | **162×** | exacta (dif 0,0) |
| completo | 1081 | 0,0450 ms | 13,69 ms | **304×** | exacta (dif 0,0) |

Ese oráculo lento no se tiró: quedó en los tests verificando al rápido.

**Una advertencia sobre este número, que es la parte útil de contarlo:** se midió tres veces y dio 265×,
49× y ~157× antes de dar 162×. Las dos primeras mediciones no calentaban el JIT de V8. Por eso la
medición dejó de ser un script suelto y pasó a ser un archivo commiteado con las condiciones escritas.

---

## Lo que el solver encuentra solo (y por qué da confianza)

En un spot armado a propósito con **desventaja de rango severa** para OOP (gana con 3 de 13 combos), el
motor no apuesta las nuts: **pasa con todo y tiende una trampa**. Apostar con un rango capado es
transparente — el rival foldea y las nuts cobran apenas el pote. Entonces pasa, deja que el rival (que
tiene la ventaja de rango) apueste el **76% de las veces** —y cuando apuesta es un all-in del tamaño
del pote—, y paga. Y en el mismo nodo el bluff-catcher (`QQ`) mezcla
**exactamente 50/50**, que es la firma de la indiferencia en el equilibrio.

Nada de eso está programado. Sale de resolver el juego. Está fijado como test: si alguien "arregla" el
motor para que apueste las nuts, el test se cae, y hace bien.

---

## Uso

```bash
cd productos/poker-solver

# todos los tests
npm test          # o: node --test test/*.test.mjs

# un spot de ejemplo
node bin/resolver-river.mjs

# un spot propio
node bin/resolver-river.mjs \
  --board Ah7d2c9sKh \
  --oop "QQ+, AKo, AQs, A7s, 76s" \
  --ip  "TT-JJ, AQo, AJs, KQs, 98s" \
  --pote 100 --stack 150 --iteraciones 800
```

### Notación de rangos soportada

| Forma | Ejemplo | Qué expande |
|---|---|---|
| Par | `QQ` | los 6 combos |
| Par hacia arriba | `QQ+` | QQ, KK, AA |
| Suited / offsuit | `AKs` · `AKo` | 4 · 12 combos |
| Sin sufijo | `AK` | los 16 |
| Suited hacia arriba | `A2s+` | A2s … AKs |
| Rango con guion | `A5s-A2s` · `T9s-76s` · `99-QQ` | misma carta alta · mismo gap · pares |
| Combo explícito | `AhKh` | ese solo |
| Peso parcial | `76s:0.5` · `QQ:50%` | mezcla, no sí/no |

Los pesos parciales importan: los rangos reales no son binarios. Un jugador 3-betea `AJs` el 40% de las
veces y lo paga el 60%. Un solver que toma el rango como sí/no resuelve un juego que nadie juega.

Las cartas del board se descuentan automáticamente del rango (*card removal*).

---

## Mapa de módulos

| Archivo | Responsabilidad |
|---|---|
| `src/cards.mjs` | Naipes como enteros 0..51 y parseo. Entero porque el naipe se usa como índice. |
| `src/evaluator.mjs` | Evaluador de 5-7 naipes → entero comparable. |
| `src/range.mjs` | Notación de rango → combos con peso, con card removal. |
| `src/showdown.mjs` | Masa gana/pierde con bloqueos en O(n log n) + oráculo de fuerza bruta. |
| `src/cfr.mjs` | Motor CFR+ vectorial **agnóstico del juego** + explotabilidad por mejor respuesta. |
| `src/kuhn.mjs` | Kuhn poker: el patrón de calibración. |
| `src/river.mjs` | Árbol de apuestas del river + resolución + reportes legibles. |
| `bin/resolver-river.mjs` | CLI de demostración: solución legible por clase de mano. |
| `bin/medir.mjs` | Banco de medición reproducible (de acá salen las tablas de arriba). |

El motor **no sabe de naipes**: habla con un objeto `juego` que le contesta cuántas manos hay, qué masa
del rango rival no está bloqueada y qué masa gana/pierde en showdown. Por eso el **mismo código** que
resuelve el river se valida contra Kuhn.

---

## Línea roja

Esta herramienta es de **estudio fuera de mesa**. No hay, y no va a haber, asistencia en tiempo real
(RTA): nada de screen-scraping, nada de overlay que sugiera jugadas durante una mano en curso, nada que
lea el estado de una mesa en vivo. RTA viola el ToS de todos los sitios de póker online y termina en
baneo y confiscación de fondos. El detalle está en el §5.2 del dictamen.

---

## Estado

Prueba de concepto de **Fase 0** del ciclo DEMO → VENTA → INVERSIÓN: cero gasto, cero infraestructura,
cero datos reales. No toca el ERP ni su pipeline de build.

*— Elaborado por GSG*
