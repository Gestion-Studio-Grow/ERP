# BTC en velas de 15 minutos — ¿se puede sacar rentabilidad? (análisis cuantitativo)

**Fecha:** 2026-09-02 · **Sector:** Agencia Grow (negocio propio, candidato `crypto-bot`) · **Célula:** `quant-trading`
(charter en `.claude/agents/quant-trading.md`) · **Modelo:** Sonnet (ejecución) · **Estado:** análisis, doc-only, cero plata.
**Complemento:** investigación de mercado y costos por exchange en
[`2026-09-02-btc-15m-investigacion-mercado.md`](./2026-09-02-btc-15m-investigacion-mercado.md).

---

## 1. Veredicto en tres líneas

**Con las herramientas que tiene a mano una pyme argentina (Lemon, Belo, P2P), operar BTC en 15 minutos NO da: el
costo ida+vuelta (2–4%) es 10 a 20 veces el movimiento típico de una vela.** En Binance spot/futuros el costo baja a
0,14–0,24% ida+vuelta, pero eso sigue siendo **~1 desvío estándar de la vela**: cada operación tiene que "acertar" un
movimiento completo solo para empatar, y las estrategias clásicas (EMA, RSI, Bollinger, breakout) **no muestran ese edge**
ni en la evidencia pública ni en nuestra simulación. **No se construye un bot de 15 min con plata real.** Lo que sí
vale: dejar el backtester reproducible listo (ya está en `scripts/btc-15m-backtest.mjs`), correrlo con datos reales en
desktop, y mirar alternativas menos direccionales (§7).

## 2. Calibración del analista (ADR-052)

- **Costos primero, indicadores después.** Ninguna señal importa si la comisión es más grande que el movimiento que
  intenta capturar. Zona de de-sesgo: **estándar y precisa** en todo el análisis; **humana y directa** en el veredicto.
- **Hipótesis nula obligatoria.** Una estrategia se compara contra buy & hold y contra el azar con los mismos costos.
  Si no le gana a las dos con margen, es ruido.
- **Reproducible o no cuenta.** Script versionado, cero dependencias, datos públicos, sin look-ahead, out-of-sample.
- **Disciplina de capital (ADR-030) y §C:** analizar es reversible; operar plata real, conectar claves API o pagar
  infraestructura es del dueño. Este doc no mueve un peso.
- **MP-8 / SEC-1:** lógica con test de humo antes de confiar en un número; jamás claves ni seeds en el chat.

## 3. Restricción del entorno (transparencia)

En esta sesión remota el proxy **bloquea todas las APIs de mercado** (Binance, Bybit, Kraken, Coinbase, OKX) y `curl`
saliente. Por eso **el backtest con datos reales NO se corrió acá**. Lo que sí se hizo:

1. **Modelo analítico de break-even** con la volatilidad publicada de BTC en 2026 (§4).
2. **Simulación sintética sin edge** (GBM, σ calibrada) que mide **cuánto se comen los costos** con cada estrategia y cada
   exchange (§5). Es una cota inferior del daño, no una predicción del mercado.
3. **El script listo** para correr en desktop con datos reales en un comando (§8). Correrlo es el próximo paso.

## 4. El número que decide todo: costo ida+vuelta vs. σ de la vela

Volatilidad realizada de BTC publicada (ver doc de mercado): **30 d ≈ 32,3 %**, **90 d ≈ 34,6 %**, **365 d ≈ 43,4 %**
anualizada (jul-2026); 2025 fue el año menos volátil registrado. Convertida a una vela de 15 min
(σ_vela = σ_anual / √(365 × 96) = σ_anual / 187,2):

| Ventana | σ anual | **σ por vela 15 min** |
|---|---:|---:|
| 30 días | 32,3 % | **0,173 %** |
| 90 días | 34,6 % | **0,185 %** |
| 365 días | 43,4 % | **0,232 %** |

Costo **ida + vuelta** (comisión × 2 + slippage × 2) por riel accesible desde Argentina y cuántos σ de vela representa:

| Riel | Comisión por lado | Slippage por lado | **Ida+vuelta** | **σ de vela (σ=0,185 %)** | Lectura |
|---|---:|---:|---:|---:|---|
| Binance futuros USDT-M taker | 0,05 % | 0,02 % | **0,14 %** | **0,76 σ** | + funding (cobra/paga cada 8 h) |
| Binance spot taker c/ BNB | 0,075 % | 0,02 % | **0,19 %** | **1,03 σ** | mejor caso spot |
| Binance spot taker | 0,10 % | 0,02 % | **0,24 %** | **1,30 σ** | caso base |
| Binance P2P (spread implícito) | ~1 % | 0,05 % | **~2,1 %** | **~11 σ** | entrar/salir a pesos |
| Lemon app (spread) | 1–2 % | — | **2–4 %** | **11–22 σ** | lo que ve el usuario argentino |

**Qué significa:** en la vela típica de 15 min el precio se mueve ~0,18 %. Un trade en Binance spot **arranca perdiendo
0,24 %**: hay que acertar la dirección Y capturar más de una vela entera de movimiento, en cada operación, de forma
sostenida. En Lemon hay que capturar el movimiento de **más de 100 velas** (un día entero de tendencia perfecta) por cada
entrada/salida. Ahí no hay estrategia que aguante: **el riel argentino descarta el scalping por construcción.**

**Arrastre anual de costos (sin contar si se acierta o no):** trades por año × ida+vuelta.

| Frecuencia típica | Trades/año | Binance spot (0,24 %) | Binance fut. (0,14 %) | Lemon (3 %) |
|---|---:|---:|---:|---:|
| EMA 9/21 en 15 m | ~840 | **−200 % del capital** | −118 % | −2.500 % |
| EMA 21/55 | ~330 | −79 % | −46 % | −990 % |
| Reversión RSI/Bollinger | 220–660 | −53 % a −158 % | −31 % a −92 % | −660 % a −1.980 % |
| Tendencia lenta (50/200, Donchian 1 d) | ~105 | −25 % | −15 % | −315 % |

Para **ganar +20 % neto anual** con ~300 trades en Binance spot, la estrategia tiene que generar **~+92 % bruto** (20 %
+ 72 % de costos): un promedio de **+0,31 % por trade, es decir ~1,7 σ de vela capturados netos en cada operación,
todo el año**. Ese nivel de precisión lo tienen los market makers (cobran el spread, no lo pagan) y el HFT con
colocación; no lo tiene un retail que paga taker desde Argentina.

## 5. Simulación sintética: cuánto se come el costo (cota inferior)

Serie GBM **sin edge** (ruido puro, σ = 0,20 %/vela, 365 días = 35.040 velas, semilla 42), 7 estrategias, 3 rieles.
Como la serie no tiene tendencia explotable, el resultado mide **solo el daño de los costos + el ruido** — que es
exactamente el piso contra el que compite cualquier estrategia real. Comando: `node scripts/btc-15m-backtest.mjs
--synthetic 365 --exchange <riel> --mc 300`.

| Estrategia | Trades/año | Binance spot (neto) | Binance futuros c/ cortos | Lemon 1,5 %/lado |
|---|---:|---:|---:|---:|
| EMA 9/21 | 842 | **−90,9 %** | −94,0 % | −100 % |
| EMA 21/55 | 332 | −65,9 % | −69,4 % | −100 % |
| EMA 50/200 | 106 | −27,8 % | −11,1 % | −96,2 % |
| RSI 14 (30/70) | 224 | −46,9 % | −42,7 % | −99,9 % |
| Bollinger 20/2σ | 661 | −79,8 % | −77,2 % | −100 % |
| Donchian 20 | 419 | −75,6 % | −81,5 % | −100 % |
| Donchian 96 (1 día) | 104 | −43,6 % | −46,0 % | −96,9 % |
| Buy & hold (misma serie) | 1 | −31,6 % | −31,6 % | −33,5 % |
| **Monte Carlo azar, 842 trades (p5 / mediana / p95)** | 842 | **−93 % / −90 % / −87 %** | — | — |

Lecturas:
- En **Lemon**, toda estrategia activa **quema el 100 % del capital en menos de un año**, aunque el mercado no haga
  nada. No es falta de indicador: es el spread.
- En Binance spot, la EMA 9/21 termina **exactamente donde termina el azar** (−91 % vs mediana aleatoria −90 %): la
  banda aleatoria es el "cero" real contra el que hay que medir cualquier backtest. Un resultado que no supere el p95
  aleatorio **y** a buy & hold out-of-sample es ruido.
- Las únicas que pierden "poco" son las **lentas** (50/200, Donchian de 1 día), porque operan 8 veces menos. La conclusión
  es incómoda pero clara: **en 15 min, cuanto menos operás, menos perdés.** Esa pendiente lleva a swing/posición, no a
  scalping.

> ⚠️ Sesgo declarado: la serie sintética no tiene autocorrelación ni tendencias, así que subestima lo que una estrategia
> de tendencia puede capturar en un mercado real con rachas. Por eso el paso siguiente obligatorio es **correr el mismo
> script con datos reales** (§8) y comparar contra esta banda. Si el neto OOS real no supera el p95 aleatorio, se cierra.

## 6. Lo que dice la evidencia pública (resumen; detalle y fuentes en el doc de mercado)

- Backtests públicos **con costos** en 15 m BTC: EMA 21/55 trend following **−6,5 %**; scalping 6 meses / 92 trades con
  win rate alto y drawdowns que se lo comen. Con fee 0,1 % por lado, un scalp de 0,3 % objetivo **entrega el 67 % al
  exchange**.
- Los resultados "increíbles" de TradingView/YouTube suelen tener **comisión 0, sin slippage, look-ahead en el repaint o
  parámetros ajustados al período** (overfitting). Son curvas, no estrategias.
- Quien gana en 15 min es quien **cobra** el spread (market maker, rebate maker negativo, colocación). El retail taker
  está estructuralmente del otro lado de la mesa.

## 7. Dónde sí puede haber rentabilidad (con mucho menos direccionalidad)

Ninguna es "gratis"; todas exigen su propio análisis y ninguna se opera sin OK del dueño (§C):

1. **Cash-and-carry / funding rate:** largo spot + corto perpetuo, cobrar el funding. Neutral a la dirección; rinde
   cuando el funding es positivo y sostenido; riesgo de contraparte del exchange y de funding negativo. Es lo que en la
   industria se llama "la rentabilidad aburrida", y es la única de esta lista con lógica estructural.
2. **Timeframes largos con pocas operaciones** (diario/semanal, Donchian 20 d, cruce 50/200 d): el costo se diluye a
   ~1 % anual y la tendencia larga de BTC existe. Riesgo: drawdowns de 50–70 %. No es "trading de 15 min", es inversión
   con reglas.
3. **DCA + reglas de rebalanceo**: cero edge pretendido, cero costo de oportunidad de tiempo. Para la caja propia del
   grupo es lo más defendible.
4. **Rendimientos sobre stablecoins** (Lemon/Belo pagan tasa sobre USDT): rentabilidad chica, riesgo de contraparte real,
   pero sin pagar spread cada 15 minutos. Se cruza con el análisis de Lemon USD→USDt.

## 8. Cómo correr el backtest real (desktop, 1 comando, sin claves)

```bash
# 365 días de BTCUSDT 15m desde Binance, costos Binance spot, 300 corridas aleatorias
node scripts/btc-15m-backtest.mjs --source binance --days 365 --exchange binance --mc 300

# Mismo con Bybit y costos de Lemon; o con cortos en futuros
node scripts/btc-15m-backtest.mjs --source bybit --days 365 --exchange lemon
node scripts/btc-15m-backtest.mjs --source binance --days 365 --exchange binanceFut --short

# Desde un CSV propio (time,open,high,low,close) y guardando JSON
node scripts/btc-15m-backtest.mjs --csv btc15m.csv --exchange binanceBnb --json salida.json
```

Criterio de decisión (se fija ANTES de ver los números, para no ajustar la vara al resultado):

| Condición para seguir a paper trading | Umbral |
|---|---|
| Neto out-of-sample (30 % final) | > p95 de la banda aleatoria **y** > buy & hold OOS |
| Trades out-of-sample | > 100 |
| Profit factor neto | > 1,3 |
| Expectancy neta por trade | > 0,5 σ de vela (~0,09 %) |
| Sensibilidad de parámetros | resultado positivo en ±30 % de cada parámetro |
| Drawdown máximo | < 25 % |

Si **una sola** falla, se cierra el frente de 15 min y se documenta. Si pasan todas: **paper trading 30 días** (sin
plata), y recién ahí el dueño decide.

## 9. Riesgos específicos para Argentina

- **Fiscal:** el resultado por compraventa de cripto está alcanzado por Ganancias (alícuota cedular 5 %/15 % según el
  caso) y los saldos por Bienes Personales; los PSAV informan a ARCA (RG 5804/2025). Cientos de trades = cientos de
  hechos imponibles a documentar; el costo administrativo también es costo.
- **Custodia y contraparte:** operar en exchange internacional implica fondos fuera del sistema local; en local,
  depender de un PSAV. Ninguno de los dos es "el banco".
- **Operativo:** un bot en 15 min necesita infraestructura 24/7 (VPS, monitoreo). Es gasto real antes de cualquier
  ingreso: choca con **DEMO → VENTA → INVERSIÓN**.

## 10. Próximo paso recomendado

1. **Correr §8 en desktop** con datos reales de 365 días (15 minutos de trabajo). Resultado esperado según toda la
   evidencia: ninguna estrategia pasa la vara. Si alguna pasa, se abre paper trading; si no, se cierra y queda la lección.
2. **No construir bot ni app de trading de 15 min.** Si el grupo quiere exposición a BTC, la conversación correcta es §7
   (posición larga con reglas / carry), y es una decisión del dueño con plata propia, no un producto.
3. La **app** que sí tiene sentido a costo cero es la calculadora/comparador de rieles de dólares (ver la propuesta de
   Mesa Cripto), no un bot.

## Fuentes

- Volatilidad realizada BTC 2026 (30/90/365 d) — btcoak.com/volatility · spark.money bitcoin-volatility-tracker ·
  Fidelity Digital Assets, "A Closer Look at Bitcoin's Volatility" (2026).
- Backtests 15 m con costos — CoinQuant: "BTC Trend Following Strategy 15 Minute Backtest Results" y "Crypto Scalping
  Strategy Backtested: 6 Months of 15-Minute Data on BTC" (2025–2026).
- Comisiones — Binance spot/futuros (tabla oficial de fees) · Lemon Centro de Ayuda "¿Cuánto cobra Lemon por comprar,
  vender o transferir crypto?" · guías de exchanges AR 2026 (fluyez.com, guiadetrader.com).
- Fiscal — ARCA RG 5804/2025; guías 2026 de impuestos cripto (criptoinforme.com, rankia.com.ar).
- Detalle y URLs completas: doc de investigación de mercado hermano.

— Elaborado por Gestión Studio Grow (GSG) · quant-trading · Sonnet · script: `scripts/btc-15m-backtest.mjs`
