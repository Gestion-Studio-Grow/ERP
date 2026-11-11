# Catálogo de scope items — Finanzas y Control de gestión

> Método: `METODO-SCOPE-ITEMS.md`. Construcción: `PLAN-TANDAS.md`. Primer cliente: MIA Producciones
> (`BRIEF-MIA-REQUERIMIENTOS.md`). Fecha: 11/11/2026.
> **Marcas de fuente SAP:** [E] visto en extracto del buscador sobre la URL · [I] inferido · [AV] a validar. La red
> de la sesión no dejó abrir las páginas de SAP: nada está verificado de primera mano (ver Anexo A, fuentes).
> **Rutas:** relativas al repo; `schema` = `prisma/schema.prisma`; `contab/` = `src/lib/contabilidad/`.
> **Importes:** todos simbólicos (N = neto, I = IVA…). No hay montos ni datos del cliente en este documento.

## 0. Mapa del arco

| Código | Scope item GSG | Ref. SAP | Perfil | Estado en el ERP | Depende de |
|---|---|---|---|---|---|
| FC-01 | Plan de cuentas y datos maestros contables | YCOA (plan modelo) | lite + ent. | Motor hecho, sin pantalla | — |
| FC-02 | Contabilización automática (documento → asiento) | Determinación de cuentas | lite + ent. | **No existe** | FC-01 |
| FC-03 | Contabilidad general y cierre | J58 | ent. (lite: sólo exportar) | Parcial (asientos sí; mayor, balance y cierre no) | FC-01, FC-02 |
| FC-04 | Cuentas a cobrar y anticipos de clientes | J59 · BKJ · 4E9 | lite + ent. | Parcial, en dos lugares | FC-02, FC-07 |
| FC-05 | Cuentas a pagar, orden de pago, cheques y Echeq | J60 | lite + ent. | Parcial (sin orden de pago ni Echeq) | FC-02, FC-07 |
| FC-06 | Bancos, caja y tesorería en ARS y USD | BFA · BFB · 1EG | lite + ent. | Parcial, dos tesorerías | FC-02 |
| FC-07 | Indicadores de impuesto en la carga de facturas (IVA) | Códigos de impuesto | lite + ent. | Parcial (campos sueltos en compras) | FC-01 |
| FC-08 | Percepciones y retenciones (IVA, Ganancias, IIBB) | J60 (retención ampliada) | ent. | Sólo sufridas, leídas del extracto | FC-05, FC-07 |
| FC-09 | IIBB Convenio Multilateral | Sin estándar en Public Edition | ent. | **No existe** | FC-07 |
| FC-10 | Posición fiscal del mes (IVA, IIBB, Ganancias) | 1J2 / reportes legales | lite + ent. | Parcial (libro IVA) | FC-07, FC-08, FC-09 |
| FC-11 | Monitor y calendario de obligaciones | Reportes legales (DRC) | lite + ent. | Motor hecho, sin pantalla | — |
| FC-12 | Salidas para el estudio contable externo | J58 (diario, balance de sumas) | lite + ent. | Parcial (libro IVA y paquete de cierre) | FC-03, FC-10 |
| FC-13 | Rentabilidad por proyecto y por productor; comisiones y reintegros | J11 · 1NT · J55 | ent. | Parcial (por proyecto sí; por productor no) | FC-02, FC-04, FC-05 |
| FC-14 | Presupuesto contra real | 1YB · J54 | ent. | Sólo por proyecto | FC-03, FC-13 |

**Corrección al mapa de cobertura** (`docs/estrategia/mapa-cobertura-scope-items.md`, tabla Finanzas): tiene
**J59 y J60 invertidos**. Según los extractos, J59 es cuentas a cobrar y J60 cuentas a pagar [E]. Además «1W0»
no apareció como integración bancaria: la de archivo es **1EG** [E]; «2F3» no se pudo confirmar [AV]. Se propone
corregirlo en una tanda de docs (no se tocó en esta pasada).

**Lo que queda en reserva (no se construye):** bienes de uso (J62), consolidación, ledgers paralelos, gestión de
crédito avanzada (1QM), conectividad bancaria corporativa (16R), tesorería avanzada (J78).

---

## 1. Plan de cuentas y aritmética de partida doble (base de todo el arco)

### 1.1 Estructura

| Concepto SAP | Marca | Equivalente GSG | Dónde |
|---|---|---|---|
| Plan modelo único que no se modifica (YCOA) | [E] | Plan modelo por rubro (comercio, servicios, club, agencia), **provisional** | `contab/plan-modelo.ts:30`, `:33`, `:348` |
| Numeración por rangos y grupos de cuentas | [I] | Código jerárquico `1` · `1.1` · `1.1.1` · `1.1.1.01`; sólo las hojas reciben asientos | `contab/plan-modelo.ts`; `CuentaContable` `schema:4390` (`padreId`, `imputable`) |
| Tipo de cuenta (balance / resultado) | [I] | `naturaleza` + rubro según la norma contable argentina | `contab/asiento.ts:13-20` |
| Cuenta de reconciliación (el auxiliar de clientes y proveedores resume en una cuenta del mayor) | [E] existe para clientes y proveedores; mecánica [I] | **Rol de cuenta**: `DEUDORES_POR_VENTAS`, `PROVEEDORES`, `ANTICIPOS_DE_CLIENTES`, `BANCO`… (53 roles) | `contab/roles.ts:22`; `CuentaRol` `schema:4424` |
| Tipos de documento y claves de contabilización | [I] | `origenTipo` del asiento (qué documento lo generó) | `Asiento` `schema:4466`; `contab/asiento.ts:16` |
| Diario universal: un asiento con dimensiones de gestión | [I] | **Falta:** proyecto, productor y rubro en la línea | brecha (migración aditiva) |
| Moneda de la operación y moneda de la sociedad | [I] | **Falta** en la línea; hay `monedaCuenta` en la cuenta | `schema:4390`; brecha |
| Reversa: se contraasienta con el mismo tipo de documento | [E] nota pública | `contraAsiento` y `anularAsiento` | `contab/asiento.ts:228`, `contab/repo.ts:332` |
| Períodos que se abren y cierran por tipo de cuenta | [E] | Sólo ejercicio abierto/cerrado; **falta el período mensual** | `Ejercicio` `schema:4451`; `contab/repo.ts:181` |

### 1.2 Reglas de la aritmética (ya implementadas y con tests)

`validarAsiento` (`contab/asiento.ts:119`) rechaza: menos de dos líneas, **debe ≠ haber**, total en cero, monto
negativo, línea con debe y haber a la vez, línea en cero, monto excedido, cuenta inexistente / no imputable /
inactiva / de otro negocio, fecha inválida o fuera del ejercicio, ejercicio cerrado (`contab/asiento.ts:55-71`).
Los importes son centavos enteros (`AsientoLinea` `schema:4490`). Invariantes que el arco agrega:

- **I1.** Σ debe = Σ haber en cada asiento (ya está) **y** en cada moneda de origen por separado cuando el asiento
  es de una sola moneda extranjera.
- **I2.** Saldo de la cuenta de control = Σ saldos del auxiliar (clientes, proveedores, bancos), siempre.
- **I3.** Un documento de origen genera a lo sumo un asiento vigente (clave única origen + tipo).
- **I4.** Activo = Pasivo + Patrimonio + (Ingresos − Egresos) en cualquier fecha.
- **I5.** Un período cerrado no recibe asientos; lo tardío va al período abierto con la fecha de origen guardada
  (`fechaOrigen` ya existe en la línea).

### 1.3 Asientos tipo del arco (roles de `contab/roles.ts`; importes simbólicos)

| # | Hecho | Debe | Haber |
|---|---|---|---|
| A1 | Factura de anticipo al cliente (N + I) | DEUDORES_POR_VENTAS N+I | ANTICIPOS_DE_CLIENTES N · IVA_DEBITO_FISCAL I |
| A2 | Cobro por transferencia con retenciones sufridas (R) | BANCO N+I−R · RETENCIONES_IVA / _GANANCIAS / _IIBB R | DEUDORES_POR_VENTAS N+I |
| A3 | Factura de saldo (N₂ + I₂) | DEUDORES_POR_VENTAS N₂+I₂ | VENTAS N₂ · IVA_DEBITO_FISCAL I₂ |
| A4 | Evento hecho: el anticipo pasa a ingreso | ANTICIPOS_DE_CLIENTES N | VENTAS N |
| A5 | Factura A de proveedor con percepciones (P) | costo o gasto del proyecto N · IVA_CREDITO_FISCAL I · PERCEPCIONES_IIBB / percepción de IVA P | PROVEEDORES N+I+P |
| A6 | Pago al proveedor con retención practicada (T) | PROVEEDORES N+I+P | BANCO N+I+P−T · retenciones a depositar T *(rol nuevo)* |
| A7 | Echeq o cheque diferido emitido | PROVEEDORES X | cheques diferidos a pagar X *(rol nuevo)*; al débito: contra BANCO |
| A8 | Cobro en USD con tipo de cambio distinto al de la factura | BANCO (USD × TC cobro) | DEUDORES (USD × TC factura) · diferencia de cambio *(rol nuevo, ganancia o pérdida)* |
| A9 | Comisión devengada (proyecto finalizado) | COMISIONES_PERSONAL C | COMISIONES_A_PAGAR C |
| A10 | Reintegro contra ticket o factura | gasto del proyecto G (+ IVA_CREDITO_FISCAL si es factura A) | FONDOS_A_RENDIR o BANCO |
| A11 | Liquidación mensual de IVA | IVA_DEBITO_FISCAL | IVA_CREDITO_FISCAL · retenciones y percepciones de IVA · IVA_A_PAGAR (o saldo a favor) |
| A12 | IIBB del mes | IIBB (gasto) | PERCEPCIONES_IIBB · RETENCIONES_IIBB · IIBB_A_PAGAR |

**A confirmar con el estudio (provisional):** el momento del ingreso (A4: al evento hecho, que es el criterio de
«Finalizado» del cliente, o al facturar), el tratamiento del anticipo que congela precio, y los roles nuevos
(retenciones a depositar por impuesto, cheques diferidos a pagar, diferencia de cambio, percepción de IVA,
saldo a favor de IVA, valores a depositar).

---

## 2. Fichas

Cada ficha: **SAP** (referencia) · **Existe** (archivo:línea) · **Brecha** · **Parámetros** · **Adaptación MIA**.

### FC-01 · Plan de cuentas y datos maestros contables
- **SAP:** plan modelo operativo único; el cliente no lo altera, suma el propio [E]. Fuente: Anexo A (3).
- **Existe:** modelos y siembra (`contab/repo.ts:104` `sembrarPlanModelo`, `:164` `asignarRolCuenta`), roles
  (`contab/roles.ts:22`), nivel y capacidades (`contab/config.ts:17`, `:26`), tests. **Sin pantalla.**
- **Brecha:** pantalla del plan (ver árbol, agregar hoja, desactivar, asignar rol); roles nuevos de §1.3; plan
  de rubro «productora de eventos / servicios por proyecto»; importación del plan del estudio.
- **Parámetros:** rubro del plan, hojas propias, rol → cuenta, cuentas en moneda extranjera.
- **MIA:** parte del plan `servicios`; se suman cuentas por banco y moneda, anticipos de clientes, retenciones
  por impuesto y jurisdicción. El estudio valida el plan antes de sembrar (T0).

### FC-02 · Contabilización automática
- **SAP:** el documento de negocio determina solo las cuentas del asiento [I].
- **Existe:** nada. Ningún módulo importa `contab/`; no hay asientos automáticos.
- **Brecha:** motor puro `documento → líneas` por tipo de hecho (los 12 de §1.3), idempotente (I3), que pide
  cuentas por rol y devuelve un motivo en criollo si falta un rol; cola de «sin contabilizar» con su causa;
  conversión de `Float` a centavos con redondeo único.
- **Parámetros:** qué hechos contabilizan (por perfil), fecha contable (del documento o del cobro).
- **MIA:** contabiliza facturas, cobros, compras, pagos, movimientos de banco, comisiones y reintegros.
  En `lite` el motor queda apagado y sólo se exporta (FC-12).

### FC-03 · Contabilidad general y cierre
- **SAP J58:** asientos por libro, pasos de cierre, diario de auditoría y balance de sumas y saldos [E].
  Períodos que se abren y cierran [E]. Valuación de moneda extranjera como tarea de cierre [I].
- **Existe:** `registrarAsiento` / `confirmarAsiento` / `anularAsiento` (`contab/repo.ts:296`, `:314`, `:332`),
  `abrirEjercicio` (`:181`), estados borrador/confirmado. Cierre de mes **operativo** con paquete
  (`src/lib/cierre-mes/cierre-mes.ts:18`, pantalla `/admin/cierre-mes`).
- **Brecha:** libro diario, mayor por cuenta, sumas y saldos, estado de resultados y de situación; **período
  mensual** con apertura y cierre; lista de control de cierre (pendientes sin contabilizar, conciliaciones
  abiertas, diferencia de cambio); cierre de ejercicio y asiento de apertura; asiento manual con pantalla.
- **Parámetros:** mes de cierre del ejercicio, quién cierra, tolerancia de asientos tardíos.
- **MIA:** cierre mensual con lista de control; **quién cierra: provisional a confirmar**. Saldos de apertura
  desde el último balance del estudio.

### FC-04 · Cuentas a cobrar y anticipos de clientes
- **SAP J59** cuentas a cobrar [E]; **BKJ** venta con anticipo del cliente [E]; **4E9** facturación de proyectos,
  con anticipo sólo en ciertos tipos de contrato [E]. Una nota dice que la factura de anticipo no está soportada
  en Public Edition [AV].
- **Existe:** fiado del núcleo (`AccountReceivable` `schema:2140`, `src/lib/receivable-service.ts:40`, `:121`),
  antigüedad de deuda (`src/lib/debts/aging.ts`), pantallas `/admin/cuentas-a-cobrar`. En Proyectos: cuotas de
  cobro y de pago (`ProyectoCuota` `schema:3838`, `planDeCuotas` `src/lib/proyectos/gestion-core.ts:184`, anticipo
  con porcentaje configurable `:141`), cobranza (`src/lib/proyectos/cobranza-core.ts`), pagos
  (`ProyectoPago` `schema:3653`).
- **Brecha:** una factura por cada cobro ligada a la cuota; aplicación de un cobro a una o varias facturas y
  cobros parciales; cuenta corriente por cliente (auxiliar que cuadra con el rol, I2); anticipo como pasivo
  hasta el evento (A1, A4); notas de crédito; padrón de clientes con CUIT y condición frente al IVA.
- **Parámetros:** plan de cobro por defecto (porcentaje de anticipo y de saldo, cuándo vence cada uno), si el
  adicional es proyecto aparte, momento del ingreso, medios de cobro habilitados, moneda de la cotización.
- **MIA:** 70 % anticipo / 30 % saldo como **valor por defecto editable por proyecto** (la regla «en todos los
  casos» está por confirmar); adicional = proyecto nuevo ligado al original; cobro por transferencia y Echeq;
  «Finalizado» = cobrado entero + evento hecho (dispara A4 y A9). Padrón armado desde planillas y agenda del banco.

### FC-05 · Cuentas a pagar, orden de pago, cheques y Echeq
- **SAP J60:** cuentas a pagar; incluye la retención estándar y la emisión de cheques [E].
- **Existe:** deuda con proveedor (`AccountPayable` `schema:2081`), cheque diferido con endoso
  (`PayableCheque` `schema:2111`, `src/lib/payable-service.ts:101`, `:153`, `:272`, `src/lib/debts/cheque.ts`),
  proveedores (`Supplier` `schema:1956`), compra con datos de la factura del proveedor y candado contra doble
  crédito fiscal (`StockPurchase` `schema:1818`), gasto de proyecto (`ProyectoGasto` `schema:3673`). Pantallas
  `/admin/cuentas-a-pagar`, `/admin/proveedores`, `/admin/compras`.
- **Brecha:** factura de proveedor **de servicios** (hoy la carga con datos fiscales cuelga de la compra de
  mercadería) imputada a proyecto; **orden de pago** como documento (qué facturas paga, con qué medios, qué
  retiene); Echeq como medio; cheques de terceros en cartera; agenda de pagos por vencimiento; anticipo a proveedor.
- **Parámetros:** quién aprueba la orden de pago y desde qué importe, medios habilitados, anticipo a proveedor
  por defecto (hoy 50 %, `gestion-core.ts:149`).
- **MIA:** hoy los pagos a proveedores **no están cargados**: es la brecha operativa más grande. La agenda de
  pagos reemplaza la que arma el estudio; mayoría de facturas A (crédito fiscal, FC-07).

### FC-06 · Bancos, caja y tesorería en ARS y USD
- **SAP BFA** cuentas bancarias como dato maestro [E]; **BFB** operaciones de caja y proceso del extracto [E];
  **1EG** intercambio de archivos con el banco, pensado para pocas cuentas [E]. La conectividad multibanco (16R)
  y el monitor de extractos (J78, licencia aparte) quedan en reserva [E].
- **Existe:** extracto → propuesta de factura (`ImportacionBancaria` `schema:1460`, `src/lib/bancos-glue.ts:185`,
  `:672`, pantalla `/admin/facturacion/bancos`); caja (`CashSession` `schema:1646`, `src/lib/caja/`); Mercado Pago
  (`src/lib/mercadopago-*.ts`). En Proyectos: cuentas ARS/USD (`ProyectoCuentaBanco` `schema:4058`), movimientos
  (`:4071`), tipo de cambio de un solo valor (`ProyectoTipoCambio` `:4088`), lectura de extracto y cruce con
  cuotas (`gestion-core.ts:509`, `:555`), proyección de caja (`:327`).
- **Brecha:** unir las dos tesorerías por la cuenta contable de rol BANCO; **conciliación** banco ↔ libro
  (pendientes de ambos lados, partidas conciliadas, saldo según banco y según libro); tipo de cambio **con
  historia por día** y fuente declarada; diferencia de cambio (A8); gastos e impuestos bancarios del extracto a
  sus roles (`GASTOS_BANCARIOS`, `IDC`); posición de caja por moneda; transferencias entre cuentas propias.
- **Parámetros:** cuentas y monedas, formato de extracto por banco, tipo de cambio de referencia (qué cotización
  y de qué día), reglas de clasificación (`ReglaClasificacionBancoTenant` `schema:1538`).
- **MIA:** ICBC en ARS y en USD; Mercado Pago empresa como cuenta nueva; Payway apagado. Tipo de cambio:
  **provisional a confirmar** con el estudio.

### FC-07 · Indicadores de impuesto en la carga de facturas (IVA)
- **SAP:** código de impuesto en la línea → cálculo → cuenta automática [I].
- **Existe:** cálculo por alícuota (`src/lib/fiscal/impuestos-por-alicuota.ts:52`, `:131`); libro IVA ventas y
  compras (`src/lib/libros/libro-iva.ts:541`, `:491`, `:214`), pantalla `/admin/libros`; desglose de IVA y
  percepciones como campos de la compra (`schema:1840-1856`).
- **Brecha:** **catálogo de indicadores** (código, impuesto, alícuota, base, rol de cuenta, si da crédito) usado
  igual en ventas, compras y gastos de proyecto; pantalla de carga de factura de proveedor por línea con
  indicador; validaciones (letra del comprobante contra condición fiscal, CUIT, duplicado).
- **Parámetros:** indicadores habilitados, indicador por defecto por tipo de gasto, tratamiento de lo no gravado
  y lo exento, crédito fiscal no computable.
- **MIA:** Responsable Inscripto; ventas con IVA débito, compras A con crédito. Emite en el sitio de ARCA: en
  la primera etapa la factura emitida **se registra** (número y CAE) y la emisión desde el ERP queda como opción
  (plugin ARCA existente), a decidir por el cliente.
- **Catálogo inicial (provisional, lo confirma el estudio):** IVA ventas y compras a la alícuota general,
  reducida y diferencial; no gravado; exento; percepción de IVA; percepción de IIBB por jurisdicción; impuestos
  internos u otros como «otros tributos».

### FC-08 · Percepciones y retenciones
- **SAP:** retención ampliada con tipos separados para la factura y para el pago, códigos, certificados
  numerados y datos en el maestro del proveedor [E]; desde 2608 el contenido lo mantiene el cliente [E].
  Reportes argentinos de retenciones y percepciones [E].
- **Existe:** sufridas **inferidas del texto del extracto** (`src/lib/reports/retenciones.ts:32`, `:52`,
  pantalla `/admin/retenciones`); percepciones en la compra (`schema:1853-1854`); roles contables de sufridas.
- **Brecha:** sufridas cargadas **en el cobro** con su certificado (A2); practicadas **en la orden de pago**
  (A6): régimen, base, acumulado del mes por proveedor, mínimo, alícuota, exclusiones con vigencia; certificado
  numerado; cuenta de retenciones a depositar; archivo para que el estudio presente.
- **Parámetros (todos provisionales, tabla versionada por año):** impuestos en los que el cliente es agente,
  regímenes y alícuotas, mínimos, jurisdicciones de IIBB, numeración de certificados.
- **MIA:** retenciones de IVA y Ganancias sufridas y practicadas. Las presenta el estudio: el ERP calcula,
  emite el certificado y entrega el archivo; **no presenta**. Si es agente de recaudación de IIBB: a confirmar.

### FC-09 · IIBB Convenio Multilateral
- **SAP:** el cálculo de impuestos provinciales no forma parte del procedimiento estándar argentino de Public
  Edition; se resuelve por extensión [E, nota 3615035]. **Diferencial GSG.**
- **Existe:** sólo un texto en el tenant (`schema:398`) y las obligaciones CM03 y CM05 en la tabla de
  vencimientos (`contab/tabla-vencimientos-2026.ts:49`, `:58`).
- **Brecha:** jurisdicciones del contribuyente con alícuota por actividad; **coeficiente unificado** por
  jurisdicción y año; jurisdicción en cada venta (dónde se presta el servicio) y en cada gasto; papel de trabajo
  mensual (base por jurisdicción, impuesto, menos percepciones, retenciones y recaudaciones bancarias); papel de
  trabajo anual para recalcular coeficientes (ingresos y gastos por jurisdicción).
- **Parámetros:** jurisdicciones, actividades y alícuotas, coeficientes vigentes, régimen aplicable.
- **MIA:** CABA y Buenos Aires. Coeficientes y alícuotas los informa el estudio; cada proyecto lleva la
  jurisdicción del evento.

### FC-10 · Posición fiscal del mes
- **SAP 1J2** reportes de cumplimiento [E; nombre vigente AV]; libro IVA compras con percepciones [E].
- **Existe:** libro IVA y su saldo (`src/lib/libros/libro-iva.ts:214`), exportación (`/admin/libros/export`).
- **Brecha:** tablero mensual: IVA (débito − crédito − retenciones y percepciones − saldo anterior), IIBB
  (FC-09), Ganancias (retenciones sufridas y anticipos como pagos a cuenta), con el detalle que respalda cada
  número y los asientos A11 y A12. Es **papel de trabajo**, no declaración jurada.
- **MIA:** lo usa administración para saber cuánto va a pagar antes de que el estudio arme el VEP.

### FC-11 · Monitor y calendario de obligaciones
- **SAP:** tablero de reportes legales con vencimiento, estados (por vencer, vencido, completado), generación
  del archivo y envío manual o electrónico [E, fuente de tercero y blog de comunidad].
- **Existe:** modelos (`ObligacionFiscal` `schema:4510`, `VencimientoFiscal` `:4529`), cálculo con días hábiles
  y feriados (`contab/vencimientos.ts:131`, `:105`, `:191`), tabla 2026 **provisional**
  (`contab/tabla-vencimientos-2026.ts:25`, `:109`), `generarCalendario` y cambio de estado (`contab/repo.ts:383`,
  `:444`). **Sin pantalla.**
- **Brecha:** pantalla de monitor (qué vence, cuándo, en qué estado, quién lo tiene, con el papel de trabajo y
  el archivo al lado); obligaciones que faltan (retenciones practicadas, Ganancias anual, agenda de pagos a
  proveedores y de cobros); aviso por WhatsApp o mail; tabla del año siguiente.
- **Parámetros:** obligaciones activas según perfil fiscal, terminación de CUIT, responsable de cada una.
- **MIA:** calendario compartido con el estudio (el estudio marca «presentado» y «pagado»).

### FC-12 · Salidas para el estudio contable externo
- **SAP J58:** líneas del mayor, diario de auditoría y balance de sumas y saldos [E]; lectura por interfaz [E].
- **Existe:** exportación del libro IVA (`src/lib/libros/libro-iva-export.ts:188`), paquete de cierre de mes
  (`src/lib/cierre-mes/paquete.ts:102`), compras con factura (`src/lib/contador/recibidos-export.ts:37`), libro de
  caja, formato de planilla argentino (`src/lib/libros/csv-ar.ts`), módulo Cartera del contador.
- **Brecha:** paquete mensual único: diario, mayor, sumas y saldos, auxiliares de clientes y proveedores,
  conciliaciones, retenciones y percepciones (sufridas y practicadas), papel de IIBB por jurisdicción, agenda
  de pagos. Acceso de sólo lectura para el estudio. Formato importable por el sistema del estudio: **a relevar**
  cuál usa.
- **MIA:** el estudio hace retenciones, agenda de pagos, balance y VEP con estas salidas.

### FC-13 · Rentabilidad por proyecto y por productor; comisiones y reintegros
- **SAP J11** proyectos de cliente [E]; **1NT** control financiero de proyectos [E]; **J55** análisis de margen
  sobre el diario universal [E]. Comisiones: sin scope item estándar, producto aparte [I]. Reintegros de gastos:
  producto aparte [I].
- **Existe:** resultado real y desvío por rubro del proyecto (`src/lib/proyectos/core.ts:136`, `:166`), margen y
  alertas de dirección (`src/lib/proyectos/empresa-core.ts:110`, `:72`, `:123`), liquidación, rendición y
  anticipos de personal (`schema:4099`, `:4128`, `:4163`), comisiones de salón (`src/lib/comision-liquidacion.ts:99`).
- **Brecha:** **productor** como dimensión del proyecto y del asiento; rentabilidad por productor y por
  período; regla de comisión de proyecto (base, porcentaje, condición de devengamiento) con A9; reintegro
  contra comprobante con A10; que el margen salga del libro (misma cifra que el estado de resultados).
- **Parámetros:** base de la comisión (venta neta, margen o cobrado), condición (proyecto finalizado),
  porcentaje por productor o por tipo de proyecto, tope de reintegro sin comprobante fiscal.
- **MIA:** comisión se devenga con el proyecto cobrado entero y el evento hecho; reemplaza las planillas por
  productor (la solapa general hoy tiene errores). Debe escalar a muchos proyectos y productores.

### FC-14 · Presupuesto contra real
- **SAP 1YB** carga de datos de plan [E; nombre AV]; **J54** costos indirectos con presupuesto por centro [E].
- **Existe:** presupuesto del proyecto con versiones (`ProyectoPresupuesto` `schema:3595`), desvíos
  (`core.ts:166`, `empresa-core.ts:72`), gastos fijos de la empresa (`ProyectoGastoFijo` `schema:4042`).
- **Brecha:** presupuesto anual por cuenta y por mes (estructura y gastos fijos), versiones, comparación con el
  libro, desvío en importe y porcentaje, proyección de cierre.
- **MIA:** dos niveles: por proyecto (ya existe; se ata al libro) y de la empresa (gastos fijos y resultado).

---

## 2 bis. Matriz de eventualidades (skill `ingenieria-reversa`, paso 4)

«Una eventualidad sin test no está resuelta.» Las funciones todavía no existen: la columna dice en qué tanda
nacen la función del motor y su test. Las reglas son la propuesta por defecto; las marcadas (P) son parámetro.

| # | Eventualidad | Regla | Quién decide | Qué ve | Función y test (tanda) |
|---|---|---|---|---|---|
| E1 | El cliente paga el anticipo y cancela el evento | El anticipo sigue como pasivo; se devuelve con nota de crédito o se retiene según contrato (P) | Dirección | Proyecto «cancelado» con saldo a devolver o retenido | Cancelación de proyecto · T4 |
| E2 | Cobro parcial o por un importe distinto al de la factura | Se aplica hasta donde alcanza; el resto queda en cuenta corriente; nunca más que el cobro | Administración | Factura «parcial» y saldo | Aplicación de cobro · T4 |
| E3 | Cobro que no se sabe de quién es | Va a «cobros a identificar»; no baja deuda de nadie hasta asignarlo | Administración | Bandeja de pendientes en la conciliación | Conciliación · T6 |
| E4 | El cliente retiene y no manda el certificado | Se registra la retención como pendiente de certificado; no se computa en la posición hasta tenerlo (P) | Administración | Alerta en el cobro y en el tablero fiscal | Retención sufrida · T4 / T8 |
| E5 | Adicional pedido después de facturar el saldo | Proyecto nuevo ligado al original, con su propio plan de cobro | Productor propone, administración factura | Proyecto hijo en la ficha del original | Proyecto adicional · T4 |
| E6 | Factura de proveedor repetida | Se rechaza por CUIT + tipo + punto de venta + número | El sistema | Mensaje con el enlace a la ya cargada | Validación de duplicado · T3 |
| E7 | Factura de proveedor que llega con el mes ya cerrado | Entra al período abierto con su fecha de origen; el crédito fiscal se toma en el mes de registro | Administración | Marca «fuera de término» | Período y fecha de origen · T9 |
| E8 | Echeq o cheque rechazado | Vuelve la deuda (o el crédito) y se contraasienta; gastos al rol de gastos bancarios | Administración | Cheque «rechazado» y deuda reabierta | Rechazo de cheque · T5 |
| E9 | Pago a un proveedor con certificado de exclusión vencido | Se retiene como si no lo tuviera; aviso antes de confirmar | El sistema avisa, administración confirma | Aviso en la orden de pago | Cálculo de retención · T5 |
| E10 | Se anula un pago que ya tenía certificado de retención | Contraasiento; el certificado queda anulado, no se reusa el número | Administración con aprobación | Certificado «anulado» | Anulación de pago · T5 |
| E11 | Factura en USD cobrada otro día | Se convierte cada una a su tipo de cambio; la diferencia va a diferencia de cambio (A8) | El sistema | Línea de diferencia en el cobro | Diferencia de cambio · T6 |
| E12 | No hay tipo de cambio cargado para el día | No se contabiliza; queda en la cola con el motivo; nunca se usa uno viejo en silencio | Administración carga el tipo de cambio | Cola «sin contabilizar» | Motor · T2 / T6 |
| E13 | El extracto se importa dos veces o se superpone | No duplica: clave por cuenta + fecha + importe + referencia | El sistema | «n movimientos ya existían» | Importación · T6 |
| E14 | Falta un rol de cuenta al contabilizar | No se contabiliza; cola con «falta asignar la cuenta de …» | Administración o implementador | Cola y enlace al plan | Motor · T2 |
| E15 | Hay que corregir un asiento de un período cerrado | No se toca: asiento de ajuste en el período abierto, o reapertura con rastro | Quien cierra el mes | Historial del período | Período · T9 |
| E16 | Proyecto cobrado entero pero con el evento sin hacer (o al revés) | No pasa a «Finalizado»: no se reconoce el ingreso ni se devenga la comisión | El sistema | Motivo en la ficha del proyecto | Estado «Finalizado» · T4 / T10 |
| E17 | Reintegro sin factura ni ticket | Hasta un tope (P) con aprobación; sin crédito fiscal | Dirección | Reintegro «sin comprobante» | Reintegro · T10 |
| E18 | Venta con servicios en dos jurisdicciones | Se reparte la base por jurisdicción en la factura (P: criterio) | Administración | Reparto en la línea | Jurisdicción · T8 |
| E19 | Cambia la tabla fiscal a mitad de año (alícuota, mínimo, vencimiento) | Tabla versionada con vigencia; lo ya calculado no se recalcula | Implementador con el estudio | Vigencia en el parámetro | Tablas con vigencia · T5 / T7 / T8 |
| E20 | El estudio pide rehacer el paquete de un mes | Se regenera idéntico si el período está cerrado; si se reabrió, queda versión nueva con rastro | Quien cierra el mes | Versiones del paquete | Paquete · T9 |

## 3. Deudas y riesgos anotados

1. **Dos formas de guardar plata** (`Decimal` en el núcleo, `Float` en Proyecto* y comisiones): no se migra en
   este arco; el motor convierte y se prueba el cuadre.
2. **Migraciones contables sin aplicar:** `contabilidad_ola1` no se aplicó en Neon según
   `docs/runbooks/GATE2-LOTE-2026-11-05.md`; de `ola2_roles` los docs no dicen nada [AV]. Todo el arco depende de
   ese Gate 2.
3. **Dos migraciones con el mismo timestamp** (`20260711140000_*`): avisar al dueño de datos.
4. **Tablas fiscales provisionales** (`PLAN_MODELO_PROVISIONAL`, `TABLA_VENCIMIENTOS_2026_PROVISIONAL`): no salen
   a un cliente sin la firma de un contador.
5. **Fuentes SAP sin abrir:** releer con red habilitada antes de usar los códigos SAP en material comercial.
6. **Cumplimiento:** el ERP produce papeles de trabajo y archivos; la presentación y la responsabilidad
   profesional son del estudio. Debe decirse en pantalla y en el contrato.

Anexos: **A** (fuentes) y **B** (objeciones de los challengers) en `ANEXO-FUENTES-Y-OBJECIONES.md`.

— Elaborado por GSG
