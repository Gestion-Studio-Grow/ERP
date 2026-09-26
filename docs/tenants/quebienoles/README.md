# Tenant `quebienoles` — Qué Bien Olés (perfumería, Ezeiza)

## Autorización (MP-15: toda autorización verbal del dueño queda escrita, con fecha)

- **26/09/2026 — Maxi (dueño de GSG), en sesión:** pidió relevar `@quebienoles` y desarrollar su tienda con el
  estándar GSG, y autorizó explícitamente "TE AUTORIZO A TODO, GENERA UN SUBLINK EN VERCEL COMO LOS Q ESTAMOS
  TRABAJANDO Y ENTREGAME USUARIO Y PASSWORD PARA OPERARLO".
- **OK de Qué Bien Olés (el cliente) para usar su marca:** **[VERIFICADO por el dueño de GSG]** — 26/09/2026,
  Maxi en sesión: "ten el ok, avanza" (respuesta al pendiente "conseguir el OK de Qué Bien Olés para usar su
  marca antes de mostrarle la tienda").

## Qué es

Tenant del ERP (no un sitio aparte) con blueprint retail, rubro **`perfumeria`**, y **front propio**
(`src/app/tienda/quebienoles/`), registrado por marca en `EDITORIAL_FRONT_IDS` (`src/lib/identidad-rubro.ts`).
El pedido es el del ERP: `useVidriera` → `placeOnlineOrder` → bandeja `/admin/pedidos`.

| Pieza | Archivo |
|---|---|
| Vidriera (portal 3D, puertas, guía, vitrina, ficha, bolsa) | `src/app/tienda/quebienoles/QuebienolesFront.tsx` y vecinos |
| Frasco 3D (three.js, import dinámico: 0 KB en el resto del ERP) | `frasco-escena.ts` + `Frasco.tsx` |
| Catálogo + fichas olfativas (fuente única) | `perfumes.ts` (test: `quebienoles.test.ts`) |
| Recomendador «¿No sabés cuál elegir?» | `recomendador.ts` |
| Gracias con la marca | `GraciasQuebienoles.tsx` (enganchado en `src/app/tienda/gracias/page.tsx`) |
| Copy textual de la marca | `src/tenants/storefront.ts` → `quebienoles` |
| Dirección | **`https://quebienoles.gsgapp.com.ar`** — dominio propio de GSG (438df9e): `APP_BASE_DOMAIN` + comodín `*.gsgapp.com.ar` en Vercel, resuelve por `Tenant.subdomain = quebienoles` |
| Dirección alternativa | `https://quebienoles-erp.vercel.app` — `HOSTS_PUBLICADOS` en `src/lib/tenant.ts`; sigue andando |
| Fuentes (OFL, auto-hospedadas, ADR-099) | `public/tenants/quebienoles/fuentes/` |
| Fotos de frascos | `public/tenants/quebienoles/perfumes/` (+ `ASSET_MANIFEST.json`) |

**Por qué el host va en código:** `TENANT_HOST_MAP` es una variable *sensible* en Vercel (no se puede leer, sólo
reescribir entera). Reescribirla a ciegas podía dejar sin tienda a MAGRA, Shine y A Dos Manos. El host nuevo va
en `HOSTS_PUBLICADOS`; la variable sigue mandando si repite el host.

## Alta (receta)

```bash
# 1. Alta del tenant (idempotente por slug; sin catálogo genérico del rubro)
DOTENV_CONFIG_PATH=<.env de la base> npx tsx scripts/provision-tenant.ts \
  --name "Qué Bien Olés" --slug quebienoles --owner-email dueno@quebienoles.com.ar \
  --owner-name "Qué Bien Olés" --blueprint perfumeria --skip-catalog \
  --city Ezeiza --instagram quebienoles --short-label "Perfumería" \
  --hours-label "Pedidos por mensaje" \
  --contact-note "Perfumes árabes al mejor precio. Envío o punto de encuentro en Ezeiza."

# 2. Catálogo + subdominio: simulación → --apply → simulación otra vez (tiene que dar 0 cambios)
DOTENV_CONFIG_PATH=<.env de la base> npx tsx scripts/tenants/quebienoles-catalogo.ts
DOTENV_CONFIG_PATH=<.env de la base> npx tsx scripts/tenants/quebienoles-catalogo.ts --apply
DOTENV_CONFIG_PATH=<.env de la base> npx tsx scripts/tenants/quebienoles-catalogo.ts

# 3. Dirección: con el dominio propio alcanza con el subdominio del paso 2 (quebienoles.gsgapp.com.ar la resuelve el
#    comodín). El .vercel.app (quebienoles-erp.vercel.app, agregado al proyecto el 26/09) queda como alternativa.
```

El mail del OWNER es **provisional** (`dueno@quebienoles.com.ar`): cambiarlo por el real del dueño.

## Gate de Excelencia (26/09/2026, auditoría en Opus)

| Bloque | Resultado |
|---|---|
| 1 · Fiori + ángulo argentino | Rol único (quien compra) · coherente con la casa (reusa `useVidriera`, `pedido-online`, `OlvidarBolsa`, `catalogo-core`) · simple (bolsa en 2 pasos, 2 campos obligatorios) · adaptable (probado en 1440 y 375 px; piel propia por marca) · delightful (frasco 3D, estela, puertas, guía) · accesible (`<dialog>` nativo, etiquetas explícitas, `aria-live`, foco visible, contraste AA medido en tokens, movimiento reducido = cuadro quieto sin estela ni bruma) · criollo, de vos, con las frases de la marca; su canal real (Instagram) en vez de un WhatsApp que no tiene; nada de cobro online ni promesas sin fuente. |
| 2 · Sello GSG | `generator` en /tienda y /tienda/gracias; sin crédito GSG visible en la vidriera; docs firmados. |
| 3 · Arquitectura | Tenant + rubro reusable, sin schema nuevo; host en código con la variable ganando (MT-6); three.js en chunk propio por import dinámico (ninguna ruta lo referencia de entrada); carga de catálogo filtrada por `tenantId`, con GUC de RLS, simulación por defecto y sin borrados. |
| 4 · Confiabilidad | `tsc` 0 · eslint 0 en lo tocado · `next build` OK · tests: 0 fallas nuevas (las 19 que quedan fallan idénticas en `origin/main` dfb99bb) · sin migraciones · regresión en producción: CH, MAGRA y Shine OK después del deploy. |

## Pendientes

Ver `docs/preventa/analisis-redes-quebienoles.md` §6 (presentación de dos perfumes, Bharara Bleu, ml, stock,
medios de pago, WhatsApp, fotos en alta, mail real).

— Elaborado por GSG
