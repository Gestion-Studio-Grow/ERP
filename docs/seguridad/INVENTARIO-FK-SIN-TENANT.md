# Inventario · FK sin el negocio (`tenantId`) — SEG-006

> Fuente: `prisma/schema.prisma` (main @ 30a480c + rama `seg/fk-compuestas-plata`), 09/11/2026. Lo genera un
> parseo del schema (sin consultar Neon). Responsable: GSG-SEG-006. Retoma ENG-015 (`docs/agent/BACKLOG.md`).

## Qué pasa y por qué importa

Postgres valida una FK **sin aplicar RLS**. Con una FK de una sola columna (`col → destino(id)`):
1. **Existencia revelada:** un negocio que escribe el id de una fila de otro negocio recibe un error distinto
   según exista o no (o, peor, la fila entra y queda colgada de un padre ajeno).
2. **Escritura cruzada por cascada:** `ON DELETE SET NULL/CASCADE` y `ON UPDATE CASCADE` sobre un padre de B
   modifican filas de A que lo referencian.
La defensa de hoy es la app: `tenantTransaction` (`src/lib/rls.ts:176`) y el candado de
`src/lib/tenant-scope.ts:85-96`, que mete `tenantId` en lecturas y updates **pero no en `create`**
(`tenant-scope.ts:19`). La base no tenía una segunda barrera.

## Números

- Relaciones con FK en el schema: **270**. Con `tenantId` dentro de la FK (a `Tenant` o compuestas): 158.
- **Sin `tenantId`: 112** (111 entre tablas de negocio + 1 exenta). El «~250» de la cert4 de #49 contaba
  todas las FK, incluidas las de `tenantId → Tenant`, que están bien.
- Por riesgo: P1 plata 42 (**18 cerradas en la tanda 1**, 24 pendientes) · P2 datos de clientas 34 ·
  P3 operación/catálogo 35 · exenta 1.

## Tanda 1 (esta rama): qué se hizo

Migración `prisma/migrations/20261109120000_fk_compuestas_plata/migration.sql` (**ADITIVA, SIN APLICAR**):
- 10 índices únicos `("tenantId","id")` en los destinos (también en `schema.prisma` como `@@unique([tenantId, id])`).
  Son trivialmente únicos (`id` es PK): no pueden fallar por datos.
- 18 FK nuevas `(col,"tenantId") → destino("tenantId","id")` **al lado** de las viejas, `NOT VALID`
  (se cumplen en toda escritura nueva; no revisan filas viejas). `ON DELETE` igual a la vieja
  (SET NULL **sólo de la columna**, `SET NULL ("col")`, Postgres ≥ 15; Neon es 16). `ON UPDATE NO ACTION`.
- Las FK nuevas **no** están en `schema.prisma`: Prisma no sabe expresar SET NULL de una columna de una FK
  compuesta. Prisma Client no cambia. Si alguien genera una migración con `migrate dev`, Prisma va a proponer
  borrarlas: **no aceptarla** (anotado en la migración).
- Tests: `src/lib/seguridad/fk-compuestas-plata-postgres.test.ts` (base efímera, app_rls): las 18 FK y los 10 índices
  existen; con la sesión de A, un id de B rebota en 7 columnas (caja, pedido, cobro, voucher×2, banco, factura); como
  dueño de las tablas, también; ni mover la hija ni el padre de negocio; los borrados siguen igual (SET NULL deja el
  negocio, CASCADE de la caja).
- Server actions: la auditoría (columna «validación hoy») **no encontró ninguna ruta que escriba un id del
  usuario sin verificarlo** → no hizo falta código nuevo. Quedan 3 helpers que confían en su llamador
  (riesgo latente, ahora cubierto por la base): `applyCollectionInTx` (`src/lib/settlement/collection-repo.ts:104-105`),
  `vincularCobroInTx` (`src/lib/facturacion/cobros-facturados.ts:115`), `recordCobroTurnoInTx` / `asentarCobroInTx`.

### Pasos del dueño (Gate 2 — nada de esto lo ejecuta un agente)

1. **Aplicar** la migración (`prisma migrate deploy`). El detector de `publicar` la va a frenar con
   «REQUIERE REVISIÓN DEL DUEÑO» (índice único y FK sobre tablas existentes): es lo esperado.
2. **Diagnóstico** (sólo lectura) — filas viejas que cruzarían negocios; debe dar 0 en todas:
   ```sql
   SELECT 'CashMovement.sessionId' AS fk, count(*) FROM "CashMovement" h JOIN "CashSession" p ON p.id = h."sessionId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CashMovement.orderId' AS fk, count(*) FROM "CashMovement" h JOIN "Order" p ON p.id = h."orderId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CashMovement.paymentId' AS fk, count(*) FROM "CashMovement" h JOIN "Payment" p ON p.id = h."paymentId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CashMovement.collectionId' AS fk, count(*) FROM "CashMovement" h JOIN "Collection" p ON p.id = h."collectionId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CashMovement.tallerPagoId' AS fk, count(*) FROM "CashMovement" h JOIN "TallerPago" p ON p.id = h."tallerPagoId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CashMovement.proyectoPagoId' AS fk, count(*) FROM "CashMovement" h JOIN "ProyectoPago" p ON p.id = h."proyectoPagoId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CashMovement.proyectoGastoId' AS fk, count(*) FROM "CashMovement" h JOIN "ProyectoGasto" p ON p.id = h."proyectoGastoId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Collection.orderId' AS fk, count(*) FROM "Collection" h JOIN "Order" p ON p.id = h."orderId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Collection.appointmentId' AS fk, count(*) FROM "Collection" h JOIN "Appointment" p ON p.id = h."appointmentId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Payment.appointmentId' AS fk, count(*) FROM "Payment" h JOIN "Appointment" p ON p.id = h."appointmentId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Invoice.orderId' AS fk, count(*) FROM "Invoice" h JOIN "Order" p ON p.id = h."orderId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Invoice.appointmentId' AS fk, count(*) FROM "Invoice" h JOIN "Appointment" p ON p.id = h."appointmentId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'CobroFacturado.invoiceId' AS fk, count(*) FROM "CobroFacturado" h JOIN "Invoice" p ON p.id = h."invoiceId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Voucher.loteId' AS fk, count(*) FROM "Voucher" h JOIN "VoucherLote" p ON p.id = h."loteId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Voucher.clientId' AS fk, count(*) FROM "Voucher" h JOIN "Client" p ON p.id = h."clientId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Voucher.appointmentId' AS fk, count(*) FROM "Voucher" h JOIN "Appointment" p ON p.id = h."appointmentId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'Voucher.collectionId' AS fk, count(*) FROM "Voucher" h JOIN "Collection" p ON p.id = h."collectionId" WHERE p."tenantId" <> h."tenantId"
   UNION ALL
   SELECT 'MovimientoImportado.importacionId' AS fk, count(*) FROM "MovimientoImportado" h JOIN "ImportacionBancaria" p ON p.id = h."importacionId" WHERE p."tenantId" <> h."tenantId";
   ```
3. Si da 0: `ALTER TABLE "<tabla>" VALIDATE CONSTRAINT "<tabla>_<col>_tenant_fkey";` (18 sentencias; no bloquea escrituras).
4. Más adelante (no aditivo, otra tanda): borrar la FK vieja de una columna. Hasta entonces el **nombre** de la
   restricción en el error distingue «no existe» de «es de otro negocio» si un mensaje crudo llegara a la pantalla;
   las rutas auditadas verifican antes y no llegan a la FK; no se verificó que ningún error crudo de Prisma llegue a la pantalla (*provisional a confirmar*).

## Riesgos residuales

- `ON UPDATE CASCADE` de la FK vieja sigue: si se reescribe el `id` de un padre, el orden de los triggers puede hacer
  fallar el UPDATE (falla cerrada, no corrompe). Los ids son cuid y no se reescriben.
- Filas viejas cruzadas (si existen) siguen ahí hasta el diagnóstico del paso 2.

## Inventario completo (112)

«validación hoy»: sólo auditada para la tanda 1; el resto se audita en su tanda.

| # | Riesgo | Tabla.columna → destino | ON DELETE | Opc. | schema.prisma | Validación hoy |
|---|---|---|---|---|---|---|
| 1 | P1 · plata — HECHO en tanda 1 | CashMovement.sessionId → CashSession | CASCADE | sí | :1661 | SÍ — caja-actions.ts:321/:536; resto ← cashSession.findFirst({tenantId}) |
| 2 | P1 · plata — HECHO en tanda 1 | CashMovement.orderId → Order | SET NULL | sí | :1677 | SÍ — cash-sale.ts:156 ← order-core.ts:1307; order-anulacion.ts:499 ← :391 |
| 3 | P1 · plata — HECHO en tanda 1 | CashMovement.paymentId → Payment | SET NULL | sí | :1688 | SÍ (sin escritor activo) — caja/cobro-turno.ts:146 |
| 4 | P1 · plata — HECHO en tanda 1 | CashMovement.collectionId → Collection | SET NULL | sí | :1700 | SÍ — cobro-turno.ts:146, pago-mixto-tx.ts:72, collection-repo.ts:183 (id recién creado); turnos/anulacion.ts:718 ← :486 |
| 5 | P1 · plata — HECHO en tanda 1 | CashMovement.tallerPagoId → TallerPago | SET NULL | sí | :1706 | SÍ — taller/caja.ts:63 ← taller/acciones.ts:385; :92 ← :422 |
| 6 | P1 · plata — HECHO en tanda 1 | CashMovement.proyectoPagoId → ProyectoPago | SET NULL | sí | :1709 | SÍ — proyectos/acciones.ts:205, acciones-ficha.ts:780/:878 |
| 7 | P1 · plata — HECHO en tanda 1 | CashMovement.proyectoGastoId → ProyectoGasto | SET NULL | sí | :1712 | SÍ — proyectos/acciones.ts:230, acciones-ficha.ts:790/:919, acciones-rendiciones.ts:227 |
| 8 | P1 · plata — HECHO en tanda 1 | CobroFacturado.invoiceId → Invoice | RESTRICT | no | :2627 | SÍ — facturacion/cobros-facturados.ts:128; turnos/anulacion.ts:605 · latente: vincularCobroInTx (:115) |
| 9 | P1 · plata — HECHO en tanda 1 | Collection.orderId → Order | SET NULL | sí | :1983 | SÍ — pago-mixto-tx.ts:58 ← order-core.ts:1307 · latente: collection-repo.ts:104 confía en el llamador |
| 10 | P1 · plata — HECHO en tanda 1 | Collection.appointmentId → Appointment | SET NULL | sí | :1985 | SÍ — turnos/cobro-turno-repo.ts:264/:282 ← appointment.findFirst({id,tenantId}) · latente: collection-repo.ts:105 |
| 11 | P1 · plata — HECHO en tanda 1 | Invoice.orderId → Order | SET NULL | sí | :1290 | SÍ — invoice-core.ts:333 ← SQL con "tenantId" :371/:418 |
| 12 | P1 · plata — HECHO en tanda 1 | Invoice.appointmentId → Appointment | SET NULL | sí | :1292 | SÍ — invoice-core.ts:333 ← :371/:418 |
| 13 | P1 · plata — HECHO en tanda 1 | MovimientoImportado.importacionId → ImportacionBancaria | CASCADE | no | :1456 | SÍ — bancos-actions.ts:255 ← :333; mercadopago-auto.ts:148; mercadopago-respaldo.server.ts:149 |
| 14 | P1 · plata — HECHO en tanda 1 | Payment.appointmentId → Appointment | RESTRICT (def.) | no | :967 | SÍ — cobro-turno-repo.ts:324 · latente: recordCobroTurnoInTx confía en el llamador |
| 15 | P1 · plata — HECHO en tanda 1 | Voucher.loteId → VoucherLote | RESTRICT (def.) | no | :4249 | SÍ — vouchers/voucher-repo.ts (upsert por tenantId+numero) |
| 16 | P1 · plata — HECHO en tanda 1 | Voucher.clientId → Client | RESTRICT (def.) | no | :4251 | SÍ — voucher-repo.ts:269 ← client.count :256; :340 ← :323 |
| 17 | P1 · plata — HECHO en tanda 1 | Voucher.appointmentId → Appointment | SET NULL | sí | :4254 | SÍ — voucher-repo.ts:148 ← :117 |
| 18 | P1 · plata — HECHO en tanda 1 | Voucher.collectionId → Collection | SET NULL | sí | :4257 | SÍ — voucher-repo.ts:186 (cobro recién creado) |
| 19 | P1 · plata — tanda 2 | AccountPayable.supplierId → Supplier | RESTRICT (def.) | no | :2052 | no auditada |
| 20 | P1 · plata — tanda 2 | AccountReceivable.clientId → Client | RESTRICT (def.) | no | :2111 | no auditada |
| 21 | P1 · plata — tanda 2 | Appointment.commissionPayoutId → CommissionPayout | SET NULL (def.) | sí | :905 | no auditada |
| 22 | P1 · plata — tanda 2 | CommissionPayout.professionalId → Professional | RESTRICT (def.) | no | :929 | no auditada |
| 23 | P1 · plata — tanda 2 | InmoAjuste.contratoId → InmoContrato | RESTRICT (def.) | no | :2991 | no auditada |
| 24 | P1 · plata — tanda 2 | InmoCuota.contratoId → InmoContrato | RESTRICT (def.) | no | :3010 | no auditada |
| 25 | P1 · plata — tanda 2 | InmoLiquidacion.propietarioId → Client | RESTRICT (def.) | no | :3069 | no auditada |
| 26 | P1 · plata — tanda 2 | InmoPago.cuotaId → InmoCuota | RESTRICT (def.) | no | :3046 | no auditada |
| 27 | P1 · plata — tanda 2 | Order.clientId → Client | SET NULL (def.) | sí | :1537 | no auditada |
| 28 | P1 · plata — tanda 2 | OrderItem.orderId → Order | CASCADE | no | :1582 | no auditada |
| 29 | P1 · plata — tanda 2 | OrderItem.productId → Product | SET NULL (def.) | sí | :1585 | no auditada |
| 30 | P1 · plata — tanda 2 | PayableCheque.payableId → AccountPayable | CASCADE | no | :2082 | no auditada |
| 31 | P1 · plata — tanda 2 | ProyectoCuota.proyectoId → Proyecto | CASCADE | sí | :3812 | no auditada |
| 32 | P1 · plata — tanda 2 | ProyectoCuota.supplierId → Supplier | SET NULL | sí | :3814 | no auditada |
| 33 | P1 · plata — tanda 2 | ProyectoGasto.proyectoId → Proyecto | RESTRICT (def.) | no | :3643 | no auditada |
| 34 | P1 · plata — tanda 2 | ProyectoGasto.supplierId → Supplier | SET NULL | sí | :3645 | no auditada |
| 35 | P1 · plata — tanda 2 | ProyectoLiquidacion.personaId → ProyectoPersona | CASCADE | no | :4069 | no auditada |
| 36 | P1 · plata — tanda 2 | ProyectoMovBanco.cuentaId → ProyectoCuentaBanco | CASCADE | no | :4041 | no auditada |
| 37 | P1 · plata — tanda 2 | ProyectoMovBanco.cuotaId → ProyectoCuota | SET NULL | sí | :4047 | no auditada |
| 38 | P1 · plata — tanda 2 | ProyectoPago.proyectoId → Proyecto | RESTRICT (def.) | no | :3623 | no auditada |
| 39 | P1 · plata — tanda 2 | StockPurchase.supplierId → Supplier | SET NULL | sí | :1796 | no auditada |
| 40 | P1 · plata — tanda 2 | StockPurchaseItem.purchaseId → StockPurchase | CASCADE | no | :1841 | no auditada |
| 41 | P1 · plata — tanda 2 | StockPurchaseItem.productId → Product | SET NULL | sí | :1844 | no auditada |
| 42 | P1 · plata — tanda 2 | TallerPago.ordenId → TallerOrden | CASCADE | no | :2774 | no auditada |
| 43 | P2 · datos de clientas | Appointment.clientId → Client | RESTRICT (def.) | no | :869 | no auditada |
| 44 | P2 · datos de clientas | Appointment.professionalId → Professional | RESTRICT (def.) | no | :871 | no auditada |
| 45 | P2 · datos de clientas | Appointment.serviceId → Service | RESTRICT (def.) | no | :873 | no auditada |
| 46 | P2 · datos de clientas | Appointment.boxId → Box | RESTRICT (def.) | no | :875 | no auditada |
| 47 | P2 · datos de clientas | Consulta.proyectoId → Proyecto | SET NULL | sí | :3763 | no auditada |
| 48 | P2 · datos de clientas | ConsultaMensaje.consultaId → Consulta | CASCADE | no | :3777 | no auditada |
| 49 | P2 · datos de clientas | InmoConsulta.propiedadId → InmoPropiedad | SET NULL | sí | :2914 | no auditada |
| 50 | P2 · datos de clientas | InmoConsulta.clientId → Client | SET NULL (def.) | sí | :2925 | no auditada |
| 51 | P2 · datos de clientas | InmoContrato.propiedadId → InmoPropiedad | RESTRICT (def.) | no | :2947 | no auditada |
| 52 | P2 · datos de clientas | InmoContrato.inquilinoId → Client | RESTRICT (def.) | no | :2949 | no auditada |
| 53 | P2 · datos de clientas | InmoContrato.propietarioId → Client | RESTRICT (def.) | no | :2951 | no auditada |
| 54 | P2 · datos de clientas | InmoFoto.propiedadId → InmoPropiedad | CASCADE | no | :2894 | no auditada |
| 55 | P2 · datos de clientas | InmoPropiedad.propietarioId → Client | SET NULL (def.) | sí | :2870 | no auditada |
| 56 | P2 · datos de clientas | PadelAlumno.clientId → Client | RESTRICT (def.) | no | :3178 | no auditada |
| 57 | P2 · datos de clientas | PadelAviso.claseId → PadelClase | SET NULL | sí | :3324 | no auditada |
| 58 | P2 · datos de clientas | PadelAviso.alumnoId → PadelAlumno | SET NULL | sí | :3326 | no auditada |
| 59 | P2 · datos de clientas | PadelClase.alumnoId → PadelAlumno | RESTRICT (def.) | no | :3198 | no auditada |
| 60 | P2 · datos de clientas | PadelClase.clientId → Client | RESTRICT (def.) | no | :3200 | no auditada |
| 61 | P2 · datos de clientas | PadelClase.clubId → PadelClub | SET NULL | sí | :3224 | no auditada |
| 62 | P2 · datos de clientas | PadelClase.serieId → PadelSerie | SET NULL | sí | :3226 | no auditada |
| 63 | P2 · datos de clientas | PadelIntegrante.claseId → PadelClase | CASCADE | no | :3293 | no auditada |
| 64 | P2 · datos de clientas | PadelIntegrante.alumnoId → PadelAlumno | SET NULL | sí | :3295 | no auditada |
| 65 | P2 · datos de clientas | PadelSerie.alumnoId → PadelAlumno | RESTRICT (def.) | no | :3268 | no auditada |
| 66 | P2 · datos de clientas | PadelSerie.clubId → PadelClub | SET NULL | sí | :3270 | no auditada |
| 67 | P2 · datos de clientas | Proyecto.clientId → Client | RESTRICT (def.) | no | :3490 | no auditada |
| 68 | P2 · datos de clientas | Review.appointmentId → Appointment | CASCADE | no | :950 | no auditada |
| 69 | P2 · datos de clientas | Review.professionalId → Professional | RESTRICT (def.) | no | :952 | no auditada |
| 70 | P2 · datos de clientas | TallerFoto.ordenId → TallerOrden | CASCADE | no | :2758 | no auditada |
| 71 | P2 · datos de clientas | TallerItem.ordenId → TallerOrden | CASCADE | no | :2738 | no auditada |
| 72 | P2 · datos de clientas | TallerOrden.vehiculoId → TallerVehiculo | RESTRICT (def.) | no | :2696 | no auditada |
| 73 | P2 · datos de clientas | TallerOrden.clientId → Client | RESTRICT (def.) | no | :2698 | no auditada |
| 74 | P2 · datos de clientas | TallerVehiculo.clientId → Client | RESTRICT (def.) | no | :2671 | no auditada |
| 75 | P2 · datos de clientas | WaitlistEntry.serviceId → Service | RESTRICT (def.) | no | :1212 | no auditada |
| 76 | P2 · datos de clientas | WaitlistEntry.professionalId → Professional | SET NULL (def.) | sí | :1214 | no auditada |
| 77 | P3 · operación / catálogo | BoxBlock.boxId → Box | CASCADE | no | :575 | no auditada |
| 78 | P3 · operación / catálogo | PadelDisponibilidad.clubId → PadelClub | SET NULL | sí | :3164 | no auditada |
| 79 | P3 · operación / catálogo | Professional.boxId → Box | SET NULL (def.) | sí | :594 | no auditada |
| 80 | P3 · operación / catálogo | ProfessionalBlock.professionalId → Professional | CASCADE | no | :1091 | no auditada |
| 81 | P3 · operación / catálogo | ProfessionalNews.professionalId → Professional | CASCADE | no | :1183 | no auditada |
| 82 | P3 · operación / catálogo | ProfessionalServiceCommission.professionalId → Professional | CASCADE | no | :1109 | no auditada |
| 83 | P3 · operación / catálogo | ProfessionalServiceCommission.serviceId → Service | CASCADE | no | :1111 | no auditada |
| 84 | P3 · operación / catálogo | ProyectoArchivo.proyectoId → Proyecto | CASCADE | no | :3672 | no auditada |
| 85 | P3 · operación / catálogo | ProyectoChecklist.proyectoId → Proyecto | CASCADE | no | :3931 | no auditada |
| 86 | P3 · operación / catálogo | ProyectoComentarioImagen.versionId → ProyectoEntregableVersion | CASCADE | no | :3962 | no auditada |
| 87 | P3 · operación / catálogo | ProyectoEntregable.proyectoId → Proyecto | CASCADE | no | :3696 | no auditada |
| 88 | P3 · operación / catálogo | ProyectoEntregableVersion.entregableId → ProyectoEntregable | CASCADE | no | :3715 | no auditada |
| 89 | P3 · operación / catálogo | ProyectoEquipo.proyectoId → Proyecto | CASCADE | no | :3900 | no auditada |
| 90 | P3 · operación / catálogo | ProyectoEquipo.personaId → ProyectoPersona | CASCADE | no | :3902 | no auditada |
| 91 | P3 · operación / catálogo | ProyectoIdea.proyectoId → Proyecto | CASCADE | no | :3978 | no auditada |
| 92 | P3 · operación / catálogo | ProyectoItem.presupuestoId → ProyectoPresupuesto | CASCADE | no | :3595 | no auditada |
| 93 | P3 · operación / catálogo | ProyectoItem.supplierId → Supplier | SET NULL | sí | :3605 | no auditada |
| 94 | P3 · operación / catálogo | ProyectoMensaje.proyectoId → Proyecto | CASCADE | sí | :3946 | no auditada |
| 95 | P3 · operación / catálogo | ProyectoPresentacion.proyectoId → Proyecto | CASCADE | no | :3996 | no auditada |
| 96 | P3 · operación / catálogo | ProyectoPresupuesto.proyectoId → Proyecto | CASCADE | no | :3565 | no auditada |
| 97 | P3 · operación / catálogo | ProyectoProveedorFicha.supplierId → Supplier | CASCADE | no | :3841 | no auditada |
| 98 | P3 · operación / catálogo | ProyectoReunion.proyectoId → Proyecto | CASCADE | sí | :3915 | no auditada |
| 99 | P3 · operación / catálogo | ProyectoStand.proyectoId → Proyecto | CASCADE | no | :3739 | no auditada |
| 100 | P3 · operación / catálogo | ProyectoTarea.proyectoId → Proyecto | CASCADE | no | :3547 | no auditada |
| 101 | P3 · operación / catálogo | Service.categoryId → ServiceCategory | SET NULL (def.) | sí | :647 | no auditada |
| 102 | P3 · operación / catálogo | ServiceDetail.serviceId → Service | CASCADE | no | :713 | no auditada |
| 103 | P3 · operación / catálogo | ServiceFoto.serviceId → Service | CASCADE | no | :739 | no auditada |
| 104 | P3 · operación / catálogo | ServiceProduct.serviceId → Service | CASCADE | no | :803 | no auditada |
| 105 | P3 · operación / catálogo | ServiceProduct.productId → Product | CASCADE | no | :805 | no auditada |
| 106 | P3 · operación / catálogo | ServiceResource.serviceId → Service | CASCADE | no | :1143 | no auditada |
| 107 | P3 · operación / catálogo | ServiceResource.resourceId → Resource | CASCADE | no | :1145 | no auditada |
| 108 | P3 · operación / catálogo | StockMovement.productId → Product | SET NULL | sí | :1887 | no auditada |
| 109 | P3 · operación / catálogo | User.professionalId → Professional | SET NULL (def.) | sí | :507 | no auditada |
| 110 | P3 · operación / catálogo | UserPermissionOverride.userId → User | CASCADE | no | :527 | no auditada |
| 111 | P3 · operación / catálogo | WorkingHours.professionalId → Professional | CASCADE | no | :633 | no auditada |
| 112 | EXENTA (cruce por diseño) | CarteraCliente.clienteTenantId → Tenant | RESTRICT (def.) | no | :2170 | exenta: estudio contable → negocio cliente; vínculo entre negocios a propósito |

## Orden propuesto de las próximas tandas

1. **Tanda 2 · plata restante (24)**: comisiones, cuentas a pagar/cobrar, cheques, taller, inmobiliaria (cuotas/pagos/
   liquidaciones), proyectos (pagos/gastos/banco/cuotas/liquidaciones), compras de stock, renglones de pedido.
2. **Tanda 3 · datos de clientas (34)**: todo lo que apunta a `Client` y la agenda (turnos, reseñas, lista de espera),
   ProfeTurnos, taller, inmobiliaria.
3. **Tanda 4 · operación/catálogo (35)** + `_ProfessionalServices` (sin negocio ni RLS, ENG-015).
4. **Cierre**: borrar las FK viejas de una columna y un test-trinquete sobre `pg_constraint` (0 FK entre tablas de negocio
   sin el negocio, salvo exentas listadas).

