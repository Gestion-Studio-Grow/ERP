---
id: MT-1
categoria: MT
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mt]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MT-1] Todos los tenants mostraban la marca de CH (J-2)

**Categoría:** Multi-tenant

> 🛡️ **Guardarraíl (la regla verificable):**
> **toda** query lleva predicado `tenantId`; **prohibido `findFirst` sin `where`**; RLS como backstop.

**Lección:** `findFirst`/`findFirstOrThrow` **sin predicado de tenant** es un **leak cross-tenant silencioso** (mismo patrón que ADR-015).

## Detalle

- **Síntoma:** `getTenantBrand` devolvía **CH** para cualquier tenant.
- **Causa raíz:** `findFirst` **sin `where`** → devuelve la **primera fila** (la más vieja = CH).
- **Fix:** agregar `where { tenantId }`.
- **Lección:** `findFirst`/`findFirstOrThrow` **sin predicado de tenant** es un **leak cross-tenant silencioso** (mismo patrón que ADR-015).
- **Guardarraíl:** **toda** query lleva predicado `tenantId`; **prohibido `findFirst` sin `where`**; RLS como backstop.
- **Refs:** QA J-2; ADR-015, ADR-018, ADR-023.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
