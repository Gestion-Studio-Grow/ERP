# Agencia Grow — Avance: pantalla del Panel del Dueño (2026-07-06)

**Unidad:** Agencia Grow (negocios propios del grupo) · **Base:** `docs/sectores/agencia-grow.md` §3
(el Panel del Dueño es de Grow: BI de negocios propios, single-tenant) · **No toca prod, Neon ni
deploy** (build de compilación, sin ejecutar queries). Commiteado a `main`.

---

## Qué construí

Cablé los dos motores puros del Panel del Dueño (`owner-insights.ts` + `owner-trends.ts`) a una
**pantalla real** en `/admin/reportes`. Antes eran lógica testeada sin superficie; ahora el dueño ve
la **lectura de su negocio en lenguaje llano**, arriba de todo en Reportes (es el "wow", no un
apéndice).

- **Server Action `getOwnerPanelData(rangeDays)`** (`src/lib/actions.ts`): reúne, en **una sola query
  range-bounded** (Neon-friendly, se rebana en memoria), el dato para:
  - **Insights del período**: KPIs del período actual vs. el período previo de igual largo
    (comparación contra vos mismo — no requiere ADR-027 ni otros tenants).
  - **Tendencias multi-período**: buckets por mes calendario (zona del negocio), **excluyendo el mes
    en curso** (parcial, distorsiona), tomando los últimos meses completos con dato.
- **Componente `src/components/OwnerPanel.tsx`**: presentacional puro. Pinta insights (Badge por
  severidad: alerta/atención/dato/bien) y tendencias (flecha + tono por sentimiento), con copy honesto
  cuando falta período previo o no hay 3 meses para tendencia. Incluye el teaser del incremento
  cross-tenant (comparativa de rubro), que pertenece a Agencia Digital (ADR-027) y no se construye acá.
- **`/admin/reportes` (page.tsx)**: calcula `generateOwnerInsights(current, previous)` y
  `analyzeTrends(series)` con los motores puros y renderiza `<OwnerPanel/>`. La sección de KPIs y
  comisiones que ya existía queda intacta debajo.

## Verificación (vallas cumplidas)

- `tsc --noEmit` **0 errores** en todo el proyecto.
- **`npm run build` verde** — `/admin/reportes` compila (server/client boundary OK; el Panel es
  server component puro).
- Los motores ya tenían 20 tests (owner-insights 8 + owner-trends 12) en verde.
- No corrí preview en vivo a propósito: la pantalla consulta Neon y la consigna es no tocarlo; el
  build (compilación, no ejecución) es la valla correcta acá.

## Estado del producto

El Panel del Dueño pasa de "motores testeados sin pantalla" a **producto usable end-to-end**: el dueño
entra a Reportes y su negocio le habla. Pendiente opcional (otra sesión): umbrales de alerta
configurables por tenant (sería migración = Gate 2) y narrativa con LLM (hoy determinista, a propósito).
