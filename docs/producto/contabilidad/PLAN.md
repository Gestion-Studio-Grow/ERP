# Contabilidad AR · plan por olas (borrador de producto, 2026-11-04)

**Pedido del dueño:** módulo de contabilidad con un agente que actúe como contador, más un calendario de obligaciones
estilo GRC desde el que se atienden y configuran aplicativos, padrones, DDJJ, balance, patrimonio, plan de cuentas,
IIBB y Convenio Multilateral (localización AR completa). Todo dato fiscal concreto de este plan es **provisional**.

## 1. Mapa de capacidades por olas (motor · pantalla · persistencia)
| Ola | Qué entrega | Motor puro (TS sin Prisma, testeable) | Pantalla | Persistencia |
|---|---|---|---|---|
| 1 | Plan de cuentas modelo por rubro · asientos de partida doble que siempre balancean · calendario de obligaciones por terminación de CUIT con estado | `validarAsiento`, `planModelo(rubro)`, `calcularVencimientos(cuit, periodo, tabla)` | Plan de cuentas (árbol), alta de asiento manual, calendario mensual con semáforo | `CuentaContable`, `Asiento`, `AsientoLinea`, `ObligacionFiscal`, `VencimientoFiscal` |
| 2 | Libro diario y mayor; asientos automáticos desde facturas y cobros | `generarAsientoDesdeFactura`, `generarAsientoDesdeCobro`, `mayorizar(asientos)` | Diario (cronológico), Mayor por cuenta con saldo acumulado, export CSV | reusa ola 1 + `origenTipo/origenId` en `Asiento` |
| 3 | Calendario GRC: responsable, estados (pendiente→en curso→presentado→pagado→verificado; «sin saldo a pagar» y «no corresponde» como salidas válidas), evidencia adjunta, recordatorio WhatsApp | máquina de estados `transicionObligacion`, reglas de alerta (T-5, T-1, vencido = derivado de fecha, no estado guardado) | Tablero por vencimiento y por responsable; ficha con evidencia | `VencimientoFiscal.responsableId/estado/evidenciaUrl` (adjunto fuera de Git) |
| 4 | IVA (débito/crédito, posición, Libro IVA Digital), IIBB local, Convenio Multilateral (CM03 mensual y CM05 anual vía SIFERE Web; coeficiente unificado con ingresos y gastos del último balance cerrado) | `posicionIva(periodo)`, `coeficientesCM(ingresos, gastos por jurisdicción)`, `liquidarIIBB(base, alícuota, jurisdicción)` | Papel de trabajo por período con borrador exportable; nunca presenta | `PeriodoFiscal`, `LiquidacionBorrador` (JSON del cálculo + versión del motor) |
| 5 | Padrones y alícuotas de retención/percepción (ARBA, AGIP, etc.); retenciones practicadas (SICORE/SIRE) y sufridas (SIRCREB, percepciones) como crédito | `aplicarPadron(cuit, padron)`, importador de padrón a tabla normalizada | Config de padrones cargados y vigencia; consulta por CUIT | `PadronAlicuota` (jurisdicción, cuit, alícuota, vigencia) |
| 6 | Balance (estado de situación patrimonial y de resultados) y patrimonio neto | `balanceSumasSaldos`, `estadoResultados`, `cierreEjercicio` (refundición de resultados + asiento de cierre y de apertura del siguiente) | Balance en pantalla + export; cierre de ejercicio asistido | `Ejercicio` mínimo nace en ola 1; acá suma cierre y bloqueo de asientos |
| 7 | Agente contador | prompts + herramientas sobre los motores 1-6; no persiste por sí solo | Chat en el backoffice y en el panel del contador; bandeja de propuestas | `PropuestaAgente` (borrador, estado aceptado/rechazado, quién decidió) |

**Catálogo de obligaciones (se carga en ola 1, se calcula desde ola 4):** depende de la condición fiscal (ADR-066) y de las
jurisdicciones inscriptas. RI: IVA + Libro IVA Digital, Ganancias (sociedades y humanas: DDJJ anual + anticipos; humanas
además Bienes Personales; sociedades, BP acciones y participaciones), SICORE/SIRE si retiene. Monotributo: cuota mensual,
recategorización semestral, régimen simplificado de IIBB donde exista. Empleador: F.931 (SUSS) y SIRADIG para 4.ª categoría.

**Regla de capas (todas las olas):** motor en `src/lib/contabilidad/*.ts` con tests `node --import tsx --test`; persistencia en
`src/lib/contabilidad/repo-*.ts` vía `tenantTransaction`; pantallas en `src/app/(backoffice)/contabilidad/*` como server components.

## 2. El agente contador (ola 7, pero condiciona el diseño desde la ola 1)
- **Propone, prepara borradores y avisa.** Ejemplos: «este cobro no tiene asiento, te lo armo», «el 18 vence IVA del CUIT
  terminado en 3, ¿lo marcamos en curso?», «la posición de IVA da saldo a favor, revisá el crédito del proveedor X».
- **Nunca presenta una DDJJ ni toca ARCA / rentas provinciales.** No tiene herramienta de escritura hacia WSFE ni hacia
  aplicativos; sólo lee motores y crea `PropuestaAgente`. Toda acción externa la ejecuta un humano con su clave fiscal.
- Cada propuesta deja rastro (quién la aceptó, cuándo, versión del motor); lo aceptado sigue el camino normal de validación.

## 3. Modelo de datos multi-negocio
- Toda tabla nueva lleva `tenantId` + RLS con la policy `tenant_isolation` (mismo patrón que
  `prisma/migrations/20261102120000_consultas/migration.sql:43-50`). Escrituras sólo dentro de `tenantTransaction`
  (`src/lib/rls.ts:176`), nunca con el cliente crudo.
- Montos en **centavos enteros** (`Int` alcanza hasta ~21 M ARS; se usa `BigInt` en `AsientoLinea` y saldos para no
  toparse con inflación). Nada de `Float`/`Decimal` para dinero.
- **Contador con cartera (ADR-077):** cada cliente ES un Tenant y la cartera es `CarteraCliente`
  (`prisma/schema.prisma:1990`). El calendario consolidado se arma **iterando los tenants de la cartera** y corriendo la
  consulta por tenant dentro de su propio contexto RLS; no hay tablas cruzadas ni vistas multi-tenant.
- Migraciones aditivas, escritas sin aplicar; el código tolera que la tabla no exista (feature flag `contabilidad`).

## 4. Reuso, sin duplicar
- **ADR-066** `TenantFiscalCredential`: el CUIT y la condición fiscal del negocio salen de ahí; no se pide el CUIT de nuevo.
- **ADR-076** suite de facturación y `src/plugins/arca` (WSFE + simulador): las facturas emitidas son el origen de los
  asientos de venta e IVA débito (ola 2/4). El simulador sirve para tests del motor sin tocar ARCA.
- **`src/plugins/bancos`:** movimientos bancarios conciliados → asientos de cobro/pago (ola 2).
- **`src/lib/settlement/asiento-libro.ts`** es el libro de **CAJA** (operativo), no contable. La ola 2 genera asientos
  contables *a partir de* facturas y cobros, referenciando `origenId`; no lo reemplaza ni lo reescribe.

## 5. Ola 1 concreta (se construye ya)
**Modelos (Prisma, todos con `tenantId`, `createdAt`, `updatedAt`):**
- `CuentaContable { id, tenantId, codigo, nombre, tipo: ACTIVO|PASIVO|PATRIMONIO_NETO|RESULTADO_POSITIVO|RESULTADO_NEGATIVO,
  naturaleza: DEUDORA|ACREEDORA (regularizadoras: amortizaciones acumuladas, previsiones), padreId?, imputable, activa }` · único `(tenantId, codigo)`.
- `Ejercicio { id, tenantId, fechaInicio, fechaCierre, estado: ABIERTO|CERRADO }` (el cierre comercial no siempre es 31/12).
- `Asiento { id, tenantId, ejercicioId, numero?, fecha, descripcion, origenTipo?: MANUAL|FACTURA|COBRO|PAGO|APERTURA|CIERRE|REFUNDICION|AJUSTE, origenId?,
  anulaAsientoId?, estado: BORRADOR|CONFIRMADO }` · `numero` se asigna **al confirmar**, correlativo sin saltos por ejercicio, único `(tenantId, ejercicioId, numero)`.
- `AsientoLinea { id, tenantId, asientoId, cuentaId, debe: BigInt, haber: BigInt, detalle? }` (centavos).
- `ObligacionFiscal { id, tenantId, codigo (IVA_MENSUAL, IIBB_LOCAL, CM03, CM05, GANANCIAS_ANTICIPO, F931…), organismo, jurisdiccion?,
  periodicidad: MENSUAL|ANUAL|SEMESTRAL|ANTICIPO, accion: PRESENTACION|PAGO|AMBAS, activa }`.
- `VencimientoFiscal { id, tenantId, obligacionId, periodo (YYYY-MM o YYYY), cuota?, fechaVencimiento, fechaPresentacion?, fechaPago?,
  estado: PENDIENTE|EN_CURSO|PRESENTADO|PAGADO|SIN_SALDO|NO_CORRESPONDE|VERIFICADO }` · único `(tenantId, obligacionId, periodo, cuota)`; «vencido» se deriva; la terminación de CUIT sale de ADR-066.

**Motor (`src/lib/contabilidad/`):** `asiento.ts` (validar/normalizar), `plan-modelo.ts` (planes por rubro:
comercio, servicios, club, agencia), `vencimientos.ts` (calcula fechas desde la tabla), `tabla-vencimientos-2026.ts`
(**parámetro configurable**, datos de ejemplo marcados «provisional a confirmar»; en prod se sobreescribe por tenant/organismo).

**Reglas del motor:** asiento con ≥ 2 líneas · `Σ debe === Σ haber` en centavos · cada línea tiene sólo debe o sólo haber
(> 0) · sólo cuentas `imputable` y `activa` · fecha dentro de un ejercicio `ABIERTO` · un asiento `CONFIRMADO` no se
edita ni borra, se contra-asienta (`anulaAsientoId`). Vencimiento en feriado/inhábil → día hábil siguiente (tabla de feriados configurable).

**Pantallas ola 1:** plan de cuentas (árbol con alta desde modelo), asiento manual con balance en vivo, calendario mensual
con filtro por terminación de CUIT y cambio de estado. Sello GSG en el footer; a11y AA; WhatsApp-first en recordatorios.

## 6. [A VALIDAR con contador matriculado] — todo provisional
- Plan de cuentas modelo por rubro (codificación, cuentas mínimas); fechas reales 2026 por terminación de CUIT (IVA, IIBB,
  CM, Ganancias, Bienes Personales, SUSS, monotributo) y feriados.
- Convenio Multilateral: coeficientes, régimen general vs. especiales, inicio de actividades, gastos no computables, SIRCREB.
- Alícuotas y padrones de retención/percepción por jurisdicción (ARBA, AGIP, Córdoba, Santa Fe…) y su vigencia; posición
  de IVA (prorrateo de crédito fiscal, percepciones y retenciones sufridas, Libro IVA Digital).
- Balance según RT de FACPCE (RT 8/9 vs. RT 54 y su vigencia; ajuste por inflación RT 6); registros contables (CCyC), libros digitales.
- Ganancias sociedades vs. humanas, anticipos, BP y acciones y participaciones; SICORE/SIRE; SIRADIG/F.931; monotributo
  (categorías, recategorización, exclusión) y régimen simplificado de IIBB; multimoneda y tipo de cambio aplicable.
- Qué documentos cuentan como evidencia válida de una presentación (acuse, VEP, comprobante de pago).

## 7. Gates
- Sin presentaciones reales ni escritura a ARCA / rentas: el módulo produce borradores y papeles de trabajo.
- Sin `prisma migrate deploy` (Gate 2; migraciones escritas, no aplicadas) ni secretos en código/docs/tests (simulador ARCA).
- Gate de Excelencia antes de integrar (7 ángulos Fiori + ángulo argentino, sello GSG, RLS, `tsc` + tests verdes).
