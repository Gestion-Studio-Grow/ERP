---
id: MT-5
categoria: MT
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mt]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MT-5] Índices compuestos que no rendían

**Categoría:** Multi-tenant

> 🛡️ **Guardarraíl (la regla verificable):**
> toda query con predicado `tenantId` / `tenantTransaction`; RLS enforced en prod (Gate 2).

**Lección:** **RLS no es solo aislamiento: también es performance** (fuerza el predicado).

## Detalle

- **Síntoma:** queries de agenda/dashboard/reportes lentas pese a los índices que lideran con `tenantId`.
- **Causa raíz:** las queries **no filtraban por `tenantId`** → el índice compuesto no se enciende.
- **Fix:** activar **RLS**, que **inyecta el predicado** `tenantId` y enciende los índices.
- **Lección:** **RLS no es solo aislamiento: también es performance** (fuerza el predicado).
- **Guardarraíl:** toda query con predicado `tenantId` / `tenantTransaction`; RLS enforced en prod (Gate 2).
- **Refs:** ADR-023, ADR-018.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
