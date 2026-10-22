# Facturita — pedidos a Plataforma

Cosas que la célula de Facturita **no tocó** porque son de Plataforma (proxy, hosts, config,
fábrica de tenants). Cada pedido dice qué, por qué y cómo se verifica. Fecha: 2026-10-22.
Rama de origen: `claude/facturacion-automatica-facturita`.

## P-1 · Ruteo host → producto para `facturita-gsg.vercel.app` (ADR-076 §2, ADR-029) — ✅ HECHO en código (`src/lib/producto-host.ts` + `src/proxy.ts`, rewrite de la raíz). Falta sólo sumar `facturita-gsg.vercel.app=facturita` al `TENANT_HOST_MAP` vivo: lo pega el dueño (docs/runbooks/facturacion/publicacion.md §3)

- **Qué:** que la raíz `/` del host `facturita-gsg.vercel.app` sirva la vidriera `/facturita`
  (rewrite en `src/proxy.ts`, o redirect 308 a `/facturita`), y que el host quede en
  `HOSTS_PUBLICADOS` (`src/lib/tenant.ts`) con su test, **nunca** reescribiendo `TENANT_HOST_MAP`
  a ciegas (MT-6).
- **Por qué:** hoy la vidriera vive en `/facturita` de cualquier host. El link de venta tiene que
  abrir directo en la vidriera.
- **Ojo:** el manifiesto declara `scope: /facturita/` y `start_url: /facturita/app`. Si Plataforma
  decide servir Facturita en la raíz del host (sin el prefijo), hay que mover scope, start_url,
  la ruta del SW y la de la página sin conexión en `src/lib/facturita-pwa.ts` y
  `public/facturita/sw.js` (un solo lugar cada uno).
- **Se verifica:** `curl -I https://facturita-gsg.vercel.app/` → 200 con la vidriera o 308 a `/facturita`.

## P-2 · `/facturita/app` no pasa por el portón de sesión del proxy — ✅ HECHO (orquestador, `src/proxy.ts` + `src/app/facturita/guard.test.ts`)

- **Qué:** sumar `/facturita/app` (y lo de abajo) a `esSuperficieDeTenant` en `src/proxy.ts`,
  como `/admin` y `/contador`.
- **Por qué:** hoy la app de Facturita depende sólo del chequeo de cada página/acción
  (`requireCapability` en `src/lib/facturita-actions.ts`). Es seguro (las acciones validan
  sesión, capability y blueprint), pero el portón grueso del proxy es la primera línea en el resto
  de las superficies con login. **Importante:** NO sumar `/facturita` entero: la vidriera, el
  alta, los planes, el manifiesto, el SW, los íconos y `sin-conexion.html` tienen que seguir
  públicos (el navegador baja manifiesto y SW sin cookies).
- **Se verifica:** sin cookie, `GET /facturita/app` → 307 a `/admin/login?next=/facturita/app`;
  `GET /facturita/manifest.webmanifest` → 200 JSON.

## P-3 · Encabezados del service worker (opcional, recomendado) — ✅ HECHO (`next.config.ts` → `headers()`)

- **Qué:** en `next.config.*` → `headers()`, para `/facturita/sw.js`:
  `Cache-Control: no-cache, no-store, must-revalidate` y
  `Content-Type: application/javascript; charset=utf-8` (guía PWA de Next 16,
  `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` §Security).
- **Por qué:** el registro ya usa `updateViaCache: "none"`, así que funciona sin esto; el
  encabezado es defensa extra para que ningún CDN sirva un SW viejo.

## P-4 · Alta self-serve real: cablear `/facturita/alta` a la fábrica de tenants (ADR-074)

- **Qué:** una puerta pública y segura que, con los datos ya validados por
  `src/lib/facturita-onboarding.ts` (se reusa del lado servidor), cree el negocio con
  `blueprintId: "facturita"` vía `provisionTenant` / la saga de ADR-074, y mande el acceso.
- **Por qué no se hizo acá:** no hay hoy un camino público de alta con su portón (antiabuso,
  verificación de email/WhatsApp, rate limit). Crear tenants reales desde una página pública sin
  eso es **irreversible** (datos reales en Neon) y queda fuera del ciclo demo → venta → inversión.
  Mientras tanto el asistente termina en un **alta operada**: arma el resumen y la persona lo manda
  por WhatsApp (`WHATSAPP_GSG`); sin esa variable, ofrece copiarlo. No se guarda nada.
- **Decide:** el dueño (es gasto de soporte + datos reales). Ver también ADR-076 «Deuda anotada».

## P-5 · `WHATSAPP_GSG` en el entorno del build

- **Qué:** confirmar que `WHATSAPP_GSG` está cargada en Vercel para el proyecto que sirve
  Facturita. La página `/facturita/alta` es estática: el número se lee **en el build**.
- **Por qué:** sin la variable, el botón «Mandar por WhatsApp» no aparece (no se inventa número,
  DX-4) y queda sólo «Copiar el resumen».

## P-6 · La vidriera no llega a ser estática por el layout raíz

- **Qué:** `src/app/layout.tsx` exporta `dynamic = "force-dynamic"` y su `generateMetadata` resuelve la
  marca del negocio por host. Eso hace que `/facturita`, `/facturita/alta` y `/facturita/planes`
  (que declaran `force-static` y no leen base) salgan ƒ en el build, igual que `/demo`.
- **Por qué importa:** la meta de PD-1 / Lighthouse (LCP < 2,5 s) es servirlas de la CDN. Hoy cada
  visita pasa por la función (la marca raíz es fail-open, así que no rompe, pero suma latencia).
- **Opción:** un grupo de rutas con su propio layout raíz para las vidrieras de producto, o que el
  layout raíz no fuerce dinámico. Es decisión de Plataforma.

— Elaborado por GSG
