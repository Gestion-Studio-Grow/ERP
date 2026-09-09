# 🏦 Mesa de Dinero — consola de falsación

> ## ⚠️ Advertencia honesta, antes que nada
> **Esto NO promete rentabilidad. Mide si existe.**
> No es un bot de arbitraje. Es una **máquina para matar estrategias con datos reales**: toma el spread
> bruto que cualquiera vería mirando dos pantallas, le resta el **modelo de costos completo** (comisiones,
> slippage por profundidad, retiro, riesgo de traslado, impuesto) y vuelve a chequear a los N ms si la
> oportunidad sigue viva. Si la respuesta es "casi ninguna sobrevive", **ese es el resultado valioso** —
> te ahorra plata en vez de prometértela.
>
> **Nunca opera.** Solo market data público. Sin API keys, sin órdenes, sin endpoints privados. Modo papel
> exclusivo. Operar con plata real es irreversible y **lo decide el dueño**, no esta consola
> (`src/ejecucion.mjs` lanza error a propósito).

## Los tres números que importan

| Métrica | Qué es |
|---|---|
| 🎯 **Tasa de supervivencia** | oportunidades con neto positivo ÷ oportunidades brutas observadas (bruto > 0) |
| 👻 **Tasa de fantasma** | de las **efímeras** (spot cruzado, triangular, cruce ARS) que sobrevivieron, cuántas desaparecen al re-chequear a los N ms. Funding y rulo oficial viven horas/días: no entran |
| 🧱 **Piso de costo vs spread bruto** | siempre lado a lado; si el piso es más alto, no hay nada que discutir |

El veredicto por oportunidad es **🟢 sobrevive / 🟡 marginal / 🔴 muere**. No hay "señal de compra".

## Cómo se corre

Node 22+. **Cero dependencias** (`fetch` nativo, `node:http`, `node:test`, `node:fs`). No hay nada que instalar.

```bash
cd productos/mesa-de-dinero
npm test                 # node --test test/  — pasa 100 % offline, con fixtures
npm run scan             # una pasada: observa → costos → re-chequeo → registro
npm run watch            # continuo, cada 10 s (Ctrl+C para cortar)
npm run serve            # consola web en http://localhost:8787
npm run reporte          # estadística acumulada del JSONL
```

Opciones del CLI (`node bin/mesa.mjs ayuda`):

```
--nocional 100,1000,10000      nocionales en USD
--par BTC/USDT,ETH/USDT        pares (default: BTC/USDT, ETH/USDT, SOL/USDT, ETH/BTC)
--exchange binance,kraken      venues (default: binance, kraken, bybit, okx, coinbase)
--estrategia cex-cex,funding   cex-cex · triangular · funding · ars
--recheck 500                  ms hasta el re-chequeo (tasa de fantasma)
--fixtures | --red             forzar fixtures / forzar red sin fallback
--sin-registro | --registro <ruta.jsonl> | --json
```

### Sin salida de red

Si el `fetch` falla (proxy, firewall, sin internet), la consola **lo avisa una vez** —
`sin salida de red (...): corriendo con fixtures` — y sigue con los snapshots de `test/fixtures/`.
Los fixtures son **sintéticos con forma realista** (mid, spread propio, profundidad que crece con la
distancia al top, desvíos cross-exchange deliberados) y tienen dos instantes: `t0` (observación) y
`t1` (re-chequeo) para poder medir fantasmas offline. Se regeneran con `npm run fixtures`.

Los endpoints públicos exactos están documentados en `src/exchanges.mjs` para probarlos con `curl`
en una máquina con salida a internet.

## Qué mide cada estrategia

- **`cex-cex`** — spot cruzado entre exchanges. Resta taker compra + taker venta + retiro USDT (TRC20
  ≈ USD 1) + slippage por profundidad + riesgo de precio durante el traslado (1σ de la vol realizada
  escalada a la duración del retiro). Supuesto: inventario pre-posicionado y rebalanceo en USDT; sin
  inventario es **peor** que lo modelado.
- **`triangular`** — tres patas dentro de un mismo venue, ambos ciclos, 3 taker, sin retiro.
- **`funding`** — cash & carry (spot largo + perpetuo corto). Muestra el **período de break-even** =
  round-trip ÷ funding diario. Referencia: 0,28 % ÷ (0,01 %×3) ≈ **9,3 días**. Advertencia fija: el
  funding no es fijo; si se da vuelta, la posición paga.
- **`ars`** — dos variantes. **(a) cruce** USDT/ARS entre plataformas argentinas (formato de
  `criptoya.com/api/usdt/ars/<monto>`): `bruto` = precios publicados; las comisiones ocultas salen de la
  diferencia con `totalAsk/totalBid`. **(b) rulo oficial** (BNA → USD → exchange → vender USDT → ARS), la
  única que `docs/ANALISIS-FACTIBILIDAD.md` dejó en pista: `bruto` = premium del mejor bid vs BNA venta,
  menos fricción del ciclo y riesgo de que el premium se mueva en las 24–48 h del riel. Sus **SIN VERIFICAR**
  (transferencia USD, DDJJ Com. "A" 8336, impuesto al cheque) van explícitos en `detalle.advertencias` y
  **no habilitan capital**. El brief dice premium ≈ 0 % en 2026; la foto del 08/09 dijo +2,6/+3,2 %: por eso
  la consola lo mide en vez de asumirlo.

## Profundidad: lo más importante

`src/profundidad.mjs` calcula el **VWAP ejecutable** barriendo el libro para un nocional dado, y el
slippage contra el top-of-book. La consola siempre muestra **spread top-of-book vs spread ejecutable a
USD X**, y la curva de cómo el segundo se derrumba cuando sube el nocional. El error #1 del arbitraje
amateur es mirar el mejor bid/ask como si tuviera tamaño infinito.

## Modelo de costos (2026, con fuente en `src/costos.mjs`)

**Fuente de registro: `docs/MODELO-DE-COSTOS.md`** (tabla de fricciones con fuente y fecha, corte 08/09/2026).
Binance spot taker 0,10 % (0,075 % con BNB) · futuros USDT-M maker 0,02 % / taker 0,05 % · retiro USDT TRC20
≈ USD 1 (OKX 2,6) · Kraken Pro tier base taker 0,40 % (post 09/07/2026; conflicto de fuentes, conservador) ·
OKX/Bybit taker 0,10 % · Coinbase Advanced taker 0,60 % · exchanges argentinos 3,5 %–8 % todo incluido (rango
del brief; los puntos medidos el 08/09 dan 0,6–2,5 %) · vida útil de un spread cross-exchange 200–800 ms ·
impuesto AR 15 % sobre ganancia neta (personas humanas residentes). Lo marcado **SIN VERIFICAR** en el doc
se marca igual en el código y lo tiene que medir esta consola (`docs/ANALISIS-FACTIBILIDAD.md §7`).

## Evidencia

Cada observación queda en `datos/observaciones.jsonl` (append-only): bruto, costos desagregados, neto,
veredicto y resultado del re-chequeo. `npm run reporte` acumula. Sin log no hay validación.

## Estructura

```
bin/mesa.mjs             CLI: scan · watch · serve · reporte
src/costos.mjs           modelo de costos (con fuentes)
src/profundidad.mjs      VWAP ejecutable, slippage, curva de derrumbe
src/exchanges.mjs        conectores públicos: Binance, Kraken, Bybit, OKX, Coinbase (+ criptoya ARS)
src/estrategias/         cex-cex · triangular · funding · ars
src/motor.mjs            motor de falsación: evaluar → re-chequear → estadística
src/registro.mjs         JSONL append-only + estadística acumulada
src/servidor.mjs         consola web con node:http
src/consola.html         UI accesible, responsive, tema claro/oscuro
src/ejecucion.mjs        stub: operar lanza error (requiere OK del dueño)
test/                    node:test, 100 % offline
docs/                    MODELO-DE-COSTOS (fuente de registro) · ANALISIS-FACTIBILIDAD (§7 = contrato) · RED-TEAM
```

## Tests

`npm test`. Incluye el caso que documenta la verdad incómoda: **un spread bruto de 0,15 % queda
negativo tras costos**, y el caso de fantasma: con costos en cero el mismo spread sobrevive en t0 y
desaparece en t1.

— Elaborado por GSG · Gestión Studio Grow
