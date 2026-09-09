# 💰 Mesa de Dinero — charter operativo

> **Qué es:** la célula de GSG que investiga si existe **rentabilidad real** por inversiones o arbitrajes,
> y que **le contesta al dueño con evidencia medida, no con promesas**.
>
> **Qué NO es:** un bot de trading. La mesa **no opera**. Su producto es un veredicto sobre si una
> estrategia sobrevive a la aritmética; el capital real lo habilita el dueño, después de la evidencia.
>
> **Estado:** activa en modo investigación (papel) · **Fecha:** 2026-09-09

---

## 1. Por qué existe, y por qué está construida al revés de lo obvio

Lo obvio —y lo que un modelo de lenguaje entrega por default— es un *arbitrage bot*: detecta un spread,
promete que escala, y se entusiasma. Ese producto ya existe, es gratis, y **no funciona**: los spreads
entre exchanges grandes viven entre 200 y 800 ms y los comprimen firmas con colocación y feeds directos.
Lo que ves en una API REST pública ya pasó.

La mesa está construida al revés. Su pieza central no es un detector de oportunidades: es una **consola de
falsación** (`productos/mesa-de-dinero/`) cuyo trabajo es **matar** estrategias con datos reales. La
métrica titular no es "cuánto encontré", es:

| Métrica | Qué contesta |
|---|---|
| **Tasa de supervivencia** | De cada 100 oportunidades brutas, ¿cuántas quedan netas positivas? |
| **Tasa de fantasma** | ¿Cuántas seguían ahí al re-chequear 200–800 ms después? |
| **Spread ejecutable vs nocional** | ¿A cuántos dólares se derrumba la ganancia al barrer el libro? |

**Un ciclo que concluye "ninguna estrategia sobrevive" es un ciclo exitoso.** Es plata no perdida, y es
la respuesta que el dueño necesita para decidir.

## 2. La regla fundacional (no negociable)

> **Una estrategia no existe hasta que sobrevivió al modelo de costos completo con datos reales medidos,
> registrados y re-chequeados.** Antes de eso es una hipótesis, y una hipótesis no recibe capital.

Encaja directo con el ciclo **DEMO → VENTA → INVERSIÓN** de `CLAUDE.md`: hasta que hay evidencia, todo es
demo a costo cero y solo lectura. El capital es **inversión post-evidencia**, nunca antes.

## 3. Roster y capa de modelo

La asignación sigue el criterio de `CLAUDE.md` §2 — *"¿un error acá es caro o difícil de revertir, o toca
seguridad, plata, arquitectura?"*. En esta mesa **casi todo toca plata y casi todo es irreversible**, así
que el centro de gravedad está en Opus, al revés que en el resto de la factory.

| Agente | Capa | Función | Por qué esa capa |
|---|---|---|---|
| 🎯 **mesa-dinero-orquestador** | **Opus** | Jefe de mesa. Coordina el ciclo y es el único que reporta al dueño. | Decide qué se eleva; una orden ejecutada no se deshace. |
| 💸 **mesa-costos** | **Opus** | El piso de fricción: fees, slippage por profundidad, retiros, rieles ARS, impuestos. | **Es donde se pierde la plata.** Un fee mal cargado da vuelta el signo del resultado. |
| ⚠️ **mesa-riesgo** | **Opus** | Límites, kill switch, escenario de ruina, contraparte. Tiene **veto**. | La pérdida de capital es irreversible y el error de riesgo es silencioso. |
| ⚔️ **mesa-falsacion** | **Opus** SIEMPRE | Intenta matar cada estrategia. Ninguna se eleva sin su dictamen. | Es el Gate de la mesa: **no se degrada de modelo**, ni en modo `economia` (misma lógica que §3). |
| 🧮 **mesa-cuant** | Sonnet | Formula la estrategia y su **tesis de edge**. | Formular es barato y reversible; si la hipótesis es mala la mata la falsación. |
| 🔌 **mesa-datos** | Sonnet | Conectores de solo lectura, normalización de libros, registro. | Cableado acotado y reversible. |

### Prestados del pool (ADR-053 — se prestan, NO se duplican)
`cobro-fiscal` (ARCA/Ganancias sobre los resultados) · `seguridad` (custodia de claves, superficie de
ataque) · `challenger` (desafío estratégico al proyecto entero) · `auditoria-gsg-gate` (el Gate) ·
`finops-costo-uso` (cuánto cuesta correr la mesa). **Al cerrar el caso vuelven a su célula de origen** y
vuelcan lo aprendido al registro de lecciones (ADR-047).

> Regla dura aplicada: antes de instanciar un agente nuevo se verificó que el pool no lo cubriera. Los
> seis de arriba son nuevos porque **ningún rol existente cubre el modelo de fricción de mercado ni la
> falsación cuantitativa**; los cinco prestados no se duplicaron.

## 4. El ciclo de la mesa

1. **Hipótesis** (`mesa-cuant`) — la estrategia y, sobre todo, **por qué existiría esa ganancia y quién la
   está dejando sobre la mesa**. Sin respuesta concreta a eso, no se estudia: es ruido, no edge.
2. **Piso de costo** (`mesa-costos`) — la fricción completa, **calculada antes** de mirar la ganancia.
3. **Medición** — la consola corre contra market data real y registra en `datos/observaciones.jsonl`.
4. **Falsación** (`mesa-falsacion`) — el interrogatorio estándar. **No se saltea.**
5. **Riesgo** (`mesa-riesgo`) — límites y kill switch antes de cualquier vivo. Puede vetar.
6. **Veredicto** — 🟢 / 🟡 / 🔴 con el número que lo sostiene. El orquestador reporta al dueño.

## 5. Vallas duras

1. **Modo papel y solo lectura por default.** La consola no tiene capacidad de operar.
2. **Ningún peso de capital real sin OK escrito del dueño**, por estrategia (§C, irreversible).
3. **Claves de trading: jamás en el repo.** Permisos mínimos, **sin retiro habilitado**, IP restringida.
   Las pega el dueño, nunca el agente (FASE 2 de credenciales, `CLAUDE.md`).
4. **Sin log no hay evidencia.** Ningún veredicto se eleva sin N suficiente y ventana declarada.
5. **Cero dependencias npm** y **carpeta aislada**: la mesa no puede romper el build del ERP ni tocar prod.
6. **La mesa no compite por la plata del negocio.** Nunca capital que el dueño no pueda perder entero, y
   nunca prioridad por encima de P1 (demos que venden) según la regla de concurrencia de `CLAUDE.md`.

## 6. Dónde vive

| Cosa | Dónde |
|---|---|
| Agentes | `.claude/agents/mesa-*.md` |
| Consola de falsación | `productos/mesa-de-dinero/` (aislada, cero deps) |
| Análisis y veredictos | `productos/mesa-de-dinero/docs/` |
| Evidencia cruda | `productos/mesa-de-dinero/datos/observaciones.jsonl` |
| Este charter | `docs/organizacion/mesa-de-dinero.md` |

---

— Elaborado por GSG
