---
id: MP-8
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-8] Sin red de tests, la lógica regresiona

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> la lógica de **mayor riesgo** (reserva/fiscal/retención/tenant) va **con tests**; verde antes de commitear.

**Lección:** `tsc` no protege la **lógica de negocio**.

## Detalle

- **Síntoma:** no había **ningún test automatizado**; solo `tsc`+build+preview.
- **Causa raíz:** la lógica de dominio no estaba protegida contra regresiones.
- **Fix:** harness **`node:test` + `tsx`** (cero deps nuevas), tests al lado del código, lógica pura/mockeada.
- **Lección:** `tsc` no protege la **lógica de negocio**.
- **Guardarraíl:** la lógica de **mayor riesgo** (reserva/fiscal/retención/tenant) va **con tests**; verde antes de commitear.
- **Refs:** ADR-026.

## Decisiones relacionadas

- [ADR-026](../30-decisiones/ADR-026.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
