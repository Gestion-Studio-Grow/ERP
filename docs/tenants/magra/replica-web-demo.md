# Demo réplica de la web de magra + nuestro backoffice

**Tipo:** registro de demo comercial · **Fecha:** 2026-07-05 · **Ruta:** `/magra`
**Pitch:** para el segmento que **ya tiene web hecha por una agencia/estudio**: *"no te
tocamos tu vidriera, te vendemos y adaptamos el backoffice"*. Se replica su front tal cual
y los pedidos entran a NUESTRO sistema.

> **Autorización:** el cliente (magra) autorizó replicar su propio sitio
> (magrameatmarket.com.ar) y usar sus assets para este demo. Contenido e imágenes son de SU
> web (transcripción literal + URLs reales), no copy nuestro.

## Qué se construyó (en NUESTRO Next, replicando el resultado visual)

- `src/app/magra/page.tsx` (server) — carga catálogo del tenant (para el carrito) + acento.
- `src/app/magra/MagraReplica.tsx` (client) — réplica fiel: header con logo, hero
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
