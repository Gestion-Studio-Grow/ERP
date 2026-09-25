---
id: ADR-102
nivel: dominio
dominio: [Catálogo, Stock, Datos]
depends_on: [ADR-002, ADR-100]
---

# ADR-102 — Variantes de producto (talle, color): cada variante es un producto; el «modelo» las agrupa

**Estado:** Propuesto (2026-09-25). Diseño: no hay código, ni migración en `prisma/migrations`, ni nada
aplicado en ninguna base. Recomendación «sumar variantes al plan» aprobada por el dueño el 25/09. Los
slices son ENG-340 a ENG-348 de `docs/agent/BACKLOG.md`. · **Depende de:** ADR-002 (extensión retail
de `Product`, mecanismo A), ADR-100 (dinero en decimal: `Product.price` está en la porción P2b). ·
**Relacionados:** ADR-060 (compras y devoluciones), ADR-098 (el ERP por apps).

## Contexto (medido en el código)

- **No hay variantes.** `Product` (`prisma/schema.prisma:538-573`) tiene nombre, `stock`, `price`,
  `pricePerKg` y `trackStock`; no tiene SKU ni código, ni nada que agrupe filas.
  `grep -niw "variant|variante|talle" prisma/schema.prisma` da 1 línea (`:1721`), y es otra cosa (el
  patrón VARIANTE de ADR-055, del estudio contable). En A Dos Manos una zapatilla en talle 42 es un
  producto y la misma en talle 43 es otro.
- **Eso ya anda para vender y para el stock.** El stock tiene una sola escritura: `recordMovement`
  (`src/lib/stock/ledger.ts:144`), con la guarda anti-sobreventa atómica `stock: { gte }` sobre la fila
  del producto (`:151-154`), que usa la venta (`src/lib/order-core.ts:555`). Una fila por talle es
  exactamente el grano que esa guarda necesita.
- **Lo que falta es todo lo de alrededor:** la vidriera muestra una tarjeta por talle
  (`src/app/tienda/vidriera/catalogo-core.ts:21`: `ProductoVidriera` es una fila de `Product`); no hay
  código para buscar o escanear en Vender; cambiar el precio de un modelo es editar cada talle; una
  compra por curva de talles se tipea renglón por renglón; y nadie ve el stock total del modelo.
- **Quién apunta a `Product`:** 4 tablas (`ServiceProduct` `:581`, `OrderItem` `:1224`,
  `StockPurchaseItem` `:1437`, `StockMovement` `:1480`) y 52 archivos de `src/lib` que nombran
  `productId` (`grep -rln productId src/lib --include=*.ts | grep -v .test. | wc -l`). El renglón de
  venta guarda una foto del nombre (`OrderItem.name`, `:1229`).
- **El libro de IVA no lee productos:** `src/lib/libros/libro-iva-loader.ts` trabaja por comprobante
  (`grep -n product` da 0).

## Decisión

1. **Una variante es un `Product`:** una fila por combinación (Zapatilla Pro, 42, negro). Su stock, su
   precio, su costo y su SKU viven en esa fila, como hoy. **Ningún camino de plata ni de stock cambia:**
   Vender, `order-core`, el libro de stock, compras, devoluciones al proveedor, costo promedio,
   anulaciones y el libro de IVA siguen trabajando con `productId`.
2. **El modelo es una tabla nueva, `ProductGroup`** («modelo» en pantalla): `id`, `tenantId`, `name`,
   `eje1` (p. ej. «Talle»), `eje2` (p. ej. «Color», puede faltar), `descripcion`, `imagenUrl`, `active`,
   `deletedAt`, fechas. **No tiene precio ni stock.**
3. **`Product` suma 4 columnas, todas nulas:** `groupId`, `sku`, `opcion1` (el valor del eje 1: «42»),
   `opcion2` («Negro»).
   - SKU único por negocio (`@@unique([tenantId, sku])`; varios nulos no chocan). Sirve también a los
     productos sin variantes.
   - Una combinación no se repite dentro de un modelo: índice único
     `("groupId", "opcion1", "opcion2") NULLS NOT DISTINCT WHERE "groupId" IS NOT NULL` (sin
     `NULLS NOT DISTINCT`, «42 / sin color» entraría dos veces).
   - **Mismo negocio, garantizado por la base:** FK compuesta (`groupId`, `tenantId`) →
     `ProductGroup(id, tenantId)`, con `@@unique([id, tenantId])` en el modelo. Hoy el schema no tiene
     FK compuestas; se usa acá por la invariante 1: un producto de magra no puede quedar colgado de
     un modelo de A Dos Manos aunque un error de código pase el id equivocado, y eso tiene que
     cumplirse también con RLS apagado (el dueño de las tablas lo saltea).
   - `ProductGroup` lleva RLS con la política `tenant_isolation` del patrón vigente
     (`prisma/migrations/20260815120000_lead_campania/migration.sql:49-53`). El candado de aplicación
     la cubre sin cambios: `MODELOS_SIN_TENANT` sólo contiene `Tenant` (`src/lib/tenant-scope.ts:45`).
4. **El nombre se guarda completo en cada variante** («Zapatilla Pro — 42 · Negro»), armado por una
   sola función (`nombreDeVariante`) al crear la grilla o al renombrar el modelo, en la misma
   transacción. Así los 52 lectores y la foto de `OrderItem.name` no cambian.
5. **Precio: no hay herencia al leer.** La idea «la variante sin precio usa el del modelo» se
   descarta: `Product.price` nulo ya significa «no se vende suelto» (`schema.prisma:556`), y la venta,
   la vidriera y el catálogo leen `Product.price`; heredar al leer agregaría una segunda regla de
   precio en el camino de la plata. En cambio: la grilla crea todas las variantes con el mismo
   precio; «precio del modelo» es una acción que pone un precio a todas (o a las elegidas) en una
   transacción **por el mismo camino que ya cambia precios** (`src/lib/catalogo/precios-tx.ts`, con su
   auditoría `precios-auditoria.ts`), no un escritor nuevo de `Product.price`; y cualquier variante
   puede tener su precio propio editando su fila. La pantalla del modelo muestra el rango
   (mínimo–máximo), calculado.
6. **El stock del modelo es la suma de sus variantes, calculada al leer.** Nunca se guarda
   (invariante 4).
7. **Configuración, no código (invariante 6).** Los ejes son datos del modelo: talle y color en A Dos
   Manos, aroma y tamaño en Shine Velas. La grilla aparece en Catálogo, donde ya se cargan
   productos: no se crea un eje de configuración nuevo. Un producto sin `groupId` es exactamente el
   de hoy: CH y magra no ven ningún cambio si no crean modelos.
8. **Dos ejes como máximo, y hasta 100 combinaciones por modelo** (*provisional a confirmar* con A Dos
   Manos). Talle × color cubre calzado e indumentaria; no hay un caso medido con tres. Un tercer eje
   es una columna `opcion3` aditiva.

### Qué cambia en cada lugar

| Lugar | Qué cambia |
|---|---|
| Stock | Nada en el libro de stock ni en la guarda. Suma: la grilla del modelo con el stock de cada combinación y el total (calculado). La alerta de poco stock sigue por fila (`lowStockAt`). |
| Vender | El cobro no cambia. Suma: buscar por SKU exacto (un lector de código de barras escribe el código y Enter). El buscador ya encuentra «pro 42 negro» por el nombre completo. |
| Vidriera | `catalogo-core.ts` agrupa por `groupId`: una tarjeta con selectores; la combinación sin stock (si el producto controla stock) queda deshabilitada. El carrito lleva el `productId` de la variante: pedido y WhatsApp sin cambio, salvo el nombre, que ya viene completo. |
| Compras | `StockPurchaseItem` sigue por producto. Suma: cargar por curva (talle × cantidad) arma N renglones en la misma compra. |
| Devoluciones y costo | Por variante, como hoy (`stock/supplier-return.ts:102`). |
| Libro de IVA y ARCA | Sin cambio: trabajan por comprobante. Cuando ENG-312 agregue la alícuota por producto, la grilla la copia a todas las variantes y su test incluye una variante. |
| Reportes | «Más vendidos» sigue por variante; suma la opción «por modelo» (por `productId` → `groupId`; un producto dado de baja conserva su `groupId`). |
| Planilla de catálogo | Columnas SKU, modelo, opción 1 y opción 2 (`catalogo/planilla-core.ts`). |
| Réplica de marca | `multilocal/catalogo-marca-core.ts` copia productos entre locales: tiene que copiar también el modelo (sin medir cómo lo hace hoy; ENG-348). |
| D1 (ADR-100) | `Product.price` está en la porción P2b. Como el precio del modelo pasa por `precios-tx.ts`, P2b lo migra con el resto: no hay un escritor más que buscar. |

## Alternativas descartadas

**A · Tabla `ProductVariant` hija, con el stock y el precio en la variante** (el modelo de Shopify).
Es el de libro, pero acá mueve el stock a otra tabla: las 4 tablas que apuntan a `Product` suman
`variantId`, `recordMovement` cambia su guarda, y cambian la venta, las anulaciones, las devoluciones y
el costo (52 archivos). Queda además la pregunta de dónde está el stock de un producto sin variantes:
o en dos lugares (una segunda escritura del stock), o hay que crearle una variante a cada producto de
los cuatro negocios, con un relleno sobre la base del único negocio en producción (CH) y en su camino
de cobro. Todo eso para dar la misma capacidad que la decisión elegida.

**B · Todo producto tiene al menos una variante.** Es A más el relleno obligatorio. Toca a CH.

**C · Atributos en un JSON dentro de `Product`, sin tabla de modelo.** La base no puede impedir una
combinación repetida, no hay dónde poner el nombre y la foto del modelo, y la vidriera agruparía por
texto.

**D · Seguir como hoy y agrupar por el comienzo del nombre.** Se rompe con el primer error de tipeo.

**E · Precio heredado al leer.** Descartada en el punto 5.

## Migración (aditiva; borrador, NO está en `prisma/migrations`)

Se escribe como migración en ENG-340, se prueba contra la base efímera (`src/test/base-efimera.ts`) y
se aplica en Neon sólo con el OK del dueño, en el lote (`prisma/lote-deploy.txt`), con
`prisma migrate deploy`. El índice con `NULLS NOT DISTINCT` pide Postgres 15 o más (la base local mide
16.13; la versión de Neon no está medida: si fuera menor, el índice va sobre
`("groupId", "opcion1", COALESCE("opcion2", ''))`).

```sql
-- Subida
CREATE TABLE "ProductGroup" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL REFERENCES "Tenant"("id"),
  "name"        TEXT NOT NULL,
  "eje1"        TEXT NOT NULL,
  "eje2"        TEXT,
  "descripcion" TEXT,
  "imagenUrl"   TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "deletedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ProductGroup_id_tenantId_key" ON "ProductGroup"("id", "tenantId");
CREATE INDEX "ProductGroup_tenantId_idx" ON "ProductGroup"("tenantId");

ALTER TABLE "Product"
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "sku"     TEXT,
  ADD COLUMN "opcion1" TEXT,
  ADD COLUMN "opcion2" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_tenantId_fkey"
  FOREIGN KEY ("groupId", "tenantId") REFERENCES "ProductGroup"("id", "tenantId")
  ON DELETE RESTRICT;  -- un modelo se da de baja con deletedAt; no se borra con variantes colgadas
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
CREATE UNIQUE INDEX "Product_groupId_opcion1_opcion2_key"
  ON "Product"("groupId", "opcion1", "opcion2") NULLS NOT DISTINCT WHERE "groupId" IS NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_variante_completa"
  CHECK ("groupId" IS NULL OR "opcion1" IS NOT NULL);

ALTER TABLE "ProductGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductGroup"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON "ProductGroup" TO app_rls;  -- sin DELETE: la baja es lógica

-- Vuelta atrás (migración nueva, DESPUÉS de volver el código que lee groupId)
ALTER TABLE "Product" DROP CONSTRAINT "Product_variante_completa";
DROP INDEX "Product_groupId_opcion1_opcion2_key";
DROP INDEX "Product_tenantId_sku_key";
ALTER TABLE "Product" DROP CONSTRAINT "Product_groupId_tenantId_fkey";
ALTER TABLE "Product" DROP COLUMN "opcion2", DROP COLUMN "opcion1", DROP COLUMN "sku", DROP COLUMN "groupId";
DROP TABLE "ProductGroup";
```

**Qué se pierde con la vuelta atrás:** sólo el agrupamiento y los SKU. Cada variante queda como un
producto suelto con su stock, su precio y sus ventas, que es el estado de hoy. Si ya hay modelos
cargados, la vuelta atrás altera datos de un cliente y la decide el dueño (estándar §10); antes se
exporta la planilla con SKU y modelo a `.qa/`.

**Por qué no corta a nadie:** todas las columnas nuevas son nulas y sin valor por defecto (desde
Postgres 11, `ADD COLUMN` nula es un cambio de metadatos, sin reescribir la tabla); el código de hoy no
las nombra, Prisma ignora columnas que no conoce, y `scripts/predeploy-check.mts:95-116` sólo exige
que existan las columnas del schema (las que sobran en la base no frenan el build).

## Consecuencias

- **(+)** Talles y colores sin tocar la venta, el stock ni lo fiscal: el riesgo sobre la plata y sobre
  CH es cero por construcción, y cada slice se prueba solo.
- **(+)** El SKU sirve a los cuatro negocios (buscar y escanear), no sólo a los que tienen talles.
- **(−) Asumido: el catálogo crece por combinación.** Un modelo con 8 talles y 3 colores son 24 filas
  en `Product`. La lista de Catálogo tiene que agrupar por modelo (ENG-341) o se vuelve ilegible.
- **(−) Asumido: el nombre está copiado en cada variante.** Renombrar el modelo reescribe sus
  variantes en una transacción, por `nombreDeVariante`. Un renglón de venta viejo conserva el nombre
  de cuando se vendió, como hoy.
- **(−) Asumido: el precio del modelo no se guarda.** Si una variante tiene precio propio, la pantalla
  muestra el rango; no hay «un» precio del modelo.
- **(−) Asumido: primera FK compuesta del schema.** Prisma la expresa
  (`@relation(fields: [groupId, tenantId], references: [id, tenantId])`), pero un `disconnect` de la
  relación intentaría poner `tenantId` en nulo: el código saca una variante del modelo escribiendo
  `groupId: null`, nunca con `disconnect` (criterio en ENG-341).

## Qué NO se verificó

- La versión de Postgres de Neon (para `NULLS NOT DISTINCT`): la alternativa está escrita arriba.
- Cuántos modelos, talles y colores carga A Dos Manos, y si sus productos controlan stock
  (`trackStock`): *provisional a confirmar* con el negocio; el tope de 100 combinaciones sale de ahí.
- Cómo copia productos la réplica de marca (`multilocal/catalogo-marca-core.ts`): no se leyó.
- La migración no se corrió: es un borrador. ENG-340 la prueba subiendo, bajando y volviendo a subir.
