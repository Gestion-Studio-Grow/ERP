# Métrica real de costo y uso — Factory de sesiones Claude Code

> **Qué es esto:** medición *real* (no estimada a ojo) del gasto de la factory de agentes, parseada de los
> logs de sesión de Claude Code (`~/.claude/projects/<proj>/*.jsonl` + `*/subagents/*.jsonl`). Los logs
> **sí traen los conteos de tokens** por mensaje (`message.usage`), así que los tokens son dato medido; lo
> único estimado es la **conversión a dólares** con las tarifas vigentes (abajo). No es una factura: es la
> mejor reconstrucción posible del costo desde la telemetría local.
>
> **Ventana medida:** 2026-06-30 → 2026-07-06 (6 días, arranque de la factory). **89 sesiones** principales
> + **36 transcripts de subagentes**. Relevado el 2026-07-06.

---

## 0. Metodología y supuestos (leer antes de creerse los números)

- **Fuente:** cada línea `assistant` de los `.jsonl` trae `message.usage` con `input_tokens`,
  `cache_creation_input_tokens` (desglosado en `ephemeral_5m` / `ephemeral_1h`), `cache_read_input_tokens`
  y `output_tokens`. Se agregó por sesión, por célula (cwd/worktree) y por modelo.
- **Dedup:** las líneas se deduplican por `uuid` de mensaje (el streaming escribe el mismo mensaje varias
  veces). Sin esto, el gasto se contaría 2-3×.
- **Subagentes:** los transcripts de `*/subagents/*.jsonl` (Task/Workflow) se **suman** al total — son gasto
  real que no aparece en el hilo principal.
- **Tarifas usadas** (USD por millón de tokens):

  | Modelo | Input | Output | Cache write 5m | Cache write 1h | Cache read |
  |---|---:|---:|---:|---:|---:|
  | Opus 4.8 | 5.00 | 25.00 | 6.25 (1.25×) | 10.00 (2×) | 0.50 (0.1×) |
  | Sonnet 5 | 3.00 | 15.00 | 3.75 (1.25×) | 6.00 (2×) | 0.30 (0.1×) |
  | Haiku 4.5 | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 |
  | Fable 5 | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 |

- **Cache:** el *read* de cache cuesta 10% del input (los "~90% off" del enunciado); el *write* cuesta más
  que el input normal (1.25× a 5 min, 2× a 1 h). Esto importa muchísimo (§3).
- **Batch 50% off: NO aplicado.** Claude Code interactivo no usa la Batch API; el descuento batch no aplica
  a esta factory. Se menciona solo como referencia para trabajo offline futuro.
- **Caveats:** (1) es estimación de costo desde uso, no un invoice — la factura real puede diferir por tier,
  créditos o cambios de tarifa; (2) la ventana es de arranque (6 días), no un mes maduro; (3) el precio de
  Fable/Haiku es aproximado y su peso es <0.5% del total, así que no mueve la aguja.

---

## 1. Números clave (TL;DR)

| Métrica | Valor |
|---|---:|
| **Gasto total de la factory (6 días)** | **US$ 4.139** |
| Gasto principal (89 sesiones) | US$ 4.081 |
| Gasto de subagentes (36 transcripts) | US$ 46 |
| Prompts humanos (tareas pedidas) | 593 |
| **Costo medio por prompt humano (blended)** | **US$ 6,98** |
| Costo medio por sesión | US$ 46,5 |
| Pasos de asistente (llamadas al modelo) | ~22.600 |
| Tokens de salida generados | 22,6 M |
| Tokens leídos de cache | **5,10 mil millones** |
| Burn representativo de una célula activa | **~US$ 36 / hora** (rango 6–77) |

**Reparto por modelo:**

| Modelo | Costo | % del total | Pasos | Rol típico |
|---|---:|---:|---:|---|
| **Opus 4.8** | US$ 3.173 | **76,7%** | 16.197 | Alto juicio: PMO, arquitectura, seguridad, fiscal, Gate GSG |
| **Sonnet 5** | US$ 949 | **22,9%** | 5.477 | Ejecución: features, docs, tests, exploración, rubros |
| Haiku 4.5 | US$ 8 | 0,2% | 847 | Subagentes baratos |
| Fable 5 | US$ 9 | 0,2% | 60 | Experimental |

---

## 2. Costo por célula (worktree / cwd)

Cada frente de trabajo corre en su propio worktree. El gasto por célula:

| Célula (cwd) | Sesiones | Pasos | Prompts | Costo US$ | Opus US$ | Sonnet US$ | US$/prompt |
|---|---:|---:|---:|---:|---:|---:|---:|
| `estetica-erp` (main compartido)¹ | 50 | 15.540 | 362 | 3.388 | 2.540 | 848 | 9,36 |
| `Claude` (scratch/PMO móvil)² | 28 | 2.045 | 157 | 197 | 135 | 62 | 1,25 |
| `estetica-erp-reliability` | 1 | 684 | 15 | 150 | 150 | 0 | 10,01 |
| `estetica-erp-plataforma` | 1 | 558 | 15 | 110 | 110 | 0 | 7,33 |
| `estetica-erp-producto` | 3 | 704 | 8 | 89 | 89 | 0 | 11,14 |
| `estetica-erp-diseno` | 2 | 460 | 5 | 59 | 59 | 0 | 11,78 |
| `dos-manos-padel` | 1 | 584 | 24 | 37 | 0 | **37** | **1,55** |
| `estetica-erp-fiscal` | 1 | 210 | 3 | 35 | 35 | 0 | 11,58 |
| `estetica-erp-uxui` | 1 | 104 | 3 | 10 | 10 | 0 | 3,27 |
| `estetica-erp-pagos-fase3` | 1 | 96 | 1 | 7 | 7 | 0 | 6,59 |

¹ El worktree `estetica-erp` es el tronco compartido donde corrió la mayoría de las sesiones (PMO, arca,
magra, core pagos/inventario, consolidaciones). Por eso concentra el 82% del gasto: no es "una" célula sino
el punto de encuentro de casi todas.
² La carpeta `Claude` son sesiones de scratch / arranque móvil, mayormente Sonnet → US$/prompt bajísimo.

**Lectura:** las células que corrieron **puro Opus** (reliability, producto, diseño, fiscal) gastan
**US$ 7–12 por prompt**. La única que corrió **puro Sonnet** (`dos-manos-padel`) gastó **US$ 1,55 por
prompt**. En la práctica, una tarea en Opus salió **~6–7× más cara** que la misma clase de tarea en Sonnet.

---

## 3. El hallazgo que cambia la estrategia: **el costo es CONTEXTO, no generación**

Descomponiendo cada dólar por tipo de token:

| Componente | Costo US$ | % del total | Qué es |
|---|---:|---:|---|
| **Cache read** | 2.154 | **52,0%** | Releer el contexto ya cacheado en cada turno |
| **Cache write** | 1.430 | **34,5%** | Escribir contexto nuevo a cache (1h = 2× de precio) |
| **Output** | 532 | **12,9%** | Lo que el modelo *genera* (código, texto, tool calls) |
| Fresh input | 23 | 0,5% | Input no cacheado |

> **Solo el 13% del gasto es generación. El 86% es acarreo de contexto** (leer + escribir cache). El 96–97%
> de los tokens de input son *cache reads*: el caching funciona (por eso el fresh input es 0,5%), pero lo que
> pagamos es **arrastrar contextos enormes turno a turno** en sesiones largas.

**Tres consecuencias directas:**

1. **El driver #1 de costo NO es el modelo — es el tamaño y la vida del contexto.** Sesiones kilométricas
   con megatokens de historial cuestan por releerse a sí mismas, no por lo que producen. La sesión más cara
   (US$ 910) corrió 51 h y 3.165 pasos: pagó sobre todo *cache read* de su propio historial.
2. **El cache de 1 hora pesa doble.** 166 M de tokens se escribieron con TTL de 1 h (2× de precio) → ~US$
   1.030 solo en *cache write* de larga duración. Si mucho de eso no necesita persistir 1 h, bajar a 5 min
   (1,25×) recorta ese renglón ~40%.
3. **El ahorro grande no viene de cambiar de modelo, viene de higiene de sesión:** `/compact` disciplinado,
   células de contexto acotado, cerrar sesiones viejas en vez de estirarlas, y no arrastrar árboles de
   archivos completos cuando alcanza un resumen.

---

## 4. Costo por tarea típica: Opus vs Sonnet

Hay que mirarlo con **dos lentes**, porque dan respuestas distintas y ambas son ciertas:

### Lente A — normalizado por paso (mismo contexto)
| Modelo | US$/paso | Output tok/paso |
|---|---:|---:|
| Opus 4.8 | 0,2029 | 1.256 |
| Sonnet 5 | 0,1750 | 489 |

Opus cuesta solo **1,16×** por paso. ¿Por qué tan poco, si el sticker es 5×/3× = 1,67×? Porque el costo lo
domina el *cache read* (§3), que se cobra sobre el **mismo tamaño de contexto** para los dos modelos; la
diferencia de precio solo muerde en el output y el input fresco, que son minoría. **A igual contexto, cambiar
Opus→Sonnet ahorra menos de lo que sugiere el precio de lista.**

### Lente B — por tarea real (lo que pasa en la cancha)
| | Opus (células puras) | Sonnet (célula pura) |
|---|---:|---:|
| US$ por prompt | **9–12** | **~1,5** |
| Factor | **~6–7×** | 1× |

En uso real Opus sale ~6× más caro por tarea — pero **no** por el precio del token: porque las sesiones Opus
tienden a correr **más largas, más densas y con más contexto**. El multiplicador real es *comportamiento de
sesión*, no *tarifa*.

> **Conclusión operativa:** el modelo importa, pero el gran ahorro está en **qué trabajo mandás a Sonnet**
> (volumen de ejecución) y en **cuánto contexto arrastra cada célula**. Pagar Opus por trabajo de volumen es
> caro dos veces: por la tarifa *y* porque esas sesiones tienden a inflar contexto.

---

## 5. "Factory a full" — burn con todas las células a la vez

No hubo un instante con *todas* las células corriendo, así que se modela con el burn medido por célula.

- **Burn activo representativo:** ~US$ 36/hora por célula intensa (rango medido 6–77 US$/h; pico 77 US$/h en
  una sesión Opus densa de arquitectura).
- **Sonnet corre más barato por hora** (menos output, contexto más liviano): estimado US$ 10–15/h.
- **Opus de alto juicio:** US$ 20–38/h sostenido cuando trabaja denso.

**Escenario "factory reforzada a full"** (ver `docs/organizacion/factory-reforzada.md`):

| Capa | Instancias | US$/h c/u | Subtotal US$/h |
|---|---:|---:|---:|
| Opus — PMO/arquitecto jefe | 1 | 25 | 25 |
| Opus — Auditor GSG (Gate, ráfagas) | 1 | 15 (amortizado) | 15 |
| Opus — Seguridad / Fiscal (según sprint) | 0–1 | 25 | 0–25 |
| Sonnet — células de ejecución (producto, diseño, docs, tests) | 6 | 12 | 72 |
| **Total factory a full** | | | **~US$ 110–135 / hora** |

- Una **jornada de 8 h a full** ≈ **US$ 880–1.080/día**.
- Referencia real: los 6 días medidos dieron **~US$ 690/día promedio**, pero *sin* que todas las células
  corrieran cada día → el "a full" de arriba es el techo cuando el paralelismo está saturado.

---

## 6. Ahorro del modo ECONOMÍA vs BOOST (todo Opus)

- **ECONOMÍA (mix real medido):** US$ 4.139.
- **BOOST (mismo volumen de tokens, todo repreciado a tarifa Opus):** ≈ US$ 4.770.
- **Ahorro de economía a igual volumen:** ≈ **US$ 630 (~13%)**.

**Por qué "solo" 13% y no más:**
1. El 77% del gasto **ya es Opus** (el trabajo de juicio que no se degrada). El swap solo aplica al 23% que
   hoy es Sonnet.
2. El costo lo domina el *contexto* (§3), que se cobra casi igual para ambos modelos → el swap muerde poco.

**Por qué el 13% es un PISO, no un techo:**
- Es a *igual volumen de tokens*. En boost real, el trabajo que Sonnet hace hoy (exploración, docs, tests,
  lecturas grandes) lo haría Opus generando **más output** y arrastrando contexto a **mayor precio** → el
  costo boost real es más alto que el repricing lineal.
- El verdadero levier no es "swap a igual trabajo", es **mover más volumen de ejecución a Sonnet**. Hoy Opus
  es 77% del gasto, pero **buena parte de ese Opus es ejecución delegable**, no juicio (ver §7).

---

## 7. Dónde está el dinero delegable (oportunidad de ahorro)

Opus concentra US$ 3.173. Parte es juicio genuino (PMO, arquitectura, seguridad, fiscal, Gate GSG) — eso
**no se toca**. Pero varios renglones son **ejecución que corrió en Opus** y en economía deberían ser Sonnet
con Opus solo en el gate:

| Renglón Opus | Costo | ¿Juicio o ejecución? | Acción en factory reforzada |
|---|---:|---|---|
| Célula `producto` | US$ 89 | Ejecución de rubro | → Sonnet; Opus solo audita |
| Célula `diseño` | US$ 59 | Ejecución visual | → Sonnet; Opus solo audita |
| Célula `reliability` | US$ 150 | Mixto (QA/SRE) | Sonnet ejecuta, Opus decide arquitectura + gate |
| **Subagentes en Opus** | **US$ 37** | Grunt work delegado | → Sonnet/Haiku por default (hoy corren Opus) |
| Blob `estetica-erp` (parte) | de 2.540 | Mixto | Separar juicio de ejecución por célula |

> **Nota concreta:** los subagentes hoy heredan Opus por default (US$ 37 Opus vs US$ 0,83 Sonnet vs US$ 8
> Haiku). El grunt work delegado **no debería** pagar tarifa Opus. Fijar Sonnet/Haiku como modelo de
> subagente es ahorro inmediato sin costo de calidad.

**Si la mitad del Opus "de ejecución" migrara a Sonnet**, el ahorro estimado ronda **US$ 250–400 sobre esta
ventana de 6 días** (extrapolable a ~US$ 1.200–2.000/mes a este ritmo), *sin* tocar la calidad del núcleo de
juicio ni del Gate GSG.

---

## 8. Reproducir esta medición

El parser vive en el scratchpad de la sesión (no versionado). Para re-correrlo sobre logs frescos:
1. Iterar `~/.claude/projects/<proyecto>/*.jsonl` + `*/subagents/*.jsonl`.
2. Deduplicar por `uuid`; quedarse con líneas `message.role == "assistant"` que traigan `usage`.
3. Costear con la tabla de §0 (respetar el split 5m/1h del `cache_creation`).
4. Agrupar por `cwd` (célula), `message.model` (modelo) y `sessionId`.

Sugerido: versionar el script como `scripts/finops/parse-claude-usage.mjs` y correrlo semanal para tener la
serie de costo (ver gap "observabilidad/telemetría de costo" en la factory reforzada).

---

*Documento de análisis. No toca producción ni deploy. Números medidos al 2026-07-06 sobre 6 días de logs.*
