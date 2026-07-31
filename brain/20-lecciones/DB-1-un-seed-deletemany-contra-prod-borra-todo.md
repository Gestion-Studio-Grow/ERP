---
id: DB-1
categoria: DB
tipo: leccion
generado: true
tags: [brain/leccion, leccion/db]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DB-1] Un seed/`deleteMany` contra prod borra todo

**Categoría:** Datos / DB

> 🛡️ **Guardarraíl (la regla verificable):**
> **NUNCA seed contra prod**; `deleteMany` **siempre** con `where { tenantId }`; migraciones = **carpeta SIN aplicar** (Gate 2); **destructivo bloqueado** por config.

**Lección:** la base es **prod real**; ninguna operación de datos es "de prueba".

## Detalle

- **Síntoma:** riesgo de **wipe** de datos reales (Neon es producción).
- **Causa raíz:** `deleteMany`/seed **sin scope** corre sobre toda la tabla; los seeds no son para datos vivos.
- **Fix:** regla **surface-before-overwrite** + borrado **scopeado por `tenantId`** (ADR-036).
- **Lección:** la base es **prod real**; ninguna operación de datos es "de prueba".
- **Guardarraíl:** **NUNCA seed contra prod**; `deleteMany` **siempre** con `where { tenantId }`; migraciones = **carpeta SIN aplicar** (Gate 2); **destructivo bloqueado** por config.
- **Refs:** ADR-036, ADR-019, `CLAUDE.md` (gates).

## Decisiones relacionadas

- [ADR-019](../30-decisiones/ADR-019.md)
- [ADR-036](../30-decisiones/ADR-036.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
