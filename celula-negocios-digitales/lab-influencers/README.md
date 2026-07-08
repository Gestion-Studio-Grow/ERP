# 🧪 Lab Influencers & Creadores — célula de oportunidades (GSG)

**Qué es:** célula del sector **Agencia Digital** (satélite del ERP) dedicada a encontrar
**oportunidades de automatización y puntos de dolor** del segmento **influencers / community
managers / creativos** (Argentina y LATAM hispano), con un **motor cíclico multi-agente** que
acumula propuestas priorizadas en un **dashboard local**.

Presta el patrón del GSG Lab (`../MOTOR-SPRINT-CICLICO.md`) — no duplica estructura (ADR-053).

## La célula (5 agentes, capa Sonnet — ADR economía)

| Agente | Lente | Qué aporta |
|---|---|---|
| 🎨 **Creativo** | ideación lateral | dolores que nadie ataca, ángulos frescos, tono humano/criollo |
| 📊 **Analítico** | rigor de negocio | dolor frecuente + disposición a pagar + números que cierran |
| 💻 **Dev** | factibilidad técnica | automatización barata HOY, apalancando ERP/storefront/MP/WhatsApp |
| 🖌️ **Diseñador experto** | UX/entregable visual | media kits, portfolios, reportes para marcas, lo que compra el ojo |
| 🇦🇷 **Analista de mercado local** | realidad argentina | tarifas en pesos, MP/monotributo/ARCA, hábitos, competencia |

Los 5 corren **etiquetados en Sonnet 5** (subagentes nunca heredan Opus). Zona de de-sesgo
(ADR-046): propuestas/copy = humano-criollo; scoring y costos = estándar/preciso.

## El ciclo (cada corrida = 1 ronda; el flujo es cíclico)

```
        ┌────────────────────────────────────────────────────┐
        │  GENERACIÓN — los 5 agentes proponen oportunidades │
        └──────────────────────┬─────────────────────────────┘
                               ▼
        ┌────────────────────────────────────────────────────┐
        │  MEJORA v2 — cada propuesta la mejora una LENTE    │
        │  CRUZADA (rol distinto del autor)                  │
        └──────────────────────┬─────────────────────────────┘
                               ▼
        ┌────────────────────────────────────────────────────┐
        │  MEJORA v3 + SCORE — Analítico+Mercado validan,    │
        │  achican al MVP vendible y puntúan (ICE + costos)  │
        └──────────────────────┬─────────────────────────────┘
                               ▼
        ┌────────────────────────────────────────────────────┐
        │  DASHBOARD — las v3 se ACUMULAN en data.js;        │
        │  la ronda siguiente arranca sabiendo qué ya existe │
        │  (anti-duplicados) ──────────────► vuelve a GENERAR│
        └────────────────────────────────────────────────────┘
```

**Regla dura del ciclo:** toda propuesta pasa **2 veces por mejora** (v1 → v2 → v3) antes de
entrar al dashboard. Nada se acumula en v1.

**Regla de costos (del dueño):** el trabajo que puede hacer la IA se computa a **$0 — no se
contempla**. `costoHumanoUSD` y `horasHumanas` cubren solo trabajo humano + infra paga.

## El dashboard (app local, costo cero)

- **Abrir:** doble clic en `dashboard.html` (no necesita server, DB ni red — no toca Neon).
- **Datos:** `data.js` (`window.LAB_DATA`) — acumulativo; cada ronda **appendea** en
  `oportunidades[]` y registra su entrada en `rondas[]`. Nunca pisa rondas previas.
- **Métricas:** total por ronda/segmento/categoría de dolor · **score ICE**
  (impacto × confianza ÷ esfuerzo) · ranking priorizado · costo humano y horas (IA = $0) ·
  % automatizable por IA · días a MVP · trazabilidad del ciclo v1→v2→v3 por propuesta
  (clic en la fila).

## Cómo correr otra ronda

Desde una sesión Claude Code sobre este repo (ejecución en Sonnet):

1. Tomar el script del motor: `docs/`… no — vive junto a esta célula en
   **`motor-ronda.workflow.js`** (mismo directorio).
2. Invocar el Workflow con `scriptPath` apuntando a ese archivo y `args`:
   `{ "ronda": <N+1>, "ideasPorAgente": 1..2, "titulosExistentes": [<títulos ya en data.js>] }`
   — los títulos existentes son el **anti-duplicado** del ciclo.
3. Al terminar, **appendear** las propuestas devueltas a `data.js` (respetando el shape
   existente) y sumar la ronda a `rondas[]`.
4. Commit + push a la rama de trabajo. **El Gate de Excelencia en Opus** aplica recién si algo
   de esto se integra a `main`.

## 🖊️ Afinado por el mejor equipo (Opus + mercado) — 2ª capa

Sobre las propuestas que ya pasaron el ciclo, corre un **motor de afinado** (`afinar-lapiz.workflow.js`)
con **el mejor equipo en Opus 4.8** (alto juicio: plata, mercado, estrategia → norma §2/§3). Por cada
**cluster de mercado**:
- **2 corroboradores** (Opus + WebSearch): **mercado local (AR/LATAM)** y **mercado global** —
  competidores reales, precios, tamaño, disposición a pagar, tendencia, **con fuentes citadas (URLs)**.
- **Afinador senior** por propuesta: re-calibra scores con la evidencia, escribe **pasos a producción
  detallados** (con sus gates), estima el **costo con devs humanos** (contraste) vs el costo real con
  IA (**dev = $0, no se contempla**; solo infra), y las **métricas para el dueño** (precio sugerido,
  margen, COGS, clientes para US$5k/mes, primer peso, payback, TAM local/global) + un **veredicto**
  (validado / herido / descartado).
- **Net-new:** si el mercado revela un hueco claro, el equipo **dispara oportunidades nuevas**
  (`origen: afinado-nuevo`) con el mismo nivel de detalle.

La salida se **fusiona en `data.js`** (campo `enr` por propuesta) y alimenta el **explorador**
(`explorador.html`): titular *"esto te hubiese costado US$X con devs humanos"*, métricas de dueño,
pasos a producción numerados y mercado local+global con fuentes clicables.

## Estados y gobernanza

- Las oportunidades del dashboard son **preventa/ideación** — fase DEMO del ciclo
  DEMO → VENTA → INVERSIÓN: **cero gasto** hasta que el dueño elija y haya venta.
- Construir cualquiera de estas oportunidades = trabajo de los **Desarrolladores del sector**
  recién **después** de validación (FUNDAMENTO del sector, Equipo 2) y con OK del dueño.
- Definir ≠ instanciar: la célula solo corre con tarea asignada; entre rondas queda documentada
  acá (roster/pool, ADR-053).

— Elaborado por GSG
