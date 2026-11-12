# D · Aritmética transversal del ERP (referencia de ERPs de código abierto)

Fecha de lectura: 2026-11-12. Base de cálculo para FC-13, FC-14 y todas las demás fichas.
Nada de esto se copió: las reglas están descriptas con palabras propias. No se ejecutó código de los repos.
Los vectores de prueba fueron calculados a mano para este documento (no salen de los tests de los repos),
salvo donde dice «ejemplo del propio código».

## Fuentes leídas (clones en `reglas-ref/src/`)

| Repo | Rama | Commit | Fecha commit | Licencia |
|---|---|---|---|---|
| odoo/odoo | 20.0 | `53882d6696307bd63504f79ae8aa421b7468a333` | 2026-11-12 | LGPL-3 (`LICENSE`) |
| frappe/frappe | develop | `0c68cdeff2e64d0fe0be84568b515531e2b506a8` | 2026-11-11 | MIT (`LICENSE`) |
| frappe/erpnext | develop | `f9ad32825a24c062c6f534552f1acb36bd3f78f9` | 2026-11-12 | GPL-3 (`license.txt`) |
| apache/ofbiz-framework | trunk | `4f19231088fbe7533154a2afb924e52d5e4106d5` | 2026-11-12 | Apache-2.0 (`LICENSE`) |
| tryton/tryton | main | `688622c64f6e2507bd4f26535b5e01b9d633e6d6` | 2026-11-04 | GPL-3 (por módulo, `modules/*/LICENSE`) |
| Dolibarr/dolibarr | develop | `ba80138913b862c6140b3abdc194609ab1163763` | 2026-11-12 | GPL-3 (`COPYING`) |

Enlace a cualquier cita: `https://github.com/<repo>/blob/<commit>/<archivo>#L<línea>`.
Las rutas de abajo son relativas a la raíz de cada repo.

No consultado: documentación pública de SAP (help.sap.com, scope items). Queda [A VALIDAR] si se la quiere
como contraste; no hizo falta para las reglas.

Convención de los vectores: importes en pesos con coma decimal; entre paréntesis, centavos enteros cuando aclara.

---

## R-D-01 · Tipo de dato: la plata es un entero de centavos, nunca un float

**Regla.** Todo importe se guarda y se opera como entero de la unidad mínima (centavos). Los precios unitarios,
costos unitarios, cantidades, porcentajes y tipos de cambio también son enteros, con su propia escala fija (más
decimales que el importe). El float sólo aparece, si aparece, para mostrar.

**Qué hacen los otros.**
- OFBiz: decimal exacto (BigDecimal) en todo; escala y modo por área en un archivo de propiedades; exige volver a
  fijar la escala después de cada cuenta.
- Tryton: Decimal exacto en importes y precios; las cantidades son float y las pasa a Decimal vía texto antes de
  multiplicar por plata.
- Odoo, ERPNext y Dolibarr: float, con funciones de apoyo que corrigen el error de representación (suman un
  épsilon proporcional al valor antes de redondear). Odoo documenta el caso 2,675, que en binario es 2,67499…
- El ERP GSG ya está del lado correcto: `AsientoLinea` en centavos enteros (catálogo, sección 1.2).

**Fórmula.** `centavos = parsear_texto_decimal(texto) × 100`, sin pasar por float. Escalas propuestas: importe 2,
precio/costo unitario 4, cantidad 3, porcentaje 4, tipo de cambio 6.

**Casos borde.** Texto con separadores locales («1.234,56»); signo negativo; más decimales que la escala (se
redondea con R-D-02, no se trunca); desborde (usar entero de 64 bits o BigInt; no el Number de JS para sumas
grandes); nulo distinto de cero.

**Vectores.**
1. `0,10 + 0,20` → 30 centavos = 0,30 exacto (en float da 0,30000000000000004).
2. «1.234,56» → 123456 centavos.
3. «2,675» a 2 decimales → 268 centavos (con float ingenuo sale 2,67).
4. `1,005 × 100` → 100,5 exacto → 101 (en float da 100,49999999999999 → 100).

**Fuente.** OFBiz `applications/accounting/src/main/java/org/apache/ofbiz/accounting/invoice/InvoiceServices.java:74-90`
(Apache-2.0); OFBiz `applications/accounting/config/arithmetic.properties:24-52` (Apache-2.0); Odoo
`odoo/tools/float_utils.py:121-132` (LGPL-3); Tryton `modules/stock/move.py:780-782` (GPL-3); Frappe
`frappe/utils/data.py:1302-1333` (MIT).

---

## R-D-02 · Redondeo comercial: al medio, alejándose del cero

**Regla.** El redondeo por defecto de plata es «al más cercano; si queda justo en la mitad, hacia afuera del
cero». Es simétrico: lo que vale para una factura vale, con signo cambiado, para su nota de crédito.

**Qué hacen los otros.** Es el default de Odoo (método HALF-UP, definido como «empates lejos del cero»), de OFBiz
(HALF_UP para libro, facturas, pedidos, cuentas financieras e impuesto a las ventas) y de Dolibarr (el `round` de
PHP). ERPNext lo ofrece como «Commercial Rounding», pero no es su default.

**Fórmula (entera).** Para numerador `n` y divisor `d > 0`: `q = signo(n) × piso((2×|n| + d) / (2×d))`.

**Casos borde.** Negativos (en JS `Math.round(-2.5)` da −2: no sirve, hay que operar sobre el valor absoluto);
valor cero; empate exacto; redondear a un paso que no es potencia de 10 (ver R-D-15); redondear dos veces
(redondear a 3 decimales y después a 2 puede dar distinto que una sola vez: 0,1449 → 0,145 → 0,15 contra 0,14).

**Vectores.**
1. 2,675 → 2,68.
2. −2,675 → −2,68.
3. 0,125 → 0,13; 0,135 → 0,14.
4. 2,674 → 2,67.
5. 0,1449 directo a 2 decimales → 0,14 (nunca pasar por 3 decimales).

**Fuente.** Odoo `odoo/tools/float_utils.py:72-153` (LGPL-3); OFBiz `arithmetic.properties:26,32,37,42,52` y
`framework/base/src/main/java/org/apache/ofbiz/base/util/UtilNumber.java:39` (Apache-2.0); Frappe
`frappe/utils/data.py:1302-1333` (MIT); Dolibarr `htdocs/core/lib/functions.lib.php:4823` en adelante (GPL-3).

---

## R-D-03 · Redondeo bancario (al par): dónde aparece y por qué no lo adoptamos

**Regla.** El redondeo bancario manda los empates al dígito par. Reduce el sesgo acumulado en sumas largas, pero
da resultados que el usuario no espera (0,125 → 0,12). Se documenta para reconocerlo al comparar contra otro
sistema; no se usa en el ERP.

**Dónde aplica cada uno (leído).**
- Tryton: el redondeo de moneda usa «al par» por defecto; admite pedir el modo opuesto para compensar.
- ERPNext/Frappe: el default del sistema es «bancario (legado)» si no se configuró otro. Ese modo legado sólo es
  bancario con 0 decimales; con decimales manda el empate hacia arriba (hacia +infinito, no lejos del cero).
- OFBiz: comercial en todo, salvo la amortización de bienes de uso, que usa «al par».
- Odoo y Dolibarr: comercial.

**Fórmula.** Empate → si el dígito anterior es par, queda; si es impar, sube.

**Casos borde.** Sólo difiere del comercial en el empate exacto. Con negativos es simétrico.

**Vectores.**
1. 0,125 → 0,12 (comercial: 0,13).
2. 0,135 → 0,14 (igual que comercial).
3. 2,5 → 2; 3,5 → 4 (a 0 decimales).
4. −2,5 → −2.

**Fuente.** Tryton `modules/currency/currency.py:152-166` (GPL-3); Frappe `frappe/utils/data.py:1262-1300,1336-1357`
(MIT); OFBiz `applications/accounting/src/main/groovy/org/apache/ofbiz/accounting/fixedasset/FixedAssetServices.groovy:272,306`
(Apache-2.0).

---

## R-D-04 · Comparación: exacta entre enteros; la tolerancia se declara

**Regla.** Con centavos enteros, «igual» es igualdad exacta. Toda tolerancia es una regla de negocio con nombre y
valor (por ejemplo «los porcentajes de reparto suman 100 ± 0,10»), no un parche por el float.

**Qué hacen los otros.** Odoo compara redondeando primero cada valor a la precisión y recién después restando;
advierte que eso no equivale a «la diferencia es cero»: 0,006 y 0,002 a 2 decimales son distintos al comparar
(redondean a 0,01 y 0,00) pero su diferencia, 0,004, se considera cero. Tryton considera cero todo importe cuyo
redondeo es menor que el paso de la moneda. ERPNext trata como cero lo que está a menos de 10⁻⁷ en cantidades de
stock y acepta que los porcentajes de un presupuesto sumen 100 con margen de 0,10. Odoo exige que los porcentajes
de una condición de pago sumen 100 a la precisión configurada.

**Fórmula.** `iguales(a, b) ⇔ a = b` (enteros). `dentro_de(a, b, tol) ⇔ |a − b| ≤ tol`, con `tol` entero y con nombre.

**Casos borde.** Comparar importes de escalas distintas (llevar ambos a la misma escala antes); comparar un total
contra la suma de sus partes (deben coincidir exacto si se usó R-D-05); porcentajes que suman 99,99.

**Vectores.**
1. 1,432 contra 1,431 a 2 decimales → iguales (ejemplo del propio código de Odoo).
2. 0,006 contra 0,002 a 2 decimales → distintos, aunque 0,004 «es cero» (ejemplo del propio código de Odoo).
3. Reparto 33,33 + 33,33 + 33,33 = 99,99 con tolerancia 0,10 → se acepta; con tolerancia 0 → se rechaza.
4. Debe 100000 centavos, haber 99999 → asiento rechazado (sin tolerancia).

**Fuente.** Odoo `odoo/tools/float_utils.py:170-260` y `odoo/addons/base/models/res_currency.py:295-330` (LGPL-3);
Tryton `modules/currency/currency.py:169-173` (GPL-3); ERPNext `erpnext/stock/valuation.py:269-275` y
`erpnext/accounts/doctype/budget/budget.py:357-373` (GPL-3); Odoo
`addons/account/models/account_payment_term.py:158-160` (LGPL-3).

---

## R-D-05 · Prorrateo con resto: método del mayor resto

**Regla.** Para repartir un total entero entre partes con pesos: a cada una su parte entera hacia abajo; los
centavos que sobran se entregan de a uno a las partes con mayor fracción descartada. Empate: gana la de menor
orden. La suma de las partes es siempre igual al total.

**Variantes vistas.**
- Mayor resto propiamente dicho: Tryton, al repartir costos de importación entre movimientos (ordena por
  diferencia y suma la unidad mínima); Odoo, al repartir la diferencia de redondeo de impuestos (primero
  proporcional al peso, lo que sobra a los pesos más grandes).
- Corrección acumulada: ERPNext, al repartir un descuento global entre renglones, compara el acumulado exacto con
  el acumulado redondeado y carga la diferencia en el renglón que está procesando.
- El último se lleva el resto: cuotas de una condición de pago en Odoo y Tryton, y última cuota de amortización.
- Rueda: Tryton reparte el resto del redondeo de impuestos de a una unidad recorriendo las líneas en círculo.

**Fórmula.** `base_i = piso(T × p_i / P)`; `r = T − Σ base_i`; sumar 1 a las `r` partes con mayor
`(T × p_i) mod P`. Con `T` negativo: repartir `|T|` y devolver el signo.

**Casos borde.** `P = 0` (error o reparto parejo, decidirlo por regla); pesos negativos (Odoo los separa en dos
grupos); un solo destinatario; total menor que la cantidad de partes (algunas reciben 0); el orden de desempate
tiene que ser estable (id o posición) para que recalcular dé lo mismo.

**Vectores.**
1. 100,00 en 3 partes iguales → 33,34 · 33,33 · 33,33.
2. 10,01 en 2 partes iguales → 5,01 · 5,00.
3. 100,00 con pesos 50/30/20 → 50,00 · 30,00 · 20,00 (sin resto).
4. 0,02 en 3 partes iguales → 0,01 · 0,01 · 0,00.
5. −100,00 en 3 → −33,34 · −33,33 · −33,33.
6. Ejemplo del propio código de Odoo: diferencia 0,03 a 3 decimales con pesos 0,4/0,3/0,3 → 0,012 · 0,009 · 0,009.
7. Variante «último se lleva el resto», 100,00 al 33,33 % / 33,33 % / saldo → 33,33 · 33,33 · 33,34.

**Fuente.** Odoo `addons/account/models/account_tax.py:1856-1922` y
`addons/account/models/account_payment_term.py:214-251` (LGPL-3); Tryton
`modules/account_stock_landed_cost/account.py:314-342`, `modules/account/tax.py:1265-1285` y
`modules/account_invoice/payment_term.py:49-78` (GPL-3); ERPNext
`erpnext/controllers/taxes_and_totals.py:1048-1115` (GPL-3).

---

## R-D-06 · Descuentos en cascada

**Regla.** Varios descuentos porcentuales sobre un mismo precio se multiplican, no se suman: 10 % + 5 % no es
15 %. Se redondea una sola vez, al final. Un descuento global del comprobante se reparte entre los renglones en
proporción a su neto (R-D-05).

**Qué hacen los otros.**
- ERPNext: precio de lista → se le aplica el margen (porcentaje o importe) → sobre ese resultado, el descuento
  porcentual; el importe del descuento se redondea a la precisión del campo. Si el usuario escribe el precio a
  mano, deduce si fue margen (precio mayor al de lista) o descuento.
- Dolibarr: por defecto descuenta sobre el total del renglón sin redondear; con una opción, descuenta sobre el
  unitario, redondea, y recién multiplica por la cantidad.
- Odoo (listas de precios): precio base × (1 − descuento) → redondeo a un paso configurable → más recargo fijo →
  tope por margen mínimo y máximo.
- Tryton: guarda precio base y precio final; la tasa se deduce como 1 − final/base.

**Fórmula.** `final = redondear(precio × Π(1 − d_i))`. Tasa equivalente: `1 − Π(1 − d_i)`.

**Casos borde.** Redondear entre pasos cambia el resultado (vector 4); descuento de 100 %; descuento mayor a
100 % o negativo (es un recargo: validarlo); precio base cero (la tasa deducida queda indefinida); orden de
«margen y después descuento» contra «descuento y después margen» cuando uno es importe fijo.

**Vectores.**
1. 100,00 con 10 % y 5 % → 85,50 (no 85,00).
2. 1.000,00 con 20 %, 10 % y 5 % → 684,00 (tasa equivalente 31,6 %).
3. 99,99 con 10 % y 10 % → 80,9919 → 80,99.
4. 0,05 con 50 % y 50 %: una sola vez → 0,0125 → 0,01; redondeando en cada paso → 0,03 → 0,02. Vale la primera.
5. Descuento global de 10,00 sobre renglones de 33,33 · 33,33 · 33,34 → 3,33 · 3,33 · 3,34.

**Fuente.** ERPNext `erpnext/controllers/taxes_and_totals.py:211-250,1048-1115,1395-1405` (GPL-3); Dolibarr
`htdocs/core/lib/price.lib.php:203-209` (GPL-3); Odoo `addons/product/models/product_pricelist_item.py:287-305`
(LGPL-3); Tryton `modules/sale_discount/sale.py:79-84` (GPL-3).

---

## R-D-07 · Total de la factura: por renglón contra por total

**Regla.** Hay dos maneras de calcular el impuesto y no dan lo mismo: redondear renglón por renglón y sumar, o
sumar las bases por alícuota, calcular el impuesto sobre el total y redondear una vez. La segunda es la que
coincide con «base × alícuota» del comprobante. Se elige una para todo el sistema y, si se muestra impuesto por
renglón, la diferencia se reparte con R-D-05.

**Qué hacen los otros.**
- Odoo: opción por empresa con los dos modos; el default es global («por impuesto»). En el modo global reparte la
  diferencia entre las líneas de detalle.
- Tryton: opción con los dos modos; el default es por documento.
- Dolibarr: por defecto suma renglones redondeados; una opción invierte el criterio y ajusta renglones.
- OFBiz: calcula impuesto con 3 decimales y cierra con 2.
- ERPNext: redondea cada renglón a la precisión del campo y arrastra el total acumulado fila a fila.
- Precio con impuesto incluido (Odoo): neto = precio / (1 + suma de alícuotas). Dolibarr saca el impuesto por
  diferencia (total con impuesto menos neto) para que la suma cierre.

**Fórmula.** Global: `iva_a = redondear(Σ base_i(a) × a)` para cada alícuota `a`. Incluido:
`neto = redondear(bruto / (1 + a))`, `iva = bruto − neto`.

**Casos borde.** Muchos renglones chicos (vector 3); alícuotas distintas en el mismo comprobante (se agrupa por
alícuota, nunca todo junto); exentos y no gravados; precio final con IVA incluido (el redondeo cae en el neto);
notas de crédito parciales (deben poder espejar el original).

**Vectores (IVA 21 %).**
1. Dos renglones de 0,50: por renglón 0,11 + 0,11 = 0,22; global 1,00 × 21 % = 0,21.
2. Tres renglones de 33,33: por renglón 7,00 × 3 = 21,00; global 99,99 × 21 % = 20,9979 → 21,00 (coinciden).
3. Diez renglones de 0,02: por renglón 0,00; global 0,20 × 21 % = 0,042 → 0,04.
4. Incluido, 121,00 → neto 100,00, IVA 21,00.
5. Incluido, 100,00 → neto 82,64, IVA 17,36 (por diferencia).

**Fuente.** Odoo `addons/account/models/company.py:133-135`, `addons/account/models/account_tax.py:1085-1110`,
`:1165-1225`, `:1924-2020` (LGPL-3); Tryton `modules/account/configuration.py:172-176` y
`modules/account/tax.py:1265-1330` (GPL-3); Dolibarr `htdocs/core/class/commonobject.class.php:4442-4476` y
`htdocs/core/lib/price.lib.php:302-331` (GPL-3); OFBiz `arithmetic.properties:50-52` y
`applications/order/src/main/java/org/apache/ofbiz/order/order/OrderReadHelper.java:70-73` (Apache-2.0).

[A VALIDAR] Qué tolerancia aplica ARCA entre el IVA informado y base × alícuota: no está en estas fuentes.

---

## R-D-08 · Conversión de moneda y doble redondeo

**Regla.** Se convierte una sola vez, con el tipo de cambio del documento, y se guardan los tres datos: importe
de origen, tipo de cambio e importe convertido. Nunca se reconvierte un importe ya convertido. La suma de
renglones convertidos puede no coincidir con el total convertido: esa diferencia se asigna de forma explícita.

**Qué hacen los otros.**
- Odoo: importe × tasa, redondeado a la moneda destino; permite pedir el resultado sin redondear para cuentas
  intermedias. Las tasas se guardan sin tope de decimales.
- Tryton: importe × tasa destino / tasa origen, redondeo al final, también opcional. La tasa es decimal exacto.
- ERPNext: redondea el valor en moneda del documento y lo multiplica por la tasa, redondeando otra vez (doble
  redondeo aceptado, porque el valor del documento es el que manda).
- OFBiz: deduce la tasa dividiendo con 100 dígitos, pero después la recorta a la escala de la factura (2
  decimales). Es el antiejemplo: una tasa recortada a 2 decimales pierde precisión.
- Las condiciones de pago de Odoo llevan dos restos en paralelo, uno por moneda.

**Fórmula.** `destino = redondear(origen × tc)`. Diferencia: `d = redondear(Σ origen × tc) − Σ redondear(origen_i × tc)`.

**Casos borde.** Tasa cero o ausente (error, no cero); tasa inversa (1/tc no es exacta: guardar la tasa en el
sentido en que se cotiza); ida y vuelta (vector 3); asiento en moneda extranjera: debe = haber en cada moneda
por separado (invariante I1 del catálogo); cobro con tasa distinta a la de la factura (diferencia de cambio, no
de redondeo).

**Vectores.**
1. USD 10,01 a 1.045,50 → 10.465,455 → ARS 10.465,46.
2. Tres renglones de USD 0,33 a 1.000,50: 330,17 × 3 = 990,51; total USD 0,99 → 990,495 → 990,50. Diferencia 0,01.
3. Ida y vuelta: ARS 1.000,00 / 1.045,50 → USD 0,96 → × 1.045,50 = ARS 1.003,68. No es 1.000,00.
4. Tasa ausente → error «falta cotización», no importe cero.

**Fuente.** Odoo `odoo/addons/base/models/res_currency.py:345-372,66-73` y
`addons/account/models/account_payment_term.py:214-251` (LGPL-3); Tryton `modules/currency/currency.py:176-203,250-253`
(GPL-3); ERPNext `erpnext/controllers/taxes_and_totals.py:338-344` (GPL-3); OFBiz
`applications/accounting/src/main/java/org/apache/ofbiz/accounting/invoice/InvoiceWorker.java:585-640` (Apache-2.0).

---

## R-D-09 · Costo promedio ponderado contra FIFO

**Regla (promedio).** Cada ingreso recalcula el costo: valor total nuevo sobre cantidad total nueva. Las salidas
no cambian el promedio; salen al promedio vigente. Si el stock estaba en cero o negativo, el costo pasa a ser el
del ingreso. Conviene guardar valor total y cantidad, y deducir el promedio: así no se pierden centavos.

**Regla (FIFO).** Cada ingreso es una capa (cantidad, costo). La salida consume las capas más viejas primero; su
costo es la suma de lo consumido.

**Qué hacen los otros.**
- Promedio, misma fórmula en los cinco: Odoo (lleva valor y cantidad acumulados), ERPNext, Tryton (redondea a 4
  decimales), Dolibarr (redondea a la precisión de precio unitario), OFBiz (decimales y modo configurables).
- Stock no positivo antes del ingreso: todos toman el costo del ingreso.
- FIFO: ERPNext con cola de capas (fusiona la capa nueva si tiene el mismo costo; con stock negativo deja una
  capa negativa al último costo). Tryton marca en cada ingreso cuánto ya se consumió y promedia lo consumido.
  Odoo tiene una rutina propia con pila de capas.

**Fórmula.** Promedio: `c' = (q × c + q_in × c_in) / (q + q_in)` si `q > 0`; si no, `c' = c_in`.
Salida: `valor_salida = redondear(q_out × V / Q)`; si `q_out = Q`, sale todo `V`.

**Casos borde.** Stock negativo; ingreso a costo cero; devolución a proveedor (sale al costo de la compra, no al
promedio, y mueve el promedio); corrección retroactiva (obliga a recalcular hacia adelante); cambio de unidad de
medida; el último centavo al vaciar el stock.

**Vectores.**
1. 10 u a 100,00 + 10 u a 120,00 → promedio 110,00.
2. Stock 0 + 5 u a 80,00 → 80,00. Stock −2 + 5 u a 80,00 → 80,00.
3. 3 u a 10,00 + 1 u a 10,01 → valor 40,01, promedio 10,0025. Sale 1 → 10,00; quedan 30,01. Salen 3 → 30,01.
4. FIFO, capas [10 u a 100,00; 10 u a 120,00], salen 15 → costo 1.600,00; queda 5 u a 120,00 = 600,00.
5. FIFO, capas [1 u a 10,00; 1 u a 10,01], sale 1 → 10,00; queda 10,01.

**Fuente.** Odoo `addons/stock_account/models/product.py:375-506` (promedio) y `:509-600` (FIFO) (LGPL-3); ERPNext
`erpnext/stock/stock_ledger.py:2220-2257` y `erpnext/stock/valuation.py:55-160` (GPL-3); Tryton
`modules/stock/move.py:769-793` y `modules/product_cost_fifo/move.py:75-106` (GPL-3); Dolibarr
`htdocs/product/stock/class/mouvementstock.class.php:589-657` (GPL-3); OFBiz
`applications/product/src/main/groovy/org/apache/ofbiz/product/product/cost/CostServices.groovy:428-475` (Apache-2.0).

---

## R-D-10 · Amortización lineal

**Regla.** Cuota = (valor de origen − valor residual) / cantidad de períodos. Cada cuota se redondea; la última
se lleva la diferencia, para que lo amortizado sea exactamente el valor amortizable. Nunca se amortiza por debajo
del residual.

**Qué hacen los otros.**
- Tryton: mensual o anual; el primer y el último período se prorratean por días (el divisor es «períodos enteros
  más las dos fracciones»); trata febrero bisiesto como de 28 días; redondea cada cuota a la moneda; si sobra
  resto, lo suma a la última línea; si la cuota supera lo que falta, corta.
- ERPNext: valor amortizable sobre períodos pendientes; variante diaria; al final ajusta para que el saldo sea el
  valor esperado al fin de la vida útil.
- OFBiz: sólo anual, por diferencia de años; redondea al par a 2 decimales; recalcula la próxima cuota con lo ya
  amortizado.
- Odoo Community no trae el módulo de bienes de uso (es de la edición paga): no hay nada que leer ahí.

**Fórmula.** `cuota = redondear((V − R) / n)`; `última = (V − R) − cuota × (n − 1)`.

**Casos borde.** `n = 0` (error); `R ≥ V` (no hay nada que amortizar); alta a mitad de mes (prorrateo por días o
criterio «mes de alta completo», decidirlo); baja anticipada; revalúo o mejora (recalcula sobre saldo y
períodos restantes); ajuste por inflación (fuera de esta regla).

**Vectores.**
1. 1.000.000,00, residual 0, 36 meses → 35 cuotas de 27.777,78 y la última de 27.777,70.
2. 120.000,00, residual 20.000,00, 10 años → 10.000,00 por año.
3. 100,00, residual 0, 3 meses → 33,33 · 33,33 · 33,34.
4. Valor 50.000,00, residual 50.000,00 → sin cuotas.

**Fuente.** Tryton `modules/account_asset/asset.py:418-498` (GPL-3); ERPNext
`erpnext/assets/doctype/asset_depreciation_schedule/depreciation_methods.py:15-46` y
`.../deppreciation_schedule_controller.py:446-460` (GPL-3); OFBiz `FixedAssetServices.groovy:253-310` (Apache-2.0).

---

## R-D-11 · Margen y markup

**Regla.** Son dos porcentajes distintos sobre la misma ganancia. Margen = ganancia sobre la **venta**. Markup =
ganancia sobre el **costo**. Siempre se dice cuál es.

**Qué hacen los otros.**
- Dolibarr calcula los dos y los nombra distinto (tasa de margen sobre el costo, tasa de marca sobre la venta);
  usa el precio con descuento del renglón; trata aparte el precio negativo; no divide si el divisor es cero.
- Odoo (margen de ventas): margen = subtotal − costo × cantidad; porcentaje sobre el subtotal, a 4 decimales;
  vacío si el subtotal es cero. Permite ir al revés: dado el margen, despeja el precio; rechaza margen de 100 %
  con costo distinto de cero.
- ERPNext (informe de ganancia bruta): porcentaje sobre el valor absoluto de la venta; cero si la venta es cero.
  En renglones, «margen» es un recargo sobre el precio de lista (o sea, un markup).

**Fórmula.** `ganancia = venta − costo`; `margen% = ganancia / venta`; `markup% = ganancia / costo`.
Paso de uno a otro: `markup = m / (1 − m)`; `margen = k / (1 + k)`. Precio desde costo: `costo / (1 − m)` o
`costo × (1 + k)`.

**Casos borde.** Venta cero (margen indefinido → vacío, no 0 ni infinito); costo cero (markup indefinido);
margen de 100 % con costo; notas de crédito (venta negativa); costo en otra moneda (convertir a la fecha de la
venta); margen negativo.

**Vectores.**
1. Venta 150,00, costo 100,00 → ganancia 50,00; margen 33,33 %; markup 50,00 %.
2. Costo 100,00 con margen 20 % → precio 125,00. Con markup 20 % → precio 120,00.
3. Venta 0,00, costo 100,00 → ganancia −100,00; margen vacío; markup −100,00 %.
4. Venta 80,00, costo 100,00 → margen −25,00 %; markup −20,00 %.

**Fuente.** Dolibarr `htdocs/margin/lib/margins.lib.php:119-161` (GPL-3); Odoo
`addons/sale_margin/models/sale_order_line.py:59-101` (LGPL-3); ERPNext
`erpnext/accounts/report/gross_profit/gross_profit.py:230,276` y `erpnext/controllers/taxes_and_totals.py:1395-1405`
(GPL-3).

---

## R-D-12 · Comisiones

**Regla.** Comisión = base × porcentaje. Lo que define la comisión es la **base** (venta neta, margen o cobrado)
y el **momento** en que se devenga (al facturar o al cobrar). Si la reparten varios, se reparte con R-D-05 y los
porcentajes de reparto suman 100. La nota de crédito genera comisión negativa.

**Qué hacen los otros.**
- ERPNext: base = suma del neto, en moneda de la empresa, de los renglones marcados como comisionables. Comisión
  total = base × porcentaje, con el porcentaje entre 0 y 100. Equipo de ventas: a cada vendedor se le asigna
  base × su porcentaje de participación, y su incentivo es eso × su propia tasa. La participación debe sumar 100.
- Tryton: plan de comisión con fórmula libre evaluada con decimales exactos sobre el importe del renglón de
  factura; convierte a la moneda del agente sin redondear en el medio y redondea a 4 decimales. El plan define si
  se devenga al contabilizar la factura o al cobrarla (default: al contabilizar).

**Fórmula.** `comisión = redondear(base × p)`; reparto: mayor resto sobre `comisión` con pesos de participación.

**Casos borde.** Base cero o negativa; porcentaje fuera de 0–100; cobro parcial (FC-13 pide «proyecto cobrado
entero y evento hecho»: con cobro parcial la comisión es 0, no proporcional); anulación después de liquidada
(contraasiento, no borrar); base «margen» con costos que entran tarde; tope por productor.

**Vectores.**
1. Base 100.000,00 al 5 % → 5.000,00.
2. Base 333,33 al 3,5 % → 11,66655 → 11,67.
3. Comisión 1.000,01 entre dos productores 50/50 → 500,01 · 500,00.
4. Nota de crédito de −100.000,00 al 5 % → −5.000,00.
5. Regla FC-13, proyecto de 100.000,00 cobrado 50.000,00 → comisión devengada 0,00; al cobrarse entero → 5.000,00.

**Fuente.** ERPNext `erpnext/controllers/selling_controller.py:259-317` (GPL-3); Tryton
`modules/commission/commission.py:234-245,247-326` y `modules/commission/invoice.py:156-195` (GPL-3).

[A VALIDAR] Cómo prorratea Tryton la comisión ante un cobro parcial en modo «al cobrar» (no leído en detalle).

---

## R-D-13 · Presupuesto contra real: desvío y división por cero

**Regla.** Desvío absoluto = real − presupuesto (se fija el signo una vez y se documenta). Desvío porcentual =
desvío / |presupuesto|. Si el presupuesto es cero no hay porcentaje: se muestra vacío («sin presupuesto»), nunca
0 %, infinito ni error. El presupuesto anual se reparte por mes con R-D-05.

**Qué hacen los otros.**
- Tryton: porcentaje = real / total presupuestado, a 4 decimales; vacío si el total es cero; 0 si no hay real.
  Reparte por período con un coeficiente (parejo = 1 / cantidad de períodos).
- ERPNext: el informe muestra desvío = presupuesto − real (signo contrario al propuesto acá). Reparte por
  período con porcentajes a 3 decimales; exige que sumen 100 con margen de 0,10; controla lo acumulado y puede
  frenar, avisar o ignorar. Tiene una división «segura» que devuelve 0 si el divisor es cero.
- Informes de margen: mismo criterio de vacío o cero ante divisor cero (R-D-11).

**Fórmula.** `desvío = real − pres`; `desvío% = desvío / |pres|` si `pres ≠ 0`; si no, vacío.
Ejecución: `real / pres`.

**Casos borde.** Presupuesto cero con real distinto de cero; ambos cero; presupuesto negativo (ingresos con
signo contrario: dividir por el valor absoluto); sentido «bueno» del desvío distinto en ingresos y en gastos;
períodos cerrados; versiones del presupuesto (comparar contra la vigente a la fecha); devolver 0 por división
por cero esconde el problema (por eso vacío).

**Vectores.**
1. Presupuesto 100.000,00, real 120.000,00 → desvío +20.000,00; +20,00 %; ejecución 120,00 %.
2. Presupuesto 0,00, real 5.000,00 → desvío +5.000,00; porcentaje vacío.
3. Presupuesto 0,00, real 0,00 → desvío 0,00; porcentaje vacío.
4. Presupuesto 80.000,00, real 60.000,00 → desvío −20.000,00; −25,00 %.
5. Anual 1.000.000,00 en 12 meses → 4 meses de 83.333,34 y 8 de 83.333,33.

**Fuente.** Tryton `modules/account_budget/account.py:66-78,525-533,598-606` (GPL-3); ERPNext
`erpnext/accounts/doctype/budget/budget.py:277-279,300-311,353-373` y
`erpnext/accounts/report/budget_variance_report/budget_variance_report.py:95,248,253` (GPL-3); Frappe
`frappe/utils/data.py:1373-1384` (MIT).

---

## R-D-14 · Importe del renglón: cantidad × precio, con más decimales adentro que afuera

**Regla.** El precio unitario y el costo llevan más decimales que el importe. El importe del renglón se redondea
una vez, al multiplicar. No se redondea el unitario para después multiplicar.

**Qué hacen los otros.** Dolibarr separa precisión de unitarios (habitual 5) de la de totales (habitual 2) y una
tercera para stock. Tryton usa 4 decimales de precio. OFBiz usa 4 para factura de compra y para el libro («un
dígito más que cualquier otro redondeo financiero») y 2 para venta. ERPNext redondea cada campo a su precisión y
deja sin redondear las tasas de valuación y el factor de conversión.

**Fórmula.** `importe = redondear(cantidad × precio_unitario)`.

**Casos borde.** Cantidad fraccionaria (kilos, horas); precio con IVA incluido cargado por el usuario (el neto
unitario necesita los 4 decimales para volver al mismo bruto); cantidad cero o negativa (devolución).

**Vectores.**
1. 3 × 33,3333 → 99,9999 → 100,00 (redondeando antes el unitario a 33,33 daría 99,99).
2. 0,333 kg × 1.500,00 → 499,50.
3. 1,5 × 0,01 → 0,015 → 0,02.
4. −2 × 10,005 → −20,01.

**Fuente.** Dolibarr `htdocs/core/lib/functions.lib.php:4905-4945` y `htdocs/core/lib/price.lib.php:302-331` (GPL-3);
Tryton `modules/product/product.py:51-59` y `modules/product/ir.py:8` (GPL-3); OFBiz `arithmetic.properties:23-31`
(Apache-2.0); ERPNext `erpnext/controllers/taxes_and_totals.py:260-286` (GPL-3).

---

## R-D-15 · Redondeo de caja (a la moneda o billete más chico)

**Regla.** El total a pagar en efectivo puede redondearse a un paso mayor que el centavo. La diferencia no se
pierde ni se mete en un renglón: va a un concepto propio, «ajuste por redondeo», y el total del comprobante es
suma + ajuste.

**Qué hacen los otros.** Frappe/ERPNext: redondea el total general a la fracción mínima de la moneda; guarda el
total redondeado y el ajuste por separado, en ambas monedas. En el empate exacto baja (compara «mayor que la
mitad», estricto), distinto del redondeo comercial. Odoo: su redondeo admite un paso arbitrario (ejemplo del
código: 1,3 con paso 0,5 → 1,5) y su condición de pago lleva la diferencia de redondeo de caja.

**Fórmula.** `resto = total mod paso`; si `resto × 2 ≥ paso` sube, si no baja (propuesta: empate sube, coherente
con R-D-02). `ajuste = redondeado − total`.

**Casos borde.** Sólo para efectivo (transferencia y Mercado Pago van al centavo); notas de crédito; pagos
parciales (se redondea cada pago, no el saldo); el comprobante fiscal informa el total sin ajuste [A VALIDAR].

**Vectores (paso 0,05).**
1. 1.234,56 → 1.234,55; ajuste −0,01.
2. 1.234,58 → 1.234,60; ajuste +0,02.
3. 1.234,55 → 1.234,55; ajuste 0,00.
4. Paso 10,00: 1.234,56 → 1.230,00; ajuste −4,56. 1.235,00 → 1.240,00 con la propuesta (ERPNext daría 1.230,00).

**Fuente.** Frappe `frappe/utils/data.py:1360-1400` (MIT); ERPNext `erpnext/controllers/taxes_and_totals.py:968-995`
(GPL-3); Odoo `odoo/tools/float_utils.py:104-117` y `addons/account/models/account_payment_term.py:66-75,240-248`
(LGPL-3).

---

## Recomendación: UNA política de redondeo y precisión para todo el ERP

**Política.**
1. **Tipo.** Todo importe es un entero de centavos (ya es así en el libro). Precio y costo unitario: entero a 4
   decimales. Cantidad: entero a 3 decimales. Porcentaje: entero a 4 decimales. Tipo de cambio: entero a 6
   decimales. Ningún float en ninguna cuenta de plata.
2. **Redondeo.** Uno solo: al medio, alejándose del cero (comercial). Se aplica una única vez, al final de cada
   cálculo, con aritmética entera. Ni bancario, ni truncado, ni redondeos intermedios.
3. **Repartos.** Siempre mayor resto con desempate estable. La suma de las partes es el total, sin excepciones.
4. **Impuestos.** Por alícuota a nivel comprobante (base total × alícuota, un redondeo), y de ahí a los
   renglones por mayor resto.
5. **Moneda.** Se convierte una vez; se guardan origen, tipo de cambio y convertido; la diferencia de suma va a
   un concepto explícito.
6. **Porcentajes de informe.** 2 decimales para mostrar; divisor cero → vacío.
7. **Comparación.** Igualdad exacta; tolerancias sólo con nombre y valor.

**Por qué.**
- El entero elimina de raíz el problema que Odoo, ERPNext y Dolibarr parchean con un épsilon, y es lo que OFBiz y
  Tryton resuelven con decimales exactos. El libro del ERP ya lo usa: extenderlo evita tener dos aritméticas.
- El comercial es el default de tres de los cinco (Odoo, OFBiz, Dolibarr), es lo que espera un usuario que
  controla con calculadora y es simétrico: la nota de crédito es el espejo exacto de la factura. El bancario
  sólo gana en sumas enormes de empates, que con mayor resto ya no existen.
- Un solo redondeo al final evita el doble redondeo (R-D-02 vector 5, R-D-06 vector 4, R-D-08 vector 3).
- El mayor resto garantiza los invariantes I1 e I2 del catálogo (debe = haber; control = auxiliar) sin cuentas
  de ajuste.
- El modo global de impuestos es el default de Odoo y de Tryton y es el que coincide con base × alícuota.

**A validar antes de adoptar.** Tolerancia de ARCA en IVA por alícuota; si el redondeo de caja se informa en el
comprobante fiscal; escala del tipo de cambio que exige ARCA en comprobantes en moneda extranjera.

---

## Módulos encontrados

| Repo / ruta | Qué hace | Licencia | ¿Modelo para ficha FC? |
|---|---|---|---|
| odoo `odoo/tools/float_utils.py` | Redondeo, comparación, cero y división entera con precisión | LGPL-3 | Sí, transversal: lista de casos borde y de modos |
| odoo `odoo/addons/base/models/res_currency.py` | Moneda: redondeo, comparación, conversión, tasas por fecha | LGPL-3 | Sí, multimoneda (invariante I1) |
| odoo `addons/account/models/account_tax.py` | Motor de impuestos: por renglón o global, incluido o no, reparto de diferencias | LGPL-3 | Sí, es el mejor modelo de reparto de centavos |
| odoo `addons/account/models/account_payment_term.py` | Cuotas por porcentaje, saldo en la última, pronto pago | LGPL-3 | Sí, cuotas y vencimientos |
| odoo `addons/stock_account/models/product.py` | Valuación: promedio y FIFO, corrección retroactiva | LGPL-3 | Sí, costo de stock |
| odoo `addons/sale_margin/models/` | Margen por renglón y por pedido, despeje del precio | LGPL-3 | Sí, FC-13 (margen) |
| odoo `addons/product/models/product_pricelist_item.py` | Lista de precios: descuento, redondeo, recargo, topes de margen | LGPL-3 | Parcial, precios |
| odoo `addons/analytic/models/analytic_mixin.py` | Distribución analítica por porcentajes | LGPL-3 | Parcial, FC-13 (dimensión productor), no leído a fondo |
| frappe `frappe/utils/data.py` | `flt`, tres modos de redondeo, división segura, redondeo a fracción mínima | MIT | Sí, transversal; se puede citar |
| erpnext `erpnext/controllers/taxes_and_totals.py` | Totales del comprobante: renglón, impuestos, descuento global, total redondeado | GPL-3 | Sí, descuento global y redondeo de caja |
| erpnext `erpnext/controllers/selling_controller.py` | Comisión de socio de ventas y de equipo de ventas | GPL-3 | Sí, FC-13 (comisiones) |
| erpnext `erpnext/stock/valuation.py`, `stock_ledger.py` | Colas FIFO/LIFO y promedio móvil | GPL-3 | Sí, costo de stock |
| erpnext `erpnext/assets/doctype/asset_depreciation_schedule/` | Cuadro de amortización: lineal, diaria, saldo decreciente | GPL-3 | Sí, bienes de uso |
| erpnext `erpnext/accounts/doctype/budget/` | Presupuesto por cuenta y dimensión, reparto por período, control al imputar | GPL-3 | Sí, FC-14 (el más completo) |
| erpnext `erpnext/accounts/report/budget_variance_report/` | Informe de desvío por período | GPL-3 | Sí, FC-14 |
| erpnext `erpnext/accounts/report/gross_profit/`, `profitability_analysis/` | Ganancia bruta por varias dimensiones, incluido proyecto | GPL-3 | Sí, FC-13 (rentabilidad por proyecto) |
| ofbiz `applications/accounting/config/arithmetic.properties` | Decimales y modo de redondeo por área | Apache-2.0 | Sí, modelo de «política en un solo lugar» |
| ofbiz `framework/base/.../util/UtilNumber.java` | Lee la política de redondeo y la entrega al código | Apache-2.0 | Sí, transversal; se puede citar |
| ofbiz `applications/accounting/.../invoice/InvoiceServices.java`, `InvoiceWorker.java` | Facturación desde pedido, prorrateo de ajustes, tasa de conversión | Apache-2.0 | Parcial (la tasa a 2 decimales es antiejemplo) |
| ofbiz `applications/accounting/.../fixedasset/FixedAssetServices.groovy` | Amortización lineal y de doble saldo decreciente, anual | Apache-2.0 | Parcial, demasiado simple |
| ofbiz `applications/product/.../cost/CostServices.groovy` | Costo promedio al recibir mercadería | Apache-2.0 | Parcial |
| ofbiz `applications/order/.../OrderReadHelper.java` | Totales y ajustes del pedido, impuesto con 3 y 2 decimales | Apache-2.0 | Parcial |
| tryton `modules/currency/` | Moneda con decimales exactos, redondeo y conversión | GPL-3 | Sí, multimoneda |
| tryton `modules/account/tax.py` | Impuestos por renglón o por documento, compensación del resto | GPL-3 | Sí |
| tryton `modules/account_invoice/payment_term.py` | Condición de pago con línea de resto obligatoria | GPL-3 | Sí, cuotas |
| tryton `modules/account_asset/` | Amortización lineal mensual o anual con prorrateo por días | GPL-3 | Sí, bienes de uso (el más claro) |
| tryton `modules/stock/move.py`, `modules/product_cost_fifo/` | Costo promedio y FIFO | GPL-3 | Sí |
| tryton `modules/account_stock_landed_cost/` | Reparto de costos de importación por valor, con mayor resto | GPL-3 | Sí, modelo de prorrateo |
| tryton `modules/commission/` | Agentes, planes con fórmula, devengamiento al facturar o al cobrar | GPL-3 | Sí, FC-13 (el mejor modelo de comisión) |
| tryton `modules/account_budget/` | Presupuesto por cuenta y período, porcentaje ejecutado | GPL-3 | Sí, FC-14 |
| tryton `modules/sale_discount/` | Precio base, tasa e importe de descuento por renglón | GPL-3 | Parcial |
| tryton `modules/analytic_account/` | Contabilidad analítica | GPL-3 | Parcial, FC-13; no leído a fondo |
| tryton `modules/stock/stock_reporting_margin.py`, `modules/commission/stock_reporting_margin.py` | Informe de margen, con y sin comisión | GPL-3 | Parcial, FC-13; visto, no leído |
| dolibarr `htdocs/core/lib/price.lib.php` | Total del renglón: neto, impuestos, con y sin impuesto incluido | GPL-3 | Sí, renglón de factura |
| dolibarr `htdocs/core/lib/functions.lib.php` (`price2num`) | Parseo y redondeo por clase de dato | GPL-3 | Sí, transversal |
| dolibarr `htdocs/core/class/commonobject.class.php` (`update_price`) | Total del documento y ajuste de diferencias | GPL-3 | Parcial |
| dolibarr `htdocs/margin/lib/margins.lib.php` | Margen y markup por renglón | GPL-3 | Sí, FC-13 |
| dolibarr `htdocs/product/stock/class/mouvementstock.class.php` | Movimiento de stock y precio medio ponderado | GPL-3 | Parcial |

Notas del inventario:
- En `src/` hay además `idempiere` e `ingadhoc`, clonados por otro agente: no los toqué ni los leí.
- Los clones son dispersos; otro agente cambió el conjunto disperso de algunos y yo agregué carpetas sin quitar
  las suyas.
- Odoo Community no incluye el módulo de bienes de uso ni ningún módulo de presupuesto: confirmado en el árbol
  del commit leído (no hay `addons/account_asset` ni carpetas con «budget»). Que existan en la edición paga queda
  [A VALIDAR]; ese código no es abierto y no se consulta.
