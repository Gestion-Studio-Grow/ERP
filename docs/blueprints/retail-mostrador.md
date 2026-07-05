# Blueprint "Retail / Mostrador" — definición (PO) + implementación

**Tipo:** spec de blueprint (PO + arquitectura) · **Fecha:** 2026-07-05
**Ancla:** ADR-002 (Core/Blueprint/Plugin), ADR-003 (Orden/Venta), ADR-019 (provisioning),
FUNDAMENTOS §2 (tenant = config sobre el Core, no fork). Candidato a ADR formal (ADR-024
ya está tomado; asignar el próximo libre al formalizar).

> **Regla:** UN blueprint retail, en código; los rubros (carnicería, verdulería,
> dietética, kiosco, fiambrería, indumentaria…) son **config pura** — catálogo,
> wording y marca. Un rubro nuevo = una entrada de datos, cero código.

---

## 1. Qué es (PO)

El blueprint **Retail/Mostrador** modela cualquier negocio que **vende productos en
mostrador y/o toma pedidos** (con o sin peso variable). `magra` (carnicería) es su
primera instancia; el mismo blueprint sirve verdulería, dietética, kiosco, fiambrería
o indumentaria cambiando **solo el rubro** (config). Es el patrón que multiplica
clientes sin multiplicar código: exactamente la economía del multi-tenant (FUNDAMENTOS §1).

## 2. Set de módulos del blueprint Retail (PO)

| Módulo | Qué resuelve | Config por rubro | Dónde vive | Estado |
|---|---|---|---|---|
| **POS / Orden** | Venta de mostrador + toma de pedidos (retiro/envío), estados, cobro | — (transversal) | Capability Core `Order`/`OrderItem` (`order-actions.ts`) | ✅ Implementado |
| **Venta por peso** | Precio/kg × gramaje → total; el diferencial de carnicería/verdulería/fiambrería/dietética | Qué productos son por peso (`sale:"kg"`) | Extensión `Product.saleUnit=WEIGHT`/`pricePerKg` (mec. A ADR-002) | ✅ Implementado |
| **Venta por unidad** | Precio unitario (kiosco, indumentaria, huevos, pollo entero) | Qué productos son por unidad (`sale:"u"`) | `Product.saleUnit=UNIT`/`price` | ✅ Implementado |
| **Stock** | Existencias por producto, aviso de stock bajo | Stock inicial del catálogo semilla | `Product.stock`/`lowStockAt` (Core) | ✅ Implementado (base) |
| **Catálogo** | ABM de productos + precios | El catálogo semilla del rubro | Core `catalog-actions.ts` | ✅ (ABM); ⏳ form retail de precios en el panel |
| **Proveedores / Compras** | Alta de proveedores + ingreso de stock por compra (costo, remito) | Proveedores típicos del rubro | Core (nuevo: `Supplier`/`Purchase`) | 📝 Spec — requiere schema (migración sin aplicar), no en este sprint |
| **Listas de precio** | Minorista / mayorista (o por lista) sobre el mismo catálogo | Qué listas usa el rubro | Core (nuevo: `PriceList` + precio por lista) | 📝 Spec — requiere schema, no en este sprint |
| **Cuenta corriente** | Fiado / mayoristas: saldo, límite, resúmenes | Si el rubro la usa (carnicería/fiambrería sí) | Core (nuevo: `Account`/`Ledger`) | 📝 Spec — requiere schema, no en este sprint |

**Config vs código:** el **código** (POS, venta peso/unidad, stock) es UNO, del Core, y
lo comparten todos los rubros. Lo **config por rubro** es: catálogo semilla, wording,
branding por defecto y qué módulos usa el rubro (`modules`). Los tres módulos 📝 (proveedores/
compras, listas de precio, cuenta corriente) están **definidos** acá como parte del blueprint;
su implementación agrega modelos al Core (migraciones **escritas y sin aplicar**) en un
sprint siguiente — no se forkea nada, se extiende el Core y los rubros los activan por config.

## 3. Implementación (fullstack) — lo hecho este sprint

`src/blueprints/retail/`:
- **`rubros.ts`** — config pura por rubro: `RetailRubro` = { label, `wording` (copy del rubro
  para vidriera/POS), `modules` (del set §2), `brandingDefaults`, `catalog` }. **6 rubros**
  cargados: carnicería, verdulería, dietética, kiosco, fiambrería, indumentaria. Incluye el
  wording genérico de fallback y la resolución rubro←slug (mientras no exista `Tenant.blueprintId`).
- **`index.ts`** — `makeRetailBlueprint(rubroId)` arma un `Blueprint` del Core (mismo seeder de
  `Product`, mismas capabilities) desde un rubro. Exporta `RETAIL_BLUEPRINTS` (un blueprint por
  rubro, listo para registrar) y `RETAIL_RUBRO_HINTS` (pistas rubro→blueprint para el
  `resolveBlueprint()` del onboarding). Cero schema propio.

> **Agregar un rubro nuevo** (p. ej. panadería): agregar un `RetailRubro` a `rubros.ts` con su
> catálogo/wording/branding. No se toca código. Eso es la reutilización.

## 4. UX — "hecho para ese negocio" (`/tienda`)

La vidriera pública `src/app/tienda/` es **una**, y se siente propia de cada negocio combinando
dos ejes que ya existen en la plataforma:
- **Color de marca por tenant** — `getTenantAccent()` (capa de marca del ERP: magra=oxblood,
  spa=petróleo) inyecta `--accent`; la vidriera lo usa en hero, precios y CTAs. Base neutra
  premium (superficies hueso, texto tinta) igual para todos → cambia la marca, no el layout.
- **Wording del rubro** — títulos y copy salen del rubro: carnicería "Nuestros cortes",
  verdulería "Frutas y verduras", fiambrería "Fiambres y quesos", indumentaria "Colección"…
  El botón, la aclaración de peso y la bajada también. El cliente lee su negocio, no un genérico.

Alineado a la sesión de diseño: usa su **acento por tenant** y su base neutra, sin hardcodear
colores de un rubro. (Deuda: cuando exista `Tenant.blueprintId`, el rubro se lee de ahí en vez
del mapa por slug; y el theming genérico por tokens reemplaza los estilos inline de la vidriera.)

## 5. Provisioning — integración (coordinación con la sesión de blueprints)

El registro central de blueprints (`src/blueprints/index.ts`) y el CLI de provisioning los está
editando **en paralelo la sesión de onboarding** (agregó `resolveBlueprint(rubro)` + comodín
`generico`). Para **no pisar** ese trabajo (pathspec), este sprint NO commitea esos dos archivos.
La integración es **aditiva y trivial** (2 puntos), lista para mergear:

```ts
// en src/blueprints/index.ts
import { RETAIL_BLUEPRINTS, RETAIL_RUBRO_HINTS } from "./retail";
const REGISTRY = { ...serviciosBlueprint..., ...RETAIL_BLUEPRINTS };   // (1) registrar rubros
const RUBRO_HINTS = [ ...hints_existentes, ...RETAIL_RUBRO_HINTS ];     // (2) hints de descubrimiento
```

Con eso, `--blueprint verduleria` (atajo) y el `resolveBlueprint("verdulería…")` del onboarding
caen al rubro correcto. `--blueprint retail --rubro <x>` se soporta agregando el par
`retail`+`--rubro` en el CLI (o resolviendo `retail` → `makeRetailBlueprint(rubro)`).
**Nota:** el rubro `carniceria` de retail supersede al `carniceria.ts` standalone — son lo mismo,
este es la versión generalizada; consolidar en el merge.

## 6. Verificación (costo 0, sin tocar Neon)

- `tsc --noEmit`: **0 errores en el código fuente** de este sprint (los únicos 4 son validadores
  de ruta generados en `.next/` que referencian la vieja `/carniceria` borrada — se auto-regeneran).
- Prueba funcional del módulo retail: los 6 rubros generan blueprint, catálogo (14/12/11/10/10/10
  ítems) y wording; la resolución por slug da `magra`→"Nuestros cortes" y desconocido→genérico.
- **Nada aplicado a Neon**: la migración POS del ciclo 2 sigue sin aplicar; la vidriera y el seed
  sólo corren contra DB local con la migración aplicada (Gate 2).

## 7. Roadmap (próximo)

1. Mergear la integración §5 con la sesión de blueprints (registro + hints + `--rubro`).
2. Módulos 📝 del set: **listas de precio** (minorista/mayorista) → schema + UI; **proveedores/
   compras** → schema (Supplier/Purchase) + ingreso de stock; **cuenta corriente**. Migraciones
   escritas y sin aplicar, un módulo por sprint.
3. `Tenant.blueprintId` (migración sin aplicar) → resolver rubro/nav por tenant (no por slug) y
   filtrar el menú del panel por los módulos del rubro (una carnicería no ve "Agenda").
4. Theming por tenant genérico (tokens) → reemplaza los estilos inline de la vidriera.
