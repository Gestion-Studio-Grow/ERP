# ARQUITECTURA — Plantillería AR

> Principio rector: **la mínima arquitectura posible.** Es un producto digital estático con checkout
> hosteado. No hay backend, no hay base de datos, no hay servidor que mantener. Todo el "peso"
> operativo lo llevan servicios de terceros con free tier. Casi todo el trabajo es diseño + contenido.

## 1. Stack recomendado

| Capa | Elección | Por qué | Costo |
|------|----------|---------|-------|
| **Front** | Next.js (App Router) exportado **estático** (`output: 'export'`) | SSG puro, cero servidor, SEO nativo, componentes React reales. El estudio ya lo domina. | US$0 |
| **Hosting** | Netlify o Vercel (free tier) o Cloudflare Pages | Sitio 100% estático → entra sobrado en el free tier. Deploy con `git push`. | US$0 |
| **Checkout + entrega** | **Lemon Squeezy** (Merchant of Record) | Cobra en USD desde AR, paga los impuestos por vos, entrega el archivo automático, checkout hosteado (cero PCI). Fee ~5% + tarjeta. | ~5% por venta |
| **Cobro local (opcional fase 2)** | Mercado Pago | Para el comprador AR que quiere pagar en pesos con tarjeta/dinero en cuenta. | Fee MP |
| **Los archivos (el producto)** | Google Sheets / Excel / Notion / Docs | El producto en sí. Se entregan como copia solo-lectura (Sheets/Notion) o archivo adjunto (Excel). | US$0 |
| **Analítica** | Plausible (o Umami self-host) / GA4 | Ver qué plantilla convierte. Plausible es liviano y sin cookies. | US$0-9/mes |
| **Email marketing** | MailerLite / beehiiv (free tier) | Capturar el email del que NO compró (lead magnet) y avisar lanzamientos. Clave para la distribución. | US$0 |
| **Dominio** | `.com.ar` o `.com` | Marca. | ~US$10-15/año |

**Costo fijo mensual objetivo: ~US$0-15/mes** (dominio + analítica opcional). El resto es variable por venta.

### Por qué Lemon Squeezy y no una pasarela propia
- **Merchant of Record:** LS es el vendedor legal ante el fisco → resuelve IVA/impuestos internacionales
  y cobro en USD desde Argentina sin montar estructura. Para un producto one-time es el camino más corto.
- **Entrega incluida:** subís el archivo (o link) al producto y LS lo manda por email al pagar. Cero backend.
- **Checkout hosteado:** no tocamos datos de tarjeta (cero PCI, cero fraude propio).
- Alternativas evaluadas: Gumroad (fee más alto), Hotmart (9,9% + US$0,50, fuerte en LATAM, opción B),
  Paddle (más B2B/SaaS). LS gana por simpleza + fee + UX del checkout.

## 2. Modelo de datos mínimo

**No hay base de datos.** El "modelo" es un archivo estático versionado en el repo del sitio:

- `sitio/data/catalogo.ts` → array de `Plantilla` (slug, nombre, gancho, formato, precioUSD,
  precioARSref, publico, dolor, incluye[], normativa[], destacada, checkoutUrl) + `BUNDLE`.
- Es la **única fuente de verdad**: la landing, cada página de producto y cada página de gracias se
  generan desde ahí. Agregar una plantilla = agregar un objeto al array + subir el archivo a LS.

Los "datos transaccionales" (quién compró, cuánto) **viven en el panel de Lemon Squeezy**, no en el sitio.
Para reporting basta el dashboard de LS + la analítica del sitio.

```
Fuente de verdad del catálogo:  sitio/data/catalogo.ts   (en el repo, estático)
Fuente de verdad de las ventas: panel de Lemon Squeezy    (SaaS externo)
El producto entregable:         Google Sheet / Excel / Notion (en Drive/Notion del estudio)
```

## 3. Estructura de archivos del sitio

```
sitio/
├─ app/
│  ├─ layout.tsx              # layout raíz (fuentes, meta, disclaimer global)
│  ├─ page.tsx                # LANDING (/)
│  ├─ globals.css             # design tokens + estilos base
│  ├─ producto/[slug]/page.tsx   # PÁGINA DE PRODUCTO (/producto/xxx)
│  └─ gracias/[slug]/page.tsx    # PÁGINA DE GRACIAS/ENTREGA (/gracias/xxx)
├─ components/
│  ├─ CardPlantilla.tsx       # tarjeta de plantilla (grid de la landing)
│  ├─ BotonComprar.tsx        # CTA que abre el checkout de Lemon Squeezy
│  ├─ Hero.tsx                # hero de la landing
│  ├─ FAQ.tsx                 # acordeón de preguntas frecuentes
│  └─ Disclaimer.tsx          # aviso legal reutilizable
├─ data/
│  └─ catalogo.ts             # SKUs (fuente de verdad)
├─ next.config.js             # output: 'export' (estático)
└─ package.json               # deps del sitio (NO se instalan contra el ERP)
```

> **Aislamiento:** este `package.json` es del prototipo. Para correrlo de verdad se hace
> `cd sitio && npm install` **dentro de esta carpeta**, nunca contra el repo ERP raíz. En este kickoff
> los `.tsx` son scaffold autocontenido (diseño + copy reales) y no se instalaron dependencias.

## 4. Flujo de deploy (cuando se quiera publicar)

```
1. cd sitio && npm install          # solo la primera vez, aislado
2. npm run build                    # genera /out estático
3. Conectar repo del sitio a Netlify/Vercel → deploy automático en cada push
4. En Lemon Squeezy: crear 1 producto por plantilla + el pack, subir el archivo,
   copiar la checkout URL de cada uno a data/catalogo.ts (reemplazar los PLACEHOLDER)
5. Apuntar el dominio al hosting
```

## 5. Cómo se hostea barato (resumen)
- Sitio estático → **free tier** de Netlify/Vercel/Cloudflare Pages sobra (tráfico bajo, sin servidor).
- Sin DB, sin backend, sin funciones serverless → **nada que escalar ni que se caiga**.
- El único costo fijo real es el **dominio** (~US$10-15/año). Analítica y email arrancan en free tier.
- El costo variable (fee de pasarela ~5%) sale **solo cuando hay venta** → riesgo financiero casi nulo.

## 6. Decisiones abiertas (supuestos tomados, revisar en implementación)
- **LS vs Hotmart:** se asume LS por simpleza; si el mix de compradores resulta muy AR-que-paga-en-pesos,
  sumar Mercado Pago o evaluar Hotmart como principal. Supuesto: arrancar LS, medir, decidir.
- **Sheets vs Excel:** se entregan ambos formatos donde aplica (el usuario elige). Notion solo donde suma.
- **Dominio:** pendiente de elegir/registrar (ver `PLAN.md`, semana 1).
