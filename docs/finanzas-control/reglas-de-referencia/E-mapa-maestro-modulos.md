# E · Mapa maestro de módulos: qué tiene un ERP completo y qué nos falta

Fecha: 12/11/2026 · Autor: agente lector (investigación, sin decisiones) · Estado: insumo para el juicio de la
orquestadora. Nada de esto está aprobado.

## Cómo se armó

- **Árboles de módulos leídos de los clones** (sólo `git ls-tree`, sin ejecutar nada), en
  `scratchpad/reglas-ref/src/`:

  | ERP | Commit | Árbol leído |
  |---|---|---|
  | Odoo Community | `53882d6` | `addons/`: 648 módulos, 234 de ellos `l10n_*` |
  | ERPNext | `f9ad328` | `erpnext/*/doctype/` |
  | OFBiz | `4f19231` | `applications/*/servicedef/` (12 aplicaciones) |
  | Tryton | `688622c` | `modules/` (221 módulos) |
  | iDempiere | `b42d472` | `org.adempiere.base/.../model/M*.java` (es un núcleo único; se citan las clases) |
  | Dolibarr | `ba80138` | `htdocs/` (81 carpetas) |

  Los listados quedan en `scratchpad/arboles/*.txt`.
- **Localización argentina:** Odoo `l10n_ar*` y `l10n_latam_*`, ingadhoc (`odoo-argentina`) y `lar_361`
  (ADempiere). Lo leído en detalle está en los archivos A, B, C y D, en su sección «Módulos encontrados».
- **Lo nuestro:** los descriptores de `src/apps/catalogo/*.ts` (78 apps con `id`) y la lista `ESPACIOS_NAV` de
  `src/apps/espacios.ts:206-282`. Esa lista trae «las de hoy y las planeadas» (`espacios.ts:195`). Un `id` que está
  en `ESPACIOS_NAV` y no tiene descriptor en el catálogo figura como **planeada: `id`**. Hay 28 en ese caso, por
  ejemplo `presupuestos`, `conciliacion`, `tienda-online` y `recetas-y-produccion`.
- **SAP:** `learning.sap.com` y `assets.cdn.sap.com` no resuelven en esta sesión (hay que habilitarlos en la red de
  la sesión). **Toda la columna SAP queda [A VALIDAR].** Las fuentes son de tres tipos:
  - **[B]**: resumen del buscador del 12/11/2026. Así se vieron J58 Accounting and Financial Close, J59 Accounts
    Receivable, J60 Accounts Payable, J62 Asset Accounting, BMC Core Inventory Management, 5MQ y 7UA (Sell from
    Stock con variantes) y 54V Produce and Sell Standard Products.
  - **[CAT]**: el código figura en nuestro `CATALOGO-FINANZAS-CONTROL.md:14-27`, sin verificar contra SAP.
  - Sin marca: sólo se nombra el área (línea de negocio), sin código de scope item.

  No se consultó código de SAP.
- **Convenciones de las tablas:**
  - «—» significa que no se encontró un módulo en el árbol leído; no prueba que no exista.
  - La prioridad se mide para una **pyme argentina de comercio o servicios**, que es nuestro cliente (no para una
    industria grande).

---

## 1. Finanzas

| # | Capacidad (en criollo) | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| F1 | Plan de cuentas | Finance · J58 [B] | `account`, `l10n_ar` | `accounts/account`, `chart_of_accounts_importer` | `accounting` (`services_ledger`) | `account` / `MAcctSchema` | `plan-de-cuentas` | **Alta**: es la base de todo lo contable. |
| F2 | Asiento automático: cada factura, pago o movimiento de stock genera su asiento | J58 (determinación de cuentas) [CAT] | `account` (`account_move`) | `general_ledger.py` | `secas_ledger.xml` | `account_invoice` / `org.idempiere.acct` `Doc` | **falta** (FC-02) | **Alta**: sin esto la contadora vuelve a cargar todo. |
| F3 | Asiento manual, plantillas de asiento y reversas | J58 [B] | `account` | `journal_entry`, `journal_entry_template` | `AcctgTransServices` | `move_template` / `MJournal` | parcial: hay motor y no hay pantalla (FC-03) | Alta: ajustes de fin de mes. |
| F4 | Libro diario, mayor, balance de sumas y saldos, estados contables | J58 [B] | `account` | `financial_report_template` | `accounting` | `account` / `Fact` | **falta** (FC-03 y FC-12) | **Alta**: es lo que pide el estudio contable. |
| F5 | Períodos, ejercicio, bloqueo de fechas y cierre con refundición | J58 [B] | `account` (fechas de bloqueo en `company.py`) | `accounting_period`, `fiscal_year`, `period_closing_voucher` | `PeriodServices` | `period`, `fiscalyear` / `MPeriod` | `ejercicio-contable`, `cierre-del-mes` (parcial) | Alta: congela lo declarado. |
| F6 | Cuenta corriente de clientes con imputación parcial | J59 [B] · BKJ [CAT] | `account_partial_reconcile` | `payment_ledger_entry`, `payment_reconciliation` | `InvoiceServices` | `account` / `MAllocationHdr` | `cuentas-a-cobrar` (sin imputación parcial; FC-04) | **Alta**: el fiado y la cuenta corriente son el día a día. |
| F7 | Antigüedad de saldos y reclamo escalonado de deudas | J59 [B] | — (sin `account_followup` en Community) | `dunning`, informe `accounts_receivable` | — | `account_dunning*` / `MDunning*`, `Aging` | parcial: `cuentas-a-cobrar` y `para-contactar-hoy`, sin reclamo por niveles | Media: con WhatsApp ya se cobra mejor. |
| F8 | Anticipos y señas de clientes | 4E9 [CAT] | `account` | `advance_payment_ledger_entry` | — | `account_deposit`, `sale_advance_payment` / — | **falta** (FC-04) | Alta: las señas son habituales (servicios, pedidos). |
| F9 | Cuentas a pagar a proveedores | J60 [B] | `account` | `purchase_invoice`, `payment_ledger_entry` | `services_payment` | `account` / `MAllocationHdr` | `cuentas-a-pagar` | Alta. |
| F10 | Orden de pago: qué se paga, con qué y qué se retiene | J60 [B] | `account_payment` (asistente `account_payment_register`) | `payment_order`, `payment_entry` | `PaymentServices` | `account_payment` / `MPaySelectionCheck` | **falta** (FC-05) | **Alta**: es el documento estándar argentino. |
| F11 | Cheques propios y de terceros, diferidos y Echeq | J60 [B] | `l10n_latam_check`, `account_check_printing` | `cheque_print_template`, `bank_clearance` | — | `account_payment_check` / `MPaySelectionCheck` | **falta** (FC-05) | **Alta**: el cheque diferido y el Echeq siguen siendo masivos. |
| F12 | Bancos: importar el extracto | BFA [CAT] | `account` (`bank_statement_line`) | `bank_statement_import`, `bank_transaction` | `services_finaccount` | `account_statement` (+ofx, mt940) / `MBankStatement` | `facturacion-automatica` (lee el extracto para facturar) | Alta. |
| F13 | Conciliación bancaria con reglas | BFA [CAT] | `account_reconcile_model` | `bank_reconciliation_tool`, `bank_transaction_rule` | `services_finaccount` | `account_statement_rule` / `MBankStatementMatcher` | planeada: `conciliacion` | **Alta**: hoy se concilia en Excel. |
| F14 | Caja: apertura, arqueo, cierre y libro de caja | BFB [CAT] | `point_of_sale` (sesión) | `pos_opening_entry`, `pos_closing_entry`, `cashier_closing` | — | `sale_point` / `MCash`, `MCashBook` | `caja-del-dia`, `cierre-del-dia`, `libro-de-caja` | Alta (cubierta). |
| F15 | Moneda extranjera con cotización del día (ARS/USD) | 1EG [CAT] | `base` (`res_currency`) | `currency_exchange_settings`, `pegged_currencies` | `services_rate` | `currency` / `MConversionRate` | **falta** (FC-06) | **Alta**: los precios y las deudas en dólares son comunes. |
| F16 | Diferencia de cambio y revaluación al cierre | 1EG [CAT] | `account` | `exchange_rate_revaluation` | `GeneralLedgerServices` | — / `InvoiceNGL` | **falta** (FC-06) | Media. |
| F17 | Flujo de fondos y plan de caja | Finance (tesorería) | — | — (informe, no verificado) | — | — / `MCashPlan` | `flujo-de-fondos` | Alta (cubierta). |
| F18 | Condiciones de pago y cuotas (30/60/90, pronto pago) | J59 [B] | `account_payment_term` | `payment_term`, `payment_terms_template` | — | `account_invoice` (`payment_term`) / `MInvoicePaySchedule` | **falta** | Media. |
| F19 | Descuento de cheques o facturas (FCE) en el banco | Finance (tesorería) | — | `invoice_discounting` | — | — | **falta** | Media: lo usa la pyme que vende a grandes empresas. |
| F20 | Préstamos y deudas financieras | Finance (tesorería) | — | — | — | — | **falta** | Baja: Dolibarr lo trae (`loan`). |
| F21 | Centros de costo y dimensiones analíticas | J55 [CAT] | `analytic` | `cost_center`, `accounting_dimension` | — | `analytic_account` / — | parcial: por local y por proyecto | Media. |
| F22 | Devengamiento de ingresos y gastos diferidos | J58 [B] | — | `process_deferred_accounting` | — | `account_invoice_defer` / — | **falta** | Baja. |
| F23 | Libro inalterable (encadenado o con hash) | — | `account` (hash en `account_move`) | — | — | — | parcial: `auditoria` | Media: es defensa ante una inspección. Dolibarr: `blockedlog`. |
| F24 | Ajuste por inflación contable | Finance (localización AR) [A VALIDAR] | — | — | — | — | **falta** | Media: obligatorio en balances con inflación alta; ningún ERP abierto lo trae. |
| F25 | Consolidación e interempresa | Finance | `account_payment_interco` | `company` | — | `account_consolidation` / — | **falta** | Baja. |

## 2. Ventas

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| V1 | Presupuesto o cotización al cliente | Sales | `sale_management` | `quotation` | `services_quote` | `sale` / `MOrder` | planeada: `presupuestos` (además del rubro: `taller`, `proyectos`) | **Alta**: el presupuesto por WhatsApp cierra la venta. |
| V2 | Nota de pedido o pedido de venta | Sales · 5MQ/7UA [B] | `sale` | `sales_order` | `services_order` | `sale` / `MOrder` | `pedidos` | Alta (cubierta). |
| V3 | Factura de venta | Sales / J59 [B] | `account`, `l10n_ar` | `sales_invoice` | `services_invoice` | `account_invoice` / `MInvoice` | `facturacion` | Alta (cubierta). |
| V4 | Devoluciones, nota de crédito y nota de débito | Sales | `account_debit_note` | `sales_invoice` (devolución) | `services_return` | `sale_complaint`, `account_invoice_correction` / `MRMA` | planeada: `devoluciones-y-cambios`; parcial: `ventas-del-dia` (anular) | **Alta**: los cambios en la tienda son diarios. |
| V5 | Listas de precios por cliente o canal | Sales | `product` (`pricelist`) | `price_list`, `item_price` | `services_price` | `product_price_list`, `sale_price_list` / `MPriceList` | `catalogo`, `actualizar-precios`; planeada: `listas-de-precio` | Alta. |
| V6 | Precio según el medio de pago (recargo o descuento) | — | — | `pricing_rule` (genérico) | — | — | planeada: `precio-segun-como-paga`; parcial: `ofertas` | **Alta**: es muy argentino (efectivo contra tarjeta en cuotas). |
| V7 | Promociones, combos y cupones | Sales | `loyalty`, `sale_loyalty` | `pricing_rule`, `promotional_scheme`, `coupon_code` | `services_pricepromo` | `sale_promotion`, `sale_promotion_coupon` / — | `promociones`, `ofertas` | Alta (cubierta). |
| V8 | Puntos, vales y tarjetas de regalo | Sales | `loyalty` | `loyalty_program` | — | `sale_gift_card` / — | planeada: `vales-de-regalo` | Media. |
| V9 | Límite de crédito por cliente | Sales / J59 [B] | — | `customer_credit_limit` | — | `account_credit_limit`, `sale_credit_limit` / — | **falta** | Media: frena el fiado que no vuelve. |
| V10 | Comisiones de vendedores o profesionales | J11 [CAT] | — | `sales_team` (`selling_controller`) | — | `commission` / `MCommission*` | `comisiones`; rubro: `gestion-mi-liquidacion` | Media (cubierta). |
| V11 | Margen por venta y por producto | Sales (análisis) | `sale_margin`, `product_margin` | informe `gross_profit` | — | `stock_reporting_margin` / — | `margen` | Alta (cubierta). |
| V12 | Abonos, suscripciones y facturación recurrente | Sales (suscripciones) | — (sin `sale_subscription` en Community) | `subscription` | `services_subscription` | `sale_subscription` / `MRecurring` | planeada: `paquetes-y-abonos` | Media: gimnasios, clubes, cuotas. |
| V13 | Kits y conjuntos | Sales | `mrp` (kit), `product_matrix` | `product_bundle` | `services_config` | `product_kit` / — | planeada: `kits-y-sets` | Media. |
| V14 | Acuerdos marco y contratos de venta | Sales | — | `blanket_order`, `contract` | `services_agreement` | `sale_blanket_agreement` / — | **falta** | Baja. |
| V15 | Alquileres | Sales | — | — | `services_rental` | `sale_rental` / — | rubro: `inmobiliaria`, `club` | Baja (por rubro). |
| V16 | Factura proforma | Sales | — | `proforma_invoice` | — | — | **falta** | Baja. |

## 3. Compras

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| C1 | Ficha de proveedor | Sourcing & Procurement | `contacts` | `supplier` | `party` | `party` / `MBPartner` | `proveedores`; rubro: `gestion-proveedores` | Alta (cubierta). |
| C2 | Pedido u orden de compra | Sourcing & Procurement | `purchase` | `purchase_order` | `services_order` | `purchase` / `MOrder` | planeada: `pedidos-a-proveedor`; parcial: `sugerido-de-compra` (lo arma por WhatsApp) | **Alta**: hoy el pedido no queda registrado para controlarlo después. |
| C3 | Recepción controlada contra el pedido y la factura | Sourcing & Procurement | `purchase_stock` | `purchase_receipt` | `services_shipment` | `purchase` + `stock` / `MInOut` | parcial: `recibir-mercaderia` (sin pedido) | **Alta**: «llegó menos de lo que pedí» es un reclamo diario. |
| C4 | Carga de la factura del proveedor con su IVA | J60 [B] | `account`, `l10n_ar` | `purchase_invoice` | `services_invoice` | `account_invoice` / `MInvoice` | parcial: `cuentas-a-pagar` (FC-07) | Alta. |
| C5 | Captura automática de comprobantes recibidos (OCR o descarga de ARCA) | Sourcing & Procurement | — | `regional/import_supplier_invoice` (Italia) | — | `document_incoming_ocr` / — | **falta** | **Alta**: la carga a mano es el dolor nº 1 del administrativo [A VALIDAR la descarga desde ARCA]. |
| C6 | Listas de precios de proveedores | Sourcing & Procurement | `purchase` | `item_supplier` | `services_supplier` | `purchase_price_list` / — | `listas-de-proveedores` | Alta (cubierta). |
| C7 | Reposición automática (punto de pedido, mínimos y máximos) | Supply Chain | `stock` (reglas) | `item_reorder` | `services_requirement` | `stock_supply`, `stock_supply_day` / — | `sugerido-de-compra` | Alta (cubierta). |
| C8 | Pedido de cotización a varios proveedores y cuadro comparativo | Sourcing & Procurement | `purchase_requisition`, `purchase_alternative` | `request_for_quotation`, `supplier_quotation` | `services_request` | `purchase_request_quotation` / `MRfQ*` | **falta** | Media. |
| C9 | Pedido interno de materiales (requisición) | Sourcing & Procurement | `purchase_requisition` | `material_request` | `services_requirement` | `purchase_request`, `purchase_requisition` / `MRequisition` | **falta** | Baja: en la pyme pide el dueño. |
| C10 | Gastos de importación prorrateados al costo | Sourcing & Procurement | `stock_landed_costs` | `landed_cost_voucher` | — | `account_stock_landed_cost` / `MLandedCost` | **falta** | Media: lo usan importadores y revendedores. |
| C11 | Devoluciones a proveedor | Sourcing & Procurement | `purchase_stock` | `purchase_receipt` (devolución) | `services_return` | `purchase` / `MRMA` | `devoluciones-a-proveedor` | Media (cubierta). |
| C12 | Evaluación de proveedores | Sourcing & Procurement | — | `supplier_scorecard` | — | — | rubro: `gestion-proveedores` (puntaje) | Baja. |
| C13 | Acuerdos marco con proveedores | Sourcing & Procurement | — | `blanket_order` | `services_agreement` | `purchase_blanket_agreement` / — | **falta** | Baja. |

## 4. Stock y logística

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| S1 | Stock por depósito y por local | BMC [B] | `stock` | `warehouse`, `bin` | `services_facility`, `services_inventory` | `stock` / `MWarehouse`, `MStorageOnHand` | `inventario`, `stock-por-local` | Alta (cubierta). |
| S2 | Movimientos de un producto (kardex) | BMC [B] | `stock` | `stock_ledger_entry` | `services_inventory` | `stock` (`move`) / `MCostDetail` | `movimientos` | Alta (cubierta). |
| S3 | Recuento e inventario físico | BMC [B] | `stock` | `stock_reconciliation` | `services_inventory` | `stock` / `MInventory` | `recuento` | Alta (cubierta). |
| S4 | Traslados entre depósitos o locales | BMC [B] | `stock` | `stock_entry` | `services_shipment` | `stock` / `MMovement` | `traslados`; planeada: `recibir-traslado` | Alta (cubierta). |
| S5 | Valuación del stock (precio promedio o FIFO) con su asiento | BMC [B] | `stock_account` | `stock/valuation.py`, `repost_item_valuation` | `CostServices` | `product_cost_fifo`, `account_stock_continental` / `MCostDetail` | parcial: `inventario` (valoriza, sin asiento) | **Alta**: sin esto no hay costo de lo vendido contable (FC-02). |
| S6 | Lotes, números de serie y vencimientos | BMC [B] | `product_expiry` | `batch`, `serial_no`, `serial_and_batch_bundle` | `services_inventory` | `stock_lot`, `stock_lot_sled` / `MInOutLineMA` | `lotes-y-vencimientos` | Alta (cubierta). |
| S7 | Variantes (talle y color) | Supply Chain | `product`, `product_matrix` | `item_variant`, `item_attribute` | `services_feature` | `product_attribute` / — | planeada: `talles-y-colores` | **Alta**: sin esto no se puede atender el rubro indumentaria y calzado. Dolibarr: `variants`. |
| S8 | Mermas y ajustes | BMC [B] | `stock` | `stock_entry` | `services_inventory` | `stock` / `MInventory` | `mermas` | Alta (cubierta). |
| S9 | Códigos de barras y etiquetas | Supply Chain | `barcodes`, `barcodes_gs1_nomenclature` | `item_barcode` | — | — | `caja-rapida`, `etiquetas-de-precio`, `balanza` | Alta (cubierta). |
| S10 | Unidades de medida y segunda unidad (kilo y pieza) | Supply Chain | `uom` | `uom_category` | `services_uom` | `stock_secondary_unit` / — | parcial: `vender` (por kilo), `despiece` | Media. |
| S11 | Reserva de stock para un pedido | Supply Chain | `stock` | `stock_reservation_entry` | `services_order` | `stock_assign_manual` / `MStorageReservation` | **falta** | Media. |
| S12 | Preparación, picking y embalaje | Supply Chain | `stock` | `pick_list`, `packing_slip` | `services_picklist` | `stock_package` / `MPackage` | parcial: `pedidos` (preparar y pesar) | Media. |
| S13 | Reparto, hoja de ruta y transportistas | Supply Chain | `delivery`, `stock_delivery`, `stock_fleet` | `delivery_trip`, `shipment` | `services_shipmentgateway` | `carrier*`, `stock_package_shipping*` / `MShipper` | planeada: `envios-y-reparto` | Media: delivery propio y moto. |
| S14 | Pronóstico de demanda | Supply Chain | — | `sales_forecast` | `services_mrp` | `stock_forecast`, `stock_supply_forecast` / `MForecast` | planeada: `fechas-que-venden` | Media. |
| S15 | Consignación | Supply Chain | — | — | — | `stock_consignment` / — | **falta** | Baja. |
| S16 | Cadena de frío (heladeras) | — | — | — | — | — | planeada: `heladeras` | Media por rubro (alimentos). Ningún ERP lo trae como módulo. |
| S17 | Control de calidad al recibir | Supply Chain | — (sin `quality` en Community) | `quality_inspection` | — | `quality` / `MQualityTest` | **falta** | Baja. |

## 5. Producción

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| P1 | Recetas y lista de materiales | Manufacturing · 54V [B] | `mrp` | `bom`, `bom_creator` | `services_bom`, `services_formula` | `production` / `MProduction` | planeada: `recetas-y-produccion` | **Alta** en gastronomía, panadería y rotisería; baja en los demás rubros. |
| P2 | Orden y parte de producción (descuenta insumos, suma producto terminado) | Manufacturing · 54V [B] | `mrp` | `work_order`, `job_card` | `services_production_run` | `production`, `production_work` / `MProduction` | **falta** (`recetas-y-produccion` está planeada) | Media. |
| P3 | Desarme y despiece (un insumo da varios productos) | Manufacturing | `mrp` (subproductos) [A VALIDAR] | `stock_entry` (reempaque) [A VALIDAR] | — | `production` / — | `despiece` | Alta en carnicería (cubierta). |
| P4 | Costo de producción | Manufacturing | `mrp_account` | `workstation_cost` | `services_cost` | `production` / `MCostDetail` | parcial: `despiece` (costo por corte) | Media. |
| P5 | Planificación de materiales (MRP) | Manufacturing | `mrp` | `production_plan`, `master_production_schedule` | `services_mrp` | `stock_supply_production` / — | **falta** | Baja. |
| P6 | Rutas, centros de trabajo y tiempos | Manufacturing | `mrp` | `routing`, `workstation`, `operation` | `services_routing` | `production_routing`, `production_work` / `MResource` | **falta** | Baja. Dolibarr: `workstation`. |
| P7 | Producción a façon (subcontratada) | Manufacturing | `mrp_subcontracting` | `subcontracting_order` | — | `production_outsourcing` / — | **falta** | Baja. |
| P8 | Mantenimiento de máquinas | Asset Management | `maintenance` | `maintenance_schedule`, `asset_maintenance` | `services_maint` | — | **falta** | Baja. |
| P9 | Calidad y no conformidades | Manufacturing | — | `quality_management` (`non_conformance`) | — | `quality` / `MQualityTestResult` | **falta** | Baja. |

## 6. Proyectos y servicios

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| PS1 | Proyectos con etapas y tareas | Professional Services | `project`, `project_todo` | `project`, `task`, `project_template` | `workeffort` | `project`, `project_plan` / `MProject`, `MProjectPhase`, `MProjectTask` | rubro: `proyectos`, `gestion-diseno`, `gestion-calendario` | Alta en servicios (cubierta por rubro). |
| PS2 | Turnos y agenda por profesional | Service | `calendar`, `resource` | `appointment`, `appointment_booking_settings` | `workeffort` | `company_work_time` / `MResourceAssignment` | `agenda`, `confirmar-manana`, `lista-de-espera`; planeada: `huecos-de-la-semana` | Alta (cubierta). |
| PS3 | Partes de horas | Professional Services | `hr_timesheet` | `timesheet`, `activity_cost` | `services_timesheet` | `timesheet`, `timesheet_cost` / `MTimeExpense` | **falta** [A VALIDAR si `gestion-diseno` lo cubre] | Media: estudios y agencias. |
| PS4 | Facturar un proyecto por hito o por horas | Professional Services | `sale_project`, `sale_timesheet` | `sales_invoice_timesheet` | `services_billing` | `project_invoice` / `MProjectLine` | parcial: rubro `proyectos` (etapa de cobro) | Media. |
| PS5 | Costo y rentabilidad por proyecto | J55/1NT [CAT] | `project_account` | informe `profitability_analysis` | — | `project_revenue` / `MProjectIssue` | parcial: rubro `gestion-direccion` (FC-13) | Media. |
| PS6 | Mesa de ayuda y reclamos con plazos de respuesta | Service | `crm_livechat` (parcial) | `issue`, `service_level_agreement` | `services_request` | `sale_complaint` / `MRequest*` | **falta** | Media. Dolibarr: `ticket`. |
| PS7 | Garantías, servicio técnico y reparaciones | Service | `repair` | `warranty_claim`, `maintenance_visit` | — | — | rubro: `taller` | Media (por rubro). Dolibarr: `fichinter`. |
| PS8 | Contratos de servicio | Service | — | `contract`, `contract_template` | `services_agreement` | — | **falta** | Baja. Dolibarr: `contrat`. |
| PS9 | Ficha técnica por cliente (tratamiento o historia) | — | — | — | — | — | planeada: `ficha-de-tratamiento` | Media: estética y salud. Ningún ERP lo trae. |

## 7. RR.HH. y sueldos

ERPNext ya no trae RR.HH. en el árbol `erpnext/`: no hay carpeta `hr`. Que haya pasado a una aplicación aparte
(HRMS) queda [A VALIDAR]. Odoo Community no tiene `hr_payroll` (confirmado en el árbol). En SAP Public Edition, los
sueldos suelen ir por SuccessFactors [A VALIDAR].

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| H1 | Legajo de empleados | HR [A VALIDAR] | `hr` | — (fuera del árbol) | `humanres` (`services_employment`, `services_position`) | `company` (empleado) / — | parcial: `usuarios`; rubro: `gestion-equipo`; planeada: `personas-de-la-red` | Alta: es el dato base de sueldos y permisos. Dolibarr: `hrm`. |
| H2 | Novedades del mes para el liquidador (horas, faltas, adelantos) | HR [A VALIDAR] | `hr_work_entry` | — | — | — | **falta** | **Alta**: la pyme terceriza el sueldo; lo que falta es mandar las novedades limpias. |
| H3 | Liquidación de sueldos (convenio, recibo, F.931) | HR / SuccessFactors [A VALIDAR] | — (sin `hr_payroll`) | — | — | — | **falta** (`gestion-mi-liquidacion` es de profesionales, no de sueldos) | Media: lo hace el estudio; hacerlo dentro exige seguir los convenios y el F.931. Dolibarr: `salaries` (sólo registra el pago) [A VALIDAR]. |
| H4 | Fichaje y asistencia | HR | `hr_attendance` | — | — | `attendance` / — | **falta** | Media. |
| H5 | Licencias y vacaciones | HR | `hr_holidays` | — | — | — | **falta** | Media. Dolibarr: `holiday`. |
| H6 | Gastos y rendiciones del personal | HR / Finance | `hr_expense` | — | — | — / `MTimeExpense` | **falta** | Media. Dolibarr: `expensereport`. |
| H7 | Turnos de trabajo del personal | HR | `resource`, `hr_calendar` | — | `workeffort` | `company_work_time` / `MResource` | parcial: `agenda` (por profesional) | Media. |
| H8 | Selección de personal | HR | `hr_recruitment` | — | — | — | **falta** | Baja. Dolibarr: `recruitment`. |
| H9 | Habilidades y evaluación | HR | `hr_skills` | — | `services_ability` | — | **falta** | Baja. |

## 8. CRM

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| R1 | Ficha del cliente con su historia | Sales (Business Partner) | `contacts` | `customer` | `party` | `party` / `MBPartner` | `clientes` | Alta (cubierta). |
| R2 | Unificar fichas duplicadas | — | `data_recycle` [A VALIDAR que sea esto] | `party_link` [A VALIDAR] | — | — | `unificar-fichas` | Media (cubierta). |
| R3 | Oportunidades y embudo de venta | Sales | `crm` | `lead`, `opportunity`, `prospect`, `sales_stage` | `services_opportunity` | `sale_opportunity` / `MOpportunity`, `MSalesStage` | **falta** (rubro: `inmobiliaria`, consultas) | Media: B2B y servicios de ticket alto. |
| R4 | Campañas y mensajes masivos | Marketing | `mass_mailing`, `marketing_card` | `campaign`, `email_campaign` | `marketing` | `marketing_campaign`, `marketing_email` / `MCampaign` | `campanias`, `recordatorios` | Alta (cubierta; WhatsApp primero). |
| R5 | Seguimiento automático: a quién escribirle y a quién recuperar | Marketing | `crm` (actividades) | — | — | `marketing_automation` / — | `para-contactar-hoy`, `clientas-por-recuperar` | Alta (cubierta). |
| R6 | Reseñas y encuestas | — | `survey`, `rating` | `quality_feedback` | `services_survey` | — | `resenas` | Media (cubierta). Dolibarr: `opensurvey`. |
| R7 | Portal de autogestión del cliente | — | `portal` | `portal` | `content` | `web_user` / — | **falta** | Media. Dolibarr: `webportal`. |
| R8 | Telefonía y chat integrados | — | `crm_livechat` | `telephony` | — | — | parcial: enlaces de WhatsApp | Baja. Dolibarr: `asterisk`. |

## 9. Activos fijos

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| A1 | Registro de bienes de uso | J62 [B] | — (sin `account_asset` en Community) | `asset`, `asset_category` | `services_fixedasset` | `account_asset` / `MAsset`, `MAssetGroup` | **falta** | Media: lo exigen el balance y Ganancias. Dolibarr: `asset`. |
| A2 | Amortización (lineal, por días, con libro contable y libro impositivo) | J62 [B] | — | `asset_depreciation_schedule`, `finance_book` | `FixedAssetServices` | `account_asset` / `MDepreciation*` | **falta** | Media. |
| A3 | Altas, bajas, traslados y revalúo de bienes | J62 [B] | — | `asset_movement`, `asset_value_adjustment`, `asset_capitalization` | `services_fixedasset` | — / `MAssetAddition`, `MAssetDisposed`, `MAssetTransfer`, `MAssetReval` | **falta** | Baja. |
| A4 | Mantenimiento de bienes | Asset Management | `maintenance` | `asset_maintenance`, `asset_repair` | `services_maint` | — | **falta** | Baja. |
| A5 | Flota de vehículos | Asset Management | `fleet`, `account_fleet` | — | — | — | **falta** | Baja. |

## 10. Presupuesto y control

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| B1 | Presupuesto por cuenta, centro y mes | 1YB [CAT] | — (sin módulos «budget» en Community) | `budget`, `monthly_distribution` | `services_budget` | `account_budget`, `analytic_budget` / — | parcial: sólo por proyecto (FC-14) | Media. |
| B2 | Presupuesto contra real, con los desvíos | J54 [CAT] | — | informe `budget_variance_report` | `services_budget` | `account_budget` / — | **falta** (FC-14) | Media. |
| B3 | Aviso o bloqueo al pasarse del presupuesto | 1YB [CAT] | — | `budget` (control al imputar) | — | — | **falta** | Baja. |
| B4 | Resultado del período (gerencial) | J58 [B] | `account` | informes de `accounts` | `accounting` | `account` / — | `resultado-del-mes` | Alta (cubierta). |
| B5 | Rentabilidad por local, producto, proyecto o vendedor | J55/1NT [CAT] | `analytic`, `sale_margin` | `gross_profit`, `profitability_analysis` | — | `analytic_account` / — | `margen`, `ventas-por-local`; parcial: FC-13 | Alta. |
| B6 | Tablero de indicadores | Analytics | `board`, `spreadsheet_*` | `report_center`, `workspace_sidebar` | — | `dashboard` / `org.idempiere.zk.pivot` | `inicio` (indicadores), `reportes`, `mis-locales`; rubro: `gestion-direccion` | Alta (cubierta). |
| B7 | Costo estándar contra real e historia de costos | Finance (costos) | `stock_account` | `item_standard_cost` | `services_cost` | `product_cost_history` / `MCostDetail` | parcial: `margen` | Media. |
| B8 | Costo de cobrar (comisiones de tarjetas, QR y plataformas) | — | — | — | — | — | planeada: `costo-de-cobrar` | **Alta**: en Argentina es un punto de margen que nadie mira. Ningún ERP abierto lo trae. |
| B9 | Auditoría: quién hizo qué | — | `mail` (seguimiento) | `change_log` | — | — | `auditoria` | Alta (cubierta). Dolibarr: `blockedlog`. |

## 11. Comercio y POS

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| T1 | Punto de venta de mostrador | Sales (retail) | `point_of_sale` | `pos_invoice`, `pos_profile` | plugin, no está en `applications/` [A VALIDAR] | `sale_point` / `MPOS`, `MPOSTerminal` | `vender`, `caja-rapida` | Alta (cubierta). Dolibarr: `takepos`. |
| T2 | Balanza, lector y dispositivos | — | `iot_drivers`, `barcodes` | — | — | — | `balanza`, `terminal` | Alta (cubierta). |
| T3 | Cobros: tarjeta, QR, links de pago | Finance (pagos) | `payment` + 100 `payment_*`/`pos_*` | `payment_request`, `payment_gateway_account`, `mode_of_payment` | `services_paymentgateway` | `account_payment_stripe`, `account_payment_braintree` / `org.adempiere.payment.processor` | `facturacion` (links); `vouchers`; planeada: `costo-de-cobrar` | Alta. |
| T4 | Tienda online | Sales (e-commerce) | `website_sale` | `shopping_cart` | plugin [A VALIDAR] | `web_shop`, `web_shop_vue_storefront` / — | planeada: `tienda-online`, `lista-para-compartir` | **Alta**: la venta por catálogo de WhatsApp o Instagram ya es la norma. |
| T5 | Integración con plataformas (MercadoLibre, Tiendanube) | — | — | `erpnext_integrations` | — | `web_shop_shopify` / — | planeada: `integraciones` | **Alta**: el stock y los precios tienen que estar sincronizados. Ningún clon trae MercadoLibre [A VALIDAR]. |
| T6 | Red de locales y franquicias | — | multiempresa (`base`) | `company` | `party` | `company` / organizaciones | `mis-locales`, `ventas-por-local`, `cajas-de-los-locales`, `catalogo-de-la-marca` | Alta (cubierta). |
| T7 | Redondeo del efectivo | — | `account_cash_rounding` | `taxes_and_totals.py` | — | `account_cash_rounding` / — | [A VALIDAR en `vender`] | Baja. |
| T8 | Pedidos para preparar y retirar | Sales | `point_of_sale` | `pick_list` | `services_order` | `sale` / — | `pedidos` | Alta (cubierta). |
| T9 | Etiquetas de góndola | — | `product` | — | — | — | `etiquetas-de-precio` | Alta (cubierta). |

## 12. Fiscal AR

| # | Capacidad | SAP | Odoo | ERPNext | OFBiz | Tryton / iDempiere | Nosotros | Prioridad pyme AR |
|---|---|---|---|---|---|---|---|---|
| X1 | Factura electrónica ARCA (letras, CAE, punto de venta) | localización AR / eDocument [A VALIDAR] | `l10n_ar`, `l10n_latam_invoice_document` | — | — | — / `lar_361` | `facturacion` | Alta (cubierta). |
| X2 | Factura desde el punto de venta con su documento argentino | [A VALIDAR] | `l10n_ar_pos` | — | — | — | parcial: `vender` (ticket) [A VALIDAR si emite factura] | **Alta**. |
| X3 | Factura de Crédito Electrónica MiPyME | [A VALIDAR] | `l10n_ar` [A VALIDAR] | — | — | — | **falta** | Alta para quien vende a grandes empresas. |
| X4 | Libro IVA ventas y compras | 1J2 [CAT] | `l10n_ar` | — | — | — | `libro-iva` | Alta (cubierta). |
| X5 | Indicadores de IVA al cargar facturas | Códigos de impuesto [CAT] | `l10n_ar` | `item_tax_template`, `tax_rule` | `services_tax` | `account` (`tax.py`) / `MTax` | parcial (FC-07) | Alta. |
| X6 | Retenciones y percepciones sufridas, para tomarlas a cuenta | [A VALIDAR] | `l10n_ar` | — | — | — | `retenciones-y-percepciones` | Alta (cubierta, sólo las del banco). |
| X7 | Retenciones practicadas como agente (Ganancias, IVA, IIBB) | J60 (ampliado) [CAT] | `l10n_ar_withholding`; ingadhoc `l10n_ar_tax` | `tax_withholding_category` (genérico) | — | — / `lar_361` | **falta** (FC-08) | Media: sólo para agentes designados, pero no se puede omitir. |
| X8 | Percepciones practicadas en la factura | [A VALIDAR] | ingadhoc `l10n_ar_tax` | — | — | — / `lar_361` | **falta** (FC-08) | Media. |
| X9 | Padrones de alícuotas (ARBA, AGIP…) y consulta de CUIT | — | ingadhoc `l10n_ar_tax`, `l10n_ar_ux` | — | — | — | **falta**; planeada: `datos-fiscales` | **Alta**: con la alícuota equivocada se retiene o se percibe mal. |
| X10 | IIBB Convenio Multilateral (coeficientes, CM05) | sin estándar [CAT] | — | — | — | — | **falta** (FC-09) | Media: lo usa quien vende en varias provincias. |
| X11 | Posición fiscal del mes (IVA, IIBB, Ganancias) | 1J2 [CAT] | — | — | — | — | parcial: `libro-iva` (FC-10) | **Alta**. |
| X12 | Monotributo: topes, recategorización y alertas | — | — | — | — | — | planeada: `monotributo` | **Alta**: gran parte del público es monotributista. Ningún ERP lo trae. |
| X13 | Calendario de vencimientos fiscales | DRC [CAT] | — | — | — | — | `vencimientos-fiscales`; planeada: `vencimientos` | Alta (cubierta; FC-11). |
| X14 | Remito numerado (guía de entrega AR) | [A VALIDAR] | `l10n_ar_stock` (`delivery_guide`) | — | — | — | **falta** | Media. Que lleve COT de ARBA queda [A VALIDAR]. |
| X15 | Certificados de retención emitidos | [A VALIDAR] | ingadhoc `l10n_ar_tax` | `lower_deduction_certificate` (India) | — | — / `lar_361` | **falta** | Media. |
| X16 | Salidas para el estudio contable | J58 [CAT] | `l10n_ar` (reportes) | — | — | — | parcial: `cierre-del-mes`, `libro-de-caja` (FC-12) | Alta. |
| X17 | Datos del banco argentino (CBU, bancos) | — | `l10n_ar` (CBU) ; ingadhoc `l10n_ar_bank` | `bank` | — | `bank` / — | **falta** [A VALIDAR] | Media. |

---

## Conteo

| Área | Capacidades | Cubiertas | Parciales o planeadas | Faltan |
|---|---|---|---|---|
| Finanzas | 25 | 5 | 7 | 13 |
| Ventas | 16 | 4 | 9 | 3 |
| Compras | 13 | 3 | 5 | 5 |
| Stock y logística | 17 | 6 | 8 | 3 |
| Producción | 9 | 1 | 2 | 6 |
| Proyectos y servicios | 9 | 0 | 6 | 3 |
| RR.HH. y sueldos | 9 | 0 | 2 | 7 |
| CRM | 8 | 5 | 1 | 2 |
| Activos fijos | 5 | 0 | 0 | 5 |
| Presupuesto y control | 9 | 2 | 5 | 2 |
| Comercio y POS | 9 | 5 | 4 | 0 |
| Fiscal AR | 17 | 3 | 6 | 8 |
| **Total** | **146** | **34** | **55** | **57** |

Cómo se cuenta cada estado:
- **Cubierta:** hay una app lista que hace lo central.
- **Parcial o planeada:** puede ser una app que hace una parte, un `id` en `ESPACIOS_NAV` sin descriptor, o algo que
  sólo existe en una app de rubro.
- **Falta:** no hay nada.

El conteo sale de la columna «Nosotros», con una regla mecánica:
- si arranca con «**falta**», cuenta como falta;
- si menciona «parcial», «planeada», «rubro» o «A VALIDAR», cuenta como parcial;
- si no, cuenta como cubierta.

Por eso una capacidad cubierta sólo dentro de una app de rubro cuenta como parcial: no la ve un negocio de otro
rubro.

---

## Top 15 de faltantes por prioridad

Para ordenar se miró el impacto en una pyme argentina de comercio o servicios. Se toman los «falta» y los
«parcial» de prioridad alta. Cada uno lleva la ficha FC o el módulo nuevo que abriría.

| # | Faltante | Fila | Qué abre | Por qué arriba |
|---|---|---|---|---|
| 1 | Asiento automático desde cada documento | F2 | **FC-02** | Sin esto no hay mayor, balance ni costo contable. Destraba F4, S5, X16. |
| 2 | Mayor, balance de sumas y saldos y estados contables | F4 | **FC-03** + **FC-12** | Es lo que pide el estudio; hoy sólo se exporta. |
| 3 | Orden de pago, cheques y Echeq | F10, F11 | **FC-05** | Es el documento estándar de pagos en Argentina. El modelo ya está en `l10n_latam_check`. |
| 4 | Conciliación bancaria con reglas | F13 | **FC-06** (app planeada `conciliacion`) | Hoy se concilia en Excel. ERPNext y Tryton traen el modelo. |
| 5 | Moneda extranjera con cotización del día | F15 | **FC-06** | Hay precios, deudas y saldos en USD. |
| 6 | Padrones de IIBB y consulta de CUIT | X9 | **FC-07** + **FC-08** (padrones) | La alícuota correcta es requisito de todo lo fiscal. |
| 7 | Posición fiscal del mes | X11 | **FC-10** | Es la pregunta mensual del dueño («¿cuánto pago?»). |
| 8 | Monotributo: topes y recategorización | X12 | Módulo nuevo (app planeada `monotributo`), ligado a FC-11 | Público masivo; ningún ERP lo trae y nos diferencia. |
| 9 | Anticipos y señas, con imputación parcial | F8, F6 | **FC-04** | Señas y cuentas corrientes son de todos los días. |
| 10 | Captura de comprobantes de proveedor (OCR o ARCA) | C5 | **FC-07** (carga) o módulo nuevo «comprobantes recibidos» | Elimina la carga manual. [A VALIDAR la fuente ARCA] |
| 11 | Pedido de compra con recepción controlada | C2, C3 | Módulo nuevo **Compras** (apps planeadas `pedidos-a-proveedor` y `recibir-mercaderia` con pedido); alimenta FC-05 | Controla lo que llega contra lo pedido. |
| 12 | Valuación del stock con su asiento | S5 | **FC-02** (el hecho de stock) | Da el costo de lo vendido contable y el margen real. |
| 13 | Variantes de talle y color | S7 | Módulo nuevo (app planeada `talles-y-colores`) | Abre el rubro indumentaria y calzado. |
| 14 | Tienda online e integración con plataformas | T4, T5 | Módulo nuevo **Comercio online** (apps planeadas `tienda-online` e `integraciones`) | Stock y precio sincronizados con MercadoLibre, Tiendanube y WhatsApp. |
| 15 | Novedades del personal para el liquidador | H2 (+H1) | Módulo nuevo **Personal** (legajo + novedades; no la liquidación) | La pyme terceriza el sueldo; lo que no tiene es el envío limpio de las novedades. |

En la lista siguiente quedan:
- bienes de uso y amortización (A1–A2, que abriría un módulo nuevo **Bienes de uso**, con Tryton `account_asset`
  como modelo);
- presupuesto contra real (B1–B2, FC-14);
- retenciones y percepciones como agente (X7–X8, FC-08);
- Convenio Multilateral (X10, FC-09);
- ajuste por inflación contable (F24, sin modelo abierto);
- recetas y producción (P1–P2, app planeada `recetas-y-produccion`).

---

## Lo que queda [A VALIDAR]

- **Toda la columna SAP.** Los sitios de SAP no resolvieron. Los códigos [B] salen de los resúmenes del buscador:
  - [SAP baseline activation scope document (v6 2023)](https://assets.cdn.sap.com/agreements/scope-documents/sd/scope-document-baseline-activation-service-for-sap-s4hana-cloud-english-v6-2023.pdf)
    (J58, J59, J60, J62, BMC);
  - notas KBA de SAP vistas sólo en el resumen (5MQ y 7UA; el número de nota no se confirmó);
  - [SAP Learning, 54V](https://learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition-warehouse-management/producing-and-selling-standard-products-in-the-warehouse_a70b1f00-5dfd-4256-917a-68666714e353).

  Los [CAT] vienen de nuestro catálogo FC. Para validar todo hacen falta Process Navigator o el libro de scope items.
- **Faltantes en los clones.** Que ERPNext haya llevado RR.HH. a una aplicación aparte; que OFBiz tenga POS y
  comercio electrónico como plugins.
- **Odoo:** que `data_recycle` sea la deduplicación de contactos y que `l10n_ar` cubra la FCE MiPyME.
- **Remito:** que `l10n_ar_stock` incluya el COT de ARBA (en el código se vio sólo `delivery_guide`).
- **Nuestras apps:** si `vender` emite factura o ticket fiscal, si redondea el efectivo y si `gestion-diseno`
  registra horas.
- **ARCA:** la descarga automática de comprobantes recibidos.
