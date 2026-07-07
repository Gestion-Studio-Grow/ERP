# Plantillería AR — prototipo de producto

Producto validado por la célula de I+D (Gestión Studio Grow). Catálogo de plantillas
(Sheets/Excel/Notion) localizadas a la normativa argentina. Producto digital puro, costo marginal
cero, venta one-time US$25-75. Diferencial: **diseño + know-how normativo AR**. Cuello real: **distribución**.

> ⚠️ PROTOTIPO AISLADO. Todo vive dentro de esta carpeta. No toca el ERP (`src/`, `prisma/`, etc.).
> No se instalan deps contra el repo raíz ni se hace deploy.

## Mapa de la carpeta
```
plantilleria/
├─ README.md            este archivo
├─ SPEC.md              alcance del MVP: 5 plantillas, páginas, checkout, pricing, qué NO entra
├─ ARQUITECTURA.md      stack (Next estático + Lemon Squeezy), modelo de datos, hosting barato
├─ PLAN.md              milestones semana a semana + plan de DISTRIBUCIÓN (el cuello)
├─ catalogo/            specs de armado de cada plantilla (el producto real)
│  ├─ README.md
│  └─ 01-control-monotributo.md   (plantilla estrella, detallada)
└─ sitio/               scaffold del sitio (landing + producto + gracias) en Next/React
   ├─ app/  components/  data/catalogo.ts
   └─ README.md
```

## Las 5 plantillas del MVP
1. **Control de Monotributo AR** — US$29 · alertas de recategorización (estrella)
2. **Presupuestador para Oficios** — US$39 · cotización materiales + mano de obra + margen
3. **Caja y Stock para Kiosco/Comercio** — US$35 · cierre de caja + stock mínimo
4. **Liquidación de Sueldos Simple AR** — US$45 · recibo, SAC, vacaciones (LCT)
5. **Finanzas Personales AR** — US$25 · presupuesto anti-inflación multi-moneda
   → **Pack completo: US$89** (ancla de precio)

## Primer paso concreto
Construir y probar la **plantilla de Monotributo** (`catalogo/01-control-monotributo.md`) contra un
caso real + crear la cuenta de Lemon Squeezy. Con eso ya hay algo vendible. Ver `PLAN.md`, semana 1.
