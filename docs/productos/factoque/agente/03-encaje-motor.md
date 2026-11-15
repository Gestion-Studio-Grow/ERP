# 03 · Encaje en el motor de agentes

> Fuentes: código del motor en `agentes/tanda-1` (`src/lib/agentes/tipos.ts`, `permisos-core.ts`) y el dictamen
> de `agentes/diseno-ejecucion`, commit `1506c9c0` (`dictamen-final.md`, `esquema-final-enmienda.md`).
> **GSG-MIA-019 corrige ese diseño: acá no se toca.** Factoque se apoya en los conceptos del motor (puesto,
> tarea, nivel, propuesta con `modo`, autorización firmada, contador de topes) y no en un detalle de columnas.
> Si MIA-019 cambia un nombre, cambia acá; la regla de cada sección se mantiene.

## 1. Principio: el agente es un empleado sin firma propia

El agente de Factoque **no decide qué es una venta ni qué se factura**. Eso lo decide el código con las
reglas que el negocio configuró y firmó. El agente:
- **corre la rutina** (leer el extracto, armar propuestas, armar el lote);
- **emite el lote sólo si** la autorización firmada lo permite y dentro de los topes (D1);
- **prepara** lo de «Para revisar» con una sugerencia de la IA, para que una persona decida;
- **nunca** anula, nunca cambia una regla y nunca amplía un tope.

Es el mismo criterio del dictamen 1506c9c0: «lo del código es 100 % determinista» (§J.41) y «la plata que
hace solo queda limitada a ... respaldo exacto». Acá el respaldo exacto es **el movimiento del extracto con su
clave**: no hay factura sin un crédito real que la respalde.

> **Diferencia deliberada con MIA:** el dictamen deja «ARCA ... con una persona» para MIA (una agencia).
> En Factoque emitir por ARCA **es** el producto. Que el agente emita solo es una excepción explícita, que
> decide el dueño (D1) y que queda acotada a: modo `REGLA`, autorización firmada, topes y respaldo por
> movimiento. Sin esas cuatro, emite una persona.

## 2. Puesto, tareas y niveles

Puesto `facturacion.factoque` (equipo `facturacion`, rol base el del titular de Factoque, módulos
`facturacion`).

| Tarea | Clase | Nivel inicial | Techo (código) | Qué hace |
|---|---|---|---|---|
| `leer_extracto` | lectura | 0 | 0 | Valida el archivo, saca movimientos con clave, prueba de saldos. |
| `proponer_facturas` | prepara | 1 | 1 | Clasifica, asigna concepto por regla, arma propuestas y el lote. |
| `emitir_lote` | ejecuta | **1** (la persona confirma) | **2** si D1 = (b) o (c); **1** si D1 = (a) | Emite el lote por el camino de emisión con cupo (§5). |
| `sugerir_concepto` | prepara | 1 | 1 | Sólo «Para revisar»: la IA sugiere concepto o regla. Nunca emite. |
| `anular` | deriva | 3 | 3 | Siempre una persona: nota de crédito. |
| `editar_conceptos` | deriva | 3 | 3 | Siempre una persona. |

Nivel efectivo = `min(techo, guardado ?? inicial)` (`nivelEfectivo`, `permisos-core.ts:33` en `agentes/tanda-1`).
Un nivel guardado mayor que el techo se ignora y se registra.

### Disparadores (orígenes del dictamen)

| Origen | Cuándo | Permiso |
|---|---|---|
| `RUTINA` | **Sólo** eventos sin una persona detrás: MP avisó un pago aprobado (conexión del negocio). El corte diario sólo emite propuestas de origen `RUTINA`; las de un archivo heredan `PEDIDO` y su `solicitadoPor` (`02-diseno.md` §3.6) | El de la autorización. |
| `PEDIDO` | **Todo archivo subido**, por la app o por WhatsApp, y el «Facturar» de la persona. `solicitadoPor` = quien lo subió (por WhatsApp, el usuario atado al teléfono verificado; si el teléfono no es de un usuario con permiso de facturación, nivel 1) | El **más chico** entre el de la persona y el de la autorización (dictamen 1506c9c0, punto 5: quien sube un extracto no dispara con el permiso del agente). |
| `CANAL` | No aplica en Factoque (no hay cliente final pidiendo factura en esta etapa). | — |

## 3. Autorización firmada por el cliente

Se usa la autorización del motor (`AgenteAutorizacion` en la enmienda): versionada, con `textoHash` calculado por
el servidor sobre el contenido canónico, irreversible al revocar o reemplazar, una sola viva por negocio.

### 3.1 Qué firma el titular de Factoque

`operaciones` (canónico):
```json
[{ "op": "factoque.emitir_por_regla",
   "conceptos": [{ "id": "c_yoga", "version": 3, "huella": "<sha256 del concepto y sus reglas>" }],
   "origenes": ["mp", "banco:galicia-1234"] }]
```
`topes` (todos en ARS, centavos; la moneda la limita el CHECK):

| Tope | Ejemplo | Lo cuenta |
|---|---|---|
| `facturas_auto_por_dia` | 20 | contador del motor, en la misma transacción que la emisión |
| `facturas_auto_por_mes` | ≤ cupo del plan | ídem; **nunca** por encima del cupo del plan (vale el menor) |
| `importe_max_por_factura` | $200.000 | por propuesta; siempre por debajo del umbral de identificación |
| `importe_auto_por_mes` | $3.000.000 | contador `monto` (BIGINT) |

El texto que ve el titular, en criollo: «Autorizo a Factoque a emitir solo, a consumidor final, las facturas de
estos 3 conceptos cuando el cobro coincide con sus reglas, hasta 20 por día, 150 por mes, $200.000 cada una y
$3.000.000 por mes. Todo lo demás me lo pregunta. Lo emitido sólo se anula con nota de crédito.»

### 3.2 Qué pide una firma nueva

La huella de cada concepto entra en `textoHash`. Por eso:
- **Ampliar** (concepto nuevo en la lista, regla que reconoce más, rango de importe más ancho, tope más alto,
  origen nuevo) → versión nueva de la autorización, con **segunda confirmación por otro canal** (dictamen,
  decisión 1 recomendada (c)). Hasta que se firma, ese concepto vuelve a nivel 1 (la persona confirma).
- **Achicar** (pausar un concepto, bajar un tope, sacar un origen) → rige al instante, sin firma: siempre se
  puede frenar. Como la autorización es inmutable, los frenos van en una **tabla propia** (`FrenoAgenteFactoque`:
  concepto pausado, tope menor, origen apagado); lo que vale es el **menor** entre lo firmado y el freno. Se registra.
- **Despausar** un concepto o **levantar** un freno cuenta como **ampliar**: pide la confirmación de ampliar.
- **Revocar** → el agente deja de emitir en la transacción siguiente (§5, paso 2).

El cambio de una regla **no** afecta propuestas ya armadas: cada propuesta guarda `conceptoId` + `version`. Si al
emitir la versión firmada no es la de la propuesta, la propuesta vuelve a «Para revisar» con motivo
`concepto_cambio`.

## 4. Qué decide el código y qué la IA

| Decisión | Quién | Por qué |
|---|---|---|
| Columnas del archivo (plantilla conocida) | código | determinista |
| Columnas de un archivo raro | **IA propone**, persona confirma una vez, la prueba de saldos verifica | la IA nunca es la fuente de un importe sin prueba aritmética |
| ¿Es venta? | código (clasificador + aprendizaje) | reglas |
| ¿Qué concepto? | código (reglas 1.2 de `02-diseno.md`) | determinista, auditable |
| ¿Cuánto? | código: el importe del movimiento | nunca un número escrito por la IA |
| ¿A quién? | código: el receptor del concepto, o consumidor final | |
| ¿Fecha? | código (§4.1 de `02-diseno.md`) | |
| ¿Se emite solo? | código: autorización viva + topes + nivel | |
| Sugerencia en «Para revisar» | **IA** | sólo texto y un `conceptoId` sugerido, que el motor revalida; la persona decide |
| Redactar una regla nueva desde una corrección | **IA** redacta, persona guarda | ampliar pide firma |
| Resumen del lote en criollo | IA opcional; el número lo pone el código | |

Contrato del adaptador de IA (dictamen 1C): devuelve **sólo argumentos estructurados** (`{ conceptoId, regla?: {...}, porque: string }`),
que el motor valida con su esquema; nunca una acción ejecutable. El `recorte` que se le manda es el mínimo: leyenda,
contraparte, importe y fecha del movimiento a revisar, y la lista de conceptos (nombre + reglas). **Nunca el archivo
entero ni movimientos de otros días.** IA con el plan de Claude en prueba (tema cerrado). Sin autorización con
`proveedorIa` y partes 1 y 5 firmadas, la IA no se llama y «Para revisar» funciona sin sugerencias.

## 5. Cómo emite el agente (una propuesta, una transacción)

Por cada propuesta del lote, **en orden de fecha**, una transacción de negocio (`tenantTransaction`):

1. `facturita-cupo:<tenant>` (candado del cupo, el mismo de la emisión manual y la anulación).
2. Leer la autorización viva **dentro** de la transacción con `SELECT … FOR SHARE` (una revocación que llega
   después espera al commit de esta factura; una que llegó antes se ve) y los frenos del negocio; si está revocada o
   reemplazada, o la propuesta no es de la versión vigente → `PERSONA`, no emite.
3. Tomar las claves del cobro (`tomarClaves`, orden fijo) y mirar el libro: si ya hay factura viva → vincular, no emite.
4. Contar el cupo del plan **en la transacción** (`planFactoqueEnTx` + facturas del mes) y los contadores de la
   autorización (`UPDATE ... SET monto = monto + x WHERE monto + x <= tope`, atómico). Si no entra → `tope`, no emite.
5. Claim de la propuesta (`lista → emitida`, `updateMany` con el estado viejo en el `where`).
6. Crear la factura (`facturarCobrosInTx` con las claves) y la `AgentePropuesta` con `clave = 'factoque:' + clave del
   movimiento` (el único de clave viva impide dos propuestas del mismo cobro), `modo = 'REGLA'`,
   `autorizacionId` + `version`, `fuenteTipo = 'movimiento'`, `fuenteId = clave`, `montoCentavos`, `origen`.
7. Commit. Fuera de la transacción: despacho a ARCA (outbox).

Orden de candados (sin abrazo mortal): `lote-factoque:<tenant>` (si corre un lote) → `facturita-cupo:` →
`cobro-facturado:<clave>` (ordenadas). Nadie los toma al revés; la emisión manual ya toma `facturita-emision` →
`facturita-cupo`.

### 5.1 Una sola vía de emisión automática en Factoque (dictamen B3)

En un negocio Factoque (`blueprintId = facturita`), **ningún** camino automático emite fuera de este: el modo
`automatico` de `mercadopago-auto` no corre (el pago de MP entra como movimiento y sale por el lote), y el
tope de cualquier camino automático sale de `planFactoqueEnTx` (molde `cartera-abonos.ts:275-276`), nunca de
`capFacturasMesDelNegocioEnTx`, que para Factoque da 159 (H7). Test C20.

## 6. «Deshacer»

- Una **propuesta** no emitida: se descarta (estado `RECHAZADA`; una rutina no la recrea, por el único de clave viva).
- Una **factura** emitida: sólo **nota de crédito**, por una persona (`anularFacturitaAction`). La `AgentePropuesta`
  pasa a `REVERTIDA` con `revierteA`. El cobro queda «facturado y anulado» en el libro: **no** se vuelve a emitir
  solo; rehacerlo es de una persona, con clave `<clave>:rehecha:<n>`.
- No hay «deshacer» antes del CAE: una vez creada la factura, el outbox la manda. La confirmación del lote (D1) es
  el momento de arrepentirse.

## 7. Dependencias con el motor

| Necesita | Estado | Si no está |
|---|---|---|
| Enmienda del esquema (autorización, propuesta con `modo`, contador con `monto`) | brief pendiente, Gate 2 | Factoque funciona en **nivel 1** sin motor: la persona confirma el lote. Todo lo de `02-diseno.md` sirve igual. |
| GSG-MIA-019 (corrección del diseño) | en curso | Se adapta el nombre; las reglas de §1-§6 no cambian. |
| Firma con segundo factor (decisión 1 del dictamen) | decisión del dueño | Sin ella, nivel 2 no se prende. |
| Expediente de liberación (tabla que no se purga) | decisión del dueño | Ídem. |
| Batería de liberación (150 casos distintos, 300 si mueve plata) | §J del dictamen | Emitir es mover plata fiscal: **300 casos**, con reservados que guarda la certificación. |
