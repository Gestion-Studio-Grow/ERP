---
id: DX-3
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-3] Confundir la lámina estática con el producto

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> el entregable **es la app real**; no mantener láminas paralelas; retirar el preview al servir el producto real.

**Lección:** un artefacto paralelo al producto **miente** y se desincroniza.

## Detalle

- **Síntoma:** `public/previews/*` estáticos se trataban como el entregable del negocio.
- **Causa raíz:** los previews estáticos eran un stopgap que divergía del producto real.
- **Fix:** **consolidado = tenant real** (front+back) en su URL; **demo = app del flujo**; **deprecar** previews.
- **Lección:** un artefacto paralelo al producto **miente** y se desincroniza.
- **Guardarraíl:** el entregable **es la app real**; no mantener láminas paralelas; retirar el preview al servir el producto real.
- **Refs:** ADR-028, `docs/PLAN-RECONVERSION-CLIENTES.md`.

## Decisiones relacionadas

- [ADR-028](../30-decisiones/ADR-028.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
