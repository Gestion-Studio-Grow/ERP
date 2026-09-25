# Rendí — contrato de funciones (motor ↔ pantallas)

Tipos: `tipos.ts` (congelado). Este archivo fija **qué exporta el motor** y **qué hace cada función**. Las pantallas importan **sólo** de `@/lib/rendiciones` (el `index.ts`) y de `@/plugins/sap`.

Diseño y fuentes normativas: `Factory-GSG/rendiciones/01-plan-y-diseno.md`, §6 circuitos y §7 reglas.

## Quién escribe qué

| Ruta | Dueño | Qué es |
|---|---|---|
| `src/lib/rendiciones/tipos.ts` | **Congelado.** Los cambios se piden, no se hacen | Contrato de tipos |
| `src/lib/rendiciones/*.ts` y `*.test.ts` | Ingeniero de dominio | Motor puro |
| `src/plugins/sap/**` | Ingeniero de dominio | Plugin SAP, modo Archivo (puro) |
| `src/app/demo/rendiciones/escenario.ts` y `escenario.test.ts` | Ingeniero de dominio | Datos ficticios de la demo |
| `src/app/demo/rendiciones/**` (el resto) | Ingeniero de producto | Pantallas |

## Reglas para todo el código

- **Puro:** sin Prisma, sin red, sin React en `src/lib/rendiciones` ni en `src/plugins/sap`.
- **Nada de `Date.now()`:** la fecha "hoy" entra por parámetro.
- **Plata en centavos enteros.** El redondeo es `Math.round` sobre centavos. El IVA de una línea se calcula como `Math.round(neto * alicuota / 100)`.
- **Tests con el runner nativo:** `node --import tsx --test "src/lib/rendiciones/**/*.test.ts" "src/plugins/sap/**/*.test.ts"`. No se usa vitest.
- **Sin dependencias nuevas** en `package.json`.
- **Los mensajes al usuario van en criollo, sin jerga contable.** Las fuentes normativas van en `Validacion.fuente`, para el contador.

## `dinero.ts`

```ts
pesos(n: number): Centavos                  // 1234.56 → 123456 (usa round2 de @/lib/round)
formatearPesos(c: Centavos): string         // 123456 → "$1.234,56" — igual que fmtMoneyARS (formato de la casa, ADR-079)
formatearPesosCorto(c: Centavos): string    // sin ",00" si es redondo: 50000000 → "$500.000" (lo usan los mensajes)
ivaDeLinea(neto: Centavos, alicuota: Alicuota): Centavos   // Math.round(neto * alicuota / 100)
sumar(...xs: Centavos[]): Centavos
```

## `qr-arca.ts`

```ts
leerQrArca(texto: string): ResultadoLecturaQr
```
- **Qué acepta:** la URL completa `https://www.afip.gob.ar/fe/qr/?p=<base64>` o `https://www.arca.gob.ar/fe/qr/?p=<base64>` (con o sin `www`, http o https). También acepta el base64 solo.
- **Cómo decodifica:** base64 estándar o url-safe, con o sin relleno. Después hace el `JSON.parse`.
- **Qué valida:** `ver`, `fecha` (AAAA-MM-DD), el CUIT con dígito verificador (usar `cuitValido` de `@/lib/cuit`), que `ptoVta`, `tipoCmp` y `nroCmp` sean enteros positivos, que `importe` sea un número de 0 o más, `tipoCodAut` ∈ {E, A} y que `codAut` no esté vacío.
- **Errores:** en criollo. Por ejemplo, "Este QR no es de un comprobante de ARCA" o "El QR tiene un CUIT inválido".
- **Salida:** `importeTotal` va en centavos.

```ts
claseDesdeTipoArca(tipo: number): ClaseComprobante | undefined
// 1 → factura_a · 6 → factura_b · 11 → factura_c · 51 → factura_m · 81 → tique_factura_a · 82 y 83 → tique_consumidor_final
tipoArcaDesdeClase(clase: ClaseComprobante): number | undefined     // la inversa (factura_a → 1, …)
urlQrArca(l: LecturaQr): string                                     // arma la URL (arca.gob.ar) para los datos ficticios de la demo
```
En el navegador, `urlQrArca` y `leerQrArca` usan `btoa` y `atob`. En node, `Buffer`. Hay que detectar el entorno.

## `motor-fiscal.ts`

```ts
evaluarComprobante(c: Comprobante, ctx: ContextoEvaluacion): Evaluacion
```

**Orden de evaluación.** Se juntan **todas** las validaciones que apliquen; no se corta en la primera. `bloqueado = validaciones.some(v => v.severidad === "bloquea")`.

**1. Tipo de gasto.** Si `imputacion.tipoGastoId` no está en el diccionario:
- valida `R1_TIPO_SIN_CLASIFICAR`, que bloquea, con el mensaje "La herramienta no adivina el tratamiento del IVA: elegí el tipo de gasto";
- `tratamiento` = `no_computable` y `carril` = `ninguno`.

**2. Leyenda o factura M → cuentas a pagar.** Si `datos.leyendaA` ≠ "ninguna" o `clase` = `factura_m`:
- valida `R3_FACTURA_CON_LEYENDA`, que bloquea;
- mensaje: "Esta factura exige retener o pagar a un CBU: no se paga por rendición. Va a Cuentas a Pagar";
- fuente: RG 1575 art. 21; RG 5762/2025 art. 5;
- `carril` = `cuentas_a_pagar` y `tratamiento` = `no_computable`.

**3. Tratamiento.** Parte de `tipo.tratamientoBase` y lo baja a `no_computable` si se cumple **cualquiera** de estas condiciones. El comprobante degrada, nunca mejora:
- `clase` ∉ {`factura_a`, `tique_factura_a`, `tique_peaje`}. Si la clase es `factura_b` o `tique_consumidor_final` y trae `ivaContenido`, valida `R2_IVA_CONTENIDO_A_CERO`, que informa, con el mensaje "El IVA que muestra este ticket no se recupera (es IVA contenido de consumidor final)" y fuente RG 5614/2024.
- `datos.cuitReceptor` ≠ `ctx.empresa.cuit`. En ese caso:
  - si la clase es A, valida `R2_RECEPTOR_NO_ES_LA_EMPRESA`, que advierte: "La factura no está a nombre de la empresa: no recupera IVA";
  - si no es A y no es `sin_comprobante`, valida `R2_PEDI_LA_CUIT`, que advierte: "La próxima pedí que pongan la CUIT de la empresa en el ticket".
- `constatacion` = `rechazada`, o `cuitApocrifa` = true. Se validan aparte en el paso 5.

Si el tipo es `no_computable` por ley (su `tratamientoBase`) y la clase es `factura_a`: valida `R1_NO_COMPUTA_POR_LEY`, que informa. Mensaje: "Esta factura no recupera IVA por ley. No es un error tuyo". La fuente es `tipo.fuente`.

**4. Carril**, si no quedó en `ninguno` ni en `cuentas_a_pagar`, con el corte por defecto:
- `computable` → `factura`;
- `no_computable` → `asiento`;
- `no_registrable` → `ninguno`.

**5. Validaciones que bloquean o avisan.** Todas se evalúan.
- **`V2_CUIT_INVALIDA` (bloquea):** hay `cuitEmisor` y no pasa `cuitValido`.
- **`V9_NUMERO_OFICIAL` (bloquea):** la clase es `factura_*` o `tique_factura_a` y falta `puntoVenta` o `numero`.
- **`V4_B_O_C_CON_IVA_DISCRIMINADO` (bloquea):** la clase es `factura_b` o `factura_c` y `lineasIva` trae alguna línea con `iva` > 0. El IVA contenido NO dispara esto.
- **`V8_ARITMETICA` (bloquea):** |Σneto + Σiva + Σpercepciones + noGravado + exento + impuestosInternos − total| > `politica.toleranciaCentavos`. Sólo si `lineasIva.length` > 0. Mensaje: "Los importes no suman el total ($ X + $ Y ≠ $ Z). ¿Hay una percepción sin separar?".
- **`R7_PERCEPCION_SIN_JURISDICCION` (bloquea):** una percepción de IIBB sin jurisdicción.
- **`R4_CONSTATACION_RECHAZADA` (bloquea):** `constatacion` = `rechazada`.
- **`R4_CUIT_APOCRIFA` (bloquea):** `cuitApocrifa` = true. Mensaje: "ARCA tiene marcado este CUIT como emisor de facturas apócrifas".
- **`R4_SIN_CONSTATACION_POSIBLE` (informa):** `constatacion` = `sin_constatacion_posible`.
- **`V6_DUPLICADO` (bloquea):** otro comprobante de `ctx.otrosComprobantes`, con otro `id`, tiene la misma terna (cuitEmisor, puntoVenta, numero) y la misma clase. Mensaje: "Este comprobante ya se rindió (lo cargó {legajo})".
- **`V6_MISMA_FOTO` (bloquea):** otro comprobante con el mismo `hashImagen`, no vacío.
- **`R9_FALTA_JURISDICCION` (bloquea):** falta `jurisdiccionActividad` o `jurisdiccionComprobante`, salvo que la clase sea `sin_comprobante`.
  - Si el tipo exige `origenDestino` y falta `origen` o `destino`, también `R9_FALTA_JURISDICCION`.
- **`R9_PROVINCIA_NO_INSCRIPTA` (advierte):** `jurisdiccionActividad` no está en `politica.jurisdiccionesInscriptas`. Mensaje: "Gasto en {provincia}: ahí la empresa no está inscripta en Ingresos Brutos. Avisale a Administración".
- **`R10_FALTA_VEHICULO` (bloquea):** el tipo exige `dominio` y falta `imputacion.dominio`, o exige `tipoVehiculo` y falta. Mensaje: "Combustible sin patente: cargala, después no se puede reconstruir".
- **`R10_TOPE_AUTOMOVIL` (informa):** `tipoVehiculo` = `automovil` en un tipo que exige vehículo. Mensaje para el contador: "Automóvil: aplica el tope de Ganancias por unidad".
- **`V13_FALTA_ASISTENTES` (bloquea):** `tipo.esRepresentacion` y `asistentes` vacío.
- **`R11_CUBIERTO_POR_CONVENIO` (bloquea):** `tipo.cubiertoPorConvenioCamioneros`, `ctx.persona.convenioCamioneros`, y la fecha del comprobante cae dentro de un viaje de la persona con `cubiertoPorConvenio` = true. Mensaje: "Esta comida ya la paga el convenio en tu recibo de sueldo: no se puede reintegrar dos veces". Fuente: CCT 40/89 ítem 4.2.11.
- **Sin comprobante:**
  - `R11_SIN_COMPROBANTE_SOBRE_TOPE` (bloquea): la clase es `sin_comprobante` y el total supera `politica.topeSinComprobante`;
  - si no lo supera, `R11_SIN_COMPROBANTE` (informa): "Va sin comprobante: se informa a Haberes como reintegro".
  - Si el tipo no `admiteSinComprobante`, bloquea con el mismo código y el mensaje "Este gasto necesita comprobante".
- **`R5_EFECTIVO_SOBRE_TOPE` (informa):** el medio es `efectivo_anticipo` y el total supera `politica.topeEfectivoLey25345`. Mensaje: "Pago en efectivo: guardamos foto, aprobación y anticipo como prueba de la operación". Fuente: Ley 25.345; CSJN "Mera".
- **`V3_PROVEEDOR_FUERA_DEL_MAESTRO` (advierte):** el carril es `factura` y el `cuitEmisor` no está en `ctx.maestroProveedores`. Mensaje: "Este proveedor no está dado de alta en SAP: Tesorería va a pedir el alta".
- **`R8_DERIVAR_A_CXP` (advierte):** el `cuitEmisor` está en el maestro, el tratamiento es `computable` y el total supera `politica.topeDerivacionCxP`. Pasa el `carril` a `cuentas_a_pagar`. Mensaje: "Proveedor habitual con un importe alto: se paga por Cuentas a Pagar (puede corresponder retención)". Fuente: RG 830; Ley 11.683 art. 8 inc. c).
- **`V12_FUERA_DE_PERIODO` (advierte):** la fecha no es del `ctx.periodo`.
- **`V14_MONEDA_SIN_COTIZACION` (bloquea):** la moneda es USD y falta `cotizacion`.
- **`R4_CONSTATACION_PENDIENTE` (advierte):** comprobante electrónico constatable (factura_* o tique_factura_a, con CAE o CAEA) con `constatacion` = `pendiente` o `cuitApocrifa` = `sin_consultar`. No frena el envío; `aplicarAccion("contabilizar")` sí lo frena.

**6. Importes.**
- Si es `computable`: `creditoFiscal` = Σ iva de `lineasIva`; `percepcionesComputables` = Σ percepciones con régimen `iva` o `iibb`.
- Si no: `creditoFiscal` = 0 y `percepcionesComputables` = 0.
- `costo` = total − creditoFiscal − percepcionesComputables. En USD se multiplica por la cotización y se redondea a centavos.
- `cuentaMayor` = `tipo.cuentaMayor`.
- `indicadorIva` = el `indicadorIvaComputable` si es computable; si no, el `indicadorIvaNoComputable`.
- `reglaVersion` = `ctx.reglaVersion`.

## `rendicion.ts`

```ts
calcularCuadratura(r: Rendicion, anticipos: Anticipo[], comprobantes: Comprobante[], tolerancia: Centavos, evaluaciones?: Evaluacion[]): Cuadratura
```
- **Con `evaluaciones`** (es lo que tienen que pasar las pantallas): las líneas **bloqueadas** o **derivadas a Cuentas a Pagar** quedan fuera. No justifican el anticipo ni se reintegran por la rendición. Sin `evaluaciones`, cuenta todo (compatibilidad).
- `anticipado` = Σ importe de los anticipos de `r.anticipoIds`.
- `rendido` = Σ total de los comprobantes de la rendición cuyo medio es `efectivo_anticipo` o `recargable`.
- `aReintegrar` suma dos cosas:
  - los comprobantes con medio `propio_a_reintegrar`;
  - max(0, rendido − anticipado + devuelto), cuando la persona gastó de más.
- `diferencia` = anticipado − rendido − devuelto.
- `cuadra` = |diferencia| ≤ tolerancia, o diferencia < 0 (rindió de más: queda a reintegrar).
- Mensajes en criollo:
  - si falta: "Recibiste $ 500.000, rendiste $ 447.300 y declaraste devolver $ 40.000. Faltan justificar $ 12.700.";
  - si cuadra: "Cuadra: recibiste $ X y justificaste todo.";
  - si rindió de más: "Gastaste $ X más que el anticipo: te lo reintegramos."

```ts
aplicarAccion(r: Rendicion, accion: AccionRendicion, ctx: ContextoTransicion): ResultadoTransicion
```
Es un reducer **puro** con guardias. Nunca muta `r`: devuelve una copia con el evento agregado al `historial`.

| Acción | Desde | Hacia | Guardia |
|---|---|---|---|
| `enviar` | borrador, devuelta | en_aprobacion, `nivelActual` 0 | `ctx.cuadratura.cuadra` y ninguna evaluación bloqueada. Si no se cumple, el motivo dice qué falta |
| `aprobar` | en_aprobacion | siguiente nivel o `aprobada` | `puedeAprobar(ctx.actorLegajo, r, ctx.niveles)` |
| `devolver` | en_aprobacion, en_control | devuelta | exige `comentario` |
| `rechazar` | en_aprobacion | rechazada | exige `comentario` |
| `tomar_control` | aprobada | en_control | — |
| `contabilizar` | en_control | contabilizada | ninguna evaluación bloqueada y ninguna con `R4_CONSTATACION_PENDIENTE` |
| `cerrar` | contabilizada | cerrada | — |

Cualquier otra combinación: `{ ok: false, motivo: "No se puede {acción} una rendición {estado}" }`.

**Rol del actor.** `ContextoTransicion.rolesActor?: RolRendi[]`: si viene y no incluye `tesoreria`, se rechazan `tomar_control`, `contabilizar` y `cerrar`.


```ts
totalRendicion(comprobantes: Comprobante[]): Centavos
```

## `aprobacion.ts`

```ts
nivelesDeAprobacion(total: Centavos, persona: Persona, personas: Persona[], reglas: ReglaAprobacion[], suplencias: Suplencia[], fecha: FechaISO): string[][]
```
- Toma la **primera** regla que matchea el rango de `total` (desde ≤ total < hasta) y el `centroCosto` (si la regla lo tiene).
- Resuelve "jefe" como `persona.jefeLegajo`.
- A cada titular con una suplencia vigente en `fecha` le agrega el suplente al mismo nivel.
- **Separación de funciones:** saca a `persona.legajo` de todos los niveles. Si un nivel queda vacío, sube al jefe del jefe. Si tampoco hay, deja el nivel vacío y la UI muestra "sin aprobador".

```ts
puedeAprobar(actorLegajo: string, r: Rendicion, niveles: string[][]): boolean
// estado en_aprobacion, el actor está en niveles[r.nivelActual], y el actor ≠ r.legajo
```

## `lote-contable.ts`

```ts
armarLoteContable(args: {
  rendiciones: Rendicion[]; comprobantes: Comprobante[]; evaluaciones: Evaluacion[];
  personas: Persona[]; parametros: ParametrosSap; fechaContabilizacion: FechaISO;
}): LoteContable
```
Sólo toma rendiciones en `en_control`: las contabilizadas ya se exportaron, y volver a tomarlas arriesga una doble carga en SAP. Excluye los comprobantes bloqueados.

```ts
destinoEnLote(e: Evaluacion): { tipo: "factura" } | { tipo: "asiento" } | { tipo: "cuentas_a_pagar" } | { tipo: "fuera"; motivo: string }
totalesQueEntran(evaluaciones: Evaluacion[]): { creditoFiscal: Centavos; gasto: Centavos; percepciones: Centavos }
```
- `destinoEnLote`: **la única fuente** de lo que la pantalla dice sobre el destino de un comprobante.
  - Con un bloqueo que lo saca (cualquiera menos R3), es `fuera`, con el mensaje del primer bloqueo.
  - Si no, depende del carril: factura, asiento, o cuentas a pagar (R3 sola o R8).
  - Un tipo que no se registra (la propina) también es `fuera`.
- `totalesQueEntran`: suma sólo lo que entra al lote. Los indicadores del contador salen de acá; un test verifica que coincide con el lote.

- **Asignación:** `${legajo}-${AAMM}-${MP}`, donde AAMM sale del período (2026-09 → 2609) y MP es EF (efectivo), TC (tarjeta corporativa), RC (recargable) o PR (propio).
- **Referencia:** punto de venta con ceros a la izquierda, a 4 dígitos si es ≤ 9999 y a 5 si no; más la letra (A de factura_a, tique_factura_a y tique_peaje); más el número a 8 dígitos. Ejemplo: `0001A00000101`.
- **Carril `factura`:**
  - **Emisor:** `parametros.maestroProveedores[cuitEmisor]`. Si no está, va a `altasPendientes` y **no** entra en `facturas`.
  - **Posiciones:**
    - una por línea de IVA, con el neto, la cuenta del tipo de gasto y el indicador de la evaluación;
    - una por percepción computable, a `cuentaPercepcionIva` o `cuentaPercepcionIibb`, con el indicador vacío;
    - no gravado, exento e impuestos internos, a la cuenta del tipo de gasto con el indicador no computable.
  - Cada posición lleva `centroCosto` y `numeroPersonal` (el legajo, con ceros a la izquierda a 8).
  - **`importeBruto`** = total.
  - **Cancelación:** por cada factura se agrega una `CancelacionFacturaSap`. La contrapartida es la cuenta puente si el medio es efectivo o recargable, la cuenta de tarjeta si es tarjeta corporativa, y reintegros a pagar si es propio.
- **Carril `asiento`:** un `AsientoSap` por rendición.
  - Al debe, una posición por comprobante: el `costo` a la cuenta del tipo, con centro de costo, asignación y el texto "{razón social} {clase} {número}".
  - Al haber, una posición por medio de pago con la suma de sus comprobantes: cuenta puente (EF y RC), tarjeta a pagar (TC) o reintegros a pagar (PR).
  - La suma del debe es igual a la del haber.
- **Carril `cuentas_a_pagar`:** el id va a `derivadosCxP`.
- **Ids:** `F-{comprobanteId}` y `A-{rendicionId}`.

## `conciliacion.ts`

```ts
conciliarConPrecarga(comprobantes: Comprobante[], precarga: LineaPrecarga[], empresaCuit: string, tolerancia: Centavos): ResultadoConciliacion
```
- **Clave:** (cuitEmisor, tipoArca, puntoVenta, numero). `tipoArca` sale de `tipoArcaDesdeClase`.
- Comprobantes sin clave (tique a consumidor final, sin comprobante, o sin punto de venta o número): van a `rendidoNoEnPrecarga` con motivo `no_electronico`.
- Con clave y sin coincidencia: `no_encontrado` si el comprobante está a nombre de la empresa. Si no lo está (consumidor final u otra CUIT), `no_es_de_la_empresa`: no puede estar en la precarga y no es un comprobante dudoso.
- Coincidencia con |diferencia de total| > tolerancia: `diferenciasImporte`. Si no, `coinciden`.
- Líneas de precarga sin comprobante que coincida: `precargaNoRendida`.

## `haberes.ts`

```ts
resumenParaHaberes(args: {
  personas: Persona[]; anticipos: Anticipo[]; rendiciones: Rendicion[]; comprobantes: Comprobante[];
  viajes: Viaje[]; periodo: Periodo; hoy: FechaISO; evaluaciones?: Evaluacion[];
}): LineaHaberes[]
// Con evaluaciones, deja afuera lo bloqueado y lo derivado a Cuentas a Pagar (igual que la cuadratura).
```
Una línea por persona que tuvo anticipos, comprobantes o viajes en el período.
- `rendidoConComprobante`: suma de los comprobantes que no son `sin_comprobante`.
- `reintegrosSinComprobante`: suma de los `sin_comprobante`.
- `saldoNoRendido` = max(0, anticipado − rendido(efectivo+recargable) − devoluciones declaradas).
- `antiguedadDias`: días entre la `fechaEntrega` del anticipo más viejo y `hoy`, si queda saldo; 0 si no.

## `index.ts`

Reexporta todo lo de arriba y todos los tipos de `tipos.ts`.

## Plugin `src/plugins/sap` (modo Archivo)

- **`core-contract.ts`:** la vista del plugin sobre `LoteContable`, **redeclarada** para no importar el Core (ADR-002). Tiene que ser compatible por estructura con `tipos.ts`.
- **`domain/csv.ts`:** `aCsv(filas: string[][], sep = ";"): string`.
  - Comillas si el valor tiene separador, comilla o salto de línea.
  - Arranca con BOM UTF-8 para que Excel lo abra bien.
  - Los importes van con punto decimal y dos decimales ("1234.56"), sin separador de miles.
- **`domain/plantillas.ts`:**
  - `filasFacturas(facturas)`: encabezado con los nombres técnicos de la carga de facturas de proveedor. Cabecera: `ID_FACTURA, COMPANYCODE, ACCOUNTINGDOCUMENTTYPE, DOCUMENTDATE, POSTINGDATE, INVOICINGPARTY, SUPPLIERINVOICEIDBYINVCGPARTY, BUSINESSPLACE, INVOICEGROSSAMOUNT, DOCUMENTCURRENCY, ASSIGNMENTREFERENCE`. Posición: `GLACCOUNT, SUPPLIERINVOICEITEMAMOUNT, TAXCODE, COSTCENTER, PERSONNELNUMBER, ITEM_ASSIGNMENTREFERENCE, DOCUMENTITEMTEXT`. Una fila por posición, repitiendo la cabecera.
  - `filasAsientos(asientos)`: `TIPO_LINEA` ("Cabecera" o "Part.ind.") más `BUKRS, BLART, BLDAT, BUDAT, WAERS, XBLNR, BKTXT, HKONT, SGTXT, WRSOL, WRHAB, MWSKZ, KOSTL, ZUONR`. Un bloque por asiento: una fila de cabecera y N de posiciones.
  - `filasCancelaciones(c)` y `filasAltas(altas)`.
  - **Los encabezados son [A VALIDAR] contra la plantilla real que se baja del arrendatario.** Dejarlo dicho en un comentario y en `src/plugins/sap/README.md`.
- **`index.ts`:** `generarArchivosSap(lote): { facturas: string; asientos: string; cancelaciones: string; altas: string }` (cuatro CSV).

## Escenario de la demo — `src/app/demo/rendiciones/escenario.ts`

Todo es **ficticio**. Exporta `escenarioDemo: EscenarioDemo`.

- **Empresa:** Distribuidora Pampa Industrial S.A., CUIT `30715884301`.
- **Fechas:** `hoy` = 2026-09-24; período 2026-09; `reglaVersion` "diccionario-demo@2026-09-24".
- **Política:**
  - tope sin comprobante: $ 5.000;
  - tope de efectivo de la Ley 25.345: $ 1.000;
  - plazo de rendición: 30 días;
  - tope de derivación a cuentas a pagar: $ 400.000;
  - jurisdicciones inscriptas: BA, CABA, LP;
  - tolerancia: 2 centavos.
- **Diccionario** (todo `provisorio`, con su fuente):

| Tipo | Tratamiento base | Exige / marca |
|---|---|---|
| combustible | computable | dominio, tipoVehiculo |
| repuestos y reparaciones | computable | dominio |
| peajes | computable | origenDestino |
| insumos y ferretería | computable | — |
| comidas en viaje | no_computable | `cubiertoPorConvenioCamioneros` |
| hotel y alojamiento | no_computable | `cubiertoPorConvenioCamioneros` (pernocte) |
| representación con clientes | no_computable | `esRepresentacion`, asistentes |
| estacionamiento y cochera | no_computable | — |
| taxi y remís | no_computable | origenDestino |
| propinas | no_registrable | `admiteSinComprobante` |
| sin clasificar | — | no va en el diccionario: sirve para probar R1 |

Fuentes: Ley de IVA art. 12, inc. a, pto. 3 (restaurante, hotel, cochera); D. 692/98 art. 52; Ley de IVA art. 7, inc. h, pto. 12 (taxi hasta 100 km, exento).

- **Personas:**

| Legajo | Nombre | Puesto | Detalle |
|---|---|---|---|
| 1042 | Rubén Gómez | chofer | rinde; jefa 2001; CC LOG-01; `convenioCamioneros` sí; camión AB123CD propio |
| 1107 | Laura Benítez | vendedora de gira | rinde; jefe 2002; CC COM-02; auto AE456FG propio |
| 1150 | Martín Sosa | instalador | rinde; jefa 2001; CC OPS-03; utilitario AF789HJ propio |
| 2001 | Carla Ruiz | jefa de logística | aprueba; jefa 3001 |
| 2002 | Diego Paz | gerente comercial | aprueba; jefa 3001 |
| 3001 | Ana Ferreyra | dirección | aprueba |
| 4001 | Paula Díaz | tesorería | tesorería |
| 5001 | Silvia Luna | contadora | contador |

- **Tarjetas:** recargable de Benítez (…4821); corporativa de Paz (…7310).
- **Anticipos:** Gómez $ 500.000 en efectivo, entregado el 2026-09-01 desde "Caja Tesorería"; Sosa $ 150.000 en efectivo, el 2026-09-05; Benítez $ 300.000 por recargable, el 2026-09-02.
- **Viajes:**
  - Gómez: del 2026-09-08 al 2026-09-11, BA → NQ, 1.150 km, 3 pernoctes, `cubiertoPorConvenio` sí;
  - Benítez: del 2026-09-15 al 2026-09-17, BA → LP, 620 km, 2 pernoctes, `cubiertoPorConvenio` no.
- **Reglas de aprobación:**
  - de 0 a menos de $ 800.000: un nivel, "jefe";
  - de $ 800.000 en adelante: dos niveles, "jefe" y luego ["3001"].
- **Suplencia:** 2002 → 2001, del 2026-09-20 al 2026-09-30.
- **Parámetros SAP** (placeholders "provisional a confirmar"):
  - sociedad "DEMO"; clase de documento de factura "KR"; de asiento "SA"; lugar comercial "0001";
  - cuentas "11409001" (puente de anticipos), "21101007" (tarjeta a pagar), "21109001" (reintegros a pagar), "11406001" (percepción IVA), "11406002" (percepción IIBB);
  - en el maestro de proveedores están la estación, repuestos, el taller y el peaje; el hotel y la ferretería no.
- **Rendición R-1042-2609 (Gómez), en `borrador`.** Anticipo de $ 500.000 y una devolución declarada de $ 40.000 que **no cuadra por $ 12.700** (la suma de los comprobantes en efectivo tiene que dar $ 447.300 exactos). Comprobantes:
  1. Combustible, factura A de "Estación de Servicio Ruta 5 S.R.L." (`30709123455`), a la empresa. Neto $ 160.000, IVA 21% $ 33.600, impuestos internos $ 18.400. QR y constatación aprobada; camión AB123CD. Jurisdicciones: actividad NQ, comprobante NQ. Queda con carril factura y advertencia **R9 provincia no inscripta** (NQ).
  2. Peaje: `tique_peaje` de "Autopistas del Oeste S.A." (`30500111220`). Neto $ 8.264, IVA 21% $ 1.736. Controlador fiscal, `sin_constatacion_posible`, origen BA y destino NQ.
  3. Comida en ruta del 2026-09-09: factura B a consumidor final de "Parador El Cruce" (`30712340017`), $ 18.000 con IVA contenido $ 3.124. Queda **R11, cubierto por convenio: bloquea**.
  4. Repuesto: factura A de "Repuestos Norte S.R.L." (`30684551201`), neto $ 120.000, IVA 21% $ 25.200, dominio AB123CD. Computable, carril factura.
  5. Reparación del taller "Taller Mecánico Sur S.A." (`30710223331`): factura A **con leyenda "operación sujeta a retención"**, neto $ 450.000 con IVA. Medio: propio a reintegrar, para que no afecte la cuadratura. Queda **R3, que bloquea y deriva a cuentas a pagar**.
  6. Propina sin comprobante de $ 3.000 (informa R11_SIN_COMPROBANTE).
  7. El mismo repuesto cargado de nuevo, con el mismo punto de venta y número que el 4: **V6 duplicado, bloquea**.
  8. Ferretería: factura A de "Ferretería Industrial Lanús S.A." (`30698882227`), neto $ 12.000 más IVA, **proveedor fuera del maestro (V3)**.
  9. Ticket de consumidor final de un kiosco (controlador fiscal, sin CUIT del receptor): advierte R2_PEDI_LA_CUIT.

  **Ajustá importes y medios para que la suma en efectivo del anticipo dé exactamente $ 447.300. Documentalo en un comentario.**

- **Rendición R-1107-2609 (Benítez), en `en_aprobacion`, nivel 0.** Anticipo recargable de $ 300.000 que cuadra exacto. Comprobantes:
  - hotel, factura A de "Hotel Llanura S.A." (`30705558880`), en LP: R1_NO_COMPUTA_POR_LEY, carril asiento;
  - representación con asistentes, factura A de "Restaurante La Posta" (`33707771114`): no computa, carril asiento;
  - combustible del auto (automóvil): computable, R10_TOPE_AUTOMOVIL informa;
  - estacionamiento, ticket B.
  - La aprueba 2002 (Paz), o 2001 como suplente.
- **Rendición R-1150-2609 (Sosa), en `en_control`.** Aprobada por 2001 y lista para contabilizar. Tiene tres comprobantes:
  - insumos de ferretería del maestro (usar el CUIT de repuestos con otro número);
  - un ticket C del kiosco (`20284445555`): no computa, carril asiento;
  - una factura A con CUIT apócrifa: `30719990017`, `cuitApocrifa: true` → R4, bloquea. Para que la rendición esté en control, esta línea queda **devuelta** en el historial; en la demo, Tesorería la ve marcada.
  - Anticipo de $ 150.000: cuadra con la devolución declarada.
- **Precarga de IVA Simple ficticia:**
  - las facturas A y B electrónicas de las tres rendiciones que tengan QR (mismo CUIT, tipo, punto de venta y número); una de ellas con un total que difiere en $ 1.500;
  - una factura A de "Lubricentro Oeste S.A." a nombre de la empresa, que **nadie rindió**.
- **`qrPorComprobante`:** URL de QR (con `urlQrArca`) para cada comprobante electrónico con CAE.

`escenario.test.ts` tiene que comprobar que, con el motor, cada rendición produce exactamente los códigos de validación descritos, que la cuadratura de R-1042 falla por $ 12.700 y que la de R-1107 cuadra.
