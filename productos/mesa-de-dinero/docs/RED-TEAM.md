# Mesa de Dinero GSG — RED-TEAM (el Challenger contra el propio análisis)

- **Rol:** Challenger / contrarian (ADR-045) sobre `ANALISIS-FACTIBILIDAD.md` y `MODELO-DE-COSTOS.md`
- **Fecha:** 2026-09-09 · BNA venta $1.530 = USD 1
- **Regla del ADR-045:** nada se adopta como fundamento sin pasar por el Challenger. Este doc **no defiende**
  el análisis: lo ataca desde los dos lados (dónde fui optimista, dónde fui pesimista) y después ataca
  **la existencia misma de la Mesa**.
- **Zona de de-sesgo (ADR-046):** estándar en los números; criollo en las conclusiones. Honesto aunque incomode.

---

## 0. Calibración del Challenger
- El analista quiso matar 4 estrategias y dejó viva 1. El Challenger sospecha de las dos cosas: de las 3
  muertas (¿las maté con supuestos cómodos?) y de la viva (¿la dejé viva por sesgo de "algo tiene que
  sobrevivir"?).
- El error más caro no es equivocarse en un decimal: es **equivocarse en la dirección** (dar 🟡 a lo que es
  🔴, o 🔴 a lo que con otra estructura es 🟡).
- Una foto no es un promedio. Un paper no es un mercado. Un brief no es una fuente.
- El costo que nunca aparece en la planilla es el del **dueño** y el de la **factory** (pool de 5 sesiones).

---

## 1. Supuestos débiles del análisis, con la dirección del error

| # | Supuesto que usé | Dirección del error | Qué pasa si está mal |
|---|---|---|---|
| 1 | **Premium USDT/ARS = foto del 08/09/2026 (+2,6/+3,2 %)** | **A FAVOR de la estrategia 4** | El brief dice "≈ 0 % en 2026"; yo medí 3 % un martes. Si el promedio de 30 días es 0,8 %, el neto por ciclo cae a ≈ 0,5 % y un solo día de premium negativo borra dos semanas. El 🟡 se vuelve 🔴 sin cambiar una sola fee. |
| 2 | **El mejor bid P2P publicado ($1.569,75) absorbe $7,8 M de un saque** | A FAVOR de la 4 | Los anuncios P2P tienen límite por operación; para vender USD 5.000 probablemente hay que bajar 3–5 anuncios. Cada 0,3 % de peor precio son $23.000 (USD 15) menos por ciclo. |
| 3 | **Comisión bancaria de compra de USD y de transferencia USD a exchange = 0** | A FAVOR de la 4 | Algunos bancos cobran la transferencia en dólares y/o el "cambio" tiene spread propio. Cada 0,5 % son $38.000 (USD 25) por ciclo. SIN VERIFICAR: se resuelve con el ciclo de prueba de USD 200. |
| 4 | **Caja de ahorro de persona humana exenta de impuesto al cheque** | A FAVOR de la 4 | Si el banco reclasifica la cuenta por actividad comercial o la operación pasa por cuenta corriente: −1,2 % por ciclo → el neto de 2,1 % baja a 0,9 %. |
| 5 | **Ganancias cedular 15 %** | **AMBIGUO** | Si la venta USDT→ARS se considera "enajenación en pesos sin ajuste" tributa **5 %** (fui pesimista: neto sube a 2,4 %). Si 3–4 ciclos/mes configuran **habitualidad**, entra escala general (hasta 35 %) + IIBB + autónomos (fui optimista: neto baja a ≈ 1,2–1,5 %). La respuesta la tiene un contador, no yo. |
| 6 | **Kraken taker 0,40 %** | EN CONTRA de la 1 (fui conservador) | Una fuente dice 0,80 %. Da igual: la estrategia 1 muere con 0,10 % en las dos patas; el número de Kraken solo la entierra más hondo. |
| 7 | **Slippage 0,01 % por pata en BTC/USDT para USD 2.500** | A FAVOR de la 1 y la 2 | Fui generoso. Aun así mueren. Si el slippage real es 0,05 %, el break-even de la 1 sube a 0,37 %: cambia el epitafio, no el veredicto. |
| 8 | **Funding actual 0,01 %/8 h (10,95 % APR)** | EN CONTRA de la 3 | En meses alcistas 0,03–0,05 %/8 h son comunes (33–55 % APR). Pero con USD 5.000 el hurdle no se mueve: a 55 % APR sobre la mitad del capital son USD 690/año ($1.055.700) brutos — buen mes, no negocio. |
| 9 | **Estructura 50/50 (spot + margen en USDT)** | **EN CONTRA de la 3 — el error más serio del análisis** | Ver §2. Con *multi-asset mode* (el BTC spot como colateral del short) la eficiencia de capital sube a ≈ 100 % y el riesgo de liquidación casi desaparece. Mi 🔴 se apoyó en la estructura más tonta. |
| 10 | **Hurdle = Lemon Earn 8,06 % APY** | EN CONTRA de la 3 | Ese 8 % tiene riesgo DeFi (Morpho). El benchmark "casi libre de riesgo" es Buenbit 4 % o T-bill ≈ 4 %. Con hurdle 4 %, el cash & carry al funding actual (4,5 %) **lo supera por USD 25/año ($38.250)**. Técnicamente cambia el signo; económicamente es cero. |
| 11 | **RTT desde AR ≈ 275 ms** | A FAVOR de la 1 y la 2 (si es peor, mueren igual) | SIN VERIFICAR. Un VPS en Tokio lo baja a < 5 ms — pero entonces competís con fee 0,10 % contra 0,008 %, y ese problema no lo arregla ningún servidor. |
| 12 | **19,26 % anual de funding-arb profesional (2025)** | A FAVOR de la 3 | No lo encontré en fuente primaria: circula en Bitget News / Medium. El paper académico que sí leí (Sangiamkul et al., 2025) dice **Sharpe negativo en Binance**. Si el 19,26 % es marketing de un vendedor de bots, mi escenario "pro 2025" es ficción. |
| 13 | **La DDJJ cambiaria no alcanza cripto** | A FAVOR de la 4 (asumí lo cómodo) | Si el texto vigente o la práctica bancaria lo alcanza, la estrategia 4 no es 🔴 por aritmética: es **incumplimiento cambiario**. Este supuesto solo vale la lectura del texto en bcra.gob.ar, y todavía nadie la hizo. |
| 14 | **3 ciclos/mes** | AMBIGUO | Con Mercado Pago instantáneo se puede hacer 1 ciclo/día → 20 %/mes en la planilla. Ese número no es una oportunidad: es la **prueba de que hay una fricción invisible** (compliance, límites, cierre de cuenta) que la tabla no captura y que es la que realmente fija el techo. |

---

## 2. Dónde me pude haber equivocado EN CONTRA: el cash & carry bien armado

Es el ataque más fuerte contra el análisis y hay que decirlo entero.

Yo armé la posición como principiante: mitad en BTC spot, mitad en USDT de margen, short 1×. Así el funding
se cobra sobre la **mitad** del capital. Un operador con oficio usa **multi-asset mode / portfolio margin**:
el propio BTC spot es el colateral del short. Entonces:

- Nocional del short ≈ **USD 5.000 completos** (menos el haircut del colateral, SIN VERIFICAR el % para BTC).
- Riesgo de liquidación ≈ **nulo**: si BTC sube, el short pierde pero el colateral vale más en la misma
  proporción. Es la estructura que usan los fondos.
- Cuenta corregida: al funding actual 10,95 % × USD 5.000 = USD 548 brutos → neto de fees e impuesto
  **≈ USD 459/año ($702.270) = 9,2 %**. Al "pro 2025" 19,26 %: **≈ USD 810/año ($1.239.300) = 16,2 %**.

**Con eso el cash & carry pasa de 🔴 a 🟡-débil**: le gana a Lemon por 1 a 8 puntos según el funding. Lo que
**no** cambia:
1. En valor absoluto son **USD 60 a 400 por año por encima de dejar los USDT quietos** ($91.800–$612.000).
   Es lo que vale **una tarde por semana** del dueño mirando márgenes, con el downside de un Bybit (−100 %).
2. El funding se da vuelta (2026 lo demostró) y en negativo se paga.
3. El 19,26 % sigue SIN VERIFICAR en fuente primaria; el paper dice Sharpe negativo.
4. Multi-asset mode para cuentas argentinas, haircut y elegibilidad: **SIN VERIFICAR**.

**Corrección que pido al análisis:** la fila del cash & carry en la tabla comparativa debería decir
"🔴 con estructura 50/50 · 🟡-débil con colateral en BTC (SIN VERIFICAR); magnitud irrelevante con USD 5.000".
El veredicto ejecutivo ("no lo hacés con USD 5.000") **se sostiene**, pero por magnitud, no por signo.

---

## 3. Dónde me pude haber equivocado A FAVOR: el rulo local

Dejé viva la estrategia 4 con 🟡. El Challenger cree que hay **70 % de probabilidad de que sea 🔴** cuando la
consola termine de medir, por esta cadena:

1. **El premium de 3 % no es una ineficiencia: es un precio.** Es lo que el mercado paga por *acceso sin
   banco* a dólares digitales (gente sin cuenta, sin DDJJ, sin 90 días de restricción) y por *asumir el
   riesgo de compliance*. Los merchants P2P que lo cobran son los que aceptan que un día les cierren la
   cuenta. Si vos no estás dispuesto a pagar ese riesgo, el premium no es tuyo.
2. **La frecuencia mata la cuenta.** Un particular que compra USD, lo saca a un PSAV y recibe pesos del
   PSAV tres veces por mes dispara exactamente el patrón de de-risking. El "capital máximo" del análisis
   (USD 5–10 k/ciclo) probablemente es demasiado alto; el techo real puede ser **una vuelta por mes** antes
   del llamado del oficial de cumplimiento. A una vuelta por mes: USD 106 ($162.000). Menos que un
   tenant.
3. **La foto es de un martes.** Ya lo dije en §1.1. El brief dice ≈ 0 %. Si alguien de la célula midió
   "≈ 0 %" antes y yo mido 3 % ahora, uno de los dos midió mal o el premium es **volátil**, y volátil con
   2–4 días de exposición por ciclo es una moneda al aire, no un arbitraje.
4. **Costo esperado del bloqueo.** Con P(bloqueo) = 5 %/mes y 60 días de capital inmóvil, el costo esperado
   es ≈ 0,8 %/mes solo en costo de oportunidad — y no está en ninguna tabla. Con P = 15 % ya es mayor que
   el neto de un ciclo.

**Lo que sí sostengo:** el 🟡 es correcto **como instrucción de medición**, no como pronóstico. Es la única
estrategia donde medir 30 días cuesta cero y la respuesta es binaria. Está bien gastar 30 días de consola
en ella. No está bien gastar un peso antes.

---

## 4. Si el dueño igual quiere intentarlo — protocolo de daño mínimo

No es una recomendación; es el cinturón para el que va a manejar igual.

1. **Solo estrategia 4. Solo persona humana. Nunca desde GSG** (con cuenta corriente y Ganancias societaria el
   rulo da 0,9 % y un día malo es pérdida; además arrastra a la sociedad al patrón de compliance).
2. **Tope: USD 1.000 ($1.530.000)** de plata que se puede perder entera sin tocar el runway del ERP
   (Vercel, Neon, Claude, dominio).
3. **Orden obligatorio:** (a) 30 días de consola sin operar → (b) lectura de la DDJJ en el home banking y del
   texto de la Com. "A" 8336; si menciona activos virtuales, fin → (c) consulta a contador sobre habitualidad,
   IIBB y cedular 5 % vs 15 % → (d) **un** ciclo de prueba de USD 200 ($306.000) cronometrado punta a punta
   → (e) recién ahí, hasta el tope, **un ciclo abierto por vez**.
4. **Reglas de corte:** premium neto < 1 % dos días seguidos → se para. Cualquier pedido de documentación del
   banco o del exchange → se para y se responde, no se sigue operando. Un bloqueo → se cierra la línea para
   siempre (no se "prueba con otro banco").
5. **Contabilidad desde el día 1:** cada ciclo con fecha, tipo de cambio BNA, precio USDT, fees, pesos
   netos. Es lo que va a pedir ARCA y lo que la retro (ADR-047) necesita.
6. **Cash & carry:** solo si aparece capital ≥ USD 50.000 que no sea de la empresa, con colateral en BTC
   (§2) y funding ≥ 0,03 %/8 h sostenido 7 días en la consola. Con menos, no.
7. **Estrategias 1 y 2: no.** No hay protocolo de daño mínimo para una carrera que se pierde antes de largar.

---

## 5. El argumento contra TODO el proyecto

Hay que decirlo sin anestesia: **la Mesa de Dinero es, muy probablemente, una distracción cara.**

1. **El propio repo la clasifica como P3.** `CLAUDE.md` (Concurrencia y prioridades): *"P3 — se pausa en
   congestión: investigación de nuevas líneas de negocio (3D / bajo capital)"*. La Mesa es investigación de
   una nueva línea de negocio de bajo capital. Mientras haya demos sin publicar (Magra, satélites) o
   tenants sin activar, el pool de 5 sesiones **no debería** estar acá. Este mismo análisis ocupó un slot y
   quemó tokens de alto juicio que la regla de economía reserva para el Gate.
2. **La magnitud no justifica la atención.** Mejor caso realista (rulo local, 1–3 ciclos/mes, todo sale bien):
   **USD 106–318/mes ($162.000–$487.000)**. Peor caso: capital bloqueado 60 días o cuenta cerrada. Un tenant
   del ERP paga todos los meses, no te cierra la cuenta y **compone**: cada integración (ARCA, MP, WhatsApp)
   sube el switching cost (aprendizaje duro de la célula: *"la integración con un ente que vuelve tu formato
   el esperado es el mejor moat disponible"*). El rulo no compone: **decae a cero** a medida que el premium
   se cierra, y se cierra justamente porque cada vez más gente lo hace.
3. **Viola el ciclo DEMO → VENTA → INVERSIÓN.** La regla dura de GSG es *no se invierte un peso hasta que la
   venta está concretada*. La Mesa es inversión (capital en riesgo + horas + tokens) **sin venta**, sin
   cliente y sin demo. Es exactamente el tipo de gasto que la regla existe para frenar.
4. **Riesgo de reputación y regulatorio por el nombre y por el destino.** "Mesa de dinero" en Argentina
   nombra intermediación financiera; si algún día se operara plata de terceros (clientes del ERP que
   "quieren que les dolaricemos la caja"), eso es actividad de PSAV/intermediación **sin registro** (CNV;
   Ley 21.526 — SIN VERIFICAR el encuadre exacto, pero el solo hecho de tener que preguntarlo ya es una
   bandera). El ERP vende confianza a pymes; una nota de "GSG opera cripto con plata de clientes" la destruye.
5. **El capital en riesgo es el runway.** USD 5.000 ($7.650.000) en un exchange son meses de infraestructura
   del ERP. Un Bybit (−USD 1.500 M, 2025) o un Binance con retiros suspendidos (02/2026) no es un escenario
   de cola: pasó dos veces en 18 meses.
6. **Es el sesgo del modelo, con otro nombre.** La bajada de línea #3 del dueño es *"salir del sesgo del
   modelo — nada obvio"*. Pedirle a una IA una idea de negocio digital de bajo capital y que salga "arbitraje
   cripto" **es** el sesgo del modelo: es la idea más obvia del catálogo. El análisis honesto fue matarla en
   3 de 4 formas; el Challenger agrega que la cuarta también es obvia, ya tiene dueño (merchants P2P) y
   compite en el terreno donde GSG no tiene ninguna ventaja (compliance bancario), no en el que sí tiene
   (software, integraciones, argentinizar SAP).
7. **¿Y vender la consola como producto?** Tentador ("monitor de dólar cripto para pymes"). Muere por el
   aprendizaje duro #1 de la célula — *validar competencia local antes de puntuar*: criptoya y dolarito ya lo
   dan **gratis** y con API. No hay hueco.

**Qué me haría cambiar de opinión (falsable, como todo lo demás):**
- La consola muestra premium neto ≥ 1,5 % en ≥ 20 de 30 días **y** DDJJ limpia **y** un ciclo de prueba sin
  fricción bancaria → la estrategia 4 merece USD 1.000 personales, no de GSG.
- Aparece capital de terceros ≥ USD 50.000 con mandato explícito y estructura legal propia → el cash & carry
  con colateral en BTC merece un análisis nuevo, en Opus, con abogado.
- Un cliente del ERP **pide y paga** una funcionalidad de tesorería (p. ej. dolarizar saldo vía PSAV
  registrado, con la integración como moat) → eso ya no es Mesa de Dinero: es una feature del ERP y entra
  por el circuito normal (Gate, ADR, demo).

Mientras no pase ninguna de las tres: **la Mesa se documenta, se mide 30 días con la consola a costo cero, y
no consume ni un peso ni un slot más.**

---

## 6. Confianza del Challenger en cada veredicto del análisis

| Estrategia | Veredicto del análisis | Confianza del Challenger | Qué lo daría vuelta |
|---|---|---|---|
| 1 · CEX-CEX | 🔴 | **95 %** | log de la consola con ≥ 100 ventanas/mes ejecutables a la latencia medida (predigo 0–3) |
| 2 · Triangular | 🔴 | **97 %** | P&L simulado con libro L2 ≥ USD 100/semana 4 semanas seguidas (predigo ≈ 0) |
| 3 · Cash & carry | 🔴 (50/50) | **60 %** — debería ser "🟡-débil con colateral BTC, magnitud irrelevante" | capital ≥ USD 50 k **y** funding ≥ 0,03 %/8 h sostenido |
| 4 · Local | 🟡 condicional | **70 % de que termine en 🔴** | los 5 umbrales de `ANALISIS §7.5` a la vez |
| El proyecto entero | (no lo dice el análisis) | **80 % de que es distracción** | una de las tres condiciones de §5 |

— Elaborado por GSG
