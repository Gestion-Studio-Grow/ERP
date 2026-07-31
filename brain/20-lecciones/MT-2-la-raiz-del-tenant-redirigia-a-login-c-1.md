---
id: MT-2
categoria: MT
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mt]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MT-2] La raíz del tenant redirigía a login (C-1)

**Categoría:** Multi-tenant

> 🛡️ **Guardarraíl (la regla verificable):**
> separar **data pública** de **data admin-gated** en las home de tenant; el Gate (role-based §1) lo chequea.

**Lección:** una **superficie pública** no puede depender de una acción **gateada por rol**.

## Detalle

- **Síntoma:** la home de CH hacía **redirect a login** en vez de mostrar la vidriera.
- **Causa raíz:** la raíz llamaba a **`getCatalog` admin-gated** (capability), no a la vista pública.
- **Fix:** la raíz usa la **vista pública**; login no-branded corregido (commit `21c70d0`).
- **Lección:** una **superficie pública** no puede depender de una acción **gateada por rol**.
- **Guardarraíl:** separar **data pública** de **data admin-gated** en las home de tenant; el Gate (role-based §1) lo chequea.
- **Refs:** QA C-1; ADR-040 (Gate, role-based).

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
