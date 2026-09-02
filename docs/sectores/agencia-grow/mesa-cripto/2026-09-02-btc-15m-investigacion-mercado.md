# BTC en velas de 15 minutos — ¿da rentabilidad hoy? (investigación de mercado y costos)

**Fecha:** 2026-09-02 · **Agente:** quant-trading (Agencia Grow) · **Tipo:** research con fuentes públicas
(sin backtest propio — eso lo corre otra célula con el motor de simulación/Monte Carlo).

---

## 1. Veredicto preliminar en 3 líneas

**No, no da — con retail estándar, en un exchange caro, y sin ventaja de ejecución, perder plata es el caso base.**
El costo de ida+vuelta (0,10%–0,20% en el mejor exchange internacional, hasta 1–4% en apps argentinas)
se come entre el 50% y el 100%+ de la volatilidad típica de una sola vela de 15 min (σ ≈ 0,17%–0,23%), así
que cualquier estrategia mecánica de las que hay publicadas (EMA cross, RSI, grid, breakout) arranca con
un handicap de 1σ o más antes de generar una sola señal. **Los backtests públicos con costos reales lo
confirman: pierden o empatan; sin costos "parecen" ganar.** La única vía con evidencia de sostenerse es
funding-rate arbitrage (delta-neutral, no direccional) con retornos netos de un dígito medio a bajo anual
— no es "trading de 15 minutos", es otra estrategia.

---

## 2. Calibración del analista (ADR-052)

Leí `CLAUDE.md` (§DEMO→VENTA→INVERSIÓN y §C — nunca opero plata real ni pido claves), `docs/sectores/
agencia-grow.md` (Agencia Grow = negocio propio del grupo, no satélite del ERP; método = mismo del repo,
research con fuentes, nada toca prod/Neon), `docs/adr/INDEX.md` (ADR-030 ciclo demo→venta→inversión,
ADR-045 Advisory+Challenger, ADR-046 de-sesgo por zona, ADR-048 Arquitecto de Solución) y
`docs/lecciones-aprendidas/registro.md` (MP-8: sin tests la lógica regresiona — acá aplica como "sin
fuente, la afirmación regresiona a wishful thinking"; SEC-1: secretos nunca en el chat, ningún agente
los pide ni los toca).

Principios que guiaron este research:

- **Costos primero, indicador después.** Ninguna señal técnica importa si el break-even por operación ya
  perdió contra el spread+comisión+funding del exchange concreto que se vaya a usar.
- **Hipótesis nula explícita.** Todo resultado que "gana" se compara contra buy & hold y contra ruido
  aleatorio con los mismos costos; si no le gana a los dos con margen, no hay edge, hay curva ajustada.
- **Backtest sin costos = folclore.** Un resultado que no declara comisión, spread y slippage no es
  evidencia de nada; se lo marca como tal y se lo descarta como prueba de rentabilidad.
- **Zona de de-sesgo (ADR-046):** este documento es análisis cuantitativo → **zona ESTÁNDAR**, precisión
  ante todo, cero promesas. El veredicto al dueño se dice en criollo y directo, sin endulzar: "si no da,
  no da y por esto".
- **Nunca plata real, nunca claves (SEC-1, §C).** Esto es research de mercado; cualquier paso hacia
  ejecutar con fondos reales se eleva al dueño, no se decide acá.

---

## 3. Costos reales por exchange accesible desde Argentina

Todos los % son **ida + vuelta** (abrir y cerrar la posición), en el escenario más común para un retail
chico (sin VIP por volumen). "PSAV" = inscripto como Proveedor de Servicios de Activos Virtuales ante la
CNV (régimen argentino vigente desde 2024).

| Exchange / app | Costo ida+vuelta (retail, taker) | Costo ida+vuelta (maker, si aplica) | Observaciones |
|---|---|---|---|
| **Binance spot** | 0,20% (0,10%+0,10%) | 0,20% (maker = taker en tier base) | Con BNB (25% off): **0,15%** taker. VIP por volumen baja mucho más, pero no aplica a un retail chico. USDC como quote puede bajar el taker a 0,095%. No es PSAV en Argentina (exchange offshore). |
| **Binance futuros USDT-M** | 0,10% (0,05%+0,05%) | **0,04%** (0,02%+0,02%) | Con BNB (10% off en futuros): taker ≈0,09%, maker ≈0,036%. **Funding** aparte (no se descuenta con BNB/VIP): típico ~0,01%/8h ≈11% anualizado en condiciones normales, puede spikear mucho en mercados direccionales/crowded. Apalancamiento = riesgo de liquidación, no cubierto acá. |
| **Bybit spot** | 0,20% (0,10%+0,10%) | 0,20% | Sin descuento equivalente a BNB salvo token propio/VIP. |
| **Bybit perp (USDT)** | 0,11% (0,055%+0,055%) | 0,04% (0,02%+0,02%) | — |
| **OKX spot** | 0,20% (0,10%+0,10%) | 0,16% (0,08%+0,08%) | Maker algo mejor que Bybit en spot. |
| **OKX perp (USDT)** | 0,10% (0,05%+0,05%) | 0,04% (0,02%+0,02%) | — |
| **Lemon (app AR)** | ⚠️ **a verificar — fuentes en conflicto: 1,0%–2,0%** | — | La página de ayuda de Lemon declara comisión "0,5% compra / 0,5% venta" = 1,0% ida+vuelta **como comisión nominal**, pero el precio que muestra la app ya trae un spread sobre el precio de referencia (fuentes externas ubican el spread real de apps argentinas en 0,5%–1,5% adicional) — la brecha entre "comisión declarada" y "costo real todo incluido" es justamente el punto ciego típico del retail. Sin PITR de precios propio para auditar, se deja el rango **1–2%** del brief como el más conservador y verificable. Cashback de BTC (0,5%–2%) compensa parcialmente pero no es determinístico para trading activo. PSAV inscripto en CNV. KYC obligatorio, sin retiro instantáneo a exchange internacional en todos los casos. |
| **Belo (app AR)** | ⚠️ 0,5%–0,8% (spread) | — | PSAV. Spread más ajustado que Lemon/Ripio según comparativas 2026. |
| **Buenbit (app AR)** | ⚠️ 0,5%–0,8% (spread) | — | PSAV. Similar a Belo. |
| **Ripio (app AR)** | ⚠️ 1,0%–2,0% (spread, según activo/volumen) | — | PSAV. Cobra vía spread, no comisión explícita — mismo punto ciego que Lemon. |
| **Binance P2P** | ⚠️ 2%–5% estimado (spread implícito entre anunciantes) | — | Binance no cobra comisión P2P, pero el spread entre punta compradora y vendedora de los anunciantes ronda 1%–2,5% **por lado** en condiciones normales (más en momentos de estrés cambiario) → operar ida+vuelta contra dos anunciantes distintos duplica el efecto. No apto para scalping de 15 min por la fricción de negociar con contraparte humana (tiempo de liberación, no ejecución instantánea). |

**Lectura de la tabla:** solo los **futuros** de Binance/Bybit/OKX operando **maker** (limit order que
queda en el libro, no market order) bajan el costo ida+vuelta a ~0,04% — el resto (todo lo demás, y
cualquier cosa en modo taker/market) arranca en 0,10%–0,20% en el mejor caso internacional, y en 1%–2%+ en
las apps argentinas. Operar maker tiene su propio costo oculto: riesgo de no-fill (el precio se mueve y la
orden no se ejecuta) y selección adversa (cuando sí se ejecuta, suele ser porque el mercado iba en tu
contra) — no es gratis, solo mueve el costo de la comisión al slippage de ejecución.

---

## 4. Volatilidad de BTC en 2026 → σ por vela de 15 minutos

**Dato de referencia (22-jul-2026):** volatilidad realizada anualizada — 30 días: **32,3%** · 90 días:
**34,6%** · 365 días: **43,4%**. 2025 fue reportado como el año menos volátil de la serie histórica de BTC.
Retorno absoluto medio por hora: 0,16%–0,35% según día de la semana (mínimos jueves/viernes, máximos
lunes/miércoles, con la primera hora del día y la franja post-16:00 UTC como las más movidas).

**Fórmula:** σ_15min = σ_anual / √(365 × 96) — hay 96 velas de 15 min por día, 365 días por año.

```
√(365 × 96) = √35.040 ≈ 187,19

σ_15min (30d,  32,3%) = 32,3% / 187,19 ≈ 0,173%
σ_15min (90d,  34,6%) = 34,6% / 187,19 ≈ 0,185%
σ_15min (365d, 43,4%) = 43,4% / 187,19 ≈ 0,232%
```

**Qué significa esto contra los costos de la sección 3:**

- **Binance spot, 0,20% ida+vuelta** ≈ **0,9σ a 1,2σ** de una vela de 15 min. En criollo: el costo de
  entrar y salir de la operación equivale a casi todo el movimiento *promedio* de una vela completa. Para
  ganar plata, la estrategia no solo tiene que acertar la dirección: tiene que capturar un movimiento
  bastante más grande que el típico, con la frecuencia suficiente, y sin que las pérdidas se coman las
  ganancias — un problema mucho más duro que "acertar más de la mitad de las veces".
- **Binance futuros maker, 0,04% ida+vuelta** ≈ **0,17σ a 0,23σ**. Es el único escenario de la tabla donde
  el costo queda *por debajo* de una vela típica — pero exige operar exclusivamente con limit orders que
  hagan de maker (no siempre se puede si la estrategia necesita entrar ya), sumarle el funding si la
  posición queda abierta varias horas, y aceptar el riesgo de no-fill/selección adversa de la sección 3.
- **Lemon, 1–2% ida+vuelta** ≈ **4,3σ a 11,6σ**. Acá no hay estrategia que compense: el costo de una sola
  operación equivale a 4 a 12 velas enteras de movimiento típico. Operar BTC en 15 min desde una app
  argentina con spread de exchange es matemáticamente inviable — no es un problema de qué indicador usar.

---

## 5. Evidencia publicada sobre estrategias de 15 min en BTC

Distinguiendo siempre **backtest con costos** (el único dato que importa) de **backtest sin costos**
(marketing, no evidencia):

| Estrategia | Resultado publicado (con costos) | Fuente / notas |
|---|---|---|
| **RSI(14) oversold-bounce scalping**, BTC 15m, 6 meses (9-dic-2025 → 9-jun-2026), $10.000 inicial, 100% de la posición por trade | **92 trades, win rate 66,3%, retorno total −16,88%, drawdown máximo 30,6%** | CoinQuant. Caso de manual: alto win rate **no** implica estrategia ganadora — las pocas pérdidas fueron mucho más grandes que las muchas ganancias chicas (fees + tamaño de posición sin gestión de riesgo). |
| **EMA 21/55 trend-following**, BTC/USDT 15m | **25 trades, win rate 20%, retorno −6,5%, drawdown 8,3%** | CoinQuant. En 15m, un cruce de medias siempre confirma la tendencia *después* de que ya arrancó — para cuando la señal dispara, parte del movimiento ya pasó, y el remanente no alcanza para cubrir costos+ruido. |
| **Multi-indicador (Bollinger anidadas + MACD + RSI)**, ~3 meses, comisión 0,25% + slippage de 5.000 ticks incluido | **+43% (~14,3%/mes), drawdown 2,23%, 51 trades** (≈1 cada 1-2 días) | Fuente de blog especializado (no institucional, sin código público auditable) — es el único resultado positivo encontrado, pero: (a) frecuencia real es ~1 trade/día, no scalping puro de 15m; (b) sin código/datos públicos para reproducir; (c) un solo período de 3 meses no alcanza para descartar sobreajuste. Se marca ⚠️ como resultado a tratar con escepticismo hasta reproducirlo out-of-sample. |
| **Grid bot** BTC, ejemplo real reportado | **−12,70% retorno, Sharpe −0,58, profit factor 0,75** | Trade-Reclaim / Coinquant. La sensibilidad a fees es extrema: "un cambio de 2 puntos básicos en la comisión puede convertir un backtest ganador en perdedor". Grid funciona en rango, se rompe en tendencia (justo lo que pasó). |
| **Breakout / opening-range**, timeframe más largo (no 15m puro) | 114 trades, 74,6% ganadores, profit factor 2,51 | Fuente de trading educativo, timeframe distinto (no 15m), sin verificación independiente — se cita solo como contraste de que timeframes más largos sí muestran resultados publicados más sólidos que 15m. ⚠️ no comparable 1:1. |
| **1-minuto scalping** (referencia de contexto) | Con comisiones >0,1%, la literatura lo declara directamente "no viable" | Coincide con el diagnóstico de 15m: cuanto más corto el timeframe, más domina el costo sobre el edge. |

**Sesgos a los que prestarle atención en TODO backtest de este tipo** (y que ninguno de los de arriba
declara haber controlado del todo):
- **Overfitting / data-snooping:** con cómputo moderno se pueden probar miles de combinaciones de
  parámetros hasta encontrar una que "funcionó" en el pasado — no es una estrategia, es una curva ajustada.
- **Look-ahead bias:** usar el cierre de una vela para decidir y ejecutar *en esa misma vela* (en vez de
  en la apertura de la siguiente) infla el resultado con información que en vivo no existía todavía.
- **Survivorship de "gurús":** el que muestra su backtest ganador es el que sobrevivió a publicar; los que
  probaron 50 variantes y les fue mal no publican nada — el conjunto de "estrategias que se ven online"
  ya está sesgado hacia arriba.
- **TradingView con comisión 0% (o mal configurada):** el motor de backtest de TradingView, si no se le
  carga a mano comisión + slippage realistas, asume ejecución gratis e instantánea — cualquier resultado
  de ahí sin esos parámetros seteados explícitamente no sirve como evidencia.

---

## 6. Quién gana en 15 minutos (y por qué el retail no)

**Market makers y HFT:** cobran (o directamente cobran *rebate*, fee negativo) por poner liquidez, operan
con latencia de microsegundos y colocación privilegiada (colocation), y ven el flujo de órdenes antes que
el resto. El modelo maker-taker está diseñado así: el que aporta liquidez (maker, típicamente MM/HFT) paga
poco o cobra; el que la consume (taker, típicamente el retail con market order) paga el fee completo. La
mayoría de los programas de rebate exigen volúmenes que un retail nunca alcanza — la asimetría del fee
está construida para beneficiar al profesional, no al chico.

**Por qué el retail que paga taker está en desventaja estructural:** en 15 minutos no hay tiempo para que
un edge de información o de análisis técnico compense una desventaja de ejecución de microsegundos y de
fee. El retail entra tarde (después de ver la vela cerrar), paga el fee más alto (taker), y compite contra
alguien que ve su orden llegar, opera más rápido y paga fee negativo. No es un problema de qué indicador
usar — es un problema de en qué cancha se está jugando.

**Alternativa con menos direccionalidad — funding rate arbitrage / cash-and-carry:** en vez de apostar a
la dirección del precio en 15 min, se cobra el funding de los perpetuos manteniendo una posición
delta-neutral (long spot + short perp, o viceversa). Datos típicos 2026: funding base ~0,01%/8h ≈ 11%
anualizado sobre el nocional en condiciones normales (puede ser mucho más alto en mercados "crowded" o muy
direccionales, y negativo en mercados bajistas prolongados); reportes de 2025 citan retornos netos
promedio de ~19% anual con drawdown <2% en condiciones favorables, pero fuentes más conservadoras ubican
el retorno neto honesto (después de fees, slippage y basis drift) en **un dígito medio-bajo anualizado**
en un hold limpio. Es una estrategia real y con lógica de mercado (arbitraje de la prima entre spot y
perpetuo), pero **no es "trading de 15 minutos"** — es una posición que se sostiene días/semanas y cuyo
riesgo no es direccional sino operacional (dos exchanges, dos márgenes, riesgo de contraparte y de
liquidación en la pata apalancada).

---

## 7. Aspectos argentinos (breve)

- **Impuesto a las Ganancias:** vender cripto con ganancia tributa como renta de 2ª categoría — **5%**
  para operaciones en pesos sin cláusula de ajuste (fuente argentina) o **15%** para operaciones en moneda
  extranjera o de fuente extranjera. Aplica por cada venta con resultado positivo, no solo al cierre anual.
- **Régimen de información RG 5804/2025 (ARCA, ex-AFIP):** no crea un impuesto nuevo, pero **amplía el
  régimen informativo**: los PSAV (exchanges/wallets inscriptos en la CNV — Lemon, Belo, Ripio, Buenbit,
  Bitso AR) reportan a ARCA por **sujeto** (no solo por cuenta) a partir de abril 2026, con umbrales de
  $50M/mes (personas físicas) y $30M/mes (jurídicas) en ingresos/egresos/saldos. Vigente para
  declaraciones que vencen desde mayo 2026.
- **Bienes Personales:** el saldo en cripto al 31/12 se suma a la base imponible si se supera el mínimo no
  imponible general.
- **Acceso a exchanges internacionales** (Binance, Bybit, OKX): **no son PSAV en Argentina** — operan
  offshore, sin el mismo marco de protección al usuario local que un PSAV inscripto, y sin reporte directo
  a ARCA (aunque el régimen de intercambio internacional de información puede alcanzar cuentas en el
  exterior declaradas o detectadas). Retirar/depositar entre exchange internacional y cuenta bancaria
  argentina pasa por rampas (P2P, apps locales) que agregan su propio costo (sección 3).
- **Riesgo de custodia:** cripto en un exchange (nacional o internacional) es custodia de terceros, no
  autocustodia — el historial de quiebras/hackeos de exchanges (FTX y otros) es la lección de fondo:
  cuanto más capital se mueve por 15m-trading, más tiempo pasa expuesto al riesgo de contraparte del
  exchange, no solo al riesgo de mercado.
- **Cómo se declara:** vía Ganancias (F.711/simplificado según corresponda) declarando cada operación con
  resultado, y Bienes Personales por el saldo de fin de año. No es tema de esta investigación de mercado
  profundizar el detalle contable — se marca como línea a resolver con un contador si el negocio avanza.

---

## 8. Condiciones mínimas para que valga la pena seguir (checklist)

Ninguna de estas es opcional ni negociable antes de poner un peso real:

- [ ] **Costo ida+vuelta < 0,25σ de la vela.** Con σ_15min ≈ 0,17%–0,23% (sección 4), el techo de costo
  aceptable es **~0,04%–0,06%** — hoy eso solo lo cumple operar **maker** en futuros de Binance/Bybit/OKX
  (0,04% ida+vuelta), y con el riesgo de no-fill que eso implica. Cualquier cosa en modo taker o en una
  app argentina queda automáticamente descartada por este único filtro.
- [ ] **Más de 100 trades out-of-sample** (no in-sample, no el mismo período usado para calibrar
  parámetros) antes de sacar ninguna conclusión sobre si "funciona".
- [ ] **Profit factor neto > 1,3** (ganancias totales / pérdidas totales, ya con comisión+spread+slippage
  descontados) — no alcanza con profit factor > 1 a secas, tiene que haber margen sobre el costo real de
  operar y sobre el error de medición del propio backtest.
- [ ] **Paper trading en vivo ≥ 30 días** replicando el resultado del backtest antes de arriesgar un peso
  — si el paper trading no reproduce (aproximadamente) lo que dijo el backtest, el backtest tenía look-ahead
  bias, overfitting, o costos mal modelados.
- [ ] **Capital que se pueda perder por completo** sin comprometer nada del negocio — esto es
  experimentación cuantitativa, no una fuente de ingresos planificada.

Si estas cinco condiciones no se cumplen todas, la conclusión de la sección 1 se mantiene: **no da**.

---

## 9. Fuentes

- The Block — [Bitcoin 30-Day Annualized Volatility](https://www.theblock.co/data/crypto-markets/prices/annualized-btc-volatility-30d) — dato 30d/90d/365d al 22-jul-2026 (32,3% / 34,6% / 43,4%), consultado 02-sep-2026.
- LiveVolatile — [Bitcoin Volatility Analysis: Understanding Crypto Market Swings in 2026](https://www.livevolatile.com/blog/bitcoin-volatility-analysis-2026) — contexto de volatilidad anualizada 2026 (rango 35-40%, YTD 38%).
- Delta Exchange — [Weekday Seasonality Report on Bitcoin (BTC)](https://www.delta.exchange/blog/weekday-seasonality-report-on-bitcoin-btc) — retorno medio por día de la semana.
- CoinQuant — [Crypto Scalping Strategy Backtested: 6 Months of 15-Minute Data on BTC](https://www.coinquant.ai/blog/crypto-scalping-strategy-backtested-6-months-of-15-minute-data-on-btc) — RSI scalping, 92 trades, win rate 66,3%, retorno −16,88%, drawdown 30,6% (dic-2025 a jun-2026).
- CoinQuant — [BTC Trend Following Strategy 15 Minute Backtest Results](https://www.coinquant.ai/strategies/btc-trend-following-15m-backtest) — EMA 21/55, 25 trades, retorno −6,5%, drawdown 8,3%, win rate 20%.
- Trade-Reclaim — [Are Crypto Trading Bots Profitable? The Fee Math That Decides](https://trade-reclaim.com/en/blog/are-crypto-trading-bots-profitable) — sensibilidad de grid bots a fees (2 bps mueve el resultado de ganador a perdedor); ejemplo real −12,70%/PF 0,75.
- Binance Fees / BitDegree / TradersUnion — [Binance Fees 2026](https://www.bitdegree.org/crypto/tutorials/binance-fees), [Binance Futures Fees](https://tradersunion.com/brokers/crypto/view/binance/futures-fees/) — spot 0,10%/0,10%, BNB −25%; futuros maker 0,02%/taker 0,05%, BNB −10%; funding no tiene descuento.
- Coin Bureau / BitDegree / FeeEdge — [Bybit vs OKX 2026](https://coinbureau.com/review/bybit-vs-okx), [OKX Fees](https://feeedge.com/exchanges/okx) — Bybit spot 0,10/0,10, perp 0,02/0,055; OKX spot 0,08/0,10, perp 0,02/0,05.
- Lemon — [Centro de Ayuda: ¿Cuánto cobra Lemon?](https://help.lemon.me/es/articles/5017589-cuanto-cobra-lemon-por-comprar-vender-o-transferir-crypto) — comisión declarada 0,5% compra / 0,5% venta.
- Rankia — [Dónde comprar criptomonedas en Argentina 2026: guía](https://www.rankia.com.ar/blog/cripto/6613281-donde-comprar-criptomonedas-argentina-guia-completa) — comparativa de spreads Lemon/Belo/Buenbit/Ripio.
- GuiaDeTrader — [Mejores exchanges crypto en Argentina 2026 (Lemon, Belo)](https://www.guiadetrader.com/blog/mejores-exchanges-crypto-argentina-2026) — spreads Belo/Buenbit 0,5-0,8%, Ripio 1-1,3%.
- Binance Blog — [Lo que debes saber sobre el arbitraje de criptomonedas (P2P)](https://www.binance.com/es-AR/blog/p2p/binance-p2p-lo-que-debes-saber-sobre-el-arbitraje-de-criptomonedas-421499824684903551) — spread P2P típico 1%-2,5% por anunciante.
- ArbitrageGhost / Medium — [Funding Rate Arbitrage in 2026: The Complete Guide with Real Calculations](https://arbitrageghost.medium.com/funding-rate-arbitrage-in-2026-the-complete-guide-with-real-calculations-40e6cf341e52) — funding base ~0,01%/8h ≈11% anualizado; retornos netos honestos "mid-single-digit" tras fees/slippage/basis drift.
- Arbitrage Scanner — [Crypto Funding Rate Arbitrage: A Delta-Neutral Guide](https://arbitragescanner.io/blog/crypto-funding-rate-arbitrage-guide) — rango típico 8-20% APY, 10-30% en 2026 con riesgo direccional mínimo.
- PAX Markets — [In Crypto, Fees are High and Speeds are Slow](https://pax.markets/blog/rebates/) — asimetría maker-taker, rebates concentran liquidez en HFT/MM, retail raramente califica.
- David Anthony / Medium — [Why 90% of Profitable Backtests Are Statistically Invalid](https://daviddtech.medium.com/the-three-deadly-sins-of-backtesting-overfitting-look-ahead-bias-and-p-hacking-a68c6345e668) — overfitting, look-ahead bias, p-hacking en backtests.
- Rankia — [Cómo declarar criptomonedas en Argentina (AFIP/ARCA)](https://www.rankia.com.ar/blog/cripto/7404756-como-declarar-criptomonedas-argentina) — 5%/15% Ganancias, vencimiento jul-2026.
- Derecho en Zapatillas — [ARCA y billeteras en 2026: umbrales en Argentina](https://www.derechoenzapatillas.com/2026/arca-y-billeteras-en-2026-umbrales-en-argentina-y-regimen-de-informacion-de-cobros-del-exterior/) — RG 5804/2025, umbrales $50M/$30M, vigencia abril 2026.
- Rankia — [Régimen de información de ARCA sobre criptomonedas: qué reportan](https://www.rankia.com.ar/blog/cripto/7424416-regimen-informacion-arca-cripto) — detalle del cambio de enfoque cuenta→sujeto.

⚠️ **Nota metodológica:** el acceso directo (WebFetch) a `coinquant.ai` estuvo bloqueado por el proxy de
este entorno; las cifras de CoinQuant citadas arriba se tomaron de los snippets devueltos por búsqueda
(WebSearch), que reproducen texto y números concretos del artículo original — se recomienda que quien siga
este research confirme abriendo el link directamente antes de tomar decisiones de capital sobre esos datos.
Del mismo modo, los spreads de Lemon/Ripio muestran fuentes contradictorias (comisión declarada vs. spread
de mercado percibido): quedan marcados ⚠️ y conviene confirmarlos operando montos chicos de prueba antes de
asumir el número para cualquier cálculo de break-even.

---

— Elaborado por Gestión Studio Grow (GSG) · quant-trading · Sonnet
