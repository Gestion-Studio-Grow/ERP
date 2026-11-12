# C · Cobros, pagos, conciliación y moneda extranjera (FC-04, FC-05, FC-06)

Relevado el 12/11/2026 leyendo código abierto clonado en `scratchpad/reglas-ref/src/`. **No se ejecutó código de
ningún repo.** Las reglas están descriptas con palabras propias (GPL/LGPL/AGPL: sin copia textual). Los vectores de
prueba son **derivados de la fórmula descripta**, calculados a mano con decimales exactos y redondeo medio-arriba a
2 decimales; no son salidas de los sistemas de origen [A VALIDAR contra una instancia real si se quiere paridad].

## Fuentes y commits

| Sigla | Repo | Commit (HEAD del 12/11/2026) | Licencia |
|---|---|---|---|
| ERPN | github.com/frappe/erpnext | `f9ad32825a24c062c6f534552f1acb36bd3f78f9` | GPL-3.0 (`license.txt`) |
| ODOO | github.com/odoo/odoo (Community) | `53882d6696307bd63504f79ae8aa421b7468a333` | LGPL-3.0 (`LICENSE`; texto no releído, [A VALIDAR]) |
| OFBZ | github.com/apache/ofbiz-framework | `4f19231088fbe7533154a2afb924e52d5e4106d5` | Apache-2.0 (`LICENSE`) |
| IDEM | github.com/idempiere/idempiere | `b42d472d33043e75dd2ecbadc7f8a6678fdd0435` | GPL-2.0 (`LICENSE.md`) |
| TRYT | github.com/tryton/tryton | `688622c64f6e2507bd4f26535b5e01b9d633e6d6` | GPL-3.0 (`modules/account/LICENSE`; versión [A VALIDAR]) |
| ADHOC | github.com/ingadhoc/odoo-argentina | `234efae32b5658951e0e4ba1283ee55a7cfd632a` | AGPL-3.0 (`LICENSE`) |

Rutas abreviadas:
- ERPN `PE` = `erpnext/accounts/doctype/payment_entry/payment_entry.py`; `PR` = `.../payment_reconciliation/payment_reconciliation.py`;
  `ERR` = `.../exchange_rate_revaluation/exchange_rate_revaluation.py`; `BRT` = `.../bank_reconciliation_tool/bank_reconciliation_tool.py`;
  `BT` = `.../bank_transaction/bank_transaction.py`; `AR` = `erpnext/accounts/report/accounts_receivable/accounts_receivable.py`;
  `DUN` = `.../dunning/dunning.py`.
- ODOO `AML` = `addons/account/models/account_move_line.py`; `PT` = `addons/account/models/account_payment_term.py`;
  `REG` = `addons/account/wizard/account_payment_register.py`; `ARM` = `addons/account/models/account_reconcile_model.py`;
  `CHK` = `addons/l10n_latam_check/models/l10n_latam_check.py`.
- OFBZ `IS` = `applications/accounting/src/main/java/org/apache/ofbiz/accounting/invoice/InvoiceServices.java`;
  `IW` = `.../invoice/InvoiceWorker.java`; `PW` = `.../payment/PaymentWorker.java`;
  `GL` = `applications/accounting/minilang/ledger/GeneralLedgerServices.xml`.
- IDEM `DAH` = `org.idempiere.acct/src/org/idempiere/acct/doc/Doc_AllocationHdr.java`; `NGL` = `org.idempiere.acct/src/org/idempiere/acct/process/InvoiceNGL.java`;
  `AGI` = `org.adempiere.base/src/org/compiere/model/MAging.java`; `AGP` = `org.adempiere.base.process/src/org/compiere/process/Aging.java`;
  `DRC` = `org.adempiere.base.process/src/org/compiere/process/DunningRunCreate.java`; `ALF` = `org.adempiere.ui/src/org/compiere/apps/form/Allocation.java`.

Convención de los vectores: moneda local ARS, 2 decimales; `tc` = ARS por 1 USD; ganancia de cambio positiva.

---

## R-C-01 · Saldo pendiente = total menos lo aplicado, en la moneda de origen
- **Regla:** el saldo de una factura (o lo disponible de un pago) no se guarda «a mano»: es el total del documento
  menos la suma de sus aplicaciones, redondeado a la escala de la moneda. Se calcula primero en moneda de origen;
  el equivalente en moneda local sale de multiplicar por el tipo de cambio **del documento**, no el del día.
- **Fórmula:** `saldo_ME = round2(total_ME − Σ aplicado_ME)`; `saldo_ARS_histórico = round2(saldo_ME × tc_documento)`;
  `disponible_pago = round2(importe_pago − Σ aplicado_del_pago)`.
- **Bordes:** aplicaciones con fecha posterior a la fecha de corte no cuentan (saldo «a una fecha»); documento sin
  aplicaciones → saldo = total; el tipo de cambio de la factura se toma, en orden, del asiento ya contabilizado, de
  los pagos aplicados (promedio) o de la tabla fechada (OFBiz); si no hay ninguno OFBiz devuelve 1 (mala práctica:
  nosotros debemos frenar).
- **Vectores:**
  1. Factura US$ 100,00, aplicado US$ 33,33 → saldo US$ 66,67.
  2. Factura US$ 100,00 a tc 1400, sin aplicar → saldo US$ 100,00 = ARS 140.000,00 histórico.
  3. Pago ARS 150.001,00 con aplicaciones 100.000,00 y 50.001,00 → disponible 0,00.
  4. Corte al 31/10 con una aplicación del 03/11 de US$ 40 sobre US$ 100 → saldo al corte US$ 100,00.
- **Fuente:** OFBZ `IW:444-463` (no aplicado), `IW:485-514` (aplicado a fecha, con conversión), `IW:585-645`
  (jerarquía del tipo de cambio), `PW:339-372` (no aplicado del pago) · Apache-2.0. También IDEM `AGP:124-141`
  (funciones de saldo abierto a fecha) · GPL-2.0.
- **Ficha:** FC-04, FC-05.

## R-C-02 · Un pago se reparte entre facturas de la más vieja a la más nueva
- **Regla:** al imputar un pago a varias facturas se recorren en orden de vencimiento (si no hay, fecha del
  comprobante) y a cada una se le aplica lo que alcance: el menor entre lo que queda del pago y lo que debe la
  factura. Se sigue hasta agotar el pago o las facturas.
- **Fórmula:** para cada factura `f` en orden: `aplicado_f = min(resto_pago, saldo_f)`; `resto_pago −= aplicado_f`;
  `saldo_f −= aplicado_f`. Clave de orden Odoo: (vencimiento o fecha, moneda, importe en moneda, importe local).
- **Bordes:** pago mayor que la deuda → sobrante queda sin aplicar (anticipo, R-C-05); pago igual a una factura
  → corta ahí; varias facturas con igual vencimiento → desempata por moneda e importe (Odoo); varios pagos contra
  varias facturas → doble bucle pago × factura (ERPNext).
- **Vectores:**
  1. Pago 1.000,00; facturas A (vence 01/10) 400,00, B (15/10) 400,00, C (01/11) 400,00 → A 400, B 400, C 200; saldo C 200,00.
  2. Pago 300,00; mismas facturas → A 300; saldo A 100,00; B y C intactas.
  3. Pago 1.500,00; mismas facturas → A, B, C 400 cada una; sin aplicar 300,00.
  4. Pagos P1 500,00 y P2 500,00 contra A 400 y B 700 → P1: A 400, B 100; P2: B 500; saldo B 100,00.
- **Fuente:** ERPN `PR:481-541` · GPL-3.0; ODOO `AML:3050-3063` (orden) y `AML:2576-2880` (parcial) · LGPL-3.0;
  OFBZ `IS:3385-3445` (reparto por ítems de factura) · Apache-2.0.
- **Ficha:** FC-04, FC-05.
- **Nota:** en OFBZ `IS:3392` el corte del bucle se dispara cuando **queda** disponible (`> 0`), lo que parece
  invertido respecto de la intención [A VALIDAR: posible defecto; no copiar esa condición].

## R-C-03 · Cuotas: la última cuota absorbe el redondeo
- **Regla:** una factura con plan de cobro se parte en cuotas por porcentaje o importe fijo; cada cuota se
  redondea a la moneda y la **última siempre es «el resto»**, sin importar su porcentaje, para que la suma dé el
  total exacto. Se calcula en paralelo en moneda de origen y en moneda local.
- **Fórmula:** `cuota_i = round2(total × pct_i/100)` para i < n; `cuota_n = total − Σ cuota_i`. Al cobrar, el
  importe propuesto por defecto = cuotas vencidas + la próxima; el resto queda como «importe completo».
- **Bordes:** un solo renglón → 100 %; cuota de importe fijo en ME se convierte al tc de la factura; con
  redondeo de efectivo cada cuota no final se ajusta y la final queda redondeada por construcción.
- **Vectores:**
  1. Total 150.001,00, plan 70/30 → 105.000,70 y 45.000,30.
  2. Total US$ 100,01, plan 70/30 → US$ 70,01 y US$ 30,00.
  3. Total 1.000,00, tres cuotas de 33,33 % → 333,30 · 333,30 · 333,40.
- **Fuente:** ODOO `PT:214-250` (reparto) y `REG:662-735` (importe por defecto según cuotas vencidas/próxima) ·
  LGPL-3.0; ERPN `PE:2410-2470` (parte la factura en renglones por cuota) y `PE:945-1010` (lleva lo pagado por
  cuota) · GPL-3.0.
- **Ficha:** FC-04 (plan 70/30 de MIA), FC-05.

## R-C-04 · No se puede aplicar más que el saldo ni más que el pago
- **Regla:** cada aplicación se valida contra dos topes: el saldo de la factura **releído en el momento** (no el
  que se mostró en pantalla) y lo disponible del pago. Para saldos negativos (notas de crédito) el tope es
  simétrico. La comparación se hace redondeada, con una tolerancia de menos de un centavo.
- **Fórmula:** `aplicado ≤ saldo_factura + 0,009` y `aplicado ≤ disponible_pago`; si `saldo < 0`:
  `aplicado ≥ saldo`. Si el importe viene vacío o en cero y se pide «el máximo», se toma
  `min(disponible_pago, saldo_factura)` (OFBiz).
- **Bordes:** dos usuarios aplicando a la vez → la segunda aplicación debe fallar al releer; importe cero sin
  «máximo» → error; monedas distintas entre pago y factura sin conversión declarada → error (OFBiz).
- **Vectores:**
  1. Saldo 100,00, aplicar 100,00 → acepta. 2. Saldo 100,00, aplicar 100,01 → rechaza (0,01 > 0,009).
  3. Saldo 100,00, aplicar 100,005 → acepta (dentro de 0,009) y debe guardarse 100,00 [criterio propio: redondear antes].
  4. NC con saldo −50,00, aplicar −60,00 → rechaza. 5. Disponible 80,00, saldo 100,00, importe vacío + «máximo» → 80,00.
- **Fuente:** ERPN `PE:446-467`, `PR:768-800` (tolerancia 0,009 en `PR:791`) · GPL-3.0; OFBZ `IS:3300-3313`,
  `IS:2984`, `IS:3064` · Apache-2.0.
- **Ficha:** FC-04, FC-05.

## R-C-05 · Lo que sobra del pago es anticipo, y se guarda en la moneda de la cuenta del cliente
- **Regla:** lo no aplicado no se pierde ni se fuerza contra una factura: queda como saldo a favor (anticipo).
  Se calcula en moneda local y se vuelve a la moneda de la cuenta corriente con el tipo de cambio del pago; nunca
  es negativo. Un anticipo contra un **pedido/presupuesto** se valúa al tipo de cambio del pago, sin diferencia de
  cambio; la diferencia nace recién cuando el anticipo se aplica a una factura (R-C-07).
- **Fórmula:** cobro: `base_no_aplicado = base_cobrado + deducciones − base_aplicado`; pago: `base_pagado −
  deducciones − base_aplicado`; `no_aplicado = round(max(0, base_no_aplicado) / tc_pago)`. El residuo de ese
  redondeo va a la línea de diferencia: `redondeo = base_no_aplicado − no_aplicado × tc_pago`.
- **Bordes:** transferencia entre cuentas propias → no hay anticipo; anticipo redondeado para arriba que deja un
  resto local negativo al quedar totalmente aplicado → no se da de baja por redondeo; ERPNext permite llevar el
  anticipo a una cuenta de pasivo separada (`set_liability_account`).
- **Vectores:**
  1. Cobro ARS 150.001,00, aplicado 100.000,00 → anticipo ARS 50.001,00.
  2. Cobro US$ 100,00 a tc 1500,01 (ARS 150.001,00), aplicado US$ 60,00 (ARS 90.000,60) → anticipo US$ 40,00 = ARS 60.000,40.
  3. Cobro 100,00 aplicado 100,00 → anticipo 0,00. 4. Aplicado > cobrado por deducción de 10,00: cobrado 90,00,
     deducción 10,00, aplicado 100,00 → anticipo 0,00.
- **Fuente:** ERPN `PE:1298-1331` (no aplicado y su redondeo), `PE:1240-1279` (anticipo contra pedido sin
  diferencia), `PE:301` (cuenta de pasivo), `erpnext/accounts/utils.py:2735` · GPL-3.0.
- **Ficha:** FC-04 (anticipo como pasivo hasta el evento, A1/A4), FC-05 (anticipo a proveedor).

## R-C-06 · Notas de crédito: compensan primero y son un «pago» más
- **Regla:** las notas de crédito (saldos negativos) del mismo cliente se usan como medio de cancelación. En el
  reparto automático, si el efectivo no alcanza para todo lo positivo, las NC cubren la diferencia hasta su
  importe; al conciliar, una NC se ofrece en la lista de «pagos» junto con cobros y asientos.
- **Fórmula:** `P` = Σ saldos positivos, `N` = Σ |saldos negativos|, `E` = efectivo neto de deducciones.
  Si `P > E`: `NC_usada = min(P − E, N)`; `a_repartir_en_positivos = E + NC_usada`. Devolución al cliente
  (pago en sentido inverso): exige `E ≤ N`.
- **Bordes:** sin NC y se intenta devolver → aviso y no reparte; NC en otra moneda → pasa por R-C-07;
  NC mayor que la deuda → el sobrante queda como saldo a favor.
- **Vectores:**
  1. Facturas 1.000,00 + NC −200,00, efectivo 800,00 → NC usada 200,00; facturas canceladas 1.000,00.
  2. Facturas 1.000,00 + NC −200,00, efectivo 500,00 → NC usada 200,00; aplicado 700,00; saldo 300,00.
  3. Facturas 1.000,00 + NC −200,00, efectivo 1.000,00 → NC usada 0,00 (P no supera E); NC queda a favor.
  4. Devolución 300,00 con NC por 200,00 → rechaza.
- **Fuente:** ERPN `PE:1857-1925`, `PR:296-365` (NC y notas de débito como entradas), `PR:865` · GPL-3.0.
- **Ficha:** FC-04 (NC por cancelación/postergación), FC-05.

## R-C-07 · Diferencia de cambio realizada = aplicado × (tc del cobro − tc de la factura)
- **Regla:** cuando se cancela una factura en moneda extranjera con un cobro a otro tipo de cambio, la diferencia
  entre valuar lo aplicado al tc del cobro y al tc de la factura es resultado por diferencia de cambio
  **realizada**. Se calcula por cada aplicación (no por documento) y sólo sobre lo aplicado. Cada lado se redondea
  por separado antes de restar.
- **Fórmula:** `DC = round2(aplicado_ME × tc_cobro) − round2(aplicado_ME × tc_factura)`. Cuenta a cobrar:
  `DC > 0` ganancia; cuenta a pagar: `DC > 0` pérdida. Si la cuenta corriente está en moneda local, `DC = 0`.
- **Bordes:** tc iguales → no hay asiento; fecha del asiento configurable: fecha del cobro (por defecto), de la
  factura o de la conciliación; para anticipos siempre la del cobro; devolución a proveedor invierte el signo.
- **Vectores:**
  1. **Cuota US$ 100,00 facturada a tc 1400,00, cobrada a tc 1500,01** → 150.001,00 − 140.000,00 = **+10.001,00** (ganancia).
  2. Aplicación parcial US$ 33,33, mismos tc → 49.995,33 − 46.662,00 = +3.333,33.
  3. Proveedor: factura US$ 100,00 a 1400,00 pagada a 1500,01 → 10.001,00 de **pérdida**.
  4. US$ 40,00 a tc cobro 1500,01 y US$ 60,00 a tc cobro 1520,00 sobre factura a 1400,00 →
     (60.000,40 − 56.000,00) + (91.200,00 − 84.000,00) = 4.000,40 + 7.200,00 = +11.200,40.
- **Fuente:** ERPN `PR:429-464`, `PR:520-531`, `PE:1264-1279`, `erpnext/controllers/accounts_controller.py:1236`,
  `erpnext/accounts/utils.py:2651` · GPL-3.0; OFBZ `GL:2622-2645` (pago a proveedor: importe × (tc pago − tc
  factura) a la cuenta `FX_GAIN_LOSS_ACCT`) · Apache-2.0.
- **Ficha:** FC-06 (diferencia de cambio A8), FC-04 (A8b), FC-05.

## R-C-08 · Cancelación total vs. parcial en moneda extranjera
- **Regla:** si la aplicación cancela la factura **entera** en su moneda, la diferencia de cambio es
  simplemente «lo contabilizado por la factura menos lo contabilizado por la aplicación», de modo que la cuenta
  queda en cero exacto también en moneda local. Si es **parcial**, se convierte lo aplicado al tipo de cambio de
  la fecha de la factura y se compara con lo contabilizado por la aplicación; las diferencias por debajo de la
  tolerancia se ignoran y se corrigen al final.
- **Fórmula:** total: `DC = |contable_factura| − |contable_aplicación|`; parcial:
  `DC = |convertir(aplicado_ME, tc_fecha_factura)| − |contable_aplicación|`, `DC = 0` si `|DC| < 0,02`, redondeo a
  la precisión contable. En iDempiere el signo es inverso: ganancia negativa.
- **Bordes:** factura aún no contabilizada → no se calcula (queda pendiente); aplicación que nace de la anulación
  de la factura → la diferencia va a la misma cuenta corriente, no a resultado; última parcialidad → corrección de
  redondeo para que la suma de parciales iguale al total (`createInvoiceRoundingCorrection`).
- **Vectores (signo GSG: ganancia positiva):**
  1. Factura US$ 100,00 contabilizada 140.000,00; cobro total contabilizado 150.001,00 → +10.001,00.
  2. Parcial US$ 33,33: a tc factura 46.662,00; contabilizado 49.995,33 → +3.333,33.
  3. Parcial US$ 0,01 con tc 1400,00 vs. 1500,01: 14,00 vs. 15,00 → 1,00 (supera 0,02: se registra).
  4. Parcial donde la diferencia es 0,01 → se ignora (menor que 0,02) y se ajusta en la última parcialidad.
- **Fuente:** IDEM `DAH:833-900` (cálculo), `DAH:78` (tolerancia 0,02), `DAH:1088` y `DAH:1476` (corrección de
  redondeo de factura y de pago) · GPL-2.0.
- **Ficha:** FC-06, FC-04, FC-05.

## R-C-09 · Tolerancia de redondeo al cancelar: el centavo no abre una diferencia de cambio
- **Regla:** antes de generar una diferencia de cambio se pregunta si el desvío puede explicarse sólo por el
  redondeo de la conversión. Cada importe en ME redondeado representa un rango (± medio centavo); convertido a
  moneda local da un mínimo y un máximo. Si el importe local de cada lado cae dentro del rango del otro, se
  concilia por el residual completo y **no** se genera asiento de diferencia. Una línea queda cerrada sólo cuando
  su residual es cero en **ambas** monedas.
- **Fórmula:** `rango(x) = [round((x − ½u) × tc), round(x × tc), round((x + ½u) × tc)]`, `u` = unidad mínima de
  la moneda. Si `parcial_deudor ∈ rango_acreedor` y `parcial_acreedor ∈ rango_deudor` →
  `parcial = min(residual_deudor, residual_acreedor)` en moneda local.
- **Bordes:** línea totalmente cancelada en ME con residuo local → el residuo se barre a diferencia de cambio;
  línea parcialmente cancelada → sólo se corrige si el tipo implícito del residual quedaría inconsistente; con la
  marca «sin diferencia de cambio» se concilia en moneda local. Otras tolerancias vistas: 0,02 fijo (iDempiere,
  R-C-08), 0,009 al validar (ERPNext, R-C-04), parámetro entre 0 y 1 para considerar saldo cero al revaluar (R-C-10).
- **Vectores:**
  1. Ejemplo documentado en la fuente: US$ 281,53 contra una línea de tipo 18,8777 → rango local
     [5.314,54 · 5.314,64 · 5.314,73]; el otro lado vale 5.314,62 → dentro del rango → sin diferencia de cambio.
  2. US$ 100,00 a 1500,01 = 150.001,00 vs. 140.000,00 de la factura → fuera de rango → diferencia 10.001,00.
  3. **Cuota US$ 100,00 cobrada con ARS 150.000,00 al tc 1500,01:** 150.000 / 1500,01 = 99,99933… → US$ 100,00
     (redondea) → la cuota queda cancelada en USD; lo local se cierra por R-C-07 contra 140.000,00 (+10.000,00).
  4. ARS 149.986,00 al tc 1500,01 = US$ 99,99 → queda saldo US$ 0,01 (≈ ARS 15,00): **no** es redondeo, queda abierto.
- **Fuente:** ODOO `AML:2501-2575` (residual por moneda; la línea en moneda local «imita» la moneda extranjera
  con el tipo de la fecha del pago), `AML:2660-2760` (rangos y supresión), `AML:2760-2880` (residuales y cierre) ·
  LGPL-3.0.
- **Ficha:** FC-06, FC-04.

## R-C-10 · Diferencia de cambio no realizada: revaluación de saldos al cierre
- **Regla:** al cierre de mes se toma, por cuenta y por tercero, el saldo en moneda extranjera y su saldo
  contable en moneda local; se revalúa al tipo de cambio de cierre y la diferencia va a una cuenta de resultado
  **no realizado**. El asiento se **revierte** al inicio del período siguiente, de modo que la diferencia realizada
  (R-C-07) se calcula siempre contra el tipo original. iDempiere lo hace factura por factura abierta, con un tipo
  de conversión elegido para la revaluación y asiento por la variación.
- **Fórmula:** `tc_actual = saldo_ARS / saldo_ME`; `nuevo_ARS = saldo_ME × tc_cierre`;
  `DC_no_realizada = round2(nuevo_ARS) − round2(saldo_ARS)`. Activo: positivo = ganancia; pasivo: saldo negativo,
  el resultado negativo = pérdida. Por factura (iDempiere): `dif = convertir(importe_ME, tc_cierre) −
  importe_contable`, proporcional al porcentaje abierto.
- **Bordes:** saldo ME = 0 con resto local ≠ 0 (o al revés) → se lleva el resto a cero contra resultado, sin
  tipo de cambio; saldos cuyo valor absoluto ≤ tolerancia (parámetro en [0, 1)) se consideran cero; líneas sin
  diferencia se quitan del documento; al anular, se anulan el asiento y su reversa; falta de cuenta de no
  realizado → error.
- **Vectores:**
  1. Clientes US$ 1.000,00 contabilizados a 1.400.000,00; cierre 1500,01 → 1.500.010,00 → **+100.010,00**.
  2. Banco US$ 250,50 a 347.506,13 (tc 1387,25); cierre 1500,01 → 375.752,51 → +28.246,38.
  3. Proveedores −US$ 300,00 a −435.000,00 (tc 1450); cierre 1500,01 → −450.003,00 → −15.003,00 (pérdida).
  4. Saldo US$ 0,00 con resto local 12,34 → ajuste −12,34 (limpia el resto). 5. El 01 del mes siguiente: reversa
     de 1 por −100.010,00.
- **Fuente:** ERPN `ERR:280-354` (cálculo), `ERR:259-276` (tolerancia y saldo cero), `ERR:47-49`, `ERR:393` y
  `ERR:506` (asientos), `ERR:605` (reversa) · GPL-3.0; IDEM `NGL:128-200` (selección y diferencias), `NGL:249-393`
  (asiento y cuentas de no realizado) · GPL-2.0.
- **Ficha:** FC-06 (A8).

## R-C-11 · Diferencia entre lo cobrado y lo debido: dejar abierto o dar de baja con motivo
- **Regla:** cuando el importe del cobro no coincide con la deuda, el operador elige entre dejar el saldo
  **abierto** (cobro parcial) o **cerrarlo** llevando la diferencia a una cuenta (descuento, quita, gasto
  bancario, redondeo). El sistema nunca lo decide solo, salvo descuento por pronto pago vigente.
- **Fórmula:** `sobre_o_falta = saldo_abierto − aplicado − descuento − baja` (iDempiere); factura cerrada sii
  `sobre_o_falta = 0`. Odoo: `diferencia = importe_a_pagar − importe_ingresado`, con manejo «abierto» por defecto
  y «conciliar» si aplica pronto pago.
- **Bordes:** renglón con aplicado, descuento y baja en cero → se ignora; descuento y baja arrastran corrección
  de impuesto (iDempiere `createTaxCorrection`); la baja exige cuenta y etiqueta.
- **Vectores:**
  1. Saldo 150.001,00, aplicado 150.000,00, baja 1,00 → sobre/falta 0,00 → cerrada.
  2. Saldo 150.001,00, aplicado 150.000,00, sin baja → queda abierto 1,00.
  3. Saldo 1.000,00, aplicado 950,00, descuento 30,00, baja 20,00 → 0,00 → cerrada.
- **Fuente:** IDEM `ALF:663-708`, `DAH:766` · GPL-2.0; ODOO `REG:145-148`, `REG:884-904`, `REG:1088` · LGPL-3.0;
  TRYT `modules/account/move.py:1603-1645` (conciliar con baja: fecha, método, descripción) · GPL-3.0.
- **Ficha:** FC-04, FC-05.

## R-C-12 · Factura pagada cuando lo aplicado alcanza el total; fecha de pago = última aplicación
- **Regla:** el estado «pagada» se deriva: suma de aplicaciones ≥ total de la factura. La fecha de pago es la de
  la aplicación más reciente. Al desaplicar, el estado vuelve atrás.
- **Fórmula:** `pagada ⇔ Σ aplicado ≥ total`; `fecha_pago = max(fecha_aplicación_i)`.
- **Bordes:** sin aplicaciones → no cambia; se re-evalúa cada factura tocada por un pago; total cero → no se marca
  (exige suma positiva).
- **Vectores:** 1. Total 1.000,00; aplic. 400 (05/10) + 600 (20/10) → pagada, fecha 20/10. 2. 400 + 599,99 → no
  pagada, saldo 0,01. 3. 1.000,00 el 01/11 y se desaplica → vuelve a pendiente.
- **Fuente:** OFBZ `IS:2391-2470` (control por factura), `IS:3635-3668` (recorre las facturas de un pago) · Apache-2.0.
  Extracto (≤ 20 líneas, Apache-2.0, © The Apache Software Foundation, `IS:3654-3658`):
  ```java
  for (GenericValue paymentApplication : paymentApplications) {
      String invoiceId = paymentApplication.getString("invoiceId");
      if (invoiceId != null) {
          Map<String, Object> serviceResult = dispatcher.runSync("checkInvoicePaymentApplications", UtilMisc.<String, Object>toMap(
                  "invoiceId", invoiceId, "userLogin", userLogin));
  ```
- **Ficha:** FC-04 («Finalizado» = cobrado entero + evento hecho), FC-05.

## R-C-13 · Descuento por pronto pago (opcional)
- **Regla:** si el plan de cobro prevé descuento y se paga antes de la fecha límite, el importe a pagar baja; el
  descuento puede calcularse sobre el total con impuestos o sólo sobre el neto.
- **Fórmula:** incluido: `a_pagar = round2(total × (1 − d))`; excluido/mixto: `a_pagar = round2(total − neto × d)`.
  ERPNext: `descuento = total × d/100` o importe fijo, válido si `fecha_pago ≤ fecha_límite` y la cuota no tuvo
  descuento antes.
- **Bordes:** `d ≤ 0` → inválido; cuota ya descontada → no se repite; en ME el descuento se convierte al tc de la factura.
- **Vectores:** 1. Total 121.000,00 (neto 100.000,00), d = 2 %, incluido → 118.580,00. 2. Mismo, excluido →
  119.000,00. 3. Pago un día después del límite → 121.000,00.
- **Fuente:** ODOO `PT:62-70`, `PT:192-206` · LGPL-3.0; ERPN `PE:3345-3385` · GPL-3.0.
- **Ficha:** FC-04, FC-05. Prioridad baja para MIA.

## R-C-14 · Cheques y valores diferidos: el estado se deriva de sus movimientos
- **Regla:** un cheque es un registro propio con fecha de emisión y **fecha de pago** (diferida), ligado al pago
  que lo originó y a la lista ordenada de operaciones posteriores (depósito, endoso, rechazo). **De terceros:**
  está «en cartera» si su última operación confirmada es una entrada a un diario de tipo caja; el diario actual es
  el de esa última operación. **Propio:** «entregado» mientras su línea puente tenga saldo; «debitado» cuando el
  extracto lo cancela; «anulado» cuando lo cancela un contraasiento contra la cuenta del proveedor (la deuda
  revive).
- **Fórmula:** operaciones ordenadas por (fecha, alta del asiento, id); `en_cartera = (última.sentido = entrada)
  ∧ (diario.tipo = caja)`; propio: `residual ≠ 0 → entregado`; `residual = 0 ∧ contrapartida en cuenta corriente
  → anulado`; si no → `debitado`.
- **Bordes:** importe ≤ 0 → inválido; no se borra un cheque con el pago en proceso; el CUIT del librador se
  limpia y valida; anular genera un asiento espejo con el mismo vencimiento e importe en moneda. En ERPNext el
  equivalente es la «fecha de acreditación» del pago, que la conciliación completa y hasta entonces lo deja
  pendiente.
- **Vectores:**
  1. Cheque de tercero recibido 05/11 (pago 05/12), sin más operaciones → en cartera, diario «Cheques en cartera».
  2. Mismo cheque endosado a proveedor el 10/11 (salida) → ya no en cartera.
  3. Cheque propio por 150.001,00 entregado el 01/11 con pago 01/12; el extracto del 01/12 lo debita → «debitado».
  4. Cheque propio anulado el 15/11 → «anulado»; la deuda con el proveedor vuelve a 150.001,00.
- **Fuente:** ODOO `CHK:105-131`, `CHK:140-166`, `CHK:185-201`, `CHK:247-276` · LGPL-3.0; ERPN `PE:100`,
  `BRT:458-495` · GPL-3.0.
- **Ficha:** FC-05 (cheques, Echeq, terceros en cartera), FC-06.

## R-C-15 · Conciliación bancaria: puntaje de coincidencia y saldo no asignado del movimiento
- **Regla:** cada movimiento del extracto lleva su importe **no asignado**; está conciliado cuando llega a cero.
  Los candidatos del libro se ordenan por puntaje: uno de base más un punto por referencia igual, uno por importe
  igual al no asignado y uno por mismo tercero. En modo «exacto» sólo entran los de importe igual. Sólo se ofrecen
  documentos aún no acreditados, de la misma cuenta y del sentido correcto (depósito ↔ cobro, extracción ↔ pago;
  las transferencias internas valen para ambos).
- **Fórmula:** `no_asignado = |extracción − depósito| − Σ asignado`; `puntaje = 1 + [ref] + [importe] + [tercero]`
  (máx. 4; 5 entre movimientos bancarios espejo); `asignado_doc = min(asignable_doc, resto)`; el documento se
  marca acreditado sólo si `asignable ≤ resto`.
- **Bordes:** documento ya asignado de más → error; `resto ≤ 0` → se descarta el vínculo; asignable = 0 → sólo se
  marca acreditado; desconciliar devuelve el no asignado y limpia la fecha de acreditación; comisión incluida o
  excluida del importe se valida aparte (`validate_included_fee`).
- **Vectores:**
  1. Depósito 150.001,00, ref «TRF123», cliente X; cobro 150.001,00, ref «TRF123», cliente X → puntaje 4;
     no asignado 0,00 → conciliado.
  2. Depósito 150.001,00; cobro 150.000,00 mismo cliente, otra ref → puntaje 2; asigna 150.000,00; no asignado
     1,00 → sigue sin conciliar.
  3. Depósito 300.000,00; cobros de 100.000,00 y 250.000,00 → asigna 100.000,00 y 200.000,00; el segundo
     **no** se marca acreditado (250.000 > 200.000 restantes).
  4. Modo exacto con depósito 150.001,00 → el cobro de 150.000,00 no aparece.
- **Fuente:** ERPN `BT:112-119`, `BT:86-94`, `BT:177-232`, `BRT:1369-1412`, `BRT:1515-1540`, `BRT:1559-1612` ·
  GPL-3.0.
- **Ficha:** FC-06.

## R-C-16 · Tolerancia de cobro en la conciliación automática
- **Regla:** una regla de conciliación puede aceptar un cobro que difiere de la deuda dentro de una tolerancia
  configurable, en porcentaje o en importe, y llevar la diferencia a una cuenta. El orden de búsqueda
  (más viejas primero o más nuevas primero) es parámetro; por defecto, más viejas primero.
- **Fórmula:** porcentaje: `|deuda − cobrado| ≤ deuda × t/100`, con `0 ≤ t ≤ 100`; importe: `|deuda − cobrado| ≤ t`,
  `t ≥ 0`. **La aplicación exacta de la tolerancia no está en Community** (el motor de emparejado vive en el
  módulo Enterprise): acá sólo están los campos y sus restricciones. La fórmula es la lectura natural [A VALIDAR].
- **Bordes:** tolerancia 0 → sólo exacto; regla automática exige disparador automático.
- **Vectores (bajo la fórmula A VALIDAR):** 1. Deuda 150.001,00, t = 0,5 % → admite hasta 750,01 de diferencia:
  cobro 149.300,00 pasa (701,00). 2. Cobro 149.200,00 → no pasa (801,00). 3. t = 1,00 en importe; cobro
  150.000,00 → pasa (1,00).
- **Fuente:** ODOO `ARM:154-171`, `ARM:175-184` · LGPL-3.0.
- **Ficha:** FC-06.

## R-C-17 · Antigüedad de saldos por tramos
- **Regla:** la antigüedad se mide a una fecha de corte, contra la fecha base elegida (vencimiento, fecha del
  comprobante o fecha de la factura del proveedor). El saldo entero del comprobante (o de la **cuota**, si se
  abre por cuota) cae en el primer tramo cuyo límite no es superado por los días. Lo que todavía no venció va a
  una columna aparte «a vencer» y no suma al total vencido.
- **Fórmula:** `días = corte − fecha_base`; tramos por defecto 30/60/90/120: tramo `i` = primero con
  `días ≤ límite_i`, si ninguno → «más de 120»; si `fecha_base > corte` → columna 0 y `vencido = 0`.
  iDempiere: `días_vencido ≤ 0` → a vencer (hoy, 1-7, 8-30, 31-60, 61-90, 91+); `> 0` → vencido con iguales cortes;
  además promedio de días = Σ días / cantidad.
- **Bordes:** anticipos y asientos sin vencimiento usan su fecha; el saldo es «a la fecha de corte» (aplicaciones
  posteriores no cuentan, R-C-01); cobros con fecha futura pueden imputarse aparte (`allocate_future_payments`);
  límite exacto (día 30) cae en el tramo 0-30.
- **Vectores (corte 31/10/2026):**
  1. Vence 01/10 → 30 días → tramo 0-30. 2. Vence 30/09 → 31 días → tramo 31-60. 3. Vence 15/11 → −15 → «a
  vencer», vencido 0,00. 4. Vence 01/06 → 152 días → «más de 120». 5. Vence 31/10 → 0 días → tramo 0-30
  (ERPNext) / «vence hoy» (iDempiere).
- **Fuente:** ERPN `AR:64-67`, `AR:818-854`, `AR:1367-1382`, `AR:769` · GPL-3.0; IDEM `AGI:157-203`,
  `AGP:115-171`, `AGP:202-240` · GPL-2.0. Odoo Community **no trae** el informe de antigüedad (es de Enterprise):
  no hay fuente abierta ahí.
- **Ficha:** FC-04 (ya existe `src/lib/debts/aging.ts`: contrastar tramos y la columna «a vencer»), FC-05.

## R-C-18 · Interés por mora: simple, diario, sobre el saldo vencido
- **Regla:** el interés se calcula por cada cuota vencida, sobre su saldo pendiente, con tasa anual simple
  prorrateada por día (año de 365) desde el vencimiento hasta la fecha del reclamo. El total del reclamo es la
  suma de intereses más un cargo fijo. El reclamo queda resuelto recién cuando se pagan la deuda, el interés y el
  cargo; cerrarlo a mano condona el interés.
- **Fórmula:** `interés_diario = tasa_anual / 100 / 365`; `días = fecha_reclamo − vencimiento`;
  `interés = saldo × interés_diario × días`; `total_reclamo = Σ interés + cargo`.
- **Bordes:** días = 0 → interés 0; exige cuenta de ingreso si hay cargo o interés; la moneda del reclamo debe
  coincidir con la de la cuenta; un pago posterior recalcula los reclamos ligados; reclamo más nuevo reemplaza al
  anterior. **No hay capitalización ni topes legales** en la fuente.
- **Vectores:**
  1. Saldo 150.001,00, tasa 96 % anual, 30 días → 150.001 × 0,96 / 365 × 30 = **11.835,70**.
  2. Saldo 1.000.000,00, 60 %, 45 días → 73.972,60. 3. Saldo 250.000,50, 120 %, 1 día → 821,92.
  4. Reclamo el mismo día del vencimiento → 0,00.
- **Fuente:** ERPN `DUN:283-288` (cálculo), `DUN:290-293` (totales), `DUN:107-109`, `DUN:585-611` (resolución) ·
  GPL-3.0.
- **Ficha:** FC-04. La tasa y la base legal argentina (interés punitorio, tope, IVA sobre intereses) son
  **[A VALIDAR] con el estudio**: no salen de estas fuentes.

## R-C-19 · Niveles de reclamo (gestión de mora)
- **Regla:** la mora se gestiona por niveles: cada nivel se dispara a partir de cierta cantidad de días de
  vencido, con una separación mínima respecto del reclamo anterior, y lleva un cargo fijo. Las facturas en
  disputa se excluyen salvo que se pida incluirlas; un reclamo puede bloquearse para que no escale.
- **Fórmula:** incluir factura sii `días_vencido ≥ días_del_nivel` ∧ ¬en_disputa ∧
  (`veces_reclamada = 0` ∨ `días_desde_último ≥ días_entre_reclamos`); `total_línea = importe_convertido + cargo +
  interés`. Tryton: nivel aplica sii `fecha − vencimiento ≥ plazo_del_nivel`, recorriendo sólo los niveles
  posteriores al actual y saltando los bloqueados.
- **Bordes:** nivel con «mostrar todo lo vencido» ignora la separación mínima (limitación reconocida en el
  código); «mostrar no vencido» incluye lo que vence a futuro; importes negativos (saldos a favor) se listan sin
  cargo.
- **Vectores:** 1. Nivel 1 = 7 días, factura con 10 días, nunca reclamada → entra. 2. Nivel 2 = 30 días con
  separación 15; 35 días de vencida, reclamada hace 10 → no entra. 3. En disputa, 60 días → no entra.
- **Fuente:** IDEM `DRC:201-289`, `DRC:494-526`, `org.adempiere.base/src/org/compiere/model/MDunningRunLine.java:288`
  · GPL-2.0; TRYT `modules/account_dunning/dunning.py:32-45`, `:239-260` · GPL-3.0.
- **Ficha:** FC-04.

---

## Adoptar o no

| Regla | Decisión sugerida | Por qué |
|---|---|---|
| R-C-01, 02, 04, 12 | **Adoptar** | Son el núcleo de «aplicar un cobro a una o varias facturas» (brecha FC-04/05); aritmética simple y testeable; el saldo derivado evita desvíos. |
| R-C-03 | **Adoptar** | Calza con el 70/30 de MIA; «la última cuota es el resto» elimina el centavo suelto. |
| R-C-05 | **Adoptar** | Anticipo como pasivo hasta el evento (A1/A4); sin diferencia de cambio hasta aplicar a factura. |
| R-C-06 | **Adoptar** | NC como medio de cancelación; cubre cancelación/postergación. |
| R-C-07 + R-C-08 | **Adoptar**, con el criterio de iDempiere para la cancelación total | Garantiza cuenta corriente en cero en ambas monedas. Falta definir el tipo de cambio de referencia (provisional a confirmar con el estudio). |
| R-C-09 | **Adoptar simplificado** | Regla propia: residual en ME = 0 ⇒ barrer el residual local a diferencia de cambio; tolerancia fija en centavos. El algoritmo de rangos de Odoo es correcto pero caro de mantener. |
| R-C-10 | **Adoptar** (por comprobante abierto, con reversa) | Exigido por A8; requiere tipo de cambio con historia por día (brecha FC-06). |
| R-C-11 | **Adoptar** | El operador decide abierto/baja; nunca automático. |
| R-C-13 | **No adoptar por ahora** | MIA no lo usa; dejar el campo previsto. |
| R-C-14 | **Adoptar el modelo de estados derivados** | Coincide con cheques diferidos, endoso y Echeq; es el único módulo abierto pensado para Argentina. |
| R-C-15 | **Adoptar** el no asignado y el puntaje | Simple; se combina con `ReglaClasificacionBancoTenant` existente. |
| R-C-16 | **Postergar** | La lógica real no está en código abierto; definir tolerancia propia. |
| R-C-17 | **Adoptar** la columna «a vencer» y el corte por cuota | Contrastar con `src/lib/debts/aging.ts`. |
| R-C-18, 19 | **Adoptar la fórmula, no la política** | Interés simple diario es una base neutra; tasa, tope e IVA dependen del estudio. Niveles: después de la venta. |

## Lo que no se pudo confirmar
- Texto de la licencia de Odoo y versión exacta de la de Tryton (se asume LGPL-3.0 y GPL-3.0) [A VALIDAR].
- Aplicación real de la tolerancia de cobro de Odoo (R-C-16) y el informe de antigüedad de Odoo: están en Enterprise.
- Condición de corte en OFBiz `IS:3392` (posible defecto).
- Funciones SQL de iDempiere de saldo abierto y descuento (`invoiceOpen`, `invoiceDiscount`): no se hallaron en
  la ruta `db/postgresql/functions/` del HEAD; no se leyeron.
- **Documentación pública de SAP (help.sap.com, scope items J59/J60/BFB): no consultada en esta pasada**; ninguna
  regla de este archivo se apoya en SAP.
- Dolibarr (`src/dolibarr`, GPL-3.0) está clonado pero su checkout no trae módulos de pagos o bancos: no se relevó.
- Todo lo fiscal argentino (interés punitorio, FCE MiPyME, retenciones en la orden de pago, tipo de cambio
  BNA/divisa vs. billete) no surge de estas fuentes.

---

## Módulos encontrados

Los clones quedan en `scratchpad/reglas-ref/src/` como referencia; no se copian al ERP. Archivos sueltos extraídos
para lectura (no forman parte del checkout): `scratchpad/reglas-ref/src/_extra/`.

| Repo / ruta | Qué hace | Licencia | ¿Modelo para la ficha? |
|---|---|---|---|
| erpnext `erpnext/accounts/doctype/payment_entry/` | Cobro/pago con renglones de imputación, deducciones, anticipos y diferencia de cambio | GPL-3.0 | **Sí** · FC-04, FC-05 (orden de pago: qué paga, con qué, qué retiene) |
| erpnext `.../payment_reconciliation/` | Cruza cobros, NC y asientos sueltos con facturas abiertas | GPL-3.0 | **Sí** · FC-04, FC-05 (cuenta corriente) |
| erpnext `.../process_payment_reconciliation/` | Conciliación de cobros en lote, en segundo plano | GPL-3.0 | Parcial · FC-04 |
| erpnext `.../unreconcile_payment/` | Deshace una imputación dejando rastro | GPL-3.0 | **Sí** · FC-04, FC-05 |
| erpnext `.../payment_ledger_entry/` | Libro auxiliar de cuenta corriente, separado del mayor | GPL-3.0 | **Sí** · FC-04, FC-05 (auxiliar que cuadra con el rol) |
| erpnext `.../advance_payment_ledger_entry/` | Libro de anticipos contra pedidos | GPL-3.0 | Sí · FC-04 (anticipo como pasivo) |
| erpnext `.../exchange_rate_revaluation/` | Revaluación de saldos en ME con asiento y reversa | GPL-3.0 | **Sí** · FC-06 |
| erpnext `.../currency_exchange_settings/` | Fuente y parámetros del tipo de cambio | GPL-3.0 | Sí · FC-06 (tc con fuente declarada) |
| erpnext `.../payment_term/`, `.../payment_terms_template/` | Plan de cuotas con porcentajes, plazos y descuento | GPL-3.0 | Sí · FC-04 |
| erpnext `.../bank_transaction/` | Movimiento de extracto con importe asignado / no asignado | GPL-3.0 | **Sí** · FC-06 |
| erpnext `.../bank_reconciliation_tool/` | Propone candidatos con puntaje y concilia | GPL-3.0 | **Sí** · FC-06 |
| erpnext `.../bank_statement_import/`, `.../bank_transaction_rule/`, `.../bank_transaction_mapping/` | Importa extractos y clasifica por reglas | GPL-3.0 | Sí · FC-06 |
| erpnext `.../bank_clearance/` | Marca fecha de acreditación de cheques y pagos | GPL-3.0 | Sí · FC-05, FC-06 |
| erpnext `.../cheque_print_template/` | Plantilla de impresión de cheques | GPL-3.0 | No (sólo impresión) |
| erpnext `.../invoice_discounting/`, `.../discounted_invoice/` | Descuento de facturas en el banco | GPL-3.0 | Reserva · FC-06 (similar a descuento de cheques/FCE) |
| erpnext `.../dunning/`, `.../dunning_type/` | Reclamo de mora con interés y cargo | GPL-3.0 | Sí · FC-04 |
| erpnext `erpnext/accounts/report/accounts_receivable/` | Antigüedad de saldos por tramos | GPL-3.0 | **Sí** · FC-04, FC-05 |
| odoo `addons/account/models/account_move_line.py` | Motor de conciliación parcial multimoneda | LGPL-3.0 | **Sí** (referencia de aritmética) · FC-04, FC-06 |
| odoo `addons/account/models/account_partial_reconcile.py`, `account_full_reconcile.py` | Registro de cada cruce parcial y del cierre total | LGPL-3.0 | **Sí** · FC-04, FC-05 (modelo de datos de la aplicación) |
| odoo `addons/account/wizard/account_payment_register.py` | Asistente de cobro: importe por defecto, cuotas, diferencia | LGPL-3.0 | Sí · FC-04, FC-05 |
| odoo `addons/account/models/account_payment_term.py` | Cuotas y descuento por pronto pago | LGPL-3.0 | Sí · FC-04 |
| odoo `addons/account/models/account_bank_statement_line.py` | Línea de extracto y su asiento | LGPL-3.0 | Sí · FC-06 |
| odoo `addons/account/models/account_reconcile_model.py` | Reglas de conciliación y tolerancia (sólo configuración) | LGPL-3.0 | Parcial · FC-06 |
| odoo `addons/account/models/account_cash_rounding.py` | Redondeo de efectivo | LGPL-3.0 | Reserva · FC-06 (caja) |
| odoo `addons/l10n_latam_check/` | Cheques propios y de terceros, diferidos, endoso, anulación | LGPL-3.0 | **Sí** · FC-05 (el mejor modelo para Argentina) |
| odoo-argentina `l10n_ar_bank/` | Datos de bancos argentinos | AGPL-3.0 | Sí · FC-06 (dato maestro) [contenido no leído] |
| odoo-argentina `l10n_ar_tax_payment_method/`, `l10n_ar_tax/` | Retenciones ligadas al medio de pago | AGPL-3.0 | Sí · FC-05 (qué retiene la orden de pago) [no leído; pertenece al área fiscal] |
| ofbiz `applications/accounting/.../invoice/InvoiceServices.java` | Aplicación de pagos a facturas e ítems; control de factura pagada | Apache-2.0 | **Sí** · FC-04, FC-05 (único que admite citar hasta 20 líneas) |
| ofbiz `.../invoice/InvoiceWorker.java`, `.../payment/PaymentWorker.java` | Totales, aplicado, no aplicado y tipo de cambio | Apache-2.0 | **Sí** · FC-04, FC-05 |
| ofbiz `.../groovy/.../payment/PaymentServices.groovy` | Alta de pago y aplicación, anulación de corrida de cheques | Apache-2.0 | Sí · FC-05 [no leído en detalle] |
| ofbiz `applications/accounting/minilang/ledger/GeneralLedgerServices.xml` | Asientos de pago con diferencia de cambio | Apache-2.0 | Parcial · FC-06 |
| ofbiz `applications/accounting/servicedef/services_finaccount.xml` | Movimientos de cuenta financiera y su conciliación | Apache-2.0 | Parcial · FC-06 [sólo se vio el índice de servicios] |
| idempiere `org.adempiere.base/.../model/MAllocationHdr.java`, `MAllocationLine.java` | Documento de asignación: pago, descuento, baja, sobre/falta | GPL-2.0 | **Sí** · FC-04, FC-05 |
| idempiere `org.idempiere.acct/.../doc/Doc_AllocationHdr.java` | Contabiliza la asignación: diferencia realizada, redondeos, impuesto | GPL-2.0 | **Sí** · FC-06 |
| idempiere `org.adempiere.ui/.../apps/form/Allocation.java` | Pantalla de asignación manual | GPL-2.0 | Sí · FC-04, FC-05 (flujo) |
| idempiere `org.adempiere.base.process/.../process/AllocationAuto.java` | Asignación automática de pagos | GPL-2.0 | Sí · FC-04 [no leído en detalle] |
| idempiere `org.idempiere.acct/.../process/InvoiceNGL.java` | Revaluación por factura abierta (no realizada) | GPL-2.0 | **Sí** · FC-06 |
| idempiere `.../process/Aging.java`, `.../model/MAging.java` | Antigüedad por tramos, por factura o por cuota | GPL-2.0 | Sí · FC-04, FC-05 |
| idempiere `.../process/DunningRunCreate.java`, `.../model/MDunning*.java` | Corrida de reclamos por niveles | GPL-2.0 | Sí · FC-04 |
| idempiere `.../process/BankStatementMatcher.java`, `.../model/MBankStatement*.java` | Extracto y emparejado enchufable | GPL-2.0 | Parcial · FC-06 [no leído] |
| idempiere `.../model/MPaySelectionCheck.java`, `.../process/PaySelectionCreateFrom.java` | Selección de facturas a pagar y emisión de cheques | GPL-2.0 | **Sí** · FC-05 (propuesta/orden de pago) [no leído] |
| idempiere `.../model/MConversionRate.java` | Tipos de cambio por fecha y tipo de conversión | GPL-2.0 | **Sí** · FC-06 (historia por día) |
| tryton `modules/account/move.py` | Conciliación con baja y delegación | GPL-3.0 | Parcial · FC-04 |
| tryton `modules/account_statement`, `account_statement_rule` | Extractos y reglas de imputación | GPL-3.0 | Sí · FC-06 [no leído] |
| tryton `modules/account_payment`, `account_payment_clearing`, `account_payment_check` | Órdenes de pago, cuenta puente y cheques | GPL-3.0 | Sí · FC-05 [no leído] |
| tryton `modules/account_deposit`, `sale_advance_payment` | Anticipos de clientes como depósito | GPL-3.0 | Sí · FC-04 [no leído] |
| tryton `modules/account_dunning`, `account_dunning_fee` | Reclamos por niveles y cargo | GPL-3.0 | Sí · FC-04 |
| tryton `modules/account_receivable_rule` | Regla para compensar saldos a cobrar entre cuentas | GPL-3.0 | Reserva · FC-04 [no leído] |
