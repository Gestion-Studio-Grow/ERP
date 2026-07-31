---
id: DB-3
categoria: DB
tipo: leccion
generado: true
tags: [brain/leccion, leccion/db]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DB-3] `migrate deploy` aplica TODAS las pendientes

**Categoría:** Datos / DB

> 🛡️ **Guardarraíl (la regla verificable):**
> verificar pendientes con `predeploy-check`; **Gate 2** (owner) antes de `migrate deploy`.

**Lección:** no hay "aplicar una sola"; es todo o nada.

## Detalle

- **Síntoma:** correr `migrate deploy` por "una" migración aplica **todas** las pendientes.
- **Causa raíz:** `migrate deploy` no es selectivo.
- **Fix:** `predeploy-check` antes; aplicar **solo** con OK del dueño (Gate 2).
- **Lección:** no hay "aplicar una sola"; es todo o nada.
- **Guardarraíl:** verificar pendientes con `predeploy-check`; **Gate 2** (owner) antes de `migrate deploy`.
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md`, ADR-018.

## Decisiones relacionadas

- [ADR-018](../30-decisiones/ADR-018.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
