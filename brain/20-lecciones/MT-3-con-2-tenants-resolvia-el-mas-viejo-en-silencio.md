---
id: MT-3
categoria: MT
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mt]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MT-3] Con 2 tenants, resolvía "el más viejo" en silencio

**Categoría:** Multi-tenant

> 🛡️ **Guardarraíl (la regla verificable):**
> resolución de tenant **fail-closed**; el alta del 2º tenant **dispara RLS** (Gate).

**Lección:** sin RLS, "no hay 2º tenant" es una **precondición de seguridad**; se **afirma con un assert ruidoso**, no se asume.

## Detalle

- **Síntoma:** una 2ª fila en `Tenant` haría que todo el tráfico leyera/escribiera el tenant equivocado.
- **Causa raíz:** `getCurrentTenantId()` hacía `findFirstOrThrow(orderBy asc)` + cache.
- **Fix:** **fail-closed** — `throw` si hay ≠ 1 tenant.
- **Lección:** sin RLS, "no hay 2º tenant" es una **precondición de seguridad**; se **afirma con un assert ruidoso**, no se asume.
- **Guardarraíl:** resolución de tenant **fail-closed**; el alta del 2º tenant **dispara RLS** (Gate).
- **Refs:** ADR-015, ADR-018.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
