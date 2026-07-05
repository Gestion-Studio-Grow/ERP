# Brief — Tenant `magra` + Blueprint "Carnicería/Retail"

**Tipo:** brief de análisis (NO es un ADR aceptado). Alimenta una futura
`/sesion-arquitectura` que lo formalice como ADR (candidato: ADR-024 "Blueprint
Retail/Carnicería") y su implementación como `/sesion-feature`.
**Fecha:** 2026-07-04 · **Rol:** PO + Arquitecto (propuesta) · **Estado:** borrador para revisión
**Ancla de visión:** `docs/FUNDAMENTOS-Y-VISION.md` §2 — *magra es la prueba de
fuego del multi-tenant: un tenant con Blueprint de rubro distinto, no un producto aparte.*

---

## 1. Qué es magra en la plataforma

`magra` (carnicería premium, Canning) = **tenant #2** del ERP, con un **Blueprint
"Carnicería/Retail"** que es **configuración pura sobre el Core** (ADR-002): activa
y parametriza Business Capabilities existentes, agrega **campos de extensión**
donde falta dato, y **no define schema propio**. Lo que difiere de estética
(catálogo, unidades de venta, flujo de mostrador, marca) es **config + capabilities**,
no código base duplicado.

> **Lo que NO se hace** (línea roja de FUNDAMENTOS §2 y ADR-002): no se migra el
> scaffold Next standalone (`/magra`) con sus tablas `Product`/`Order` propias.
> Eso es exactamente el fork que la visión prohíbe. Esa carpeta queda como demo
> visual desechable y se borra cuando exista la vidriera del tenant.

---

## 2. Mapeo a capabilities del Core (qué se reutiliza, qué se extiende, qué falta)

Basado en el estado real del repo (schema + `src/lib/*-actions.ts`):

| Necesidad de la carnicería | Cómo se resuelve | Estado en el Core hoy |
|---|---|---|
| Clientes (cuenta, contacto, historial) | Capability **Party/Cliente** (`Client`, `client-actions.ts`) | ✅ Existe, reutilizable |
| Catálogo de cortes | Capability **Producto** (`Product`, `catalog-actions.ts`) | ✅ Existe (hoy modela insumos); reutilizable con extensión |
| **Venta por peso (precio/kg, gramos)** | **Campo de extensión** (mec. A ADR-002) sobre `Product`: `saleUnit`, `pricePerKg`, `tipo_corte` (JSONB `metadata` validado) | ⚠️ El mecanismo de extensión **no existe aún**; hay que crearlo |
| Stock de productos | Capability **Stock** (`Product.stock`) | ✅ Parcial (se descuenta al completar turno); adaptar a venta |
| **Venta de mostrador / pedido** | Capability **POS/Orden** nueva del Core (mec. B ADR-002) — `Order`/`OrderItem` genéricos + reglas | ❌ No existe (ADR-003 lo prevé como Fase 2; no hay tabla `Order`) |
| Cobro | Capability **Pago** (`Payment`, `confirmPayment`) | ✅ Existe (manual + MP futuro) |
| Facturación electrónica | **Plugin `arca`** vía outbox + comando `RegisterFiscalDocument` (ADR-002/020/022) | ⚠️ `Invoice` + `OutboxEvent` existen; plugin arca aún no |
| Cupones / promos | Capability **Cupones** (`Coupon`, `coupon-actions.ts`) | ✅ Existe |
| Vidriera pública (catálogo online, pedido) | **Sitio público** (`src/app/(site)/`) generalizado por tenant | ⚠️ Existe pero hardcodeado para Servicios; generalizar |
| Marca premium (oxblood/hueso/latón) | **Config/tema del tenant** (tokens semánticos, ya hay capa en el ERP) | ⚠️ Theming por tenant no existe aún; hoy marca única |
| Auditoría | Capability **Audit** (`AuditLog`) | ✅ Existe |

**No reutiliza** (específico de Servicios): `Appointment`, `Box`, `Professional`,
`WorkingHours`, `ServiceCategory`, `Resource`, `Review`, `Waitlist`. La carnicería
no agenda turnos: vende en mostrador / toma pedidos.

---

## 3. El gate duro: magra = tenant #2 arrastra RLS + provisioning

Esto es lo más importante y **condiciona todo el cronograma**:

- Hoy `getCurrentTenantId()` (`src/lib/tenant.ts`) es **fail-closed** (ADR-015):
  en el instante en que exista una **2ª fila** en `Tenant`, **lanza error para toda
  la app**. Es por diseño.
- Por lo tanto, dar de alta magra es **inseparable** de:
  1. **ADR-018** — activar RLS de Postgres + **resolución de tenant por request**
     (subdominio / path / sesión) con `SET LOCAL app.current_tenant_id`.
  2. **ADR-019** — script `scripts/provision-tenant.ts` idempotente/transaccional
     que siembra `Tenant` + OWNER + catálogo mínimo del blueprint.
- **Ninguno de los dos está implementado.** Son decisiones aceptadas, código pendiente.

**Conclusión:** convergir magra **no es un seed**; es un programa con orden forzado.
No se puede "meter magra" sin antes hacer el aislamiento real. Intentarlo rompe el
tenant vivo de Carolina — inaceptable (restricción dura de ADR-019 §1).

---

## 4. Faltantes de plataforma que magra obliga a construir (en orden)

1. **RLS + resolución de tenant por request** (ADR-018) — gate #0, sin esto nada.
2. **Provisioning** (`scripts/provision-tenant.ts`, ADR-019) — parametrizado por `--blueprint`.
3. **Sistema de Blueprints en código** — `src/blueprints/<vertical>/manifest.ts` +
   `seed-template.ts`; registro de capabilities activas por tenant
   (`Tenant.blueprintId` / `TenantCapability`). Hoy no existe.
4. **Mecanismo de campos de extensión** (JSONB validado, mec. A ADR-002) — para
   `venta por kg` sobre `Product` sin tabla nueva.
5. **Capability POS/Orden** (mec. B ADR-002 / ADR-003 Fase 2) — `Order`/`OrderItem`
   genéricos + reglas de venta por peso. Es Capability del Core, **no** del Blueprint.
6. **Sitio público generalizado por tenant** — vidriera que lee catálogo del tenant
   activo; theming por tenant (marca magra).
7. **Plugin `arca`** para la factura fiscal (ADR-022) — puede ir en paralelo.

Cada uno es una `/sesion-feature` con su ADR donde corresponda. Ninguno toca la
DB de prod sin OK (gate `migrate deploy`).

---

## 5. Demo a costo 0 (mientras tanto)

El tenant real depende de (1)-(6). Hasta entonces, la **vidriera premium** se le
muestra al cliente con el **prototipo standalone `/magra`** (Next, corre local sin
DB, marca oxblood ya hecha) — explícitamente etiquetado como demo visual desechable,
**no** la arquitectura. Se borra cuando exista la vidriera del tenant en el ERP.
Alineado con FUNDAMENTOS §5: *"Demos a costo 0, en local"*.

---

## 6. Decisiones/supuestos tomados (modo autónomo)

1. **Venta por kg = campo de extensión sobre `Product`**, no tabla nueva (mec. A
   ADR-002). Si acumula sub-dominio propio (lotes, media res, trazabilidad), se
   reevalúa hacia Capability (mec. B). Supuesto: para el MVP alcanza extensión.
2. **POS/Orden es Capability del Core**, no del Blueprint (ADR-002 §3): la va a
   reusar cualquier vertical retail futuro (kiosco, autoservicio), no solo magra.
3. **magra no usa Scheduling.** El "pedido con retiro/delivery" se modela como
   Orden con estado + fulfillment, no como Appointment.
4. **Theming por tenant** es config, no fork: tokens semánticos ya existen; falta
   la capa de resolución de marca por tenant.

**Pendiente de OK antes de escribir código:** este brief propone el encuadre; la
formalización (ADR) y el arranque de implementación esperan tu visto y la versión
final de `FUNDAMENTOS-Y-VISION.md`.
