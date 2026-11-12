# B · Impuestos argentinos: reglas y aritmética extraídas de ERPs de código abierto

Fecha de lectura: 12/11/2026. Fichas: FC-07, FC-08, FC-09, FC-10.

## Cómo leer este archivo

- Todo está **descrito con palabras propias**. No hay código copiado. Los clones quedan en `reglas-ref/src/` como
  referencia; no se ejecutó nada.
- Los vectores de prueba los calculé a mano con la fórmula de cada regla; **no** salen de correr el código fuente.
- «provisional a confirmar» = el valor depende de una norma vigente y lo tiene que confirmar el estudio.
- [A VALIDAR] = no lo pude confirmar en una fuente leída de primera mano.
- Redondeo: salvo aclaración, «redondear» es a 2 decimales, mitad hacia arriba.

### Fuentes leídas (commit y fecha del clon)

| Sigla | Repo | Commit | Licencia |
|---|---|---|---|
| ODOO | `odoo/odoo`, `addons/l10n_ar` y `addons/l10n_ar_withholding` | `53882d66` (12/11/2026) | LGPL-3 |
| ADHOC | `ingadhoc/odoo-argentina` | `234efae3` (10/11/2026) | AGPL-3 |
| ERPN | `frappe/erpnext`, `erpnext/controllers/taxes_and_totals.py` | `f9ad3282` (12/11/2026) | GPL-3 |
| LAR | `comitsrl/lar_361` (Localización Argentina de ADempiere 3.6.1) | `8668ea9f` (13/09/2026) | GPL-2 |

### Lo que NO pude leer

- **Normas oficiales:** `servicios.infoleg.gob.ar`, `www.ca.gob.ar` e `iprofesional.com` no resuelven desde esta sesión
  (están fuera de los dominios de red permitidos). Todo artículo de la RG 830, la RG 2854, la Ley de IVA y el
  Convenio Multilateral va marcado [A VALIDAR]. Para leerlos hay que habilitar esos dominios.
- **Documentación pública de SAP** (`help.sap.com`): tampoco respondió. No se usó nada de SAP.
- **iDempiere:** el clon que ya estaba en `src/idempiere` es el núcleo (`org.adempiere.base`) y no trae localización
  argentina. La localización argentina que encontré es LAR, hecha sobre ADempiere 3.6.1, no sobre iDempiere.
- **Valores vigentes del Anexo VIII de la RG 830:** una búsqueda devolvió notas de prensa de julio de 2026 que hablan
  de una actualización promedio del 57 % de mínimos y montos no sujetos. No pude abrir la nota ni la norma. Los
  importes que trae ODOO pueden estar **desactualizados**.

---

## FC-07 · IVA en la factura

### R-B-01 · Catálogo de alícuotas de IVA con su código ARCA
- **Regla:** cada alícuota de IVA es un indicador con un código ARCA. Tres indicadores no son alícuota: «no
  corresponde», «no gravado» y «exento». El 0 % es distinto de exento y de no gravado.
- **Fórmula:** `IVA = redondear(base × alícuota / 100)`.
- **Tabla (ODOO):** código 0 = no corresponde; 1 = no gravado; 2 = exento; 3 = 0 %; 4 = 10,5 %; 5 = 21 %; 6 = 27 %;
  8 = 5 %; 9 = 2,5 %.
- **Casos borde:** el código 3 (0 %) se informa con base y con importe 0; los códigos 0, 1 y 2 no se informan como
  alícuota sino como importes aparte (ver R-B-08).
- **Vectores:** (a) base 1.000,00 al 21 % → 210,00. (b) base 1.000,00 al 10,5 % → 105,00. (c) base 333,33 al 27 % →
  89,9991 → 90,00. (d) base 1.000,00 exento → IVA 0,00 y la base va a «exento», no a «gravado».
- **Fuente:** ODOO `addons/l10n_ar/data/template/account.tax.group-ar_ri.csv:2-10` y
  `account.tax-ar_ri.csv:2-78` (LGPL-3).
- **Ficha:** FC-07. **Provisional a confirmar:** la lista de alícuotas vigentes.

### R-B-02 · Redondeo del IVA: por línea contra por total
- **Regla:** hay dos métodos y dan resultados distintos. «Por línea» redondea el IVA de cada renglón y suma. «Por
  total» suma las bases de todos los renglones de una misma alícuota y redondea una sola vez. Lo que se informa a
  ARCA es **un par base/importe por alícuota**, redondeado a 2 decimales.
- **Fórmula:** por línea: `IVA_a = Σ redondear(base_i × a)`. Por total: `IVA_a = redondear((Σ base_i) × a)`.
- **Casos borde:** el método tiene que ser uno solo por empresa; mezclar métodos entre la factura y el libro deja
  diferencias de centavos. ERPN lo maneja con una bandera global; cuando no redondea por renglón, arrastra el
  residuo (R-B-06). En ADHOC las retenciones se calculan siempre «por línea».
- **Vectores:**
  - (a) 3 renglones de 10,02 al 21 %: por línea 2,10 × 3 = **6,30**; por total 30,06 × 0,21 = 6,3126 → **6,31**.
  - (b) 5 renglones de 0,99 al 10,5 %: por línea 0,10 × 5 = **0,50**; por total 4,95 × 0,105 = 0,51975 → **0,52**.
  - (c) 2 renglones de 100,00 al 21 %: 42,00 por los dos métodos.
- **Fuente:** ODOO `addons/l10n_ar/models/account_move.py:425-454` (agrupa por código de alícuota y redondea a 2
  decimales); ERPN `erpnext/controllers/taxes_and_totals.py:563-565` y `:849-857`; ADHOC
  `l10n_ar_tax/models/l10n_ar_payment_withholding.py:140-148`. El motor genérico de impuestos de Odoo (donde vive
  la opción por línea o global) no está en el clon: [A VALIDAR].
- **Ficha:** FC-07.

### R-B-03 · Un solo indicador de IVA por renglón
- **Regla:** en una empresa Responsable Inscripto, cada renglón de factura lleva **exactamente un** indicador de
  IVA. Ni cero ni dos. Los comprobantes de compra que no discriminan IVA sólo admiten «no corresponde»; los que sí
  discriminan no lo admiten.
- **Fórmula:** `cantidad de indicadores de IVA del renglón = 1`.
- **Casos borde:** renglones de sección o nota no se validan. Percepciones y otros tributos sí pueden convivir con
  el indicador de IVA en el mismo renglón.
- **Vectores:** (a) renglón con IVA 21 % + percepción IIBB → válido. (b) renglón con IVA 21 % y 10,5 % → error.
  (c) factura C de proveedor con IVA 21 % → error; con «no corresponde» → válido. (d) factura A de proveedor con
  «no corresponde» → error.
- **Fuente:** ODOO `addons/l10n_ar/models/account_move.py:139-155`; `l10n_latam_document_type.py:15-18` (LGPL-3).
- **Ficha:** FC-07.

### R-B-04 · Letra del comprobante según condición fiscal de las dos partes
- **Regla:** las letras posibles salen de cruzar dos listas: lo que **puede emitir** el emisor y lo que **puede
  recibir** el receptor. La letra válida es la intersección.
- **Fórmula:** `letras = emite[condición emisor] ∩ recibe[condición receptor]`.
- **Tabla (ODOO, códigos de responsabilidad):** emite: 1 → A, B, E, M; 4 → C, E; 6 → C, E; 13 → C, E; 5 → nada.
  Recibe: 1 → A, B, C, E, M, I; 4 → B, C, I; 5 → B, C, I; 6 → A, B, C, M, I; 8, 9 y 10 → E, B, C.
- **Casos borde:** intersección vacía = no se puede facturar entre esas dos condiciones. Los nombres de los códigos
  (1 Responsable Inscripto, 4 Exento, 5 Consumidor Final, 6 Monotributo, 8 y 9 exterior) son [A VALIDAR]: los
  conozco por la tabla de ARCA, no los leí en el repo. En ODOO el Monotributo recibe letra A.
- **Vectores:** (a) emisor 1, receptor 1 → {A, B, E, M}. (b) emisor 1, receptor 5 → {B}. (c) emisor 6, receptor 1 →
  {C, E}. (d) emisor 1, receptor 9 → {E, B}. (e) emisor 5 → vacío.
- **Fuente:** ODOO `addons/l10n_ar/models/account_journal.py:50-96` (LGPL-3).
- **Ficha:** FC-07. **Provisional a confirmar:** la tabla de letras vigente.

### R-B-05 · Comprobantes B y C: precio con IVA adentro e «IVA contenido»
- **Regla:** en las letras B, C, X y R el impreso no discrimina el IVA: el total mostrado lo incluye. En los
  comprobantes B (códigos 6, 7 y 8) hay que mostrar igual, en una leyenda, el IVA contenido y los otros impuestos
  nacionales indirectos (régimen de transparencia fiscal, RG 5614/2024 según el comentario del código).
- **Fórmula:** `neto = total / (1 + a)`; `IVA contenido = total − redondear(neto)`.
- **Casos borde:** el comprobante C no tiene IVA: todo el importe sin impuestos se informa como neto. En el B con
  transparencia, las percepciones de IIBB se muestran aparte y no dentro del precio.
- **Vectores:** (a) total 121,00 al 21 % → neto 100,00, IVA contenido 21,00. (b) total 1.000,00 al 21 % → neto
  826,45, IVA contenido 173,55. (c) total 110,50 al 10,5 % → neto 100,00, IVA contenido 10,50.
- **Fuente:** ODOO `addons/l10n_ar/models/account_move.py:481-510`, `:512-552`, `:554-572`, `:413-414` (LGPL-3).
  RG 5614/2024: [A VALIDAR].
- **Ficha:** FC-07.

### R-B-06 · Impuesto incluido en el precio: neto con arrastre de redondeo
- **Regla:** cuando el precio trae el impuesto adentro, el neto de cada renglón se despeja dividiendo. Para que la
  suma de netos redondeados coincida con el neto total redondeado, el residuo se arrastra de un renglón al
  siguiente, **dentro del mismo grupo de impuestos** (no se mezclan alícuotas).
- **Fórmula:** `neto_exacto_i = (importe_i − impuestos_fijos_i) / (1 + Σ tasas)`. Con arrastre:
  `neto_i = redondear(Σ_{k≤i} neto_exacto_k) − Σ_{k<i} neto_k`.
- **Casos borde:** cantidad 0 no se calcula. Con la bandera de redondeo por renglón activa no hay arrastre. Un
  impuesto de importe fijo por unidad se resta antes de dividir.
- **Vectores (3 renglones de 100,00 con 21 % adentro):** exacto 82,644628 cada uno.
  - Con arrastre: 82,64 · 82,65 · 82,64 → suma **247,93**; IVA = 300,00 − 247,93 = 52,07.
  - Sin arrastre: 82,64 × 3 = **247,92**; IVA 52,08 (un centavo de diferencia).
  - Un renglón de 121,00: neto 100,00 por los dos caminos.
- **Fuente:** ERPN `erpnext/controllers/taxes_and_totals.py:395-456` (GPL-3).
- **Ficha:** FC-07.

### R-B-07 · Diferencia de centavos del total con impuesto incluido
- **Regla:** con impuesto incluido, el total reconstruido (neto + impuestos) puede diferir en centavos del total
  que el usuario cargó. Si la diferencia es chica, se absorbe en el total y manda lo que cargó el usuario; si es
  grande, no se toca (es un error de datos, no de redondeo).
- **Fórmula:** `dif = total_cargado + impuestos_no_incluidos − total_reconstruido`. Si
  `0 < |dif| ≤ 5 / 10^decimales` → `total = total_reconstruido + dif`. Con 2 decimales el tope es 0,05.
- **Casos borde:** si hay descuento global, se descuenta antes de medir la diferencia.
- **Vectores:** (a) cargado 300,00, reconstruido 299,99 → dif 0,01 → total 300,00. (b) cargado 300,00,
  reconstruido 300,00 → sin ajuste. (c) cargado 300,00, reconstruido 299,90 → dif 0,10 > 0,05 → no se ajusta.
- **Fuente:** ERPN `erpnext/controllers/taxes_and_totals.py:876-901` (GPL-3).
- **Ficha:** FC-07.

### R-B-08 · Casilleros de importes de un comprobante
- **Regla:** cada comprobante se descompone en casilleros fijos, que son los que piden la factura electrónica y el
  libro de IVA: neto gravado, no gravado, exento, IVA, percepción de IVA, percepción de IIBB, percepción municipal,
  impuestos internos, percepción de Ganancias y otros tributos.
- **Fórmula:** `total = neto gravado + no gravado + exento + IVA + Σ tributos`. La identidad del total es regla del
  servicio de ARCA: [A VALIDAR].
- **Tabla de tributos (ODOO):** 06 percepción de IVA; 07 percepción de IIBB (una por jurisdicción); 08 percepción
  municipal; 04 impuestos internos; 01 impuestos nacionales; 09 percepción de Ganancias; 99 otros.
- **Casos borde:** neto gravado sólo suma las bases cuyo código no es 0, 1 ni 2. En el comprobante C, el neto
  gravado es todo el importe sin impuestos. Una nota de crédito que comparte código con la factura va con todos los
  importes en negativo. Todo se redondea a 2 decimales al final.
- **Vectores:**
  - (a) renglón 1.000,00 al 21 % + renglón 500,00 exento + percepción IIBB 30,00 → gravado 1.000,00; exento 500,00;
    IVA 210,00; IIBB 30,00; total 1.740,00.
  - (b) compra A: neto 10.000,00 al 21 % + percepción de IVA 300,00 + percepción IIBB CABA 150,00 → total 12.550,00.
  - (c) factura C por 5.000,00 → gravado 5.000,00; IVA 0,00; total 5.000,00.
- **Fuente:** ODOO `addons/l10n_ar/models/account_move.py:302-423`; `account.tax.group-ar_ri.csv:11-40` (LGPL-3).
- **Ficha:** FC-07 y FC-10.

### R-B-09 · Crédito fiscal sólo si el comprobante discrimina IVA
- **Regla:** el IVA de una compra es crédito fiscal sólo cuando el tipo de comprobante exige alícuota (letra A o M).
  En los comprobantes que obligan a «no corresponde» (B y C recibidos) no hay crédito: todo el importe es costo.
- **Fórmula:** `crédito = Σ IVA de comprobantes con alícuota obligatoria`; en el resto `crédito = 0`.
- **Casos borde:** crédito no computable (gastos no vinculados, tope de automóviles) no está modelado en ninguno de
  los repos leídos: [A VALIDAR].
- **Vectores:** (a) factura A, neto 1.000,00 + IVA 210,00 → crédito 210,00, costo 1.000,00. (b) factura C por
  1.210,00 → crédito 0,00, costo 1.210,00. (c) factura B recibida por 1.210,00 → crédito 0,00, costo 1.210,00.
- **Fuente:** ODOO `addons/l10n_ar/models/account_move.py:144-155` (LGPL-3).
- **Ficha:** FC-07 y FC-10.

---

## FC-08 · Percepciones y retenciones

### R-B-10 · Percepción sufrida en la compra: se carga, no se calcula
- **Regla:** la percepción que cobra el proveedor es un **importe fijo** que se copia de su factura. El sistema no
  la recalcula. Suma al total a pagar, no es crédito fiscal de IVA y va a una cuenta de pago a cuenta del impuesto
  que corresponda.
- **Fórmula:** `total compra = neto + IVA + Σ percepciones cargadas`.
- **Casos borde:** una percepción de IIBB va a la jurisdicción que la cobró (un indicador por provincia). ODOO trae
  además un indicador de percepción de IVA adicional del 20 %.
- **Vectores:** (a) neto 10.000,00 + IVA 2.100,00 + percepción IVA 300,00 → total 12.400,00; crédito fiscal 2.100,00;
  pago a cuenta de IVA 300,00. (b) lo mismo + IIBB PBA 200,00 → total 12.600,00. (c) sin percepciones → 12.100,00.
- **Fuente:** ODOO `addons/l10n_ar/data/template/account.tax-ar_ri.csv:82-86` (tipo «importe fijo»);
  `account.tax.group-ar_ri.csv:14-40` (LGPL-3).
- **Ficha:** FC-08 y FC-07.

### R-B-11 · Percepción practicada en la venta, con mínimo de base
- **Regla:** la percepción se calcula sobre la suma de las bases de los renglones que la llevan. El mínimo se mira
  **por comprobante y por impuesto**, en pesos. Si la base no supera el mínimo, la percepción es 0. Si lo supera,
  se percibe sobre **toda** la base (no sobre el excedente).
- **Fórmula:** `base = Σ bases de renglones con la percepción × proporción`. Si
  `base ≤ mínimo × proporción` → 0; si no → `redondear(base × alícuota)`.
- **Casos borde:** los renglones sin la percepción no suman. Una base negativa (los renglones de un descuento
  global tomados solos) no se evalúa contra el mínimo. En Santa Fe el padrón define qué parte de la base se percibe
  (la «proporción»); en el resto vale 100 %.
- **Vectores (mínimo 10.000,00; alícuota 3 %):**
  - (a) renglones 6.000 + 5.000 → base 11.000 → 330,00.
  - (b) renglones 6.000 + 4.000 → base 10.000 (no supera) → 0,00.
  - (c) proporción 50 %, renglones por 12.000 → base 6.000 contra mínimo 5.000 → 180,00.
- **Fuente:** ADHOC `l10n_ar_tax/models/account_tax.py:204-217` y `:346-375`;
  `l10n_ar_tax/tests/test_perception_base_minimum_threshold.py:1-9` (AGPL-3).
- **Ficha:** FC-08. **Provisional a confirmar:** mínimos y alícuotas por jurisdicción.

### R-B-12 · Alícuota por padrón, con alícuota de castigo y exenciones con vigencia
- **Regla:** la alícuota de percepción o de retención de IIBB no es fija: sale del padrón de cada fisco para ese
  CUIT y ese período. El padrón trae dos alícuotas por contribuyente (una de retención y otra de percepción). Si el
  CUIT no figura, se usa la alícuota por defecto o de castigo de la jurisdicción.
- **Fórmula:** `alícuota = padrón[jurisdicción, CUIT, período]`; si no figura → `alícuota por defecto`.
- **Exención parcial (LAR):** si el cliente tiene un porcentaje de exención vigente, primero se reduce la base para
  comparar con el mínimo y después se reduce el importe:
  `importe = base × alícuota − importe × %exención − importe fijo exento`; si da negativo, es 0.
- **Casos borde:** la exención sólo vale dentro de su vigencia. LAR además tiene tope máximo de base (si la base lo
  supera, no percibe). El padrón se carga por mes; sin padrón cargado para la fecha, ADHOC corta con error en vez
  de inventar una alícuota.
- **Vectores:** (a) CUIT en padrón con 3 %, base 100.000 → 3.000,00. (b) CUIT ausente, alícuota de castigo 6 %
  [A VALIDAR], base 100.000 → 6.000,00. (c) alícuota 3 %, exención 50 % vigente, base 100.000 → 3.000 − 1.500 =
  1.500,00. (d) la misma exención vencida → 3.000,00.
- **Fuente:** ADHOC `l10n_ar_tax/models/account_fiscal_position_l10n_ar_tax.py:449-562` y `:583-590` (AGPL-3);
  LAR `extend/src/ar/com/ergio/model/LAR_CalcularPercepcion.java:484-543` (GPL-2).
- **Ficha:** FC-08 y FC-09. **Provisional a confirmar:** todas las alícuotas.

### R-B-13 · Retención de Ganancias con alícuota fija
- **Regla:** se retiene al pagar. A la base de este pago se le suma lo ya pagado al mismo proveedor en el mes por
  el mismo régimen; se resta el mínimo no sujeto a retención (una vez por mes); se aplica la alícuota; se resta lo
  ya retenido en el mes. Si el resultado es menor al mínimo de retención, no se retiene.
- **Fórmula:**
  `neto = máx(0, base_pago + base_acumulada_mes − mínimo_no_sujeto)`
  `retención = neto × alícuota − retenido_en_el_mes`
  `si retención < mínimo_de_retención → 0`.
- **Casos borde:** los importes de la norma están en pesos: un pago en otra moneda se convierte a pesos a la fecha
  del pago y la retención se vuelve a convertir. El resultado puede ser negativo si se cargó mal un pago anterior:
  queda en 0 por la regla del mínimo. Sólo se acumula en Ganancias, no en IIBB.
- **Vectores (régimen 78, 2 %, mínimo no sujeto 224.000; mínimo de retención 240 [A VALIDAR]):**
  - (a) primer pago del mes, base 300.000 → (300.000 − 224.000) × 2 % = **1.520,00**.
  - (b) segundo pago del mes, base 100.000 → (400.000 − 224.000) × 2 % − 1.520 = **2.000,00**.
  - (c) único pago, base 200.000 → neto 0 → **0,00**.
  - (d) único pago, base 230.000 → 120,00 < 240 → **0,00**.
- **Fuente:** ODOO `addons/l10n_ar_withholding/models/account_withholding_line.py:9-49` y
  `models/account_tax.py:21-30`; valores en `data/template/account.tax-ar_ex.csv:140-275` (LGPL-3). ADHOC
  `l10n_ar_tax/models/l10n_ar_payment_withholding.py:124-209` (AGPL-3). RG 830, arts. 25, 26 y 29: [A VALIDAR].
- **Ficha:** FC-08. **Provisional a confirmar:** alícuotas, mínimos no sujetos y mínimo de retención.

### R-B-14 · Retención de Ganancias por escala
- **Regla:** en los regímenes de escala (honorarios, comisiones y parecidos), la alícuota fija se reemplaza por una
  tabla de tramos. Se busca el tramo donde cae el neto; se aplica el porcentaje del tramo sobre lo que excede su
  piso y se suma el importe fijo del tramo. El importe fijo es lo que retienen completos todos los tramos de abajo.
- **Fórmula:** tramo `t` con `desde_t ≤ neto < hasta_t`:
  `retención bruta = (neto − desde_t) × %_t + fijo_t`, con `fijo_t = Σ_{k<t} (hasta_k − desde_k) × %_k`.
  Después se resta lo retenido en el mes y se aplica el mínimo, igual que en R-B-13.
- **Escala (ODOO, «escala normal»):**

  | Desde | Hasta | Fijo | Más % |
  |---|---|---|---|
  | 0 | 8.000 | 0 | 5 |
  | 8.000 | 16.000 | 400 | 9 |
  | 16.000 | 24.000 | 1.120 | 12 |
  | 24.000 | 32.000 | 2.080 | 15 |
  | 32.000 | 48.000 | 3.280 | 19 |
  | 48.000 | 64.000 | 6.320 | 23 |
  | 64.000 | 96.000 | 10.000 | 27 |
  | 96.000 | en adelante | 18.640 | 31 |

  ODOO trae una segunda escala para el régimen 119 (tramos 71.000, 142.000, 213.000, 284.000, 426.000, 568.000,
  852.000 y en adelante, con los mismos porcentajes).
- **Casos borde:** el límite pertenece al tramo de arriba (neto 8.000 cae en el segundo tramo; da lo mismo, 400).
  Un neto por encima del último tope se retiene con el último tramo, no queda afuera. Neto 0 → 0. ADHOC guarda el
  piso del tramo como dato aparte en lugar de derivarlo.
- **Vectores (escala normal):**
  - (a) neto 5.000 → 250,00.
  - (b) neto 20.000 → 1.120 + 4.000 × 12 % = 1.600,00.
  - (c) neto 100.000 → 18.640 + 4.000 × 31 % = 19.880,00.
  - (d) honorarios 100.000 con mínimo no sujeto 67.170 → neto 32.830 → 3.280 + 830 × 19 % = **3.437,70**.
  - (e) segundo pago del mes de 50.000 → neto 82.830 → 10.000 + 18.830 × 27 % = 15.084,10 − 3.437,70 = **11.646,40**.
- **Fuente:** ODOO `addons/l10n_ar_withholding/models/l10n_ar_earnings_scale.py:11-26`,
  `models/l10n_ar_earnings_scale_line.py:38-52`, `data/earnings_table_data.xml:7-112` (LGPL-3). ADHOC
  `l10n_ar_tax/models/l10n_ar_payment_withholding.py:160-188` (AGPL-3). RG 830, Anexo VIII: [A VALIDAR].
- **Ficha:** FC-08. **Provisional a confirmar:** toda la escala y los mínimos. Hay indicios de una actualización en
  2026 que no pude leer.

### R-B-15 · Qué entra en el acumulado del mes
- **Regla:** el acumulado junta los pagos **confirmados** al mismo proveedor (la persona jurídica, no cada
  contacto), del **mismo código de régimen**, dentro del mes calendario del pago. El pago que se está calculando no
  se acumula contra sí mismo. Dos impuestos con el mismo código de régimen comparten acumulado.
- **Fórmula:** `acumulado = Σ pagos donde proveedor = P, régimen = R, estado = confirmado, mes = mes(fecha),
  pago ≠ el actual`. Se llevan dos sumas: base acumulada y retención acumulada.
- **Diferencia entre fuentes:** ODOO toma **todo el mes** (del día 1 al último); ADHOC toma **del día 1 a la fecha
  del pago**. Sólo difieren si se registra un pago con fecha anterior a otro ya confirmado.
- **Casos borde:** régimen sin código → se acumula sólo contra ese mismo impuesto. Borradores y anulados no suman.
  El propio código de ODOO advierte una limitación: admite **un solo régimen por proveedor a la vez**; una factura
  con flete (régimen 78) y honorarios (régimen 116) debería separar la base por concepto y no lo hace.
- **Vectores:** (a) pago el 5 y pago el 20 del mismo mes, mismo régimen → el del 20 acumula el del 5. (b) pago el
  31/10 y pago el 01/11 → no se acumulan. (c) dos pagos del mes con regímenes 78 y 94 → no se acumulan entre sí.
  (d) pago en borrador el día 10 y cálculo el día 15 → el borrador no suma.
- **Fuente:** ODOO `addons/l10n_ar_withholding/models/res_partner.py:10-14` y `:41-84` (LGPL-3); ADHOC
  `l10n_ar_tax/models/l10n_ar_payment_withholding.py:229-290` (AGPL-3).
- **Ficha:** FC-08.

### R-B-16 · Base de la retención en un pago parcial
- **Regla:** la base sale de las facturas que se pagan, no del importe del pago. Para Ganancias y para IIBB «sobre
  neto» es el importe sin IVA; para IIBB «sobre total» es el total con IVA. Si se paga una parte, la base se
  prorratea por la fracción pagada.
- **Fórmula:** `factor = importe pagado / total adeudado`;
  `base = (neto o total de las facturas) × factor`.
- **Casos borde:** un anticipo sin factura se toma entero como base (ADHOC lo trata como «adelanto sujeto a
  retención»). Si el importe a pagar no alcanza para cubrir los comprobantes seleccionados, ADHOC corta con error
  para que se quiten de la selección. La base siempre queda en pesos.
- **Vectores (factura neto 100.000 + IVA 21.000 = 121.000):**
  - (a) pago total → base Ganancias 100.000; base IIBB sobre total 121.000.
  - (b) pago de 60.500 (50 %) → base Ganancias 50.000; base IIBB sobre total 60.500.
  - (c) pago de 30.250 (25 %) → base Ganancias 25.000.
- **Fuente:** ODOO `addons/l10n_ar_withholding/wizards/account_payment_register_withholding_line.py:7-42` (LGPL-3);
  ADHOC `l10n_ar_tax/models/l10n_ar_payment_withholding.py:57-108` (AGPL-3).
- **Ficha:** FC-08.

### R-B-17 · Retención de IIBB: tres mínimos en orden
- **Regla:** no hay acumulado mensual. Se pasan tres filtros en este orden: (1) si el pago entero no supera el
  mínimo de pago, no se retiene; (2) si la base no supera el mínimo de base, no se retiene; (3) si el importe
  calculado es menor al mínimo de retención, no se retiene. La alícuota sale del padrón (R-B-12).
- **Fórmula:** `si pago ≤ mín_pago → 0`; `si base ≤ mín_base → 0`; `ret = base × alícuota`;
  `si ret < mín_importe → 0`.
- **Casos borde:** los dos primeros filtros son «menor o igual»; el tercero es «menor estricto». **Neuquén** mira el
  mínimo de base **por comprobante** y no sobre la suma: las facturas que no lo superan salen de la base y las que
  sí lo superan se retienen aunque el pago sea parcial. Cada jurisdicción define si la base es neto o total (en
  ODOO, Córdoba es la única sobre total).
- **Vectores (alícuota 3 %; mínimo de pago 50.000; mínimo de base 40.000; mínimo de importe 500):**
  - (a) pago 50.000 → 0,00 (no supera el mínimo de pago).
  - (b) pago 121.000, base 100.000 → 3.000,00.
  - (c) pago 60.000, base 40.000 → 0,00 (no supera el mínimo de base).
  - (d) Neuquén, facturas con base 30.000 y 90.000 → base 90.000 → 2.700,00 (el cálculo común daría 3.600,00).
- **Fuente:** ADHOC `l10n_ar_tax/models/l10n_ar_payment_withholding.py:194-209`, `models/account_tax.py:82-94`,
  `l10n_ar_tax_neuquen/models/l10n_ar_payment_withholding.py:7-80` (AGPL-3). ODOO
  `l10n_ar_withholding/data/template/account.tax-ar_ex.csv:10-125` (LGPL-3).
- **Ficha:** FC-08 y FC-09. **Provisional a confirmar:** mínimos, alícuotas y base por jurisdicción.

### R-B-18 · Retención de IVA
- **Regla:** ningún repo leído la calcula sola. ODOO y ADHOC traen el indicador con alícuota 0 y el importe se
  carga a mano en el pago (practicada) o en el cobro (sufrida). La regla normativa es un porcentaje del IVA
  facturado, distinto para bienes y para servicios.
- **Fórmula [A VALIDAR]:** `retención = IVA del comprobante × porcentaje del régimen`; si
  `retención ≤ mínimo → 0`.
- **Casos borde:** porcentajes (50 % en bienes, 80 % en servicios, 100 % en casos especiales) y mínimo ($ 400 según
  una nota de prensa de 2026) son de memoria o de fuente secundaria: [A VALIDAR]. El pago parcial prorratea como en
  R-B-16.
- **Vectores (con los porcentajes a validar):** (a) bienes, IVA 21.000 → 10.500,00. (b) servicios, IVA 21.000 →
  16.800,00. (c) servicios, IVA 400 → 320,00 ≤ 400 → 0,00.
- **Fuente:** ODOO `addons/l10n_ar_withholding/data/template/account.tax-ar_ex.csv:130` y
  `account.tax-ar_ri.csv:2` (LGPL-3). RG 2854: [A VALIDAR].
- **Ficha:** FC-08. **Provisional a confirmar:** todo.

### R-B-19 · Regímenes y exclusiones del proveedor con vigencia
- **Regla:** cada proveedor tiene una lista de regímenes que le corresponden, con fecha desde y hasta. Al armar el
  pago se proponen sólo los regímenes vigentes a la fecha del pago. Si cambia la fecha del pago, se quitan los que
  dejaron de estar vigentes y se agregan los que faltan.
- **Fórmula:** `vigente = (desde vacío o desde ≤ fecha) y (hasta vacío o hasta ≥ fecha)`. Restricción:
  `desde < hasta` cuando están los dos.
- **Casos borde:** las dos fechas son inclusivas. Sin fecha = abierto de ese lado. Las retenciones agregadas a mano
  no se tocan al recalcular. Un régimen del proveedor aplica también a sus contactos (se busca por la entidad
  comercial).
- **Vectores:** (a) régimen 01/01 a 30/06, pago 30/06 → aplica. (b) el mismo, pago 01/07 → no aplica. (c) sin
  fechas → aplica siempre. (d) desde 10/05 y hasta 10/05 → carga rechazada.
- **Fuente:** ODOO `addons/l10n_ar_withholding/models/res_partner.py:22-39`,
  `models/l10n_ar_partner_tax.py:35-38`, `wizards/account_payment_register.py:150-183` (LGPL-3).
- **Ficha:** FC-08.

### R-B-20 · Neto a pagar y cheque por importe fijo
- **Regla:** lo que sale de caja es el pago menos las retenciones. Si el medio de pago es un cheque de importe ya
  fijado, hay que encontrar el pago bruto cuyo neto dé justo el cheque. Como la retención depende del bruto, ODOO
  lo resuelve por aproximaciones sucesivas (método de la secante, hasta 200 vueltas) y, si no converge, vuelve al
  importe original y avisa.
- **Fórmula:** `neto = bruto − Σ retenciones(bruto)`. Con una sola retención de alícuota fija `a` sobre una
  fracción `f` del bruto y mínimo no sujeto `M` (fórmula cerrada, de elaboración propia):
  `bruto = (cheque − a × M) / (1 − a × f)`.
- **Casos borde:** si el bruto cae bajo un mínimo, la retención salta a 0 y la función no es continua: por eso la
  búsqueda puede no converger. Un pago «sólo retención» vale exactamente la suma de sus retenciones.
- **Vectores:**
  - (a) IIBB 3 % sobre total, cheque 97.000 → bruto 100.000; retención 3.000.
  - (b) Ganancias 2 % sobre neto (f = 1/1,21), mínimo 224.000, cheque 500.000 → bruto 503.848,07; retención
    3.848,07.
  - (c) sin retenciones, cheque 50.000 → bruto 50.000.
- **Fuente:** ODOO `addons/l10n_ar_withholding/wizards/account_payment_register.py:18-96` y `:127-135` (LGPL-3).
  ADHOC lo prueba en `l10n_ar_tax/tests/test_own_check_net_amount.py` (AGPL-3, no leído en detalle).
- **Ficha:** FC-08.

### R-B-21 · Certificado numerado por cada retención
- **Regla:** cada renglón de retención lleva un número de certificado, tomado de una numeración propia del
  impuesto. Sin número ni numeración configurada, el pago avisa y no debería confirmarse. Sólo se puede retener
  cuando se paga a **un** proveedor (o a varios comprobantes del mismo, agrupados). Un mismo impuesto no puede
  aparecer dos veces en el mismo pago.
- **Fórmula:** `certificado = siguiente(numeración del impuesto)`; unicidad `(impuesto, pago)`.
- **Casos borde:** los renglones de retención con importe 0 se conservan (ODOO los mantiene a propósito, porque la
  tabla no se puede volver a agregar). Una vez confirmado el pago, ADHOC no recalcula base ni importe.
- **Vectores:** (a) pago con Ganancias e IIBB CABA → 2 certificados, uno por numeración. (b) pago a dos proveedores
  distintos → no se puede retener. (c) dos renglones del mismo impuesto en un pago → rechazado.
- **Fuente:** ODOO `addons/l10n_ar_withholding/wizards/account_payment_register.py:98-125`,
  `models/account_tax.py:79-89` (LGPL-3); ADHOC `l10n_ar_tax/models/l10n_ar_payment_withholding.py:34-46`
  (AGPL-3).
- **Ficha:** FC-08.

---

## FC-09 · IIBB Convenio Multilateral

**Aviso:** ningún repo leído calcula el coeficiente unificado ni la distribución de base. ODOO sólo guarda si el
contribuyente es «local», «multilateral» o «exento» (`addons/l10n_ar/models/res_partner.py:28-31`). ADHOC usa la
palabra «CM» sólo para una variante de base en percepciones de Santa Fe. Las reglas R-B-22 a R-B-25 salen de la
norma, que **no pude leer** en esta sesión: van enteras como [A VALIDAR].

### R-B-22 · Coeficiente unificado por jurisdicción (régimen general)
- **Regla [A VALIDAR]:** a cada provincia le toca una parte de la base. La mitad se reparte según dónde están los
  ingresos y la otra mitad según dónde se soportaron los gastos, con los datos del último ejercicio cerrado.
- **Fórmula:** `coef_j = 0,5 × ingresos_j / Σ ingresos + 0,5 × gastos_j / Σ gastos`; `Σ coef_j = 1`.
- **Casos borde:** hay gastos que no se computan (costo de mercadería, impuestos, intereses, entre otros:
  [A VALIDAR]). La cantidad de decimales (se usan 4) y qué hacer con el residuo del redondeo son [A VALIDAR];
  propuesta: asignar el residuo a la jurisdicción de mayor coeficiente. Si Σ gastos = 0, la fórmula no está
  definida.
- **Vectores:**
  - (a) ingresos CABA 600 / PBA 400; gastos CABA 300 / PBA 700 → CABA 0,4500; PBA 0,5500.
  - (b) ingresos 500 / 300 / 200; gastos 100 / 100 / 800 → 0,3000; 0,2000; 0,5000.
  - (c) tres jurisdicciones iguales → 0,3333 cada una, suma 0,9999 → residuo 0,0001 a asignar.
- **Fuente:** Convenio Multilateral del 18/08/1977, arts. 2 a 5: [A VALIDAR]. Sin fuente de código abierto.
- **Ficha:** FC-09. **Provisional a confirmar:** todo.

### R-B-23 · Papel de trabajo mensual por jurisdicción
- **Regla [A VALIDAR]:** la base del mes de todo el país se reparte con el coeficiente; a cada parte se le aplica
  la alícuota de la actividad en esa provincia; al impuesto se le restan las percepciones, retenciones y
  recaudaciones bancarias sufridas **en esa jurisdicción** y el saldo a favor anterior **de esa jurisdicción**.
- **Fórmula:** `base_j = base_país × coef_j`; `impuesto_j = base_j × alícuota_j`;
  `saldo_j = impuesto_j − percepciones_j − retenciones_j − bancarias_j − saldo_a_favor_anterior_j`.
  Si `saldo_j < 0` → a pagar 0 y saldo a favor `|saldo_j|` para el mes siguiente.
- **Casos borde:** el saldo a favor de una provincia **no** compensa lo que se debe en otra. La base sale de los
  comprobantes emitidos (R-B-08), no de la cuenta de ventas. Una percepción cargada sin jurisdicción no se puede
  computar.
- **Vectores (base país 10.000.000; coeficientes de R-B-22 a):**
  - (a) CABA: 4.500.000 × 3 % = 135.000 − 20.000 − 15.000 − 30.000 = **70.000 a pagar**.
  - (b) PBA: 5.500.000 × 3,5 % = 192.500 − 250.000 de pagos a cuenta = −57.500 → **a pagar 0, saldo a favor 57.500**.
  - (c) total a pagar del mes: 70.000 (el saldo de PBA no se resta).
- **Fuente:** Convenio Multilateral y normas de la Comisión Arbitral: [A VALIDAR]. Roles de percepción por
  jurisdicción: ODOO `addons/l10n_ar/data/template/account.tax.group-ar_ri.csv:15-38` (LGPL-3).
- **Ficha:** FC-09 y FC-10. **Provisional a confirmar:** alícuotas.

### R-B-24 · Qué coeficiente se usa en los primeros meses del año
- **Regla [A VALIDAR]:** el coeficiente nuevo se calcula con el balance del ejercicio anterior, que a principio de
  año todavía no está. En los primeros anticipos se sigue con el coeficiente del año anterior y, cuando se
  determina el nuevo, se ajusta la diferencia.
- **Fórmula:** `ajuste_j = Σ_{meses provisorios} base_país_m × (coef_nuevo_j − coef_viejo_j) × alícuota_j`.
- **Casos borde:** qué anticipos son provisorios y en cuál se ajusta: [A VALIDAR]. La suma de los ajustes de base
  entre jurisdicciones es 0; la de impuesto no, si las alícuotas difieren.
- **Vectores (enero a marzo, base 10.000.000 por mes; CABA pasa de 0,4500 a 0,5000; alícuotas 3 % y 3,5 %):**
  - (a) CABA: 30.000.000 × 0,05 × 3 % = +45.000.
  - (b) PBA: 30.000.000 × (−0,05) × 3,5 % = −52.500.
  - (c) coeficientes sin cambio → ajuste 0.
- **Fuente:** resoluciones generales de la Comisión Arbitral: [A VALIDAR]. Sin fuente de código abierto.
- **Ficha:** FC-09. **Provisional a confirmar:** todo.

### R-B-25 · Alta de una jurisdicción nueva
- **Regla [A VALIDAR]:** cuando se empieza a operar en una provincia a mitad de año, esa provincia no tiene
  coeficiente. Los ingresos de ahí se le asignan directo y el resto se reparte entre las demás con los coeficientes
  vigentes, hasta tener un ejercicio completo.
- **Fórmula:** `base_nueva = ingresos del mes en la jurisdicción nueva`;
  `base_j = (base_país − base_nueva) × coef_j` para las demás.
- **Casos borde:** el sistema tiene que detectar la primera venta o gasto en una provincia sin alta y avisar (la
  alerta que pide la ficha).
- **Vectores:** (a) mes de 10.000.000 con 1.000.000 en Córdoba (nueva) → Córdoba 1.000.000; CABA 9.000.000 × 0,45 =
  4.050.000; PBA 4.950.000. (b) sin ventas en la nueva → reparto normal. (c) todo el mes en la nueva → las demás
  base 0.
- **Fuente:** Convenio Multilateral, art. 14: [A VALIDAR]. Sin fuente de código abierto.
- **Ficha:** FC-09. **Provisional a confirmar:** todo.

---

## FC-10 · Posición fiscal del mes

### R-B-26 · Posición mensual de IVA con dos saldos a favor
- **Regla [A VALIDAR]:** primero se compara débito contra crédito y contra el saldo técnico que venía de antes. Si
  eso da a favor, queda como saldo técnico y sólo sirve contra débitos futuros. Si da a pagar, recién ahí se restan
  las retenciones y percepciones sufridas y el saldo de libre disponibilidad anterior. Lo que sobre de
  retenciones y percepciones se acumula como libre disponibilidad.
- **Fórmula:**
  `técnico = débito − crédito − saldo_técnico_anterior`
  `si técnico < 0 → saldo_técnico_nuevo = |técnico|; impuesto = 0`
  `si técnico ≥ 0 → saldo_técnico_nuevo = 0; impuesto = técnico`
  `resto = impuesto − (retenciones + percepciones sufridas) − libre_disponibilidad_anterior`
  `si resto ≥ 0 → a pagar = resto; libre_disponibilidad_nueva = 0`
  `si resto < 0 → a pagar = 0; libre_disponibilidad_nueva = |resto|`.
- **Casos borde:** los dos saldos se llevan separados y nunca se suman. Con clientes que retienen, la libre
  disponibilidad crece todos los meses aunque haya saldo técnico a favor. Sólo entran percepciones de IVA (tributo
  06), no las de IIBB ni las de Ganancias.
- **Vectores:**
  - (a) débito 2.100.000; crédito 1.260.000; sin saldos; retenciones y percepciones 500.000; libre disponibilidad
    anterior 100.000 → técnico 840.000 → **a pagar 240.000**.
  - (b) débito 1.000.000; crédito 1.500.000; retenciones 200.000 → **saldo técnico 500.000; libre disponibilidad
    200.000; a pagar 0**.
  - (c) débito 1.000.000; crédito 800.000; saldo técnico anterior 150.000; retenciones 300.000 → técnico 50.000 →
    **a pagar 0; libre disponibilidad 250.000; saldo técnico 0**.
- **Fuente:** Ley de IVA, art. 24: [A VALIDAR]. Ningún repo leído arma la posición; ODOO sólo provee los casilleros
  (R-B-08).
- **Ficha:** FC-10. **Provisional a confirmar:** el tratamiento de los saldos y el formato de presentación vigente.

### R-B-27 · Signo de las notas de crédito en el libro y en la posición
- **Regla:** una nota de crédito de venta resta débito fiscal y una de compra resta crédito fiscal. Cuando la nota
  de crédito comparte código de comprobante con la factura, todos sus casilleros se informan en negativo.
- **Fórmula:** `débito del mes = Σ IVA facturas y notas de débito de venta − Σ IVA notas de crédito de venta`; lo
  mismo para el crédito con las compras.
- **Casos borde:** la nota de crédito va al mes de su fecha, no al de la factura que corrige. Si tiene código
  propio, va en positivo y la resta la hace el reporte.
- **Vectores:** (a) ventas con IVA 210.000 y nota de crédito con IVA 21.000 → débito 189.000. (b) compras con IVA
  100.000 y nota de crédito del proveedor con IVA 10.000 → crédito 90.000. (c) nota de crédito mayor a las ventas
  del mes → débito negativo, que se informa como tal.
- **Fuente:** ODOO `addons/l10n_ar/models/account_move.py:416-418` y `:437-441` (LGPL-3).
- **Ficha:** FC-10 y FC-07.

### R-B-28 · Ganancias: retenciones sufridas como pago a cuenta
- **Regla:** la retención de Ganancias que le hacen al cliente cuando cobra no es un gasto: es un pago a cuenta que
  se acumula por año fiscal y se descuenta en la declaración anual, junto con los anticipos.
- **Fórmula:** `pagos a cuenta del ejercicio = Σ retenciones sufridas + Σ percepciones de Ganancias + Σ anticipos`.
- **Casos borde:** en ODOO la retención sufrida es un indicador con alícuota 0 que se carga a mano en el cobro, con
  su número de certificado. Sin certificado no se puede computar: [A VALIDAR].
- **Vectores:** (a) cobro de 121.000 con retención sufrida 2.000 → entra 119.000 al banco y 2.000 al pago a cuenta.
  (b) 12 retenciones de 2.000 + 5 anticipos de 50.000 → pagos a cuenta 274.000. (c) retención sufrida de IIBB CABA
  → no va acá, va a R-B-23.
- **Fuente:** ODOO `addons/l10n_ar_withholding/data/template/account.tax-ar_ex.csv:2-6` (LGPL-3).
- **Ficha:** FC-10 y FC-08.

---

## Módulos encontrados

| Repo / ruta | Qué hace | Licencia | ¿Sirve de modelo? |
|---|---|---|---|
| `src/odoo/addons/l10n_ar` | Plan de cuentas, alícuotas de IVA con código ARCA, tipos de comprobante y letras, casilleros para factura electrónica y libro IVA. | LGPL-3 | Sí, FC-07 (catálogo de indicadores, validaciones, letras) y casilleros de FC-10. |
| `src/odoo/addons/l10n_ar_withholding` | Retenciones en el pago: Ganancias con acumulado y escala, IIBB por jurisdicción, regímenes del proveedor con vigencia, cheque por neto. | LGPL-3 | Sí, FC-08: es el modelo más limpio de escala y acumulado. Ojo: un solo régimen por proveedor. |
| `l10n_account_withholding_tax` (Odoo, **no clonado**) | Motor genérico de retención en el pago del que hereda el anterior. | LGPL-3 [A VALIDAR] | A revisar si se adapta el modelo de Odoo. |
| `src/ingadhoc/l10n_ar_tax` | Retenciones y percepciones automáticas: padrones (AGIP, ARBA, Santa Fe, Córdoba), mínimos de pago, de base y de importe, certificados por mail, multimoneda. | AGPL-3 | Sí, FC-08 y la parte de padrones de FC-09. El más completo; es AGPL. |
| `src/ingadhoc/l10n_ar_tax_neuquen` | Mínimo de base de IIBB por comprobante para Neuquén. | AGPL-3 | Sí, como ejemplo de excepción por jurisdicción (FC-08). |
| `src/ingadhoc/l10n_ar_tax_payment_method` | Retención asociada al medio de pago. | AGPL-3 | Parcial, FC-08. No leído en detalle. |
| `src/ingadhoc/l10n_ar_tax_python` | Retención definida con una fórmula a medida. | AGPL-3 | No: fórmulas libres chocan con el modo propuesta y las tablas firmadas. |
| `src/ingadhoc/l10n_ar_tax_backward_compatibility` | Compatibilidad con versiones viejas del módulo. | AGPL-3 | No. |
| `src/ingadhoc/l10n_ar_ux` | Mejoras de uso: consulta de padrón ARCA, datos del contacto, reportes. | AGPL-3 | Parcial, FC-07 (validación de CUIT y condición fiscal). |
| `src/ingadhoc/l10n_ar_purchase`, `l10n_ar_purchase_stock`, `l10n_ar_bank` | Compras, remitos y listado de bancos. | AGPL-3 | No para estas fichas. |
| `src/erpnext-controllers/erpnext/controllers/taxes_and_totals.py` | Motor de totales: impuesto incluido, arrastre de redondeo, ajuste del total. Sin localización argentina. | GPL-3 | Sí, FC-07 (aritmética de redondeo). |
| `src/lar_361/extend/src/ar/com/ergio/` | Localización Argentina de ADempiere: percepciones en el pedido, retenciones en el pago, certificados, exenciones de IIBB con vigencia. | GPL-2 | Parcial, FC-08 (exenciones parciales y topes de base). Código viejo; leí sólo el cálculo de percepciones. |
| `src/idempiere` (clon previo de otro agente) | Núcleo de iDempiere, sin localización argentina. | GPL-2 | No para estas fichas. |

Notas del inventario:
- `src/erpnext` ya existía (clon de otro agente, con `erpnext/accounts`). No lo toqué: cloné aparte en
  `src/erpnext-controllers`.
- No hay módulo de código abierto, entre los leídos, que sirva de modelo para el coeficiente unificado (FC-09) ni
  para la posición mensual de IVA con dos saldos (FC-10).
