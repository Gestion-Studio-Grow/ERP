---
id: ADR-037
nivel: evolutiva
dominio: [Producto]
depends_on: [ADR-028]
---
# ADR-037: WhatsApp CTA sin placeholder — prompt just-in-time + helper único `whatsapp-cta`

**Estado:** Aceptado (2026-07-06) — implementado (helper único + fix del CTA roto de adosmanos)
**Fecha:** 2026-07-06
**Depende de:** ADR-028 (modelo de entrega — vitrinas)
**Relacionado:** unidad Agencia Digital (wa-intent / wa-provider / wa-dispatch)

---

## Contexto
Los CTA de WhatsApp con **número/placeholder hardcodeado** se rompen (caso real: el **CTA de WhatsApp roto
de adosmanos**) y, además, la lógica de armar el link `wa.me`/intent se **duplicaba** en cada vitrina, con
variantes divergentes.

## Decisión
- **(a) Nada de placeholder de WhatsApp en el front:** si falta el número/dato, **no** se deja un CTA
  roto/inventado — se **pide just-in-time** (prompt en el momento de necesitarlo). Un CTA sin dato real no
  se publica.
- **(b) Helper único `whatsapp-cta`:** una sola función centraliza la construcción del link/intent de
  WhatsApp; las vitrinas la consumen en vez de repetir la lógica.

## Consecuencias
- **(+)** **CTAs que no quedan rotos** y **una sola fuente de verdad** para el link de WhatsApp (fácil de
  corregir/evolucionar en un solo lugar).
- **(−)** Hay que **migrar** las vitrinas existentes al helper (deuda acotada).
- **Toca:** helper `whatsapp-cta`, vitrinas/previews (adosmanos y demás). Se relaciona con las capas
  `wa-intent`/`wa-provider`/`wa-dispatch` de la unidad Digital (el helper es el lado vitrina).

## Estado
**Aceptado — implementado.** Helper único en uso + reparación del CTA roto de adosmanos.
