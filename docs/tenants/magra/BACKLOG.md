# BACKLOG — Tenant `magra` (Blueprint Carnicería/Retail)

Alcance del tenant magra, priorizado **MVP → v1+**, definido para **superar a
Bistrosoft** (referencia competitiva) apoyándose en nuestras distinciones:
multi-tenant cloud estilo SAP Public Cloud, plugin fiscal `arca`, marca premium y
vidriera online propia. Alineado a `docs/FUNDAMENTOS-Y-VISION.md` y ADR-002/003/018/019.

> Cada ítem se resuelve como **capability/config/plugin del Core**, nunca como app
> aparte. Los que dependen de plataforma (RLS, provisioning, blueprints, POS) están
> marcados con su gate. Ver `blueprint-carniceria-brief.md` para el mapeo técnico.

---

## 1. Mapa comparativo — Bistrosoft vs. magra

| Capacidad | Bistrosoft | magra (objetivo) | Veredicto |
|---|---|---|---|
| **Venta por peso / balanza** | Integra báscula, pero **sin PLU / etiqueta con peso embebido / tara documentados**. Débil para corte al peso. | Venta por kg de primera clase (precio/kg, gramos, total); v1+ balanza de mostrador + etiqueta EAN-13 peso embebido + tara. | 🟢 **Superar** (diferencial #1) |
| **Arquitectura** | Híbrido: hardware Android local ("Bistro Advance") + backoffice nube. | **Cloud multi-tenant puro** (SAP Public Cloud): sin hardware propietario, updates centrales, escala multi-sucursal nativa. | 🟢 **Superar** |
| **Vidriera online** | "Tienda de pedidos" gastronómica, atada a Mercado Pago, branding limitado. | **Vidriera premium** por tenant: catálogo de cortes, marca (oxblood/hueso/latón), SEO, fotos. | 🟢 **Superar** |
| **Facturación ARCA** | Módulo pago "2 en 1" (comanda+factura), funcional. | Plugin `arca` (outbox + `RegisterFiscalDocument`, ADR-022). | 🟡 **Paridad** |
| **Delivery / apps** | Fuerte: PedidosYa, Rappi, Uber Eats. | MVP: vidriera propia (retiro/delivery Canning). v1+: integración apps. | 🟠 **Alcanzar (v1+)** |
| **Medios de pago** | Fuerte AR: MP, Modo, Nave, Kamipay, Simplefi. | MVP: pago a coordinar + MP. v1+: más PSPs. | 🟠 **Alcanzar (v1+)** |
| **Cuentas corrientes** | No confirmado. | Cuenta corriente de clientes/mayoristas (rubro carnicería lo pide). | 🟢 **Superar (v1+)** |
| **Multi-sucursal** | Poco documentado, sin consolidación central clara. | Multi-tenant real → multi-sucursal y casa matriz nativas. | 🟢 **Superar (v1+)** |
| **Stock / costeo** | Fuerte en recetas/mermas (gastronomía). | Stock por producto; costeo por peso/merma de corte (no por receta). | 🟡 **Paridad / adaptar** |
| **Confiabilidad + soporte** | Reseñas negativas de estabilidad y soporte. | Diferenciar por fiabilidad cloud y soporte cercano. | 🟢 **Superar (operativo)** |
| **Fidelización / promos** | Presente (gastronomía). | Capability Cupones existente + fidelización. | 🟡 **Paridad (v1+)** |

**Lectura:** la facturación ARCA y el delivery-apps son *paridad* (Bistrosoft ya los
tiene) — no diferencian. magra gana en **balanza premium, experiencia cloud
multi-tenant, vidriera de marca y cuentas corrientes**. Ahí se pone el foco.

---

## 2. Alcance MVP (lo mínimo vendible y ya superador en lo esencial)

Prioridad por lo que una carnicería premium necesita primero + donde ya superamos
a Bistrosoft sin esperar features pesadas.

- [ ] `[MVP][plataforma]` **RLS + resolución de tenant por request** (ADR-018) —
  **gate #0**: sin esto no puede existir el tenant #2. Bloquea todo lo demás.
- [ ] `[MVP][plataforma]` **Provisioning** `scripts/provision-tenant.ts` (ADR-019)
  parametrizado por `--blueprint=carniceria`.
- [ ] `[MVP][plataforma]` **Sistema de Blueprints en código** (`src/blueprints/carniceria/`)
  + registro de capabilities activas por tenant.
- [ ] `[MVP][capability]` **Venta por kg** — campo de extensión sobre `Product`
  (`saleUnit`, `pricePerKg`) + cálculo de línea por gramos. Diferencial #1, versión software.
- [ ] `[MVP][capability]` **POS/Orden** — `Order`/`OrderItem` genéricos del Core
  (ADR-003 Fase 2) con estados y fulfillment (retiro/delivery). Reusable por retail futuro.
- [ ] `[MVP][vidriera]` **Vidriera premium por tenant** — catálogo de cortes con
  precio/kg, marca magra, generalizando `src/app/(site)/`. Supera la tienda gastro.
- [ ] `[MVP][vidriera]` **Toma de pedidos** desde la vidriera → cae al backoffice.
- [ ] `[MVP][backoffice]` **Catálogo + precios** (ABM) y **bandeja de pedidos** con estados.
- [ ] `[MVP][plugin]` **`arca`** facturación electrónica (paridad; ADR-022). Puede ir en paralelo.
- [ ] `[MVP][marca]` **Theming por tenant** — resolución de marca (tokens) por tenant.

## 3. Alcance v1+ (donde rematamos la ventaja)

- [ ] `[v1+][balanza]` **Balanza de mostrador**: integración de báscula, **PLU**,
  precio/kg dinámico, **tara**, etiqueta **EAN-13 con peso embebido** (código 2x).
  Es el knockout sobre Bistrosoft para carnicería de corte.
- [ ] `[v1+][clientes]` **Cuenta corriente** de clientes/mayoristas (saldo, límite, resúmenes).
- [ ] `[v1+][multi-sucursal]` Segunda sucursal / casa matriz (natural en multi-tenant).
- [ ] `[v1+][delivery]` Integración con apps (PedidosYa/Rappi) además de la vidriera propia.
- [ ] `[v1+][pagos]` MP online en la vidriera + conciliación; más PSPs.
- [ ] `[v1+][stock]` Costeo por peso/merma de corte, media res, trazabilidad de lote.
- [ ] `[v1+][fidelización]` Programa de puntos/beneficios (sobre capability Cupones).
- [ ] `[v1+][reportes]` Dashboard de ventas por corte, ticket promedio, margen por kg.

## 4. Fuera de alcance (por ahora)

- Recetas/ingeniería de menú (es gastronomía, no carnicería).
- Comanderas de cocina / KDS / gestión de mesas (irrelevante para mostrador).
- Portal self-service de alta de tenants (ADR-019 lo difiere).

## 5. Dependencias (orden forzado)

```
ADR-018 (RLS + resolución)  ─┐
                             ├─→ provisioning (ADR-019) ─→ blueprint carnicería ─┐
Core: venta-por-kg (ext.)   ─┘                                                   │
Core: POS/Orden (ADR-003)   ──────────────────────────────────────────────────┤
                                                                                 ├─→ Vidriera + pedidos → DEMO real del tenant
Theming por tenant          ──────────────────────────────────────────────────┘
plugin arca (ADR-022) ── en paralelo
```

Nada de esto toca la DB de prod sin OK (gate `migrate deploy`). Demo a costo 0 con
el prototipo standalone hasta que exista la vidriera del tenant.
