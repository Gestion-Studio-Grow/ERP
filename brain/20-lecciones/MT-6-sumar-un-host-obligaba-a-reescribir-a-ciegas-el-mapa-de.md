---
id: MT-6
categoria: MT
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mt]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MT-6] Sumar un host obligaba a reescribir a ciegas el mapa de todos (quebienoles, 26/09/2026)

**Categoría:** Multi-tenant

> 🛡️ **Guardarraíl (la regla verificable):**
> host nuevo → `HOSTS_PUBLICADOS` + test; **nunca** reescribir `TENANT_HOST_MAP` sin tener su valor vigente a la vista.

**Lección:** una configuración que no se puede leer no se puede editar con seguridad; se agrega por un canal que sí se lee y se revisa.

## Detalle

- **Síntoma:** para publicar `quebienoles-erp.vercel.app` había que sumar una entrada a `TENANT_HOST_MAP`.
- **Causa raíz:** en Vercel la variable es **sensible**: no se puede leer, sólo reescribir entera. Reescribirla
  "de memoria" o desde una plantilla vieja (`.env.vercel.template`) podía borrar hosts vivos (MAGRA, Shine, ADM,
  los de productos GSG) sin error visible hasta que alguien entra.
- **Fix:** `HOSTS_PUBLICADOS` en `src/lib/tenant.ts`: hosts exactos en el código, revisados en un commit; la
  variable **gana** si repite el host (se corrige sin deploy). Mismo fail-closed: sin `Tenant.subdomain`, 500.
- **Lección:** una configuración que no se puede leer no se puede editar con seguridad; se agrega por un canal
  que sí se lee y se revisa.
- **Guardarraíl:** host nuevo → `HOSTS_PUBLICADOS` + test; **nunca** reescribir `TENANT_HOST_MAP` sin tener su
  valor vigente a la vista.
- **Refs:** MT-4, `src/lib/tenant.test.ts`, `docs/tenants/quebienoles/README.md`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
