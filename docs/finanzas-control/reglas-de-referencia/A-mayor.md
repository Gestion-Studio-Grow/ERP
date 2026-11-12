# A · Libro mayor, partida doble y cierre — reglas y aritmética de ERPs de código abierto

Fecha de lectura: 12/11/2026. Fichas: FC-01, FC-02, FC-03 (`CATALOGO-FC.md:39-141`).
Todo el código se leyó, **no se ejecutó**. Lo copyleft (GPL/LGPL) está descripto con palabras propias; sólo hay
una cita textual, de OFBiz (Apache-2.0), en R-A-02.

## Fuentes y commits

| Sigla | Repo | Commit (fecha) | Licencia | Dónde quedó |
|---|---|---|---|---|
| OFB | github.com/apache/ofbiz-framework | `4f19231088fb` (12/11/2026) | Apache-2.0 | `src/ofbiz` |
| IDE | github.com/idempiere/idempiere | `b42d472d3304` (12/11/2026) | GPL-2.0 | `src/idempiere` |
| ERN | github.com/frappe/erpnext | `f9ad32825a24` (12/11/2026) | GPL-3.0 | `src/erpnext` |
| TRY | github.com/tryton/tryton (`modules/account`) | `688622c64f6e` (04/11/2026) | GPL-3.0-or-later | `src/tryton` |
| ODO | github.com/odoo/odoo, rama 20.0 (`addons/account/models`) | `53882d669630` (12/11/2026) | LGPL-3.0 [A VALIDAR: no abrí el archivo de licencia] | `src/odoo-account` (3 archivos sueltos) |
| BEA | github.com/beancount/beancount | `9747213802ac` | GPL-2.0 | `src/beancount-src` (2 archivos sueltos) |
| SAP | help.sap.com | — | documentación pública | **no se pudo leer**: el dominio no resuelve desde esta sesión. Lo de SAP sale sólo del resumen del buscador y va marcado [A VALIDAR] |

Rutas abreviadas:
- OFB-AT = `applications/accounting/minilang/ledger/AcctgTransServices.xml`
- OFB-GL = `applications/accounting/minilang/ledger/GeneralLedgerServices.xml`
- IDE-doc = `org.idempiere.acct/src/org/idempiere/acct/doc/`
- IDE-mod = `org.adempiere.base/src/org/compiere/model/`
- ERN-acc = `erpnext/accounts/`
- TRY-acc = `modules/account/`

Convención de los vectores: importes en pesos con 2 decimales (en GSG son centavos enteros). D = debe, H = haber.

---

## 1. Validación de que el asiento cuadra

### R-A-01 · Cuadre exacto en moneda local, a la precisión de la moneda
- **Regla:** un asiento se contabiliza sólo si la suma de debe menos haber, redondeada a los decimales de la moneda
  de la empresa, da cero. No hay tolerancia.
- **Algoritmo:** `r = redondear(Σ(debe − haber), decimales)`. Tryton: válido si `|r| < redondeo_de_la_moneda`
  (0,01 → equivale a `r = 0`). Odoo: error si `r ≠ 0`. Los dos lo hacen en una sola consulta agrupada por asiento.
- **Casos borde:** asiento sin líneas (Tryton lo rechaza al contabilizar; Odoo lo saltea en el control de cuadre);
  Tryton marca las líneas como «válidas» o «borrador» al guardar y recién rechaza al contabilizar; línea con debe 0
  y haber 0 se admite y se concilia sola.
- **Vectores:**
  1. D 100,00 / H 100,00 → cuadra.
  2. D 100,00 / H 99,99 → rechazado (diferencia 0,01).
  3. D 33,33 + D 33,33 + D 33,34 / H 100,00 → cuadra.
  4. Asiento sin líneas → Tryton: error «asiento vacío».
- **Fuente:** TRY `TRY-acc/move.py:352` (`validate_move`), `:449` (`post`); ODO `account_move.py:2945`, `:2964`.
- **Ficha:** FC-02, FC-03. Coincide con I1 y con `validarAsiento` (`contab/asiento.ts:119`).

### R-A-02 · Cuadre con umbral fijo de un centavo (OFBiz)
- **Regla:** OFBiz suma debe y haber con 4 decimales y rechaza si la diferencia llega a 0,01 en cualquier sentido.
  Además rechaza «debe en cero con haber distinto de cero» y al revés.
- **Algoritmo:** `dif = Σdebe − Σhaber` (4 decimales, HalfUp). Error si `dif ≥ 0,01` o `dif ≤ −0,01`.
- **Casos borde:** una diferencia de 0,0099 **pasa sin línea de ajuste**: el mayor queda descuadrado por fracciones
  de centavo. El asiento todo en cero no se rechaza. Si hay errores y la organización tiene «diario de errores»,
  el asiento no se rechaza: se manda a ese diario sin contabilizar.
- **Vectores:**
  1. D 100,0000 / H 100,0000 → contabiliza.
  2. D 100,0050 / H 100,0000 → contabiliza con 0,0050 de descuadre.
  3. D 100,01 / H 100,00 → error «trial balance failed».
  4. D 0 / H 50,00 → dos errores (descuadre y «debe en cero»).
- **Cita (Apache-2.0, © Apache Software Foundation, OFB-AT `:196-205`, abreviada):**
  ```xml
  <if-compare field="trialBalanceResultMap.debitCreditDifference" operator="greater-equals" value="0.01" type="BigDecimal">
      <add-error>...TrialBalanceFailed.../></add-error>
  </if-compare>
  <if-compare field="trialBalanceResultMap.debitCreditDifference" operator="less-equals" value="-0.01" type="BigDecimal">
  ```
- **Fuente:** OFB-AT `:129` (`calculateAcctgTransTrialBalance`), `:181` (`postAcctgTrans`); OFB-GL `:2883`;
  `applications/accounting/config/arithmetic.properties:24-26`.
- **Ficha:** FC-02. **No adoptar** el umbral; sí la idea de la cola de errores (ver R-A-23).

### R-A-03 · Tolerancia por tipo de comprobante y línea de redondeo (ERPNext)
- **Regla:** si el asiento generado por un documento no cuadra por poco, se agrega una línea a la cuenta de
  redondeo; si no cuadra por mucho, se rechaza.
- **Algoritmo:** `p` = decimales de la moneda local; `dif = redondear(Σ(debe − haber), p)`.
  Tolerancia: `5 / 10^p` para asiento manual y pago (0,05 con 2 decimales); `0,5` para el resto.
  1. `|dif| > tolerancia` → error (salvo asiento manual de tipo «diferencia de cambio»).
  2. si no, y `|dif| ≥ 1/10^p` → línea de redondeo: `dif > 0` va al haber, `dif < 0` va al debe.
  3. se recalcula y se vuelve a controlar.
- **Casos borde:** si ya existe una línea a la cuenta de redondeo, se reutiliza y se recalcula, y se elimina si
  queda en cero; con asientos de apertura usa otra cuenta («redondeo de apertura») y si no está configurada falla;
  la diferencia en moneda de la transacción se calcula aparte y se graba en la misma línea; hereda centro de costo.
- **Vectores (p = 2):**
  1. Factura, D 121,00 / H 120,97 → línea de redondeo H 0,03.
  2. Factura, D 100,00 / H 100,50 → línea de redondeo D 0,50 (justo en el límite: no supera 0,5).
  3. Factura, D 100,00 / H 100,51 → error.
  4. Asiento manual, D 100,00 / H 99,94 → error (0,06 > 0,05).
  5. D 100,004 / H 100,00 → cada línea se redondea antes: diferencia 0,00, sin línea.
- **Fuente:** ERN `ERN-acc/general_ledger.py:429`, `:462`, `:486`, `:510`, `:613`.
- **Ficha:** FC-02 («conversión de Float a centavos con redondeo único»), FC-01 (rol nuevo: cuenta de redondeo).

### R-A-04 · Tres cuadres encadenados: moneda de origen, segmento y moneda contable (iDempiere)
- **Regla:** el motor de contabilización controla en orden: (a) que cuadre en la moneda del documento, (b) que
  cuadre por organización, (c) que cuadre en la moneda contable. En cada paso intenta corregir una vez y si sigue
  sin cuadrar devuelve «no balanceado».
- **Algoritmo:** antes de generar líneas valida documento balanceado, convertible y período abierto. Por cada
  esquema contable: cuentas válidas → distribución → (a) → (b) → (c).
  (a) se saltea si el documento es multimoneda o las líneas tienen más de una moneda; si no cuadra y está activada
  la «cuenta puente», agrega una línea por la diferencia (saldo negativo → debe; positivo → haber).
  (b) agrega líneas «deudor/acreedor entre organizaciones». (c) ver R-A-05.
- **Casos borde:** sin cuenta puente, la diferencia en (a) es error; un asiento sin líneas cuadra por definición;
  una extensión puede vetar las líneas antes del cuadre.
- **Vectores:**
  1. Líneas USD D 100 / H 100, mismo tipo de cambio → pasa los tres.
  2. Líneas USD D 100 / H 99, sin cuenta puente → «no balanceado».
  3. Mismo caso con cuenta puente → línea H 1 USD en la puente; pasa (el descuadre queda a la vista).
  4. Líneas en USD y en ARS mezcladas → (a) no se controla; decide (c).
- **Fuente:** IDE `IDE-doc/Doc.java:727` (`postLogic`); `IDE-doc/Fact.java:246`, `:298`, `:334`, `:405`, `:506`.
- **Ficha:** FC-02 (orden del motor), I1 (cuadre por moneda de origen sólo en asientos de una moneda).

### R-A-05 · Diferencia de conversión: cuenta de balanceo de moneda o ajuste de la línea mayor (iDempiere)
- **Regla:** cuando cuadra en origen pero no en moneda contable (centavos de conversión), hay dos políticas por
  configuración: mandar la diferencia a una cuenta de «balanceo de moneda», o corregir el importe de la línea más
  grande (primero entre las de balance; si no hay, entre las de resultado).
- **Algoritmo:** `dif = Σdebe − Σhaber` en moneda contable.
  Con cuenta: línea nueva con importe de origen 0; `dif < 0` → debe `|dif|`; `dif > 0` → haber `dif`.
  Sin cuenta: en la línea elegida, si pesa más el debe, `debe = debe − dif`; si no, `haber = haber + dif`.
- **Casos borde:** con la cuenta activada hay una variante que da vuelta el lado y usa importe negativo según el
  lado de la línea mayor de balance; sin ninguna línea candidata queda sin corregir y falla; ajustar la línea mayor
  **cambia el importe de una cuenta real** (deudores, banco) sin dejar rastro.
- **Vectores:**
  1. D 143.241,18 / H 143.241,17, con cuenta → línea H 0,01 a balanceo de moneda.
  2. Mismo caso sin cuenta, la línea mayor es el debe de balance → queda D 143.241,17.
  3. D 100,00 / H 100,02, sin cuenta, la línea mayor es el haber → haber = 100,02 + (−0,02) = 100,00.
- **Fuente:** IDE `IDE-doc/Fact.java:548` (`balanceAccounting`); `IDE-doc/FactLine.java:810` (`currencyCorrect`).
- **Ficha:** FC-02, FC-01 (rol «diferencia de redondeo de conversión»). Adoptar la variante con cuenta.

### R-A-06 · Tolerancia inferida de la precisión de los importes (beancount)
- **Regla:** la tolerancia no es un parámetro fijo: se deduce por moneda de los decimales que usó quien cargó.
- **Algoritmo:** por cada importe con decimales, `tol = 10^(−decimales) × 0,5`; por moneda se toma el máximo (el
  más laxo) o el mínimo, según el modo. Los importes enteros no aportan. En la aserción de saldo la tolerancia es
  el doble: `10^(−decimales) × 0,5 × 2`. El residuo puede mandarse a una cuenta de redondeo.
- **Casos borde:** todos los importes enteros → tolerancia 0; precio o costo agrandan la tolerancia (producto de
  precisiones), con un tope.
- **Vectores:**
  1. Importes con 2 decimales, residuo 0,004 → cuadra (tolerancia 0,005).
  2. Importes con 2 decimales, residuo 0,006 → no cuadra.
  3. Importes 100 y −100 (enteros), residuo 0 → cuadra; residuo 0,01 → no cuadra.
  4. Aserción de saldo «1.250,00» contra saldo real 1.250,01 → pasa (tolerancia 0,01).
- **Fuente:** BEA `beancount/core/interpolate.py:72`, `:97`, `:245`; `beancount/ops/balance.py:20`.
- **Ficha:** FC-03 (aserciones de saldo para conciliación). No aplica al asiento: GSG trabaja en centavos enteros.

### R-A-07 · La línea va a un solo lado; el negativo se da vuelta
- **Regla:** una línea no puede tener debe y haber a la vez. Un importe negativo no es error en todos: ERPNext lo
  pasa al lado contrario antes de grabar.
- **Algoritmo:** restricción `debe × haber = 0` (Tryton y Odoo, en la base). ERPNext: `debe < 0` →
  `haber = haber − debe; debe = 0` (y simétrico); si ambos son negativos e iguales, se pasan a positivo; con la
  marca «neto», deja sólo la diferencia en el lado mayor. Odoo guarda un único `saldo` con signo y deriva debe y haber.
- **Casos borde:** en modo storno (Odoo) el negativo se queda en su lado; el asiento manual de ERPNext rechaza de
  entrada la línea con los dos lados cargados.
- **Vectores:**
  1. Línea D 50 / H 50 → rechazada (Tryton, Odoo, asiento manual de ERPNext).
  2. ERPNext, línea D −30 / H 0 → queda D 0 / H 30.
  3. ERPNext «neto», D 100 / H 40 → queda D 60 / H 0.
  4. Odoo, saldo −75 → D 0 / H 75; con storno → D −75 / H 0.
- **Fuente:** TRY `TRY-acc/move.py:1086-1094`; ODO `account_move_line.py:548`, `:859`; ERN
  `ERN-acc/general_ledger.py:347`, `ERN-acc/doctype/journal_entry/journal_entry.py:699`.
- **Ficha:** FC-02. GSG ya rechaza negativo y doble lado (`contab/asiento.ts:55-71`): mantener.

---

## 2. Moneda local contra moneda de origen

### R-A-08 · Conversión por línea, con redondeo comercial y prioridad de tipo de cambio
- **Regla:** cada línea guarda el importe de origen y el importe en moneda local. El local se calcula por línea:
  origen × tipo de cambio, redondeado a los decimales de la moneda local. Si la moneda de origen es la local, se copia.
- **Algoritmo (iDempiere):** tipo de cambio en este orden: el de la línea del documento, el de la cabecera, y si
  no hay, la tabla de cotizaciones para la fecha contable (en extracto bancario e imputación, la fecha de la línea).
  `local = redondear_mitad_arriba(origen × tc, decimales)`, sólo si sobran decimales.
  ERPNext: `debe = redondear(debe_en_moneda_de_cuenta × tc, p)` por línea. OFBiz: si el importe local viene vacío
  y la moneda de origen difiere, convierte; si es la misma, copia.
- **Casos borde:** sin cotización para la fecha → «no convertible», el documento no se contabiliza; redondear por
  línea hace que N líneas no sumen lo mismo que el total convertido (de ahí R-A-05); OFBiz tiene pendiente pasar la
  fecha a la conversión (usa la cotización vigente).
- **Vectores (tc 1.432,555):**
  1. 100,00 USD → 143.255,50.
  2. 33,33 USD → 47.747,05815 → 47.747,06.
  3. Tres líneas de 33,33 USD al debe (143.241,18) contra una de 99,99 USD al haber (143.241,17) → cuadra en USD
     y descuadra 0,01 en pesos → R-A-05.
  4. Línea en ARS con empresa en ARS → local = origen, sin conversión.
- **Fuente:** IDE `IDE-doc/FactLine.java:837` (`convert`), `IDE-doc/Fact.java:112`; ERN
  `ERN-acc/doctype/journal_entry/journal_entry.py:736`; OFB-AT `:39` (`createAcctgTransEntry`).
- **Ficha:** FC-02; brecha «moneda de la operación en la línea» (`CATALOGO-FC.md:51`); asiento A8.

### R-A-09 · El importe de origen lleva el mismo signo que el lado de la línea
- **Regla:** el importe en moneda de origen se guarda con signo y tiene que coincidir con el lado: positivo si la
  línea va al debe, negativo si va al haber. Si hay importe de origen, la moneda de origen es obligatoria.
- **Algoritmo:** Tryton: `importe_origen × (debe − haber) ≥ 0`. Odoo: `(saldo ≤ 0 y origen ≤ 0)` o
  `(saldo ≥ 0 y origen ≥ 0)`. Las dos son restricciones de la base, no del código.
- **Casos borde:** origen 0 con importe local distinto de 0 es válido (línea de pura diferencia de cambio); local 0
  con origen distinto de 0 también pasa la restricción.
- **Vectores:**
  1. D 143.255,50, origen +100 USD → válido.
  2. H 143.255,50, origen +100 USD → rechazado.
  3. D 12,00, origen 0 USD (diferencia de cambio) → válido.
- **Fuente:** TRY `TRY-acc/move.py:981-1007`, `:1090-1093`; ODO `account_move_line.py:552`.
- **Ficha:** FC-02 (I1); asiento A8.

---

## 3. Reversión y anulación

### R-A-10 · Dos formas de revertir: contraasiento y negativo (storno)
- **Regla:** contraasiento = copia con los lados intercambiados. Storno = copia en los mismos lados con importes
  negativos, que baja los totales de debe y haber como si el original no hubiera existido.
- **Algoritmo:** Tryton `cancelar(reversión)`: con reversión, `debe' = haber`, `haber' = debe`; sin reversión (por
  defecto), `debe' = −debe`, `haber' = −haber`. En los dos casos el importe de origen y los importes de impuestos
  cambian de signo, y cada línea nueva apunta a la original. OFBiz: copia con D↔H. Odoo: `saldo' = −saldo`,
  `origen' = −origen`, enlace al asiento revertido; con storno activado en la empresa invierte la marca de la
  línea. iDempiere: copia la línea leyendo el hecho contable original y multiplica por un factor.
- **Casos borde:** el storno necesita que el modelo acepte importes negativos (GSG los rechaza hoy); OFBiz no
  enlaza la reversa con el original; Odoo con «cancelar» contabiliza y concilia la reversa con el original.
- **Vectores (original D Deudores 121 / H Ventas 100 / H IVA 21):**
  1. Contraasiento → D Ventas 100 / D IVA 21 / H Deudores 121. Sumas del mayor de Deudores: D 121, H 121.
  2. Storno → D Deudores −121 / H Ventas −100 / H IVA −21. Sumas de Deudores: D 0, H 0.
  3. Con origen +100 USD en la línea de Deudores → la reversa lleva −100 USD en las dos formas.
- **Fuente:** TRY `TRY-acc/move.py:399`, `:437`; OFB-GL `:2459`, OFB-AT `:441`, `:457`; ODO `account_move.py:5921`;
  IDE `IDE-doc/FactLine.java:1333`, `IDE-mod/MJournal.java:260`.
  SAP: «negative postings» y motivo de reversión [A VALIDAR].
- **Ficha:** FC-03 (`contraAsiento`, `anularAsiento`). Mantener contraasiento; el storno queda fuera.

### R-A-11 · Fecha de la reversa: la del original, o la de hoy si el período está cerrado
- **Regla:** la reversa va en la fecha y el período del original mientras estén abiertos; si el período cerró, va
  con fecha de hoy en el período abierto.
- **Algoritmo:** iDempiere distingue «reversa correctiva» (misma fecha contable y mismo período, importe de control
  negado) de «reversa por devengamiento» (fecha de hoy, período recalculado). Tryton: si el período está cerrado,
  avisa y pone fecha y período de hoy. OFBiz: siempre fecha de ahora. ERPNext: valida la fecha de la reversa
  contra período contable, fecha de congelamiento y último cierre.
- **Casos borde:** ninguno guarda la fecha del original en la reversa movida, salvo por el enlace al asiento.
- **Vectores (hoy 12/11; original del 20/10):**
  1. Octubre abierto, correctiva → reversa fechada 20/10.
  2. Octubre cerrado (Tryton) → aviso y reversa fechada 12/11 en noviembre.
  3. Por devengamiento (iDempiere) → 12/11 aunque octubre esté abierto.
  4. Octubre y noviembre cerrados → no hay período abierto: error.
- **Fuente:** IDE `IDE-mod/MJournal.java:808`, `:884`; TRY `TRY-acc/move.py:399-420`; OFB-GL `:2468`; ERN
  `ERN-acc/general_ledger.py:647`. SAP: «si el período del original cerró, hay que indicar una fecha en un período
  abierto» [A VALIDAR].
- **Ficha:** FC-03; I5 (GSG suma `fechaOrigen`, que ninguno de éstos tiene).

### R-A-12 · Anular: marcar y esconder, o libro inmutable
- **Regla:** ERPNext tiene dos modos. Normal: al cancelar marca las líneas originales como canceladas e inserta las
  inversas también canceladas (ninguna aparece en los informes). Libro inmutable: no toca las originales e inserta
  las inversas vigentes, con la fecha indicada o la de hoy.
- **Algoritmo:** por cada línea vigente del comprobante: copia con D↔H en las tres monedas (local, de la cuenta y
  de la transacción) y leyenda «por cancelación de…»; se saltea la línea con todo en cero.
- **Casos borde:** bloquea las filas antes de revertir (dos anulaciones a la vez); cancelación parcial por línea de
  detalle; en modo normal el mayor de un mes ya informado **cambia hacia atrás**.
- **Vectores (original del 20/10: D 121 / H 121):**
  1. Modo normal → mayor de octubre: sin movimientos.
  2. Modo inmutable, anulado el 12/11 → octubre conserva D 121 / H 121; noviembre suma la inversa.
  3. Comprobante con una línea en cero → la inversa de esa línea no se crea.
- **Fuente:** ERN `ERN-acc/general_ledger.py:647-766`, `:768`.
- **Ficha:** FC-03. Adoptar el modo inmutable.

### R-A-13 · Asiento contabilizado: no se modifica ni se borra; el número se asigna al contabilizar
- **Regla:** un asiento contabilizado no admite cambios ni borrado; sólo quedan libres campos que no alteran el
  asiento (vencimiento, conciliación). El número definitivo y la fecha de contabilización se asignan al pasar a
  «contabilizado», desde la secuencia del período o del ejercicio.
- **Casos borde:** copiar un asiento de período cerrado lo trae a hoy, con aviso; Odoo impide borrar si hay hash de
  inalterabilidad, si la fecha es anterior al bloqueo o si es un asiento de diferencia de cambio contabilizado.
- **Vectores:**
  1. Modificar el importe de un asiento contabilizado → error de acceso.
  2. Cambiar el vencimiento de una línea contabilizada → permitido.
  3. Borrador sin número → al contabilizar recibe el siguiente de la secuencia y la fecha de hoy como contabilización.
- **Fuente:** TRY `TRY-acc/move.py:291`, `:449-520`, `:1080-1084`; OFB-AT `:24`, `:39-47`; ODO `account_move.py:5978+`.
- **Ficha:** FC-03 (estados borrador/confirmado), I3.

---

## 4. Períodos cerrados o bloqueados

### R-A-14 · Estados del período y control por tipo de documento
- **Regla:** el período no es sólo abierto o cerrado. Tryton: abierto → cerrado → bloqueado; cerrado puede
  reabrirse, bloqueado no. iDempiere: el estado se lleva **por período y por tipo de documento**, con un estado
  intermedio que impide documentos nuevos pero deja contabilizar los existentes. ERPNext: un período contable lista
  qué tipos de documento cierra, y un rol exceptuado puede seguir registrando.
- **Algoritmo:** buscar el período estándar que contiene la fecha; si no existe → error «sin período»; si existe y
  no está abierto → error «sin período abierto». Tryton además lleva un estado por diario y período.
- **Casos borde:** período de ajuste (Tryton): se superpone con el último mes y la búsqueda por fecha lo ignora, se
  elige a mano para el cierre; período inactivo = cerrado; tipo de documento sin control cargado = cerrado.
- **Vectores:**
  1. Fecha 15/10, octubre abierto → se registra.
  2. Fecha 15/10, octubre cerrado para «factura de compra» y abierto para «asiento manual» → la factura se rechaza,
     el asiento manual pasa.
  3. Fecha 15/10, sin período definido → error distinto del de período cerrado.
  4. Octubre bloqueado → reabrir: transición inexistente.
- **Fuente:** TRY `TRY-acc/period.py:41-58`, `:95-97`, `:254`, `TRY-acc/move.py:1436`; IDE `IDE-mod/MPeriod.java:726`,
  `IDE-mod/MPeriodControl.java:155-163`; ERN `ERN-acc/services/gl_validator.py:42`; OFB-AT `:232-276`.
- **Ficha:** FC-03 (brecha «período mensual»), I5.

### R-A-15 · Ventana automática de días alrededor de hoy (iDempiere)
- **Regla:** sin administrar períodos a mano: se acepta toda fecha contable entre hoy menos N días y hoy más M días.
- **Algoritmo:** `primero = hoy − días_historia`; `último = hoy + días_futuro`; rechaza si `fecha < primero` o
  `fecha > último`. Valores iniciales: 2 y 2.
- **Casos borde:** si se consulta el período entero (sin fecha), todo el período tiene que caer en la ventana; este
  modo anula el control por tipo de documento.
- **Vectores (hoy 12/11, historia 5, futuro 2):**
  1. Fecha 08/11 → abierto.
  2. Fecha 06/11 → cerrado.
  3. Fecha 15/11 → cerrado.
- **Fuente:** IDE `IDE-mod/MPeriod.java:735-767`, `IDE-mod/MAcctSchema.java:224-225`.
- **Ficha:** FC-03 (parámetro «tolerancia de asientos tardíos»).

### R-A-16 · Fecha de bloqueo y corrimiento de los documentos tardíos
- **Regla:** en vez de períodos, una fecha: nada con fecha contable menor o igual se crea ni se modifica. Odoo
  tiene varias (ejercicio, ventas, compras, impuestos y una «dura»); vale la más alta que aplique al diario. Las
  blandas admiten excepciones por usuario; la dura no. ERPNext: «cuentas congeladas hasta», con un rol que puede saltearla.
- **Algoritmo:** `bloqueo = máx(ejercicio, dura, [ventas si el diario es de ventas], [compras si es de compras])`;
  viola si `fecha ≤ bloqueo`. Documento tardío (Odoo): la fecha contable pasa a `bloqueo + 1 día` y de ahí al fin
  de ese mes o a hoy, lo que sea antes (ventas), o al fin del mes del documento si ya pasó (compras); la fecha del
  comprobante queda aparte.
- **Casos borde:** el administrador de ERPNext no saltea el congelamiento aunque tenga todos los roles; el bloqueo
  de impuestos sólo corre si el documento lleva impuestos.
- **Vectores (bloqueo de ejercicio 31/10, hoy 12/11):**
  1. Asiento manual fechado 31/10 → rechazado (el límite está incluido).
  2. Asiento fechado 01/11 → aceptado.
  3. Factura de venta con fecha de comprobante 20/10 → fecha contable 12/11, fecha de comprobante 20/10.
  4. Bloqueo de compras 15/11, diario de ventas → no aplica; manda 31/10.
- **Fuente:** ODO `company.py:786`, `:800`, `:819`; `account_move.py:2986`, `:7501`; ERN
  `ERN-acc/services/gl_validator.py:99`.
- **Ficha:** FC-03. El corrimiento es la regla I5; GSG ya tiene `fechaOrigen` en la línea.

### R-A-17 · Qué hay que cumplir para cerrar un período
- **Regla:** no se cierra un período con cosas pendientes ni salteando el orden.
- **Algoritmo:** Tryton: ningún asiento sin contabilizar en el período; ninguna cuenta dada de baja dentro del
  período con saldo; cierra los diarios del período; toma bloqueo de tabla. OFBiz: los subperíodos (meses del año)
  cerrados antes; tiene que existir una fecha de último cierre. ERPNext: el período empieza al día siguiente del
  último cierre o al inicio del ejercicio; no pasa del fin del ejercicio; el cierre anterior terminó de procesarse;
  no hay movimientos sin cerrar antes del inicio; no existe un cierre posterior; con stock, la valuación coincide
  con las cuentas contables dentro de una tolerancia.
- **Vectores:**
  1. Octubre con un asiento en borrador → no cierra (Tryton).
  2. Cerrar el ejercicio con noviembre abierto → no cierra (OFBiz).
  3. Cierre «01/11–30/11» cuando el último cierre fue el 30/09 → error: el inicio tiene que ser 01/10 (ERPNext).
  4. Cancelar el cierre de octubre con el de noviembre ya hecho → bloqueado (ERPNext).
- **Fuente:** TRY `TRY-acc/period.py:387`; OFB-GL `:543-565`; ERN
  `ERN-acc/doctype/period_closing_voucher/period_closing_voucher.py:73`, `:94`, `:145`, `:218`.
- **Ficha:** FC-03 (lista de control de cierre).

---

## 5. Cierre de ejercicio y arrastre de saldos

### R-A-18 · Asiento de cierre: refundición de las cuentas de resultado
- **Regla:** al cierre, cada cuenta de resultado se lleva a cero contra una cuenta de patrimonio (resultado del
  ejercicio o resultados acumulados), con fecha del último día.
- **Algoritmo (ERPNext):** por cada cuenta de resultado y combinación de dimensiones, `s = Σdebe − Σhaber`:
  `s > 0` → haber `s`; `s < 0` → debe `|s|`. Contrapartida por dimensión con el neto `n = Σs`: `n > 0` (pérdida) →
  debe; `n < 0` (ganancia) → haber. La cuenta de cierre tiene que ser de pasivo o patrimonio, imputable, activa, de
  la empresa y en moneda local.
  **Tryton:** igual pero por asistente y en borrador: una línea por cuenta que no arrastra saldo; la contrapartida
  va a la «cuenta acreedora» si el neto es ganancia y a la «deudora» si es pérdida, en el período elegido (el de ajuste).
  **OFBiz:** no pone en cero cada cuenta: suma haberes menos debes de las clases ingreso y gasto desde el último
  cierre (sin contar asientos de cierre) y hace un solo asiento, D «cuenta de pérdidas y ganancias» / H «resultados
  acumulados», fechado un segundo antes del fin del período.
- **Casos borde:** cuentas con saldo cero se saltean; todo en cero → no se genera asiento; en OFBiz una pérdida
  genera el asiento con importe negativo en vez de invertir los lados; si ya hay saldo de cierre guardado y no
  coincide, OFBiz da error (protege contra el doble cierre).
- **Vectores:**
  1. Ventas H 1.000, Gastos D 600 → D Ventas 1.000 / H Gastos 600 / H Resultado 400.
  2. Ventas H 500, Gastos D 800 → D Ventas 500 / H Gastos 800 / D Resultado 300.
  3. Ventas H 700, Gastos D 700 → D Ventas 700 / H Gastos 700, sin línea de contrapartida.
  4. OFBiz, caso 1 → un asiento D Pérdidas y ganancias 400 / H Resultados acumulados 400; Ventas y Gastos quedan con saldo.
- **Fuente:** ERN `…/period_closing_voucher.py:162`, `:190`, `:439`, `:460`, `:490`; TRY
  `TRY-acc/fiscalyear.py:464-546`; OFB-GL `:606-690`.
- **Ficha:** FC-03 (cierre de ejercicio), FC-01 (roles «resultado del ejercicio» y «resultados no asignados»).

### R-A-19 · Arrastre de saldos sin asiento de apertura: foto de saldos por cuenta
- **Regla:** ninguno de los cuatro genera un asiento de apertura. Las cuentas patrimoniales arrancan el ejercicio
  nuevo desde una **foto de saldos** guardada al cerrar; las de resultado arrancan en cero.
- **Algoritmo:** Tryton: por cada cuenta con tipo, si «arrastra saldo» guarda una fila (cuenta, ejercicio, debe,
  haber, cantidad de líneas, importe en segunda moneda); si no arrastra, exige saldo cero o el cierre falla.
  ERPNext: guarda saldos de cierre por cuenta y dimensión y los **acumula** con la foto anterior; para las de
  resultado guarda el movimiento y su inversa (neto cero). OFBiz: una fila por cuenta y período con saldo inicial,
  saldo final, debes y haberes. SAP: arrastre por programa que no crea documentos; resultados a una o más cuentas
  de resultados acumulados; un asiento tardío en el año anterior ajusta el arrastre solo [A VALIDAR].
- **Casos borde:** la foto guarda debe y haber por separado, no el neto, para que sumas y saldos acumulado siga
  cerrando; reabrir el ejercicio borra la foto (R-A-21); la foto queda vieja si entra un asiento tardío.
- **Vectores (cierre al 31/12):**
  1. Banco D 5.000 / H 3.200 → foto (5.000; 3.200); saldo inicial del año nuevo 1.800 deudor.
  2. Ventas con saldo 1.000 sin refundir → Tryton: el cierre falla.
  3. Proveedores con foto anterior (0; 900) y movimiento del año D 400 / H 700 → foto nueva (400; 1.600), saldo
     1.200 acreedor.
- **Fuente:** TRY `TRY-acc/fiscalyear.py:320`, `:347`; ERN `…/period_closing_voucher.py:626-686`,
  `ERN-acc/doctype/account_closing_balance/account_closing_balance.py:47`, `:99`, `:148`; OFB-GL `:690-745`, `:827`.
- **Ficha:** FC-03 («asiento de apertura», «saldos de apertura desde el último balance del estudio»).
  La práctica argentina sí usa asiento de apertura: **a confirmar con el estudio**.

### R-A-20 · Saldo inicial, saldo final y movimientos de un período
- **Regla:** el saldo de una cuenta en un período sale de dos acumulados, no de sumar el período solo.
- **Algoritmo (OFBiz):** sólo asientos contabilizados y reales. `Dᵢ, Hᵢ` = acumulados con fecha anterior al inicio;
  `D_f, H_f` = acumulados con fecha anterior al fin. Movimientos: `D_f − Dᵢ` y `H_f − Hᵢ`. Cuenta deudora:
  inicial `Dᵢ − Hᵢ`, final `D_f − H_f`; cuenta acreedora: al revés. Intervalo semiabierto: incluye el inicio,
  excluye el fin.
- **Casos borde:** que la cuenta sea deudora o acreedora sale de su clase, no del signo del saldo; el fin del
  período tiene que ser el primer instante del siguiente o se pierde el último día; cuenta sin movimientos → acumulado nulo.
- **Vectores (octubre = [01/10, 01/11)):**
  1. Banco (deudora): antes de octubre D 1.000 / H 400; en octubre D 300 / H 500 → inicial 600, final 400.
  2. Proveedores (acreedora): antes D 0 / H 900; en octubre D 200 / H 0 → inicial 900, final 700.
  3. Asiento del 01/11 a las 00:00 → no entra en octubre.
  4. Asiento en borrador en octubre → no cuenta.
- **Fuente:** OFB-GL `:747-826`.
- **Ficha:** FC-03 (mayor por cuenta, sumas y saldos); I4.

### R-A-21 · Reabrir un ejercicio: sólo el último, y se borra el arrastre
- **Regla:** se cierra en orden y se reabre en orden inverso. No se cierra un ejercicio si hay uno anterior
  abierto; no se reabre si hay uno posterior cerrado o bloqueado. Al reabrir se borra la foto de saldos.
- **Vectores (2024 y 2025 cerrados, 2026 abierto):**
  1. Reabrir 2025 → permitido; se borra la foto de 2025.
  2. Reabrir 2024 → rechazado.
  3. Cerrar 2026 con 2025 reabierto → rechazado.
  4. 2025 bloqueado → no se reabre nunca.
- **Fuente:** TRY `TRY-acc/fiscalyear.py:347-360`, `:390-405`, `:414`; ERN `…/period_closing_voucher.py:145`, `:363`.
- **Ficha:** FC-03 (parámetro «quién cierra»; sumar «quién reabre»).

### R-A-22 · Después del primer cierre no entran saldos de apertura ni nada con fecha cerrada
- **Regla:** con un cierre confirmado, (a) ya no se pueden cargar asientos marcados como «de apertura» y (b) nada
  se crea, modifica ni anula con fecha menor o igual al fin del último cierre.
- **Casos borde:** la regla (a) es global por empresa, no mira la fecha; a diferencia del congelamiento (R-A-16),
  ésta no tiene rol exceptuado.
- **Vectores (último cierre 31/12/2025):**
  1. Asiento del 31/12/2025 → rechazado «libros cerrados hasta…».
  2. Asiento del 01/01/2026 → aceptado.
  3. Asiento de apertura fechado 05/01/2026 → rechazado.
  4. Anular una factura del 15/12/2025 → rechazado.
- **Fuente:** ERN `ERN-acc/services/gl_validator.py:123`, `:137`; `ERN-acc/general_ledger.py:683-689`.
- **Ficha:** FC-03 (saldos de apertura: se cargan antes del primer cierre).

### R-A-23 · Lo que no se pudo contabilizar va a una cola con su motivo
- **Regla:** un error de contabilización no frena el documento de negocio: queda pendiente con el motivo.
- **Algoritmo:** iDempiere devuelve un estado por documento: contabilizado, no balanceado, no convertible, período
  cerrado, cuenta inválida, error. OFBiz: con «diario de errores» configurado, el asiento fallido se asigna ahí sin
  contabilizar; hay un modo «sólo verificar» que devuelve la lista de errores sin grabar.
- **Vectores:**
  1. Factura en USD sin cotización del día → «no convertible»; se reintenta al cargar la cotización.
  2. Fecha en período cerrado → «período cerrado».
  3. OFBiz, descuadre con diario de errores → no contabilizado, asignado al diario de errores, con aviso.
- **Fuente:** IDE `IDE-doc/Doc.java:727-800`; OFB-AT `:310-345`.
- **Ficha:** FC-02 («cola de sin contabilizar con su causa»).

---

## Qué conviene adoptar y qué no

| Regla | Decisión sugerida | Por qué |
|---|---|---|
| R-A-01 cuadre exacto | **Adoptar** (ya está) | Con centavos enteros no hay motivo para tolerar nada en el asiento final. |
| R-A-02 umbral 0,01 de OFBiz | **No** | Deja pasar fracciones y un asiento en cero. |
| R-A-03 tolerancia + línea de redondeo | **Adoptar adaptado** | Sirve en el motor `documento → líneas`: diferencia chica va a un rol de redondeo; grande, a la cola. Tolerancia como parámetro, no 0,5 fijo. |
| R-A-04 tres cuadres | **Adoptar los dos de moneda** | Es I1 tal cual. El cuadre por organización no aplica (un negocio = un tenant). |
| R-A-05 con cuenta de balanceo | **Adoptar** | El centavo de conversión queda visible en una cuenta. |
| R-A-05 ajustar la línea mayor | **No** | Altera deudores o banco y rompe I2 (control = auxiliar). |
| R-A-06 tolerancia inferida | **No para asientos; sí como idea** para conciliación | En centavos enteros no hay precisión que inferir. |
| R-A-07 dar vuelta el negativo | **No** | GSG rechaza el negativo; más simple y auditable. |
| R-A-08 conversión por línea, mitad arriba, tc del documento primero | **Adoptar** | Necesita moneda y tc en la línea (migración aditiva, Gate 2). |
| R-A-09 signo del importe de origen | **Adoptar** como invariante con test | Barato y evita líneas incoherentes en A8. |
| R-A-10 contraasiento | **Adoptar** (ya está) | — |
| R-A-10 storno | **No por ahora** | Exige importes negativos; no es práctica local habitual [A VALIDAR con el estudio]. |
| R-A-11 fecha de la reversa | **Adoptar** | Encaja con I5 y `fechaOrigen`. |
| R-A-12 libro inmutable | **Adoptar** | Un mes informado no cambia hacia atrás. El modo «marcar y esconder», no. |
| R-A-13 inmutable + número al confirmar | **Adoptar** | Numeración correlativa del diario sin huecos. |
| R-A-14 estados abierto/cerrado/bloqueado | **Adoptar** | Cubre la brecha de período mensual. El control por tipo de documento, **después**: es complejidad que un cliente chico no usa. |
| R-A-15 ventana de días | **Opcional** para el perfil `lite` | Cero administración, pero no reemplaza un cierre formal. |
| R-A-16 fecha de bloqueo + corrimiento | **Adoptar el corrimiento**; fecha de bloqueo como alternativa al período | Es I5. Elegir uno de los dos mecanismos, no ambos. |
| R-A-17 precondiciones de cierre | **Adoptar** | Es la lista de control de FC-03. |
| R-A-18 refundición cuenta por cuenta | **Adoptar** (variante ERPNext/Tryton) | Es el asiento de cierre que espera un estudio argentino. La variante OFBiz, no: no pone en cero las cuentas. |
| R-A-19 foto de saldos | **Adoptar como caché**, no como reemplazo del asiento de apertura | Acelera el mayor; el asiento de apertura lo define el estudio. |
| R-A-20 fórmula de saldos | **Adoptar** | Intervalo semiabierto y acumulados. |
| R-A-21 reapertura en orden inverso | **Adoptar** | Protege el arrastre. |
| R-A-22 nada de apertura tras el primer cierre | **Adoptar** | Los saldos iniciales se cargan una vez, antes de operar. |
| R-A-23 cola con motivo | **Adoptar** | Ya está pedido en FC-02. |

## No confirmado

- **SAP:** help.sap.com no resuelve desde esta sesión; no leí ninguna página. Lo citado de SAP en R-A-10, R-A-11 y
  R-A-19 sale del resumen del buscador [A VALIDAR]. Páginas a leer cuando se habilite el dominio: «Balance
  Carryforward», «Negative Postings», «Copy, Edit, and Reverse Journal Entries», «Document Reversal».
- **Licencia de Odoo** (LGPL-3.0): no abrí el archivo de licencia del repo.
- **Líneas internas:** las referencias apuntan al inicio de cada función; no verifiqué línea por línea dentro.
- **beancount:** leí sólo dos archivos; el commit es el `HEAD` remoto del momento de la descarga.
- **No leídos:** revaluación de moneda extranjera de ERPNext (`exchange_rate_revaluation`), `Doc_GLJournal` de
  iDempiere, `account.py` de Tryton (cálculo de saldos), cadena de hash de Odoo.

---

## Módulos encontrados

| Repo / ruta | Qué hace | Licencia | ¿Modelo para la ficha? |
|---|---|---|---|
| OFB `applications/accounting/minilang/ledger/AcctgTransServices.xml` | Alta de líneas, cuadre, contabilización y reversas por documento | Apache-2.0 | FC-02: sí para la cola de errores y el modo «sólo verificar»; no para la tolerancia |
| OFB `…/minilang/ledger/GeneralLedgerServices.xml` | Asientos por tipo de documento (factura, pago, stock), cierre de período, historia de saldos | Apache-2.0 | FC-02: sí como catálogo de hechos → líneas. FC-03: sí la fórmula de saldos; no el asiento de cierre |
| OFB `…/servicedef/services_ledger.xml`, `secas_ledger.xml` | Contratos de los servicios y disparadores «al pasar X, contabilizar Y» | Apache-2.0 | FC-02: sí, como lista de disparadores (no leído en detalle) |
| OFB `…/accounting/period/PeriodServices.java`, `GPeriodServices.groovy` | Búsqueda del último cierre y de períodos | Apache-2.0 | FC-03: menor |
| OFB `…/accounting/util/UtilAccounting.java` | Naturaleza deudora o acreedora por clase de cuenta | Apache-2.0 | FC-01: sí, parecido a `naturaleza` |
| OFB `…/config/arithmetic.properties` | Decimales y redondeo por ámbito (mayor 4, factura 2) | Apache-2.0 | FC-02: sí como idea de un parámetro por ámbito |
| IDE `org.idempiere.acct/…/doc/Doc.java` | Motor de contabilización: estados, período, conversión, orden de cuadres | GPL-2.0 | FC-02: **el mejor modelo** del motor y de la cola con motivo |
| IDE `…/doc/Fact.java`, `FactLine.java` | Conjunto de líneas y sus tres cuadres; conversión y reversa de línea | GPL-2.0 | FC-02: sí (I1). No el ajuste de la línea mayor |
| IDE `…/doc/Doc_GLJournal.java` | Contabilización del asiento manual | GPL-2.0 | FC-03: no leído |
| IDE `…/model/MPeriod.java`, `MPeriodControl.java` | Períodos, estados por tipo de documento, ventana automática | GPL-2.0 | FC-03: sí para el período mensual |
| IDE `…/model/MJournal.java` | Asiento manual: importe de control, reversa correctiva y por devengamiento | GPL-2.0 | FC-03: sí para las dos reversas |
| IDE `…/model/MAcctSchema.java`, `MAcctSchemaGL.java` | Esquema contable: moneda, cuentas puente, de balanceo y de resultados | GPL-2.0 | FC-01: sí como lista de cuentas de sistema (roles) |
| ERN `erpnext/accounts/general_ledger.py` | Asiento desde documento: fusión de líneas, redondeo, reversa | GPL-3.0 | FC-02: sí para redondeo y libro inmutable |
| ERN `…/accounts/services/gl_validator.py` | Validaciones: período, congelamiento, cierre, dimensiones | GPL-3.0 | FC-03: sí |
| ERN `…/doctype/period_closing_voucher/` | Comprobante de cierre: precondiciones, refundición, saldos de cierre | GPL-3.0 | FC-03: **el mejor modelo** del cierre de ejercicio |
| ERN `…/doctype/account_closing_balance/` | Foto de saldos por cuenta y dimensión, acumulada | GPL-3.0 | FC-03: sí como caché de arrastre |
| ERN `…/doctype/accounting_period/` | Período contable con tipos de documento cerrados y rol exceptuado | GPL-3.0 | FC-03: sí |
| ERN `…/doctype/journal_entry/` | Asiento manual multimoneda | GPL-3.0 | FC-03: sí para la pantalla de asiento manual |
| ERN `…/doctype/exchange_rate_revaluation/` | Revaluación de moneda extranjera al cierre | GPL-3.0 | FC-03: candidato, no leído |
| ERN `…/doctype/gl_entry/` | La línea del mayor y sus validaciones | GPL-3.0 | FC-02: menor |
| TRY `modules/account/move.py` | Asiento, línea, conciliación, cancelación, agrupar y reprogramar | GPL-3.0+ | FC-02/FC-03: sí; el más limpio para cuadre, inmutabilidad y reversa |
| TRY `modules/account/period.py` | Período: tipos, estados, cierre | GPL-3.0+ | FC-03: sí |
| TRY `modules/account/fiscalyear.py` | Ejercicio: cierre, arrastre, reapertura, asistente de refundición | GPL-3.0+ | FC-03: sí |
| TRY `modules/account/account.py` | Plan de cuentas, tipos, saldos y balances | GPL-3.0+ | FC-01: candidato, no leído |
| TRY `modules/account/journal.py` | Diarios y estado diario–período | GPL-3.0+ | FC-03: menor |
| TRY `modules/account/move_template.py` | Plantillas de asiento | GPL-3.0+ | FC-03: candidato para asientos tipo A1–A14, no leído |
| TRY `modules/account/account_chart_es.xml` | Plan de cuentas modelo en español | GPL-3.0+ | FC-01: sólo referencia; no es la norma argentina |
| ODO `addons/account/models/account_move.py` | Asiento y factura: cuadre, bloqueos, reversa, hash | LGPL-3.0 [A VALIDAR] | FC-02/FC-03: sí para fechas de bloqueo y corrimiento |
| ODO `addons/account/models/account_move_line.py` | Línea: saldo con signo, moneda, restricciones | LGPL-3.0 [A VALIDAR] | FC-02: sí para I1 y el signo de la moneda de origen |
| ODO `addons/account/models/company.py` | Fechas de bloqueo y excepciones por usuario | LGPL-3.0 [A VALIDAR] | FC-03: sí |
| BEA `beancount/core/interpolate.py`, `ops/balance.py` | Residuo, tolerancia inferida y aserciones de saldo | GPL-2.0 | FC-03: sólo la aserción de saldo, para conciliación |

Nota: `src/odoo` y `src/ingadhoc` ya estaban (son de otro frente); no los toqué. Los archivos de Odoo que usé
están aparte, en `src/odoo-account`.
