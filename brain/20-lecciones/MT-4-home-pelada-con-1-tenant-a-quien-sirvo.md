---
id: MT-4
categoria: MT
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mt]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MT-4] Home pelada con >1 tenant: ¿a quién sirvo?

**Categoría:** Multi-tenant

> 🛡️ **Guardarraíl (la regla verificable):**
> mapear cada host; **nunca `APP_BASE_DOMAIN=vercel.app`**; home pelada solo para `/demo`.

**Lección:** rutear por **hostname exacto**; ante ambigüedad, **fallar cerrado**, no adivinar.

## Detalle

- **Síntoma:** la URL raíz del proyecto (sin mapa) con varios tenants no sabe a quién servir.
- **Causa raíz:** las URLs `.vercel.app` **no** son subdominios de un dominio común → el ruteo por subdominio no las resuelve.
- **Fix:** `TENANT_HOST_MAP` (hostname→tenant) + **fail-closed 500**; `APP_BASE_DOMAIN` **vacío** en demo.
- **Lección:** rutear por **hostname exacto**; ante ambigüedad, **fallar cerrado**, no adivinar.
- **Guardarraíl:** mapear cada host; **nunca `APP_BASE_DOMAIN=vercel.app`**; home pelada solo para `/demo`.
- **Refs:** ADR-029, ADR-015.


## Decisiones relacionadas

- [ADR-015](../30-decisiones/ADR-015.md)
- [ADR-029](../30-decisiones/ADR-029.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
