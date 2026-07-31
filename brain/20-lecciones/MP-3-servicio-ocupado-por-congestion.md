---
id: MP-3
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-3] "Servicio ocupado" por congestión

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> **≤ 4 corriendo**; en congestión **solo P1** (demos/venta); P2 espera, P3 pausado.

**Lección:** más paralelo no es más throughput si satura el servicio.

## Detalle

- **Síntoma:** abrir muchas sesiones a la vez **satura el servicio** y frena todo.
- **Causa raíz:** sin tope de concurrencia.
- **Fix:** **tope ≤ 4** sesiones + **olas chicas** + prioridades **P1/P2/P3**.
- **Lección:** más paralelo no es más throughput si satura el servicio.
- **Guardarraíl:** **≤ 4 corriendo**; en congestión **solo P1** (demos/venta); P2 espera, P3 pausado.
- **Refs:** ADR-032.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
