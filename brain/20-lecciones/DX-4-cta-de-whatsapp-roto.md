---
id: DX-4
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-4] CTA de WhatsApp roto

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> **cero placeholders de WhatsApp**; el link/intent sale del **helper único** (una fuente de verdad).

**Lección:** un placeholder inventado en el front queda roto en producción.

## Detalle

- **Síntoma:** el botón de WhatsApp de adosmanos estaba **roto**.
- **Causa raíz:** número/placeholder **hardcodeado** en el front.
- **Fix:** **prompt just-in-time** si falta el dato + **helper único** `whatsapp-cta`.
- **Lección:** un placeholder inventado en el front queda roto en producción.
- **Guardarraíl:** **cero placeholders de WhatsApp**; el link/intent sale del **helper único** (una fuente de verdad).
- **Refs:** ADR-037.

## Decisiones relacionadas

- [ADR-037](../30-decisiones/ADR-037.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
