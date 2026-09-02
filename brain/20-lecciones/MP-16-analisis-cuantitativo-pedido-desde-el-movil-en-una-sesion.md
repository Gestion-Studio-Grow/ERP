---
id: MP-16
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-16] Análisis cuantitativo pedido desde el móvil en una sesión remota con egress bloqueado

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> todo doc cuantitativo de la Mesa Cripto lleva (1) sección "Restricción del entorno" si faltó acceso, (2) fuente + fecha por cada número de mercado, (3) `⚠️ a verificar` en lo no confirmado, y (4) los criterios de decisión **fijados antes** de ver los resultados reales (vara pre-registrada, no ajustada al número).

**Lección:** un análisis con datos que no se pudieron obtener **vale si declara la restricción y deja el camino reproducible**; un análisis con datos fabricados o no fechados **no vale aunque el número "cierre"**.

## Detalle

- **Síntoma:** el dueño pidió evaluar rentabilidad de BTC en velas de 15 min y del riel Lemon USD→USDt; en la sesión
  remota el proxy bloquea Binance/Bybit/Kraken/Coinbase/OKX, los sitios de Lemon y `curl` saliente. No había forma
  de bajar OHLCV real ni de leer la ayuda oficial de la billetera.
- **Causa raíz:** la política de red de la sesión remota (claude.ai/code) no incluye APIs de mercado; el trabajo
  cuantitativo asumía internet libre. Tentación: "inventar" una serie o citar números de memoria como si fueran del día.
- **Fix:** se separó lo que **sí** se puede hacer sin datos vivos (modelo analítico de break-even con volatilidad
  publicada + simulación sintética **declarada** sin edge que mide solo el arrastre de costos) de lo que **no**
  (backtest real), y se dejó el backtester como **script reproducible** (`scripts/btc-15m-backtest.mjs`, cero
  dependencias, endpoints públicos) para correr en desktop en un comando. El doc lo dice en su §3.
- **Lección:** un análisis con datos que no se pudieron obtener **vale si declara la restricción y deja el camino
  reproducible**; un análisis con datos fabricados o no fechados **no vale aunque el número "cierre"**.
- **Guardarraíl:** todo doc cuantitativo de la Mesa Cripto lleva (1) sección "Restricción del entorno" si faltó
  acceso, (2) fuente + fecha por cada número de mercado, (3) `⚠️ a verificar` en lo no confirmado, y (4) los criterios
  de decisión **fijados antes** de ver los resultados reales (vara pre-registrada, no ajustada al número).
- **Refs:** `docs/sectores/agencia-grow/mesa-cripto/2026-09-02-btc-15m-viabilidad.md` §3/§8, ADR-030, ADR-046,
  ADR-052; charters `quant-trading` y `analista-fx-cripto`.


## Decisiones relacionadas

- [ADR-030](../30-decisiones/ADR-030.md)
- [ADR-046](../30-decisiones/ADR-046.md)
- [ADR-052](../30-decisiones/ADR-052.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
