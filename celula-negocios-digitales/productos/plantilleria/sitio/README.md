# Sitio Plantillería AR — scaffold

Landing + páginas de producto + página de gracias/entrega. Next.js App Router, exportado **estático**.

> ⚠️ PROTOTIPO AISLADO. Las dependencias se instalan **solo dentro de esta carpeta** (`sitio/`),
> nunca contra el ERP raíz. En el kickoff los `.tsx` son scaffold autocontenido (diseño + copy reales)
> y no se instalaron deps.

## Estructura
```
app/
  layout.tsx              layout raíz (header, footer, disclaimer global)
  page.tsx                LANDING (hero, catálogo, pack, prueba social, FAQ)
  globals.css             design tokens + estilos
  producto/[slug]/page.tsx   detalle de cada plantilla + CTA de compra
  gracias/[slug]/page.tsx    post-pago: instrucciones de entrega + upsell
components/
  CardPlantilla.tsx  BotonComprar.tsx  FAQ.tsx
data/
  catalogo.ts             SKUs (fuente de verdad: precios, contenido, checkoutUrl)
```

## Para correrlo de verdad
```bash
cd sitio          # ¡dentro de esta carpeta!
npm install
npm run dev       # http://localhost:3000
npm run build     # genera /out estático para subir a Netlify/Vercel/Cloudflare Pages
```

## Para pasar a producción
1. Crear los productos en Lemon Squeezy (1 por plantilla + el pack), subir cada archivo.
2. Copiar cada checkout URL a `data/catalogo.ts` (reemplazar los `PLACEHOLDER`).
3. Configurar el redirect post-pago de LS a `/gracias/[slug]/`.
4. Deploy del sitio + apuntar el dominio.

Detalle en `../ARQUITECTURA.md` y `../SPEC.md`.
