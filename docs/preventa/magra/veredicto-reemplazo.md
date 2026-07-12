# Veredicto — ¿nuestro backoffice reemplaza a Bistrosoft para MAGRA hoy?

> **Actualización 2026-07-12 (2ª iteración):** los **4 ítems** que faltaban están **CONSTRUIDOS** (código +
> tests + pantallas renderizadas), con la **migración preparada y sin aplicar** (Gate 2). Con la migración
> aplicada + ARCA real, **MAGRA puede dejar Bistrosoft**. Detalle abajo.

**Respuesta corta:** **SÍ para operar el día a día** (vender, cobrar, stock, pedidos, compras, fiado,
reportes) **y lo superamos** en catálogo cárnico, margen por corte, **inventario por góndola, lotes/
trazabilidad de vacío y despiece con rendimiento** — esto último Bistrosoft **no lo tiene**. Para el
reemplazo "sin perder nada" queda **aplicar la migración (Gate 2)** y **encender ARCA real (Gate 4)**, ambos
acción del dueño.

Contexto y detalle en `analisis-brecha-bistrosoft.md` y `backoffice-carniceria-spec.md`.

---

## Lo que YA puede hacer hoy (verificado, renderizado)

- **Vender por kilo** con precio/kg y stock en kg (paridad con Bistrosoft; ambos lo tienen).
- **Catálogo cárnico** por góndolas (vaca/cerdo/pollo/achuras/preparados/gourmet) con **margen por corte** —
  esto **Bistrosoft no lo muestra**. *(construido este sprint, screenshot `01-catalogo-cortes.png`)*
- **Caja + arqueo, pedidos** (mostrador/online/delivery), **compras a proveedores** con costo
  *(screenshot `03-compras.png`: Estancia Don Ramón, Paladini)*, **fiado** (cuenta corriente), **cuentas a
  pagar** con cheque diferido, **devoluciones**, **libro IVA**, **reportes**.
- **Vidriera con marca propia** (dominio + identidad + WhatsApp), muy por encima de la carta genérica sin
  fotos en `borders.bistrosoft.com`.

## Los 4 ítems — estado tras esta iteración

| # | Ítem | Estado | Falta para encender |
|---|---|---|---|
| 1 | **Inventario por góndola** (stock por corte + valuación + acceso a ajustes/mermas) | ✅ **Construido**, rende­riza para retail (CH intacto) | Nada — ya funciona (no requiere schema) |
| 2 | **`category` + `cost` en Product** (góndola editable + margen sin depender de compras) | ✅ **Construido** (SQL crudo tolerante) + migración preparada | Aplicar migración (Gate 2) |
| 3 | **Lotes / envasado al vacío** (`/admin/lotes`: peso variable, vencimiento, trazabilidad, FEFO) | ✅ **Construido** + tests + pantalla | Aplicar migración (Gate 2) |
| 4 | **Despiece / rendimiento / merma** (`/admin/despiece`: media res → cortes, costo real/kg) | ✅ **Construido** + tests + pantalla | Aplicar migración (Gate 2) |

**Cómo se comporta hoy (schema-ahead safe):** el código de los ítems 2–4 **tolera que las tablas no
existan** — sin la migración aplicada, las pantallas nuevas muestran "En preparación" y **nada rompe en
prod**. Al aplicar la migración (Gate 2), se encienden solas. Es el mismo patrón que evitó el incidente
schema-ahead de CH. Verificado renderizando con la migración aplicada en una base local efímera (screenshots).

**Los ítems 3 y 4 no igualan a Bistrosoft: lo SUPERAN.** Bistrosoft no tiene lotes/trazabilidad de vacío ni
despiece con rendimiento — son diferenciales duros del rubro cárnico.

## Lo único que queda (acción del dueño)

| Falta | Tamaño | Gate |
|---|---|---|
| **Aplicar la migración** `prisma/pending-gate2/CarniceriaRubro.sql` (crea las 3 tablas + 2 columnas + RLS) | Chico (aditiva, idempotente, con rollback) | **Gate 2** |
| **ARCA en real** (cert emisor + homologación; hoy sandbox) | Config | **Gate 4** |
| **Multi-canal de precios** (mostrador/delivery/web distinto) — Bistrosoft lo tiene, nosotros no | Mediano | Nosotros (no bloqueante: MAGRA hoy usa 1 precio) |

## Riesgo de migración honesto

- **Bistrosoft ya factura en real** (ARCA) y **maneja balanza/peso nativo con 306 productos cargados**.
  Migrar significa: (a) importar su catálogo real (categorías, precios/kg, stock), (b) encender ARCA real
  antes de dejar de facturar por Bistrosoft. Nada de esto es un blocker técnico, pero es **trabajo de
  onboarding real**, no un flip de switch.
- El **multi-canal de precios** es la única capacidad donde Bistrosoft nos gana funcionalmente hoy; para
  MAGRA no muerde (un precio), pero hay que tenerlo en el radar.

## Recomendación

**Vendible hoy como "mejor backoffice + mejor vidriera para tu carnicería"**, con el catálogo de cortes,
margen y finanzas como demo. El reemplazo total se cierra con los 4 ítems de arriba, todos **especificados y
con la migración escrita** — el dueño aprueba y se ejecutan en orden (inventario → category/cost → lotes →
despiece), sin sorpresas de schema.

— Elaborado por GSG
