---
id: DX-5
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-5] "No es la copia de la web real, hay que afinar el lápiz" (Magra)

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> en todo cliente "réplica exacta" — **(a)** extraer el sitio real con navegador (tree +

**Lección:** "copia exacta" no es relevar a ojo ni un `WebFetch` superficial del texto principal — hay que

## Detalle

- **Síntoma:** el dueño detectó que el front replicado (`SiteReplica.tsx` + `magra-replica.ts`) no se sentía
  fiel al sitio real (`magrameatmarket.com.ar`), y por separado que el tenant en vivo mostraba dirección/IG/
  horario **genéricos del rubro** en vez de los reales.
- **Causa raíz:** dos causas independientes, confundidas como una sola. **(1)** la transcripción de contenido
  se hizo la 1ª vez sin un **diff explícito** contra el sitio real (faltaba 2ª frase del hero, sufijo
  "envasado/a al vacío", Facebook, teléfono, sección "ABOUT US", copyright). **(2)** el **Branding
  (BusinessSettings) en Neon** nunca se actualizó con los valores reales ya escritos en el runbook de alta
  (`docs/tenants/magra/provisioning-magra.md`) — quedó en los placeholders del rubro `carniceria`.
- **Fix:** préstamo de pool (Diseño + Adaptador/Delivery + QA, ADR-053) hizo el diff **con navegador real**
  (accessibility tree + `innerText` de header/footer vía JS — un `WebFetch` de texto plano **no** agarra
  header/footer, que quedan fuera del `<article>` principal) y completó `magra-replica.ts`/`SiteReplica.tsx`
  (commit `32924c4`). El gap de Branding en Neon queda **pendiente del dueño** (Gate 2, dato de prod, no lo
  toca el front).
- **Lección:** "copia exacta" no es relevar a ojo ni un `WebFetch` superficial del texto principal — hay que
  extraer el DOM real completo (header/footer suelen quedar fuera de lo que agarra un fetch de texto) y
  **separar dos capas que se confunden fácil**: contenido de marketing (literal, vive versionado en el
  archivo réplica del tenant) vs. **dato de negocio** (Branding en DB, lo carga el alta/Adaptador — si el
  front está bien pero se ve "genérico" en producción, revisar esto ANTES de tocar el código).
- **Guardarraíl:** en todo cliente "réplica exacta" — **(a)** extraer el sitio real con navegador (tree +
  `innerText` de header/footer), no solo `WebFetch`; **(b)** correr el checklist de réplica exacta
  (`auditoria-sap-fiori.md` §Excepción) ítem por ítem contra el sitio real, no de memoria; **(c)** un préstamo
  de pool (ADR-053) que toca un tenant existente **primero verifica si el gap es código o dato de Neon** antes
  de asumir que hay que reescribir el front.
- **Refs:** ADR-042, ADR-043, ADR-053 (este caso = ejemplo canónico del ADR), `docs/metodologia/auditoria-sap-fiori.md`
  §Excepción réplica exacta, `docs/tenants/magra/provisioning-magra.md`.

## Decisiones relacionadas

- [ADR-042](../30-decisiones/ADR-042.md)
- [ADR-043](../30-decisiones/ADR-043.md)
- [ADR-053](../30-decisiones/ADR-053.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
