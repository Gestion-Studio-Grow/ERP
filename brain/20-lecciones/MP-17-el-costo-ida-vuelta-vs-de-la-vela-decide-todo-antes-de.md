---
id: MP-17
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-17] El costo ida+vuelta vs. σ de la vela decide todo, antes de mirar un solo indicador

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> todo análisis de estrategia de trading en timeframe intradiario abre con la tabla costo-ida+vuelta-por-exchange vs. σ-por-vela **antes** de tocar un indicador; si el costo supera ~0,25σ-1σ se lo dice explícito y se corta ahí (charter `quant-trading`, paso "costos primero").

**Lección:** en timeframes cortos (≤15 min) el costo de ejecución domina el resultado mucho más que la calidad del indicador — evaluar "¿qué estrategia uso?" antes de "¿el costo cabe en la volatilidad de la vela?" es empezar por el paso equivocado y lleva a horas de backtest sobre una premisa ya perdida.

## Detalle

- **Síntoma:** el dueño preguntó si "BTC en velas de 15 min" puede dar rentabilidad hoy — la tentación
  natural es arrancar comparando indicadores (EMA, RSI, Bollinger) o buscando "la estrategia que funciona".
- **Causa raíz:** sin fijar primero el costo real de operar (comisión+spread+funding del exchange concreto)
  contra la volatilidad típica de una sola vela (σ), cualquier resultado de indicador es ruido — el filtro
  que importa (costo/σ) nunca se aplicó.
- **Fix:** se calculó σ_15min = σ_anual / √(365×96) ≈ 0,17%-0,23% con la vol realizada 2026 (30/90/365d) y se
  comparó contra el costo ida+vuelta de cada exchange accesible desde Argentina (0,04% en futuros-maker de
  Binance/Bybit/OKX hasta 1-4% en apps AR) — solo maker en futuros queda por debajo de 0,25σ; todo el resto
  arranca perdiendo antes de la primera señal. Se cruzó contra backtests públicos con costos reales
  (CoinQuant: RSI scalping 92 trades/−16,88%, EMA 21/55 25 trades/−6,5%) que confirman el patrón.
- **Lección:** en timeframes cortos (≤15 min) el costo de ejecución domina el resultado mucho más que la
  calidad del indicador — evaluar "¿qué estrategia uso?" antes de "¿el costo cabe en la volatilidad de la
  vela?" es empezar por el paso equivocado y lleva a horas de backtest sobre una premisa ya perdida.
- **Guardarraíl:** todo análisis de estrategia de trading en timeframe intradiario abre con la tabla
  costo-ida+vuelta-por-exchange vs. σ-por-vela **antes** de tocar un indicador; si el costo supera ~0,25σ-1σ
  se lo dice explícito y se corta ahí (charter `quant-trading`, paso "costos primero").
- **Refs:** `docs/sectores/agencia-grow/mesa-cripto/2026-09-02-btc-15m-investigacion-mercado.md` §3/§4/§8,
  ADR-046 (zona estándar/precisa para análisis cuantitativo), ADR-052; charter `quant-trading`.



## Decisiones relacionadas

- [ADR-046](../30-decisiones/ADR-046.md)
- [ADR-052](../30-decisiones/ADR-052.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
