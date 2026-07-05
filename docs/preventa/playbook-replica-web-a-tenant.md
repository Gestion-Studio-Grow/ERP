# Playbook — replicar la web de un cliente como tenant nuestro (+ backoffice)

**Tipo:** guía de método reutilizable (entrenamiento de agentes) · **Rol:** preventa + fullstack
**Para qué:** cuando un prospecto **ya tiene su web** (hecha por una agencia/estudio), el pitch no
es "te hacemos una vidriera" sino **"no te tocamos tu vidriera: te vendemos y adaptamos el
backoffice"**. Se replica su front como la vidriera de SU tenant en nuestra plataforma, y los
pedidos entran a nuestro sistema (toma de pedidos + POS + stock + facturación). Es la capacidad de
**adaptar el front de cualquier cliente**.

> **Autorización primero.** Replicar el sitio de un cliente requiere su autorización explícita
> (idealmente también del estudio que lo hizo, o confirmación de que el cliente es dueño del
> material). Sin eso, no se replica. Caso magra: el dueño confirmó que el estudio (@noctiluma) es
> suyo → autorización total. Documentar la autorización en el registro del tenant.

---

## Principio rector: es un TENANT, no un clon suelto

La réplica se sirve **como la vidriera del tenant**, resuelta por su config (branding + slug) dentro
del multi-tenant — **no** como un sitio/app aparte. Misma plataforma, mismo backoffice, mismo modelo
de aislamiento por tenant. Si terminás con un Next suelto que "parece" su web, está MAL: tiene que
ser su tenant.

## Los 6 pasos

### 1. Relevar la web real del cliente
Sacar de su sitio: **estructura** (orden de secciones), **textos exactos** (transcripción literal, su
copy — NO el nuestro de marketing), **imágenes/URLs** (logo, fotos, logos de proveedores, avatares de
reviews) y su **look** (colores, tipografía, tono). Herramientas: fetch web para estructura/textos.
*(Nota operativa: si la red del shell está bloqueada, no vas a poder DESCARGAR binarios ni el CSS
crudo; dejá un `ASSET_MANIFEST` con las URLs y marcá que faltan bajar — ver §5.)*

### 2. Modelar el contenido como CONFIG del tenant (resuelto por slug)
El contenido de la réplica va en un módulo de datos por tenant, resuelto por slug (como el acento y
el copy). En el caso magra: `src/tenants/magra-replica.ts` (datos) + `src/tenants/site-replica.ts`
(registry `getSiteReplica(slug)`). Así la réplica es config del tenant, no código a medida suelto.

### 3. Construir el resultado visual en NUESTRO Next
Un componente que renderiza la réplica desde esos datos (`src/app/tienda/SiteReplica.tsx`): header,
hero, propuestas de valor, secciones de producto, proveedores, reviews, footer — con los **textos e
imágenes reales** y el **acento de marca del tenant** (`getTenantAccent`). No se levanta el código del
estudio; se **reproduce el resultado**.

### 4. Servir la réplica como la vidriera del tenant (resolución por tenant)
`src/app/tienda/page.tsx` resuelve el tenant (por slug) y: si tiene réplica → la sirve; si no → cae a
la vidriera genérica del rubro. Una sola ruta de vidriera (`/tienda`), dos "skins" según el tenant.
El slug se resuelve con un helper propio (`getCurrentTenantSlug`), sin acoplarse a otros loaders.

### 5. Conectar el backoffice (el valor que se vende)
La sección de compra (o el botón "LISTA DE PRECIOS" que en su web va a un tercero como Bistrosoft) se
cablea a **nuestro** flujo: catálogo + carrito → `placeOnlineOrder` → bandeja `/admin/pedidos`
(toma de pedidos + POS de mostrador + stock + facturación). Ese es el salto: dejan de depender del
sistema viejo y del WhatsApp manual.

### 6. Assets: bajarlos al repo del tenant
Bajar logo, fotos, logos de proveedores y avatares a `public/tenants/<slug>/…` y apuntar la config
ahí. Mientras no se puedan bajar (red bloqueada), se referencian por URL (hotlink) y el
`ASSET_MANIFEST` lista cada archivo con su destino local para completarlo después.

## Entregable

- Registro del tenant con la **autorización** anotada.
- Módulo de contenido de la réplica (config por tenant) + registry por slug.
- Vidriera del tenant sirviendo la réplica + backoffice conectado.
- `ASSET_MANIFEST` de imágenes (bajadas o pendientes).
- Screenshot + verificación de build.

## Errores a evitar
- Hacer un **sitio aparte** en vez de la vidriera del tenant (rompe el modelo multi-tenant).
- Usar **nuestro** copy de marketing en vez del de ellos (la réplica es fiel a SU comunicación).
- Replicar **sin autorización** del dueño del material.
- Acoplar la resolución del tenant a la forma de retorno de otro loader (usar un helper propio).
- Prometer "front tuyo, back nuestro" sin **conectar** de verdad el backoffice.

## Caso trabajado
magra: `docs/tenants/magra/replica-web-demo.md` · `src/tenants/magra-replica.ts` ·
`src/app/tienda/SiteReplica.tsx` · `src/app/tienda/page.tsx`.
