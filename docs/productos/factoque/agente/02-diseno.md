# 02 · Diseño: de un extracto a facturas, sin decirle cada vez qué facturar

> Orden del dueño (14/11/2026): «que nosotros configuremos conceptos y eso los identifiquen los
> extractos que se suban, tanto bancarios como de Mercado Pago o cualquier entidad bancaria».
> Se llama **Factoque**. Sin código, sin Prisma aplicado y sin ARCA real en esta tarea.

## 0. La idea en una frase

El negocio arma sus **conceptos una sola vez** (qué vende, cómo se factura y cómo se reconoce el cobro).
Después **sube el extracto** del banco o de Mercado Pago, o Mercado Pago lo trae solo. El **código** reconoce
cada crédito, lo ata a un concepto y arma la factura. Lo que no reconoce con certeza va a **«Para revisar»**
(excepciones), donde la IA sugiere y una persona decide.

```
extracto (banco · MP · genérico)  →  movimientos con clave única  →  ¿qué concepto?  →  propuesta  →  lote  →  ARCA
                                                                       │ (código, reglas)                 │
                                                                       └── no seguro → «Para revisar» ────┘ (persona; la IA sólo sugiere)
```

## 1. Conceptos con reglas (se configuran una vez)

Un **concepto** es «algo que el negocio cobra y factura siempre igual». Extiende «Mis productos»
(`Product` + `Atajo`, `src/lib/facturita-atajos.ts:32`): el detalle y el precio salen de ahí, y se le suman
las reglas para reconocer el cobro.

### 1.1 Qué tiene un concepto

| Campo | Ejemplo | Para qué |
|---|---|---|
| Detalle de la factura | «Clase de yoga mensual» | Va en el renglón del comprobante. Del `Product`. |
| Concepto ARCA | servicios | 1/2/3 (`CONCEPTO_ARCA`). Con servicios: el período es **el mes del cobro** (desde el 1 hasta el último día) y el vencimiento, la fecha del cobro. |
| Alícuota (sólo RI) | 21 % | Como hoy (`ALICUOTA_ARCA`). |
| Receptor | consumidor final · o un cliente fijo (CUIT, condición frente al IVA) | Un concepto «abono de Fulano SRL» factura siempre a ese CUIT. Factura A: no sale desde Factoque hoy (va a excepciones). |
| **Reglas de reconocimiento** | ver 1.2 | Cómo el código ata un movimiento a este concepto. |
| Importe | fijo $25.000 · rango $20.000–$30.000 · cualquiera | El importe de la factura es **siempre el del movimiento** (lo que entró). El rango sólo sirve para reconocer. |
| Estado | activo · pausado · de baja | De baja no se borra: las facturas lo nombran. |
| Versión | 3 | Cada cambio crea versión nueva. La propuesta guarda la versión con la que se armó. |

### 1.2 Reglas de reconocimiento (deterministas, sin IA)

Una regla es una conjunción de condiciones. Todas tienen que cumplirse:

| Condición | Cómo compara | Ejemplo |
|---|---|---|
| `origen` | igual | `banco:galicia-1234` · `mercadopago` · `cualquiera` |
| `contraparteCuit` | igual, con dígito verificador válido | 20-12345678-9 |
| `contraparteNombre` | contiene, normalizado (sin tildes ni mayúsculas, `normalizarTexto`) | «perez juan» |
| `leyenda` | contiene una de las palabras, normalizado | «yoga», «cuota» |
| `importe` | exacto, o rango cerrado `[min, max]`, en centavos | 2.500.000 |
| `referenciaMP` | prefijo o igual (link de pago, ítem de MP) | `link:clases-octubre` |

**Prioridad y empate:** el código evalúa **todas** las reglas activas. Resultado:
- **una sola** regla (de un solo concepto) coincide → concepto asignado, confianza «regla»;
- **ninguna** coincide → «Para revisar», motivo `sin_concepto`;
- **dos o más conceptos** coinciden → «Para revisar», motivo `ambiguo` (nunca se elige por orden: el orden
  escondería un error de configuración).

**Reglas que no se pueden escribir** (las rechaza la validación): una regla sin ninguna condición, una
regla sólo de importe «cualquiera», o una que coincide con **débitos**. Sólo los créditos se facturan.

### 1.3 Movimientos que nunca son venta (antes de buscar concepto)

Lo resuelve el clasificador que ya existe (`REGLAS_DEFAULT_BANCO`, `clasificador.ts:67`), ampliado:
débitos; comisiones e impuestos; transferencias entre cuentas propias (`cuitsPropios`); **liquidaciones
de Mercado Pago que entran al banco** (contraparte Mercado Pago o Mercado Libre: la venta se factura del
lado de MP), **pero sólo si MP de ese período ya está cargado** (conexión activa que lo cubre, o CSV del
período); si no, va a «Para revisar» con motivo `falta_mp`, para no dar por facturado lo que nadie facturó; reversos y contracargos; préstamos y rescates de inversiones. Van a «No es venta», visibles,
sin factura. El usuario puede corregir uno y el aprendizaje (`ReglaClasificacionBancoTenant`) lo recuerda.

## 2. Lectura de extractos

### 2.1 Tres entradas

| Entrada | Cómo llega | Qué hace el código |
|---|---|---|
| **Banco** (CSV/XLSX) | Subida en la app (celular o compu). Más adelante, por WhatsApp al número de Factoque (molde `ExtractoRecibido`). | Plantilla exacta por encabezados (`templates.ts`); si no hay, heurístico (`mapearColumnas`). |
| **Mercado Pago** | (a) la conexión OAuth que ya existe trae los pagos aprobados; (b) el CSV de actividad, para quien no conecta o para meses pasados. | Clave = `mp:<id de operación>`, la misma del aviso de MP. **En un negocio Factoque, el pago de MP no se emite por `mercadopago-auto`** (su modo `automatico` emite sin firma y con el tope de otro producto, H7): entra a este circuito como un movimiento más y sale por el lote (§4). Del CSV se toma **sólo el id**: el CSV repite el id en varias filas con importes netos (comisión, retención), así que el importe es el **bruto de la operación** (de la API si hay conexión; si no, la fila de cobro del CSV) y, si las filas no cierran, la operación va a «Para revisar». |
| **Genérico** (cualquier entidad: billeteras, cooperativas, bancos sin plantilla) | Subida | Heurístico. Con confianza < 0,8 (`CONFIANZA_MINIMA`), la IA propone el mapeo de columnas (puerto `MapeadorAsistido`, `mapeador.ts:384`) y **la persona lo confirma una vez**: queda como plantilla del negocio para esa cuenta. |

**PDF:** fuera del primer alcance (ver D3). Leer un PDF bancario es tarea de IA, y la IA no puede ser la
fuente de un importe que se factura sin una prueba aritmética (§2.3).

### 2.2 La cuenta de origen

Cada archivo se ata a una **cuenta** del negocio: banco + últimos 4 dígitos, o «Mercado Pago». La primera vez se
pregunta, después se reconoce por plantilla y encabezado. La cuenta entra en la clave del movimiento.

### 2.3 Controles del archivo (el código, antes de mirar un solo movimiento)

1. **Huella del archivo** (`sha256`): el mismo archivo dos veces → «Este extracto ya lo subiste el 03/11» y no se
   procesa de nuevo.
2. **Prueba de saldos**, cuando el extracto trae saldo: saldo anterior + Σ movimientos = saldo de cada renglón.
   El código detecta el sentido del archivo (del más viejo al más nuevo o al revés) y valida por día. **Un
   extracto sin columna de saldo no puede emitir solo**: sus propuestas quedan en nivel 1 (la persona confirma).
   Si no cierra, el archivo entero va a «Para revisar» con motivo `saldos_no_cierran`. Así un mapeo de
   columnas equivocado (débito leído como crédito, un separador de miles mal tomado) no emite una sola factura.
3. **Período**: fecha mínima y máxima. Si se solapa con un archivo anterior de la misma cuenta, se avisa y se
   sigue: el recuento por día de §3 resuelve el solape, y lo que no cierra va a revisar, nunca solo.

## 3. La clave del movimiento (arregla H1, H3 y H8) · corregida tras el dictamen B1/B2

**Banco y genérico:**
```
base   = cuenta | fecha | importe en centavos            (sin leyenda, contraparte ni referencia)
clave  = "mov:" + cuenta + ":" + sha256(base) + "#" + n
```
La leyenda, la contraparte y la referencia **no** entran en la clave: cambian entre formatos del mismo banco,
Excel las rompe (una referencia de 22 dígitos queda `2,85059E+21`) y algunos exportes recortan la leyenda. Se
usan para **reconocer el concepto**, no para identificar el cobro.

**Recuento por (cuenta, día, importe)** al cargar un archivo: `m` = veces que aparece en este archivo, `k` = veces
ya cargadas.
- `k = 0` → los `m` son nuevos, con `#1…#m`, y pueden emitirse según las reglas.
- `m ≤ k` → nada nuevo (es el mismo cobro visto otra vez, venga del mismo archivo, de otro formato o de un solape).
- `m > k` → las `m − k` de más se cargan con `#k+1…#m` y van a **«Para revisar»** (`posible_repetido`), **nunca
  solas**: pueden ser cobros nuevos de un día que el archivo anterior traía cortado, o un exporte que repite
  renglones. Las `k` se emparejan con las ya cargadas por contraparte y leyenda; las que sobran son las nuevas.

Así:
- dos cobros legítimos iguales el mismo día, primera vez → `#1` y `#2`: **dos** facturas (hoy da una, H1);
- el mismo archivo otra vez, o el mismo período en otro formato o pasado por Excel → `m ≤ k`: **cero** nuevas;
- un archivo que empieza a mitad del día (k = 1 de la mañana, m = 2 con la tarde) → la de la tarde va a revisar:
  **no se pierde y no se duplica**;
- un archivo cortado con menos renglones que el anterior → `m ≤ k`: nada.

**Mercado Pago:** clave `mp:<id de operación>`, **sólo** cuando la cuenta es de Mercado Pago. En una cuenta de
banco, la columna `referencia` nunca se convierte en `mp:` (arregla H8, `bancos-glue.ts:744`).

**En la base** (B2): `MovimientoImportado.hash` es NOT NULL y único (`schema.prisma:1493`, `:1528`) y
`generarPropuestas` descarta el segundo igual (`reglas.ts:147`, `:160`). Por eso las filas nuevas guardan
**`hash = clave`** (el único existente pasa a ser el de la clave, sin migración que lo toque) y la deduplicación de
`reglas.ts` compara claves, no la `base`. Las filas viejas quedan con su hash viejo. El test es en Postgres, no puro.

La clave va al libro `CobroFacturado` (índice único `[tenantId, clave]`), que ya es el árbitro de «una factura
por cobro» entre caminos (`cobros-facturados.ts`).

## 4. Movimiento → concepto → propuesta → lote → factura

| Paso | Lo hace | Resultado |
|---|---|---|
| 1. Leer y validar el archivo | código | movimientos con clave, o el archivo entero a revisar |
| 2. ¿Es venta? | código (clasificador) | «No es venta» o sigue |
| 3. ¿Ya está facturado? | código (libro de cobros por clave; MP por `mp:<id>`) | «Ya facturado» con la factura, o sigue |
| 4. ¿Qué concepto? | código (reglas 1.2) | concepto + versión, o «Para revisar» |
| 5. ¿Se puede facturar solo? | código: umbral de identificación del consumidor final (`UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL`), receptor RI (Factura A), fecha dentro de lo permitido (§4.1), archivo con saldo, **posible duplicado contra facturas sin cobro** (§5), tope del plan y de la autorización | propuesta **lista** o «Para revisar» |
| 6. Lote | código arma el lote del día con las listas | «23 facturas por $412.300» |
| 7. Emitir | según D1: el usuario confirma el lote, o el agente lo emite solo dentro de los topes firmados | facturas al outbox de ARCA |
| 8. ARCA | outbox existente (`procesarEnviosDelNegocio`) | CAE o rechazo. Un rechazo **no** cuenta como facturado (regla del libro). |

### 4.1 La fecha de cada factura (H4) · provisional a confirmar con la contadora (D4)

- Fecha = **la del cobro**, si está dentro de la ventana de ARCA (5 días productos, 10 servicios,
  `ventanaDeFechaArca`).
- Más vieja que la ventana: la factura sale con la **fecha más vieja permitida** y la pantalla lo dice
  («estas 4 salen con fecha 09/11 porque el cobro es de hace más de 10 días»). Va siempre con confirmación,
  nunca sola.
- Con servicios, el vencimiento es **la más tardía entre la fecha del cobro y la de la factura** (si la fecha se
  corrió, el vencimiento no puede quedar antes: la validación de hoy lo rechaza, `facturita-core.ts:250`).
- El lote se emite **en orden de fecha** y ninguna factura sale con fecha anterior a la de la **última factura
  creada y no rechazada** del mismo punto de venta y tipo (incluye las pendientes en el outbox, no sólo las
  autorizadas) (regla de correlatividad de ARCA, **a verificar en homologación**). Si una
  manual de hoy se metió en el medio, las del lote se corren a hoy.
- Consecuencia de producto: conviene **subir seguido** (semanal) y conectar Mercado Pago. El aviso lo dice.

## 5. «Para revisar» (excepciones)

Todo lo que el código no resuelve con certeza. Nada de esto se emite solo, nunca.

| Motivo | Qué ve el usuario | Qué ofrece la IA (sólo sugiere) |
|---|---|---|
| `sin_concepto` | «No sabemos qué es este cobro de $18.000 de PEREZ JUAN» | El concepto más parecido, con el porqué en una línea. Botones: «Es esto» · «Otro» · «No es venta». |
| `ambiguo` | «Coincide con Yoga mensual y con Clase suelta» | Cuál y qué regla ajustar. |
| `identificar` | importe ≥ umbral de identificación: pide CUIT/DNI y nombre | Nada: el dato lo pone la persona (o el padrón, si ya está la integración). |
| `factura_a` | el receptor del concepto es RI | Nada: Factura A no sale de Factoque hoy. |
| `fecha_vieja` | cobro fuera de la ventana | Nada. |
| `posible_duplicado` | el mismo importe ya se facturó ±3 días **en una factura que no está en el libro de cobros** (manual, abono del estudio). Se compara sólo contra esas, y cada una se usa **una sola vez** (si hay dos cobros iguales y una manual, uno solo va a revisar). Así no choca con I3 (cuotas iguales no se marcan entre sí). Obligatorio para emitir solo. | Nada. |
| `posible_repetido` | el día ya estaba cargado y este archivo trae más renglones de ese importe (§3) | Nada. |
| `falta_mp` | liquidación de MP en el banco sin MP de ese período cargado (§1.3) | Nada. |
| `saldos_no_cierran` / `mapeo` | el archivo entero | Mapeo propuesto (columnas), que la persona confirma. |
| `tope` | se llegó al tope del plan o de la autorización | Nada: ofrece pasar de plan. |

**Aprender de la corrección:** cuando la persona resuelve un `sin_concepto`, la app pregunta «¿La próxima
vez que entre de PEREZ JUAN, lo facturo como Yoga mensual?». Si dice que sí, se crea una regla nueva (versión
nueva del concepto). La IA puede **redactar** la regla propuesta; la guarda la persona, y si la regla amplía lo
que se emite solo, pide la confirmación de ampliar (ver `03-encaje-motor.md`, §3).

## 6. Lo que ve el usuario (Factoque, celular primero)

1. **Conceptos** (una vez): «¿Qué cobrás seguido?». Parte de «Mis productos». Para cada uno: «¿Cómo te
   llega la plata?» → contraparte, palabra de la leyenda, importe. Ejemplo en vivo con un movimiento real
   del último extracto: «Este cobro de ayer se habría facturado como Yoga mensual».
2. **Subir extracto**: un botón. Respuesta en criollo: «Leímos 61 movimientos: 34 ventas, 27 no son venta.
   30 listas para facturar, 4 para revisar».
3. **Para revisar**: tarjetas de a una, tres toques (patrón `PropuestaTresToques.tsx` del producto A).
4. **Lote**: «Facturar 30 por $412.300» (con D1 = confirma) o «Facturamos 30 por $412.300; podés anular
   cualquiera con nota de crédito» (con D1 = solo dentro de topes).
5. **Actividad del agente**: qué hizo solo, con qué autorización (versión y topes), y cuánto queda del tope.

Textos con la guía de estilo (ADR-080). WhatsApp-first: el aviso del lote y el «para revisar» llegan por
WhatsApp cuando el canal esté (fuera de este alcance).

## 7. Modelo de datos (propuesta; **migración aditiva, sin aplicar**, Gate 2)

| Tabla | Nueva / existente | Lo esencial |
|---|---|---|
| `ConceptoFactoque` | nueva | `tenantId`, `productId?`, `detalle`, `conceptoArca`, `alicuota?`, receptor (`docTipo`, `docNro?`, `condicionIva`), `estado`, `version`. Único `(tenantId, id)`. RLS `tenant_isolation`. |
| `ReglaConceptoFactoque` | nueva | `tenantId`, `conceptoId`, `conceptoVersion`, condiciones (columnas, no JSON libre), `activa`. FK de dos columnas `(tenantId, conceptoId)`. |
| `CuentaExtracto` | nueva | `tenantId`, `tipo` (banco/mp/otra), `banco?`, `ult4?`, `plantillaJson?` (mapeo confirmado). |
| `ImportacionBancaria` | existente | **suma** `sha256` (único `(tenantId, sha256)` parcial donde no es nulo), `cuentaId?`, contenido **sellado** como `ExtractoRecibido` y `purgarDesde`. Lo viejo queda como está. |
| `MovimientoImportado` | existente | Las filas nuevas guardan **`hash = clave`** (§3): el único `[tenantId, hash]` existente pasa a proteger la clave, sin tocar la columna. **Suma** `conceptoId?`, `conceptoVersion?`, `cuentaId?`; `motivoRevision` ya existe. Las filas viejas quedan con su hash viejo. |
| `CobroFacturado` | existente | sin cambios: clave nueva `mov:…` además de `mp:` y `banco:`. |

El código tolera que la migración no esté aplicada: sin las tablas nuevas, Factoque se comporta como hoy
(sin extracto), detrás de un interruptor (`src/cambios/interruptores.ts`).
