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
de Mercado Pago que entran al banco** (contraparte Mercado Pago o Mercado Libre: la venta ya se facturó
del lado de MP); reversos y contracargos; préstamos y rescates de inversiones. Van a «No es venta», visibles,
sin factura. El usuario puede corregir uno y el aprendizaje (`ReglaClasificacionBancoTenant`) lo recuerda.

## 2. Lectura de extractos

### 2.1 Tres entradas

| Entrada | Cómo llega | Qué hace el código |
|---|---|---|
| **Banco** (CSV/XLSX) | Subida en la app (celular o compu). Más adelante, por WhatsApp al número de Factoque (molde `ExtractoRecibido`). | Plantilla exacta por encabezados (`templates.ts`); si no hay, heurístico (`mapearColumnas`). |
| **Mercado Pago** | (a) la conexión OAuth que ya existe trae los pagos aprobados (`mercadopago-auto.ts`); (b) el CSV de actividad, para quien no conecta o para meses pasados. | Clave de la operación de MP = `mp:<id>`, la misma que usa el aviso de MP: nunca dos facturas por el mismo pago. |
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
   Si no cierra, el archivo entero va a «Para revisar» con motivo `saldos_no_cierran`. Así un mapeo de
   columnas equivocado (débito leído como crédito, un separador de miles mal tomado) no emite una sola factura.
3. **Período**: fecha mínima y máxima. Si se solapa con un archivo anterior de la misma cuenta, se avisa y se
   sigue: la clave del movimiento resuelve el solape (§3).

## 3. La clave del movimiento (arregla H1 y H3)

```
base   = sha256( cuenta | fecha | importe en centavos | leyenda normalizada | contraparte | referencia )
clave  = "mov:" + cuenta + ":" + base + "#" + n
```

`n` es el número de vez que aparece esa misma `base` **en ese día y en esa cuenta**, en el orden del archivo
(1, 2, 3…). Por qué así:
- dos cobros legítimos iguales el mismo día dan `#1` y `#2`: **dos** facturas (hoy da una, H1);
- el mismo archivo otra vez da los mismos `#1` y `#2`: **cero** facturas nuevas;
- un extracto que se solapa y trae ese día completo da los mismos `n`: no duplica; si el día quedó cortado en el
  primero y trae una ocurrencia más, aparece `#3`, que es justamente el cobro nuevo;
- con referencia de MP (`id de la operacion`), la clave pasa a ser `mp:<id>` y el ordinal no hace falta.

La clave va al libro `CobroFacturado` (índice único `[tenantId, clave]`), que ya es el árbitro de «una factura
por cobro» entre caminos (`cobros-facturados.ts`).

## 4. Movimiento → concepto → propuesta → lote → factura

| Paso | Lo hace | Resultado |
|---|---|---|
| 1. Leer y validar el archivo | código | movimientos con clave, o el archivo entero a revisar |
| 2. ¿Es venta? | código (clasificador) | «No es venta» o sigue |
| 3. ¿Ya está facturado? | código (libro de cobros por clave; MP por `mp:<id>`) | «Ya facturado» con la factura, o sigue |
| 4. ¿Qué concepto? | código (reglas 1.2) | concepto + versión, o «Para revisar» |
| 5. ¿Se puede facturar solo? | código: umbral de identificación del consumidor final (`UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL`), receptor RI (Factura A), fecha dentro de lo permitido (§4.1), tope del plan y de la autorización | propuesta **lista** o «Para revisar» |
| 6. Lote | código arma el lote del día con las listas | «23 facturas por $412.300» |
| 7. Emitir | según D1: el usuario confirma el lote, o el agente lo emite solo dentro de los topes firmados | facturas al outbox de ARCA |
| 8. ARCA | outbox existente (`procesarEnviosDelNegocio`) | CAE o rechazo. Un rechazo **no** cuenta como facturado (regla del libro). |

### 4.1 La fecha de cada factura (H4) · provisional a confirmar con la contadora (D4)

- Fecha = **la del cobro**, si está dentro de la ventana de ARCA (5 días productos, 10 servicios,
  `ventanaDeFechaArca`).
- Más vieja que la ventana: la factura sale con la **fecha más vieja permitida** y la pantalla lo dice
  («estas 4 salen con fecha 09/11 porque el cobro es de hace más de 10 días»). Va siempre con confirmación,
  nunca sola.
- El lote se emite **en orden de fecha** y ninguna factura sale con fecha anterior a la última autorizada del
  mismo punto de venta y tipo (regla de correlatividad de ARCA, **a verificar en homologación**). Si una
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
| `posible_duplicado` | mismo importe facturado por otro camino ±3 días (`whereYaFacturadaPorOtraVia`) | Nada. |
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
| `MovimientoImportado` | existente | **suma** `clave` (§3; único `(tenantId, clave)` parcial donde no es nula), `conceptoId?`, `conceptoVersion?`, `motivoRevision` ya existe. El `hash` viejo queda para las filas viejas. |
| `CobroFacturado` | existente | sin cambios: clave nueva `mov:…` además de `mp:` y `banco:`. |

El código tolera que la migración no esté aplicada: sin las tablas nuevas, Factoque se comporta como hoy
(sin extracto), detrás de un interruptor (`src/cambios/interruptores.ts`).
