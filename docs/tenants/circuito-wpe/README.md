# Circuito WPE — negocio de la plataforma con su sitio en wpe.gsgapp.com.ar

Circuito WPE organiza torneos de pádel amateur en el AMBA. Es un cliente **ya vendido**. Su demo, que
el cliente ya vio, es un sitio de **un solo archivo**: marca negra y lima `#C6E000`, el torneo en curso,
el motor de torneo adentro, un backoffice de demostración en el navegador y un manual en PDF. Fuente:
repo `Gestion-Studio-Grow/circuito-wpe` (`deploy/index.html`, `deploy/manual.pdf`).

- **Demo anterior:** `https://wpe-prueba.vercel.app`, en otra cuenta de Vercel. **Congelada, no se toca.**
- **Dirección nueva:** `https://wpe.gsgapp.com.ar`, servida por este ERP. Negocio `circuito-wpe`,
  subdominio `wpe`.
- **Autorización de marca (ADR-042):** es un cliente vendido y el sitio se hizo por su encargo (BRIEF del
  repo circuito-wpe). **[A VALIDAR]** que la autorización quede registrada por escrito.

## Qué se sirve y cómo (sin cambios de schema)

| Pieza | Archivo |
|---|---|
| El sitio (la demo publicada con el pulido técnico en el `<head>`, el cuerpo sin tocar) | `src/tenants/circuito-wpe/sitio/index.html` |
| Manual, tarjeta para compartir (1200×630) e ícono de inicio (180×180) | `src/tenants/circuito-wpe/sitio/manual.pdf` · `og.png` · `apple-touch-icon.png` |
| Registro de sitios estáticos, reglas por host y respuesta del manejador | `src/lib/sitio-estatico.ts` |
| Manejador: resuelve el negocio del host y sirve el archivo, o 404 | `src/app/sitio-estatico/[[...archivo]]/route.ts` |
| Enganche: reescrituras por host y trazado de archivos para Vercel | `next.config.ts` (`rewrites`, `outputFileTracingIncludes`) |
| Inter (una variable, OFL) y su licencia | `public/tenants/circuito-wpe/fuentes/` |
| Script que aplica el pulido sobre la demo publicada | `src/tenants/circuito-wpe/pulir.py` |
| Nombre y monograma del ingreso y del panel (sin ficha dicen "Mi negocio") | `src/lib/branding.ts` → `TENANTS["circuito-wpe"]` |
| Tests | `src/lib/sitio-estatico.test.ts` |

1. En un host `wpe.<dominio>`, `/`, `/manual.pdf`, `/og.png` y `/apple-touch-icon.png` se reescriben a
   `/sitio-estatico/…` (`next.config.ts`). En cualquier otro host no se reescribe nada.
2. El manejador resuelve el negocio del host por la vía de siempre (`getCurrentTenantSlug` → `tenant.ts`)
   y **sólo** sirve si ese negocio es `circuito-wpe`. Si no hay negocio con subdominio `wpe`, responde 404
   sin contenido: falla cerrado. Si otro negocio pide `/sitio-estatico`, también 404, porque decide el host.
3. Todo lo demás de `wpe.gsgapp.com.ar` es la plataforma de siempre: `/admin` es el panel del negocio.
4. El proxy no cambió (sigue sin cargar la base de datos) y la página `/` de los demás negocios tampoco.

## Alta en producción (la hace el dueño desde la consola: Soporte → Alta de negocio)

| Campo del asistente | Valor |
|---|---|
| Nombre del negocio | `Circuito WPE` |
| Nombre corto (único) | `circuito-wpe` (**exacto**: el sitio se sirve sólo a este nombre) |
| Nombre del dueño | *provisional a confirmar* (el organizador del circuito) |
| Email del dueño (con el que entra) | *provisional a confirmar* |
| Rubro | **Genérico**, elegido de la lista. No escribir "pádel" en palabras: lo tomaría como la tienda de pádel de A Dos Manos. |
| Link propio (subdominio) | `wpe` (**exacto**) |
| Ciudad | `AMBA` (*provisional a confirmar*) |
| WhatsApp | *provisional a confirmar* |
| Instagram | `https://instagram.com/circuitowpe` (el que publica el sitio) |
| Color, tema y monograma | No cambian el sitio, que trae su propia piel. Sugerido: tema oscuro y monograma `WPE`. |

- **Dominio:** `wpe.gsgapp.com.ar` tiene que apuntar al proyecto de Vercel del ERP (el mismo que atiende
  `quebienoles.gsgapp.com.ar`). Si el comodín `*.gsgapp.com.ar` ya está cargado en ese proyecto, no hace
  falta nada; si no, hay que agregar el dominio. **[A VERIFICAR]** en Vercel: no se pudo mirar desde acá.
- **Sin el alta**, `wpe.gsgapp.com.ar` responde 404 (medido en el laboratorio, `.qa/wpe-2609/`).
- En el laboratorio (`erp_lab`) el negocio se creó con `scripts/provision-tenant.ts --blueprint generico
  --skip-catalog` y `scripts/set-tenant-subdomain.ts circuito-wpe=wpe`.

## Cómo se actualiza el sitio

1. Se cambia la demo en el repo circuito-wpe (`deploy/index.html`).
2. `python3 src/tenants/circuito-wpe/pulir.py <circuito-wpe>/deploy/index.html src/tenants/circuito-wpe/sitio/index.html`
   (falla si el `<head>` de la demo cambió y alguna regla ya no encuentra su texto).
3. El test "el cuerpo del sitio es el que vio el cliente" falla **a propósito**: se actualiza el sha256
   sabiendo qué cambió.

## Decisiones (skill vidriera-de-autor aplicado a un sitio de torneos)

- **Fidelidad antes que identidad nueva (ADR-033):** el cliente ya aprobó este sitio. No se reescribió en
  React ni se cambió la tipografía (Inter), aunque la lista anti-sesgo la desaconseja para diseños nuevos.
- **No aplica:** 3D, catálogo con fuentes, recomendador ni motor de pedidos. Es un sitio de torneos, no
  una tienda, y la demo trae su propio motor de torneo.
- **Sí aplica:** tipografía auto-hospedada con respaldo de métricas (CLS 0), metadatos con `og:image`
  absoluta, sello GSG sólo en `generator` (ADR-043), toques de 44 px, 390 px sin scroll horizontal,
  consola sin errores y medición antes/después con la misma vara.
- **Caché privada** (`private, max-age`): ninguna caché compartida puede mezclar el sitio con otro host.
- **Cabeceras:** las mismas que tenía la demo (`nosniff`, `strict-origin-when-cross-origin`). No se agregó
  una política de contenido (CSP) porque el sitio vive de scripts y estilos en línea.

- **Precarga de la fuente: se mantiene** (medido, 3 corridas, `.qa/wpe-2609/lcp-variantes.txt`): con precarga
  el primer pintado ya sale en la tipografía de la marca, LCP móvil 0,9 s, CLS 0,0002, TBT 15 ms; sin precarga
  0,6 s pero TBT 194 ms y el titular cambia de letra a la vista. La demo publicada, cuando Google Fonts carga:
  CLS 0,0246 y TBT 756 ms. El respaldo (Arial, Helvetica, Liberation Sans, Roboto) cubre Android y Linux.
- **44 px con el dedo y foco visible** medidos en 5 estados a 390 px (inicio, menú, inscripción, modo
  organizador y su pestaña): 0 blancos chicos, 2 exentos con motivo; 0 focos sin indicador en 64 Tab.
  `.qa/wpe-2609/a11y-estados.txt`.
- **Sello GSG (ADR-043):** el "Powered by Gestión Studio Grow" del pie se oculta por estilo; queda en
  `generator`. Es el único cambio visible respecto de la demo. **Revertir** = borrar la línea
  `.foot-base-in .gsg{display:none}` de `pulir.py` y regenerar.

## Pendiente

- La autorización de marca por escrito y los datos del dueño (arriba, *provisional a confirmar*).
- `wpe.gsgapp.com.ar/tienda` y `/reserva` muestran las pantallas genéricas de la plataforma. Nadie las
  enlaza, pero existen: queda decidir si redirigen a `/`.
- Un host `.vercel.app` mapeado a `wpe` (`TENANT_HOST_MAP`) no recibe el sitio: la reescritura es por
  subdominio. Hoy no hace falta.
- **Datos provisorios del cliente:** el sitio trae 15 marcas "Dato provisorio — a confirmar" (entre ellas
  WhatsApp `11 2345-6789` e `info@circuitowpe.com.ar`). Confirmarlos con WPE antes de difundir la dirección.
- **Plataforma:** todo negocio dado de alta por la consola sin ficha en `TENANTS` muestra "Mi negocio" en el
  ingreso. Arreglo de fondo: tomar `Tenant.name` como respaldo en `getTenantBrand` (a BACKLOG).
