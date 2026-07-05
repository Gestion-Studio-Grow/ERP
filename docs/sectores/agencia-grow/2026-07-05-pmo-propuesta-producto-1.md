# PMO del sector — Propuesta de Producto #1 para Desarrolladores (2026-07-05)

**Autor:** PMO del sector Agencia (rol proactivo — `FUNDAMENTO.md` §1) · **Para:** equipo de
Desarrolladores · **Base:** los 3 análisis de mercado del sector + ADR-027 · **No toca prod ni Neon;
esto es la especificación/handoff, no la construcción.**

> **Decisión del PMO:** el primer producto a construir es el **"Panel del Dueño" — insights automáticos
> single-tenant** sobre el dato que el ERP **ya genera**. Es el **incremento no-gateado de la palanca #1**
> (analytics-producto): entrega valor **hoy**, con **cero dependencia** de la masa de tenants y **cero
> riesgo de privacidad** (no cruza tenants), y **doble propósito**: es un **tier premium vendible** del
> ERP **y** la **demo viva** con la que la Agencia vende el ERP online (visión go-to-market del
> `FUNDAMENTO.md`).

---

## 1. Por qué este primero (criterio del PMO)

Prioricé por **(palanca) × (construíble ya) × (sirve a los dos sectores) ÷ (riesgo/gate)**:

| Candidato | Palanca | ¿Construíble ya? | Sirve go-to-market | Gate/riesgo |
|---|---|---|---|---|
| **Panel del Dueño (analytics single-tenant)** | #1 (primer incremento) | ✅ **sí** — el dato ya existe (`report-kpis.ts`) | ✅ **demo viva** del ERP | 🟢 bajo (no cruza tenants; sin ADR-027) |
| Benchmarking cross-tenant | #1 (capa moat) | ❌ no — **necesita ≥5 tenants/cohorte** (hoy 2) | ✅ | 🔴 gate de masa + migración (ADR-027) |
| WhatsApp conversacional cableado al ERP | #2 | 🟡 parcial — depende de proveedor WA + port de notif | ✅ | 🟡 integración externa |
| Loop cerrado de conversiones (CAPI) | #5 | 🟡 — necesita el puente CAPI por tenant | 🟡 | 🟡 ADR propio pendiente |

**Ganador claro:** el Panel del Dueño. Es lo único que da **valor de la palanca #1 sin esperar nada** —
ni escala, ni proveedor externo, ni migración obligatoria si se mantiene de solo-lectura sobre datos
existentes. Y **arma la sinergia**: cuando la Agencia salga a vender el ERP online (go-to-market), este
panel es *el* argumento visual ("mirá los insights que te da tu negocio").

## 2. Qué es (alcance del MVP)

Un **tier/superficie de "insights automáticos"** en `/admin` que **lee el dato del propio tenant** (RLS
normal, sin cruzar a nadie) y lo convierte en **lectura de negocio en lenguaje llano**, no en otro
gráfico. Combate la *Metric Debt* (una sola definición canónica de cada métrica) que el análisis #2
señala como dolor del SMB.

**Incluye (MVP):**
- **Narrativa automática** sobre los KPIs que ya calcula el Core: *"Tu no-show subió 12% vs. el mes
  pasado", "Tu hora-silla más rentable es la de la tarde", "Tu ticket promedio viene plano hace 3
  meses"*. Reglas deterministas sobre los KPIs de `report-kpis.ts` (nada de LLM en el MVP: barato,
  explicable, testeable).
- **Comparación temporal** (mes vs. mes, período vs. período) — comparación **contra vos mismo**, que
  **no** requiere ADR-027 ni otros tenants.
- **Alertas de negocio** simples (umbral configurable): caída de ventas, suba de cancelaciones, stock
  crítico.
- **Enganche de venta:** el panel muestra un slot *"Comparativa de rubro — disponible cuando se active
  el benchmarking"* → teaser del incremento cross-tenant (ADR-027) sin construirlo aún.

**Deja afuera (fases siguientes):**
- Benchmarking cross-tenant → **ADR-027**, post-escala (≥5 tenants/cohorte).
- Narrativa con LLM → evaluar después (costo/latencia); el MVP es determinista.
- Export/scheduling avanzado → ya hay export CSV de reportes; se reutiliza.

## 3. Qué apalanca (no reinventar)

- **`src/lib/report-kpis.ts`** — KPIs profundos ya existentes (no-show, cancelación, ticket promedio,
  retención, rentabilidad hora-silla, mix de método de pago). La narrativa se computa **sobre esto**.
- **`/admin/reportes`** + export CSV ya construidos — el Panel es una **capa de lectura** encima, no un
  subsistema nuevo.
- **Lógica pura, testeable** — el generador de narrativa/alertas es una función pura
  `(kpisActuales, kpisPrevios, umbrales) → insights[]`, alineada con el patrón de tests del repo
  (ADR-026, `node:test` + `tsx`, sin tocar DB).

## 4. Vallas para los Desarrolladores (cuando lo tomen)

Esto es la **especificación**; construirlo es una **`/sesion-feature`** que debe cumplir:

- **Verde antes de commitear:** `tsc --noEmit` + `npm test` (tests nuevos de la lógica pura de insights)
  + `npm run build`, y **preview** de la pantalla del panel (regla de terminado, `METODO-ROLES.md` §3).
- **Sin cruzar tenants** — el MVP lee **solo** el dato del tenant actual por RLS; **nada** de agregación
  cross-tenant (eso es ADR-027, otra sesión, con su gate).
- **Sin migración si se puede** — MVP de solo-lectura sobre modelos existentes ⇒ idealmente **cero
  cambios de schema** (si hiciera falta persistir umbrales de alerta, esa migración es **Gate 2** y se
  pausa/reporta).
- **Cero deps nuevas** (economía de ADR-008); narrativa determinista, sin LLM en el MVP.
- **Aislado en worktree propio** (`1 frente = 1 worktree = 1 sesión`), entrega en su rama; el PMO
  integra.

## 5. Cómo se monetiza / encaja en los dos sectores

- **Sector ERP:** el Panel del Dueño es un **tier premium** del SaaS (upsell sobre la suscripción base) —
  ingreso recurrente, margen altísimo (el dato ya está).
- **Sector Agencia (go-to-market):** es la **demo viva** para vender el ERP online — la Agencia lo usa en
  ads/landing/contenido como el "wow" del producto ("tu negocio te habla"). Es la visión del
  `FUNDAMENTO.md` (la Agencia vende el propio producto) hecha material concreto y demostrable.

## 6. Handoff (qué queda para disparar)

1. **Kickoff de Desarrolladores** — `/sesion-feature Panel del Dueño (insights automáticos single-tenant)`
   con este doc como brief. Vallas de §4.
2. **En paralelo, Consultores** — relevamiento de campo del corredor Canning (reemplazar cifras
   provisionales del `2026-07-05-segmento-local-canning.md` §2) + 10 prospectos para el piloto de SEO
   local.
3. **Diferido a post-escala** — el benchmarking cross-tenant (ADR-027) se activa cuando la Agencia, como
   go-to-market, haya traído **≥5 tenants por cohorte**. El Panel queda listo para enchufarle esa capa.

> Nota de gobierno: el detalle de negocio de "cuánto sale el tier premium" es una decisión de **pricing**
> → su propio ADR (no lo fija esta propuesta). Acá el PMO fija **qué construir primero y por qué**.
