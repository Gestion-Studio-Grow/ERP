---
id: C-001
titulo: Filosofía GSG
nivel: constitucional
tipo: indice-puntero-inmutable
apunta_a: [docs/FUNDAMENTOS-Y-VISION.md, docs/fundamentos/bases-gsg.md, ADR-008]
---

# C-001 · Filosofía GSG

> **Índice-puntero INMUTABLE (Nivel 0).** Cristaliza lo no-negociable de la **filosofía** de GSG. **No reescribe**
> los documentos madre — apunta a ellos, que siguen siendo la fuente de verdad. Para cambiar algo de acá:
> **flujo de enmienda** (Advisory → Challenger ADR-045 → OK dueño, ver [README](README.md)).

## Fuente de verdad (leer el cuerpo completo ahí)
- **`docs/FUNDAMENTOS-Y-VISION.md`** — la visión y el criterio rector (multi-tenant estilo SAP Public Cloud, un
  Core, cada cliente un tenant, Blueprint por rubro, Plugin transversal, la promesa de marca, la
  hiper-personalización de producto). §10 baja la filosofía GROW-AR; §11 el criterio de producto.
- **`docs/fundamentos/bases-gsg.md`** — las bases de GSG (incluye §7 pool/cross-training y §8 principio de variante).
- **ADR-008** (`optimizacion-tokens-claude`) — **meta-arquitectura**: *"reglas de trabajo con Claude para este
  proyecto"*, la semilla de que **la IA que construye también necesita arquitectura** (repo como memoria, INDEX
  como entrada, decisiones como ADR). Es el fundamento del que el RFC-001 es continuación directa (H2).

## Lo no-negociable (cristalizado)
1. **Un Core multi-tenant estilo SAP Public Cloud** — cada cliente es un tenant; el rubro entra por Blueprint
   (config), lo transversal por Plugin; **sin fork por cliente**.
2. **La promesa de marca** (`FUNDAMENTOS §2`): *"si tu modelo no está, lo solucionamos"* = te acomodamos sobre lo
   que ya existe (activar, no desarrollar a medida). Guardrail anti-consultora.
3. **Hiper-personalización de producto, no de discurso** — el negocio se siente suyo; es producto, no promesa.
4. **Argentinizar** (ver C-004/ADR-044): lo mejor de SAP, hablando como argentino.
5. **La IA que construye también necesita arquitectura** (ADR-008): repo como memoria, decisiones persistidas,
   contexto liviano — este principio gobierna cómo trabaja el equipo de agentes.

## Cómo se enmienda
Advisory → Challenger (ADR-045) → OK del dueño → edición **aditiva** (ver [README](README.md)). Registrar la
enmienda al pie.

_Enmiendas: (ninguna todavía)._
