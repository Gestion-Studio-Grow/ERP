---
id: DB-4
categoria: DB
tipo: leccion
generado: true
tags: [brain/leccion, leccion/db]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DB-4] Doble reserva (overbooking TOCTOU)

**Categoría:** Datos / DB

> 🛡️ **Guardarraíl (la regla verificable):**
> invariantes de unicidad/exclusión **en la BD** (constraint/serializable), no en la app.

**Lección:** "chequear y después insertar" **no** es atómico; la BD debe imponer la exclusión.

## Detalle

- **Síntoma:** dos reservas del mismo cupo bajo concurrencia.
- **Causa raíz:** `check-then-insert` en `ReadCommitted` → carrera *time-of-check/time-of-use*.
- **Fix:** transacción **`Serializable`** ya; `EXCLUDE USING GIST` cuando el plan lo permita.
- **Lección:** "chequear y después insertar" **no** es atómico; la BD debe imponer la exclusión.
- **Guardarraíl:** invariantes de unicidad/exclusión **en la BD** (constraint/serializable), no en la app.
- **Refs:** ADR-004, ADR-023.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
