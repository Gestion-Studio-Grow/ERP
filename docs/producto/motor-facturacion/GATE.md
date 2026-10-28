# Gate de Excelencia — Motor de facturación automática (22/10/2026)

**Rama:** `claude/facturacion-automatica-motor` · **No va a `main`** (integra el frente, con OK del dueño).
**Alcance:** backend del motor (sin pantallas). Diagnóstico: `DIAGNOSTICO.md`. Contrato: `src/lib/facturacion/README.md`.

## 1. Auditoría SAP Fiori (7 ángulos) + ángulo argentino

| Ángulo | Estado | Evidencia |
|---|---|---|
| Rol-based | ✅ | El motor no decide permisos: lo llaman acciones con `requireCapability("billing:manage")` (panel) o la consola con la cartera verificada (ADR-077 §4). «Autorizar los pendientes» (persona) ignora la espera; el cron no. |
| Coherente | ✅ | Un solo camino: factura → outbox → despacho → plugin. La NC usa el mismo outbox que `createInvoice` y la decisión fiscal única. |
| Simple | ✅ | Errores de dato como `{ ok: false, error }`; cinco clases de falla con una regla cada una (README). |
| Adaptable | N/A | Sin UI. Por negocio: modo homologación/producción y firmante (propio o delegación). |
| Delightful / enterprise | ✅ | Interruptor por servicio, espera creciente, detenido visible y reactivable: ARCA caído no quema reintentos ni funciones. |
| Accesibilidad | N/A | Sin UI en este frente. |
| Consistencia | ✅ | Reusa `decidirComprobante`, `calcularImpuestosPorAlicuota`, módulo de plata (`centavosDe`, `proporcionAlCentavo`); no duplica patrones (el detector de redondeos a mano no suma entradas). |
| 🇦🇷 Argentino | ✅ | Mensajes en criollo («Esa factura ya está anulada entera…», «queda $600,00 por anular»). Fiscal ARCA: CbtesAsoc, misma letra/receptor, saldo, ventana de fechas, umbral RG 5700/2025 (**a confirmar con el contador**), delegación wsfe del Administrador de Relaciones. |

## 2. Sello GSG

✅ Docs firmados «— Elaborado por GSG» (`DIAGNOSTICO.md`, `GATE.md`, `README.md`); commits con el trailer del equipo. App: N/A (sin pantallas nuevas).

## 3. Excelencia de arquitectura

| Ítem | Estado | Evidencia |
|---|---|---|
| Capas / límites | ✅ | Core (`invoice-core`) no importa el plugin; el puente sigue en `arca-dispatch` (ADR-002/022). Núcleos puros: `arca-reintentos`, `firmante`, `nota-credito-core`, `renglones`, `interruptor`. |
| Testabilidad | ✅ | Seams inyectables (deps del despacho, política, reloj del interruptor, lectores de firma). |
| Multi-tenant | ✅ | Todo por `tenantTransaction` con `tenantId` explícito; la NC busca la factura con `tenantId` (otro negocio → «No encontramos esa factura»). Arreglado: el recupero de la carrera P2002 leía sin contexto de negocio. |
| Seguridad / RLS | ✅ | `ReglaFacturacion` con RLS en la migración + FK de dos columnas a `CarteraCliente`; probado con `app_rls` (B no ve ni escribe reglas de A). `npm run gate:rls` ✅. Credenciales: nunca en el repo; fail-closed. |
| Idempotencia (DB-4) | ✅ | `@@unique([tenantId, abonoClave])`; NC con la fila de la factura `FOR UPDATE`; «en duda» con número anotado antes del pedido. |
| Deuda anotada | ✅ | Interruptor por instancia (no compartido); simulador «provisional a confirmar»; `Client.phone` drift preexistente (ajeno). Ver DIAGNOSTICO. |

## 4. Confiabilidad de producción

| Ítem | Estado | Evidencia |
|---|---|---|
| `tsc --noEmit` | ✅ | 0 errores. |
| `npm run build` | ✅ | Verde (con 6 GB de heap). |
| `npm test` | ✅ sin rojos nuevos | 5831 tests: 5824 ✅, 7 ❌ = los 7 preexistentes conocidos (pie-pegado-zona-segura, escala de links de cobro, cron de recordatorios con RLS, redondeos a mano —ya rojo por archivos de club—, búsqueda sin tildes ×2, lista de clientes de siempre). Con Postgres 16 local: los tests `*-postgres` corrieron de verdad. |
| Tests nuevos | ✅ | `motor-postgres` 8 · `arca-reintentos` 5 · `interruptor` 6 · `firmante` 3 · `nota-credito-core` 6 · `renglones` 6 · `arca-dispatch` +3. |
| Lint | ✅ | `eslint` limpio en los archivos tocados. |
| Manejo de errores | ✅ | Rechazo / pasajero / no disponible / configuración / sistema, cada uno con su destino; nada queda «colgado» sin motivo. |
| No rompe prod (Gate 2) | ✅ | Migraciones **SIN APLICAR**, fuera de `prisma/lote-deploy.txt`: `20261022140000_invoice_abono_descripcion`, `20261022140100_regla_facturacion` (aditivas). Ensayadas en Postgres local (el arnés aplica toda la cadena + RLS). Nada contra Neon. **Orden obligatorio: migración → deploy.** |

**Resultado:** pasa los 4 bloques para integrarse al frente. Pendientes del dueño: aplicar las dos
migraciones (Gate 2), confirmar el umbral con el contador, y el OK para llevar el frente a `main`.

— Elaborado por GSG
