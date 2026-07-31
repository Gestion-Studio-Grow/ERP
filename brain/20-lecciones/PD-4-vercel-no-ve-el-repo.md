---
id: PD-4
categoria: PD
tipo: leccion
generado: true
tags: [brain/leccion, leccion/pd]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [PD-4] "Vercel no ve el repo"

**Categoría:** Prod / Deploy

> 🛡️ **Guardarraíl (la regla verificable):**
> instalar la GitHub App en el **scope de la org**, no en la cuenta personal.

**Lección:** el permiso vive **donde vive el repo** (la org).

## Detalle

- **Síntoma:** al importar en Vercel, el repo no aparece; el dueño "no encuentra dónde dar acceso".
- **Causa raíz:** la GitHub App de Vercel estaba en la **cuenta personal**, pero el repo vive en la **org**.
- **Fix:** autorizar la app **a nivel de la organización** dueña del repo.
- **Lección:** el permiso vive **donde vive el repo** (la org).
- **Guardarraíl:** instalar la GitHub App en el **scope de la org**, no en la cuenta personal.
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
