# ADR-035: Consultor → Backoffice — la recomendación del consultor precede y determina el backoffice adaptado por rubro

**Estado:** Aceptado (2026-07-06) — implementado (fixtures del sandbox por rubro/familia)
**Depende de:** ADR-002 (blueprints = config), ADR-034 (preset por IA)
**Relacionado:** ADR-031 (demo navegable), ADR-028 (modelo de entrega)

---

## Contexto
Un backoffice **genérico** no sirve igual a rubros distintos (estética con turnos ≠ retail/tienda ≠
carnicería con venta por peso). El valor está en un **backoffice adaptado a cómo opera cada negocio**.
Faltaba decidir **quién determina** esa adaptación y en qué orden.

## Decisión
La secuencia es **CONSULTOR → BACKOFFICE**: **primero** el **consultor** (análisis del negocio/rubro)
define **qué necesita** ese negocio; esa **recomendación configura el backoffice** adaptado por rubro
(fixtures / blueprint / capabilities por rubro-familia), **no al revés**. El backoffice no arranca genérico
para después "ver qué falta": nace determinado por la recomendación del consultor.

## Consecuencias
- **(+)** Backoffice **pertinente por rubro** desde el arranque, no talle único; el consultor es el
  **input de diseño** del backoffice.
- **(+)** Encaja con el preset por IA (ADR-034): la ingesta alimenta al consultor, que determina el
  backoffice.
- **(−)** Agrega un **paso de consultoría** antes de servir el backoffice (mayor juicio arriba, correcto
  para la capa Opus de ADR-032).
- **Toca:** fixtures del sandbox por **rubro/familia** (`src/app/demo/*`), blueprints.

## Estado
**Aceptado — implementado** (CONSULTOR → BACKOFFICE, fixtures del sandbox por rubro/familia).
