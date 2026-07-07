# SPEC — MVP Plantillería AR

> Producto digital puro: catálogo de plantillas (Sheets/Excel/Notion) localizadas a la normativa
> argentina. Costo marginal cero, venta one-time. Diferencial = **diseño premium + know-how normativo AR**.
> El cuello real no es construir, es **distribuir** (ver `PLAN.md`).
>
> Estado: kickoff de desarrollo. Alcance de esta spec = **primer catálogo vendible en 1-2 semanas**.

## 1. Objetivo del MVP

Tener online, en 2 semanas, una landing que venda **5 plantillas** con checkout que cobre en USD y
entregue el archivo automáticamente. Meta de negocio de la fase: **primeras ventas en semanas**,
meseta de **US$1.000/mes ≈ 37 ventas a ~US$27 neto** en 3-6 meses (números del análisis económico).

**Definición de "terminado" del MVP:**
1. Landing pública con las 5 plantillas + página de detalle por plantilla.
2. Botón de compra que abre checkout hosteado (Lemon Squeezy) y cobra en USD.
3. Entrega automática del archivo por email post-pago (la hace Lemon Squeezy) + página de gracias.
4. Las 5 plantillas **realmente construidas y probadas** (no mockups): es el 70% del trabajo real.

## 2. Las 5 plantillas del MVP (SKUs de arranque)

Elegidas por: demanda probada, dolor claro AR, y que el diferencial de localización sea evidente
(las plantillas globales NO sirven acá). Detalle de contenido en `sitio/data/catalogo.ts` y specs de
armado en `catalogo/`.

| # | Plantilla | Slug | Formato | USD | Público |
|---|-----------|------|---------|-----|---------|
| 1 | **Control de Monotributo AR** | `control-monotributo` | Sheets/Excel | 29 | Monotributistas, freelancers, oficios |
| 2 | **Presupuestador para Oficios** | `presupuestador-oficios` | Sheets/Excel | 39 | Plomeros, electricistas, pintores, gasistas |
| 3 | **Caja y Stock para Kiosco/Comercio** | `caja-stock-kiosco` | Sheets/Excel | 35 | Kioscos, almacenes, comercios de barrio |
| 4 | **Liquidación de Sueldos Simple AR** | `sueldos-simple` | Sheets/Excel | 45 | Pymes con 1-5 empleados |
| 5 | **Finanzas Personales AR (anti-inflación)** | `finanzas-personales-ar` | Sheets/Notion | 25 | Personas/familias |

**Ancla de precio / ticket alto:** `pack-completo` = las 5 por **US$89** (vs US$173 sueltas → ahorro US$84).

### Por qué estas 5 (y no otras)
- **Monotributo, Oficios y Kiosco** son las 3 destacadas: máximo dolor + máxima "argentinidad" del
  contenido (topes ARCA, presupuesto por oficio, cierre de caja con QR interoperable). Son las que
  ninguna plantilla en inglés cubre → moat de localización más fuerte. Arrancan como las 3 punta de lanza.
- **Sueldos** es el ticket más alto (US$45) y engancha al mismo comprador pyme que compra Kiosco → upsell natural.
- **Finanzas personales** es el ticket de entrada (US$25), el de mayor volumen potencial y el más
  compartible en redes (contenido masivo) → sirve de **imán de tráfico** para el resto.

## 3. Contenido concreto de cada plantilla

El detalle bullet-por-bullet (qué hojas, qué fórmulas, qué normativa embebida) vive en
`sitio/data/catalogo.ts` (campo `incluye` y `normativa`) y se expande en `catalogo/*.md`. Resumen del
know-how normativo que da el diferencial:

- **Monotributo:** escalas A-K con topes vigentes, acumulado móvil 12 meses, semáforo de
  recategorización, fechas ARCA (enero/julio). *Esto es lo que ninguna plantilla global tiene.*
- **Oficios:** cotización materiales + mano de obra, margen configurable, colchón de inflación,
  validez del presupuesto, PDF con logo.
- **Kiosco:** cierre de caja por medio de cobro (efectivo/débito/QR/crédito), stock mínimo con alerta,
  margen por producto.
- **Sueldos:** descuentos de ley (jubilación 11%, obra social 3%, sindical), SAC = mejor remun. del
  semestre / 2, vacaciones por antigüedad (LCT art. 150), provisiones mensuales.
- **Finanzas:** presupuesto por categorías, ahorro multi-moneda (pesos/dólar MEP-blue/plazo fijo),
  patrimonio medido en dólares (poder de compra real), metas ajustadas por inflación.

> **Disclaimer legal (obligatorio en cada plantilla y en la landing):** "Herramienta de organización.
> No reemplaza el asesoramiento de un contador matriculado. Verificá siempre los valores vigentes en
> ARCA/AFIP." Protege ante cambios de normativa y ante errores de cálculo.

## 4. Arquitectura de páginas (front)

Tres vistas, todas estáticas (ver `ARQUITECTURA.md` para el stack):

1. **Landing (`/`)** — hero con propuesta AR, grid de plantillas destacadas, prueba social, FAQ,
   bloque de pack, disclaimer, footer. Objetivo: llevar a la página de producto.
2. **Producto (`/producto/[slug]`)** — detalle de UNA plantilla: gancho, para quién, qué incluye,
   qué normativa cubre, capturas, precio y **CTA de compra** (abre checkout Lemon Squeezy). FAQ de compra.
3. **Gracias / entrega (`/gracias/[slug]`)** — post-pago: "revisá tu email", link de descarga de
   respaldo, instrucciones de cómo hacer una copia del Sheet/duplicar el Notion, y upsell al pack o
   a otra plantilla.

Copy y componentes reales en `sitio/` (React/Next, autocontenido, sin instalar deps del repo ERP).

## 5. Checkout y entrega (flujo de venta)

```
Landing → Producto → [Comprar] → Checkout Lemon Squeezy (USD, tarjeta) → Pago OK
   → Lemon Squeezy manda email con el archivo/link automáticamente
   → Redirect a /gracias/[slug] (respaldo + instrucciones + upsell)
```

- **Cobro:** Lemon Squeezy como Merchant of Record (paga impuestos por vos, cobra en USD desde AR).
  Fee ~5% + tarjeta. Alternativa/complemento AR: Mercado Pago para comprador local que paga en ARS.
- **Entrega:** cada producto en Lemon Squeezy lleva adjunto el archivo (o un link a un Google Sheet
  "solo lectura" que el comprador duplica). La entrega la dispara la pasarela, no hay backend propio.
- **Anti-piratería (mínimo del MVP):** el Sheet se entrega como copia solo-lectura + marca de agua con
  el email del comprador en una celda. No se invierte más en DRM (no vale la pena en el MVP).

## 6. Pricing por SKU

- Precios en **USD** (el cobro USD desde AR se liberó en 2025), con **equivalente ARS de referencia**
  visible en la landing (el argentino piensa en pesos). El ARS se recalcula a mano en cada actualización.
- Rango US$25-45 por unidad (dentro del benchmark US$25-75). **Pack US$89.**
- **Sin descuentos permanentes**: se usan lanzamientos con cupón por tiempo limitado (ver `PLAN.md`).

## 7. Qué NO entra en el MVP (anti-scope-creep)

- ❌ Cuentas de usuario / login / dashboard del comprador.
- ❌ Backend propio, base de datos, API. (La pasarela hace todo.)
- ❌ Pasarela propia / integración custom de pagos (se usa el checkout hosteado de Lemon Squeezy).
- ❌ Más de 5 plantillas (se suman SKUs recién con tracción validada).
- ❌ Multi-idioma / multi-país (el foco AR ES el producto; internacionalizar lo diluye).
- ❌ Versiones "premium con soporte", suscripción o actualizaciones automáticas pagas (fase 2).
- ❌ App/marketplace propio de terceros vendiendo sus plantillas (fase 3 lejana).
- ❌ DRM sofisticado, anti-copia fuerte (marca de agua básica alcanza).

## 8. Riesgos y mitigación (del análisis)
- **Distribución (el cuello real):** sin audiencia el catálogo no se vende → `PLAN.md` es 60% distribución.
- **Copia/piratería:** aceptada como costo del negocio; marca de agua básica + precio bajo desalienta.
- **Cambio de normativa AR:** único "riego". Versionar plantillas (v2026.1) y avisar por email a compradores.
- **NO hay riesgo de AI Overviews** (no dependemos de tráfico orgánico informativo).
