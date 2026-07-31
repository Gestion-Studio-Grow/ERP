---
id: SEC-2
categoria: SEC
tipo: leccion
generado: true
tags: [brain/leccion, leccion/sec]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [SEC-2] Un rol de app que evade RLS

**Categoría:** Seguridad

> 🛡️ **Guardarraíl (la regla verificable):**
> la app conecta **siempre** con un rol **sin `BYPASSRLS`**; verificar aislamiento antes del go-live.

**Lección:** RLS es tan fuerte como el **rol** con el que conecta la app.

## Detalle

- **Síntoma:** RLS activo pero el aislamiento no se cumple.
- **Causa raíz:** el rol de la app (`app_user`) tenía **`BYPASSRLS`** (inarreglable en ese rol).
- **Fix:** conectar la app con un **rol nuevo sin `BYPASSRLS`** (`app_rls`).
- **Lección:** RLS es tan fuerte como el **rol** con el que conecta la app.
- **Guardarraíl:** la app conecta **siempre** con un rol **sin `BYPASSRLS`**; verificar aislamiento antes del go-live.
- **Refs:** ADR-018; memoria RLS go-live.

## Decisiones relacionadas

- [ADR-018](../30-decisiones/ADR-018.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
