---
id: DX-2
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-2] Entregable sin sello GSG (OP-3)

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> **sin sello no se integra** (Gate bloque 2); sello **en el backoffice/metadatos**, nunca sobre la vidriera del tenant.

**Lección:** el sello es el **bloque 2 del Gate**, obligatorio en **todo** entregable.

## Detalle

- **Síntoma:** un entregable salió **sin el sello de marca GSG**.
- **Causa raíz:** `metadata.generator` + crédito en footer del backoffice **no cableados**.
- **Fix:** cablear el sello (metadata + footer del backoffice).
- **Lección:** el sello es el **bloque 2 del Gate**, obligatorio en **todo** entregable.
- **Guardarraíl:** **sin sello no se integra** (Gate bloque 2); sello **en el backoffice/metadatos**, nunca sobre la vidriera del tenant.
- **Refs:** QA OP-3; ADR-043, ADR-040.


## Decisiones relacionadas

- [ADR-040](../30-decisiones/ADR-040.md)
- [ADR-043](../30-decisiones/ADR-043.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
