# Relevamiento de balanzas comerciales — etiqueta EAN-13 y peso en vivo

**Fecha:** 2026-10-20 · **Para:** el mostrador de carnicería del ERP (que se conecte con cualquier balanza comercial) · **Tipo:** investigación, no toca código.

## 0. Cómo leer este documento

**Estados de cada dato:**

| Estado | Qué significa |
|---|---|
| **CONFIRMADO** | Sale de un manual u hoja técnica **del fabricante**, o del organismo (GS1). |
| **CONFIRMADO\*** | El documento del fabricante existe y se citó, pero **el proxy de esta sesión no dejó descargarlo**. El dato sale del extracto que muestra el buscador sobre ese PDF. Antes de dar por cerrado el driver, alguien con internet libre tiene que abrir el PDF y revisarlo. |
| **REF-IMPL** | Sale de código abierto que se usa en producción y que cita el manual del fabricante (Odoo, ACBr), o de una biblioteca que cita la norma GS1 (biip). Leí el código fuente completo. |
| **PROVISIONAL** | Viene de un foro o un revendedor, de un manual de otro modelo, de memoria técnica o de una inferencia. **Hay que validarlo con una balanza real.** |
| **NO ENCONTRADO** | Lo busqué y no apareció. No se inventa nada. |

**Límite de esta sesión, para que conste:** el proxy de salida **bloqueó** (403 / sin DNS) gs1.org, ref.gs1.org, gs1.se, systel.com.ar, soporte.systel-global.com, kretz.com.ar, toledobrasil.com, mt.com, casscale.com.au, cas-usa.com, dibal.com, digisystem.com, moretti.com.ar, manualslib, scribd, pdfcoffee, yo-facturo.com, docs.google.com y Wikipedia. Sólo se pudo leer **raw.githubusercontent.com** (código abierto) y los **extractos del buscador web**. Por eso casi nada figura como CONFIRMADO pleno y muchos datos quedan en CONFIRMADO\*.

**Conclusión de diseño, antes del detalle:** no existe un formato único. El ERP tiene que tratar **la etiqueta** y **el protocolo serie** como **perfiles configurables por balanza**, con un perfil de fábrica por marca y un asistente que *aprende* el formato a partir de una etiqueta real escaneada o de una trama capturada. Los perfiles de abajo son los valores de partida.

---

## 1. Resumen por marca

| Marca / línea | Etiqueta EAN-13 de fábrica | Estado etiqueta | Peso en vivo (serie) | Estado serie | Conexión física |
|---|---|---|---|---|---|
| **Systel** Cuora / Cuora Max / Cuora Neo (etiquetadoras) | `20 PPPP IIIIII C`: cabecera 20, PLU de 4 dígitos, **importe** de 6 dígitos. Para venta por unidad la cabecera es 21. Los campos se pueden reconfigurar (S, P, I, B, C). | CONFIRMADO\* (manual Cuora Max ST y manual Cuora). Los decimales del importe: **NO ENCONTRADO** | Pedido con `0x05` (ENQ). Respuesta `STX + peso ASCII (6, o 7 con signo) + ETX + XOR`, de 9 o 10 bytes. Si el peso está inestable responde **un solo byte de error**. | CONFIRMADO\* (protocolo RS232 oficial de Systel). Hay detalles en conflicto, ver §4.3 | RS-232. La Cuora Max suma USB, Ethernet y WiFi |
| **Systel** Croma / Clipse / Bumer (sólo peso) | No imprime | — | Mismo protocolo ENQ de Systel, a 9600 8N1 | CONFIRMADO\* (manual Clipse/Croma) | RS-232 DB9 |
| **Kretz** Report NX / LT / Pro | Cabecera 20 de fábrica (configurable a cualquier número de 2 dígitos), formato **2-5-5**: PLU de 5 dígitos y **peso, unidades o importe** de 5 dígitos. En el menú se elige si va peso o importe. | CONFIRMADO\* (manual Report NX/LT y Report Pro) | Report NX: protocolo **comando-respuesta** propio (`02h` + tipo `C` + ID de 2 dígitos + comando de 4 dígitos ASCII + datos + checksum de 2 dígitos + `04h`). El comando que pide el peso: **NO ENCONTRADO**. | CONFIRMADO\* parcial (*Multiprotocolo Report NX*, R30, junio de 2023) | RS-232/RS-485, Ethernet o WiFi (TCP/IP). La Report LT, por USB según un proveedor de POS |
| **Kretz** Novel / Delta / Aura / Lura (sólo peso) | No imprime | — | **NO ENCONTRADO.** Los revendedores venden un kit "RS-232 a RS-232 + adaptador USB" | PROVISIONAL | RS-232 DB9, con adaptador USB-serie |
| **Toledo** Prix 3 Fit / Plus, 9094 (Brasil) | La Prix 4 Uno imprime EAN-13 "GS1, configurable". Formato de fábrica: **NO ENCONTRADO** | NO ENCONTRADO | **Prt1 / Prt3:** `ENQ` → `STX PPPPP ETX`, y `IIIII` / `NNNNN` / `SSSSS` para inestable, negativo y sobrecarga. **Prt2:** `STX + 6 caracteres + CR`, continuo o al imprimir. **Prt5:** 8N1. **PHID:** USB HID. | CONFIRMADO\* (manuales Toledo do Brasil) + REF-IMPL (ACBr) | RS-232 DB9 (cable *null-modem* hembra-hembra) o USB (HID o conversor) |
| **Toledo / Mettler** continuo 8142 / 9091 / P03 | — | — | `STX SWA SWB SWC PPPPPP TTTTTT CR [CHK]`, continuo. CHK = complemento a 2 de la suma de los 7 bits bajos | CONFIRMADO\* (manual IND429 de mt.com) + REF-IMPL (ACBr). Bits de estado: PROVISIONAL | RS-232 |
| **Toledo** 8217 (Viva, Ariva-S) | — | — | 9600 **7E1**, comando `W` → `STX peso CR`. También acepta `Z`, `T` y `C` | REF-IMPL (Odoo, que cita el manual de servicio de la Viva) | RS-232 o USB (la Ariva-S expone el mismo protocolo por USB) |
| **CAS** CL5000 / CL5500 / LP (etiquetadoras) | Guía de CAS: `02-IIIII-PPPPP-C` (prefijo 02, ítem de 5, **importe** de 5). Variante de peso: `02-NNNNN-WWWWW-C`. Formatos predefinidos: `DIIIIIPPPPPPC`, `DDIIIIIPPPPPC`, `DIIIIIIPPPPPC` (menú 1520) | CONFIRMADO\* (guía de CAS Australia y manual CL5000) | — | — | RS-232 o Ethernet |
| **CAS** PD-II / PDN / PDS / AD (de interfaz POS) | — | — | **CAS-22:** `ST`/`US`/`OL`, `GS`/`NT`, ID, lámpara, peso de 8 bytes, unidad, CR LF. **PD-II Type 0/1:** el host manda `W` y la balanza envía cada vez que cambia el peso; `CR` corta el envío. **Type 6:** ENQ → ACK → DC1 | CONFIRMADO\* (manuales PDN, PDS y PD-II). Posiciones exactas de los bytes: PROVISIONAL | RS-232 DB9 (9600, 8N1 o 7E1 según el tipo) |
| **Dibal** G-310 / G-325 / Mistral / D-900 | Imprime EAN-13. La cabecera se programa "según protocolo". Estructura de fábrica: **NO ENCONTRADO** | NO ENCONTRADO | G-325: **40 protocolos** seleccionables en la balanza. G-310: un solo protocolo, que se cambia por telecarga. Dibalcom (serie A/K): 9600 **7E**. Trama: **NO ENCONTRADO** | PROVISIONAL | RS-232 DB9 (cable especial DB9-DB9) |
| **Digi** SM-100 / SM-110 / SM-120 / DS-781 | Plantillas F (bandera), C (ítem), W (peso), P (precio) y CD. Bandera configurable entre 0 y 99. Plantilla de fábrica: **NO ENCONTRADO** | CONFIRMADO\* (manuales SM-100 y SM-120) | DS-781 "RS type": 8 bits, paridad opcional, envío "estable" o "incondicional". Trama: **NO ENCONTRADO** | CONFIRMADO\* parcial | RS-232 (sólo en los modelos RS). La SM, también Ethernet |
| **Moretti** LPA / LAP / Croma / Vectra 3.0 | La Vectra 3.0 es etiquetadora (Ethernet + ScaleNet). Formato: **NO ENCONTRADO** | NO ENCONTRADO | Las LPA/LAP tienen "RS-232 para PC o impresora", según los revendedores. Protocolo: **NO ENCONTRADO** | PROVISIONAL | RS-232 (LPA/LAP) o Ethernet/WiFi (Vectra) |
| **Gama**, **Magriña** | **NO ENCONTRADO** | — | **NO ENCONTRADO** | — | — |

---

## 2. Etiqueta EAN-13 de peso o importe variable (prefijo 2x)

### 2.1 Marco GS1 (vale para todas las marcas)

- Los prefijos **20 a 29** (y el **02**) son de **circulación restringida, para uso interno del comercio**. GS1 no los asigna y la estructura la define cada organización GS1 nacional o cada comercio. GS1 los llama **VMN-13** (*variable measure numbers*). — CONFIRMADO\* (GS1 UK y GS1 Austria; la página de GS1 Argentina **NO ENCONTRADO**).
- **Consecuencia:** el formato **no sale de la norma**. Sale de lo que esté configurado en la balanza del local, y por eso el ERP tiene que ser configurable.

### 2.2 Formatos de fábrica por marca

| Marca | Plantilla (13 dígitos) | Prefijo | Dígitos de PLU | Valor | ¿Dígito verificador interno de precio? | ¿UPC-A de 12? | Estado / fuente |
|---|---|---|---|---|---|---|---|
| Systel Cuora (todas) | `2 0 P P P P I I I I I I C` | 2 dígitos (20 por peso, 21 por unidad) | 4 (un PLU de 5 dígitos **no se imprime** con la configuración de fábrica) | **Importe**, 6 dígitos. Los decimales **no están documentados** | No (no figura) | No (no figura) | CONFIRMADO\*: [Cuora Max ST, pág. 40](https://www.manualslib.es/manual/289456/Systel-Cuora-Max-St.html?page=40) · [manual Cuora](https://soporte.systel-global.com/downloads/Manuales-de-usuario/Manuales-Usuario-Systel/CUORA-manual_ESP.pdf) · [manual Cuora Neo](https://soporte.systel-global.com/downloads/Manuales-de-usuario/Manuales-Usuario-Systel/CUORA-NEO-manual_ESP.pdf). Los decimales: PROVISIONAL ([PR de un tercero](https://github.com/GonzaloSevilla22/v0-saa-s-empresarial-completo/pull/599) que deja esto como supuesto) |
| Kretz Report NX / LT / Pro | `2 0 P P P P P V V V V V C` | 2 dígitos (20 de fábrica, para pesables y no pesables, configurable) | 5 | **Peso o importe** (o unidades), 5 dígitos. Se elige en el menú *Formato Cod Barra*. Hay 3 combinaciones de formato | No (no figura) | No | CONFIRMADO\*: [manual Report NX/LT](https://www.kretz.com.ar/shop/balanza-report-nx-visor-bajo-341/document/47) · [manual Report Pro](https://www.kretz.com.ar/en/shop/balanza-report-pro-589/document/269) · [Report NX LCD, pág. 18](https://www.manualslib.es/manual/102957/Kretz-Report-Nx-Lcd.html?page=18) · [caja LEGA de Kretz, lectura 2-5-5](https://servimaq.com.ar/storage/descargas/13/Manual%20Usuario_LEGA%20(1).pdf) |
| CAS CL5000 / LP | `0 2 I I I I I P P P P P C`, o `DDIIIIIPPPPPC` | 2 dígitos ("02" en la guía; configurable) | 5 (6 en `DIIIIIIPPPPPC`) | **Importe** de 5 (6 en `DIIIIIPPPPPPC`), o peso en la variante `NNNNN-WWWWW` | No en los formatos de fábrica | CAS USA vende etiquetas "UPC". No confirmé la configuración | CONFIRMADO\*: [guía CAS de códigos para POS](https://www.casscale.com.au/wp-content/uploads/Scanning-Setting-Up-Barcodes-for-POS.pdf) · [manual CL5000](https://www.manualslib.com/manual/1073197/Cas-Cl5000-Series.html) |
| Toledo Prix 4 Uno | "EAN-13 GS1, totalmente configurable" | — | — | — | — | — | NO ENCONTRADO el de fábrica ([ficha de un revendedor](https://www.automasite.com.br/balanca-etiquetadora/balanca-etiquetadora-toledo-prix-4-uno)) |
| Dibal | Cabecera EAN programable | — | — | Peso o importe, fijo o variable | — | — | NO ENCONTRADO ([D-900](https://www.dibal.com/en/touch-screen-scales-d-900-series)) |
| Digi SM | Plantillas F/C/W/P/CD, bandera 0–99 | Configurable | — | Peso, precio, cantidad o precio unitario | — | Tiene plantillas de 8 dígitos (EAN-8) | CONFIRMADO\* parcial ([SM-120](https://www.tecstore.co.uk/images/sm120-manual.pdf), [SM-100](https://www.itgstore.ro/download/manual-cantar-digi-sm-100b-cu-eticheta-615kg-display-liniar-11791.pdf)) |
| Moretti / Gama / Magriña | — | — | — | — | — | — | NO ENCONTRADO |

**Qué conviene hacer en el ERP:**

- **Perfil por defecto Systel:** `20|PLU4|IMPORTE6`. **Perfil por defecto Kretz:** `20|PLU5|VALOR5`, donde el valor puede ser peso o importe. **Perfil por defecto CAS:** `02|PLU5|IMPORTE5`.
- **Siempre preguntar al configurar:** (a) si el valor es **peso o importe**; (b) cuántos **decimales** tiene (el peso suele ir en gramos con 3 decimales implícitos, y el importe en pesos argentinos con 0 o 2 decimales); (c) si hay **dígito verificador de precio** (sólo aparece en formatos europeos y de GS1, ninguno de los de fábrica argentinos lo muestra).
- **UPC-A de 12 dígitos** (EE. UU., *number system 2*: `2 IIIII V PPPP C`): ninguna marca argentina lo trae de fábrica. Igual hay que soportarlo, porque un lector lo puede entregar como EAN-13 con un `0` adelante. — PROVISIONAL ([foro de Seagull](https://support.seagullsoftware.com/hc/ja/community/posts/115001040828-Random-Weight-Type-2-UPC-Barcode)).

### 2.3 Etiquetas de ejemplo (dígito de control EAN-13 calculado y verificado)

| Perfil | Código | Lectura |
|---|---|---|
| Systel `20 PPPP IIIIII C` | `2001230045500` | PLU 0123, importe 004550, es decir $4.550 (sin decimales) o $45,50 (con 2 decimales). Hay que confirmar los decimales |
| Kretz 2-5-5 | `2000123012506` | PLU 00123, valor 01250, es decir 1,250 kg (3 decimales) o $1.250 |
| Systel por unidad (cabecera 21) | `2100123003259` | PLU 0123, valor 003259 |
| GS1 con verificador de 4 dígitos `20 IIIII V PPPP C` | `2001234928755` | Ítem 01234, V = 9, precio 2875 |
| GS1 con verificador de 5 dígitos `20 IIII V PPPPP C` | `2001236146850` | Ítem 0123, V = 6, precio 14685 |
| UPC-A tipo 2 (12 dígitos) | `201234928751` | Ítem 01234, V = 9, precio 28,75 |

---

## 3. Algoritmo GS1 del dígito verificador de precio ("price check digit")

**Fuente:** GS1 General Specifications, §7.9.2 (tablas), §7.9.3 (campo de 4 dígitos) y §7.9.4 (campo de 5 dígitos). La norma está en gs1.org, que estaba bloqueado en esta sesión. El ejemplo de 5 dígitos coincide con el documento oficial [GSCN 23-244 de GS1](https://www.gs1.org/docs/barcodes/GSCN-23-244-correct-check.pdf) (CONFIRMADO\*: el extracto muestra los productos ponderados 5, 8, 7, 4, 9, el resultado 7 y el dígito 6). Las tablas y el ejemplo de 4 dígitos salen de [biip, `checksums.py`](https://raw.githubusercontent.com/jodal/biip/main/src/biip/checksums.py) (REF-IMPL, cita las §7.9.2 a 7.9.4). Rehice a mano los dos ejemplos y dan bien.

### 3.1 Tablas de ponderación (el dígito d se transforma en el valor de la tabla)

| d | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **2−** | 0 | 2 | 4 | 6 | 8 | 9 | 1 | 3 | 5 | 7 |
| **3** | 0 | 3 | 6 | 9 | 2 | 5 | 8 | 1 | 4 | 7 |
| **5+** | 0 | 5 | 1 | 6 | 2 | 7 | 3 | 8 | 4 | 9 |
| **5−** | 0 | 5 | 9 | 4 | 8 | 3 | 7 | 2 | 6 | 1 |

(Las tablas 2−, 5+ y 5− son "multiplicar por el factor y sumar los dígitos del producto", con resta o suma de la decena según el signo. La 3 es simplemente 3·d mod 10.)

### 3.2 Campo de 4 dígitos (§7.9.3)

- Ponderaciones por posición: **2−, 2−, 3, 5−**.
- Se suman los cuatro valores, se multiplica la suma por 3 y el dígito es el **último dígito** del resultado, es decir `(Σ · 3) mod 10`.
- **Ejemplo: precio `2875`**
  - 2 → (2−) = 4 · 8 → (2−) = 5 · 7 → (3) = 1 · 5 → (5−) = 3
  - Σ = 13 → 13 × 3 = 39 → **dígito verificador = 9** ✔ (es el ejemplo de biip y de GS1).

### 3.3 Campo de 5 dígitos (§7.9.4)

- Ponderaciones por posición: **5+, 2−, 5−, 5+, 2−**.
- Se suman los cinco valores. Se calcula `r = (10 − Σ mod 10) mod 10`, es decir lo que falta para llegar a la decena siguiente o igual. El dígito verificador es el **d tal que 5−(d) = r** (búsqueda inversa en la tabla 5−).
- **Ejemplo: precio `14685`**
  - 1 → (5+) = 5 · 4 → (2−) = 8 · 6 → (5−) = 7 · 8 → (5+) = 4 · 5 → (2−) = 9
  - Σ = 33 → r = 10 − 3 = 7 → en la tabla 5−, el 7 está en d = 6 → **dígito verificador = 6** ✔ (coincide con el GSCN 23-244 de GS1).

### 3.4 Vectores para tests

```text
priceCheck4("2875")  === 9
priceCheck5("14685") === 6
ean13Check("200123004550") === 0   // 2001230045500
ean13Check("200012301250") === 6   // 2000123012506
ean13Check("200123492875") === 5   // 2001234928755 (V=9 en la posición 8)
ean13Check("200123614685") === 0   // 2001236146850 (V=6 en la posición 7)
upcaCheck("20123492875")   === 1   // 201234928751
```

---

## 4. Peso en vivo por RS-232 / USB-serie — protocolos

**Convenciones:** STX = `0x02`, ETX = `0x03`, EOT = `0x04`, ENQ = `0x05`, ACK = `0x06`, CR = `0x0D`, LF = `0x0A`, DC1 = `0x11`.

### 4.1 Toledo — protocolo continuo tipo 8142 / P03 / 9091 (palabras de estado A, B y C)

- **Trama** (CONFIRMADO\*: [manual IND429 de Mettler Toledo](https://www.mt.com/mt_ext_files/Editorial/Generic/0/BA_IND429_Editorial-Generic_1132569403864_files/22013801B.pdf). REF-IMPL: [ACBr `ACBrBALToledo.pas`](https://raw.githubusercontent.com/frones/ACBr/master/Fontes/ACBrSerial/ACBrBALToledo.pas) y [ACBr `ACBrBALToledo9091_8530_8540.pas`](https://raw.githubusercontent.com/frones/ACBr/master/Fontes/ACBrSerial/ACBrBALToledo9091_8530_8540.pas)):
  ```
  [STX][SWA][SWB][SWC][P P P P P P][T T T T T T][CR][CHK opcional]
    0    1    2    3      4..9         10..15      16     17
  ```
  - El peso y la tara van en 6 dígitos ASCII, **sin coma y sin unidad**. Los ceros a la izquierda que no son significativos pueden venir como **espacios**.
  - Algunos 8530/8540 de 60 o 80 t meten un **espacio extra** después de SWC, y el peso queda en 5 dígitos (ACBr).
  - **CHK** = complemento a 2 de la suma binaria de los **7 bits bajos** de todos los caracteres anteriores, **incluidos STX y CR**. Sólo existe en modo Toledo continuo, y es activable (en Toledo do Brasil, el parámetro `C12 = L`).
  - **Transmisión:** continua, sin pedido.
  - Toledo do Brasil 9091, "protocolo B": 9600 8N1 con terminador CR (CONFIRMADO\* vía [Elipse BTR9091](https://docs.elipse.com.br/documents/en-us/driver/btr9091/latest/btr9091_enu.pdf) y foros). En Mettler clásico es habitual 7E1 (PROVISIONAL).
- **Bits de estado** (PROVISIONAL: sale de memoria técnica del formato *Standard Continuous* de Mettler. ACBr corrobora SWA bits 0–4 y SWB bits 1–3. El manual IND429 tiene la tabla pero el extracto no la mostraba):

| Palabra | bits 0–2 | bits 3–4 | bit 5 | bit 6 | bit 7 |
|---|---|---|---|---|---|
| **SWA** | Punto decimal: `000` XX00 · `001` XXX0 · `010` XXXX · `011` XXX.X · `100` XX.XX · `101` X.XXX · `110` .XXXX · `111` .XXXXX | Incremento: `01` ×1 · `10` ×2 · `11` ×5 | siempre 1 | siempre 0 (ACBr dice 1, hay que verificarlo) | paridad |
| **SWB** | b0 = 1 neto / 0 bruto · **b1 = 1 negativo** · **b2 = 1 fuera de rango** | **b3 = 1 en movimiento** · b4 = 1 kg / 0 lb | siempre 1 | b6 = 1 cero no capturado al encender | paridad |
| **SWC** | Unidades extendidas | b3 = pedido de impresión · b4 = dato expandido ×10 | siempre 1 | 0 | paridad |

- **Ejemplo** (1,250 kg, estable, bruto, kg, 3 decimales, incremento ×5). SWA = `0x3D` ('='), SWB = `0x30` ('0'), SWC = `0x20` (' '):
  ```
  hex:   02 3D 30 20 30 30 31 32 35 30 30 30 30 30 30 30 0D 1C
  ascii: <STX> = 0 ␠ 0 0 1 2 5 0 0 0 0 0 0 0 <CR> <CHK=0x1C>
  ```
  Mismo peso **en movimiento** (SWB = `0x38`): `02 3D 38 20 30 30 31 32 35 30 30 30 30 30 30 30 0D 14`.
  *(Las tramas son sintéticas: están armadas según la especificación y el CHK se calculó con la regla del manual. No son una captura real.)*

### 4.2 Toledo do Brasil — Prix 3 Fit / 3 Plus / 9094 (línea "automação", a pedido)

Fuentes: CONFIRMADO\* en los manuales de Toledo do Brasil: [9094 Plus](https://saportalcorporativoprd.blob.core.windows.net/blobappportalc63534e8570/wp-content/uploads/2024/08/manual-do-usuario-10.01.24-9094-Plus.pdf) · [Prix 3 Fit](https://www.toledobrasil.com/wp-content/uploads/2024/08/MU-3-Fit-05-25-Rev.15.pdf) · [3 Plus](https://www.toledobrasil.com/wp-content/uploads/2024/08/MU-3-Plus-11-25-Rev.17.pdf) · [protocolos TI310](https://www.toledobrasil.com/wp-content/uploads/2024/08/Protocolo-de-Comunicacao.pdf). REF-IMPL: ACBr (`SolicitarPeso` manda `#05`).

| Protocolo | Disparo | Trama de respuesta | Línea serie |
|---|---|---|---|
| **Prt1 / Prt3** ("protocolo B" en ACBr) | Host → `ENQ (0x05)` | `STX PPPPP ETX`: 5 dígitos ASCII, **sin punto** (el punto lo pone el software; en una de 15/30 kg son 3 decimales). Con estado: `IIIII` inestable · `NNNNN` negativo · `SSSSS` sobrecarga | 2400, 4800 o 9600 según el modelo. Los foros dan Prt3 a 9600 (PROVISIONAL) |
| **Prt2** ("protocolo C") | Continuo (si `C16` está activo) o con la tecla imprimir | `STX + 6 caracteres + CR`. No transmite con peso 0,000. La 9098 agrega "kg" | El manual del 3 Fit sólo deja 4800 para Prt2 (los manuales se contradicen entre sí) |
| **Prt5** (Prix 3 Fit, Prix 3 Light) | ENQ (un protocolo hermano, el P05 de la TI200, no transmite si el peso está inestable, negativo o en sobrecarga) | Formato no visible en el extracto. El PDV le manda la tara con `SOH TARA(6) ETX` | 8N1. Prix 3 Light: **4800 8N1** (foro ACBr, PROVISIONAL) |
| **PHID** | USB HID | — | **No es serie.** Ver §5 |
| Protocolo A (Prix I/II/III con precio) | Continuo | `STX S1 PPPPPP S2 TTTTTT UUUUUU CR CS`: peso, total y precio por kg. S1 bit0 = movimiento, bit3 = fuera de rango. S2 bit3 = peso con 2 decimales | REF-IMPL (ACBr) |
| Self-checkout | Comando | `STX +PPP,PPP ETX`, con `+III,III` o `-III,III` para inestable o negativo | REF-IMPL (ACBr) |

**Ejemplos (1,250 kg):**
```
Prt1/Prt3 estable:    TX 05            RX 02 30 31 32 35 30 03        <STX>01250<ETX>
Prt1/Prt3 inestable:  TX 05            RX 02 49 49 49 49 49 03        <STX>IIIII<ETX>
Prt1/Prt3 negativo:   RX 02 4E 4E 4E 4E 4E 03 (NNNNN) · sobrecarga: 02 53 53 53 53 53 03 (SSSSS)
```

### 4.3 Toledo 8217 (Mettler Viva / Ariva-S): el protocolo "de PDV" internacional

REF-IMPL: [Odoo `SerialScaleDriver.py`](https://raw.githubusercontent.com/odoo/odoo/17.0/addons/hw_drivers/iot_handlers/drivers/SerialScaleDriver.py), que cita el manual de servicio de la Viva.

- **9600 baudios, 7 bits, paridad par, 1 bit de stop.**
- Comandos: `W` pide el peso, `Z` pone a cero, `T` hace la tara y `C` borra la tara. Para detectar la balanza, Odoo manda `Ehello` y después `F`.
- Respuesta de peso: la expresión regular `\x02\s*([0-9.]+)N?\r`. Respuesta de estado: `\x02\s*(\?.)\r`; el byte que sigue a `?` trae los bits de estado (movimiento y demás).
- **Ejemplo:** `TX 57` ('W') → `RX 02 30 31 2E 32 35 30 0D` = `<STX>01.250<CR>`. Es sintético, armado según la expresión regular.

### 4.4 Systel (Croma, Clipse, Bumer, Cuora)

CONFIRMADO\*: [Protocolo de comunicación RS232 Systel (PDF oficial)](https://soporte.systel-global.com/downloads/Instructivos/Comunicacion-RS232/Protocolo%20de%20comunicaci%C3%B3n%20RS232%20Systel.pdf) · [manual Clipse, pág. 30](https://www.manualslib.es/manual/237357/Systel-Clipse.html?page=30) · [copia en Scribd](https://www.scribd.com/document/433738657/Protocolo-de-Comunicacion-RS232-Systel-ESP).

- **Línea:** 9600 baudios, 8 bits, sin paridad, 1 stop (manual Clipse/Croma).
- **Pedido:** un solo byte, `0x05`.
- **Respuesta:** los extractos del mismo PDF describen **dos variantes**. Parecen ser los dos modos que menciona un proveedor de POS ("por temporizado" y "texto continuo"):
  1. `STX($02) + peso ASCII de 6 caracteres "como se ve en el visor" (7 si es negativo, con '-') + ETX($03) + checksum XOR`, en total **9 o 10 bytes**. Si el peso está **inestable**, la balanza manda **un solo byte de error** en lugar de la trama (el valor de ese byte: NO ENCONTRADO).
  2. 8 o 9 bytes: peso de 5 o 6 caracteres + un byte de estado **`e` (estable) / `i` (inestable)** + XOR. El inicio y el fin de la trama se detectan **por tiempo, unos 5 ms**.
- **Sobre qué bytes se calcula el XOR:** no queda claro. En el protocolo Passer de Systel el XOR excluye ETX y EOT. El parser tiene que probar las variantes.
- **Systel Passer / checkout (otro protocolo):** campos separados por `|` entre STX y ETX. `W` devuelve el peso cada vez que se estabiliza y cambia, `S` devuelve el estado (BIT0 = 1 inestable) e `[I1]` la información metrológica. CONFIRMADO\*: [Anexo Comunicación Passer](https://soporte.systel-global.com/downloads/Instructivos/Passer/Anexo%20-%20Comunicacion%20Passer.pdf).
- **Ejemplo de la variante 1** (1,250 kg; sintético):
  ```
  TX 05
  RX 02 20 31 2E 32 35 30 03 XX     <STX>" 1.250"<ETX><XOR>
     XX = 0x09 si el XOR va de STX a ETX · XX = 0x08 si va sólo sobre el peso
  ```

### 4.5 Kretz

- **Report NX (y R30):** protocolo **comando-respuesta**: cada comando tiene una respuesta, todo en ASCII. Por TCP o WiFi el **ID siempre es `01`**, porque a la balanza la identifica su IP. CONFIRMADO\*: [Multiprotocolo Report NX en pdfcoffee](https://pdfcoffee.com/kretz-multiprotocolo-para-la-comunicacion-con-balanzas-report-nx-pdf-free.html) · [Scribd](https://www.scribd.com/document/674020617/KRETZ-Multiprotocolo-para-la-comunicacion-con-balanzas-REPORT-NX).
  ```
  [0x02]['C'][ID ID][CMD CMD CMD CMD][datos…][CK CK][0x04]
  ```
  El número del comando de lectura de peso y la fórmula del checksum: **NO ENCONTRADO** (están en el PDF, en "Formato de comando" y "Cálculo de checksum").
- **Novel / Delta / Aura / Lura:** se venden kits de cable RS-232 a RS-232 más adaptador USB para enviar el peso a un POS. Un foro de una Novel 3000 menciona un jumper en la placa y una configuración 8N con 1 o 2 stops (se contradice). PROVISIONAL: [Casa Schettini](https://casaschettini-shop.com/productos/kit-conexion-balanza-kretz-a-pc/) · [YoReparo](https://www.yoreparo.com/es/balanzas/preguntas/417480/conexion-balanza-kretz-novel-a-pc). **Trama: NO ENCONTRADO.**

### 4.6 CAS

- **Protocolo CAS de 22 bytes** (PDN, PDS, PDI, CI). Es ASCII y continuo o en modo comando, según la configuración. CONFIRMADO\*: [manual PDN](https://www.casscale.com.au/wp-content/uploads/CAS-PDN-User-Manual.pdf) · [manual PDS, pág. 30](https://www.manualslib.com/manual/1968819/Cas-Pds.html?page=30).
  - Campos: estado `ST` estable / `US` inestable / `OL` sobrecarga · `GS` bruto / `NT` neto · ID de dispositivo (ASCII 0x30 + n) · byte de lámparas · **peso de 8 bytes ASCII** con ceros a la izquierda y punto (13,5 kg = `'0','0','0','0','1','3','.','5'`) · unidad `kg` · `CR LF`.
  - La forma escrita habitual es `ST,GS,` + … + `kg\r\n`. **El orden exacto y los separadores de los 22 bytes son PROVISIONAL** hasta capturar una trama real.
  - Línea: **9600 8N1** (manual AD/PDI).
- **Ejemplo de trama**, PROVISIONAL (20 bytes; faltan ubicar dos para llegar a 22, por ejemplo un separador y un espacio antes de la unidad), para un parser tolerante que busque `^(ST|US|OL),(GS|NT),` y `([-+ ]?[0-9. ]{8})\s*(kg|lb)\r\n`:
  ```
  ascii: ST,GS,0␠00001.25kg\r\n      (ID '0', lámpara ' ', peso "00001.25")
  hex:   53 54 2C 47 53 2C 30 20 30 30 30 30 31 2E 32 35 6B 67 0D 0A
  inestable: 55 53 2C …  ("US,GS,…")   sobrecarga: 4F 4C 2C … ("OL,GS,…")
  ```
- **PD-II (balanza de interfaz para cajas registradoras)**, CONFIRMADO\*: [manual PD-II](https://www.casscale.com.au/wp-content/uploads/PDII-User-Manual.pdf):
  - Se elige un tipo de interfaz entre **TYPE 0 y TYPE 6**. En casi todos los tipos la línea es **9600, 7 bits, paridad par**.
  - **Type 0/1:** el host manda `W`; la balanza envía **cada vez que cambia el peso** hasta que recibe `CR`. Trama: `XX.XXX` + `KG` o `LB` + 2 bytes de estado (`b1b2`, con el bit 7 como paridad) + `CR` y `ETX`.
  - **Type 6** (Samsung ER-670): `ENQ` → `ACK` → `DC1` pide el peso. Línea 9600 8N1.

### 4.7 Dibal, Digi y Moretti

- **Dibal:** la G-325 trae **40 protocolos** seleccionables desde la balanza (y hasta 60 más por telecarga). La G-310 es de un solo protocolo, que se cambia por telecarga. Dibalcom (serie A/K) usa 9600 por defecto, **7 bits y paridad par**. CONFIRMADO\*/PROVISIONAL: [Dibal G-325](https://www.dibal.com/en/price-computing-scales-g-325) · [Balanzas del Sur](https://balanzasdelsur.es/producto/balanza-dibal-serie-g-325-rs-232-para-tpvs/) · [manual DibalCOM](http://alfa.marczyk.com.pl/marek/harnas/vat/DIBALRMS/ManualDibalCOM.pdf). **Trama: NO ENCONTRADO.** Conviene configurarla en un protocolo "Toledo/8217-compatible" si lo trae (PROVISIONAL).
- **Digi DS-781/782 (versión RS):** 8 bits, paridad que se puede activar o no, transmisión "estable" o "incondicional" y un tiempo de espera configurable. CONFIRMADO\* parcial: [manual de servicio DS-781](https://www.sbzsystems.com/download/DS-781%20Communication.pdf). **Trama: NO ENCONTRADO.**
- **Moretti:** **no hay protocolo publicado.** NO ENCONTRADO ([folleto de la Vectra 3.0](https://www.nuevaferia.com.ar/company/products/pdf/amoretti/9841/Folleto_Vectra_3.0.pdf)).

### 4.8 Estrategia de parser recomendada (deducida de lo anterior)

Para "cualquier balanza", un **autodetector** que pruebe en este orden:

1. **Escuchar 1 segundo sin mandar nada.** Si llega algo, es continuo: Toledo P03/8142 (`STX…CR`, 17 o 18 bytes), Prt2 (`STX` + 6 + `CR`), CAS-22 (`ST,`/`US,`… `\r\n`) o Systel en modo texto.
2. **Mandar `0x05` (ENQ).** Responden Systel (`STX…ETX` + XOR, o un byte de error), Toledo Prt1/Prt3 (`STX PPPPP ETX`) y CAS Type 6 (`ACK`).
3. **Mandar `W`.** Responden Toledo 8217, CAS PD-II Type 0/1 y Systel Passer.
4. **Mandar `P\r\n`.** Responde Adam (REF-IMPL Odoo: 4800 8N1).

Velocidades a recorrer: **9600 8N1 → 9600 7E1 → 4800 8N1 → 2400 8N1**.

Los parsers tienen que ser **tolerantes**: ignorar espacios, aceptar coma o punto, buscar el **último** STX del buffer (porque la trama puede llegar partida) y validar el checksum **si está presente**.

---

## 5. Conexión física y Chrome Web Serial

| Interfaz | Qué hace falta | ¿Chrome Web Serial? |
|---|---|---|
| **RS-232 DB9** (Systel Croma/Clipse/Bumer, Kretz Novel/Delta, Toledo Prix, CAS PD-II, Dibal G, Digi DS-RS, Moretti LPA) | Cable serie. Toledo usa un **null-modem DB9 hembra-hembra** ([cable Prix 3](https://produto.mercadolivre.com.br/MLB-1677485997-cabo-serial-balancas-toledo-prix-3-null-modem-db9-fxf-18m-_JM)) y Dibal un cable especial DB9-DB9 ([cable G-325](https://www.consumiblestpv.com/Cable-DB9-9-vias-Balanza-Dibal-G-325)). Las PC actuales no traen DB9, así que hace falta un **adaptador USB-serie**. | **Sí**, si el sistema operativo ve el puerto COM. Con **FTDI** el driver suele venir con Windows; con **CH340 o PL2303** a veces hay que instalar el driver del fabricante (y hay clones de PL2303 que los drivers nuevos rechazan). PROVISIONAL (experiencia general; la página de Chrome sólo dice "dispositivos USB que emulan un puerto serie") |
| **USB nativo CDC-ACM** (puerto COM virtual) | Cable USB. Windows, macOS y Linux lo reconocen sin driver. | **Sí.** CONFIRMADO\*: [Chrome: leer y escribir un puerto serie](https://developer.chrome.com/docs/capabilities/serial) · [MDN Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) |
| **USB HID** (Toledo Prt "PHID" en la Prix 3 Fit) | Cable USB | **No por Web Serial.** Hay que usar **WebHID**, o cambiar el protocolo de la balanza a serie (Prt5) y usar el conversor. PROVISIONAL (inferencia: HID no es un puerto serie) |
| **USB "impresora / teclado"** (algunas etiquetadoras) | — | No se puede leer como serie |
| **Ethernet / WiFi TCP** (Kretz Report NX/LT, Systel Cuora Max, Moretti Vectra, CAS CL, Digi SM, Toledo Prix 4) | Red local | **No.** El navegador no puede abrir sockets TCP crudos. Hace falta un **agente local o puente** (un servicio liviano en la PC del local) o el software del fabricante. Para el peso en vivo en el mostrador conviene preferir el **puerto serie** de esos equipos si lo tienen |
| **Bluetooth SPP** (p. ej. Kretz Delta con Bluetooth) | Emparejar | Chrome Web Serial soporta puertos serie Bluetooth RFCOMM en escritorio (desde la versión 117, PROVISIONAL de memoria) |

**Navegadores:** Web Serial funciona en **Chrome y Edge de escritorio** (desde la versión 89). **Safari y Firefox no lo soportan.** Exige HTTPS y un gesto del usuario para `navigator.serial.requestPort()`. Se puede filtrar por `usbVendorId` y `usbProductId`, y `getPorts()` recuerda los puertos ya autorizados. CONFIRMADO\* (Chrome y MDN). La versión 89 es PROVISIONAL (blog secundario).

**VID de referencia para filtros** (PROVISIONAL, de memoria, hay que verificarlos): FTDI `0x0403`, WCH CH340 `0x1A86`, Prolific PL2303 `0x067B`, Silicon Labs CP210x `0x10C4`.

---

## 6. Qué pedirle al local (checklist de alta de la balanza)

1. **Marca y modelo exactos** (están en la placa de atrás) y **versión de firmware**, si la balanza la muestra al encender.
2. **Foto de una etiqueta real** con el peso, el precio por kg y el importe visibles. **Escaneamos el código** y deducimos la plantilla: prefijo, dígitos de PLU, si va peso o importe y cuántos decimales. Mejor dos etiquetas del mismo PLU con pesos distintos.
3. **La configuración del código de barras de la balanza:** en Systel, *Configuración de equipo → Balanza → Código de barras*. En Kretz, *Formato Cod Barra* y si incluye peso (S/N). En CAS CL, el menú 1520.
4. **Qué conectores tiene atrás:** DB9, USB, RJ45 (Ethernet) o WiFi. Una foto alcanza.
5. **El protocolo de comunicación elegido en el menú** (Toledo: parámetros `C13`/`C14`/`C15`, por ejemplo Prt3 a 9600; CAS PD-II: el TYPE; Dibal G-325: el número de protocolo) y la **velocidad**.
6. **Qué PC usa el mostrador:** Windows, Mac o Linux, si tiene **Chrome**, y si tiene puertos USB libres.
7. **Si ya tiene cable o adaptador USB-serie**, y de qué chip (FTDI, CH340, PL2303). Si no tiene, recomendamos uno **con FTDI**.
8. **El listado de PLU** de la balanza (exportado o fotografiado), para mapearlo al catálogo del ERP. Ojo: en Systel Cuora el PLU tiene que ser **≤ 4 dígitos** con la configuración de fábrica.
9. **Autorización para capturar una trama:** 30 segundos con la balanza conectada y nuestro capturador web, con un peso estable, en movimiento, en cero y en negativo (con tara). Con eso se confirma el protocolo que quedó PROVISIONAL en este relevamiento.

---

## 7. Huecos abiertos (para cerrar con internet libre o con una balanza real)

- Systel: el valor del **byte de error** cuando el peso está inestable, el **rango exacto del XOR** y los **decimales del importe** en la etiqueta de la Cuora.
- Kretz: el **comando de lectura de peso** y el **checksum** del Multiprotocolo Report NX, y el protocolo serie de Novel/Delta/Aura/Lura.
- Toledo: confirmar la **tabla de bits de SWA, SWB y SWC** en el manual IND429 o en el de la 8142, la trama de Prt5 y el formato de etiqueta de fábrica de la Prix 4 Uno.
- CAS: el orden exacto de los **22 bytes**.
- Dibal, Digi, Moretti, Gama y Magriña: las tramas y los formatos de etiqueta de fábrica.
- GS1: descargar **GS1 General Specifications §7.9** y el PDF de **GS1 Argentina** sobre medida variable para pasar la §3 de CONFIRMADO\* a CONFIRMADO.

— Elaborado por GSG
