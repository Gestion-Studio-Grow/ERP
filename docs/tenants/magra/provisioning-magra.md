# Recipe de alta del tenant MAGRA Meat Market

**Tipo:** recipe de provisioning (config del tenant real) · **Fecha:** 2026-07-05
**Basado en:** `docs/preventa/analisis-redes-magra.md` (datos reales verificados en sus redes/web).
**Distinción clave:** el **rubro** `carniceria` es el template reusable (catálogo/ wording genéricos
premium); la **identidad real de magra** (nombre, dirección, WhatsApp, IG, tagline) es config del
**tenant**, y entra por los flags de branding del alta (pisan los defaults del rubro).

---

## 1. Comando de alta (con datos REALES de magra)

> Correr contra una **DB local** (branch de Neon o Postgres local, NUNCA prod) con la migración POS
> aplicada y RLS activo si ya hay otro tenant. No aplica a Neon sin OK (Gate 2).

```bash
npm run provision -- \
  --name "MAGRA Meat Market" \
  --slug magra \
  --owner-email hola@magrameatmarket.com.ar \
  --blueprint carniceria \
  --short-label "MAGRA · Canning" \
  --city "Canning, Buenos Aires" \
  --address "José Champagnat 4351, Local 1 – Sotavento Point, Canning" \
  --whatsapp 5491161354042 \
  --instagram @tiendamagra \
  --hours-label "Lun a Sáb 10–20h · Dom 9–13h" \
  --contact-email hola@magrameatmarket.com.ar \
  --contact-note "Esto no es una carnicería. Carnes premium envasadas al vacío. Delivery gratis en Canning, San Vicente, Guernica, Ezeiza y Monte Grande."
```

Con esto la vidriera `/tienda` muestra: el **acento de marca de magra** (oxblood, ya mapeado en
`src/lib/branding.ts`), su **tagline real** en el hero (contactNote), su WhatsApp real en el CTA
"Pedir por WhatsApp", y el **catálogo premium** del rubro carnicería.

## 2. Copy y catálogo (fieles a su web)

- **Voz firma + estructura de magra** (`src/tenants/storefront.ts`, resuelta por slug): la vidriera
  `/tienda` ESPEJA su web — frase madre *"Esto no es una carnicería."*, 4 **propuestas de valor**
  (envío gratis · calidad premium garantizada · todos los medios de pago · atención WhatsApp), sección
  **"Envasados al vacío"** (vaca Don Ramón / cerdo magro / pollo orgánico, cada una con CTA de pedido por
  WhatsApp), **"Productos gourmet"**, tira de **proveedores** (Don Ramón, Tinos, Breaders, Paladini,
  Lamberti, Formagge, PizzaZen, Maderasa), **reviews** reales (Matías R., Jesica F., Macarena A. — 5★),
  **about** (*"Probadas por nosotros, elegidas para vos."*) y **footer** completo (dirección, horarios,
  contacto, zonas, pagos). Premium-minimalista con contraste (secciones claras adelante, about+footer
  oscuros). **Ángulo de marketing** (reforzando la frase madre): *"Cortes de restaurante. Precio de
  barrio."* — calidad de las **mejores parrillas / restaurantes top** a precio de carnicería de barrio.
  ⚠️ **Legal:** en genérico/evocativo, SIN nombrar restaurantes ni marcas de terceros (nada de
  publicidad comparativa). El salto de valor sobre su web actual: **catálogo + carrito + toma de pedidos
  + POS de mostrador** integrados (deja de depender de Bistrosoft y del WhatsApp manual). Un tenant sin
  copy propio cae al wording genérico del rubro.
- **Catálogo del rubro `carniceria`** ya carga las **líneas reales**: vaca (Estancia Don Ramón, al
  vacío), cerdo magro, pollo orgánico, preparados y una **línea gourmet** (pasta italiana, conserva
  importada, ensalada envasada, pescado congelado). Precios **provisionales** hasta la lista real (§3).

Productos reales verificados (referencia; precios **provisionales**):

| Categoría | Productos reales (de sus redes) | Venta | Estado precio |
|---|---|---|---|
| Vacuno | Cortes Angus (**Estancia Don Ramón**, distribuidor oficial) envasados al vacío | kg | provisional |
| Cerdo | Cortes magros, bajos en grasa | kg | provisional |
| Pollo | Pollo orgánico | kg/u | provisional |
| Gourmet | **Pasta italiana** (Lamberti), **conservas importadas**, **pescado congelado**, ensaladas/vegetales envasados | u | provisional |
| Marcas | Paladini, Formagge, Tinos, Breaders, Pizzazen, Maderasa | — | — |

*(El gourmet no está en el seed del rubro `carniceria` a propósito: no toda carnicería lo vende. Se
agrega como catálogo del tenant magra cuando el dueño confirme SKUs/precios reales.)*

## 3. Pendiente del dueño para pasar a producción

- **Lista de precios real + SKUs** (hoy su tienda corre en Bistrosoft y carga por JS; ver
  `competencia-bistrosoft.md` §"magra usa Bistrosoft"). Reemplaza los precios provisionales.
- **Paleta de marca exacta** (hex) + logo/tipografía → refinar el acento/theming (hoy oxblood aprox.).
- **Fotos de producto** con permiso de uso para la vidriera.
- Confirmar **modelo de venta** (pack a precio fijo vs. por kg pesado). Hoy: cortes por kg + packs/gourmet por unidad.

## 4. Notas de fidelidad al negocio real

- Tagline **"Esto no es una carnicería"** → va en el hero (contactNote), es su posicionamiento.
- Tono **descontracturado** ("buen gusto y hambre") → el copy de la vidriera acompaña, no es acartonado.
- **Delivery gratis** en 5 zonas y **WhatsApp** como canal → reflejado en el contactNote y el CTA de WhatsApp.
- **Envasado al vacío** → presente en el wording del rubro ("envasados al vacío").
- **Operación real de mostrador (confirmada por el dueño):** el cliente elige del exhibidor y en la
  **caja** le pesan (por kg) o le cobran por unidad, y listo. El POS del backoffice (`/admin/pedidos`,
  "Caja / mostrador") refleja exactamente eso: elegir producto → **auto-foco a pesar/contar** → **Enter
  encadena** al siguiente → **Cobrar**. Venta por kg y por unidad conviven en el mismo flujo, sin
  fricción (no es un e-commerce). La vidriera `/tienda` es el canal ONLINE aparte (delivery/WhatsApp).
