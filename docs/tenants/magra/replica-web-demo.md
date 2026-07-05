# Demo réplica de la web de magra + nuestro backoffice

**Tipo:** registro de demo comercial · **Fecha:** 2026-07-05 · **Ruta:** `/tienda` (vidriera del
tenant magra, resuelta por su config — NO una ruta/clon aparte).
**Pitch:** para el segmento que **ya tiene web hecha por una agencia/estudio**: *"no te
tocamos tu vidriera, te vendemos y adaptamos el backoffice"*. Se replica su front tal cual
y los pedidos entran a NUESTRO sistema.

> **Autorización:** el dueño confirmó que el estudio que hizo la web (@noctiluma) también es suyo →
> autorización total para replicar su sitio (magrameatmarket.com.ar) y usar sus assets. Contenido e
> imágenes son de SU web (transcripción literal + URLs reales), no copy nuestro.

## Es un TENANT, no un clon suelto (resolución por tenant)

La réplica se sirve como **la vidriera del tenant magra** dentro del multi-tenant, resuelta por su
config (branding + slug), no como un sitio aparte:
- `src/app/tienda/page.tsx` resuelve el tenant (`getCurrentTenantSlug`) → si tiene réplica de sitio
  (`getSiteReplica(slug)`), sirve la réplica; si no, cae a la vidriera genérica del rubro. Una sola
  ruta `/tienda`, dos "skins" según el tenant.
- `src/tenants/magra-replica.ts` — contenido real de magra (config del tenant) + `SiteReplicaData`.
- `src/tenants/site-replica.ts` — registry `getSiteReplica(slug)` (magra → su réplica).
- `src/lib/tenant-site.ts` — `getCurrentTenantSlug()` (resuelve el slug sin acoplarse a otros loaders).
- El acento de marca sale del tenant (`getTenantAccent`, magra=oxblood).

## Qué se construyó (en NUESTRO Next, replicando el resultado visual)

- `src/app/tienda/SiteReplica.tsx` (client) — réplica fiel manejada por datos del tenant: header con logo, hero
  ("PRODUCTOS GOURMET PREMIUM" / "Esto no es una carnicería!"), barra de beneficios (Free
  Shipping / Calidad premium / Medios de pago / Atención), "Productos gourmet" (4 categorías con
  foto), "Envasados al vacío" (vaca/cerdo/pollo con "Hacer pedido"), proveedores (8 logos),
  reviews reales (Matías R./Jesica F./Macarena A., 5★) y footer con su contacto/horarios.
- `src/tenants/magra-replica.ts` — todo el contenido real + `ASSET_MANIFEST` de imágenes.

## Backoffice conectado (el valor que se vende)

La sección **"Comprá online"** reemplaza su botón **"LISTA DE PRECIOS"** (que hoy va a
**Bistrosoft**) por nuestro **catálogo + carrito** → `placeOnlineOrder` → bandeja
`/admin/pedidos` (toma de pedidos + POS de mostrador + stock + facturación). Es decir: front
de ellos, back nuestro. Dejan de depender de Bistrosoft y del WhatsApp manual.

## ⚠️ Imágenes: referenciadas por URL, NO descargadas al repo

No pude **descargar los binarios** de las imágenes con las herramientas disponibles (la red
saliente desde el shell está bloqueada y el fetch web devuelve texto, no archivos). Por eso hoy
las imágenes se **referencian por URL (hotlink)** a su sitio y el `ASSET_MANIFEST` en
`magra-replica.ts` lista cada archivo con su nombre local destino (`public/tenants/magra/…`).
**Para dejarlas locales** hace falta: (a) habilitar descarga de red para bajarlas al repo, o
(b) que el dueño pase los archivos. Assets referenciados: logo (header + footer), foto de
cortes del hero, 4 fotos gourmet, 8 logos de proveedores, 3 avatares de reviews.

## Verificación

`next build` en verde (TypeScript sin errores) · `tsc` 0 errores de fuente · screenshots del
render (con las imágenes reales cargando por hotlink). Sin tocar Neon.
