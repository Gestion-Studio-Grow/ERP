# Bitácora — Mesa de Dinero + inversión de la norma de modelos

**Fecha:** 2026-09-09 · **Rama:** `claude/money-desk-orchestrator-agent-s7clku` · **Sector:** Gobernanza + nueva célula
**Commits:** `88c1805` → `4b1ae4e` (6) · **Diff:** 125 archivos, +4.783 / −329

---

## 1. Qué se pidió

Dos cosas, en este orden:

1. **Un orquestador + agentes de una "mesa de dinero"** para obtener rentabilidad por inversiones o
   arbitrajes; un **análisis real**; una **consola de pruebas** conectable a un exchange real con datos
   reales; **salir del sesgo de los modelos típicos**; y **validar que las estrategias sean factibles**.
2. Sobre la marcha, dos correcciones del dueño: **la consola y los análisis complejos se generan en
   Fable**, y después **se quita el default de Sonnet — el default es Opus**.

## 2. Qué se entregó

### a. La célula (6 agentes nuevos en `.claude/agents/`)

| Agente | Modelo | Rol |
|---|---|---|
| `mesa-dinero-orquestador` | Opus | Jefe de mesa; único que reporta y eleva capital |
| `mesa-costos` | Opus | El piso de fricción — *donde se pierde la plata* |
| `mesa-riesgo` | Opus | Límites, kill switch, ruina, contraparte. Tiene **veto** |
| `mesa-falsacion` | Opus SIEMPRE | Intenta **matar** cada estrategia. Ninguna se eleva sin su dictamen |
| `mesa-cuant` | Opus | Formula la estrategia y su **tesis de edge** |
| `mesa-datos` | Fable | Conectores de solo lectura, normalización, registro |

Prestados del pool (ADR-053, **no duplicados**): `cobro-fiscal`, `seguridad`, `challenger`,
`auditoria-gsg-gate`, `finops-costo-uso`.

### b. La consola — `productos/mesa-de-dinero/`

2.581 líneas, **Node 22 ESM puro, cero dependencias npm**, carpeta aislada, **solo lectura** (no existe
`apiKey`, `HMAC`, firma ni `placeOrder` en todo el código). **40/40 tests en verde, 100% offline.**

**No es un bot de arbitraje: es una consola de FALSACIÓN.** Su métrica titular no es "ganancia
encontrada" sino **tasa de supervivencia**, **tasa de fantasma** y **spread ejecutable vs nocional**.

### c. Los documentos

`docs/ANALISIS-FACTIBILIDAD.md` (467 líneas) · `docs/MODELO-DE-COSTOS.md` (240) ·
`docs/RED-TEAM.md` (182) · charter `docs/organizacion/mesa-de-dinero.md` · **ADR-090** y **ADR-091**.

## 3. El hallazgo — 3 de 4 estrategias mueren

| Estrategia | Break-even | Realidad medida | Veredicto |
|---|---|---|---|
| CEX-CEX spot | ≥ 0,29 % por vuelta | spreads 0,01–0,05 %, viven 200–800 ms; latencia desde AR ≈ 275 ms | 🔴 |
| Triangular | ≥ 0,35 % | 4.879 oportunidades/semana, la mayoría 0–0,025 % **bruto** (menos que una fee) | 🔴 |
| Cash & carry | tenencia ≥ 10 días | 4,5 % neto contra un hurdle pasivo de 8 % | 🔴 (🟡 solo ≥ USD 50.000) |
| Dólar cripto ARS | ≥ 0,15 % de premium | premium +2,6 a +3,2 % → **+2,1 a +2,6 % neto por ciclo** de 2–4 días | 🟡 **condicional** |

**Corrida de la consola (fixtures):** 324 combinaciones · 140 con bruto > 0 · 44 netas positivas (31,4 %).
**Spot cruzado: 0 sobreviven. Triangular: 0 sobreviven.** Tasa de fantasma: **s/d** — ninguna efímera
quedó viva para re-chequear, que *es* el hallazgo.

> **Una contradicción que se marcó en vez de taparse:** el brief decía premium ARS ≈ 0 %; el análisis midió
> 3,2 % un martes. **No pueden ser ciertas las dos.** Quedó como el primer ítem a resolver con 30 días de
> medición, no promediado para que cerrara.

## 4. El cambio de gobernanza (ADR-091)

**El default pasa de Sonnet a Opus.** Sonnet sale de la factory; **Fable** es la única alternativa y se
declara explícito, sólo para generación de volumen ya decidida. La pregunta que reparte el trabajo:
***¿esto es decidir, o producir lo que ya se decidió?***

**Se cerró de paso una fuga que hacía la norma ficticia:** los 31 agentes declaraban su capa en la **prosa
del encabezado** pero **ninguno traía `model:` en el frontmatter**, así que al despachar **heredaban el
modelo del padre**. Era la causa exacta de **MP-4** y **MP-9**. Hoy **31/31 lo declaran** y `npm run brain`
lo audita.

**Lo que NO se derogó, a propósito:** el Gate en Opus (ADR-040) · `docs/metricas/costo-uso-factory.md`
(es evidencia, no norma) · las reglas de concurrencia de ADR-032 · los ADR 045/047/048 (se **supersedieron**
con nota, no se reescribieron).

**Costo aceptado a sabiendas:** la factory queda **más cara por token**. Si el gasto aprieta, la palanca no
es volver a Sonnet — es **acarrear menos contexto** (el 86 % del gasto), no bajar de modelo (el 13 %).

## 5. Lo que quedó SIN verificar (no taparlo es parte del entregable)

1. **Los números son de fixtures, no de mercado.** El egress de la sesión bloquea las APIs de exchanges.
   La medición real corre en la máquina del dueño.
2. **El rulo ARS se cae si el premium real es ≈ 0 %.** Su propio red-team le da **70 % de probabilidad de
   terminar en 🔴** al medirlo. Hay 4 `SIN VERIFICAR` bloqueantes.
3. **`tsc`/`build` del ERP no se pudieron correr** (`node_modules` vacío en el contenedor). No se tocó
   TypeScript del ERP, pero no se puede dar por verde.
4. **`ADR-089` tiene una referencia rota preexistente** (`ADR-081`) que el linkcheck marca. Es ajena.

## 6. Único archivo tocado fuera de la carpeta aislada

`tsconfig.json` — se agregó `"productos"` al `exclude`, replicando cómo ya estaba excluido
`celula-negocios-digitales`. Sin eso, el `tsc` del ERP intentaría compilar la consola.

## 7. Próximo paso

`npm run watch` en la máquina del dueño, **30 días**, midiendo el premium ARS. Si el promedio real está
cerca de 0 %, la mesa cierra con **4 de 4 en rojo** — y eso vale exactamente la plata que no se perdió.

---

— Elaborado por GSG
