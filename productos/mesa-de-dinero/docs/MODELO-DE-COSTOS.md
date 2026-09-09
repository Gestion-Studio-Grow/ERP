# Mesa de Dinero GSG — MODELO DE COSTOS (tabla de fricciones)

- **Rol:** Analista Cuantitativo · Mesa de Dinero · Gestión Studio Grow
- **Fecha de corte:** 2026-09-09 (cotizaciones del 08/09/2026, último cierre disponible)
- **Estado:** referencia viva — **este es el archivo que consume el código** (`src/`). Toda constante que
  el motor use para calcular break-even tiene que salir de acá, con su fuente y su fecha.
- **Zona de de-sesgo (ADR-046):** ESTÁNDAR — números, fuente, fecha. Sin adjetivos.

> **Regla del repo:** todo en **pesos al dólar oficial BNA del día, con USD entre paréntesis**.
> **Regla de esta tabla:** un número sin fuente verificable lleva la marca **SIN VERIFICAR** y NO puede
> habilitar capital real hasta que la consola de falsación lo mida.

---

## 0. Tipo de cambio base (08/09/2026)

| Cotización | Compra | Venta | Fuente | Fecha |
|---|---|---|---|---|
| **Dólar oficial BNA (billete)** — *base de conversión del repo* | $1.480 | **$1.530** | [Ámbito — BNA](https://www.ambito.com/contenidos/dolar-banco-nacion.html) · [Cotización-dólar histórico BNA 2026](https://www.cotizacion-dolar.com.ar/dolar-historico-bna-2026.php) | 08/09/2026 13:33 |
| Dólar MEP | $1.524,00 | $1.524,90 | [BAE Negocios](https://www.baenegocios.com/finanzas/dolar-hoy-la-cotizacion-confirmada-el-martes-8-de-septiembre-970/) | 08/09/2026 cierre |
| USDT/ARS — Binance (P2P) | $1.569,75 (bid) | $1.588,09 (ask) | [iProUP 08/09/2026](https://www.iproup.com/economia-digital/71346-precio-de-criptomonedas-en-argentina-cuanto-valen-hoy-8-de-septiembre-de-2026) | 08/09/2026 |
| USDT/ARS — Fiwind | $1.579 | $1.589 | ídem | 08/09/2026 |
| USDT/ARS — Belo | $1.578 | $1.597 | ídem | 08/09/2026 |
| USDT/ARS — Buenbit | $1.575,37 | $1.614,83 | ídem | 08/09/2026 |

**Derivados (cálculo propio sobre los datos de arriba):**

| Métrica | Valor | Cuenta |
|---|---|---|
| USD 5.000 al BNA | **$7.650.000** | 5.000 × 1.530 |
| Premium USDT bid (Binance P2P) vs BNA venta | **+2,60 %** | 1.569,75 / 1.530 − 1 |
| Premium USDT bid (Fiwind) vs BNA venta | **+3,20 %** | 1.579 / 1.530 − 1 |
| Premium USDT bid (Binance P2P) vs MEP venta | +2,94 % | 1.569,75 / 1.524,90 − 1 |
| Spread ask/bid USDT — Binance P2P | 1,17 % | 1.588,09 / 1.569,75 − 1 |
| Spread ask/bid USDT — Fiwind | 0,63 % | 1.589 / 1.579 − 1 |
| Spread ask/bid USDT — Belo | 1,20 % | 1.597 / 1.578 − 1 |
| Spread ask/bid USDT — Buenbit | 2,50 % | 1.614,83 / 1.575,37 − 1 |

> ⚠️ **Foto de un día, no promedio.** El brief de la Mesa afirma que el premium USDT/ARS vs oficial cayó
> a ≈0 % en 2026; la foto del 08/09/2026 muestra +2,6 % a +3,2 %. **Las dos cosas no pueden ser ciertas a
> la vez en promedio** — es exactamente la primera variable que la consola tiene que medir 30 días
> seguidos (ver `ANALISIS-FACTIBILIDAD.md §7`).

---

## 1. Fees de trading por venue

| Venue | Producto | Maker | Taker | Descuento | Fuente | Fecha | Estado |
|---|---|---|---|---|---|---|---|
| Binance | Spot (VIP 0) | 0,100 % | 0,100 % | −25 % pagando en BNB → 0,075 % | [Binance maker/taker 2026](https://binancemakertakerfee.org/) · [FeeFlux](https://feeflux.com/en/articles/binance-fees-guide/) | 2026 | verificado (secundaria) |
| Binance | Futuros USDT-M (regular) | 0,020 % | 0,050 % | −10 % con BNB | [BitDegree](https://www.bitdegree.org/crypto/tutorials/binance-fees) · [Traders Union](https://tradersunion.com/brokers/crypto/view/binance/futures-fees/) | 2026 | verificado (secundaria) |
| OKX | Spot (regular) | 0,080 % | 0,100 % | — | [Traders Union OKX](https://tradersunion.com/brokers/crypto/view/okex/fees/) · [Coin Bureau](https://coinbureau.com/review/bybit-vs-okx) | 2026 | verificado (secundaria) |
| Bybit | Spot (regular) | 0,100 % | 0,100 % | — | [Traders Union Bybit](https://tradersunion.com/brokers/crypto/view/bybit/fees/) | 2026 | verificado (secundaria) |
| Kraken Pro | Spot, tier base (< USD 10k/30d) | 0,25 % | **0,40 %** | tiers por volumen **o** activos en plataforma desde 09/07/2026 | [Datawallet](https://www.datawallet.com/crypto/kraken-fees-explained) · [Kraken blog jul-2026](https://blog.kraken.com/product/pro/new-kraken-pro-fee-tiers) | jul-2026 | **conflicto de fuentes**: [CryptoSlate](https://cryptoslate.com/crypto-exchanges/kraken-exchange-review/) cita 0,40/0,80 % para el schedule del 09/07/2026. Se usa 0,40 % taker (conservador para el análisis); confirmar en [kraken.com/features/fee-schedule](https://www.kraken.com/features/fee-schedule) |
| Binance P2P (ARS) | Compra/venta USDT contra ARS | 0 % comisión | 0 % comisión | el costo es el **spread del vendedor: 0,5–2 % (hasta 3 % según método de pago)** | [CriptoBrújula](https://criptobrujula.com/binance-comisiones-tarifas) · [Rankia AR](https://www.rankia.com.ar/blog/cripto/6702769-review-binance-opiniones-confiabilidad-plataforma) | 2026 | verificado (secundaria) |
| Lemon / Belo | Compra/venta USDT contra ARS | — | **1–2 % todo incluido** (comisión + spread) | — | [Rankia guía 2026](https://www.rankia.com.ar/blog/cripto/6613281-donde-comprar-criptomonedas-argentina-guia-completa) · [MiFinGuía](https://mifinguia.com/comparativas/buenbit-vs-lemon-cash-vs-ripio-argentina/) | 2026 | verificado (secundaria); el spread medido hoy está en §0 |
| Buenbit / Ripio | Spot local | — | 0,8–1,5 % | — | [MiFinGuía](https://mifinguia.com/comparativas/buenbit-vs-lemon-cash-vs-ripio-argentina/) | 2026 | verificado (secundaria); Buenbit spread medido hoy 2,50 % |
| Exchanges AR (rango del brief) | todo incluido (comisión + spread + retiro) | — | **3,5 % a 8 %** | — | dato del brief de la Mesa | 2026 | **SIN VERIFICAR** como rango; los puntos medidos hoy (0,6 %–2,5 % de spread) caen por debajo |

---

## 2. Retiros por red

| Activo / red | Costo | Fuente | Fecha | Estado |
|---|---|---|---|---|
| USDT TRC-20 — Binance | **USD 1** ($1.530) | [Eco — USDT TRC-20 fees 2026](https://eco.com/support/en/articles/15197974-usdt-trc-20-fees-2026-per-transfer-cost-on-every-exchange) · [CryptoCalcsPro](https://cryptocalcspro.com/exchanges/binance-withdrawal-fees-2026) | Q1-2026 | verificado (secundaria) |
| USDT TRC-20 — Bybit | USD 1 ($1.530) | [Traders Union Bybit](https://tradersunion.com/brokers/crypto/view/bybit/fees/) | 2026 | verificado (secundaria) |
| USDT TRC-20 — OKX | **2,6 USDT** ($3.978) según Traders Union; USD 1 según Eco (piso Q1-2026) | [Traders Union OKX](https://tradersunion.com/brokers/crypto/view/okex/fees/) · [Eco](https://eco.com/support/en/articles/15197974-usdt-trc-20-fees-2026-per-transfer-cost-on-every-exchange) | 2026 | **conflicto de fuentes** — usar 2,6 USDT (conservador) |
| USDT TRC-20 — Kraken | — | — | — | **SIN VERIFICAR** |
| Retiro ARS exchange local → banco/CVU | Sin costo declarado; **24–48 h** de riel estándar | [CopyTradeInsider AR 2026](https://www.copytradeinsider.com/blog/best-crypto-exchanges-argentina-2026/) | 2026 | verificado (secundaria) para el plazo; costo **SIN VERIFICAR** por exchange |
| Retiro ARS Binance P2P → Mercado Pago | 0 (instantáneo) | [CriptoBrújula Binance AR](https://criptobrujula.com/binance-argentina) | 2026 | verificado (secundaria) |

**Impacto por nocional (USD 1 de retiro):** USD 500 → 0,20 % · USD 1.000 → 0,10 % · USD 2.500 → 0,04 % ·
USD 5.000 → 0,02 % · USD 10.000 → 0,01 %.

---

## 3. Spread bid-ask y slippage esperado por nocional

| Par / venue | Bid-ask típico | Slippage esperado por clip (market order) | Fuente | Estado |
|---|---|---|---|---|
| BTC/USDT — Binance | **1–2 bps** (0,01–0,02 %) | USD 2.500: ≈0,01 % · USD 10.000: ≈0,01–0,02 % · USD 100.000: 0,02–0,05 % | [Kaiko — cheatsheet bid-ask](https://www.kaiko.com/resources/a-cheatsheet-for-bid-ask-spreads) · [The Block spread BTC/USD](https://www.theblockcrypto.com/data/crypto-markets/spot/bid-ask-spread-btc-usd) | bid-ask verificado (secundaria); **slippage por clip SIN VERIFICAR → lo mide la consola** |
| ETH/USDT — Binance | 1–3 bps | similar a BTC hasta USD 10k | Kaiko ídem | SIN VERIFICAR por clip |
| Alts top-50 / USDT | 5–20 bps | USD 2.500: 0,05–0,20 % | — | **SIN VERIFICAR** |
| Retail ejecutando market orders en libros finos | pierde **0,1–0,5 % por trade** sobre el precio esperado | [Pro Trader Daily](https://protraderdaily.com/analysis/how-to-read-crypto-order-book-depth-charts-for-trading) | verificado (secundaria, orden de magnitud) |
| USDT/ARS — P2P para $7,8 M (USD 5.000) de un saque | el mejor bid publicado rara vez absorbe el nocional completo | — | **SIN VERIFICAR → lo mide la consola (profundidad real por anuncio)** |

---

## 4. Latencia y vida útil de la oportunidad (CEX-CEX / triangular)

| Variable | Valor | Fuente | Estado |
|---|---|---|---|
| Vida útil de un spread cross-exchange | **200–800 ms** | dato del brief de la Mesa (firmas HFT: Jump, Cumberland) | secundaria |
| Ventana media de arbitraje en pares mayores | **< 4 s** (Kaiko 2025) | [BJF Trading Group](https://bjftradinggroup.com/crypto-arbitrage/) citando Kaiko | secundaria |
| Round-trip detección→órdenes confirmadas en ambos exchanges (infra dedicada) | 50–500 ms | [Katoshi](https://katoshi.ai/blog/cross-exchange-latency-arbitrage-optimizing-execution-speed-in-decentralized-markets) | secundaria |
| Pipeline interno requerido (datos→orden) | < 5 ms | ídem | secundaria |
| RTT desde Buenos Aires al matching engine de Binance (AWS Tokio) | ≈ 250–300 ms | — | **SIN VERIFICAR → lo mide la consola (ping/ws)** |
| VPS en Tokio/Singapur (colocación lógica) | ≈ USD 20–50/mes ($30.600–$76.500) | — | **SIN VERIFICAR** |
| Triangular Binance: oportunidades/semana · rentables netas de fee (usuario regular) | **4.879 · 18** (total 2 %, mejor caso 3 %, la mayoría 0–0,025 %) | [Muck, Schmidl & Wolf — *Wish or reality?* Finance Research Letters 73 (2025)](https://ideas.repec.org/a/eee/finlet/v73y2025ics154461232401537x.html) · [PDF Bamberg](https://fis.uni-bamberg.de/bitstreams/8b9ae900-017a-4bed-94b9-609c16e89945/download) | **verificado (paper académico)** |

---

## 5. Funding / basis (cash & carry)

| Variable | Valor | Fuente | Fecha | Estado |
|---|---|---|---|---|
| Funding BTC actual (nivel "estándar") | **≈ 0,01 % / 8 h** → 10,95 % APR (0,01 % × 3 × 365) | [Convex BTC funding](https://convextrade.com/metrics/btc-funding) · [The Block](https://www.theblock.co/data/crypto-markets/futures/btc-funding-rates) | jun–sep 2026 | secundaria |
| Funding BTC enero 2026 (pico) | **+0,51 %** reportado como ≈ **70,2 % APR** | [Zipmex — funding 2026](https://zipmex.com/blog/how-to-analyze-funding-rates-in-crypto/) | ene-2026 | secundaria; **la relación 0,51 % ↔ 70,2 % APR no cierra aritméticamente en ningún período estándar (8 h/día/mes) → SIN VERIFICAR el período; se usa 70 % APR como techo atípico** |
| Rendimiento medio funding-arb profesional | **19,26 % anual (2025)**, 14,39 % (2024), drawdown máx < 2 % | [Bitget News — funding rate arbitrage](https://www.bitget.com/news/detail/12560604395607) · [ArbitrageGhost/Medium](https://arbitrageghost.medium.com/funding-rate-arbitrage-in-2026-the-complete-guide-with-real-calculations-40e6cf341e52) | 2025 | **secundaria (no localizado en fuente primaria)** |
| Rendimiento cross-exchange basis en períodos volátiles | 15–40 % anualizado | ídem | 2026 | secundaria; es techo, no media |
| Paper académico CEX/DEX | Sharpe **negativo** en CEX (Binance −7,34; BitMEX −7,93) para funding-arb en mercado maduro; "retorno menor a la tasa libre de riesgo DeFi" | [Sangiamkul et al. — *Exploring risk and return profiles of funding rate arbitrage on CEX and DEX*, Blockchain: Research and Applications (2025)](https://www.sciencedirect.com/science/article/pii/S2096720925000818) · [ResearchGate](https://www.researchgate.net/publication/394323707_Exploring_Risk_and_Return_Profiles_of_Funding_Rate_Arbitrage_on_CEX_and_DEX) | 2025 | **verificado (paper académico)** |
| Basis BTC según market makers | "rendimiento anualizado de cobrar funding en un dígito alto; basis rica pero funding en niveles estándar" | [CoinDesk 28/08/2026](https://www.coindesk.com/markets/2026/08/28/crypto-market-makers-are-cashing-in-on-bitcoin-s-rally-without-betting-on-direction) | 28/08/2026 | secundaria (título/resumen) |
| Funding 2026: rango | "de una de las lecturas más negativas en años a un squeeze récord cuatro meses después" | [MacroMicro](https://en.macromicro.me/charts/49213/bitcoin-perpetual-futures-funding-rate) | 2026 | secundaria — **el signo se da vuelta** dentro del mismo año |
| Margen de mantenimiento BTC USDT-M | — | Binance ajustó tiers el 07/03/2026 | mar-2026 | **SIN VERIFICAR** el % exacto; se asume short 1× con 100 % de colateral (liquidación ≈ +90 % de BTC) |

---

## 6. Sistema bancario ARS y fricciones locales

| Fricción | Valor | Fuente | Estado |
|---|---|---|---|
| Compra de USD oficial por personas humanas | **sin límite de monto** en el MLC para atesorar/depositar | [Cronista ago-2026](https://www.cronista.com/informacion-gral/ahorros-cuantos-dolares-se-pueden-comprar-en-agosto-de-2026-al-valor-oficial/) · [Infobae abr-2026](https://www.infobae.com/economia/2026/04/13/cepo-cambiario-cuales-son-las-restricciones-que-se-mantienen-tras-los-cambios-del-gobierno/) | verificado |
| Restricción cruzada (Com. "A" 8336, 26/09/2025) | quien compra oficial **no puede operar MEP/CCL por 90 días** (hacia atrás y adelante), con DDJJ | [Beccar Varela](https://beccarvarela.com/novedades/comunicacion-a-8336-nuevas-restricciones-cruzadas-para-personas-humanas-aplicables-a-operaciones-con-titulos-valores/) · [Chequeado](https://chequeado.com/el-explicador/el-banco-central-prohibio-el-rulo-entre-el-dolar-oficial-y-los-financieros-la-brecha-cambiaria-es-la-mas-alta-desde-la-salida-del-cepo/) | verificado |
| ¿La DDJJ alcanza el destino "cripto" de esos USD? | la norma habla de **títulos valores** (liquidación D/C) | — | **SIN VERIFICAR — leer texto de la Com. "A" 8336 en bcra.gob.ar antes de operar** |
| Transferencia de USD banco → Binance | Binance habilitó transferencias locales directas en USD desde cuentas argentinas, "sin comisiones" para la conversión automática | [Cronista/Infotechnology](https://www.cronista.com/infotechnology/criptomonedas/gigante-cripto-en-argentina-ya-permite-transferir-dolares-directo-a-su-billetera/) | verificado (nota); **comisión bancaria de salida de USD y spread implícito de la conversión: SIN VERIFICAR** |
| Bancos y cripto | el BCRA **prohíbe a los bancos ofrecer** servicios cripto; los bancos aplican de-risking (bloqueos/cierres) a cuentas con patrón cripto | [Mesa y López — restricciones 2026](https://mesaylopez.net/restricciones-bancarias-a-cripto-en-argentina-guia) | verificado (secundaria) |
| Riel ARS exchange → banco | 24–48 h | [CopyTradeInsider](https://www.copytradeinsider.com/blog/best-crypto-exchanges-argentina-2026/) | verificado (secundaria) |
| Impuesto al cheque (créditos y débitos) | **0,6 % débito + 0,6 % crédito = 1,2 % por ciclo** en cuenta corriente / cuentas comerciales. Decreto 475/2026 (18/06/2026) exime **las cuentas del PSAV**, no las del usuario | [Infobae 18/06/2026](https://www.infobae.com/economia/2026/06/18/el-gobierno-elimino-el-impuesto-al-cheque-para-las-criptomonedas-y-otras-operaciones-digitales-quienes-dejaran-de-pagarlo/) · [Forbes AR](https://www.forbesargentina.com/negocios/el-gobierno-reduce-impuestos-fintech-empresas-cripto-cambia-sector-celebra-medida-n92594) | verificado. **Caja de ahorro de persona humana: exenta (Ley 25.413 / Dto. 380/2001) — SIN VERIFICAR texto vigente; confirmar con contador** |
| Coinbase AR | dejó de operar pesos el 31/01/2026 (solo cripto↔cripto) | [El Destape](https://www.eldestapeweb.com/economia/criptomonedas/se-va-el-gigante-cripto-coinbase-y-le-ponen-fecha-limite-al-rescate-de-los-fondos-202616143128) | verificado — ejemplo de riel que se cierra |
| Registro PSAV (CNV) | Binance, Bybit, Bitso, Buenbit, Lemon, Ripio, Belo, SatoshiTango, Bitget… (79 inscriptos) | [CNV — RegistrosPSAV](https://www.cnv.gov.ar/SitioWeb/ProveedoresServiciosActivosVirtuales/RegistrosPSAV) · [Yahoo Finanzas](https://es-us.finanzas.yahoo.com/noticias/binance-recibe-autorizaci%C3%B3n-regulatoria-argentina-224000581.html) | verificado |

---

## 7. Impuestos Argentina (persona humana residente)

| Impuesto | Regla | Fuente | Estado |
|---|---|---|---|
| Ganancias — cedular | **15 %** sobre resultado neto (venta − costo, **sin ajuste por inflación**) para enajenación en moneda extranjera / fuente extranjera; **5 %** si la enajenación es en pesos sin cláusula de ajuste | [ARCA — criptoactivos](https://www.afip.gob.ar/economia-digital/criptoactivos/impuesto-a-las-ganancias.asp) · [La Nación 03/04/2026](https://www.lanacion.com.ar/economia/IA/los-impuestos-que-deben-pagar-los-que-usan-cripto-en-la-argentina-nid03042026/) · [Auren](https://auren.com/ar/blog/criptomonedas-principales-implicancias-impositivas-en-argentina/) | verificado. **Se usa 15 % en todo el análisis (conservador).** Si la actividad es **habitual** puede caer en escala general (hasta 35 %) — SIN VERIFICAR criterio para arbitraje sistemático |
| Bienes Personales | criptos gravadas; alícuotas 0,5–1,25 % (cumplidores 0/0,25/0,50 %); MNI FY2025 **$384.728.044,57** | [Cronista BP 2026](https://www.cronista.com/economia-politica/bienes-personales-2026-bajan-las-alicuotas-pero-arca-amplia-quienes-deben-declarar/) · [Rankia](https://www.rankia.com.ar/blog/cripto/7404756-como-declarar-criptomonedas-argentina) | verificado. Con USD 5.000 ($7,65 M) se está muy por debajo del MNI → 0 % salvo que el patrimonio total lo supere |
| IIBB — CABA | **6 % sobre el spread** (diferencia compra-venta) para PSAV (Res. 93-AGIP-26, Ley Tarifaria 2026) | [Infobae 28/04/2026](https://www.infobae.com/economia/2026/04/28/el-gobierno-porteno-redujo-el-pago-de-ingresos-brutos-a-la-compraventa-de-criptomonedas/) · [Ámbito](https://www.ambito.com/finanzas/la-ciudad-reducira-ingresos-brutos-la-compraventa-criptomonedas-n6271724) | verificado para PSAV. **Para una persona humana "habitualista" el tratamiento por jurisdicción es SIN VERIFICAR** — asumir que aplica si la actividad es sistemática |
| IIBB — PBA | minería 4 % (código 631111, Ley 15.391); compraventa habitual **SIN VERIFICAR** | [iProfesional](https://www.iprofesional.com/index.php/impuestos/450245-ingresos-brutos-criptomonedas-caba-confusion-dudas-fiscales) | parcial |
| Régimen informativo ARCA (RG 4614/2019 → RG 5804/2025) | PSAV informan saldos/ingresos/egresos; umbral mensual **$50.000.000** para personas humanas; desde abril 2026 el reporte es por sujeto (titular, CVU/CBU, saldos) | [Rankia](https://www.rankia.com.ar/blog/cripto/7404756-como-declarar-criptomonedas-argentina) · [YouHodler AR](https://www.youhodler.ar/blog/impuestos-criptomonedas-argentina-2026) | verificado (secundaria) |
| Impuesto al cheque | ver §6 | — | — |

---

## 8. Costo de oportunidad del capital parkeado (el "hurdle")

| Alternativa pasiva | Rendimiento | Fuente | Fecha | Estado |
|---|---|---|---|---|
| Plazo fijo BNA (canal electrónico) | **20 % TNA** | [Ámbito PF sep-2026](https://www.ambito.com/economia/plazo-fijo-septiembre-2026-cuanto-rinde-una-inversion-5000000-n6318299) | sep-2026 | verificado |
| FCI money market | 18–23 % TNA (mejor: 29 %) | [Rankia FCI MM](https://www.rankia.com.ar/blog/fondos-comunes-de-inversion/7352179-fci-money-market) · [Cronista](https://www.cronista.com/economia-politica/fci-money-market-cuanto-rinden-hoy-y-cuando-dejan-de-ser-la-mejor-opcion/) | 2026 | verificado (secundaria) |
| Inflación | **1,7 % mensual (CABA ago-2026) · 33,3 % interanual** · 21,5 % acumulado 2026 | [Cronista IPC CABA ago-2026](https://www.cronista.com/economia-politica/la-inflacion-en-caba-fue-de-17-en-agosto-y-acumula-333-en-los-ultimos-12-meses/) | ago-2026 | verificado (CABA; INDEC nacional pendiente) |
| → Tasa real en pesos | **negativa** (20 % TNA vs 33 % i.a.) | cálculo propio | — | — |
| USDT parkeado — Buenbit | **4,00 % APY** | [MiFinGuía](https://mifinguia.com/comparativas/buenbit-vs-lemon-cash-vs-ripio-argentina/) | 2026 | verificado (secundaria) |
| USDT parkeado — Lemon Earn | **8,06 % APY**; vía Morpho hasta 14 % (riesgo DeFi) | [Lemon blog Morpho](https://lemon.me/en/blog/lemon-earn-morpho) · MiFinGuía | 2026 | verificado (secundaria) |
| **Hurdle adoptado para la Mesa** | **8 % anual en USD, neto, con cero trabajo** — cualquier estrategia que no lo supere **después de fees, impuestos y riesgo** es inferior a no hacer nada | decisión del análisis | — | — |

Equivalencias sobre USD 5.000 ($7.650.000): hurdle 8 % = **USD 400/año ($612.000)** = USD 33/mes ($51.000).

---

## 9. Constantes para el código (`src/`)

Bloque consumible. **Toda constante marcada `"verificado": false` tiene que ser sobreescrita por una
medición de la consola antes de que el motor habilite capital real.**

```json
{
  "fecha_corte": "2026-09-08",
  "fx": {
    "bna_compra": 1480, "bna_venta": 1530, "mep_venta": 1524.90,
    "usdt_ars": {
      "binance_p2p": {"bid": 1569.75, "ask": 1588.09},
      "fiwind": {"bid": 1579, "ask": 1589},
      "belo": {"bid": 1578, "ask": 1597},
      "buenbit": {"bid": 1575.37, "ask": 1614.83}
    }
  },
  "fees_trading": {
    "binance_spot":   {"maker": 0.0010, "taker": 0.0010, "con_bnb": 0.00075, "verificado": true},
    "binance_perp":   {"maker": 0.0002, "taker": 0.0005, "verificado": true},
    "okx_spot":       {"maker": 0.0008, "taker": 0.0010, "verificado": true},
    "bybit_spot":     {"maker": 0.0010, "taker": 0.0010, "verificado": true},
    "kraken_spot":    {"maker": 0.0025, "taker": 0.0040, "verificado": false, "nota": "conflicto 0,40/0,80 en una fuente"},
    "binance_p2p_ars":{"comision": 0.0, "spread_vendedor_min": 0.005, "spread_vendedor_max": 0.02, "verificado": true},
    "lemon_belo_ars": {"todo_incluido_min": 0.01, "todo_incluido_max": 0.02, "verificado": true}
  },
  "retiros_usd": {
    "usdt_trc20_binance": 1.0, "usdt_trc20_bybit": 1.0, "usdt_trc20_okx": 2.6,
    "usdt_trc20_kraken": null
  },
  "microestructura": {
    "bidask_btcusdt_bps": 1.5,
    "slippage_btcusdt_por_clip": {"2500": 0.0001, "10000": 0.00015, "100000": 0.0004, "verificado": false},
    "vida_util_spread_ms": {"min": 200, "max": 800},
    "ventana_media_arb_s": 4,
    "rtt_ar_tokio_ms": 275, "rtt_verificado": false,
    "triangular_binance": {"opps_semana": 4879, "rentables_neto_fee": 18, "total_semana": 0.02, "mejor_caso": 0.03}
  },
  "funding": {
    "btc_actual_8h": 0.0001, "btc_actual_apr": 0.1095,
    "btc_ene2026_apr_reportado": 0.702, "ene2026_verificado": false,
    "pro_promedio_2025": 0.1926, "pro_promedio_2024": 0.1439, "pro_verificado": false,
    "pro_drawdown_max": 0.02
  },
  "impuestos_ar": {
    "ganancias_cedular_me": 0.15, "ganancias_cedular_ars": 0.05, "usar": 0.15,
    "bienes_personales": {"min": 0.005, "max": 0.0125, "mni_fy2025_ars": 384728044.57},
    "iibb_caba_sobre_spread": 0.06, "iibb_habitualista_verificado": false,
    "impuesto_cheque_por_pata": 0.006, "aplica_caja_ahorro_ph": false, "aplica_cta_cte": true,
    "umbral_informativo_arca_mensual_ars": 50000000
  },
  "bancario": {
    "riel_ars_exchange_banco_horas": [24, 48],
    "restriccion_cruzada_dias": 90,
    "ddjj_alcanza_cripto_verificado": false,
    "fee_transferencia_usd_banco_exchange": null
  },
  "oportunidad": {
    "pf_bna_tna": 0.20, "fci_mm_tna": 0.205, "inflacion_ia": 0.333,
    "usdt_buenbit_apy": 0.04, "usdt_lemon_apy": 0.0806,
    "hurdle_usd_anual": 0.08
  },
  "infra": {"vps_usd_mes": 35, "verificado": false}
}
```

---

## 10. Cómo se actualiza esta tabla

1. La consola de falsación (`src/`) mide y vuelca: premium USDT/ARS diario, profundidad P2P real, slippage
   por clip, RTT, spreads cross-venue observados, funding realizado.
2. Cada fila `SIN VERIFICAR` se reemplaza por la medición con fecha; recién ahí el JSON de §9 cambia
   `"verificado": true`.
3. Fees/impuestos se re-verifican **cada 90 días** o ante cambio normativo (BCRA/ARCA/CNV).

— Elaborado por GSG
