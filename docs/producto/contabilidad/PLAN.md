# Contabilidad AR · plan por olas (borrador de producto, 2026-11-04)

**Pedido del dueño:** módulo de contabilidad con un agente que actúe como contador, más un calendario de obligaciones
estilo GRC desde el que se atienden y configuran aplicativos, padrones, DDJJ, balance, patrimonio, plan de cuentas,
IIBB y Convenio Multilateral (localización AR completa). Todo dato fiscal concreto de este plan es **provisional**.

## 1. Mapa de capacidades por olas (motor · pantalla · persistencia)
| Ola | Qué entrega | Motor puro (TS sin Prisma, testeable) | Pantalla | Persistencia |
|---|---|---|---|---|
| 1 | Plan de cuentas modelo por rubro · asientos de partida doble que siempre balancean · calendario de obligaciones por terminación de CUIT con estado | `validarAsiento`, `planModelo(rubro)`, `calcularVencimientos(cuit, periodo, tabla)` | Plan de cuentas (árbol), alta de asiento manual, calendario mensual con semáforo | `CuentaContable`, `Asiento`, `AsientoLinea`, `ObligacionFiscal`, `VencimientoFiscal` |
| 2 | Libro diario y mayor; asientos automáticos desde facturas y cobros | `generarAsientoDesdeFactura`, `generarAsientoDesdeCobro`, `mayorizar(asientos)` | Diario (cronológico), Mayor por cuenta con saldo acumulado, export CSV | reusa ola 1 + `origenTipo/origenId` en `Asiento` |
| 3 | Calendario GRC: responsable, estados (pendiente→en curso→presentado→pagado→verificado), evidencia adjunta, recordatorio WhatsApp | máquina de estados `transicionObligacion`, reglas de alerta (T-5, T-1, vencido) | Tablero por vencimiento y por responsable; ficha con evidencia | `VencimientoFiscal.responsableId/estado/evidenciaUrl` (adjunto fuera de Git) |
| 4 | IVA (débito/crédito, posición), IIBB local, Convenio Multilateral (CM03 mensual, CM05 anual, coeficientes unificados) | `posicionIva(periodo)`, `coeficientesCM(ingresos, gastos por jurisdicción)`, `liquidarIIBB(base, alícuota, jurisdicción)` | Papel de trabajo por período con borrador exportable; nunca presenta | `PeriodoFiscal`, `LiquidacionBorrador` (JSON del cálculo + versión del motor) |
| 5 | Padrones y alícuotas de retención/percepción (ARBA, AGIP, etc.) | `aplicarPadron(cuit, padron)`, importador de padrón a tabla normalizada | Config de padrones cargados y vigencia; consulta por CUIT | `PadronAlicuota` (jurisdicción, cuit, alícuota, vigencia) |
| 6 | Balance (estado de situación patrimonial y de resultados) y patrimonio neto | `balanceSumasSaldos`, `estadoResultados`, `cierreEjercicio` (asiento de refundición) | Balance en pantalla + export; cierre de ejercicio asistido | `Ejercicio` (apertura/cierre, bloqueo de asientos posteriores) |
| 7 | Agente contador | prompts + herramientas sobre los motores 1-6; no persiste por sí solo | Chat en el backoffice y en el panel del contador; bandeja de propuestas | `PropuestaAgente` (borrador, estado aceptado/rechazado, quién decidió) |

**Regla de capas (todas las olas):** motor en `src/lib/contabilidad/*.ts` con tests `node --import tsx --test`; persistencia en
`src/lib/contabilidad/repo-*.ts` vía `tenantTransaction`; pantallas en `src/app/(backoffice)/contabilidad/*` como server components.

## 2. El agente contador (ola 7, pero condiciona el diseño desde la ola 1)
- **Propone, prepara borradores y avisa.** Ejemplos: «este cobro no tiene asiento, te lo armo», «el 18 vence IVA del CUIT
  terminado en 3, ¿lo marcamos en curso?», «la posición de IVA da saldo a favor, revisá el crédito del proveedor X».
- **Nunca presenta una DDJJ ni toca ARCA / rentas provinciales.** No tiene herramienta de escritura hacia WSFE ni hacia
  aplicativos; sólo lee motores y crea `PropuestaAgente`. Toda acción externa la ejecuta un humano con su clave fiscal.
- Cada propuesta deja rastro: quién la aceptó, cuándo, con qué versión del motor. Lo aceptado se convierte en asiento o en
  cambio de estado del vencimiento por el camino normal (mismas validaciones que un alta manual).

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
- `CuentaContable { id, tenantId, codigo, nombre, tipo: ACTIVO|PASIVO|PATRIMONIO|RESULTADO_POSITIVO|RESULTADO_NEGATIVO,
  padreId?, imputable: Boolean, activa: Boolean }` · único `(tenantId, codigo)`.
- `Asiento { id, tenantId, numero, fecha, descripcion, origenTipo?: MANUAL|FACTURA|COBRO|PAGO, origenId?, estado: BORRADOR|CONFIRMADO }`.
- `AsientoLinea { id, tenantId, asientoId, cuentaId, debe: BigInt, haber: BigInt, detalle? }` (centavos).
- `ObligacionFiscal { id, tenantId, codigo (IVA_MENSUAL, IIBB_LOCAL, CM03, GANANCIAS_ANTICIPO…), organismo, periodicidad, activa }`.
- `VencimientoFiscal { id, tenantId, obligacionId, periodo (YYYY-MM), fechaVencimiento, terminacionCuit, estado: PENDIENTE|EN_CURSO|PRESENTADO|PAGADO|VERIFICADO|VENCIDO }`.

**Motor (`src/lib/contabilidad/`):** `asiento.ts` (validar/normalizar), `plan-modelo.ts` (planes por rubro:
comercio, servicios, club, agencia), `vencimientos.ts` (calcula fechas desde la tabla), `tabla-vencimientos-2026.ts`
(**parámetro configurable**, datos de ejemplo marcados «provisional a confirmar»; en prod se sobreescribe por tenant/organismo).

**Reglas del motor:** asiento con ≥ 2 líneas · `Σ debe === Σ haber` en centavos · cada línea tiene sólo debe o sólo haber
(> 0) · sólo cuentas `imputable` y `activa` · fecha dentro de un ejercicio abierto (ola 6; en ola 1 sólo fecha válida) ·
un asiento `CONFIRMADO` no se edita, se contra-asienta.

**Pantallas ola 1:** plan de cuentas (árbol con alta desde modelo), asiento manual con balance en vivo, calendario mensual
con filtro por terminación de CUIT y cambio de estado. Sello GSG en el footer; a11y AA; WhatsApp-first en recordatorios.

## 6. [A VALIDAR con contador matriculado] — todo provisional
- Plan de cuentas modelo por rubro (codificación, cuentas mínimas, rubros de resultados).
- Fechas reales de vencimiento 2026 por terminación de CUIT para IVA, IIBB, CM, Ganancias, Bienes Personales, SUSS.
- Tratamiento de Convenio Multilateral: cálculo de coeficientes, régimen general vs. especiales, inicio de actividades.
- Alícuotas y padrones de retención/percepción por jurisdicción (ARBA, AGIP, Córdoba, Santa Fe…) y su vigencia.
- Criterios de balance y exposición según RT de FACPCE (RT 8/9, ajuste por inflación RT 6), moneda homogénea.
- Posición de IVA: prorrateo de crédito fiscal, percepciones y retenciones sufridas.
- Qué documentos cuentan como evidencia válida de una presentación (acuse, VEP, comprobante de pago).

## 7. Gates
- Sin presentaciones reales ni escritura a ARCA / rentas: el módulo produce borradores y papeles de trabajo.
- Sin `prisma migrate deploy` (Gate 2): migraciones escritas, no aplicadas; se eleva al dueño.
- Sin credenciales ni secretos en código, docs o tests; el simulador ARCA cubre las pruebas.
- Gate de Excelencia antes de integrar (7 ángulos Fiori + ángulo argentino, sello GSG, RLS, `tsc` + tests verdes).
