# Blueprint Carnicería + Vidriera — lo implementado (ciclo 3, 2026-07-05)

> **Actualización ciclo 4:** este blueprint `carniceria` se generalizó a la familia
> reutilizable **Retail/Mostrador** (`src/blueprints/retail/`, ver
> `docs/blueprints/retail-mostrador.md`) y la vidriera pasó de `/carniceria` a `/tienda`
> (rubro-aware). Las rutas/archivos `src/app/carniceria/` de abajo describen el estado del
> ciclo 3; hoy son `src/app/tienda/`.

**Tipo:** registro de implementación · **Rol:** Fullstack + Arquitecto
**Ancla:** ADR-002 (Core/Blueprint/Plugin), ADR-019 (provisioning), ADR-003 (Orden),
FUNDAMENTOS §2 y §4. Continúa `pos-orden-capability.md` (capability POS del ciclo 2).

## 1. Sistema de Blueprints en código (`src/blueprints/`)

Un **Blueprint = configuración pura sobre el Core** (FUNDAMENTOS §2, sin fork, sin
schema propio). Define, por vertical: qué capabilities usa, su branding por defecto
y cómo sembrar su catálogo mínimo editable.

- `types.ts` — interfaz `Blueprint` + `PrismaTx` (el `tx` de la transacción del alta).
- `index.ts` — registry: `getBlueprint(id)` (falla explícito si no existe),
  `listBlueprints()`, `DEFAULT_BLUEPRINT_ID = "servicios"`.
- `servicios.ts` — vertical original (spa/turnos). Su seed se **extrajo tal cual** del
  inline que tenía `provision-tenant.ts` → comportamiento idéntico, ahora como blueprint.
- `carniceria.ts` — vertical de magra: siembra **cortes** (`Product` con
  `saleUnit=WEIGHT` + `pricePerKg`, o `UNIT` + `price`) y trae el branding oxblood/
  hueso/latón por defecto. **No** usa agenda/turnos.

> Cero schema propio: el blueprint sólo parametriza y siembra modelos del Core que ya
> existen (`Product`, `Service`, `BusinessSettings`, …).

## 2. Provisioning parametrizado (`scripts/provision-tenant.ts`, ADR-019)

- Nuevo flag **`--blueprint <servicios|carniceria>`** (default `servicios` → el alta
  histórica del spa no cambia).
- El alta resuelve el blueprint **antes** de abrir la transacción (falla explícito si
  el id no existe), usa su branding por defecto (pisado por los flags de branding que
  se pasen) y delega el seed del catálogo a `blueprint.seedCatalog(tx, tenantId)`.
- El seed sigue siendo **idempotente** (sólo siembra si el tenant está vacío) y
  **transaccional** (todo-o-nada con el resto del alta). El gate de RLS (ADR-018) para
  el 2º tenant no se tocó: sigue vigente.

Alta de magra (cuando haya DB con RLS):
```
npm run provision -- --name "magra" --slug magra \
  --owner-email owner@magra.com --blueprint carniceria
```

## 3. Vidriera pública por tenant (`src/app/carniceria/`)

- `page.tsx` (server) → `getStorefront()` (loader público, sin auth: lee el catálogo
  vendible del tenant actual + branding). Ruta **fuera del grupo `(site)`** del spa, así
  no hereda su layout: marca magra premium **inline** (self-contained).
- `Storefront.tsx` (client) — catálogo de cortes con precio/kg, carrito con cantidad en
  kg (paso 0.25) o unidades, total estimado, y checkout (nombre, teléfono, retiro/envío,
  nota) que postea a `placeOnlineOrder`.
- `placeOnlineOrder` (server action **pública**, en `order-actions.ts`) — reusa el
  **mismo core** de creación de orden que el POS del backoffice (`insertOrder`), forzando
  canal ONLINE + estado PENDING + sin cobrar. El pedido cae en la **bandeja
  `/admin/pedidos`**. Audita como acción pública y redirige a `/carniceria/gracias`.

> El core de orden se refactorizó a `insertOrder(tenantId, input)`: único lugar donde se
> arma una orden, compartido por mostrador (con auth) y vidriera (sin auth). Cero duplicación.

## 4. Datos provisionales (no frenar por datos)

Marcados como tales en `carniceria.ts`:
- **Catálogo de cortes** (14 productos) con **precios/kg de referencia** (AR, mediados
  2026) y stock inicial. NO es la lista real de magra: el negocio la edita.
- **Branding**: dirección, WhatsApp e Instagram son **placeholders**; `shortLabel`,
  ciudad (Canning) y horarios son razonables. Se reemplazan con los datos reales.

## 5. Verificación (costo 0, sin tocar Neon)

- `tsc --noEmit`: **0 errores en todo el repo**.
- **Dry-run** del provisioning: `--blueprint carniceria` valida OK; un blueprint
  inexistente aborta con exit 1 y lista los válidos. Sin conexión a la DB.
- **No se corrió contra Neon** ni se levantó dev server: la migración POS del ciclo 2
  sigue **sin aplicar** (las columnas `saleUnit/price/pricePerKg` y las tablas `Order`
  no existen en prod), así que la vidriera y el seed sólo corren contra una **DB local**
  con la migración aplicada — nunca prod (Gate 2).

## 6. Cómo verlo (demo local, cuando haya DB local)

1. Aplicar migraciones en una DB local / branch de Neon (NUNCA prod):
   `prisma migrate deploy` apuntando el `DATABASE_URL` a la DB local.
2. `npm run provision -- --name "magra" --slug magra --owner-email owner@magra.com --blueprint carniceria`
   (con RLS activo si ya hay otro tenant; en una DB limpia es el 1er tenant y no aplica el gate).
3. `npm run dev` →
   - **`/carniceria`**: vidriera de magra, elegir cortes por kg, enviar pedido.
   - **`/admin/pedidos`**: el pedido aparece en la bandeja; avanzar estado / cobrar; o
     cargar una venta de mostrador por kg.

## 7. Lo que queda (para el tenant real servido por dominio)

- **RLS + resolución de tenant por request** (ADR-018, en construcción por otra línea):
  hoy la vidriera lee "el tenant actual"; con resolución por request se sirve por
  subdominio/slug del tenant carnicería.
- **Theming por tenant genérico**: la marca de magra está **inline** en la vidriera;
  falta la capa de tokens por tenant para que cualquier vidriera tome su marca sin código.
- **Aplicar la migración POS** a la DB real (Gate 2, con OK) para el alta definitiva.
- **Form retail en el catálogo del backoffice** (precio/kg por producto): hoy los precios
  entran por el seed del blueprint; las acciones ya aceptan los campos.
