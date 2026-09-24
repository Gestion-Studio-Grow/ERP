---
id: ADR-098
nivel: fundacional
dominio: producto
depends_on: [ADR-017, ADR-054, ADR-055, ADR-059, ADR-089]
---

# ADR-098 — El panel trabaja por apps: registro único, gate por negocio y guardia en cada página

**Estado:** Aceptada (ola 1 del ERP por apps, 2026-09-23) · **Depende de:** ADR-017 (capabilities), ADR-054/055 (módulos y asignación por negocio), ADR-059 (perfiles y nav agrupada), ADR-089 (núcleo + módulos por producto).

> **Nota de reemplazo (2026-09-24, tanda 2b).** Donde este ADR dice `APPS_INICIO` (la variable de deploy con la lista de slugs del piloto), hoy rige el **interruptor "Trabaja por apps"** (`inicio-por-apps`) de cada negocio: una fila de `AuditLog` con `entity = 'Interruptor'`, escrita sólo por la consola de GSG (`src/lib/operador/interruptores-escritura.server.ts`) y leída una vez por request (`src/cambios/interruptores.server.ts`). `resolverContextoApps` recibe `enInicioPorApps: boolean` (`src/apps/visibles.ts:65-92`); la regla de la asignación vacía no cambió. Se prende y se apaga desde la ficha del negocio, sin deploy; en CH sólo el operador dueño, escribiendo el slug; para prender se exigen 0 apps perdidas. `APPS_INICIO` ya no la lee ningún código. `/admin/modulos` también se borró en esa tanda. El texto de abajo se deja como estaba para no reescribir la historia.

> Numeración: se toma el 098. En main la carpeta llega hasta el 089, pero hay ramas sin mergear que ya usan números más altos: del 090 al 096 en `origin/docs/consolidacion-0712` y el 097 en `origin/vertical/torneos`. Medido el 2026-09-23 sobre las 96 refs del repo, con `git ls-tree` de `docs/adr` en cada una. El 098 no aparece en ninguna, ni como archivo ni citado. Si al mergear ya está tomado, se renumera antes de que llegue a main (como en a646d52).

## Contexto

Medido en el código el 2026-09-23:

1. **La misma pantalla se declaraba en seis listas que ya se contradecían:** `ALL_ITEMS` (src/lib/admin-nav-items.ts), `NAV_ITEM_GROUPS`, `ENTERPRISE_NAV_ITEMS` y `BACKLOG_SCOPE_ITEM_NAV` (src/modules/nav-groups.ts), los `scopeItems[].ruta` de los descriptores de módulos y el mapa de íconos del shell. Tres rutas tenían verdades en conflicto: `/admin/caja` (núcleo en la nav, del módulo `pos` en `nativos.ts:48`), `/admin/inventario` (tres capabilities y dos módulos distintos) y `/admin/facturacion` (la reclamaban `arca` y `bancos`).
2. **El gate por módulo no se podía prender.** `MODULE_REGISTRY_ENABLED` es global, y ningún conjunto de módulos por defecto reproduce lo que CH ve hoy: `beauty-spa` tiene `modules = {}` (medido en la base local de QA; en Neon no se midió).
3. **Lo único que protegía el derecho comercial era no aparecer en el menú.** El chequeo por URL del producto Comerciante vive en el layout (`layout.tsx:109-114`), y Next no vuelve a renderizar los layouts al navegar del lado del cliente. Las 34 páginas de `(dashboard)` protegen el rol (en la página o en su loader), pero ninguna el módulo, el rubro ni la edición. Lo mismo pasa con los 5 route handlers de `(dashboard)` (exportaciones y la planilla del catálogo): sirven datos por URL sin gate de módulo, rubro ni edición. Por ejemplo, `libros/export/route.ts:23` exige el perfil Empresa y no el módulo `libros`.

## Decisión

1. **La app es un objeto propio**, `AppDescriptor` (`src/apps/contract.ts`), que convive con el módulo (`ModuleDescriptor`) sin extenderlo. El módulo es lo que se vende y se activa por negocio (`Tenant.modules`, sin migración). La app es la pantalla: id, nombre, descripción, ícono, ruta, espacio, capability, módulo (o `null` = núcleo), rubro, perfil mínimo, estado, número del botón y palabras de búsqueda.
2. **Un solo registro** (`src/apps/registro.ts`) junta siete catálogos repartidos **por frente dueño**, no por espacio (`src/apps/catalogo/*.ts`), para que dos frentes de la misma ola nunca editen el mismo archivo. El registro se congela después de la ola 1. `AppId` sale del registro: `requireApp("facturacon")` no compila.
3. **Los espacios** (`src/apps/espacios.ts`) son estantes del Inicio, no permisos: Mostrador ("Recepción" en servicios), Caja, Clientes, Catálogo y precios, Stock y compras, Finanzas, Administración y Mis locales. Un espacio aparece si la persona ve al menos una app de él. El orden de las apps dentro de cada espacio queda decidido para todas las olas.
4. **Una sola regla decide quién abre qué** (`motivoNoDisponible`, `src/apps/visibles.ts`): rol, estado, módulo, rubro y edición, en ese orden. De ella salen la barra y el Inicio (`appsVisibles`), la guardia (`requireApp`) y el porqué de "App no disponible".
5. **El gate por módulo es por negocio** (`resolverContextoApps`):
   - contexto `null` = sin gate, idéntico a hoy: CH y todo negocio fuera de `APPS_INICIO` o con la asignación vacía;
   - piloto (`APPS_INICIO` con el slug y asignación no vacía) → `resolverActivacion(t.modules)`, y decide el **módulo de la app**;
   - producto con tienda (Comerciante) → `Tenant.modules` tal cual, como hace hoy el layout, y decide el **módulo con el que la barra de hoy filtra esa pantalla** (`menuDeHoy.moduloDeHoy`). El Comerciante ya tenía gate: Compras, Ajustes, Stock, Lotes y Despiece se filtraban con `catalog` (no con `inventario`), y las pantallas de edición, con ninguno. Cambiarlo le sacaría pantallas a un negocio que ya las tenía;
   - `MODULE_REGISTRY_ENABLED` → la resolución global de hoy (sigue apagado).
6. **`moduloDuro`**: las apps que leen datos de otro negocio (Mis locales) exigen su módulo siempre, aun sin gate, contra la asignación cruda. El módulo de la barra de hoy no lo afloja. Su página y sus actions llaman además a `exigirCasa()`.
7. **Edición**: sin gate y en el Comerciante, `perfilMin` se respeta como hoy (las pantallas de edición sólo con el motor de perfiles prendido). En el piloto manda el módulo asignado. Eso saca el callejón de Libros (el menú no lo mostraba y la página decía "edición Empresa").
8. **La guardia va en la página**: `requireApp(id)` (`src/lib/require-app.ts`) aplica la regla del punto 4 y, si no pasa, manda a `/admin/no-disponible?app=<id>`. Esa página vive fuera de `(dashboard)`, sólo pide sesión, recalcula el porqué (no confía en el link), dice a quién pedírsela y ofrece volver a la casa del rol **sólo si esa casa se puede abrir**. Nunca redirige sola: no hay loop posible. Las actions de derecho comercial usan `requireAppAccion(id)`, que tira un error con el mensaje listo, de a una. **Los route handlers también**: una exportación sirve los mismos datos que su pantalla, así que lleva el `requireApp` de la app a la que pertenece (`/admin/libros/export` → `libro-iva`).
9. **Decisiones de semántica** en el registro:
   - Caja del día, Cierre del día y Libro de caja son del núcleo (`modulo: null`): si colgaran de `pos`, CH las perdería el día que entre al gate, porque el preset de servicios no trae `pos`.
   - Stock, Recibir mercadería, Mermas, Lotes y Despiece cuelgan de `inventario` (que depende de `catalog`). El operador asigna `inventario` a magra, shinevelas y adosmanos antes de prenderles `APPS_INICIO`.
   - Facturación automática (`/admin/facturacion/bancos`) es una app propia con el módulo `bancos`; el match por segmento hace que ya no caiga en Facturación.
   - La capability de cada app es la que exige **su página** hoy (p.ej. `catalog:read` para Catálogo, Compras, Mermas, Lotes y Despiece, aunque el menú viejo dijera `catalog:manage`). Para los tres roles da lo mismo; un test lo vigila.
   - `/admin/modulos` sale del registro: nadie tiene `modules:manage`.
10. **El número del botón no muestra plata sin `reports:read`.** La declaración (`KpiDecl`) separa lo que cuenta (`mide`, lo ve quien abre la app) de la plata (`monto`, con su capability), y `partesDelKpi(app, rol)` decide qué parte ve cada rol. RECEPTION abre Caja y Cierre, ve "abierta desde las 9" o "2 días sin cerrar", y no ve el efectivo esperado ni el faltante. El loader del botón consulta `partesDelKpi` antes de calcular: si no puede mostrar la plata, no la lee.
11. **Convivencia verificada**: mientras exista el menú viejo, `proyectarMenuDeHoy(appsVisibles(...))` tiene que dar exactamente lo mismo que `menuItemsParaTenant` (href, orden, rótulo, ícono, alias y grupo). Sin gate: en los 3 roles × 4 combinaciones de rubro × 3 estados de perfil. En el Comerciante: en los 3 roles × 3 estados de perfil × 4 rubros × 7 asignaciones de módulos (su núcleo, vacía, con `catalog` sin `inventario`, con los dos, con `inventario` sin `catalog`, con los módulos de edición y con el catálogo entero).

## Tests que lo sostienen (`src/apps/*.test.ts`)

- `registro.test.ts`: ids y rutas únicas, módulo existente en el catálogo, contrato cerrado (ninguna app declara `scopeItems`), trinquete de `scopeItems[].ruta` en módulos nuevos, `moduloDuro` en todo Mis locales.
- `paridad-menu.test.ts`: la paridad dorada del punto 11, la foto de las 20 pantallas del OWNER de CH y la única diferencia buscada: la del piloto (ver Consecuencias).
- `visibles.test.ts`: el gate por negocio (CH sin gate aun con `APPS_INICIO=*`), dependencias resueltas, el Comerciante con el módulo de su barra de hoy y el piloto con el de la app, `moduloDuro` invisible sin su módulo (tampoco lo afloja el Comerciante), el buscador que no revela apps ocultas, el orden por espacio, "App no disponible" (PROFESSIONAL → botón a su agenda; sin botón si la casa tampoco abre) y la plata del botón (ninguna app con pesos en su número se los muestra a RECEPTION ni a PROFESSIONAL).
- `rutas.test.ts`: `appDeRuta` da lo mismo que `navItemForPath` en todas las pantallas de la barra y sus sub-rutas, salvo las diferencias escritas.
- `guardia-paginas.test.ts`: trinquete de páginas sin `requireApp` (hoy 34, sólo puede bajar) y de route handlers sin `requireApp` (hoy 5), toda página y todo route handler pertenecen a una app, `requireApp` protege la app de su ruta, y la capability del registro coincide con la que pide cada página raíz: directo (14 páginas) o en el loader que llama (las otras 14, en una tabla que el test verifica abriendo el loader).

## Consecuencias

- **CH no cambia su menú** (lo prueba la paridad) **ni su Inicio**. Lo que sí cambia, a medida que cada frente pone `requireApp` en sus páginas: una URL tecleada a una pantalla que su rol, su rubro o su edición no permiten muestra "App no disponible", en vez de rebotar en silencio a la casa del rol o de abrir la pantalla igual (hoy un OWNER de CH que teclea `/admin/inventario`, con el motor de perfiles apagado, ve "En preparación": `inventario/page.tsx:41-48`).
- **El Comerciante no cambia su menú** (lo prueba la paridad, con perfiles prendidos y apagados).
- **Diferencia buscada, sólo en el piloto:** un negocio de `APPS_INICIO` ve lo que tiene asignado. Sin `inventario` no ve Stock, Compras, Ajustes, Lotes ni Despiece, aunque tenga `catalog`. Con `cuentas-a-cobrar`, `libros` o `cuentas-a-pagar` asignados ve esas pantallas aunque el motor de perfiles esté apagado. Por eso el operador revisa la asignación de cada negocio antes de sumarlo al piloto.
- La lista de ids por espacio (`espacios.ts`) es una segunda mención de cada app. Sólo decide el orden: una app que no figure va al final de su espacio, no desaparece.
- `menuDeHoy.moduloDeHoy` es una segunda verdad sobre el módulo, a propósito y con fecha de vencimiento: vive mientras el Comerciante use la barra de hoy y se borra con ella.

## Reversibilidad

- Sacar un slug de `APPS_INICIO` devuelve ese negocio a "sin gate" sin tocar datos.
  - *(2026-09-24)* Hoy: **Apagar** "Trabaja por apps" en la ficha del negocio hace lo mismo, sin deploy.
- `requireApp` en una página se revierte con su commit; con contexto `null` sólo agrega el chequeo de rubro y de edición que el menú ya aplicaba.

## Limpieza (después de la ola 4, con CH dos semanas en el modelo nuevo)

Se borran `ALL_ITEMS`, `ShellItem`, `menuItemsParaTenant`, `navItemForPath`, `rutaPermitidaParaModulos`, `NAV_ITEM_GROUPS`, `NAV_GROUPS`, `BACKLOG_SCOPE_ITEM_NAV`, `ENTERPRISE_NAV_ITEMS`, `ScopeItem.ruta`, `MenuDeHoy` (con `moduloDeHoy`) y `proyectarMenuDeHoy`, `dashboard-mode.ts`, los tres inicios viejos, `/admin/modulos` y los flags `MODULE_REGISTRY_ENABLED`, `NAV_GROUPING_ENABLED` y `APPS_INICIO`. *(2026-09-24: `/admin/modulos` y `APPS_INICIO` ya salieron en la tanda 2b.)* Antes de borrar `moduloDeHoy` se decide con el dueño si el Comerciante pasa a la semántica del piloto.

## Sin medir

- Los valores reales de `modules` y `blueprintId` de los cuatro negocios en Neon (en la base local de QA: `beauty-spa` con `{}` y sin blueprint; `magra` con `pos, catalog, clients, reports, arca`).
- `PROFILES_ENABLED`, `NAV_GROUPING_ENABLED` y `MODULE_REGISTRY_ENABLED` en Vercel.
- La pantalla "App no disponible" renderizada con build y start reales: queda para el QA de la ola.

— Elaborado por GSG · 2026-09-23
