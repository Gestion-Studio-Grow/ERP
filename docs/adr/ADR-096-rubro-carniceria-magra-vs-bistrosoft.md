---
id: ADR-096
nivel: tactico
dominio: producto
depends_on: [ADR-036, ADR-054, ADR-055]
---

# ADR-096 — Rubro carnicería (MAGRA) vs Bistrosoft — brecha y diferenciales

**Estado:** Aceptada (análisis de reemplazo, 2026-07-12) · **Depende de:** ADR-036 (rubro retail por config, no fork), ADR-054 (catálogo de módulos), ADR-055 (principio de variante) · **Relacionado:** ADR-089 (núcleo + módulos por producto). **Fuente:** `docs/preventa/magra/analisis-brecha-bistrosoft.md`, `docs/tenants/magra/competencia-bistrosoft.md`.

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

MAGRA (carnicería boutique, Canning) **hoy usa Bistrosoft** — su lista de precios apunta a `borders.bistrosoft.com`. Estamos reemplazando ese sistema. Bistrosoft es software **gastronómico** argentino (restaurantes) usado **fuera de su rubro nativo**: ajusta la carne por su motor genérico de "producto pesable", no por diseño de rubro.

**Corrección de un supuesto interno:** creíamos que la **venta por peso (kg)** era nuestro gran diferencial. **No lo es** — leyendo la API en vivo de MAGRA, Bistrosoft maneja kg de forma **nativa** (`weightable`, stock fraccional, precio/kg, SKU balanza). La venta por peso es **paridad de tabla**, no diferencial; lo que faltaba era **exponerla en la UI del backoffice** (resuelto).

## Decisión (dónde se juega el reemplazo)

**Diferenciales reales (dónde ganamos):**
1. **Rubro cárnico de verdad:** góndolas por animal (vaca/cerdo/pollo/achuras/preparados/gourmet) con **precio por kilo** y **margen por corte con semáforo** — *donde se gana o se pierde la plata en este rubro*. Bistrosoft **no expone margen**.
2. **Backoffice financiero que Bistrosoft no evidencia:** compras a proveedores, **cuenta corriente de clientes** (fiado con vencimiento + cobros parciales), cuentas a pagar (cheque diferido), devoluciones a proveedor, **libro IVA** para el contador.
3. **Vidriera con marca propia** (dominio, identidad, fotos, WhatsApp) vs. la carta genérica sin fotos en subdominio ajeno.
4. **Soporte humano** — el punto de dolor #1 de Bistrosoft en reviews.
5. **Diferencial futuro y defendible:** **lotes / trazabilidad de envasado al vacío** y **mermas / rendimiento de despiece** — que Bistrosoft **no tiene** y una carnicería boutique necesita.

**Paridad (hay que igualar, no diferencia):** POS/caja+arqueo, pedidos multi-canal, venta por kg, stock valuado, facturación ARCA (al encender cert real), Mercado Pago, reportes. Es el mínimo para reemplazar sin que el negocio pierda nada.

**Brechas en contra (honestidad):**
- **Multi-canal de precios** (mostrador/delivery/web con precio distinto): Bistrosoft nativo; nosotros **un solo precio por producto**. Para MAGRA hoy los canales cuestan igual → **no bloqueante**, pero es capacidad a cerrar.
- **ARCA/MP en real:** Bistrosoft ya factura real; nosotros **sandbox** hasta cert + homologación (ADR-093).
- **Multi-local / balanza física:** no aplica a MAGRA hoy; no construido.

## Consecuencias

**Los 4 ítems del sprint carnicería** (rama `producto/magra-backoffice`): **inventario valuado**, **category/cost + margen por corte**, **lotes** y **despiece con merma** viven en el módulo nuevo `src/lib/carniceria/` (aditivo, ADR-054/055). **Lotes y despiece requieren schema** → `prisma/pending-gate2/CarniceriaRubro.sql` (**Gate 2, sin aplicar**). Rubro = **config, no fork** (ADR-036): la carnicería es un blueprint + módulos, no un fork del motor.

**Veredicto de reemplazo:** con la paridad ya cubierta + los diferenciales cárnicos + el backoffice financiero, **reemplazamos Bistrosoft en MAGRA**; el cierre fino depende de encender ARCA real (ADR-093) y, a futuro, multi-canal de precios.

— Elaborado por GSG · 2026-07-12
