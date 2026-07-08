# Sitio Plantillería AR — tienda demo estática

Landing + fichas de producto + carrito + checkout Mercado Pago (MODO DEMO) + página de gracias.
**Generador estático sin framework** (template strings TS → HTML) + un bundle de cliente vanilla.
Cero dependencias de runtime, cero backend, cero secretos → publica en cualquier host de estáticos.

> ⚠️ AISLADO. Las dependencias (solo de build: tsx/esbuild/typescript) se instalan **dentro de esta
> carpeta** (`sitio/`), nunca contra el ERP raíz. El checkout es **demo**: no cobra plata real ni
> guarda datos reales (ADR-030/031).

## Estructura
```
data/catalogo.ts     SKUs = fuente única de verdad (precios, contenido, normativa, bundle)
src/checkout.ts      lógica pura del carrito + orden demo (isomórfica, testeada)
src/render.ts        render de todas las páginas a HTML (server-side, sin runtime)
src/client.ts        JS del navegador (carrito en localStorage, checkout MP demo) → esbuild → out/app.js
styles/globals.css   design tokens + estilos (copiado tal cual a out/)
build.ts             genera ./out (10 páginas + CSS)
test/                node:test (checkout puro + smoke de render)
```

## Correr las vallas y construir
```bash
cd sitio
npm install          # solo build-deps (tsx, esbuild, typescript)
npm run typecheck    # tsc --noEmit
npm run test         # node:test vía tsx
npm run build        # → sitio/out/  (HTML + globals.css + app.js)
npm run verde        # las tres de una
npm run serve        # sirve out/ en http://localhost:4173 para probar
```
> En el entorno del sprint (sin `npm install`) se corre con el toolchain del ERP:
> `node_modules/` es un junction a `estetica-erp/node_modules` y se invoca `node_modules/.bin/{tsc,tsx,esbuild}`.

## Publicar la demo (costo cero)
Ver **`../PUBLICAR.md`** — runbook §C de 1 clic (Netlify Drop / Vercel CLI / conectar repo).
Los `netlify.toml` y `vercel.json` ya dejan el build zero-config.

## Para pasar a producción (post-VENTA, no ahora)
Reemplazar el checkout demo por cobro real (Mercado Pago y/o Lemon Squeezy MoR para USD), subir los
archivos reales de las 5 plantillas, dominio propio y analítica. Detalle en `../ARQUITECTURA.md`,
`../SPEC.md` y `../PUBLICAR.md` (sección final).
