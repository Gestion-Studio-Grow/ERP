# Mesa de Dinero GSG — ANÁLISIS REAL DE FACTIBILIDAD

- **Rol:** Analista Cuantitativo + Red-Team · Mesa de Dinero · Gestión Studio Grow
- **Fecha:** 2026-09-09 · cotizaciones al cierre del 08/09/2026 · **BNA venta $1.530 = USD 1**
- **Capital de referencia:** **USD 5.000 = $7.650.000**
- **Insumos:** `MODELO-DE-COSTOS.md` (todas las constantes y fuentes) · `RED-TEAM.md` (el desafío a este doc)
- **Mandato (bajada del dueño):** *salir del sesgo del modelo*. Acá el sesgo es el entusiasmo. El trabajo
  fue **intentar matar cada estrategia con aritmética** y dejar viva solo la que sobreviva. Prohibido el
  "podría ser rentable si…". Números o silencio.

## Calibración del analista (ADR-052)
- La aritmética manda: break-even primero, narrativa después. Todo número con fuente y fecha; lo que no se
  pudo verificar dice **SIN VERIFICAR** y no habilita capital.
- Zona de de-sesgo (ADR-046): análisis = **estándar/preciso**; veredicto ejecutivo (§6) = **criollo claro**.
- Contra quién competís es la pregunta #1 (aprendizaje duro de la célula: validar la competencia antes de
  puntuar alto). Acá la competencia son firmas HFT colocadas al lado del matching engine.
- El hurdle no es cero: **USDT parkeado rinde 4–8 % anual sin trabajo** (`MODELO-DE-COSTOS.md §8`). Una
  estrategia que no lo supera **neta de fees, impuestos y riesgo** es peor que no hacer nada.
- Definir ≠ instanciar: el capital real se habilita **solo** cuando la consola de falsación (`src/`) muestra
  lo que pide §7. Antes, cero pesos.

---

## Resumen en una pantalla

| # | Estrategia | Break-even bruto | Lo que se observa | Veredicto (USD 5.000) |
|---|---|---|---|---|
| 1 | CEX-CEX spot | **≥ 0,29 %** por vuelta (0,59 % si una pata es Kraken) | spreads BTC entre venues top: 0,01–0,05 %; duran 200–800 ms; tu latencia desde AR ≈ 275 ms | 🔴 |
| 2 | Triangular intra-venue | **≥ 0,35 %** (3 patas + bid-ask) | 4.879 oportunidades/semana, la mayoría 0–0,025 % bruto; 18 rentables netas; ejecutables a latencia cero | 🔴 |
| 3 | Cash & carry (funding) | tenencia **≥ 10 días** al funding actual para pagar la ida y vuelta | 10,95 % APR sobre la mitad del capital → **4,5 % neto** sobre el total (9,2 % con colateral en BTC, SIN VERIFICAR); el hurdle pasivo es 8 % | 🔴 con 50/50 · 🟡-débil con colateral en BTC · **magnitud irrelevante con USD 5.000** (🟡 real solo ≥ USD 50.000 y funding ≥ 0,03 %/8 h) |
| 4 | Dólar cripto ARS local (oficial → USDT → ARS) | **≥ 0,15 %** de premium (persona humana, caja de ahorro); 1,4 % si es empresa | premium hoy **+2,6 % a +3,2 %** → neto de impuesto **+2,1 % a +2,6 % por ciclo** | 🟡 **con 4 SIN VERIFICAR bloqueantes** |

**Sobrevive una (con condiciones). Tres mueren en la aritmética.** Eso es el resultado esperado, no un fracaso.

---

## 1. CEX-CEX spot (comprar en un exchange, vender en otro)

### 1.1 Cómo funciona (criollo)
Ves BTC a $X en Binance y a $X + un poquito en OKX. Comprás en el barato, vendés en el caro, te quedás
con la diferencia. Para no esperar 20 minutos la transferencia on-chain, tenés plata **en los dos** exchanges
de antemano (la mitad en cada uno) y después "rebalanceás".

### 1.2 Aritmética del break-even
Con USD 5.000 pre-fondeados 50/50 (USD 2.500 = $3.825.000 por lado), par BTC/USDT, órdenes taker
(necesarias: si esperás como maker, la ventana se cerró):

| Fricción por vuelta | Valor | Fuente |
|---|---|---|
| Fee compra (Binance taker VIP 0) | 0,100 % | `MODELO §1` |
| Fee venta (OKX taker regular) | 0,100 % | `MODELO §1` |
| Cruzar el bid-ask dos veces (1,5 bps × 2) | 0,030 % | `MODELO §3` |
| Slippage por clip de USD 2.500, dos patas | 0,020 % | `MODELO §3` (SIN VERIFICAR — lo mide la consola) |
| Rebalanceo USDT TRC-20 (USD 1 sobre USD 2.500) | 0,040 % | `MODELO §2` |
| **Break-even bruto** | **0,29 %** | (0,25 % pagando fees en BNB) |
| Si una pata es Kraken (taker 0,40 %) | **0,59 %** | `MODELO §1` |

En pesos: sobre un clip de USD 2.500 hay que capturar **USD 7,25 ($11.092)** de spread **solo para empatar**.
Y eso antes del 15 % de Ganancias sobre lo que quede.

**La cuenta que seduce y por qué es mentira:** "si capturo 0,05 % neto 100 veces al mes sobre USD 2.500 gano
USD 125/mes = 30 % anual". Para eso necesitás **100 ventanas por mes con spread > 0,34 %** entre Binance y OKX
en BTC, y llegar **primero** a cada una. Ver 1.3.

### 1.3 Contra quién competís
- Firmas HFT (Jump, Cumberland y decenas más) colocadas en el mismo datacenter (AWS Tokio para Binance) con
  pipeline < 5 ms y round-trip 50–500 ms. Vida útil de un spread: **200–800 ms**; ventana media < 4 s (Kaiko
  2025). Resultado: los exchanges grandes muestran **precios casi idénticos cada segundo** (`MODELO §4`).
- Vos: desde Buenos Aires, RTT ≈ 275 ms (SIN VERIFICAR, la consola lo mide) **por exchange**, ×2 exchanges,
  más el tiempo de tu código. Llegás cuando la ventana ya cerró, y lo que quedó abierto es lo que **ellos no
  quisieron** (libro fantasma, par ilíquido, exchange con retiros trabados).
- Con fee VIP 0 (0,10 %) contra market makers con 0,00825 % maker (VIP 9), tu break-even es **10×** el de ellos.
  Es una carrera de 100 m con 90 m de ventaja para el otro.

### 1.4 Capital mínimo real
El costo fijo es la infraestructura (VPS cerca del exchange, datos): ≈ USD 35/mes = **USD 420/año
($642.600)** SIN VERIFICAR. Sobre USD 5.000 eso es **8,4 % anual del capital**: el costo fijo solo ya se
come el hurdle completo. Para que la infra sea ≤ 1 % del capital: **≥ USD 42.000 ($64.260.000)**. Y el
capital no arregla la latencia.

### 1.5 Modos de falla
1. **Libro fantasma:** el precio "caro" en el exchange B es un ask de 0,01 BTC; el resto del clip se llena
   peor que el break-even.
2. **Pata coja (leg risk):** se ejecuta la compra, no la venta (rechazo, rate limit, mantenimiento) →
   quedás largo BTC sin querer.
3. **Retiro suspendido para rebalancear:** Binance suspendió retiros el 03–04/02/2026 y los retiros en USD
   desde el 08/02/2026 (`MODELO §5/§6`); el inventario queda del lado equivocado.
4. **Riesgo de contraparte:** Bybit perdió USD 1.500 M en un hackeo (21/02/2025). Tener el 50 % del capital
   en cada exchange es tener el 100 % en riesgo de exchange.
5. **Congelamiento por compliance:** cuentas con patrón de entradas/salidas frecuentes disparan revisión KYC
   ampliada; el capital queda inmóvil semanas.
6. **Impuesto sin ajuste:** 15 % sobre resultado en pesos sin indexar (`MODELO §7`); IIBB si es habitual.

### 1.6 Veredicto
🔴 **Inviable.** Break-even 0,29 % contra spreads observados de 0,01–0,05 % que viven 200–800 ms; tu latencia
(≈ 275 ms) es del mismo orden que la vida de la oportunidad; el costo fijo (8,4 %/año) supera el hurdle
antes de operar.

---

## 2. Triangular intra-venue (tres pares dentro del mismo exchange)

### 2.1 Cómo funciona (criollo)
Dentro de Binance: USDT → BTC → ETH → USDT. Si los tres precios no están perfectamente alineados, terminás
la vuelta con más USDT que al principio. No hay transferencias ni segundo exchange: todo pasa en un solo
lugar en milisegundos.

### 2.2 Aritmética del break-even

| Fricción por vuelta (3 patas) | Valor |
|---|---|
| 3 fees taker × 0,10 % (VIP 0) | 0,300 % (0,225 % con BNB) |
| Cruzar 3 bid-ask (1,5 bps c/u; la 3ª pata suele ser un par menos líquido: 5–10 bps) | 0,045–0,13 % |
| **Break-even bruto** | **≈ 0,35–0,43 %** |

**Lo que dice el paper (Muck, Schmidl & Wolf, *Finance Research Letters* 73, 2025 — datos de alta frecuencia
de Binance):** en una semana, **4.879** oportunidades teóricas; **la mayoría entre 0 % y 0,025 %** de
retorno bruto (menos que **una** fee); descontando las fees reales quedan **18** rentables para un usuario
regular, que sumadas dan **2 % en la semana** (3 % en el mejor caso) **si se ejecutan instantáneamente**, y
la conclusión explícita es que **los costos de transacción y los volúmenes limitados del libro eliminan la
rentabilidad** (`MODELO §4`).

Cuenta de techo, con supuestos a favor: 18 oportunidades × USD 1.000 absorbibles por el libro (SIN
VERIFICAR; probablemente menos) × 0,11 % promedio = **USD 20/semana ($30.600)** = USD 1.040/año = 20,8 %
sobre USD 5.000 — **a latencia cero y sin nadie más compitiendo**. Con 275 ms de latencia y competencia
colocada, la captura esperada es **≈ 0**. No hay un escenario intermedio: la oportunidad de 0,4 % dura
milisegundos o no existe.

### 2.3 Contra quién competís
Los market makers del propio Binance, colocados, con fee maker VIP 9 de 0,00825 % → su break-even triangular
es **≈ 0,025 %**, exactamente el rango donde vive el 99 % de las oportunidades del paper. Ese rango está
**estructuralmente fuera** de tu alcance con fee 0,10 %: no es cuestión de código, es de tier de fee, y el
tier se compra con volumen que no tenés.

### 2.4 Capital mínimo real
No hay costo fijo relevante (corre en cualquier VPS), pero **el capital no es la variable**: la restricción es
latencia + tier de fee. Más capital = más slippage en la tercera pata, no más ganancia.

### 2.5 Modos de falla
1. **Pata coja intra-venue:** patas 1 y 2 se ejecutan, la 3 no → inventario de un alt ilíquido.
2. **Precio stale:** el websocket te muestra un precio que ya no está; la "oportunidad" es un artefacto de
   latencia (el paper lo llama *wish*, no *reality*).
3. **Rate limits / ban de API** por spam de órdenes canceladas.
4. **Fees escalonadas:** la fee del par de la 3ª pata puede no tener descuento BNB o ser mayor.

### 2.6 Veredicto
🔴 **Inviable.** Break-even ≈ 0,35 % contra un universo donde la mayoría de las oportunidades rinde
0–0,025 % bruto; las 18/semana que superan la fee duran milisegundos y ya tienen dueño.

---

## 3. Cash & carry de funding (largo spot + corto perpetuo)

### 3.1 Cómo funciona (criollo)
Comprás BTC al contado y vendés la misma cantidad en el contrato perpetuo. Si BTC sube o baja, una pata
gana lo que la otra pierde: quedás neutral. Lo que cobrás es el **funding**: cada 8 h los que están largos
en el perpetuo le pagan a los cortos (cuando el mercado está eufórico). Vos sos el corto.

### 3.2 Aritmética del break-even (USD 5.000, 50/50)

| Paso | Monto | Costo |
|---|---|---|
| Compra spot BTC | USD 2.500 ($3.825.000) | 0,10 % = USD 2,50 |
| Short perpetuo 1×, nocional USD 2.500, margen USD 2.500 | — | 0,05 % = USD 1,25 |
| Cierre (ambas patas) | — | USD 3,75 |
| **Ida y vuelta** | | **USD 7,50 ($11.475) = 0,30 % del nocional** |

Con margen del 100 % la liquidación del short queda cerca de **+90 % de BTC** (mantenimiento exacto SIN
VERIFICAR: Binance recortó tiers el 07/03/2026). Si querés más eficiencia (2/3 spot, 1/3 margen), la
liquidación baja a ≈ +45 % — y BTC hizo +45 % en un mes varias veces.

| Escenario de funding | APR | Bruto/año sobre nocional USD 2.500 | Neto de fees y 15 % Ganancias | **% sobre el capital total (USD 5.000)** |
|---|---|---|---|---|
| **Actual ("estándar")** 0,01 %/8 h | 10,95 % | USD 274 ($419.220) | USD 226 ($345.780) | **4,5 %** |
| Promedio profesional 2025 | 19,26 % | USD 481 ($735.930) | USD 403 ($616.590) | **8,1 %** |
| Pico enero 2026 (atípico, dura semanas) | ≈ 70 % | USD 146/mes | USD 124/mes ($189.720) | 2,5 %/mes mientras dure |

**Hurdle:** USDT en Lemon Earn 8,06 % APY = USD 403/año ($616.590) **sin abrir una posición**; Buenbit 4 %.
Es decir: al funding actual ganás **la mitad** que dejando los USDT quietos; al funding profesional promedio
de 2025 **empatás** con Lemon, con más riesgo y más trabajo. Con 2/3 spot + 1/3 margen: 6,2 % neto
(actual) / 10,9 % (pro 2025) — apenas por encima del hurdle, con liquidación a +45 %.

**Break-even de tenencia:** 0,30 % / (10,95 % ÷ 365) = **10 días** al funding actual. Si el funding se da
vuelta el día 3, pagaste fees y encima pagás funding.

### 3.3 Contra quién competís
Acá no competís por velocidad: el funding lo cobra todo el que esté corto. El problema es que **el retorno es
el mismo porcentaje para todos, y el que tiene USD 50 M cobra USD 5 M al 10 %**; vos cobrás USD 274 y tenés
que vigilar tres veces por día. El paper académico sobre CEX (Sangiamkul et al., 2025, `MODELO §5`) reporta
**Sharpe negativo** en Binance (−7,34) y BitMEX (−7,93) para esta estrategia en mercado maduro: el retorno
ajustado por riesgo fue **inferior a la tasa libre de riesgo**.

### 3.4 Capital mínimo real
El porcentaje no depende del capital, pero el **trabajo sí es fijo** (monitoreo 3×/día, rebalancear margen,
mover fondos entre spot y futuros, cerrar cuando el funding se da vuelta). Para que el excedente sobre el
hurdle (≈ 2–3 puntos al funding pro 2025, con 2/3–1/3) pague al menos USD 500/mes ($765.000) de atención
humana: **≥ USD 200.000**. Con USD 20.000 el excedente anual es ≈ USD 600 ($918.000): no paga ni al contador
que te va a hacer la cedular.

### 3.5 Modos de falla
1. **Funding que se da vuelta:** 2026 pasó de "una de las lecturas más negativas en años" a un squeeze
   récord en cuatro meses (`MODELO §5`). En funding negativo **pagás** cada 8 h.
2. **Liquidación de la pata corta** en un gap alcista antes de poder agregar margen (a 2/3–1/3, a +45 %).
3. **ADL (auto-deleverage):** el exchange te cierra el short en el peor momento y quedás largo spot sin cobertura.
4. **Basis al cierre:** el perpetuo puede alejarse 0,1–0,5 % del spot justo cuando cerrás; ese costo no
   está en la tabla.
5. **Contraparte:** Bybit −USD 1.500 M (21/02/2025); suspensión de retiros de Binance (02/2026). En cash &
   carry el 100 % del capital vive en un solo exchange por definición.
6. **Impuesto asimétrico SIN VERIFICAR:** en pesos, la pata spot "gana" con cada devaluación (gravada al 15 %
   sin ajuste) mientras la pata corta pierde en USDT; si la compensación entre patas no se admite en la
   cedular, tributás sobre una ganancia fantasma.

### 3.6 Veredicto
🔴 **Inviable con USD 5.000 en estructura 50/50:** 4,5 % neto al funding actual contra un hurdle pasivo de 8 %;
con el funding profesional promedio de 2025 empata el hurdle con riesgo de liquidación y de exchange encima.

**Corrección del Red-Team (`RED-TEAM.md §2`), incorporada:** con *multi-asset mode* (el BTC spot como colateral
del short) la eficiencia de capital sube a ≈ 100 % y la liquidación casi desaparece → **≈ 9,2 % neto** al funding
actual (USD 459 = $702.270/año) y ≈ 16 % al "pro 2025" — SIN VERIFICAR haircut y elegibilidad para cuentas
argentinas. Eso lo vuelve **🟡-débil por signo**, pero **no cambia la decisión por magnitud**: son USD 60–400
($91.800–$612.000) al año por encima de dejar los USDT quietos, a cambio de vigilancia diaria y riesgo de
exchange (−100 %). 🟡 **real solo** con ≥ USD 50.000 y un filtro de funding ≥ 0,03 %/8 h (32,8 % APR) sostenido
≥ 7 días medido por la consola. No es una estrategia para una pyme: es un negocio de escala.

---

## 4. Dólar cripto ARS local (oficial → USDT → pesos)

### 4.1 Cómo funciona (criollo)
Comprás dólares al oficial en el banco ($1.530), los mandás a un exchange, los pasás a USDT y vendés esos
USDT por pesos a quien los paga más caros ($1.570–$1.579 hoy). La diferencia es tuya. Volvés a empezar.
Es el "rulo" de toda la vida, versión 2026.

### 4.2 Aritmética del break-even (USD 5.000, persona humana, caja de ahorro, foto del 08/09/2026)

| Paso | Monto | Costo / resultado |
|---|---|---|
| 1. Compra USD 5.000 en BNA a $1.530 (DDJJ: sin MEP/CCL por 90 días) | $7.650.000 | comisión bancaria SIN VERIFICAR (se asume 0) |
| 2. Transferencia USD banco → Binance (local, "sin comisión" para la conversión automática) | USD 5.000 | fee bancaria de salida SIN VERIFICAR (se asume 0) |
| 3. USD → USDT (spot 0,10 %) | 4.995 USDT | USD 5 ($7.650) |
| 4a. Venta USDT/ARS en Binance P2P al bid $1.569,75 | **$7.840.901** | — |
| 4b. Alternativa: retiro TRC-20 (USD 1) → venta en Fiwind al bid $1.579 | **$7.885.526** | — |
| 5. ARS a caja de ahorro (24–48 h) | — | impuesto al cheque: **0** en caja de ahorro PH (SIN VERIFICAR); **−0,6 % ($47.000)** si es cuenta corriente |

| Resultado por ciclo | Vía Binance P2P | Vía Fiwind |
|---|---|---|
| Bruto | $190.901 (USD 124,8) = **2,50 %** | $235.526 (USD 153,9) = **3,08 %** |
| Neto de Ganancias 15 % | **$162.266 (USD 106) = 2,12 %** | **$200.197 (USD 131) = 2,62 %** |
| Si es empresa (cta. cte. 1,2 % + Ganancias 30 %) | ≈ $70.000 (USD 46) = **0,9 %** | ≈ $100.000 (USD 65) = **1,3 %** |

**Break-even de premium:** persona humana ≈ **0,15 %** (fees); empresa ≈ **1,4 %**. A diferencia de las
otras tres, la fricción de mercado **no** es el problema: el premium observado (2,6–3,2 %) es 17–20 veces el
break-even. **El problema es todo lo que no está en la tabla** (4.5).

**Ciclo:** compra USD (T+0 online) + transferencia USD al exchange (T+0/T+1) + venta (minutos) + pesos al
banco (24–48 h) → **2–4 días hábiles**. Teórico: 5–8 ciclos/mes. Con 3 ciclos/mes: **$486.798 (USD 318) =
6,4 %/mes sobre el capital.** Anualizado da > 70 %. **Esa cifra es la bandera roja, no la buena noticia:**
si fuera así de fácil, miles de personas lo harían y el premium sería cero. Que hoy sea 3 % dice que hay
una fricción que la tabla no ve — y hasta identificarla y medirla, la estrategia no se habilita.

### 4.3 Contra quién competís
- **Vendedores P2P profesionales ("merchants")** que cotizan con spread de 0,5–2 % y rotan capital varias
  veces por día. Ellos ya hacen este rulo; el premium de 3 % es, en parte, **su margen por asumir el
  riesgo de compliance y de contraparte** que vos todavía no asumiste.
- **Los propios exchanges locales** (Buenbit, Lemon, Ripio) que compran USD/USDT al por mayor y venden al
  minorista con 0,6–2,5 % de spread (`MODELO §0`).
- **Nadie te gana en velocidad** acá; te ganan en **capacidad de absorber pesos** (rieles, cuentas, límites) y
  en **tolerancia regulatoria** (están registrados como PSAV; vos sos un particular con patrón sospechoso).

### 4.4 Capital mínimo — y **máximo** — real
- Mínimo: no hay costo fijo; con USD 1.000 ($1.530.000) el ciclo neto da ≈ USD 21 ($32.000). Cualquier capital
  "funciona" en la planilla.
- **Máximo (la restricción binding):**
  - Profundidad P2P real: el mejor bid publicado no absorbe $7,8 M de un saque — SIN VERIFICAR, lo mide la consola.
  - Régimen informativo ARCA: umbral **$50.000.000/mes** por persona humana (`MODELO §7`). USD 5.000 × 4
    ciclos = $30,6 M (debajo); USD 10.000 × 4 = $61 M (arriba → reporte por sujeto).
  - Tolerancia del banco: compra USD → salida a PSAV → entrada ARS desde PSAV → compra USD… es **el patrón
    exacto** que el de-risking bancario bloquea (`MODELO §6`). La frecuencia, no el monto, es lo que te cierra
    la cuenta.

### 4.5 Modos de falla (los que no están en la tabla)
1. **El premium se evapora mientras estás adentro:** tenés 2–4 días de exposición por ciclo; una caída de
   3 % → 0 % (pasó de > 30 % en 2022 a "≈ 0 %" en 2026 según el brief) borra un ciclo entero, y si el premium
   se hace **negativo** perdés capital (comprar a 1.530 y liquidar USDT a 1.520).
2. **DDJJ de la Com. "A" 8336:** hoy alcanza títulos valores (MEP/CCL). **SIN VERIFICAR** si el texto vigente
   o la práctica bancaria alcanza el destino cripto de los USD comprados. Si alcanza, la estrategia es un
   incumplimiento cambiario — se mata acá, no en la aritmética.
3. **Cierre / bloqueo de cuenta bancaria** por patrón (UIF/de-risking). Capital inmóvil semanas; con la
   cuenta cerrada, no hay ciclo.
4. **Retención 24–48 h** de los pesos + riel que se corta (Coinbase dejó de operar pesos el 31/01/2026).
5. **Contraparte P2P:** pago falso / reversa de transferencia / chargeback de Mercado Pago después de liberar
   los USDT. Riesgo por operación, no por mercado.
6. **Congelamiento por compliance del exchange** (KYC ampliado, origen de fondos) justo con los USD adentro.
7. **Habitualidad fiscal:** hacerlo 3–4 veces por mes te vuelve *habitualista* → IIBB (CABA 6 % sobre spread
   para PSAV; para personas SIN VERIFICAR) + posible escala general de Ganancias (hasta 35 %) + autónomos.
   Con eso el neto de 2,1 % cae a ≈ 1,2–1,5 %.
8. **Hacerlo desde la empresa (GSG):** 1,2 % de impuesto al cheque + 30 % Ganancias → 0,9 %/ciclo. Con un
   día malo de premium, negativo. **Desde la sociedad está muerto.**

### 4.6 Veredicto
🟡 **Única estrategia con aritmética positiva hoy: +2,1 % a +2,6 % neto por ciclo (USD 106–131 =
$162.000–$200.000 sobre USD 5.000) sobre la foto del 08/09/2026.** Condicionada a **cuatro SIN VERIFICAR
bloqueantes** que la consola tiene que resolver antes de mover un peso: (a) premium **promedio** de 30 días,
no de un día; (b) profundidad P2P real para el nocional; (c) alcance de la DDJJ cambiaria al destino cripto;
(d) tolerancia bancaria a la frecuencia. Si cualquiera de las cuatro falla, pasa a 🔴.

**Variante "market maker P2P" (ser el merchant):** 🔴 para GSG. Margen 0,5–2 % por vuelta compartido con
decenas de merchants, exposición máxima a contraparte y UIF (sos vos el que recibe pesos de desconocidos), y
requiere estado de merchant verificado. Es un negocio de compliance, no de aritmética.

---

## 5. Tabla comparativa

| Criterio | 1 · CEX-CEX | 2 · Triangular | 3 · Cash & carry | 4 · Local oficial→USDT→ARS |
|---|---|---|---|---|
| Break-even bruto | 0,29 % (0,59 % c/ Kraken) | 0,35–0,43 % | 0,30 % ida y vuelta → 10 días de tenencia | 0,15 % (PH) / 1,4 % (empresa) |
| Oportunidad observada | 0,01–0,05 % | 0–0,025 % (99 %) | 10,95 % APR (actual) | 2,6–3,2 % hoy · promedio SIN VERIFICAR |
| Vida de la oportunidad | 200–800 ms | milisegundos | días–semanas | horas–días (mean-reverting) |
| Competidor | HFT colocado, fee 0,008 % | MM colocado, fee 0,008 % | fondos con USD 10–100 M | merchants P2P y exchanges locales |
| Latencia importa | crítica | crítica | no | no |
| Capital mínimo real | ≥ USD 42.000 (infra ≤ 1 %) | n/a — no es el cuello | ≥ USD 200.000 para pagar el trabajo | cualquiera; **máximo** ≈ USD 5–10 k/ciclo (ARCA $50 M/mes, profundidad, banco) |
| Neto/año estimado con USD 5.000 | ≈ 0 − infra (**−8 %**) | ≈ 0 | **+4,5 %** (50/50) · +9,2 % con colateral BTC (SIN VERIFICAR) | **+2,1–2,6 % por ciclo** si el premium se sostiene — SIN VERIFICAR |
| Hurdle pasivo (USDT 8 %) | no lo alcanza | no lo alcanza | no lo alcanza / empata | lo supera **en la foto** |
| Riesgo principal | latencia + contraparte 2 exchanges | precio stale + pata coja | funding negativo + liquidación + contraparte | regulatorio/bancario + premium que se evapora |
| Trabajo humano | alto (infra 24/7) | alto | medio (3×/día) | bajo por ciclo, alto en compliance |
| **Veredicto** | 🔴 | 🔴 | 🔴 50/50 · 🟡-débil con colateral BTC · magnitud irrelevante (🟡 ≥ USD 50 k) | **🟡 condicional** |

---

## 6. Veredicto ejecutivo (en criollo, para un dueño de pyme con USD 5.000)

Tenés USD 5.000 ($7.650.000). Esto es lo que da la cuenta, sin humo:

**Lo que NO harías:**
- **No armás un bot que compre en un exchange y venda en otro.** Te estarías anotando en una carrera contra
  gente que está sentada al lado del servidor, con comisiones diez veces más baratas que las tuyas, por
  diferencias de precio que duran menos de un segundo. Solo el servidor te cuesta más de lo que podrías ganar.
- **No armás un bot triangular.** Es lo mismo pero adentro de un solo exchange. Un paper académico contó las
  oportunidades reales en Binance en una semana: de casi 5.000, sobraban 18 después de las comisiones, y
  esas 18 duran milisegundos y ya tienen dueño.
- **No hacés cash & carry con USD 5.000.** Cobrás el funding sobre la mitad de la plata (la otra mitad es
  garantía), te queda **4,5 % al año** después de comisiones e impuesto, y **dejando los USDT quietos en Lemon
  cobrás 8 %** sin mirar la pantalla. Es un negocio para quien tiene USD 50.000 para arriba y un filtro de
  funding; para una pyme es trabajo gratis con riesgo de que te liquiden el corto.
- **No hacés nada de esto desde la sociedad.** Impuesto al cheque 1,2 % por vuelta + Ganancias 30 % convierten
  el único rulo que cierra en 0,9 % por ciclo, y con un día malo, en pérdida.

**Lo único que tiene sentido mirar** (mirar, no hacer todavía): el **rulo local** — comprar dólar oficial a
$1.530, pasarlo a USDT y venderlo a $1.570–$1.579. Hoy deja **$162.000–$200.000 (USD 106–131) por vuelta**,
neto de impuesto, y una vuelta lleva 2–4 días. Suena demasiado bueno. **Y eso es exactamente el problema:** si
fuera tan fácil, el premium no existiría. Antes de poner un peso hay que responder cuatro preguntas que hoy
no sabemos: ¿el 3 % es el promedio o fue un martes? ¿alguien paga ese precio por $7,8 M de un saque? ¿la
declaración jurada que firmás en el banco te prohíbe mandar esos dólares a un exchange? ¿cuántas vueltas
aguanta tu banco antes de cerrarte la cuenta? La consola que se está construyendo existe para contestar eso
con datos, no con opinión.

**En una línea:** con USD 5.000, tres de cuatro estrategias pierden contra dejar los USDT quietos; la cuarta
gana en la planilla y todavía no sabemos si gana en el banco. **Hasta que la consola lo muestre, el capital se
queda donde está.**

---

## 7. Lo que hay que medir antes de poner un peso (contrato con la consola de falsación en `src/`)

La consola no "busca oportunidades": **intenta falsar este análisis**. Habilita capital real solo si el log
muestra, con fecha, lo siguiente. Cualquier casilla vacía = 🔴 automático.

### 7.1 Métricas comunes (todas las estrategias)
| Métrica | Cómo se mide | Umbral para habilitar |
|---|---|---|
| `rtt_ms` por exchange | ping + tiempo ws→ack de orden de prueba (mínimo, no market) | informativo; para 1 y 2 debe ser **< 50 ms** (no va a pasar desde AR) |
| `slippage_por_clip` | libro L2 real, simulación de market order de USD 500 / 2.500 / 5.000 | reemplaza los SIN VERIFICAR del `MODELO §3` |
| `fee_efectiva` | fee cobrada real en órdenes de prueba de USD 10 | = lo declarado en `MODELO §1` |
| Muestra mínima | **30 días corridos**, 24/7, con timestamps | sin 30 días no hay veredicto |

### 7.2 Estrategia 1 — CEX-CEX
- `spread_cross_venue` BTC/USDT y ETH/USDT entre Binance/OKX/Bybit, muestreado cada 100 ms.
- **Log requerido:** cantidad de ventanas con spread > 0,29 % (> 0,59 % con Kraken), **duración** de cada
  ventana, y cuántas seguían abiertas **a los 275 ms + latencia medida**.
- **Umbral:** ≥ 100 ventanas/mes ejecutables a tu latencia con spread > break-even + 0,05 %. Predicción de
  este análisis: **0–3/mes**. Si el log dice ≥ 100, el análisis estaba mal y se revisa.

### 7.3 Estrategia 2 — Triangular
- Escaneo de todos los triángulos con USDT base en Binance; para cada señal > 0,35 %: **simulación de
  ejecución con el libro L2 del instante** (no con el ticker) y con la latencia medida.
- **Log requerido:** señales/semana, señales que sobreviven al libro real, señales que sobreviven a la
  latencia, P&L simulado neto de 3 fees.
- **Umbral:** P&L simulado neto ≥ USD 100/semana ($153.000) sostenido 4 semanas. Predicción: **≈ 0**.

### 7.4 Estrategia 3 — Cash & carry
- `funding_8h` realizado (Binance/Bybit/OKX), basis perp-spot, y **P&L simulado de una posición 50/50 de
  USD 5.000** abierta el día 1 y mantenida 30 días, neto de fees y con funding negativo contabilizado.
- **Log requerido:** APR realizado 30 días, días con funding negativo, drawdown de margen máximo, distancia a
  liquidación mínima.
- **Umbral:** APR realizado ≥ 32,8 % (0,03 %/8 h) sostenido ≥ 7 días **y** capital disponible ≥ USD 50.000.
  Con USD 5.000: **no se habilita** aunque el funding vuele; la cuenta del hurdle no cambia.

### 7.5 Estrategia 4 — Local (la única en pista)
- `premium_usdt_bna` diario: mejor bid USDT/ARS (Binance P2P, Fiwind, Belo, Buenbit, Lemon) vs BNA venta
  del día, **a las 11:00 y a las 16:00**, 30 días.
- `profundidad_p2p`: para los 5 mejores anuncios de compra de USDT, **límite máximo por operación y
  precio** — cuánto nocional absorbe el mercado a ≤ 0,3 % del mejor bid.
- `ciclo_horas`: tiempo real medido en **un ciclo de prueba con USD 200 ($306.000)**, incluyendo la
  transferencia USD banco→exchange y los pesos de vuelta al banco.
- `ddjj_alcance`: **no es una métrica, es una lectura**: texto vigente de la Com. "A" 8336 (bcra.gob.ar) y
  la DDJJ que muestra el home banking al comprar USD. Se pega el texto en el log. Si menciona activos
  virtuales / criptoactivos → 🔴 definitivo.
- **Umbral para habilitar USD 5.000:** premium neto (bid − BNA venta − 0,15 %) **≥ 1,5 % en ≥ 20 de 30
  días**, profundidad ≥ USD 5.000 a ≤ 0,3 % del mejor bid en ≥ 20 de 30 días, ciclo de prueba completado
  sin bloqueo, DDJJ sin mención cripto, y OK de contador sobre habitualidad/IIBB. **Los cinco a la vez.**
- **Regla de corte una vez habilitada:** si el premium neto cae < 1 % dos días seguidos, se para y se vuelve
  a la fase de medición. Nunca más de un ciclo abierto a la vez. Nunca desde la sociedad.

---

## 8. Fuentes

Tipo de cambio y premium: [Ámbito — dólar BNA](https://www.ambito.com/contenidos/dolar-banco-nacion.html) ·
[Cotización-dólar — histórico BNA 2026](https://www.cotizacion-dolar.com.ar/dolar-historico-bna-2026.php) ·
[BAE — dólar 8/9/2026 (MEP)](https://www.baenegocios.com/finanzas/dolar-hoy-la-cotizacion-confirmada-el-martes-8-de-septiembre-970/) ·
[iProUP — cripto en AR 8/9/2026 (USDT por exchange)](https://www.iproup.com/economia-digital/71346-precio-de-criptomonedas-en-argentina-cuanto-valen-hoy-8-de-septiembre-de-2026) ·
[USDT Hoy — dólar cripto 2026](https://usdthoy.com/blog/que-es-dolar-cripto-argentina).

Fees y retiros: [Binance maker/taker 2026](https://binancemakertakerfee.org/) · [FeeFlux — Binance fees](https://feeflux.com/en/articles/binance-fees-guide/) ·
[BitDegree — Binance futures](https://www.bitdegree.org/crypto/tutorials/binance-fees) · [Traders Union — OKX](https://tradersunion.com/brokers/crypto/view/okex/fees/) ·
[Traders Union — Bybit](https://tradersunion.com/brokers/crypto/view/bybit/fees/) · [Datawallet — Kraken](https://www.datawallet.com/crypto/kraken-fees-explained) ·
[Kraken blog — tiers jul-2026](https://blog.kraken.com/product/pro/new-kraken-pro-fee-tiers) · [CryptoSlate — Kraken (fuente en conflicto)](https://cryptoslate.com/crypto-exchanges/kraken-exchange-review/) ·
[Eco — USDT TRC-20 fees 2026](https://eco.com/support/en/articles/15197974-usdt-trc-20-fees-2026-per-transfer-cost-on-every-exchange) ·
[CriptoBrújula — Binance P2P](https://criptobrujula.com/binance-comisiones-tarifas) · [Rankia — exchanges AR 2026](https://www.rankia.com.ar/blog/cripto/6613281-donde-comprar-criptomonedas-argentina-guia-completa) ·
[MiFinGuía — Buenbit/Lemon/Ripio](https://mifinguia.com/comparativas/buenbit-vs-lemon-cash-vs-ripio-argentina/).

Microestructura y latencia: [Kaiko — bid-ask cheatsheet](https://www.kaiko.com/resources/a-cheatsheet-for-bid-ask-spreads) ·
[BJF — crypto arbitrage 2026 (cita Kaiko < 4 s)](https://bjftradinggroup.com/crypto-arbitrage/) ·
[Katoshi — latency arbitrage](https://katoshi.ai/blog/cross-exchange-latency-arbitrage-optimizing-execution-speed-in-decentralized-markets) ·
[Alexander (2025) — Latency Arbitrage in Cryptocurrency Markets, SSRN](https://papers.ssrn.com/sol3/Delivery.cfm/5143158.pdf?abstractid=5143158&mirid=1) ·
[Muck, Schmidl & Wolf (2025) — *Wish or reality?*, Finance Research Letters 73](https://ideas.repec.org/a/eee/finlet/v73y2025ics154461232401537x.html) ([PDF](https://fis.uni-bamberg.de/bitstreams/8b9ae900-017a-4bed-94b9-609c16e89945/download)).

Funding / cash & carry: [Convex — BTC funding](https://convextrade.com/metrics/btc-funding) · [The Block — BTC funding](https://www.theblock.co/data/crypto-markets/futures/btc-funding-rates) ·
[Zipmex — funding 2026 (ene-2026 +0,51 %)](https://zipmex.com/blog/how-to-analyze-funding-rates-in-crypto/) · [MacroMicro — funding 2026](https://en.macromicro.me/charts/49213/bitcoin-perpetual-futures-funding-rate) ·
[Bitget News — funding arb 19,26 %](https://www.bitget.com/news/detail/12560604395607) · [ArbitrageGhost — funding arb 2026](https://arbitrageghost.medium.com/funding-rate-arbitrage-in-2026-the-complete-guide-with-real-calculations-40e6cf341e52) ·
[Sangiamkul et al. (2025) — funding rate arbitrage CEX/DEX](https://www.sciencedirect.com/science/article/pii/S2096720925000818) ·
[CoinDesk 28/08/2026 — market makers y basis](https://www.coindesk.com/markets/2026/08/28/crypto-market-makers-are-cashing-in-on-bitcoin-s-rally-without-betting-on-direction) ·
[Binance — ajuste de márgenes 07/03/2026](https://bitcoinethereumnews.com/tech/binance-adjusts-leverage-margin-levels-for-26-u-margined-contracts/).

Riesgo de contraparte: [FBI — Bybit USD 1,5 B](https://www.fbi.gov/investigate/cyber/alerts/2025/north-korea-responsible-for-1-5-billion-bybit-hack) ·
[Chainalysis — robos 2025](https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/) · [Yahoo — Binance retiros 02/2026](https://finance.yahoo.com/news/binance-withdrawals-resume-temporary-disruption-053357105.html) ·
[Motley Fool — Binance suspende USD](https://www.fool.com/money/cryptocurrency/articles/binance-to-suspend-deposits-and-withdrawals-of-us-dollars) ·
[El Destape — Coinbase deja los pesos](https://www.eldestapeweb.com/economia/criptomonedas/se-va-el-gigante-cripto-coinbase-y-le-ponen-fecha-limite-al-rescate-de-los-fondos-202616143128).

Regulación cambiaria y bancaria: [Cronista — compra de USD ago-2026](https://www.cronista.com/informacion-gral/ahorros-cuantos-dolares-se-pueden-comprar-en-agosto-de-2026-al-valor-oficial/) ·
[Infobae — cepo abr-2026](https://www.infobae.com/economia/2026/04/13/cepo-cambiario-cuales-son-las-restricciones-que-se-mantienen-tras-los-cambios-del-gobierno/) ·
[Beccar Varela — Com. "A" 8336](https://beccarvarela.com/novedades/comunicacion-a-8336-nuevas-restricciones-cruzadas-para-personas-humanas-aplicables-a-operaciones-con-titulos-valores/) ·
[Chequeado — rulo prohibido](https://chequeado.com/el-explicador/el-banco-central-prohibio-el-rulo-entre-el-dolar-oficial-y-los-financieros-la-brecha-cambiaria-es-la-mas-alta-desde-la-salida-del-cepo/) ·
[Cronista — USD directo a Binance](https://www.cronista.com/infotechnology/criptomonedas/gigante-cripto-en-argentina-ya-permite-transferir-dolares-directo-a-su-billetera/) ·
[Mesa y López — restricciones bancarias 2026](https://mesaylopez.net/restricciones-bancarias-a-cripto-en-argentina-guia) ·
[CopyTradeInsider — rieles 24–48 h](https://www.copytradeinsider.com/blog/best-crypto-exchanges-argentina-2026/) · [CNV — Registro PSAV](https://www.cnv.gov.ar/SitioWeb/ProveedoresServiciosActivosVirtuales/RegistrosPSAV).

Impuestos: [ARCA — criptoactivos / Ganancias](https://www.afip.gob.ar/economia-digital/criptoactivos/impuesto-a-las-ganancias.asp) ·
[La Nación 03/04/2026 — impuestos cripto](https://www.lanacion.com.ar/economia/IA/los-impuestos-que-deben-pagar-los-que-usan-cripto-en-la-argentina-nid03042026/) ·
[Auren — implicancias impositivas](https://auren.com/ar/blog/criptomonedas-principales-implicancias-impositivas-en-argentina/) ·
[Rankia — declarar cripto 2026 (RG 5804/2025)](https://www.rankia.com.ar/blog/cripto/7404756-como-declarar-criptomonedas-argentina) ·
[Cronista — Bienes Personales 2026](https://www.cronista.com/economia-politica/bienes-personales-2026-bajan-las-alicuotas-pero-arca-amplia-quienes-deben-declarar/) ·
[Infobae 28/04/2026 — IIBB CABA cripto](https://www.infobae.com/economia/2026/04/28/el-gobierno-porteno-redujo-el-pago-de-ingresos-brutos-a-la-compraventa-de-criptomonedas/) ·
[Infobae 18/06/2026 — impuesto al cheque (Dto. 475/2026)](https://www.infobae.com/economia/2026/06/18/el-gobierno-elimino-el-impuesto-al-cheque-para-las-criptomonedas-y-otras-operaciones-digitales-quienes-dejaran-de-pagarlo/) ·
[Forbes AR — Dto. 475/2026](https://www.forbesargentina.com/negocios/el-gobierno-reduce-impuestos-fintech-empresas-cripto-cambia-sector-celebra-medida-n92594).

Costo de oportunidad: [Ámbito — plazo fijo sep-2026](https://www.ambito.com/economia/plazo-fijo-septiembre-2026-cuanto-rinde-una-inversion-5000000-n6318299) ·
[Rankia — FCI money market](https://www.rankia.com.ar/blog/fondos-comunes-de-inversion/7352179-fci-money-market) ·
[Cronista — IPC CABA ago-2026](https://www.cronista.com/economia-politica/la-inflacion-en-caba-fue-de-17-en-agosto-y-acumula-333-en-los-ultimos-12-meses/) ·
[Lemon — Earn / Morpho](https://lemon.me/en/blog/lemon-earn-morpho).

— Elaborado por GSG
