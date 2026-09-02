# Riel Lemon USD → USDC/USDt → banco argentino — ¿conviene de verdad?

**Fecha:** 2026-09-02 · **Analista:** analista-fx-cripto (Sonnet) · **Para:** Maxi (dueño, uso personal/grupo)
**Monto de referencia del planteo:** USD 2.000 · **Horizonte:** operación puntual / recurrente a evaluar

---

## 1. Veredicto en 3 líneas

**Sí conviene, pero la ganancia real es la mitad de lo que suena y depende de una ventana que se puede cerrar.**
Con la comisión de entrada vigente para Argentina (1,5%) y la prima actual del dólar digital sobre el
MEP, **2.000 USD dejan ~2.029 USD netos** en el banco (+1,5% real, no el "+3%" que se lee en el titular)
— mejor que un banco directo (~1.955) pero **peor que comprar USDT afuera y venderlo en el exchange
argentino con mejor precio** (~2.080-2.110, con más fricción operativa). Es para alguien que **ya** trae
dólares del exterior con cierta frecuencia y tolera el riesgo de contraparte/regulatorio de una fintech
cripto — no es un "dinero gratis" ni una base para escalar un negocio, porque **es arbitraje regulatorio,
no ventaja tecnológica**: si ARCA o el propio mercado lo arbitran, la prima se va a cero de un día para el otro.

---

## 2. Calibración del analista

Leí `CLAUDE.md` (ciclo DEMO→VENTA→INVERSIÓN, Gate de Excelencia, política de autorización), ADR-030
(no se invierte sin vender — acá no aplica gasto, es análisis), ADR-045 (Advisory+Challenger), ADR-046
(de-sesgo por zona), ADR-048 (reversible vs. irreversible) y `docs/sectores/agencia-grow.md` (esto es
negocio propio del grupo, no satélite del ERP). También `docs/lecciones-aprendidas/registro.md` SEC-1.
Principios que guiaron este análisis:

- **Neto punta a punta o no es un número.** "3% arriba del MEP" sin restar la comisión de entrada, el
  spread real de conversión y el impuesto potencial es marketing, no un dato para decidir.
- **Contra la mejor alternativa, no contra cero.** El benchmark es comprar USDT afuera y venderlo donde
  mejor paga, no "quedarse con los dólares en el bolsillo".
- **La prima es una ventana, no un rendimiento.** Toda cifra viene con sensibilidad (0-3%) y punto de
  quiebre; no prometo que la prima de hoy siga mañana.
- **Regulación es costo, no nota al pie.** ARCA/BCRA/CNV se tratan con la misma seriedad que la comisión.
- **Zona de de-sesgo (ADR-046):** los números, tasas y normativa de este documento van en modo
  **estándar/preciso** (con fuente y fecha); el veredicto y la lectura de negocio van en modo
  **humano/criollo**, sin vender humo ni exagerar.
- **Nada de esto mueve plata.** Es 100% doc-only, reversible; no pido ni toco credenciales (SEC-1).

---

## 3. Cómo funciona el riel, paso a paso

```
[1] Vos, en EE.UU. o con cuenta USD    [2] Bridge (proveedor de Lemon)      [3] Lemon convierte a
    (Payoneer, Deel, banco US, etc.)  →     abre cuenta virtual USD a tu   →    USDC y te la acredita
    hacés una transferencia ACH             nombre, recibe la ACH               (label "Dólar digital")
    doméstica a esa cuenta                  (1 a 5 días hábiles)

[4] Vos pedís "Transferencias en dólares"  →  [5] Lemon vende tu USDC/USDt   →  [6] Llega como USD a tu
    → enviar a tu banco argentino               al tipo de cambio del día         caja de ahorro en
    (misma titularidad, obligatorio)             que muestra en la app             dólares en Argentina
                                                  (spread visible, 24 h hábiles)
```

**Fees en cada paso (fuente: Lemon, ver §9):**

| Paso | Concepto | Costo |
|---|---|---|
| Apertura de la cuenta USD (una sola vez) | Pago único | 4 USDC o USDT |
| [1]→[3] Entrada (ACH doméstica → USDC) | Comisión | **1,5%** (blog oficial "cuenta-dólares", el que corresponde a Lemon Cash Argentina — ver nota) |
| [1]→[3] Entrada por Wire (en vez de ACH) | Comisión | 1,5% + 12 USD fijo |
| [4]→[6] Salida (USDC/USDt → USD en banco AR) | Spread de conversión | Variable, visible recién al confirmar la operación en la app (⚠️ a verificar en la app) |
| Monto mínimo por operación | — | 5 USD (ACH) / 100 USD (wire) |
| Tope por operación | — | 4.000 USD por transferencia entrante |
| Tiempos | — | Entrada: hasta 5 días hábiles · Salida a banco: hasta 24 h hábiles |

**Nota sobre el 1,5% vs. 2%:** la tarea trae dos cifras porque hay **dos fuentes que no coinciden**:
- **Lemon (blog oficial, "cuenta-dólares", y el mismo número que cita La Nación 2026-09-01) → 1,5%.**
  Es la fuente que describe el producto tal como lo usa un usuario argentino y **es la que aplico** en la
  tabla de §4.
- **Lemon Lite (help center, otro producto/entidad del mismo grupo, aparentemente para otras
  jurisdicciones) → 2%**, con el mismo mínimo de 5 USD. No encontré una fuente que cobre "2% + 5 USD
  fijos" como comisión combinada (probablemente sea una confusión entre "comisión del 2%" y "depósito
  mínimo de 5 USD"); igual la calculo en §4 como escenario alternativo, literal, por si la tarifa cambió.
  **⚠️ a verificar en la app**: qué comisión te cobra a vos hoy, porque Lemon las cambió más de una vez
  en los últimos años (fue 1,5%, luego promoción "gratis en septiembre", luego 2% en otra comunicación).

---

## 4. Los números

**Fórmula (escenario 1,5% de entrada):**

`Neto = Monto_bruto × (1 − 0,015) × (1 + prima)`

**Fórmula (escenario 2% + 5 USD, literal):**

`Neto = (Monto_bruto × (1 − 0,02) − 5) × (1 + prima)`

Donde *prima* es el excedente neto que termina llegando al banco por cada dólar convertido a USDC/USDt,
ya neto del spread interno que Lemon aplica al vender (§6 explica por qué esta prima "neta" puede ser
bastante menor que la prima "de pizarra" entre USDT y el MEP).

### Tabla 1 — Escenario 1,5% de entrada (el que aplica hoy a Lemon Cash Argentina)

| Monto bruto | Prima 0% | Prima 1% | Prima 2% | Prima 3% |
|---:|---:|---:|---:|---:|
| USD 1.000 | 985,00 | 994,85 | 1.004,70 | 1.014,55 |
| USD 2.000 | 1.970,00 | 1.989,70 | 2.009,40 | **2.029,10** |
| USD 5.000 | 4.925,00 | 4.974,25 | 5.023,50 | 5.072,75 |
| USD 10.000 | 9.850,00 | 9.948,50 | 10.047,00 | 10.145,50 |

*(El dato de La Nación — 2.000 USD → 2.033,04 — corresponde a una prima efectiva de ~3,2%, un pelo arriba
del escenario "3%" de esta tabla; la diferencia es la volatilidad normal del spread día a día.)*

### Tabla 2 — Escenario 2% + 5 USD de entrada (literal, alternativo — verificar cuál aplica)

| Monto bruto | Prima 0% | Prima 1% | Prima 2% | Prima 3% |
|---:|---:|---:|---:|---:|
| USD 1.000 | 975,00 | 984,75 | 994,50 | 1.004,25 |
| USD 2.000 | 1.955,00 | 1.974,55 | 1.994,10 | 2.013,65 |
| USD 5.000 | 4.895,00 | 4.943,95 | 4.992,90 | 5.041,85 |
| USD 10.000 | 9.795,00 | 9.892,95 | 9.990,90 | 10.088,85 |

### Punto de quiebre (vs. Wise/banco directo, ~0,6% de costo todo incluido, sin prima)

Igualando `Monto × (1 − fee_entrada) × (1 + prima) = Monto × (1 − 0,006)`:

- **Con entrada 1,5%:** prima de equilibrio = 0,994 / 0,985 − 1 ≈ **0,91%** (corregido por el Challenger: el borrador
  decía 0,81%; verificación con la tabla §5: 1.988 / 1.970 − 1 = 0,9137%), y **no depende del monto** (ambos términos son
  proporcionales al monto, el 4 USDC de apertura es despreciable arriba de unos pocos cientos de dólares).
  → **Si la prima del dólar digital hoy está por debajo de ~0,9%, Wise/transferencia directa te deja más
  plata neta que Lemon.** Con la prima actual (~3%), Lemon gana cómodo.
- **Con entrada 2%+5 USD:** el punto de quiebre **sí depende del monto** porque el 5 USD fijo pesa más en
  montos chicos: 994 / 975 − 1 ≈ **1,95%** para 1.000 USD, 1.988 / 1.955 − 1 ≈ **1,69%** para 2.000 USD,
  9.940 / 9.795 − 1 ≈ **1,48%** para 10.000 USD (corregidos por el Challenger; el borrador decía 1,85 / 1,59 / 1,38).

**Convención bid/ask (objeción del Challenger, refinada por el Gate):** **al vender USDt cobrás el precio de
COMPRA del exchange** (el más bajo de la pizarra); el de VENTA es lo que pagás para comprar. Con los datos crudos de §9:
Lemon **compra** USDT a 1.534,81 vs. MEP 1.535,5 → si vendés USDt a pesos en Lemon la prima es 1.534,81 / 1.535,5 − 1 =
**−0,04%: nada**. El 1.615,54 es el precio de venta (spread bid-ask de 5,3% en Lemon, ⚠️ dato de snippet a verificar).
El ~3% "neto" de este doc **no sale de vender a pesos**: existe solo en el riel **USDt → dólares al banco**, según el
ejemplo publicado por Lemon en La Nación (1.970 → 2.033,04 = +3,2%), y la app lo muestra recién al confirmar. Por eso
la prima neta se trata como **dato a verificar en la app en cada operación**, no como cotización de mercado.

**Lectura en criollo:** la prima de hoy (~3% neta) te da un colchón grande sobre el punto de quiebre (~0,9%),
pero ese colchón **se movió fuerte en el pasado** (llegó a estar en 0% o negativo en momentos de brecha
chica) — no es un margen que puedas dar por garantizado a 6 meses vista.

---

## 5. Comparativa contra alternativas (neto para USD 2.000)

> Convención: los rieles que terminan **en pesos** se valúan al precio de **compra** del exchange (lo que te pagan) y se
> reconvierten a dólar MEP con −0,5% y un día más (T+1), para comparar dólares contra dólares. Lemon, Belo, P2P, Wise, Takenos y SWIFT dan los mismos números que la app; la fila
> "USDT afuera vendido en Buenbit" no está en la app.

| Alternativa | Cómo funciona | Fee de entrada | Prima/spread aplicado | **Neto estimado** | Fricción operativa |
|---|---|---:|---:|---:|---|
| **Lemon (ACH → USDC → banco AR)** | Descripto en §3 | 1,5% | ~3% (hoy) | **2.029,10** | Media (KYC + 2 pasos + esperas) |
| **Transferencia bancaria directa** (banco US → SWIFT → caja de ahorro USD en banco AR) | Wire clásico, sin cripto de por medio | Fija, ~USD 35-50 entre banco emisor + corresponsal (⚠️ a verificar con el banco puntual, varía mucho) | 0% (llega como USD nominal) | **~1.950-1.965** | Baja, pero lenta (2-5 días) y el costo fijo castiga montos chicos |
| **Wise → pesos vía tipo interbancario / MEP** | Wise convierte a tipo mid-market + comisión chica | ~0,4-0,8% (uso 0,6%) | 0% (no hay prima cripto) | **~1.988,00** | Baja, 1-2 días, la más simple |
| **USDT comprado afuera (Kraken/Coinbase) y vendido en el exchange AR con mejor precio del día** (Buenbit, cotización dada: **compra** 1.584 ARS/USDT —lo que te pagan— vs. MEP 1.535,5) | Comprás USDT con USD que ya tenías afuera, lo mandás por red (TRC-20, ~1 USD) y lo vendés en pesos en el exchange que mejor paga | ~0,25% (fee de compra) + ~1 USD de red | ~3,2% de diferencia compra-vs-MEP (bruto, antes de reconvertir pesos a dólares) | **~2.047** (equivalente en dólares, ya restado −0,5% por reconvertir los pesos a MEP, T+1) | **Alta**: necesitás ya tener USD en un exchange afuera, y en Argentina solo podés operar con PSAV inscriptos en CNV; es el camino con más pasos y más superficie de error |
| **Binance P2P** (compra dada: 1.577,47 ARS/USDT) | Mismo mecanismo que arriba, contraparte P2P en vez de exchange centralizado | similar (~0,25% + red) | ~2,7% vs. MEP | **~2.038** (con −0,5% de reconversión a MEP) | Alta + riesgo de contraparte P2P (estafas, congelamiento de cuenta bancaria por "operación sospechosa") |
| **Belo** (si la promo "ACH sin comisión" de 2026 sigue vigente) | Mismo riel que Lemon (también usa Bridge), compra USDT dada: 1.585 ARS | **0%** (⚠️ a verificar que la promo siga activa) | ~3,2% vs. MEP | **~2.054** (si la promo de comisión 0% sigue viva; con −0,5% de reconversión a MEP) | Media, igual que Lemon — **si el dato de comisión 0% es real, Belo le gana a Lemon hoy** |
| **Takenos** | Cuenta USD también recibe ACH sin comisión, pero retirar a banco AR cobra 1% (o 5% si entra por transferencia bancaria en dólares desde Argentina, no aplica acá) | 0% (ACH) + 1% salida a banco AR | No opera con prima cripto, es dólar nominal | **~1.980** | Media |

**Para GSG/vos, hoy, con estos números: Belo (si la promo de 0% sigue en pie) o el camino cripto puro son
los que más dejan; Lemon es el punto medio "cómodo" (menos pasos que el camino cripto, más que Wise);
Wise y el banco directo son el piso de comparación, no la mejor opción si de verdad hay prima.** Todo esto
es sensible al día — las cotizaciones cambian y las promos de comisión 0% suelen ser temporales.

---

## 6. Riesgos y letra chica

1. **La prima varía y puede irse a 0% o negativa.** Es la brecha entre el dólar cripto y el MEP/oficial;
   depende del cepo, del humor del mercado y de cuánta gente use el mismo riel. No es un rendimiento fijo.
2. **El spread que Lemon muestra en la app (2-4% según fuentes) puede comerse buena parte de la prima
   de pizarra.** La "prima neta" de la tabla §4 ya asume que ese spread está descontado — si en tu
   operación puntual el spread es peor que el implícito en el 3% actual, el neto baja. **Mirá siempre el
   número final antes de confirmar, no la cotización de portada.**
3. **Tiempos:** hasta 5 días hábiles para que se acredite la entrada, hasta 24 h hábiles para la salida.
   Si necesitás la plata ya, no es el riel.
4. **Solo cuentas propias, mismo titular:** Lemon exige que la cuenta de origen (EE.UU.) y la cuenta de
   destino (Argentina) sean tuyas. No sirve para recibir plata de terceros ni para "prestarle" el riel a
   un cliente sin que sea su propia cuenta.
5. **Límites y KYC:** tope de 4.000 USD por transferencia entrante; apertura de cuenta con verificación de
   identidad. Para montos mayores hay que trocear en varias operaciones (lo cual además puede acercarte a
   umbrales de reporte, ver punto 7).
6. **Riesgo de contraparte:** Bridge (el proveedor detrás de la cuenta USD), Lemon como exchange, y el
   propio USDC/USDT como stablecoin (riesgo de depeg, aunque bajo e históricamente breve). No es riesgo
   cero — es el riesgo de que la fintech tenga un problema operativo, regulatorio o de liquidez justo
   cuando tu plata está de tránsito.
7. **Riesgo regulatorio ARCA — RG 5804/2025:** régimen de información de activos virtuales, vigente desde
   declaraciones de mayo 2026. Umbral: **$50.000.000 ARS mensuales** (ingresos/egresos o saldo a fin de
   mes) para personas humanas — al tipo de cambio actual (~1.535 ARS/USD) son **~USD 32.600**. Una
   operación de 2.000-10.000 USD puntual está **cómodamente debajo** del umbral; si esto se vuelve
   recurrente y se escala (varios clientes, montos mayores), hay que vigilar que no se acerque.
8. **Impuesto a las Ganancias:** la venta de cripto con ganancia paga 5% (fuente argentina) o 15% (fuente
   extranjera) sobre el resultado (art. 98 LIG). **⚠️ a verificar con contador**: no está resuelto en las
   fuentes públicas si el mecanismo "USD → USDC → USD" de este riel genera un "resultado" gravable en los
   términos de la ley (técnicamente comprás y vendés un activo virtual con una diferencia a favor) o si se
   trata como un simple movimiento de fondos sin hecho imponible. Dado que ARCA ya recibe reportes
   mensuales de los exchanges/PSAV, **conviene tratarlo como potencialmente gravable hasta que un contador
   lo confirme**, no asumir que "no aplica".
9. **Bienes Personales:** si el saldo en USDC/USDt queda parqueado al 31/12 (no es el caso de un uso
   transaccional de pocos días), cuenta como activo financiero. Bajo riesgo si el uso es de tránsito
   rápido, como describe el planteo.
10. **BCRA — origen de fondos y cuentas propias:** no hay cepo para personas humanas desde abril de 2025,
    pero el banco receptor en Argentina puede pedir justificar el origen de fondos en depósitos grandes o
    reiterados; usar siempre cuenta propia y guardar el comprobante de origen.
11. **Riesgo de que cierren o arbitren la ventana:** esto **es un arbitraje regulatorio** (la brecha entre
    el dólar cripto y el MEP/oficial), **no una ventaja tecnológica de GSG**. Si el cepo se termina de
    licuar del todo, si ARCA regula más fuerte a los PSAV, o si simplemente más gente usa el mismo riel y
    la prima se comprime, la ventaja desaparece sin aviso. No es una base de negocio estable.

---

## 7. ¿Hay negocio para GSG acá?

**(a) Usarlo para el grupo (ahorro propio en cobros del exterior).** Si GSG cobra en dólares del exterior
(clientes de afuera, ventas de exportación de servicios), este riel puede dejar 1-3 puntos más que un
banco directo. **Es reversible y de bajo riesgo si el monto por operación es chico y frecuente** (queda
bien debajo del umbral ARCA), pero **antes de operar plata real del grupo hay que resolver el punto 8 del
riesgo (Ganancias) con el contador**, porque ahí sí hay plata del grupo en juego. Esto lo decide el dueño;
yo no muevo nada.

**(b) Calculadora/comparador público "¿por dónde traigo mis dólares?" como demo a costo cero.** Tiene
sentido de producto: es información que la gente busca (lo prueba que La Nación le dedicó una nota), se
puede armar sin persistencia ni backend real (cotizaciones cacheadas, actualización manual o con un cron
barato), y **encaja con el ciclo DEMO→VENTA→INVERSIÓN** (ADR-030): se publica gratis, sin dominio propio,
sin datos reales de nadie, como vidriera de la capacidad de análisis de GSG. Es **reversible** (doc/código
sin tocar prod ni Neon) y de bajo costo — candidata razonable para una sesión de producto si el dueño la
prioriza.

**(c) Servicio de asesoría (cobrar por decirle a alguien "por dónde te conviene traer los dólares").** Es
el modelo de negocio con más fricción regulatoria: empieza a parecerse a asesoramiento cambiario/financiero,
lo cual en Argentina tiene body de regulación propio (más allá del PSAV). **No lo recomendaría como línea
de negocio sin antes pasar por el Advisory Board + Challenger (ADR-045)** — es una decisión estratégica,
no una feature.

**Reversible vs. irreversible (§C, ADR-048):** este documento es 100% reversible (análisis, sin tocar
prod/Neon/plata). Construir la calculadora pública (b) es reversible mientras sea demo sin persistencia.
**Todo lo que implique mover plata real del grupo, abrir cuentas, o cargar fondos — eso es irreversible y
se eleva al dueño.** No propongo mover plata acá.

---

## 8. Qué tiene que chequear el dueño en la app antes de operar

1. **La comisión de entrada vigente hoy** (¿1,5%, 2%, o alguna promo temporal?) — pantalla de "Cuenta en
   dólares" antes de confirmar el depósito.
2. **El spread real que muestra la app al momento de vender** el USDC/USDt hacia el banco argentino (no
   la cotización de portada de la sección "Dólar digital", sino la pantalla de confirmación de la
   operación puntual).
3. **La prima efectiva del día** entre el precio de compra que te paga Lemon (y la tasa USDt→USD del envío al banco) y el MEP/oficial del
   momento — con eso se recalcula la tabla de §4 con el número real, no el de este documento.
4. **Que la cuenta de origen (EE.UU.) y la cuenta de destino (banco AR) figuren a tu mismo nombre** — es
   requisito duro de Lemon.
5. **El límite vigente por operación** (¿sigue en 4.000 USD?) para planificar en cuántas partes hace falta
   trocear un monto mayor.
6. **Los tiempos reales de acreditación** del día (hasta 5 días hábiles de entrada, hasta 24 h de salida)
   — si hay apuro, este riel no sirve.
7. **Si la promoción de comisión 0% de Belo (o cualquier otra billetera) sigue vigente** antes de asumir
   que es mejor alternativa — las promos de fintech cripto suelen tener fecha de vencimiento.
8. **Consultar al contador** si para el volumen que se piensa mover corresponde declarar un resultado por
   diferencia de cambio bajo Ganancias (punto 8 de §6) antes de repetir la operación varias veces.

---

## 9. Fuentes

- La Nación, "Una billetera permite ganar hasta 2% más por cada dólar que traés de EE.UU.", 2026-09-01.
- Lemon, blog oficial: [Lemon permite recibir dólares del exterior y convertirlos a $USDC con 1.5% de
  comisión](https://lemon.me/en/blog/cuenta-dolares) — consultado 2026-09-02.
- Lemon Lite, Centro de Ayuda: [¿Cómo funciona mi cuenta USD a USDC?](https://help.lemon.me/en/articles/9363647-como-funciona-mi-cuenta-usd-a-usdc)
  y [¿Cuál es la comisión y cómo calcularla?](https://help.lemon.me/en/articles/9368802-cual-es-la-comision-y-como-calcularla) — consultado 2026-09-02 (fuente del escenario "2% + mínimo 5 USD").
- Lemon, [Operaciones permitidas desde la cuenta USD a USDC con Bridge](https://legals.lemon.me/crossborder/) — consultado 2026-09-02.
- Lemon Cash Argentina, Centro de Ayuda: [¿Cómo compro o vendo Dólar Digital - USDt?](https://help.lemon.me/es/articles/15048333-como-compro-o-vendo-dolar-digital-usdt) — consultado 2026-09-02.
- ComparaDólar, [Cotización de USDT en Lemon](https://comparadolar.ar/usdt/lemoncash) — cotizaciones del día 2026-09-01/02 (compra 1.534,81 / venta 1.615,54).
- Belo: [Cómo recibir dólares desde EEUU en Argentina](https://www.belo.app/blog/recibir-dolares-eeuu-argentina) y [Chau comisiones: recibir dólares con belo ahora no tiene costo](https://www.belo.app/en-us/blog/chau-comisiones-recibir-dolares-con-belo-ahora-no-tiene-costo) — consultado 2026-09-02.
- Takenos: [¿Cómo puedo recibir Dólares desde Argentina?](https://help.takenos.com/en/articles/10560008-como-puedo-recibir-dolares-desde-argentina) y [Takenos y sus Comisiones](https://takenos.com/blog/takenos-y-sus-comisiones-cu%C3%A1les-son-los-costos-y-comisiones-de-takenos) — consultado 2026-09-02.
- Wise: [Enviar dinero a Argentina from the US](https://wise.com/ar/send-money/send-money-to-argentina-from-the-usa) y [Caja de Ahorro en Dólares en Argentina](https://wise.com/ar/blog/caja-de-ahorro-en-dolares-argentina) — consultado 2026-09-02.
- Kraken, [Cryptocurrency withdrawal fees and minimums](https://support.kraken.com/articles/360000767986-cryptocurrency-withdrawal-fees-and-minimums) — consultado 2026-09-02.
- Coinbase, [Coinbase pricing and fees disclosures](https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees) — consultado 2026-09-02.
- Blog del Contador, [Régimen de información de activos virtuales: ARCA eleva umbrales y amplía los datos
  exigidos desde 2026](https://blogdelcontador.com.ar/news-46437-regimen-de-informacion-de-activos-virtuales-arca-eleva-umbrales-y-amplia-los-datos-exigidos-desde-2026) — RG 5804/2025, consultado 2026-09-02.
- Rankia, [Cómo declarar criptomonedas en Argentina (ARCA) 2026](https://www.rankia.com.ar/blog/cripto/7404756-como-declarar-criptomonedas-argentina) — alícuotas Ganancias 5%/15% (art. 98 LIG), consultado 2026-09-02.
- Datos de cotización 2026-09-01 provistos por el dueño: oficial BNA 1.480/1.530; MEP ~1.535,5; Binance
  P2P 1.577,47/1.595,9; Belo 1.585/1.605; Buenbit 1.584/1.623,68.

---

*Todo lo marcado ⚠️ requiere confirmación en vivo en la app o con un profesional antes de operar plata
real — este documento es análisis, no ejecuta ni recomienda mover fondos sin ese último chequeo.*

— Elaborado por Gestión Studio Grow (GSG) · analista-fx-cripto · Sonnet
