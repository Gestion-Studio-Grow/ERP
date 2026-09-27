# Supermercado — qué tiene el sistema y qué falta (fit-gap)

Fecha: 27/09/2026 · Rama `super-2709` · Fuente de verdad: el código, con `archivo:línea`.

Un supermercado de barrio o una cadena chica es **configuración** del mismo motor: el rubro
`supermercado` (`src/blueprints/retail/rubros.ts`: sus secciones, su vidriera, su catálogo
semilla), los módulos que trae de fábrica (`src/blueprints/presets-meta.ts:56`) y tres apps
nuevas. Ninguna pantalla pregunta "si es el súper": lo que cambia lo decide la configuración del
rubro (`secciones`, `vidriera`) o el módulo asignado (`caja-rapida`, `ofertas`).

## Lo que el negocio necesita y cómo queda

| Necesidad | Estado | Dónde |
|---|---|---|
| Catálogo de arranque (380 productos, EAN-13 válidos, IVA por producto, secciones) | Hecho | `src/blueprints/retail/supermercado-catalogo.ts` (generado por `scripts/tenants/supermercado-catalogo.py`), siembra en `src/blueprints/retail/supermercado-semilla.ts:28` |
| Caja con lector de código de barras (Enter, el foco vuelve solo) | Hecho | app `caja-rapida` (`src/apps/catalogo/mostrador.ts:86`), pantalla `src/app/admin/(dashboard)/caja-rapida/CajaRapida.tsx` |
| Etiqueta de balanza (prefijo 20–29, peso o importe, configurable por negocio) | Hecho | `src/lib/supermercado/balanza.ts:123`, configuración en `/admin/caja-rapida/configuracion` |
| Multiplicador «3 ×» | Hecho | `src/lib/supermercado/lectura.ts:33` |
| Anular un renglón con permiso del encargado y registro | Hecho | `src/lib/supermercado/caja-actions.ts:194` |
| Varios medios de pago en una venta | Hecho (efectivo, Mercado Pago, transferencia) | `src/lib/supermercado/pago-mixto.ts:42`, alta en `src/lib/order-core.ts` |
| Promos: 2×1, 3×2, 2.ª unidad al X %, % por sección o producto, % por medio de pago y día, combos; prioridad y no acumulables | Hecho | motor puro `src/lib/supermercado/promociones.ts:319`, app `ofertas` (`src/apps/catalogo/precios.ts:91`) |
| La promo en el ticket | Hecho | `src/app/admin/(dashboard)/vender/reglas-venta.ts` (líneas de promo y "Ahorraste") |
| Stock mínimo y sugerido de compra | Ya existía | app `sugerido-de-compra` (`src/apps/catalogo/logistica.ts:136`); la semilla carga el mínimo de cada producto |
| Lotes con vencimiento y alerta | Ya existía, **espera una migración** | app `lotes-y-vencimientos` (`src/apps/catalogo/logistica.ts:150`); ver pendiente 3 |
| Mermas con motivo | Ya existía | app `mermas` (`src/apps/catalogo/logistica.ts:101`); el súper es perecedero y ve los motivos de comida |
| Lista de precios del proveedor | Hecho | app `listas-de-proveedores` (`src/apps/catalogo/logistica.ts:206`) |
| Subir precios por margen o por %, por sección o por proveedor, con vista previa y registro | Hecho | `src/lib/catalogo/aumento-core.ts:75` y `:281`, pantalla `catalogo/precios` |
| Carteles de góndola con precio, precio por kilo/litro y código | Hecho | `src/lib/catalogo/etiquetas-core.ts:64`; el filtro de carteles usa las secciones del rubro |
| Caja después del cierre del día | Hecho | no cobra y dice cómo seguir (`src/lib/order-anulacion.ts`, contexto `caja-con-lector`) |
| Vidriera: ofertas de la semana, secciones, buscador, precio por kilo/litro | Hecho | el rubro declara su vidriera (`rubros.ts`, campo `vidriera`); `src/app/tienda/vidriera/Vidriera.tsx` |
| Pedido online con retiro o envío | Ya existía, ahora con las ofertas | `placeOnlineOrder` aplica las mismas promos (`src/lib/supermercado/promos-del-negocio.ts`); al pesar el pedido se vuelven a aplicar |

## Lo que falta y por qué

1. **Tarjeta de débito/crédito como medio de cobro.** El libro de caja ya tiene la columna
   Tarjeta (`src/lib/caja/libro-caja.ts:39`), pero el medio de pago de la venta y del cobro tiene
   tres valores (`prisma/schema.prisma:47`: Mercado Pago, efectivo, transferencia). Agregar
   "Tarjeta" ahí es una migración (aditiva: un valor nuevo del tipo). **Decisión del dueño.**
   Mientras tanto, la tarjeta por posnet de Mercado Pago entra como Mercado Pago.
2. **Varias cajas abiertas a la vez en el mismo local.** El turno de caja es uno por negocio
   (`prisma/schema.prisma:1335`, `CashSession` sin número de caja; `src/lib/caja/cash-sale.ts:127`
   busca "el" turno abierto). Varias cajas con su propio arqueo necesitan una columna nueva (qué
   caja) y revisar el cierre (ADR-101: un solo esperado). Hoy varios cajeros venden a la vez en la
   misma caja y cada venta queda con quién la cobró; el arqueo es uno. **Decisión del dueño + ADR.**
3. **Lotes y vencimientos, y la sección guardada en el producto.** Las dos cosas usan columnas de
   la migración que espera en `prisma/pending-gate2/CarniceriaRubro.sql` (tabla de lotes y la
   columna de góndola). Sin ella, la sección sale del nombre del producto
   (`src/lib/supermercado/secciones.ts`, reconoce los 380 productos de la semilla) y la app de
   lotes no aparece. **Aplicar esa migración a producción es decisión del dueño.**
4. **Ley de góndolas (precio por unidad de medida).** El cartel y la vidriera muestran el precio
   por kilo o litro a partir de la presentación. Qué productos están obligados y el formato exacto
   (Res. SC 7/2002 y modificatorias) quedan **a validar** con quien asesore al negocio.
5. **IVA por producto.** 21 % general; 10,5 % frutas, verduras, carnes y panificados. Los dudosos
   están marcados en la semilla con el motivo (`ivaAValidar`) y **se validan con el contador**
   antes de facturar.
6. **Costo para el precio por margen.** Se usa el costo cargado (compras o lista del proveedor).
   Si ese costo incluye o no el IVA depende de cómo lo cargue el negocio: **a validar** con el
   contador el criterio del margen.
7. **«Trabaja por apps» no viene prendido de fábrica.** La caja con lector, Ofertas y Listas de
   proveedores son apps nuevas: no están en la barra de siempre, sólo en el Inicio por apps. Al
   dar de alta un súper, el operador tiene que fijar la asignación y prender «Trabaja por apps» en
   la ficha (pestaña Plan y apps). Probado en el recorrido (`.qa/super-2709/01b-por-apps.mjs`).
   Que nazca prendido para este rubro es **decisión del dueño** (cambia el alta).
8. **El nombre del panel dice «Mi negocio»** en un negocio nuevo sin plan elegido ni «Diseño
   nuevo» (`src/app/admin/(dashboard)/layout.tsx:175-197`). No es del súper: pasa en cualquier
   alta así. La vidriera y el ticket sí dicen «Supermercado La Esquina».
9. **Texto de "Lotes y vencimientos".** La descripción de la app habla de "lote al vacío"
   (carnicería). Para el súper conviene un texto neutro; es copia, no bloquea.

## Qué más ve cada negocio

- La app **Listas de proveedores** es del módulo de inventario: también la ven MAGRA, Shine y
  A Dos Manos si tienen inventario (ver `src/apps/visibles.test.ts`).
- **Caja con lector** y **Ofertas** son módulos nuevos: los trae de fábrica sólo el súper. A otro
  negocio se le asignan desde la consola si los compra. CH no cambia.
