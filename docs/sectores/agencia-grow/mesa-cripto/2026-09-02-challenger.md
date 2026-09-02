# Challenger — Antítesis a la Mesa Cripto (Lemon, BTC 15m y la app "¿Por dónde traigo mis dólares?")

**Fecha:** 2026-09-02 · **Rol:** Challenger / contrarian (ADR-045) · **Modelo:** Sonnet 5 (default) · **Sobre:**
`2026-09-02-lemon-usd-usdt-banco.md`, `2026-09-02-btc-15m-viabilidad.md` + `…-investigacion-mercado.md`,
`2026-09-02-propuesta-app-mesa-cripto.md`. **No ejecuta, no mueve plata, no toca prod/Neon.** Doc-only.

> Nota de sesión: el agente Challenger corre sin herramienta de escritura; el PMO de la sesión persistió este texto tal
> cual lo entregó. Las correcciones numéricas de §1.1 y §1.2 **ya se aplicaron** en el doc de Lemon.
> El Gate (Opus) refinó §1.2: la "prima de pizarra 5,21 %" tomaba el precio de **venta** (lo que pagás para comprar);
> al vender USDt cobrás el de **compra** (1.534,81 ≈ MEP → prima ≈ −0,04 %). La prima ~3 % existe solo en el riel USDt →
> dólares al banco y se verifica en la app. Doc de Lemon §4/§5 y la app ya usan esa convención.

## 0. Calibración (ADR-052)

Leído: `CLAUDE.md` (ciclo DEMO→VENTA→INVERSIÓN ADR-030, Gate de Excelencia, Advisory+Challenger ADR-045, de-sesgo
ADR-046, prioridades P1/P2/P3), `docs/ESTADO-ACTUAL.md`, `docs/fundamentos/bases-gsg.md`,
`docs/estrategia/challenger-contrapuntos.md`, `docs/adr/INDEX.md`, ADR-045, ADR-046,
`docs/lecciones-aprendidas/registro.md` (MP-16 y MP-17, generadas por esta misma Mesa Cripto), la tesis del
PMO/Arquitecto y los dos análisis de `analista-fx-cripto` y `quant-trading`.

- **Mi único fracaso posible es ser complaciente.** Los dos análisis ya se auto-objetan; mi trabajo es ir más allá:
  recalcular números, buscar competencia real, presionar lo blando.
- **Contra la mejor alternativa, no contra el titular** — igual criterio que exige el propio análisis de Lemon,
  aplicado ahora a la app.
- **Regulación y reputación son costo, no nota al pie** — sobre todo cuando el "producto" es decirle a alguien qué
  hacer con su plata, aunque sea gratis.
- **Foco P1 (CLAUDE.md §Concurrencia):** cualquier frente no-demo-del-ERP es P2/P3 por default.
- **Zona de de-sesgo (ADR-046):** veredicto en humano/criollo; números recalculados en modo estándar/preciso.

## 1. Antítesis al análisis Lemon

**1.1 Error de cálculo real en el punto de quiebre.** El doc decía "prima de equilibrio ≈ 0,81%". Recalculado:
`0,985 × (1+prima) = 0,994 → prima = 0,994/0,985 − 1 ≈ 0,9137%` (≈0,91%). Verificación cruzada con la Tabla §5:
Lemon deja 1.970 antes de prima, Wise 1.988 → `1.988/1.970 − 1 = 0,9137%`. Segundo escenario: decía "≈1,59%" y da
`1.988/1.955 − 1 ≈ 1,688%`. Los dos puntos de quiebre estaban corridos ~0,10 pp favoreciendo a Lemon: no cambia el
veredicto direccional pero reduce el colchón real en un tercio. Que se corrija con una función testeada, no a mano:
la misma lección (MP-17) que la Mesa escribió para BTC y no aplicó a su propia aritmética. **[Aplicado.]**

**1.2 La "prima neta del 3%" está calibrada hacia atrás desde el titular de La Nación — circularidad.** Con los datos
crudos del §9 (MEP 1.535,5 · Lemon USDT venta 1.615,54) la prima de pizarra es **5,21%**, no 3%. El doc no hacía esa
resta explícita ni justificaba por qué el spread interno se come ~2,2 puntos; retro-ajustaba el 3% desde la nota de
prensa de la propia fintech. Corrección: publicar siempre prima "de pizarra" (medible) junto a la "neta" (estimada,
marcada como tal). **[Aplicado.]**

**1.3 Mezcla peras con manzanas.** La fila "USDT comprado afuera y vendido en AR" da ~2.080-2.110 pero en pesos por
reconvertir, no USD ya en el banco como las demás filas: ignora el parking T+1 de MEP, su spread y el riesgo cambiario
del día extra. Comparar sin homologar el "estado de la plata" induce a error.

**1.4 Riesgos subvaluados:** fraccionamiento como señal AML propia (no solo "estar debajo del umbral"); congelamiento
bancario por origen cripto (puede convertir "24 h" en semanas); riesgo Bridge/Tether nombrado pero no tasado; costo
de oportunidad de los 5 días de entrada nunca convertido a número (¿y si el MEP se mueve 2-3% en el medio?); el
spread de salida —input más importante del modelo— sin una sola fuente que lo mida.

**Conclusión Lemon:** el veredicto direccional se sostiene, pero el margen real es más chico (0,91%, no 0,81%) y el
número insignia tenía raíz circular.

## 2. Antítesis al análisis BTC 15m

**2.1 ¿Demasiado conservador?** Parcialmente: no evalúa explícitamente market-making/provisión de liquidez como
categoría. Y el veredicto categórico ("no se construye") se pronuncia antes de correr el backtest real (§8 pendiente,
MP-16): mezclar certeza categórica con la prueba central sin correr resta credibilidad al propio método declarado.

**2.2 ¿Demasiado optimista?** Sí, en el único escenario que deja "vivo" (futuros maker, 0,04% ≈ 0,17-0,23 σ): no
cuantifica no-fill/selección adversa, no resta el impuesto por operación (5-15% Ganancias) del umbral, no contempla
downtime del exchange en alta volatilidad, no descuenta infraestructura del break-even anual. Sumando esto, es
probable que hasta esa grieta se cierre.

**2.3 ¿La simulación sintética es prueba válida u hombre de paja?** Es honesta (declarada) pero por construcción (GBM
sin autocorrelación) no puede mostrar si existe edge real: solo mide arrastre de costos. El veredicto se apoya en tres
patas de fuerza desigual (matemática de costos sólida; backtests públicos de pocas fuentes; simulación ciega al único
fenómeno que salvaría la estrategia) presentadas con el mismo peso.

**2.4 ¿La vara pre-registrada es razonable?** En general sí (≈ test de significancia al 5%). Punto flojo: "positivo en
±30% de cada parámetro" asume parámetros fijos; una mesa profesional reoptimiza walk-forward. Bien calibrada para
descartar curvas ajustadas (lo que GSG puede permitirse hoy), pero debería aclarar que no cierra la puerta a otra
arquitectura si algún día hay equipo dedicado.

**Conclusión BTC 15m:** veredicto sostenido, con más convicción en el caso general. Correr el backtest real antes de
repetir el tono categórico y cerrar explícitamente la grieta de futuros maker.

## 3. Antítesis a la app "¿Por dónde traigo mis dólares?"

**3.1 Ya existe — verificado por WebSearch.** ComparaDólar tiene comparador de USDT dedicado (`comparadolar.ar/usdt`);
Dolarito.ar tiene "Dólar Cripto hoy" comparando USDT entre exchanges contra MEP/oficial/blue; CriptoYa agrega
cotizaciones cada 30 s. Lo que ninguno hace hoy (⚠️ a confirmar) es el "neto por traer X dólares por el riel Y": un
hueco angosto que cualquiera de los tres, con su tráfico y las mismas APIs, cierra en un sprint. GSG competiría por
SEO contra sitios con años de posicionamiento ofreciendo una resta adicional sobre datos que no controla.

**3.2 Retención.** El origen fue una pregunta personal del dueño, no demanda de mercado. Traer dólares es una operación
de 0-2 veces al año; sin retención, la app solo "vale" con tráfico nuevo constante, donde arranca en desventaja.

**3.3 Monetización "honesta: chica" es admisión de ROI dudoso**, sin estimación de conversión. Peor: con links de
referido deja de ser neutral (incentivo a recomendar quien paga comisión), lo que destruye el activo que hace valiosa a
una calculadora —la confianza— y choca con "confiabilidad, cercanía" de `bases-gsg.md`.

**3.4 "El número que la billetera no cumple" es más grave de lo admitido.** El input más importante (spread de salida)
es "visible recién al confirmar", es decir estructuralmente no observable de antemano. Ningún disclaimer arregla que el
producto promete una precisión que su dato de entrada no puede sostener por diseño.

**3.5 "Costo cero" no es tal.** Las comisiones de Lemon ya cambiaron varias veces. Mantener 6-7 rieles al día es trabajo
humano recurrente, no código estático gratis.

**3.6 No encaja bien ni en Grow ni en Digital.** No genera beneficio propio significativo (Grow) ni gira alrededor del
ERP (Digital); la tesis lo resuelve forzando la etiqueta "vidriera de marca", que vale para cualquier análisis bien
hecho y publicado, sin construir ni mantener una app pública.

**3.7 Distrae de P1.** Hay irreversibles reales esperando OK del dueño (deploys Magra/Shine/ADM, material real) que son
ventas a medio cerrar. El "costo cero" no cuenta el slot del pool de 5, el tiempo de revisión del dueño ni el
precedente de abrir una cuarta línea antes de que las tres unidades vendan.

**3.8 Alternativas concretas:**
1. **No construir nada:** usar `comparadolar.ar/usdt` + el doc de Lemon; costo y mantenimiento cero.
2. **Tabla estática interna** (`mesa-cripto/rieles-vigentes.md`) actualizada a mano cuando cambia algo: 90% del valor
   real, cero superficie de riesgo público.
3. **Si se quiere vidriera de marca, meterlo en el Panel del Dueño** (ya de Agencia Grow, `src/lib/owner-insights.ts`)
   como insight para tenants que cobran del exterior: audiencia cautiva, encaja en Grow, mantenimiento amortizado.

Recomendación: (1) hoy; (3) si en 3-6 meses hay demanda validada de un tenant real; (2) como piso mínimo si el dueño
quiere algo ya. La fase 1 pública tal como está redactada, no la recomendaría sin que el dueño asuma explícitamente el
trade-off contra P1.

## 4. Supuestos que se caen si...

1. El spread de salida real de Lemon resulta ser el 2-4% que cita el doc de mercado → la prima neta cae cerca o debajo
   del punto de quiebre real (0,91%).
2. El banco receptor frena la acreditación por origen cripto más de unos días → la prima se come en costo de oportunidad.
3. ARCA/CNV endurece el régimen PSAV o el BCRA licua la brecha → la prima (arbitraje regulatorio) se va a cero sin aviso.
4. El backtest real de BTC 15m supera la vara pre-registrada → el veredicto categórico queda desactualizado.
5. Binance/Bybit habilitan rebate maker accesible a retail → el único caso "vivo" deja de perder por selección adversa.
6. ComparaDólar/Dolarito/CriptoYa lanzan su calculadora de neto-por-riel → la ventana de diferenciación desaparece.
7. Un tenant real pide esta función en su backoffice → la alternativa recomendada pasa de (1)/(2) a (3).
8. El dueño decide priorizar vidriera de marca sobre P1 → trade-off legítimo, pero debe decirse en voz alta.

## 5. Veredicto del Challenger

**Mantener:** el veredicto direccional de ambos análisis (Lemon conviene hoy con margen más chico de lo dicho; BTC 15m
no se construye). **Rechazar tal cual está:** el punto de quiebre de Lemon (ya corregido) y la fase 1 pública de la app
(ya hay tres comparadores con la audiencia que GSG no tiene, monetización sin piso, compite con P1). **Preguntarle al
dueño:** ¿el objetivo real de la app es tu propia decisión personal (alcanza con no construir nada o una tabla
estática) o es vidriera de marca aunque compita con demos del ERP (entonces decilo explícito)? Y para Lemon con plata
real del grupo: ¿ya se consultó al contador el punto de Ganancias antes de repetir la operación?

## 6. Fuentes

- WebSearch 2026-09-02 sobre ComparaDólar / Dolarito / CriptoYa / usdthoy: comparadores de USDT/dólar cripto en vivo ya
  existentes.
- Recalculo propio (§1.1) sobre las fórmulas y tablas del documento de Lemon.
- Riesgos AML/congelamiento bancario/parking MEP: criterio del Challenger sobre operatoria bancaria argentina, sin cita
  puntual — ⚠️ a confirmar con un profesional antes de operar plata real.

— Elaborado por Gestión Studio Grow (GSG) · Challenger · Sonnet
