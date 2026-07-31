---
id: DB-2
categoria: DB
tipo: leccion
generado: true
tags: [brain/leccion, leccion/db]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DB-2] Contador de módulos en 0 (OP-2)

**Categoría:** Datos / DB

> 🛡️ **Guardarraíl (la regla verificable):**
> el alta/preset **valida `modules` no vacío**; el probador **falla ruidoso** si faltan.

**Lección:** un array vacío **silencioso** rompe la UI sin error; los datos del tenant deben reflejar sus capabilities.

## Detalle

- **Síntoma:** el backoffice mostraba **0 módulos** para el tenant.
- **Causa raíz:** el campo `modules` del tenant estaba **`[]`** en la DB (alta incompleta).
- **Fix:** poblar `modules` en el alta del tenant.
- **Lección:** un array vacío **silencioso** rompe la UI sin error; los datos del tenant deben reflejar sus capabilities.
- **Guardarraíl:** el alta/preset **valida `modules` no vacío**; el probador **falla ruidoso** si faltan.
- **Refs:** QA `docs/calidad/` OP-2; ADR-034 (preset).

## Decisiones relacionadas

- [ADR-034](../30-decisiones/ADR-034.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
