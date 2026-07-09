---
id: C-002
titulo: Arquitectura
nivel: constitucional
tipo: indice-puntero-inmutable
apunta_a: [ADR-001, ADR-002, ADR-005, ADR-018]
---

# C-002 · Arquitectura

> **Índice-puntero INMUTABLE (Nivel 0).** Cristaliza lo no-negociable de la **arquitectura**. **No reescribe** los
> ADR — apunta a ellos (el razonamiento, las alternativas y el "impacto a 5-10 años" viven en el ADR completo,
> H1). Enmienda: Advisory → Challenger (ADR-045) → OK dueño ([README](README.md)).

## Fuente de verdad (leer el cuerpo completo ahí)
- **ADR-001** (`multi-tenant-strategy`) — el "ADR para PENSAR": problema → alternativas evaluadas → §12 impacto a
  5-10 años. Decisión: **shared schema + `tenant_id` + Row-Level Security de Postgres**; escape a schema/DB
  dedicado solo para enterprise puntuales. **No aplanar a "usamos RLS": el valor es el razonamiento** (H1).
- **ADR-002** (`core-blueprints-plugins`) — **Core / Blueprint / Plugin**: Blueprints = **configuración pura,
  cero schema propio**; Plugins hablan por **eventos asíncronos con outbox**, **nunca acceso directo** a datos
  del Core.
- **ADR-005** (`stack-tecnico`) — Postgres + Next.js/TypeScript + workers; auth propio, no vendor; monolito hasta
  que la escala duela.
- **ADR-018** (`activacion-rls-postgres`) — el mecanismo y el momento del backstop de aislamiento (RLS por
  `tenant_id`, `SET LOCAL` por transacción, rol sin `BYPASSRLS`).

## Lo no-negociable (cristalizado)
1. **Aislamiento multi-tenant** shared-schema + `tenant_id` + **RLS enforced** (rol app sin BYPASSRLS). El
   aislamiento **no se negocia**; la resolución de tenant es **fail-closed** (ADR-015).
2. **Core / Blueprint / Plugin**: el rubro es config (Blueprint), no fork; los Plugins se comunican por
   eventos/outbox, nunca tocan datos del Core directo.
3. **Stack**: Postgres como base (RLS/constraints lo exigen), Next.js/TS, auth propio.
4. **IDs de ADR INMUTABLES** (RFC-001 R1): nunca renumerar/mover; nivel/dominio por frontmatter, agrupación por
   vista del INDEX + `graph.json`.

## Cómo se enmienda
Advisory → Challenger (ADR-045) → OK del dueño → edición **aditiva** ([README](README.md)).

_Enmiendas: (ninguna todavía)._
