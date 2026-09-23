# Veredicto — ¿nuestro backoffice reemplaza a Bistrosoft para MAGRA hoy?

> **Corrección 2026-09-23 (medido contra el código, no contra este documento):** la iteración del 2026-07-12
> daba **lotes** y **despiece** por construidos, y la respuesta corta daba **pedidos** y **fiado** por
> resueltos para el día a día. No lo están:
>
> - **Lotes: la venta no consume lotes.** Nada del circuito de venta toca `ProductBatch`: las únicas
>   referencias están en `src/lib/carniceria/` (`lotes-actions.ts`, `lotes.ts`, `schema-probe.ts`) y en
>   `src/lib/rls.ts`. `sortFefo` / `pickFefo` (`lotes.ts:65` y `:78`) no se usan fuera de `lotes.ts` y su
>   test. El lote tampoco tiene saldo: `ProductBatch` guarda el peso neto y los paquetes del alta
>   (`prisma/pending-gate2/CarniceriaRubro.sql:52-70`) y ninguna venta los descuenta, ni está atado a la
>   compra de origen (sólo `supplierId`). Lo que hay es la **lista de lotes ordenada por vencimiento**
>   (`lotes-actions.ts:48`). **"Vence primero, sale primero" (FEFO) en la venta NO existe.**
> - **Despiece: corregido en la ola 3 (sin desplegar; sólo corre con la migración cárnica aplicada).** Lo
>   que decía acá (la pieza de entrada no se descontaba, costo parejo por kilo, errores tragados) ya no es
>   cierto en el código: `registrarDespieceEnTx` (`carniceria/despiece-registro.ts`) saca la pieza del stock
>   como AJUSTE a su costo y entra cada corte como REPOSICION con su costo repartido por valor de venta
>   (`planDelDespiece`, `despiece.ts`), en una transacción; la acción (`despiece-actions.ts`) devuelve el
>   error con su motivo en vez de tragarlo. El cambio de costeo mueve los márgenes de MAGRA: hay que
>   avisarle antes de desplegarlo (decisión del dueño).
> - **Pedidos: entregar no pide cobro.** Medido en `HEAD` 9c9f2f5: `advanceOrderStatus` pasa un pedido de
>   "Listo" a "Entregado" sin mirar si está cobrado (`order-actions.ts:348-363`, con el flujo de
>   `STATUS_FLOW`, `:52-59`), y en "Cerrados recientes" el pedido queda sin botones
>   (`pedidos/page.tsx:162-185`). Un pedido entregado sin cobrar no llega nunca al libro de caja. La
>   corrección (entregar exige cobrar o dejarlo "a cobrar" a la vista) está en curso en la ola 1; hasta que
>   esté en producción, no se promete.
> - **Fiado: el cobro no llega al libro de caja.** `registerReceivableCollection`
>   (`cuentas-a-cobrar/actions.ts:19`) → `collectReceivable` → `applyCollectionInTx`
>   (`settlement/collection-repo.ts:78-119`) crea la fila `Collection` y nada más: no escribe el
>   `CashMovement` que lee el libro (`libro-caja-actions.ts:166`). Si el formulario no manda el medio, se
>   asume efectivo (`cuentas-a-cobrar/actions.ts:10-13`). Además, la pantalla sólo figura en el menú con el
>   motor de perfiles prendido (`ENTERPRISE_NAV_ITEMS`, `perfilMin: "lite"`). Que eso esté prendido para
>   MAGRA en producción no se midió.
> - **Cuentas a pagar, devoluciones a proveedor y libro IVA** abren sólo con la edición Empresa
>   (`cuentas-a-pagar/page.tsx:16`, `devoluciones-proveedor/page.tsx:16`, `libros/page.tsx:30`). El código
>   existe (el cheque diferido incluido, `src/lib/debts/cheque.ts`), pero no se verificó que MAGRA tenga esa
>   edición prendida.
>
> Lo que falta está planificado: el código se corrige en la ola 3 (frente 3E) y lotes con saldo y consumo por
> vencimiento viven con `CarniceriaRubro.sql` **enmendado** (ola 9). Hasta entonces, a MAGRA no se le promete
> FEFO en la venta ni despiece con costo por corte.
>
> **Actualización 2026-07-12 (2ª iteración), corregida:** los ítems 1 y 2 están construidos; los ítems 3 y 4
> tienen pantalla y tests de su lógica pura, pero no el circuito completo (ver arriba). La migración sigue
> preparada y sin aplicar (Gate 2).

**Respuesta corta:** **SÍ para vender, cobrar en el mostrador, stock, compras y reportes**, y **lo superamos**
en catálogo cárnico, margen por corte e **inventario por góndola**. **Con reservas** (corrección 2026-09-23,
arriba): los **pedidos** se toman y se preparan, pero entregar no pide cobro y un pedido entregado sin cobrar
no llega al libro de caja; el **fiado** registra la deuda y el cobro, pero ese cobro no entra al libro de caja.
**Lotes y despiece todavía no**: hay pantalla para registrarlos, pero la venta no consume lotes por
vencimiento y el despiece no descuenta la pieza de entrada. Para el reemplazo "sin perder nada" quedan
**aplicar la migración (Gate 2)**, **encender ARCA real (Gate 4)** —ambos acción del dueño—, cerrar la plata
de pedidos y fiado (olas 1 a 3) y terminar lotes y despiece (olas 3 y 9).

Contexto y detalle en `analisis-brecha-bistrosoft.md` y `backoffice-carniceria-spec.md`.

---

## Lo que YA puede hacer hoy (verificado, renderizado)

- **Vender por kilo** con precio/kg y stock en kg (paridad con Bistrosoft; ambos lo tienen).
- **Catálogo cárnico** por góndolas (vaca/cerdo/pollo/achuras/preparados/gourmet) con **margen por corte** —
  esto **Bistrosoft no lo muestra**. *(construido este sprint, screenshot `01-catalogo-cortes.png`)*
- **Caja + arqueo**, **compras a proveedores** con costo *(screenshot `03-compras.png`: Estancia Don Ramón,
  Paladini)* y **reportes**.
- **Con reservas** (ver la corrección de arriba): **pedidos** (mostrador/online/delivery: entregar no pide
  cobro), **fiado** (el cobro no entra al libro de caja), y **cuentas a pagar** con cheque diferido,
  **devoluciones** y **libro IVA**, que abren sólo con la edición Empresa.
- **Vidriera con marca propia** (dominio + identidad + WhatsApp), muy por encima de la carta genérica sin
  fotos en `borders.bistrosoft.com`.

## Los 4 ítems — estado tras esta iteración

| # | Ítem | Estado | Falta para encender |
|---|---|---|---|
| 1 | **Inventario por góndola** (stock por corte + valuación + acceso a ajustes/mermas) | ✅ **Construido**, rende­riza para retail (CH intacto) | Nada — ya funciona (no requiere schema) |
| 2 | **`category` + `cost` en Product** (góndola editable + margen sin depender de compras) | ✅ **Construido** (SQL crudo tolerante) + migración preparada | Aplicar migración (Gate 2) |
| 3 | **Lotes / envasado al vacío** (`/admin/lotes`: peso variable, vencimiento) | **Incompleto** (corregido 2026-09-23): se cargan y se listan por vencimiento; **la venta no los consume** (sin saldo por lote ni FEFO en la venta) | Ola 3 (3E) + `CarniceriaRubro.sql` enmendado (ola 9) + Gate 2 |
| 4 | **Despiece / rendimiento / merma** (`/admin/despiece`: media res → cortes) | **Incompleto** (corregido 2026-09-23): suma los cortes pero **no descuenta la pieza de entrada** y reparte el costo parejo por kilo | Ola 3 (3E) + Gate 2 |

**Cómo se comporta hoy (schema-ahead safe):** el código de los ítems 2–4 **tolera que las tablas no
existan** — sin la migración aplicada, las pantallas nuevas muestran "En preparación" y **nada rompe en
prod**. Al aplicar la migración (Gate 2), se encienden solas. Es el mismo patrón que evitó el incidente
schema-ahead de CH. Verificado renderizando con la migración aplicada en una base local efímera (screenshots).

**Los ítems 3 y 4 son el diferencial a construir, no uno ya ganado.** Bistrosoft no tiene lotes de vacío ni
despiece con rendimiento; cuando estén completos (venta que consume el lote que vence antes, despiece que
descuenta la entrada y costea por valor de venta) van a ser diferenciales duros del rubro cárnico. Hoy no se
presentan como construidos.

## Lo único que queda (acción del dueño)

| Falta | Tamaño | Gate |
|---|---|---|
| **Aplicar la migración** `prisma/pending-gate2/CarniceriaRubro.sql` (crea las 3 tablas + 2 columnas + RLS) | Chico (aditiva, idempotente, con rollback) | **Gate 2** |
| **ARCA en real** (cert emisor + homologación; hoy sandbox) | Config | **Gate 4** |
| **Multi-canal de precios** (mostrador/delivery/web distinto) — Bistrosoft lo tiene, nosotros no | Mediano | Nosotros (no bloqueante: MAGRA hoy usa 1 precio) |
| **Lotes con saldo y venta por vencimiento; despiece que descuenta la entrada** (corrección 2026-09-23) | Mediano | Nosotros (olas 3 y 9) + Gate 2 |
| **Entregar un pedido exige cobrarlo o dejarlo a cobrar; el cobro del fiado entra al libro de caja** (corrección 2026-09-23) | Mediano | Nosotros (olas 1 a 3) |

## Riesgo de migración honesto

- **Bistrosoft ya factura en real** (ARCA) y **maneja balanza/peso nativo con 306 productos cargados**.
  Migrar significa: (a) importar su catálogo real (categorías, precios/kg, stock), (b) encender ARCA real
  antes de dejar de facturar por Bistrosoft. Nada de esto es un blocker técnico, pero es **trabajo de
  onboarding real**, no un flip de switch.
- El **multi-canal de precios** es la única capacidad donde Bistrosoft nos gana funcionalmente hoy; para
  MAGRA no muerde (un precio), pero hay que tenerlo en el radar.

## Recomendación

**Vendible hoy como "mejor backoffice + mejor vidriera para tu carnicería"**, con el catálogo de cortes,
margen y finanzas como demo. El reemplazo total se cierra con los 4 ítems de arriba: 1 y 2 construidos, 3 y 4
**incompletos** (corrección 2026-09-23). La migración está escrita pero la de lotes se enmienda antes de
aplicarse (saldo por lote y compra de origen). En la demo, lotes y despiece se muestran como "en camino", no
como diferencial ya disponible.

— Elaborado por GSG
