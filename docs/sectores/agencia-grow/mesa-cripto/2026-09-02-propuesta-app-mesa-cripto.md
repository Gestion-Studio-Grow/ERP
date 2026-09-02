# Propuesta de app — Mesa Cripto GSG: "¿Por dónde traigo mis dólares?" (y por qué NO un bot de 15 min)

**Fecha:** 2026-09-02 · **Sector:** Agencia Grow (negocio propio) · **Autor:** PMO/Arquitecto de la sesión, sobre los
análisis de `analista-fx-cripto` y `quant-trading` · **Gobernanza:** tesis (este doc) → antítesis
([`2026-09-02-challenger.md`](./2026-09-02-challenger.md)) → **síntesis del dueño** (§7, ADR-045). Nada de acá está
adoptado hasta que el dueño decida.

---

## 1. Lo que respondieron los análisis (en una tabla)

| Pregunta del dueño | Respuesta corta | Doc |
|---|---|---|
| ¿Traer USD por Lemon (ACH → USDt → banco AR a ~1,03) es rentable? | **Sí, pero deja la mitad del titular:** 2.000 USD → ~2.029 netos con prima 3 % y 1,5 % de entrada (vs ~1.988 por Wise, ~1.955 por SWIFT directo). La ventaja **es la prima del dólar cripto sobre el MEP**, que hoy es ~3 % y **ya estuvo en 0 % o negativa**. Punto de quiebre: prima neta < ~0,91 % → gana Wise. Belo podría ganarle si su ACH 0 % sigue vigente (`⚠️ a verificar`). | [Lemon USD→USDt→banco](./2026-09-02-lemon-usd-usdt-banco.md) |
| ¿Operar BTC en velas de 15 min puede dar rentabilidad? | **No con rieles argentinos** (costo ida+vuelta 2–4 % = 11–22 σ de una vela) y **sin edge demostrado en Binance** (costo 0,14–0,24 % ≈ 1 σ; toda estrategia clásica termina en la banda del azar menos costos; backtests públicos con costos: −6,5 % y −16,9 %). Lo único con lógica estructural es el **carry de funding** (delta-neutral), que no es "trading de 15 min". | [Viabilidad BTC 15m](./2026-09-02-btc-15m-viabilidad.md) · [Mercado y costos](./2026-09-02-btc-15m-investigacion-mercado.md) |
| ¿Se construye una app? | Tesis inicial: calculadora pública de rieles a costo cero. **Tras el Challenger (§7): no por defecto**; queda como opción explícita del dueño. Bot de 15 min: **no**. | este doc + Challenger |

## 2. Qué app SÍ (tesis)

**Nombre de trabajo:** *¿Por dónde traigo mis dólares?* — comparador público de rieles para mover dólares hacia
Argentina, con el **neto en la mano** por camino y la **prima USDT/MEP en vivo**.

**El problema real que resuelve:** hoy el titular dice "+3 %", la app de la billetera muestra el spread recién al
confirmar, y nadie compara punta a punta contra Wise/banco/otra billetera. El usuario decide con un número de portada.

**Qué hace (MVP, fase 1):**
1. Entrada: **monto** + **origen** (USD en banco de EE. UU. · USDT que ya tengo · pesos) + **destino** (USD en caja de
   ahorro AR · pesos).
2. Salida: tabla ordenada por **neto** para cada riel (Lemon ACH→USDt→banco · Belo · Takenos · Wise · SWIFT directo · USDT
   vendido en el exchange AR que mejor paga · Binance P2P), con la fórmula visible y cada supuesto **editable** (fee de
   entrada, spread de salida, prima) para que el usuario cargue lo que ve en su app.
3. **Prima USDT vs MEP en vivo** (APIs públicas: cotizaciones de exchanges AR + MEP/oficial) y el **punto de quiebre** del
   día: "hoy Lemon le gana a Wise por X USD; si la prima baja de Y %, dejá de convenir".
4. Checklist "antes de operar" (cuentas propias, spread final en la app, tiempos, umbral ARCA) y aviso claro:
   **no es asesoramiento financiero ni fiscal; consultá a tu contador**.

**Qué NO hace:** no opera, no pide claves, no guarda datos personales, no muestra señales de trading, no promete.

**Cómo se construye (reversible, a costo cero — regla DEMO → VENTA → INVERSIÓN):**
- Página estática (HTML + JS, sin backend, sin base) que consume APIs públicas desde el navegador; hosting gratuito
  (`<slug>.vercel.app`), sin dominio propio. Estimación: **1 día de célula Sonnet** + Gate en Opus.
- Ubicación prevista: proyecto hermano `productos/mesa-cripto/` (patrón del `constructor`), **fuera del Core del ERP**.
  **Deuda anotada (Gate O-8):** la fase 1 quedó en `public/lab/mesa-cripto/index.html` dentro del ERP para cumplir el
  estándar del Lab ("bajo `/lab`"); es HTML estático sin backend, hereda el portón `SITE_GATE_PASSWORD` del proxy y el
  deploy sigue siendo Gate 1 del dueño. Mover a `productos/` es un `git mv` reversible. URL real servida por Next:
  `/lab/mesa-cripto/index.html` (Next no resuelve `index.html` en carpetas de `public/`; un rewrite lo acortaría).
- La lógica de cálculo es la misma del doc de Lemon (fórmula por riel), testeada con los mismos casos (2.000 → 2.029,10).

**Monetización (honesta: chica):** links de referido de billeteras (Lemon/Belo pagan referidos), lead a un contador
partner para el punto impositivo, y —si hay uso— alertas por WhatsApp/mail cuando la prima cruza el punto de quiebre
(fase 2). **El valor principal no es la plata que genera la app: es (a) el ahorro propio del grupo en cobros del
exterior y (b) la demo pública de la capacidad GSG** (análisis + producto en 48 h), que vende el ERP y la Agencia.

**Fases:**

| Fase | Qué | Costo | Gate |
|---|---|---|---|
| 0 (hoy) | Análisis + esta propuesta + Challenger | 0 | síntesis del dueño |
| 1 | Calculadora estática con datos vivos, URL gratuita | 0 (1 día Sonnet) | Gate Opus (SAP 7 ángulos + argentino + sello) |
| 2 | Alertas de prima / punto de quiebre (solo si fase 1 tiene uso medible) | 0–bajo | Gate + OK del dueño si hay gasto |
| ✗ | Bot de trading 15 min | — | **no se construye** salvo que el backtest real pase la vara pre-registrada (viabilidad §8) y el dueño lo pida |

## 3. Qué app NO (y por qué, sin vueltas)

- **Bot/app de trading de BTC en 15 min:** el costo de ejecución se come el movimiento de la vela antes de que exista
  estrategia; en rieles argentinos quema el capital en menos de un año aunque el mercado no se mueva; en Binance no
  hay edge demostrable. Construirlo sería gastar tiempo y después plata (VPS 24/7, claves API) en algo cuya evidencia
  dice "no". Si el dueño quiere exposición a BTC, eso es una **decisión de inversión propia** (posición larga con
  reglas, DCA, carry), no un producto.
- **Servicio de "asesoría cambiaria":** roza regulación de asesoramiento financiero y depende de un arbitraje que puede
  cerrarse; no se propone sin Advisory + Challenger dedicados.

## 4. Riesgos de la tesis (los que el Challenger tiene que apretar)

1. La prima del 3 % es una **foto del 1-sep-2026**; si baja, la app pierde su titular y su razón de uso.
2. **Uso puntual, no recurrente:** la gente trae dólares pocas veces al año → retención baja.
3. **Ya existen comparadores de cotizaciones** (comparadolar, dolarito, criptoya). Nuestra diferencia es el *neto punta
   a punta por riel*, no la cotización; hay que verificar que nadie lo haga ya.
4. **Riesgo de número que la billetera no cumple:** si la app dice 2.029 y Lemon acredita 2.010, el usuario nos culpa.
   Por eso los supuestos son editables y el aviso es explícito.
5. **Foco P1:** este frente es P2/P3 según la regla de concurrencia; no puede desplazar demos del ERP.

## 5. Qué es reversible y qué se eleva (§C, ADR-048)

| Reversible (lo ejecuta la célula) | Irreversible / se eleva al dueño |
|---|---|
| Fase 1 completa: código estático, URL gratuita, docs, Gate | Mover plata real por cualquier riel · abrir cuentas · cargar claves API · comprar dominio · pautar · cualquier gasto |
| Correr el backtester real en desktop y documentar | Decidir exposición propia a BTC (carry, DCA, posición) |
| Alertas fase 2 sin costo | Alertas con costo (proveedor de WhatsApp/mail pago) |

## 6. Pedido al dueño (decisiones, no tareas)

1. **¿Va la fase 1** de la calculadora a costo cero, o se cierra el frente con los análisis como entregable?
2. **¿Correrás el backtester real en desktop** (`node scripts/btc-15m-backtest.mjs --source binance --days 365`) o
   preferís que se cierre el tema BTC 15 min con la evidencia actual?
3. Para el riel Lemon **con plata del grupo**: primero confirmar con contador el tratamiento en Ganancias
   (`⚠️ abierto`), y chequear en la app el **spread final** antes de cada operación. Eso lo hacés vos; ninguna célula
   toca fondos.

> **Decisión del dueño (rastro, MP-15) — 2026-09-02:** tras leer el resumen de los análisis y las objeciones del
> Challenger, el dueño respondió **"avanza"**. Se interpreta como: construir la **fase 1 en modo demo a costo cero**
> (calculadora de rieles + panel de costos BTC 15 m), sin bot de trading, sin cotizaciones en vivo, sin dominio ni
> persistencia (DEMO → VENTA → INVERSIÓN). Entregable: `public/lab/mesa-cripto/index.html` (servida bajo
> `/lab/mesa-cripto`, estándar del Lab) + Artifact privado de revisión:
> https://claude.ai/code/artifact/90a6535a-fa90-4b00-a4b7-8e6883c9c83d (redeploy a la misma URL en cada cambio). El trade-off contra P1 queda asumido por el
> dueño con esa palabra; si la lectura fuera otra, se revierte con un `git rm` (reversible).

## 7. Síntesis (se completa con la antítesis del Challenger)

> Ver [`2026-09-02-challenger.md`](./2026-09-02-challenger.md). La síntesis final es del dueño; acá se anota qué
> objeciones se aceptan y qué cambia en la tesis.

**Objeciones aceptadas (cambian la tesis):**
- **Números de Lemon corregidos** en el doc fuente: punto de quiebre **0,91 %** (no 0,81 %) con entrada 1,5 %, y
  1,95 / 1,69 / 1,48 % con 2 %+5 USD; prima **de pizarra 5,21 %** publicada junto a la **neta ~3 %** (que ya descuenta
  el spread de salida que la app muestra recién al confirmar). El colchón real es un tercio más chico de lo dicho.
- **La app pública fase 1 no se recomienda por defecto.** Ya existen comparadolar.ar/usdt, dolarito.ar (dólar cripto) y
  criptoya con audiencia y SEO; el diferencial (neto por riel) es angosto y copiable; el uso es 0–2 veces al año; el
  input decisivo (spread de salida) no es observable de antemano; los referidos rompen la neutralidad; y compite con
  el foco P1. **Se degrada de "construir" a "opción explícita del dueño"**, con las alternativas del Challenger
  (no construir · tabla interna de rieles vigentes · insight en el Panel del Dueño si un tenant lo pide).
- **BTC 15 min:** se sostiene el "no se construye", pero el tono categórico queda condicionado a **correr el backtest
  real en desktop** (viabilidad §8), y se cierra explícitamente la grieta "futuros maker": sumando no-fill, impuestos
  por trade, downtime e infraestructura, tampoco pasa la vara. No hay edge accesible para GSG hoy.

**Objeciones no aceptadas (o matizadas):**
- "Peras con manzanas" en la fila USDT→pesos: cierto, pero está marcada como equivalente de poder de compra y con
  fricción alta; se mantiene como referencia, no como recomendación.
- "No encaja en Grow ni en Digital": el **análisis** sí es de Grow (ahorro propio del grupo en cobros del exterior);
  lo que no encaja es la **app pública**. Se separa: el análisis queda; la app se decide aparte.

**Recomendación del PMO al dueño (síntesis, a confirmar por vos):**
1. **Cerrar el frente con los análisis como entregable** + mantener una **tabla interna de rieles vigentes** (alternativa 2
   del Challenger) que la célula `analista-fx-cripto` actualiza cuando cambie una comisión o la prima cruce 0,9 %.
   Costo cero real, sin superficie pública.
2. ~~**No construir la app pública ni el bot de 15 min.**~~ **Superada por la decisión del dueño del 2026-09-02
   ("avanza")**: la fase 1 demo se construyó a costo cero (ver rastro arriba). Sigue vigente: **no hay bot de 15 min**, y
   si un tenant real la pide, la lógica va como insight del Panel del Dueño (alternativa 3). Pendiente: una línea de
   confirmación del dueño de que asume el trade-off contra P1 (el Gate lo pide como O-14).
3. **Vos, con plata del grupo:** consultar al contador el punto de Ganancias antes de repetir el riel Lemon, y mirar el
   spread final en la app en cada operación. Ninguna célula toca fondos (§C).
4. **BTC:** correr `node scripts/btc-15m-backtest.mjs --source binance --days 365` en desktop (15 min); si no pasa la
   vara pre-registrada, se archiva el tema con la lección.

— Elaborado por Gestión Studio Grow (GSG) · Mesa Cripto · PMO de sesión
