# Backoffice de Magra (rubro CARNICERÍA/RETAIL) — requerimientos DERIVADOS DE LA EXTRACCIÓN

**Tipo:** hand-off de la célula de Extracción → equipo de Backoffice · **Fecha:** 2026-07-06
**Fuente:** lectura del sitio real (`https://magrameatmarket.com.ar/`, réplica en
`public/previews/magra/index.html`) + `docs/metodologia/registro-casos/magra.md`.
**No duplica** el diseño del backoffice — lo **alimenta**. El mapeo a capabilities ya vive en
`docs/tenants/magra/blueprint-carniceria-brief.md` y `docs/tenants/magra/pos-orden-capability.md`;
la paridad con el incumbente en `docs/tenants/magra/competencia-bistrosoft.md`.

> **Rol:** la Extracción no diseña el backoffice; entrega **qué necesita el negocio real** para que el
> equipo de Backoffice lo cubra con capabilities del Core (nunca fork — FUNDAMENTOS §2 / ADR-002).

---

## Qué exige el negocio real de Magra (leído de su vidriera)

| # | Necesidad del negocio (verificada en el sitio) | A qué capability/módulo mapea | Estado (según docs) |
|---|---|---|---|
| 1 | **Venta por PACK/unidad** (boutique envasada al vacío) **+ por kg** (cortes) | `Order`/`OrderItem` + `Product` con unidad de venta (kg/unidad) | POS/venta-kg ✅ implementado (migración sin aplicar, Gate 2) |
| 2 | **Toma de pedidos por WhatsApp** (canal de venta principal) | Bandeja de pedidos `/admin/pedidos` (`placeOnlineOrder`) | ✅ capability POS/Orden |
| 3 | **Delivery con ZONAS** (Canning, San Vicente, Guernica, Ezeiza, Monte Grande) — envío gratis | Fulfillment: zonas de entrega + costo (acá $0) | ⚠️ revisar: ¿zonas modeladas? Si no, **gap para backoffice** |
| 4 | **Medios de pago:** efectivo, débito, crédito, transferencia, **Mercado Pago** | `Payment` manual + plugin **MercadoPago** (`src/plugins/mercadopago`) | ✅ plugin existe; activar en el tenant |
| 5 | **Facturación** (boutique formal) | plugin **ARCA** (`src/plugins/arca`, ADR-022) | ✅ plugin existe; activar según condición fiscal |
| 6 | **Catálogo con PROVEEDORES/marcas** (Estancia Don Ramón, Paladini, Lamberti, Formagge, Tinos, Breaders, Pizzazen, Maderasa) | Campo proveedor/marca en `Product` (pista de nivel: "distribuidor oficial de X") | ⚠️ **gap probable**: ¿existe atributo proveedor? Si no, extensión de `Product` |
| 7 | **Catálogo MIXTO**: carnes + **gourmet de almacén** (pasta, conservas, pescado congelado) | Categorías del catálogo del tenant (no del rubro genérico) | ✅ catálogo por tenant |
| 8 | **Atributo "envasado al vacío"** (parte del valor) | Flag/atributo de producto | ⚠️ menor: atributo de presentación |
| 9 | **Paridad con Bistrosoft** (sistema incumbente que reemplazamos) | Tabla de paridad capacidad-por-capacidad | ✅ `competencia-bistrosoft.md` |

## Gaps concretos que le paso al equipo de Backoffice (foco)

1. **Zonas de delivery** (#3): confirmar si el fulfillment modela zonas + costo por zona; Magra las
   necesita (5 zonas, envío gratis). Si no existe → capability chica del Core, reusable por todo retail.
2. **Proveedor/marca en el producto** (#6): Magra vende "nivel" por proveedor ("distribuidor oficial de
   Estancia Don Ramón"). Confirmar atributo; si falta → extensión de `Product` (mecanismo A, ADR-002).
3. **Activación de plugins en el tenant** (#4, #5): MP + ARCA existen; falta encenderlos/parametrizarlos
   en el alta de `magra` (condición fiscal + credenciales las pega el dueño, Gate 2).

## Pendiente del dueño (bloquea prod, no la demo)
Lista de precios real + SKUs (hoy en Bistrosoft) · condición fiscal para ARCA · credenciales MP ·
las 3 fotos de cortes envasados (ver ASSET_MANIFEST de la réplica).

> **Coordinación:** este hand-off se despachó al equipo de Backoffice (chip de tarea). La Extracción
> queda disponible para aclarar cualquier dato leído del sitio.
