# Tenant `quebienoles` — Qué Bien Olés (perfumería, Ezeiza)

## Autorización (MP-15: toda autorización verbal del dueño queda escrita, con fecha)

- **26/09/2026 — Maxi (dueño de GSG), en sesión:** pidió relevar `@quebienoles` y desarrollar su tienda con el
  estándar GSG, y autorizó explícitamente "TE AUTORIZO A TODO, GENERA UN SUBLINK EN VERCEL COMO LOS Q ESTAMOS
  TRABAJANDO Y ENTREGAME USUARIO Y PASSWORD PARA OPERARLO".
- **OK de Qué Bien Olés (el cliente) para usar su marca:** **[A VALIDAR]** — no consta en esta sesión. Lo
  gestiona el dueño de GSG antes de mostrarle la tienda al cliente.

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
| Host publicado | `HOSTS_PUBLICADOS` en `src/lib/tenant.ts` (`quebienoles-erp.vercel.app` → subdominio `quebienoles`) |
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

# 3. Dominio: sumar quebienoles-erp.vercel.app al proyecto de Vercel del ERP (el mismo de todos los tenants)
```

El mail del OWNER es **provisional** (`dueno@quebienoles.com.ar`): cambiarlo por el real del dueño.

## Pendientes

Ver `docs/preventa/analisis-redes-quebienoles.md` §6 (presentación de dos perfumes, Bharara Bleu, ml, stock,
medios de pago, WhatsApp, fotos en alta, mail real).

— Elaborado por GSG
