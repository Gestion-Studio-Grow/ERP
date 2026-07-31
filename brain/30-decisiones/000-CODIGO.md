---
tipo: indice
generado: true
tags: [brain/indice, brain/codigo]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🔗 Mapa código ↔ decisión

> ⚠️ **Esto son CITAS, no autoridad.** Se deriva de las referencias `ADR-NNN` que el código
> ya tiene escritas. Que un archivo cite un ADR **no prueba que lo implemente**, y que no lo
> cite **no prueba lo contrario**: `src/plugins/bancos/` implementa ADR-075 y cita nueve ADR
> vecinos menos ese. Usalo para orientarte rápido, no para concluir.

**Cómo leer el tipo de vínculo:**

- **cabecera** — la cita está en las primeras 10 líneas del archivo. Por convención de facto del repo, eso suele declarar la decisión que lo gobierna.
- **inline** — la cita está en el cuerpo: casi siempre justifica una línea puntual.
- **el ADR cita la ruta** — camino inverso: la decisión nombra el archivo.

## Cobertura

| Métrica | Valor |
|---|---:|
| Archivos de `src/` que citan un ADR | 287 de 577 |
| Archivos de `prisma/` que citan un ADR | 35 de 68 |
| Archivos de `scripts/` que citan un ADR | 10 de 26 |
| Archivos escaneados en total | 671 |
| Archivos que citan algún ADR | 332 |
| ADR con vínculo (cita desde código **o** ruta citada por el ADR) | 78 de 81 |

## 🕳️ Los agujeros (a la vista, no tapados)

- **Citas a ADR que no existen como documento:** ADR-085, ADR-096. El código invoca una decisión que no está escrita — o el ADR falta, o la cita quedó mal.
- **3 ADR sin ningún vínculo al código.** Muchos son de proceso o negocio y ahí es correcto (N/A); los técnicos que aparezcan acá merecen una mirada: ADR-077, ADR-078, ADR-080
- **Un directorio puede no citar su propio ADR** (caso `bancos`/ADR-075). La ausencia en este mapa no es evidencia de nada.

## Dónde se cita cada decisión

### [ADR-001](ADR-001.md)

- **cabecera (2):** `src/lib/tenant.ts` · `prisma/schema.prisma`
- **inline (4):** `src/plugins/mercadopago/core-contract.ts` · `prisma/seed.ts` · `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-002](ADR-002.md)

- **cabecera (19):** `src/app/api/cron/arca-outbox/route.ts` · `src/blueprints/agenda/index.ts` · `src/blueprints/agenda/rubros.ts` · `src/blueprints/families.ts` · `src/blueprints/gastronomia/index.ts` · `src/blueprints/generico.ts` · `src/blueprints/index.ts` · `src/blueprints/oficios/index.ts` … y 11 más
- **inline (13):** `src/lib/catalog-actions.ts` · `src/lib/invoice-from-appointment.ts` · `src/lib/invoice-from-order.ts` · `src/lib/operator-config.ts` · `src/lib/provisioning/ports.ts` … y 8 más

### [ADR-003](ADR-003.md)

- **cabecera (10):** `src/blueprints/agenda/index.ts` · `src/blueprints/agenda/rubros.ts` · `src/blueprints/gastronomia/index.ts` · `src/blueprints/oficios/index.ts` · `src/blueprints/retail/index.ts` · `src/blueprints/types.ts` · `src/lib/order-actions.ts` · `src/lib/order-core.test.ts` … y 2 más
- **inline (2):** `prisma/schema.prisma` · `scripts/adr-graph.mjs`

### [ADR-004](ADR-004.md)

- **cabecera (1):** `src/lib/caja/caja-open-concurrency.test.ts`
- **inline (3):** `src/lib/caja-actions.ts` · `src/lib/rls.ts` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/rls.ts`

### [ADR-005](ADR-005.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-006](ADR-006.md)

- **cabecera (5):** `src/lib/arca-dispatch.ts` · `src/lib/fiscal.ts` · `src/lib/invoice-from-mp.ts` · `src/plugins/arca/domain/comprobante.ts` · `src/plugins/mercadopago/manifest.ts`
- **inline (16):** `src/lib/bancos-actions.ts` · `src/lib/bancos-glue.ts` · `src/lib/caja/cash-register.ts` · `src/lib/cockpit/salud.ts` · `src/lib/invoice-core.ts` … y 11 más

### [ADR-007](ADR-007.md)

- **inline (2):** `src/lib/audit-retention.ts` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/audit-retention.ts`

### [ADR-008](ADR-008.md)

- **cabecera (2):** `src/lib/logger.ts` · `src/lib/request-context.ts`
- **inline (3):** `scripts/adr-context.mjs` · `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-009](ADR-009.md)

- **cabecera (3):** `src/lib/audit-retention.ts` · `src/lib/audit.ts` · `scripts/purge-audit-logs.ts`
- **inline (6):** `src/lib/catalog-actions.ts` · `src/lib/order-core.ts` · `src/lib/stock/purchase-core.ts` · `prisma/schema.prisma` · `scripts/adr-graph.mjs` … y 1 más
- **el ADR cita:** `src/lib/audit.ts` · `src/lib/audit-retention.ts`

### [ADR-010](ADR-010.md)

- **cabecera (4):** `src/blueprints/servicios.ts` · `src/lib/datetime.ts` · `src/lib/tenant.ts` · `prisma/schema.prisma`
- **inline (2):** `prisma/seed.ts` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/tenant.ts`

### [ADR-011](ADR-011.md)

- **cabecera (3):** `src/app/admin/(dashboard)/turnos/page.tsx` · `scripts/categorize-services.ts` · `scripts/seed-categories.ts`
- **inline (3):** `src/lib/actions.ts` · `prisma/schema.prisma` · `scripts/adr-graph.mjs`

### [ADR-012](ADR-012.md)

- **inline (2):** `prisma/schema.prisma` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/notifications.ts` · `src/app/api/cron/reminders`

### [ADR-013](ADR-013.md)

- **cabecera (1):** `src/app/(site)/_ch/types.ts`
- **inline (6):** `src/lib/actions.ts` · `src/app/(site)/_ch/BookingModal.tsx` · `src/app/(site)/_ch/ServicesAccordion.tsx` · `src/app/(site)/reserva/BookingForm.tsx` · `prisma/schema.prisma` … y 1 más

### [ADR-014](ADR-014.md)

- **inline (5):** `src/app/(site)/_ch/types.ts` · `src/lib/actions.ts` · `src/app/(site)/_ch/BookingModal.tsx` · `prisma/schema.prisma` · `scripts/adr-graph.mjs`

### [ADR-015](ADR-015.md)

- **cabecera (5):** `src/lib/caja-actions.ts` · `src/lib/order-actions.ts` · `src/lib/stock-actions.ts` · `src/lib/stock-adjustment-actions.ts` · `src/lib/tenant.ts`
- **inline (11):** `src/lib/caja/cash-sale.ts` · `src/lib/order-core.ts` · `src/lib/rls.ts` · `src/lib/session.ts` · `src/lib/settings.ts` … y 6 más
- **el ADR cita:** `src/lib/tenant.ts`

### [ADR-016](ADR-016.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-017](ADR-017.md)

- **cabecera (9):** `src/lib/auth-password.ts` · `src/lib/auth.ts` · `src/lib/authz.ts` · `src/lib/capabilities.ts` · `src/lib/operator-auth.ts` · `src/lib/public-api-auth.ts` · `src/lib/session.ts` · `src/lib/user-actions.ts` … y 1 más
- **inline (10):** `src/lib/actions.ts` · `src/lib/admin-nav-items.ts` · `src/lib/audit.ts` · `src/lib/provisioning/types.ts` · `src/proxy.ts` … y 5 más
- **el ADR cita:** `src/lib/auth.ts` · `src/proxy.ts` · `src/lib/audit.ts`

### [ADR-018](ADR-018.md)

- **cabecera (22):** `src/lib/cockpit/salud.ts` · `src/lib/db.ts` · `src/lib/operator-db.ts` · `src/lib/prisma.ts` · `src/lib/rls.ts` · `src/lib/tenant-context.ts` · `src/lib/tenant.test.ts` · `src/lib/tenant.ts` … y 14 más
- **inline (29):** `src/app/api/public/v1/orders/route.ts` · `src/app/api/webhooks/mercadopago/route.ts` · `src/lib/arca-dispatch.ts` · `src/lib/bancos-actions.ts` · `src/lib/bancos-glue.ts` … y 24 más
- **el ADR cita:** `src/lib/tenant.ts`

### [ADR-019](ADR-019.md)

- **cabecera (18):** `src/blueprints/families.ts` · `src/blueprints/generico.ts` · `src/blueprints/index.ts` · `src/blueprints/servicios.ts` · `src/blueprints/types.ts` · `src/lib/operator-actions.ts` · `src/lib/operator-provisioning-actions.ts` · `src/lib/provisioning/adapters.ts` … y 10 más
- **inline (15):** `src/blueprints/agenda/index.ts` · `src/blueprints/agenda/rubros.ts` · `src/blueprints/gastronomia/index.ts` · `src/blueprints/oficios/index.ts` · `src/blueprints/presets-meta.ts` … y 10 más
- **el ADR cita:** `prisma/seed.ts`

### [ADR-020](ADR-020.md)

- **cabecera (9):** `src/app/api/public/v1/orders/route.ts` · `src/lib/external-orders.ts` · `src/lib/invoice-core.ts` · `src/lib/invoice-from-order.ts` · `src/lib/order-core.ts` · `src/lib/public-api-auth.ts` · `src/plugins/arca/core-contract.ts` · `src/plugins/bancos/core-contract.ts` … y 1 más
- **inline (3):** `src/lib/order-actions.ts` · `prisma/schema.prisma` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/actions.ts`

### [ADR-021](ADR-021.md)

- **cabecera (12):** `src/app/operador/(console)/direccion/panel/route.ts` · `src/lib/operator-actions.ts` · `src/lib/operator-auth.ts` · `src/lib/operator-config.ts` · `src/lib/operator-db.ts` · `src/lib/operator-provisioning-actions.ts` · `src/lib/operator-session.ts` · `src/lib/provisioning/adapters.ts` … y 4 más
- **inline (12):** `src/lib/arca-dispatch.ts` · `src/lib/cockpit/datos.ts` · `src/lib/cron/reminder-sweep.ts` · `src/lib/provisioning/ports.ts` · `src/lib/tenant.ts` … y 7 más

### [ADR-022](ADR-022.md)

- **cabecera (21):** `src/app/api/cron/arca-outbox/route.ts` · `src/lib/arca-dispatch.ts` · `src/lib/invoice-core.ts` · `src/plugins/arca/afip/port.ts` · `src/plugins/arca/afip/signer.ts` · `src/plugins/arca/afip/soap.ts` · `src/plugins/arca/afip/stub.ts` · `src/plugins/arca/core-contract.ts` … y 13 más
- **inline (6):** `src/lib/bancos-glue.ts` · `src/plugins/arca/domain/comprobante.ts` · `src/plugins/arca/module.ts` · `prisma/schema.prisma` · `scripts/adr-graph.mjs` … y 1 más
- **el ADR cita:** `src/plugins/arca/` · `src/plugins/` · `prisma/schema.prisma` · `prisma/migrations/20260704160000_add_invoice_outbox/` · `src/lib/invoice-core.ts`

### [ADR-023](ADR-023.md)

- **cabecera (5):** `src/lib/audit-retention.test.ts` · `src/lib/audit-retention.ts` · `src/lib/report-config.test.ts` · `src/lib/report-config.ts` · `scripts/purge-audit-logs.ts`
- **inline (7):** `src/lib/actions.ts` · `src/lib/booking-core.ts` · `src/lib/rls.ts` · `src/app/admin/(dashboard)/libros/page.tsx` · `src/app/admin/(dashboard)/reportes/page.tsx` … y 2 más
- **el ADR cita:** `prisma/schema.prisma` · `prisma/migrations/` · `src/lib/` · `src/lib/rls.ts` · `prisma/adapter-pg`

### [ADR-024](ADR-024.md)

- **cabecera (18):** `src/app/api/webhooks/mercadopago/route.ts` · `src/lib/fiscal.ts` · `src/lib/invoice-from-appointment.ts` · `src/lib/invoice-from-order.ts` · `src/lib/mercadopago-actions.ts` · `src/lib/mercadopago-auto.ts` · `src/lib/mercadopago-dispatch.ts` · `src/lib/pagos-dispatch.ts` … y 10 más
- **inline (3):** `src/lib/actions.ts` · `src/plugins/mercadopago/http.ts` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/actions.ts` · `src/plugins/mercadopago/` · `src/lib/fiscal.ts`

### [ADR-025](ADR-025.md)

- **cabecera (16):** `src/lib/cartera-actions.ts` · `src/lib/cartera-core.ts` · `src/lib/invoice-from-mp.ts` · `src/lib/mercadopago-ingest.ts` · `src/lib/mercadopago-simulador.ts` · `src/modules/descriptors/cartera.ts` · `src/plugins/bancos/domain/clasificador.ts` · `src/plugins/mercadopago/classifier.ts` … y 8 más
- **inline (11):** `src/lib/bancos-actions.ts` · `src/lib/mercadopago-auto.ts` · `src/lib/mercadopago-cobros-dispatch.ts` · `src/lib/settlement/invoice-origin.ts` · `src/plugins/bancos/core-contract.ts` … y 6 más
- **el ADR cita:** `src/plugins/mercadopago/oauth.ts` · `src/lib/mercadopago-simulador.ts` · `src/app/contador/` · `src/lib/contador-panel.ts` · `src/lib/mercadopago-ingest.ts`

### [ADR-026](ADR-026.md)

- **cabecera (14):** `src/lib/audit-retention.test.ts` · `src/lib/caja/caja-open-concurrency.test.ts` · `src/lib/caja/cash-sale-atomic.test.ts` · `src/lib/caja/cash-sale-unique.test.ts` · `src/lib/invoice-core.test.ts` · `src/lib/order-core-guards.test.ts` · `src/lib/order-core.test.ts` · `src/lib/owner-insights.ts` … y 6 más
- **inline (4):** `src/lib/invoice-core.ts` · `src/lib/order-core.ts` · `src/lib/report-kpis.ts` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/x.ts` · `src/lib/x.test.ts`

### [ADR-027](ADR-027.md)

- **cabecera (2):** `src/lib/benchmark-aggregate.ts` · `src/lib/owner-insights.ts`
- **inline (6):** `src/lib/actions.ts` · `src/lib/benchmark-aggregate.test.ts` · `src/lib/owner-trends.ts` · `src/components/OwnerPanel.tsx` · `scripts/adr-graph.mjs` … y 1 más

### [ADR-028](ADR-028.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-029](ADR-029.md)

- **inline (2):** `src/lib/provisioning/types.ts` · `scripts/adr-graph.mjs`
- **el ADR cita:** `src/lib/tenant.ts` · `src/lib/tenant.test.ts`

### [ADR-030](ADR-030.md)

- **cabecera (2):** `src/lib/profile-gating.ts` · `prisma/seed-demo-empresa.ts`
- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-031](ADR-031.md)

- **inline (1):** `scripts/adr-graph.mjs`
- **el ADR cita:** `src/app/demo/`

### [ADR-032](ADR-032.md)

- **inline (2):** `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-033](ADR-033.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-034](ADR-034.md)

- **inline (2):** `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`
- **el ADR cita:** `src/preset/extraction/`

### [ADR-035](ADR-035.md)

- **inline (1):** `scripts/adr-graph.mjs`
- **el ADR cita:** `src/app/demo/`

### [ADR-036](ADR-036.md)

- **inline (1):** `scripts/adr-graph.mjs`
- **el ADR cita:** `src/blueprints/retail/rubros.ts` · `src/blueprints/index.ts`

### [ADR-037](ADR-037.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-038](ADR-038.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-039](ADR-039.md)

- **inline (1):** `scripts/adr-graph.mjs`
- **el ADR cita:** `prisma/migrations/`

### [ADR-040](ADR-040.md)

- **cabecera (1):** `scripts/adr-linkcheck.mjs`
- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-041](ADR-041.md)

- **inline (3):** `src/lib/pagos-dispatch.ts` · `src/modules/contract.ts` · `scripts/adr-graph.mjs`

### [ADR-042](ADR-042.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-043](ADR-043.md)

- **cabecera (2):** `src/app/admin/(dashboard)/catalogo/AsignacionSection.tsx` · `src/app/operador/(console)/layout.tsx`
- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-044](ADR-044.md)

- **cabecera (3):** `src/lib/cockpit/salud.ts` · `src/app/admin/(dashboard)/facturacion/CobrosSection.tsx` · `src/app/operador/(console)/cockpit/Widgets.tsx`
- **inline (3):** `src/lib/datetime.ts` · `src/app/(site)/_ch/BookingModal.tsx` · `scripts/adr-graph.mjs`

### [ADR-045](ADR-045.md)

- **cabecera (5):** `src/lib/cartera-actions.ts` · `src/lib/cartera-core.ts` · `src/modules/descriptors/cartera.ts` · `src/app/contador/page.tsx` · `prisma/migrations/20260711140000_add_cartera_cliente/migration.sql`
- **inline (3):** `prisma/schema.prisma` · `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-046](ADR-046.md)

- **cabecera (2):** `src/lib/contact-validation.ts` · `src/lib/password-policy.ts`
- **inline (2):** `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-047](ADR-047.md)

- **cabecera (1):** `src/plugins/bancos/domain/templates.ts`
- **inline (2):** `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-048](ADR-048.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-049](ADR-049.md)

- **inline (3):** `src/lib/cockpit/plan.ts` · `src/app/operador/(console)/cockpit/Widgets.tsx` · `scripts/adr-graph.mjs`

### [ADR-050](ADR-050.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-051](ADR-051.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-052](ADR-052.md)

- **cabecera (1):** `scripts/adr-context.mjs`
- **inline (2):** `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-053](ADR-053.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-054](ADR-054.md)

- **cabecera (17):** `src/blueprints/facturita.ts` · `src/lib/admin-nav-items.ts` · `src/lib/dashboard-mode.ts` · `src/lib/module-gating.ts` · `src/lib/producto-identidad.ts` · `src/modules/catalog/index.ts` · `src/modules/catalog.ts` · `src/modules/contract.ts` … y 9 más
- **inline (10):** `src/lib/cartera-core.ts` · `src/lib/cockpit/plan.ts` · `src/lib/operator-config.ts` · `src/modules/descriptors/nativos.ts` · `src/modules/perfil.ts` … y 5 más
- **el ADR cita:** `src/modules/` · `src/plugins/arca/module.ts` · `src/plugins/arca` · `src/plugins/mercadopago` · `src/plugins/`

### [ADR-055](ADR-055.md)

- **cabecera (16):** `src/lib/cartera-actions.ts` · `src/lib/cartera-core.ts` · `src/lib/provisioning/adapters.ts` · `src/modules/activation.test.ts` · `src/modules/activation.ts` · `src/modules/catalog/asignacion.ts` · `src/modules/contract.ts` · `src/modules/descriptors/cartera.ts` … y 8 más
- **inline (11):** `src/lib/capabilities.ts` · `src/lib/catalog-actions.ts` · `src/lib/modulos-actions.ts` · `src/lib/producto-identidad.test.ts` · `src/lib/producto-identidad.ts` … y 6 más
- **el ADR cita:** `src/modules/`

### [ADR-056](ADR-056.md)

- **inline (1):** `scripts/adr-graph.mjs`
- **el ADR cita:** `src/app/operador/(console)/direccion/page.tsx` · `src/app/operador/(console)/direccion/panel/route.ts` · `src/app/operador/(console)/direccion/`

### [ADR-057](ADR-057.md)

- **cabecera (8):** `src/lib/debts/payable-repo.ts` · `src/lib/debts/receivable-repo.ts` · `src/lib/round.test.ts` · `src/lib/round.ts` · `src/plugins/bancos/core-contract.ts` · `src/plugins/bancos/domain/valores.ts` · `prisma/migrations/20260708120000_invoice_money_decimal/migration.sql` · `prisma/migrations/20260711120000_add_bancos_importacion/migration.sql`
- **inline (12):** `src/components/ui/format.ts` · `src/lib/bancos-actions.ts` · `src/lib/bancos-glue.ts` · `src/lib/facturacion-actions.ts` · `src/lib/fiscal.ts` … y 7 más
- **el ADR cita:** `prisma/schema.prisma` · `src/lib/round.ts` · `src/lib/fiscal.ts` · `src/lib/invoice-core.ts`

### [ADR-058](ADR-058.md)

- **cabecera (3):** `src/lib/profile-gating.ts` · `src/modules/perfil.test.ts` · `src/modules/perfil.ts`
- **inline (6):** `src/modules/flags.ts` · `src/app/admin/(dashboard)/AdminShell.tsx` · `src/app/admin/(dashboard)/compras/page.tsx` · `src/app/admin/(dashboard)/layout.tsx` · `prisma/schema.prisma` … y 1 más

### [ADR-059](ADR-059.md)

- **cabecera (22):** `src/components/ui/data-table-sort.test.ts` · `src/components/ui/data-table-sort.ts` · `src/components/ui/profile-labels.test.ts` · `src/components/ui/profile-labels.ts` · `src/lib/cuentas/aging.ts` · `src/lib/identity.ts` · `src/lib/profile-density.ts` · `src/lib/profile-gating.ts` … y 14 más
- **inline (9):** `src/lib/cuentas/loader.ts` · `src/modules/flags.ts` · `src/app/admin/(dashboard)/AdminShell.tsx` · `src/app/admin/(dashboard)/layout.tsx` · `src/app/admin/(dashboard)/page.tsx` … y 4 más
- **el ADR cita:** `src/lib/profile-gating.ts` · `src/modules/perfil.test.ts` · `src/modules/perfil.ts` · `src/modules/flags.ts` · `prisma/schema.prisma`

### [ADR-060](ADR-060.md)

- **cabecera (33):** `src/app/admin/(dashboard)/libros/export/route.ts` · `src/lib/cuentas/aging.ts` · `src/lib/cuentas/types.ts` · `src/lib/debts/aging.test.ts` · `src/lib/debts/aging.ts` · `src/lib/debts/cheque.ts` · `src/lib/debts/payable-repo.ts` · `src/lib/debts/payable-service.ts` … y 25 más
- **inline (16):** `src/lib/debts/cheque.test.ts` · `src/lib/operator-config.test.ts` · `src/lib/operator-config.ts` · `src/lib/provisioning/provisioning.test.ts` · `src/modules/descriptors/nativos.ts` … y 11 más

### [ADR-061](ADR-061.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-062](ADR-062.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-063](ADR-063.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-064](ADR-064.md)

- **cabecera (3):** `src/lib/caja/cash-sale-atomic.test.ts` · `src/lib/invoice-core.test.ts` · `prisma/migrations/20260710120000_invoice_origin_idempotency_unique/migration.sql`
- **inline (8):** `src/lib/caja/cash-sale.ts` · `src/lib/invoice-core.ts` · `src/lib/invoice-from-appointment.ts` · `src/lib/invoice-from-order.ts` · `src/lib/order-actions.ts` … y 3 más

### [ADR-065](ADR-065.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-066](ADR-066.md)

- **cabecera (6):** `src/lib/fiscal/cert-crypto.ts` · `src/lib/fiscal/tenant-cert.ts` · `src/plugins/arca/afip/cert-inspect.ts` · `src/plugins/arca/afip/factory.ts` · `prisma/migrations/20260711140000_add_tenant_fiscal_credential/migration.sql` · `prisma/migrations/20260711140000_add_tenant_fiscal_credential/rollback.sql`
- **inline (9):** `src/lib/arca-dispatch.test.ts` · `src/lib/arca-dispatch.ts` · `src/lib/arca-pruebas-actions.ts` · `src/lib/fiscal/tenant-cert.test.ts` · `src/lib/operator-actions.ts` … y 4 más
- **el ADR cita:** `src/plugins/arca/`

### [ADR-067](ADR-067.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-068](ADR-068.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-069](ADR-069.md)

- **inline (2):** `scripts/adr-graph.mjs` · `scripts/brain-sync.mjs`

### [ADR-070](ADR-070.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-071](ADR-071.md)

- **inline (1):** `scripts/adr-graph.mjs`

### [ADR-072](ADR-072.md)

- **cabecera (1):** `src/app/tienda/MagraFront.tsx`
- **inline (3):** `src/tenants/magra-content.ts` · `src/app/layout.tsx` · `src/app/tienda/page.tsx`

### [ADR-073](ADR-073.md)

- **inline (2):** `src/lib/tenant-layout.ts` · `src/app/tienda/Storefront.tsx`

### [ADR-074](ADR-074.md)

- **cabecera (16):** `src/lib/operator-provisioning-actions.ts` · `src/lib/provisioning/adapters.ts` · `src/lib/provisioning/console-input.test.ts` · `src/lib/provisioning/console-input.ts` · `src/lib/provisioning/dry-run.ts` · `src/lib/provisioning/index.ts` · `src/lib/provisioning/ports.ts` · `src/lib/provisioning/provision.ts` … y 8 más
- **inline (1):** `src/app/operador/(console)/alta/page.tsx`

### [ADR-075](ADR-075.md)

- **inline (1):** `scripts/brain-sync.mjs`

### [ADR-076](ADR-076.md)

- **cabecera (6):** `src/blueprints/facturita.ts` · `src/lib/facturita-actions.ts` · `src/lib/facturita-core.ts` · `src/app/facturita/app/cuenta/page.tsx` · `src/app/facturita/app/layout.tsx` · `src/app/facturita/page.tsx`
- **inline (3):** `src/blueprints/index.ts` · `src/blueprints/presets-meta.ts` · `src/lib/producto-identidad.ts`

### [ADR-079](ADR-079.md)

- **cabecera (1):** `src/app/admin/(dashboard)/facturacion/bancos/MercadoPagoSync.tsx`

### [ADR-089](ADR-089.md)

- **cabecera (3):** `src/modules/nucleo.test.ts` · `src/modules/nucleo.ts` · `src/modules/tienda-grupos.ts`
- **inline (11):** `src/lib/admin-nav-items.ts` · `src/lib/operator-actions.ts` · `src/lib/producto-identidad.test.ts` · `src/lib/producto-identidad.ts` · `src/lib/provisioning/adapters.ts` … y 6 más
- **el ADR cita:** `src/lib/producto.ts`

---

Derivado de `src/`, `prisma/` y `scripts/` por `npm run brain`. Índice: [decisiones](000-INDICE.md).
