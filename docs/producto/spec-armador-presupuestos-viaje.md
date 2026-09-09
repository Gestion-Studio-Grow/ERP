# 🧳 Spec funcional — ARMADOR DE PRESUPUESTOS DE VIAJE (módulo del backoffice)

> **Qué es:** la definición funcional del módulo que industrializa lo que hoy una agencia de viajes hace a
> mano: buscar vuelos y hoteles, y entregarle al cliente un documento con **tres niveles de presupuesto**
> (económico / intermedio / alto) y **tres opciones por nivel**, con precio **por persona en base doble** y
> **en single**.
>
> **Qué NO es:** no elige proveedor de API, no diseña tablas de Prisma ni pantallas React, no decide stack.
> Eso lo define la célula de **ingeniería de backoffice** a partir de este documento.

- **Autor:** Analista de Funcionalidad de Backoffice (célula del pool, ADR-053) · **Fecha:** 2026-09-09
- **Estado:** propuesta funcional — **pendiente de validación del Arquitecto de Solución** (reversible vs §C)
  y del **Gate de Excelencia** (ADR-040) cuando se construya.
- **Origen real:** pedido de una agencia cliente — análisis de vuelos y hoteles para la **Feria de Cantón**
  (12 días en Guangzhou + 4 en Estambul). Se resolvió a mano, con dos analistas. Este módulo convierte ese
  trabajo artesanal en un proceso repetible.

---

## Paso 0 · Calibración (ADR-052) — principios que guían esta spec

Leído: `CLAUDE.md`, `docs/ESTADO-ACTUAL.md`, `docs/adr/INDEX.md`, ADR-002 (Core/Blueprint/Plugin),
ADR-009 (UX/RBAC), ADR-017 (roles), ADR-020 (contrato del Core), ADR-054 (catálogo de módulos),
ADR-055 (variante), ADR-044/046 (argentinizar + de-sesgo), ADR-079/080 (craft y textos),
`docs/lecciones-aprendidas/registro.md` (DB-2, DX-5, DX-6, DX-7, MP-13, MP-14, SEC-3),
`src/lib/capabilities.ts`, `src/modules/contract.ts`, `src/modules/descriptors/nativos.ts` y las rutas
`/admin` existentes.

1. **Un precio sin fecha y sin vigencia es una mentira con formato lindo.** Todo importe que se muestra
   viaja con su **fecha de captura**, su **vigencia** y su sello **VERIFICADA / ESTIMADA**. Es requisito
   funcional bloqueante, no una nota al pie: en el informe manual esa distinción fue lo que evitó que el
   entregable engañara al cliente.
2. **La base de ocupación es un dato, nunca un supuesto.** Confundir precio por habitación con precio por
   persona duplica (o parte al medio) un presupuesto. El sistema **no infiere ni divide solo**: si no está
   declarada la unidad de precio y la base, no se guarda la oferta.
3. **ADR-055 al pie:** la **oferta capturada es un objeto maestro** con su ABM propio (se crea una vez, se
   reusa); el presupuesto la **asigna** con una relación explícita que **también tiene su ABM** (asignar,
   editar la asignación, desasignar). Nunca "todas las ofertas en todos los presupuestos" — es exactamente
   el antipatrón de A-1/DX-6.
4. **No duplicar patrones del backoffice** (ADR-040 §consistencia): bandeja + ficha + ABM, capabilities del
   Core (`src/lib/capabilities.ts`), módulo declarado en el catálogo (ADR-054), gating por nav y no por
   redirect (MP-14), sello GSG en el footer del backoffice (ADR-043).
5. **Zona de de-sesgo (ADR-046):** los **labels, el copy de pantalla y el documento del cliente** van en
   **criollo claro** (ADR-080: voseo impersonal-cálido, cero jerga, "Precio por persona" y no "PAX rate").
   El **modelo de datos, los estados, el RBAC y las reglas de cálculo** van **estándar y precisos**, sin
   personalidad.

**Lo que esta spec NO decide y ELEVA:** todo lo irreversible — tablas nuevas (migración = **Gate 2**),
alta del tenant de la agencia, rol nuevo si hiciera falta (cambio de enum), y la superficie pública del
documento (revisión de **Seguridad**, SEC-3). Ver §7.

---

## 1. El caso que origina el módulo (para entender el porqué)

La agencia necesitaba cotizar un viaje a la Feria de Cantón: **12 días en Guangzhou + 4 en Estambul**, para
un grupo. Dos analistas, a mano, produjeron un documento con:

- **3 niveles** (económico · intermedio · alto),
- **3 opciones** dentro de cada nivel (9 combinaciones en total),
- precio **por persona en base doble** y precio **en single** en cada opción,
- cada cifra marcada como **VERIFICADA** (relevada contra el sitio del proveedor ese día) o **ESTIMADA**
  (proyección razonable, sin captura directa).

Lo que dolió del trabajo manual y este módulo tiene que resolver:

| Dolor manual | Qué hace el módulo |
|---|---|
| Los precios se movían entre el día que se relevaron y el día que se entregó el documento | Cada oferta se guarda como **captura congelada con vigencia**; el presupuesto **vence solo** |
| Había que recordar de memoria qué precio era por habitación y cuál por persona | **Unidad de precio + base de ocupación obligatorias** en cada oferta |
| Rehacer una opción implicaba rehacer las 9 | Las ofertas se **capturan una vez** y se **asignan** a las opciones que haga falta |
| El markup se aplicaba a mano, con planilla aparte | **Política de markup** como objeto con ABM, asignada al presupuesto |
| No quedaba rastro de quién relevó qué ni cuándo | Auditoría por captura, cambio de precio y envío |
| Armar el documento final era copiar y pegar | **Documento generado** desde los datos, versionado y congelado al enviarse |

---

## 2. Flujos del operador, de punta a punta

**Actores:** el **operador de mostrador** de la agencia (arma) y el **dueño/gerente** (pone precio de venta
y envía). Mapeo a roles del Core en §5.

### Flujo A · Tomar el pedido (la solicitud)

1. El operador entra a **`/admin/viajes`** (bandeja "Presupuestos de viaje") y toca **"Nuevo pedido"**.
2. Carga el **brief**: cliente de contacto, **cantidad de pasajeros**, **tramos** (destino, fecha desde,
   fecha hasta), y las condiciones que pidió el cliente en texto libre ("hotel cerca del predio ferial",
   "vuelo sin escalas si se puede").
   - Para el caso real: pasajeros = N; tramo 1 = Guangzhou 12 noches; tramo 2 = Estambul 4 noches.
3. El sistema crea el presupuesto en estado **Borrador** y sugiere los tres niveles vacíos (Económico ·
   Intermedio · Alto). Los niveles se pueden renombrar o borrar: **no son una obligación del sistema**, son
   el default del rubro.

### Flujo B · Buscar y capturar ofertas

4. Desde **"Buscar ofertas"**, el operador consulta vuelos y alojamiento por tramo.
   - Si el **buscador automático** está activo (es un plugin, §6), trae resultados y **precarga** el
     formulario de captura.
   - Si no lo está —o si el resultado vino de una llamada telefónica, de un mail del mayorista o del sitio
     del hotel—, el operador **carga la oferta a mano**. **La v1 funciona igual de bien en modo manual**:
     eso es deliberado, porque así se hizo el caso real.
5. Al **guardar la oferta** (pantalla **`/admin/viajes/ofertas`**, el ABM del objeto maestro), el sistema
   **exige sin excepción**:
   - **Qué es** (vuelo / alojamiento / otro), **proveedor**, **moneda**, **precio**,
   - **Unidad de precio** — por persona · por habitación por noche · por habitación total del período ·
     por tramo,
   - **Base de ocupación** cuando es alojamiento — single · doble · triple · otra (con el número),
   - **Capturado el** (fecha y hora) y **vigente hasta**,
   - **Certeza**: **Verificada** (la vi hoy en el sitio/mail del proveedor) o **Estimada** (proyección),
   - **De dónde salió** (link, nombre del mail, "llamada al mayorista X"),
   - si **incluye impuestos y tasas** — sí / no / parcial (con detalle).
   - Sin esos campos, **no hay botón de guardar habilitado**. El formulario dice por qué, en criollo.
6. La oferta queda en la **biblioteca de ofertas del pedido** (y reusable en otros pedidos del mismo
   tenant). Se puede **duplicar** una oferta para variar una condición (otra base, otras fechas) — genera
   una **captura nueva**, no pisa la anterior.

### Flujo C · Armar niveles y opciones (la asignación, ADR-055)

7. En **`/admin/viajes/[id]/armado`** el operador ve los **3 niveles** y, dentro de cada uno, hasta **3
   opciones** (Opción A/B/C, renombrables: "Vuelo directo + hotel 4★").
8. Para cada opción **asigna** ofertas de la biblioteca (panel lateral, arrastrar o "Agregar a la opción").
   **La asignación tiene datos propios** que se editan sin tocar la oferta:
   - cuántos pasajeros cubre, cuántas noches/tramos, **qué base se está usando**, orden de aparición,
     nota visible para el cliente y nota interna.
9. El panel muestra, en vivo y por opción: **precio por persona en base doble** y **precio por persona en
   single**, con la **fórmula desplegada** ("USD 1.200 por habitación por noche ÷ 2 pasajeros × 12 noches").
   Si a la opción le falta la variante single (no se cotizó), se muestra **"No cotizado"** — **jamás** se
   estima dividiendo.
10. La opción muestra un **semáforo de confianza**: verde si todas sus ofertas son Verificadas y vigentes;
    ámbar si tiene alguna Estimada o vence en menos de 48 h; rojo si tiene alguna **vencida**.

### Flujo D · Poner el precio de venta (markup)

11. El **dueño** entra a **`/admin/viajes/[id]/precios`** (los demás roles no ven esta pantalla ni el costo
    neto). Elige una **política de markup** del ABM de políticas (`/admin/viajes/politicas-markup`) —por
    ejemplo "Aéreos 8% · Alojamiento 15% · Otros 12%"— y la **asigna** al presupuesto.
12. Puede **sobrescribir el markup a nivel de opción o de ítem**, con motivo obligatorio (queda en
    auditoría). El sistema muestra **costo neto · markup · precio de venta** lado a lado, y el **margen
    total** del presupuesto.
13. **El cliente nunca ve costo ni markup**: el documento muestra únicamente **precio final por persona**.

### Flujo E · Generar el documento del cliente

14. **"Vista previa del documento"** (`/admin/viajes/[id]/documento`) arma el entregable con la misma
    estructura del informe manual: portada con el pedido, un bloque por nivel, tres opciones por nivel, y
    en cada opción **por persona en base doble** y **en single**, más el detalle de qué incluye.
15. Cada precio del documento sale con su **sello** (Verificada / Estimada) y su **fecha de captura**, y el
    documento entero lleva **"Precios vigentes hasta DD/MM/AAAA"** = la **vigencia más corta** de todas sus
    ofertas asignadas.
16. Antes de dejar enviar, el sistema corre las **validaciones de salida** (§4, transición a *Listo*). Si
    algo falta, lista **qué falta y en qué opción**, con link directo al ítem.
17. El dueño **aprueba y envía**: el documento se **congela como versión** (v1, v2…), se guarda como
    artefacto y se comparte por **link** o **PDF**, con el CTA de **WhatsApp** del helper único (ADR-037).
    Después de enviado, **cambiar una oferta ya no cambia el documento enviado**: genera una **versión
    nueva**.

### Flujo F · Seguimiento

18. La bandeja `/admin/viajes` es el tablero: filtro por estado, por vencimiento, por operador. Cada
    presupuesto muestra **cuándo se envió**, **cuándo vence** y **cuándo se lo tocó por última vez**.
19. El operador registra la respuesta del cliente: **Aceptado** · **Rechazado** (con motivo de una lista
    corta + texto) · **Sin respuesta**. Puede dejar notas y una **fecha de recontacto**.
20. Cuando un presupuesto **vence**, aparece en la bandeja con aviso y con la acción **"Recotizar"**: crea
    la **versión siguiente** copiando la estructura (niveles, opciones y asignaciones) pero marcando cada
    oferta vencida como **"hay que volver a capturarla"**. Nunca arrastra un precio viejo como si fuera
    actual.

---

## 3. Modelo de datos funcional

> Nomenclatura funcional (la técnica la define ingeniería). **Todas** las entidades son **tenant-scoped**
> (`tenantId`, ADR-001/018). ✱ = obligatorio.

### 3.1 Mapa en una línea

```
SolicitudDeViaje ──1:N── Presupuesto ──1:N── NivelDePresupuesto ──1:N── OpcionDePresupuesto
                                                                              │
                                                                              │ N:M explícito
                                                                              ▼
OfertaCapturada  ◄────────── AsignacionDeOferta (ABM propio) ────────────────┘
 (objeto maestro,             ── datos propios de la relación ──
  ABM propio)

PoliticaDeMarkup (objeto maestro, ABM propio) ──AsignacionDeMarkup──► Presupuesto / Opción / Ítem
DocumentoDePresupuesto (versión congelada)      EventoDeSeguimiento (bitácora)
```

### 3.2 `SolicitudDeViaje` — el pedido del cliente

| Campo | Obl. | Notas |
|---|---|---|
| `clienteContacto` | ✱ | nombre + WhatsApp/mail. Puede o no estar linkeado a `Client` del Core |
| `cantidadPasajeros` | ✱ | entero ≥ 1. Es la base de todo cálculo por persona |
| `tramos[]` | ✱ | al menos 1. Cada tramo: `destino`✱, `desde`✱, `hasta`✱, `noches` (derivado) |
| `motivo` | – | "Feria de Cantón", "luna de miel". Ayuda a la plantilla del documento |
| `requisitos` | – | texto libre del cliente |
| `moneda de referencia` | ✱ | en qué moneda se le va a hablar al cliente (USD/ARS) |
| `operadorAsignado` | ✱ | usuario que lo toma |
| `estado` | ✱ | Abierta · Cerrada (se cierra cuando algún presupuesto se acepta o se descarta) |

**Nota de datos personales (Ley 25.326 / ADR-067):** la v1 guarda **contacto y cantidad de pasajeros**.
**No** guarda pasaportes, documentos ni fechas de nacimiento — eso recién hace falta para reservar, y
reservar está fuera de alcance (§6).

### 3.3 `OfertaCapturada` — **objeto maestro** (ABM propio: `/admin/viajes/ofertas`)

Es el corazón del módulo: **un precio congelado, con contexto suficiente para no mentir**.

| Campo | Obl. | Notas |
|---|---|---|
| `tipo` | ✱ | `vuelo` · `alojamiento` · `otro` (traslado, seguro, excursión) |
| `titulo` | ✱ | "Emirates GRU–CAN vía DXB", "Hotel Canton Fair Complex" |
| `proveedor` | ✱ | aerolínea / cadena / mayorista / OTA |
| `tramoDeReferencia` | ✱ | a qué tramo del pedido aplica (Guangzhou / Estambul) |
| `precio` | ✱ | número, 2 decimales |
| `moneda` | ✱ | USD · ARS · EUR… |
| **`unidadDePrecio`** | ✱ | **`por_persona` · `por_habitacion_noche` · `por_habitacion_total` · `por_tramo`** |
| **`baseDeOcupacion`** | ✱ si `tipo = alojamiento` | `single` · `doble` · `triple` · `otra(n)`. **Sin default silencioso** |
| `cantidadDeNoches` | ✱ si `unidadDePrecio = por_habitacion_noche` | para poder totalizar |
| `incluyeImpuestos` | ✱ | `si` · `no` · `parcial` + `detalleImpuestos` (texto) |
| **`capturadoEn`** | ✱ | fecha y hora de la captura |
| **`vigenteHasta`** | ✱ | fecha; el operador la pone (si el proveedor no la da, se usa el default del tenant y se marca) |
| **`certeza`** | ✱ | **`verificada`** · **`estimada`**. Sin valor por defecto: hay que elegir |
| `fuente` | ✱ | link, mail o descripción del canal ("llamada al mayorista X") |
| `capturadoPor` | ✱ | usuario (auditoría) |
| `condiciones` | – | equipaje, penalidad, régimen de comidas, cancelación — **texto libre en la v1** |
| `tipoDeCambioDeReferencia` + `fechaTC` | – | si se quiere mostrar el equivalente en pesos. **El equivalente en ARS siempre se muestra como Estimado** |
| `estadoDeVigencia` | derivado | `vigente` · `por_vencer` (< 48 h) · `vencida` |
| `activa` | ✱ | baja lógica. **Una oferta nunca se borra** si está asignada en algún presupuesto enviado |

**Regla dura:** editar el precio de una oferta ya asignada a un presupuesto **enviado** **no** modifica ese
documento. O se genera una **captura nueva** o se genera una **versión nueva** del presupuesto. Lo enviado
es histórico.

### 3.4 `Presupuesto` — el entregable

| Campo | Obl. | Notas |
|---|---|---|
| `solicitud` | ✱ | de qué pedido nace |
| `version` | ✱ | v1, v2… (recotización) |
| `titulo` | ✱ | "Feria de Cantón — abril 2026" |
| `estado` | ✱ | ver §4 |
| `vigenteHasta` | derivado | **el mínimo `vigenteHasta` de todas sus ofertas asignadas** |
| `politicaDeMarkupAsignada` | – | ver 3.8 |
| `notaParaElCliente` | – | va en el documento |
| `notaInterna` | – | nunca sale al cliente |
| `creadoPor` / `enviadoPor` / `enviadoEn` | ✱ (según estado) | auditoría |

### 3.5 `NivelDePresupuesto`

| Campo | Obl. | Notas |
|---|---|---|
| `nombre` | ✱ | "Económico" · "Intermedio" · "Alto" (default del rubro, editable) |
| `orden` | ✱ | 1..N |
| `descripcion` | – | "3★ céntrico, vuelo con una escala" |

Los 3 niveles son el **default sugerido**, no una restricción del modelo: una agencia puede querer 2 o 4.

### 3.6 `OpcionDePresupuesto`

| Campo | Obl. | Notas |
|---|---|---|
| `nivel` | ✱ | a qué nivel pertenece |
| `nombre` | ✱ | "Opción A — vuelo directo" |
| `orden` | ✱ | 1..N (la UI sugiere 3, no lo impone) |
| `precioPorPersonaBaseDoble` | derivado | suma de asignaciones normalizadas a persona en base doble |
| `precioPorPersonaSingle` | derivado | ídem en single; **"No cotizado"** si falta la oferta single |
| `nivelDeConfianza` | derivado | verde / ámbar / rojo (§2 punto 10) |
| `incluye` / `noIncluye` | – | bullets del documento |

### 3.7 `AsignacionDeOferta` — **la relación explícita, con su propio ABM** (ADR-055)

Es donde vive todo lo que depende del **uso** de la oferta en **esa** opción. Nunca "todas con todas".

| Campo | Obl. | Notas |
|---|---|---|
| `opcion` | ✱ | a qué opción se asigna |
| `oferta` | ✱ | qué captura se usa |
| `pasajerosCubiertos` | ✱ | por default los del pedido; editable (ej.: 1 habitación para 2) |
| **`baseAplicada`** | ✱ | con qué base se prorratea **en esta opción** (puede diferir de la base capturada: una oferta doble se puede asignar como "uso single con suplemento") |
| `suplementoSingle` | ✱ si se calcula single a partir de una tarifa doble | importe explícito; **prohibido inferirlo** |
| `cantidad` | ✱ | noches / tramos / unidades |
| `orden` | ✱ | orden de aparición en el documento |
| `notaVisible` | – | sale al cliente |
| `notaInterna` | – | no sale |
| `asignadoPor` / `asignadoEn` | ✱ | auditoría |

**Invariantes:**
- **Una oferta puede estar asignada a varias opciones** (con cantidades/bases distintas) **sin duplicar la
  captura**.
- **Desasignar** una oferta **no la borra** de la biblioteca.
- **Ninguna asignación se crea automáticamente en lote** ("agregar esta oferta a todas las opciones" **no
  existe**): la asignación es deliberada, una por una — es el guardarraíl de DX-6.
- Una opción **sin ninguna asignación** no puede pasar a *Listo*.

### 3.8 `PoliticaDeMarkup` (objeto maestro) + `AsignacionDeMarkup` (relación con ABM)

Mismo patrón de variante, un nivel más arriba.

**`PoliticaDeMarkup`** (ABM en `/admin/viajes/politicas-markup`): `nombre`✱, `reglas[]`✱ (por
`tipo de oferta` → `porcentaje` o `monto fijo`), `moneda`, `activa`✱, `vigenciaDesde`.

**`AsignacionDeMarkup`**: `politica`✱, `alcance`✱ (`presupuesto` · `opcion` · `item`), `objetivo`✱,
`porcentajeOverride`, `motivoDelOverride`✱ (si hay override), `asignadoPor`✱, `asignadoEn`✱.
El **override más específico gana** (ítem > opción > presupuesto), y el documento del cliente **nunca**
expone nada de esto.

### 3.9 `DocumentoDePresupuesto` — la versión congelada

`presupuesto`✱, `version`✱, `generadoEn`✱, `generadoPor`✱, `contenidoCongelado`✱ (la foto completa de
niveles/opciones/precios/sellos al momento de enviar), `vigenteHasta`✱, `canalDeEnvio` (link · PDF ·
WhatsApp · mail), `tokenPublico` (no adivinable), `vistoPorElClienteEn` (si el link lo registra).

**Regla:** el documento **no se recalcula nunca**. Es evidencia de lo que se le prometió al cliente.

### 3.10 `EventoDeSeguimiento`

`presupuesto`✱, `tipo`✱ (`enviado` · `visto` · `aceptado` · `rechazado` · `sin_respuesta` · `recontactar` ·
`nota`), `fecha`✱, `usuario`✱, `motivo` (lista corta en rechazo: precio · fechas · eligió otra agencia ·
suspendió el viaje · otro), `texto`, `fechaDeRecontacto`.

---

## 4. Estados del presupuesto y qué los dispara

```
Borrador ──(1ª asignación)──► En armado ──(marcar listo, valida)──► Listo para revisar
                                   ▲                                        │
                                   └────(rechazo interno)───────────────────┘
                                                                            │ (aprueba quien pone precio)
                                                                            ▼
                                                                       Aprobado
                                                                            │ (generar y enviar)
                                                                            ▼
                                    ┌───────────────────────────────── Enviado ─────────┐
                                    │                     │                  │          │
                              (vence la oferta        (el cliente        (el cliente   (sin respuesta
                               más corta)              acepta)            rechaza)      + N días)
                                    ▼                     ▼                  ▼          ▼
                                 Vencido              Aceptado           Rechazado   Sin respuesta
                                    │
                              ("Recotizar") ──► nueva versión en Borrador
```

| Estado | Qué significa (criollo) | Qué lo dispara | Qué se puede hacer |
|---|---|---|---|
| **Borrador** | Está el pedido, todavía no hay nada armado | Se crea la solicitud | Editar todo |
| **En armado** | Ya hay al menos una oferta asignada | **La primera `AsignacionDeOferta`** | Capturar, asignar, editar |
| **Listo para revisar** | El operador lo da por terminado | Acción **"Marcar listo"**, que **solo pasa si** valida (abajo) | Revisar; volver a *En armado* |
| **Aprobado** | Tiene precio de venta y visto bueno | Acción de quien tiene `quotes:price` | Generar documento |
| **Enviado** | El cliente lo tiene | Acción **"Enviar"** (genera y congela la versión) | Solo seguimiento; editar obliga a versión nueva |
| **Vencido** | Los precios ya no valen | **Automático:** `vigenteHasta` del presupuesto < hoy | "Recotizar" (versión nueva) |
| **Aceptado** | El cliente dijo que sí | Lo marca el operador | Cerrar la solicitud; pasa al flujo de venta/cobro del Core |
| **Rechazado** | El cliente dijo que no | Lo marca el operador, con motivo | Recotizar o cerrar |
| **Sin respuesta** | Se enfrió | Lo marca el operador **o** automático a los N días de enviado (N configurable, default 15) | Recontactar / recotizar |
| **Archivado** | Fuera del tablero | Acción manual | Solo lectura |

**Validaciones de la transición a *Listo para revisar*** (todas verificables, todas bloqueantes):
1. Al menos **un nivel** con al menos **una opción**.
2. Toda opción tiene **al menos una asignación**.
3. Toda oferta asignada tiene `unidadDePrecio`, `capturadoEn`, `vigenteHasta` y `certeza`.
4. Toda oferta de alojamiento asignada tiene **base de ocupación**.
5. **Ninguna** oferta asignada está **vencida**.
6. Cada opción declara **precio por persona en base doble**, y **single** o el rótulo **"No cotizado"** —
   nunca un número inferido.

**Vencimiento automático (el requisito duro):**
- El presupuesto tiene `vigenteHasta` = **el mínimo** de las vigencias de sus ofertas asignadas. Se
  recalcula en cada cambio de asignación.
- Un **proceso diario** (cron, alineado a PD-3: **diario**, nunca sub-horario en Hobby) pasa a **Vencido**
  todo presupuesto **Enviado / Aprobado / Listo** cuyo `vigenteHasta` ya pasó, y lo destaca en la bandeja.
- El **link público** de un presupuesto vencido **sigue abriendo** pero con un cartel arriba de todo:
  *"Estos precios estaban vigentes hasta el DD/MM/AAAA. Escribinos y te los actualizamos."* — no se oculta
  la información, se contextualiza (honestidad > prolijidad).
- Un presupuesto **Enviado** que vence **no se borra ni se modifica**: queda como evidencia.

---

## 5. RBAC — sobre los roles del Core (ADR-017)

El Core tiene **tres roles fijos**: `OWNER`, `RECEPTION`, `PROFESSIONAL` (`src/lib/capabilities.ts`). Este
módulo **no inventa roles**: se monta sobre esos, con capabilities nuevas.

### 5.1 Capabilities nuevas propuestas

| Capability | Qué habilita |
|---|---|
| `quotes:read` | Ver la bandeja, los presupuestos y la biblioteca de ofertas. **No** ve costo neto ni markup |
| `quotes:manage` | Crear solicitudes, **capturar ofertas** (ABM del objeto maestro) y **asignar/desasignar** (ABM de la relación); marcar *Listo para revisar* |
| `quotes:price` | Ver **costo neto y margen**, asignar política de markup, hacer overrides, **aprobar** |
| `quotes:send` | **Generar y enviar** el documento al cliente (congela la versión) |
| `quotes:track` | Registrar la respuesta del cliente y las notas de seguimiento |

### 5.2 Mapeo a los roles del Core

| Rol | `read` | `manage` | `price` | `send` | `track` | Lectura de negocio |
|---|:--:|:--:|:--:|:--:|:--:|---|
| **OWNER** (dueño/gerente de la agencia) | ✅ | ✅ | ✅ | ✅ | ✅ | Es el único que toca **plata** y el único que le **habla al cliente en nombre de la agencia** |
| **RECEPTION** (operador de mostrador) | ✅ | ✅ | ❌ | ❌ | ✅ | Hace **todo el laburo pesado**: busca, captura, arma los 3 niveles y las 9 opciones, y sigue al cliente. **No ve el costo ni pone el precio de venta** |
| **PROFESSIONAL** | ❌ | ❌ | ❌ | ❌ | ❌ | No aplica a este rubro (es el rol de agenda por profesional) |

**Coherente con ADR-017:** RECEPTION es "el día a día operativo, sin reportes financieros ni precios";
`quotes:price` y `quotes:send` quedan en OWNER por la misma razón por la que `commissions:manage` y el
catálogo/precios son solo-OWNER hoy.

**Reglas de seguridad (no de UX):**
- Ocultar el botón **no es** seguridad (ADR-009 §3 / ADR-017 §2.e): **cada acción del servidor** chequea su
  capability. Un RECEPTION que llama a mano la acción de markup recibe un **rechazo del servidor**.
- El **costo neto y el markup no viajan al cliente** para un usuario sin `quotes:price` — se filtran en el
  servidor, no se esconden con CSS.
- **Gating por nav, no por redirect** (MP-14): si el módulo está apagado o el rol no tiene la capability, el
  ítem **no aparece**; nada de redirects que puedan loopear.
- **Módulo asignado ≠ capability** (ADR-054/055): la pantalla exige **además** que el módulo
  `presupuestos-viaje` esté **asignado al tenant**. Un OWNER de una carnicería no ve esto aunque el rol se
  lo diera.
- **Link público del documento:** superficie sin login → **token no adivinable**, **rate-limit** y **cero
  datos internos** (SEC-3). Expone únicamente lo que el cliente ya iba a recibir por WhatsApp. **Se revisa
  con Seguridad antes de publicarse.**

### 5.3 Lo que ELEVO acá

Si la agencia necesita que **un vendedor pueda enviar sin ser dueño**, eso **no se resuelve con un
checkbox**: sería un **rol nuevo** (`VENDEDOR`) = cambio del enum `UserRole` = **migración** = §C /
Gate 2 + ADR propio. **La v1 no lo incluye**: `quotes:send` es de OWNER. Queda anotado como decisión
elevada, no como deuda escondida.

---

## 6. El módulo en el catálogo (ADR-054/055)

- **Objeto maestro del catálogo:** un descriptor `presupuestos-viaje`, `kind: "capability"` (es una
  capability del Core, con pantallas propias), `capability: "quotes:manage"`, `rubros: ["viajes"]` —
  compatibilidad **acotada al rubro**, porque una carnicería no cotiza vuelos.
- **Asignación:** `Tenant.modules[]` — se activa **tenant por tenant** desde la consola del operador.
  **Compatibilidad ≠ asignación.**
- **Dependencias:** `clients` (la ficha del contacto). No depende de `pos` ni de `agenda`.
- **El buscador de ofertas es un módulo aparte, `kind: "plugin"`** (`buscador-ofertas-viaje`), **opcional**
  y con dependencia de `presupuestos-viaje`. **Qué proveedor usa y cómo se integra lo define ingeniería.**
  Lo que **esta spec fija** es el contrato funcional: el buscador **solo precarga el formulario de
  captura**; **nunca** crea ofertas solo, **nunca** asigna solo, y **todo** lo que trae entra como
  **`certeza = verificada` únicamente si el resultado incluye precio y vigencia del proveedor** — si no,
  entra como **estimada**.
- **Rubro `viajes`:** blueprint nuevo = **configuración, no fork** (ADR-002/036). El alta del tenant de la
  agencia es del dueño (§C).

---

## 7. Criterios de aceptación (verificables — insumo de QA)

**Captura de ofertas (el requisito de "ningún precio sin fecha ni vigencia")**
- **CA-1** — Intentar guardar una oferta **sin `capturadoEn`**, **sin `vigenteHasta`**, **sin `certeza`** o
  **sin `unidadDePrecio`** → el guardado **se rechaza en el servidor** (no solo en el front) y el formulario
  dice cuál falta, en criollo.
- **CA-2** — Oferta de **alojamiento sin `baseDeOcupacion`** → rechazada. Ningún camino del código asigna un
  default de base.
- **CA-3** — El campo `certeza` **no tiene valor preseleccionado**: hay que elegir *Verificada* o *Estimada*.
- **CA-4** — Toda pantalla que muestra un precio muestra **al lado**: la **fecha de captura**, la
  **vigencia** y el **sello** Verificada/Estimada. Se verifica en: biblioteca de ofertas, panel de armado,
  vista previa y **documento del cliente**.
- **CA-5** — Una oferta con `vigenteHasta` pasada se muestra como **Vencida** en toda superficie y no se
  puede asignar a una opción nueva.

**Base de ocupación (el requisito de "por habitación ≠ por persona")**
- **CA-6** — Una tarifa cargada como **`por_habitacion_noche`, base doble**, USD 120, 12 noches, 2
  pasajeros → la opción muestra **USD 720 por persona** y **despliega la fórmula** al pasar el mouse o
  tocar. El número **no aparece sin la fórmula disponible**.
- **CA-7** — Si una opción **no tiene** ninguna oferta con base single ni `suplementoSingle` cargado, el
  precio single muestra **"No cotizado"**. **No existe** ningún camino que lo calcule dividiendo o
  multiplicando por un factor supuesto.
- **CA-8** — Cargar un `suplementoSingle` es **un importe explícito** que ingresa una persona; el sistema
  no lo propone ni lo estima.
- **CA-9** — El **documento del cliente** muestra, en cada una de las opciones, **precio por persona en base
  doble** y **precio por persona en single (o "No cotizado")** — nunca uno solo de los dos sin aclarar.

**Asignación (ADR-055)**
- **CA-10** — La **misma oferta** asignada a **dos opciones distintas** con cantidades/bases distintas
  produce **dos asignaciones** y **una sola captura**. Editar la asignación de una **no** altera la otra.
- **CA-11** — **Desasignar** una oferta de una opción **no borra** la oferta de la biblioteca.
- **CA-12** — **No existe** ninguna acción de "asignar a todas las opciones/niveles" en la UI ni en el
  servidor. (Test explícito anti-DX-6.)
- **CA-13** — Dos presupuestos del mismo tenant que usan la misma oferta muestran **el mismo precio de
  captura**; ninguno puede modificar la captura del otro sin generar una captura nueva.

**Estados y vencimiento**
- **CA-14** — Un presupuesto con **una** oferta vencida **no puede** pasar a *Listo para revisar* ni
  enviarse; el error dice **qué opción y qué ítem**.
- **CA-15** — El `vigenteHasta` del presupuesto es **exactamente el mínimo** de las vigencias asignadas, y
  se recalcula al agregar/quitar/editar una asignación.
- **CA-16** — El **proceso diario** pasa a **Vencido** todo presupuesto *Enviado/Aprobado/Listo* con
  vigencia pasada. Se verifica con reloj simulado (test de la función pura, sin tocar la DB).
- **CA-17** — El **link público** de un presupuesto vencido abre con el cartel de vencimiento arriba de
  todo, y **no** cambia ni un número del documento.
- **CA-18** — Después de **Enviado**, editar una oferta asignada **no modifica** el documento enviado:
  la UI ofrece **"Crear versión v2"**.
- **CA-19** — "Recotizar" crea la versión siguiente **copiando la estructura** y marcando cada oferta
  vencida como **"volver a capturar"**; ningún precio vencido queda presentado como vigente.

**RBAC**
- **CA-20** — Un usuario **RECEPTION** no ve la pantalla de precios, **y** la acción del servidor de asignar
  markup **lo rechaza** aunque se la invoque directo.
- **CA-21** — Un usuario **RECEPTION** que abre un presupuesto **no recibe del servidor** los campos de
  costo neto ni markup (se verifica en la respuesta, no en la pantalla).
- **CA-22** — Un usuario **PROFESSIONAL** no ve el módulo en la navegación ni puede abrir sus rutas.
- **CA-23** — Un tenant **sin el módulo asignado** no ve la navegación ni puede abrir las rutas, aunque su
  usuario sea OWNER.
- **CA-24** — Quedan en **auditoría** con actor real: capturar una oferta, cambiar su precio, asignar/
  desasignar, cambiar markup (con motivo), aprobar y enviar.

**Aislamiento y calidad**
- **CA-25** — Toda consulta del módulo lleva predicado `tenantId` / `tenantTransaction`; ningún
  `findFirst` sin `where` (MT-1). Cobertura RLS de las tablas nuevas verde (`gate:rls`).
- **CA-26** — El módulo pasa el **Gate de Excelencia** (ADR-040): 7 ángulos SAP + ángulo argentino +
  **sello GSG** en el footer del backoffice + arquitectura + `tsc`/`build`/`test` verdes.
- **CA-27** — Textos según ADR-080: fechas **DD/MM/AAAA** con zona horaria de Argentina, importes con
  `fmtMoneyARS` cuando son pesos y con código de moneda cuando no (`USD 1.234,56`), `tabular-nums` en toda
  columna de números, cero jerga ("captura" y no "snapshot", "base doble" y no "DBL", "vigencia" y no
  "TTL").
- **CA-28** — Estados de carga y estados vacíos en las tres pantallas grandes (bandeja, biblioteca,
  armado): "Todavía no cargaste ninguna oferta para este pedido" con la acción a mano.

---

## 8. Fuera de alcance de la v1 (explícito, con el porqué)

| Queda afuera | Por qué |
|---|---|
| **Reservar, bloquear cupo, emitir o ticketear** | Es **irreversible y con plata de por medio**. La v1 industrializa **el armado del presupuesto**, no la compra. Reservar exige contratos con GDS/consolidador, garantías y responsabilidad legal: es otro producto, con su propio ADR |
| **Elección e integración de un proveedor de API de ofertas** | Decisión de **ingeniería**, no de esta spec. Además, la v1 **debe** funcionar con carga manual: así se hizo el caso real, y atarla a una API la haría inservible el día que la API falle o cambie de precio |
| **Disponibilidad en tiempo real / re-precio automático** | Chocaría de frente con el principio del módulo: acá el precio **se congela con su vigencia**. Un precio que se mueve solo debajo de un documento ya enviado es exactamente el problema que vinimos a resolver |
| **Cotización en vivo del dólar / conversión automática ARS** | El tipo de cambio se **captura como referencia** con su fecha y el equivalente en pesos se muestra **siempre como Estimado**. Un conversor "vivo" daría una falsa sensación de precisión sobre percepciones e impuestos que cambian |
| **Datos personales de pasajeros** (pasaporte, DNI, nacimiento) | No hacen falta para cotizar y suman obligaciones de Ley 25.326 (ADR-067). Recién se piden cuando se reserva — y reservar está afuera |
| **Cobro de la seña / pasarela dentro del módulo** | El Core ya tiene cobros y Mercado Pago (ADR-024/075). Cuando el cliente acepta, se pasa al flujo de cobro existente. **No duplicamos** el patrón (ADR-040 §consistencia) |
| **Facturación ARCA del servicio de agencia** | Existe el módulo fiscal. Acoplarlo acá antes de tener el flujo de venta cerrado es acoplar dos cosas que todavía no se hablan |
| **Itinerario día por día, vouchers, cartas de invitación de la feria** | Es documentación **post-venta**. Otro entregable, otro momento del proceso |
| **Comparador automático, ranking o IA que elija los 3 niveles** | El **criterio profesional del operador** es el valor de la agencia. La v1 le da la herramienta, no le reemplaza el juicio. Además, una recomendación automática sin trazabilidad rompe el principio de precio verificable |
| **Reglas de tarifa estructuradas** (equipaje, penalidades, cambios como campos) | En la v1 van como **texto libre en la captura**. Estructurarlas exige normalizar formatos de N proveedores: se hace cuando haya volumen que lo justifique |
| **Comisiones por vendedor / liquidación** | Depende del rol `VENDEDOR` que la v1 no crea (§5.3) |
| **Portal del cliente con login y aceptación firmada** | La v1 entrega **link público read-only + WhatsApp** y el estado lo marca el operador. Un portal con login es superficie de autenticación nueva: **se eleva a Seguridad**, no se improvisa |
| **Presupuestos multi-tenant / benchmark de precios entre agencias** | Es cross-tenant: cae bajo ADR-027 (k-anonimato, gate de masa). Hoy no hay masa |

---

## 9. Lo que hay que ELEVAR antes de construir (§C · Arquitecto/Dueño)

1. **Tablas nuevas → migración aditiva** (`SolicitudDeViaje`, `OfertaCapturada`, `Presupuesto`, `Nivel`,
   `Opcion`, `AsignacionDeOferta`, `PoliticaDeMarkup`, `AsignacionDeMarkup`, `Documento`,
   `EventoDeSeguimiento`) → **Gate 2**, migración **escrita y NO aplicada** (ESTADO §5 ya tiene pendientes;
   no agrandar el problema sin OK).
2. **Rubro/blueprint `viajes` + alta del tenant de la agencia** → acción del dueño (ADR-030: primero la
   venta, después la inversión; hasta entonces, **demo**).
3. **Link público del documento** → revisión de **Seguridad** (token, rate-limit, qué se expone) antes de
   cualquier deploy.
4. **Rol `VENDEDOR`** (si el negocio lo pide) → cambio de enum + ADR propio.
5. **Cron diario de vencimiento** → alineado a PD-3 (Hobby: **diario**), con contexto de tenant explícito
   (gap conocido de ADR-062: crons sin contexto de tenant).

---

## 10. Las 3 decisiones de producto que más condicionan el módulo

**1. La unidad de precio y la base de ocupación son datos obligatorios, no un cálculo del sistema.**
El módulo **no infiere** un precio por persona a partir de uno por habitación sin que alguien haya
declarado la base, y **no estima** un single dividiendo o multiplicando. Cuando falta el dato, dice
**"No cotizado"**. Esto vuelve el alta de una oferta más lenta y más molesta — **a propósito**: la
fricción de un campo obligatorio cuesta treinta segundos; un presupuesto duplicado cuesta un cliente.

**2. La oferta es una captura congelada con vigencia, y el presupuesto es una asignación de capturas
(ADR-055) — no una consulta viva.** De acá salen, en cascada, casi todas las demás reglas: el sello
Verificada/Estimada, el vencimiento automático por la vigencia más corta, el documento congelado por
versión y la recotización que **obliga a volver a capturar** en vez de arrastrar un precio viejo. Es
también lo que permite que la misma oferta viva en nueve opciones sin duplicarse y sin que editar una
contamine a las otras.

**3. La v1 industrializa el armado, no la compra — y funciona con captura manual.**
No reserva, no emite, no bloquea cupo, y **no depende de ninguna API para ser útil**. El buscador
automático es un **plugin enchufable** que solo **precarga** el formulario de captura. Así el módulo se
puede vender y usar desde el día uno (como se hizo el caso de la Feria de Cantón, a mano), y la
integración con proveedores se suma después sin rediseñar nada.

---

— Elaborado por GSG
