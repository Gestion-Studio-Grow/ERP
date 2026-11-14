# Equipo de agentes de Administración · MIA — 03 · Especificación técnica

> Diseño del 14/11/2026, **corregido el 14/11 tras la revisión adversarial y con las decisiones del dueño de ese día**
> (lista de cambios: `05`, sección F). Nada construido ni aplicado. Las migraciones se **escriben sin aplicar** (Gate 2) y el código tolera su ausencia. Sin
> dependencias nuevas.

## 1. Principios que mandan sobre el resto

1. Los límites viven en el código. Las instrucciones del modelo sólo describen el trabajo.
2. El modelo nunca recibe ni devuelve `tenantId`, importes para ejecutar ni permisos: sólo identificadores que el
   código valida contra el negocio.
3. Un solo motor para todos los negocios (`src/lib/agentes/`); lo propio de cada rubro son las herramientas.
4. Todo es apagable: interruptor por negocio (lo prende GSG), pausa por puesto (la maneja el cliente).
5. Memoria y registro en tablas propias con RLS: no dependen del proveedor de IA.
6. **Leer, pensar y escribir van separados** (§4.1). Nunca se llama al modelo con una transacción abierta y nunca se
   lee con el cliente global dentro de una.
7. **Lo que no puede fallar no depende del modelo:** el origen de cada renglón, a quién pertenece cada importe, los
   compromisos y todo texto que sale hacia un tercero los arma o los controla el código (§4.2, §8.1, §13).

## 2. Capas y archivos nuevos

```
src/lib/agentes/                      ← motor común, sin nada de MIA ni de «proyectos»
  tipos.ts                puro   Puesto, Tarea, Nivel, Herramienta, Contexto, Resultado, Fila, Cifra, Origen
  permisos-core.ts        puro   nivelEfectivo(), decidirLlamada(), catálogo de topes
  cifras-core.ts          puro   control de cifras y de atribución (cada importe, con su entidad)
  texto-seguro-core.ts    puro   filtro de lo que redacta el modelo: enlaces, CBU, alias, mails, teléfonos
  plantillas-core.ts      puro   textos que salen a terceros (recordatorio): plantilla + datos puestos por código
  gasto-core.ts           puro   costo estimado (entrada + salida) y real, saldo del mes
  agenda-core.ts          puro   qué compromisos tocan hoy (con atraso), estados, «parece una promesa»
  respaldo-core.ts        puro   respuestas por plantilla cuando no hay IA
  proveedor.ts            puro   interfaz ProveedorIA + proveedor de guion (tests y demo)
  proveedor-claude.server.ts     adaptador a la API de mensajes con herramientas
  proveedor-esquema.server.ts    adaptador para modelos sin herramientas nativas (emula con JSON por esquema)
  motor.server.ts                la vuelta del agente (máx. 6 pasos), único que llama al proveedor
  lectura.server.ts              `ctx.db`: acceso de SÓLO LECTURA al negocio (§6.1)
  contadores.server.ts           cupos de los topes con UPDATE condicional (§6)
  memoria.server.ts              historial, compromisos, cuaderno, búsqueda (lecturas y escrituras)
  propuestas.server.ts           crear, decidir y ejecutar propuestas (transacción y huella)
  registro.server.ts             una fila por acción; nunca se edita ni se borra
  gasto.server.ts                reserva, cierre y vencimiento de la reserva del gasto del mes
  estado.server.ts               interruptor del negocio, pausa por puesto, ¿están las tablas?
  barrido.server.ts              lo que corre la tarea diaria, negocio por negocio, en tres pasos (§8)
  puestos/administracion.ts      catálogo: los 5 puestos, sus tareas, niveles iniciales, techos y topes
src/lib/proyectos/agentes/            ← herramientas de MIA (rubro productora)
  actor-agente.server.ts         arma el actor del agente y la vista de la persona (ver §5)
  herramientas-cobranzas.server.ts · -pagos · -bancos · -coordinacion · -comprobantes
  acciones-equipo.ts      "use server": conversar, decidir propuesta, confirmar compromiso, agenda, cuaderno, pausar
src/app/admin/(dashboard)/proyectos/mi-equipo/   page.tsx + _hoy · _conversar · _aprobar · _agenda · _cuaderno · _registro · _ajustes
```

Se tocan (poco) archivos existentes: `gestion-core.ts:616-631` (módulo nuevo `agentes`), `:645-651` (permiso de
fábrica: Administración `E`, el resto `N`), `:675-684` y `:704-712` (app `gestion-mi-equipo` en la barra de
Dirección y Administración); `src/apps/catalogo/comercial.ts` (alta de la app junto a `gestion-agentes`, `:302`);
`src/cambios/interruptores.ts:66` (interruptor `equipo-agentes`); `src/app/api/cron/reminders/route.ts:31-37`
(sumar el barrido, mismo patrón, **y declarar `maxDuration`**, §8); `prisma/seed-mia-producciones.ts:63-64` (prender
el interruptor en la demo, §12); `prisma/rls/0002_app_role.sql` (una línea al final, §3). `ia.server.ts` **no se
modifica**: el motor nuevo usa sus propios adaptadores y los 7 agentes actuales siguen igual.

**Más de un equipo en el mismo negocio (decisión del dueño, 14/11).** El equipo de Ale es el de **Dirección de MIA**,
en el mismo negocio que el de Administración; y después viene un equipo para la propia GSG, en su negocio (`05`,
sección D). Los dos entran como **otro archivo en `puestos/`** y sus herramientas; el motor, las tablas y el panel no
cambian. Para que eso sea cierto, el motor no puede asumir «un equipo por negocio» ni «rol Administración»:
- Cada archivo de `puestos/` declara un **equipo**: su identificador, el rol base de sus agentes, los módulos que hay
  que tener para verlo y sus puestos. Los identificadores de puesto llevan el equipo adelante
  (`administracion.cobranzas`, `direccion.…`), así no chocan en las tablas, que guardan `puesto` como texto.
- **Qué equipo ve cada persona lo decide el código:** toda lectura de conversaciones, propuestas, agenda, cuaderno,
  partes y registro filtra por los puestos de los equipos visibles para esa persona. Administración no ve el equipo de
  Dirección ni su registro; Dirección ve los dos.
- El panel recibe la lista de equipos visibles por parámetro; el parte es uno por equipo y por día (§3).
- El tope de gasto es del negocio: lo comparten sus equipos (§11).

## 3. Modelo de datos (una migración aditiva, sin aplicar)

Nombre propuesto: `prisma/migrations/20261115120000_agentes_base/` (**verificar colisión de timestamp** contra las
ramas abiertas antes de escribirla; la última en este árbol es `20261110170000_tenant_cuit_verificado`). Sólo
`CREATE TABLE`, índices, claves foráneas, políticas y un `REVOKE` sobre una tabla nueva: no toca tablas existentes, no
agrega columnas a ninguna, no usa enums (texto validado en código, como `SupportTicket`). Plata en centavos enteros o
micro-dólares enteros, nunca `Float`. Son **10 tablas** (eran 8: se sumaron el parte y los contadores).

| Tabla | Campos principales | Notas |
|---|---|---|
| `AgentePuesto` | `tenantId`, `puesto` (texto del catálogo), `estado` ACTIVO·PAUSADO, `pausadoPor`, `pausadoEl`, `niveles` Json, `updatedAt` · único (`tenantId`,`puesto`) | Sin fila = activo con niveles iniciales. `niveles` nunca supera el techo del código |
| `AgenteConversacion` | `id`, `tenantId`, `puesto`, `userId`, `titulo`, `origen` PANEL·TAREA, `createdAt`, `cerradaEl` · único (`tenantId`,`id`) | Memoria 1 |
| `AgenteMensaje` | `id`, `tenantId`, `conversacionId`, `rol` user·assistant·herramienta, `texto`, `filas` Json (renglones con su origen, armados por código), `createdAt` · índice (`tenantId`,`conversacionId`,`createdAt`) · FK (`tenantId`,`conversacionId`) | El historial deja de vivir en el navegador (`diseno-core.ts:362`) |
| `AgenteCompromiso` | `id`, `tenantId`, `puesto`, `texto`, `fecha` (día), `entidad`, `entidadId`, `clave`, `estado` ABIERTO·CUMPLIDO·ROTO·CANCELADO, `creadoPor` (siempre una persona o `sistema`), `revisadoEl`, `cerradoEl` · índice (`tenantId`,`estado`,`fecha`) · **único parcial** (`tenantId`,`puesto`,`clave`) `WHERE estado='ABIERTO'` | Memoria 2. `clave` = `entidad:entidadId:fecha`; sin entidad, hash del texto normalizado + fecha. Dos toques o dos corridas no abren dos iguales |
| `AgenteNota` | `id`, `tenantId`, `puesto`, `texto` (≤ 500), `activa`, `autor`, `createdAt`, `updatedAt` | Memoria 3. Hasta 40 activas por puesto |
| `AgentePropuesta` | `id`, `tenantId`, `puesto`, `tarea`, `herramienta`, `entidad`, `entidadId`, `argumentos` Json, `resumen` Json (datos del sistema para la tarjeta), `texto`, `huella`, `estado` PENDIENTE·EJECUTADA·RECHAZADA·VENCIDA·FALLIDA, `venceEl`, `decididaPor`, `decididaEl`, `resultado` Json · único (`tenantId`,`id`) · **único parcial** (`tenantId`,`herramienta`,`entidad`,`entidadId`) `WHERE estado='PENDIENTE'` | Una sola abierta por herramienta y entidad, sin importar el día; rechazada o vencida, se puede rehacer en el momento |
| `AgenteParte` | `id`, `tenantId`, `equipo`, `dia`, `origen` AUTOMATICO·PEDIDO, `numeros` Json (los calcula el código), `intro` (texto de la IA, puede faltar), `creadoPor`, `createdAt` · índice (`tenantId`,`equipo`,`dia`) · **único parcial** (`tenantId`,`equipo`,`dia`) `WHERE origen='AUTOMATICO'` | Un parte automático por día, por equipo y por negocio, garantizado por la base. Los «a pedido» van por contador (3 por día) |
| `AgenteContador` | `tenantId`, `puesto`, `tope`, `periodo` (día `AAAA-MM-DD` en hora de Argentina, o `abiertos`), `n` · PK (`tenantId`,`puesto`,`tope`,`periodo`) | Cupos de los topes (§6) |
| `AgenteAccion` | `id`, `tenantId`, `puesto`, `tipo` LECTURA·PROPUESTA·DECISION·EJECUCION·DERIVACION·TOPE·RECHAZO·ERROR·PAUSA, `herramienta`, `detalle` Json (sin datos sensibles), `nivel`, `actor` (`agente:<puesto>` o usuario), `conversacionId`, `propuestaId`, `proveedor`, `modelo`, `tokensEntrada`, `tokensSalida`, `microUsd`, `ms`, `createdAt` · índice (`tenantId`,`createdAt`) · FK (`tenantId`,`conversacionId`) y (`tenantId`,`propuestaId`) | Registro. Sólo `INSERT`, **también en la base** (abajo) |
| `AgenteGasto` | `tenantId`, `periodo` (AAAA-MM), `microUsd`, `reservado`, `reservaVenceEl`, `llamadas` · PK (`tenantId`,`periodo`) | Contador del tope de gasto (§11) |

**Aislamiento escrito en la base, no sólo en RLS** (patrón completo de
`prisma/migrations/20261106120000_support_ticket/migration.sql`, no sólo sus políticas):
- Cada tabla lleva `tenantId`, su clave foránea a `Tenant` y la política `tenant_isolation` (`:54-58`).
- Las tablas que son destino de otra llevan índice único (`tenantId`,`id`) (`:29-31`) y las hijas apuntan con **clave
  foránea compuesta** (`tenantId`,`…Id`) (`:51`): un mensaje no puede colgar de una conversación de otro negocio aunque
  falle el código. Las compuestas van con `ON DELETE RESTRICT` (conversaciones y propuestas no se borran).
- Los índices únicos parciales se escriben en SQL a mano (precedente:
  `prisma/migrations/20261104122000_contabilidad_ola1/migration.sql:191`); el constructor mira cómo quedó declarado ese
  precedente en `schema.prisma` y hace lo mismo.
- **Registro sin edición ni borrado, en la base:** el rol de la app recibe `UPDATE` y `DELETE` sobre toda tabla nueva por
  privilegios por defecto (`prisma/rls/0002_app_role.sql:63-64`). La migración se los quita a `AgenteAccion`:
  `REVOKE UPDATE, DELETE ON "AgenteAccion" FROM app_rls`, dentro de un `DO` que primero comprueba que el rol exista (en
  la base en memoria de la demo no existe). Como `0002_app_role.sql:58` los volvería a dar si alguien lo corre de
  nuevo, el mismo PR agrega esa línea al final de ese archivo. Lo comprueba un test (§14).

No se usa `AuditLog` para el registro: su esquema es genérico (`prisma/schema.prisma:1050-1064`) y el registro del
agente necesita consumo, nivel y propuesta. Las decisiones humanas (aprobar, pausar) **además** dejan su fila de
auditoría con `auditAdmin`, como el resto del backoffice (`acciones-empresa.ts:222`).

**Tolerancia a la ausencia:** `estado.server.ts` expone `tablasDeAgentes(tenantId)` con el patrón de
`migracionContableAplicada` (`src/lib/contabilidad/modulo.server.ts:40-56`) y `esMigracionPendiente`
(`src/lib/contabilidad/repo.ts:62-65`). Sin tablas: el panel muestra el cartel, las acciones devuelven
`{ ok:false }` y el barrido saltea al negocio. Lo cubre un test.

## 4. Contrato de herramientas

```ts
type Clase = "lectura" | "prepara" | "ejecuta" | "deriva";
interface Herramienta<A, D> {
  nombre: string;              // "cobranzas.cuotas_vencidas"
  descripcion: string;         // para el modelo
  esquema: JsonSchema;         // argumentos; additionalProperties:false; nunca tenantId ni importes a ejecutar
  clase: Clase;
  tarea: TareaId;              // de ahí sale el nivel
  leer(ctx: Contexto, a: A): Promise<Resultado<D>>;        // fase LEER: nunca dentro de una transacción
  huella?(tx: Tx, tenantId: string, a: A): Promise<string | null>;   // fase ESCRIBIR: consulta mínima propia, sólo con tx
  tarjeta?(a: A, d: D): Tarjeta;                           // prepara: la arma el código
  ejecutar?(tx: Tx, e: Escritura, a: A): Promise<Resultado<unknown>>; // fase ESCRIBIR: sólo tx
}
type Resultado<D> =
  | { ok: true; datos: D; filas: Fila[] }
  | { ok: false; motivo: "sin_permiso" | "no_existe" | "tope" | "pausado" | "invalido" | "error"; mensaje: string };
interface Fila { id: string; entidad: string; entidadId: string; proyectoId: string | null; etiquetas: string[]; cifras: Cifra[]; origen: Origen }
interface Cifra { tipo: "importe" | "fecha" | "porcentaje" | "cantidad"; valor: number; moneda?: string; texto: string }
interface Origen { etiqueta: string; enlace: string; leidoEl: string }
interface Contexto { tenantId: string; puesto: PuestoId; actor: ActorAgente; humano: Actor | null; ahora: Date; db: LecturaDelNegocio }
interface Escritura { tenantId: string; puesto: PuestoId; actor: ActorAgente; humano: Actor | null; ahora: Date }
```

Reglas del contrato:
- `leer` usa las **mismas lecturas que las pantallas** (`cuotasDelNegocio`, `empresa.server.ts:20-43`;
  `recuadrosDeCuotas`, `:46`; `cobranzasDelNegocio`, `cobranza.server.ts:75`; `pendientesDeCobro`,
  `cobranza-core.ts:334`). No se escriben consultas paralelas de plata.
- Cada renglón sale como `Fila`: el código le pone la entidad, las etiquetas (cliente, evento, concepto), sus cifras y su
  **origen**. Los importes van al modelo ya formateados y cada uno queda atado a su fila.
- El resultado viaja al modelo dentro de `<datos>` con `bloqueDeDatos` (`diseno-core.ts:379-385`), nunca como texto libre.
- `ahora` se inyecta: ningún `Date.now()` dentro de reglas puras (norma de tests deterministas).
- `ctx.db` es de **sólo lectura** (§6.1). `Escritura` no trae ningún cliente: adentro de la transacción sólo existe `tx`.

Herramientas de la primera entrega: `cobranzas.resumen`, `cobranzas.cuotas_vencidas`, `cobranzas.cuotas_por_vencer`,
`cobranzas.cuotas_de_cliente`, `coordinacion.parte_del_dia`, `equipo.derivar`. Segunda:
`cobranzas.preparar_recordatorio`, `agenda.anotar`, `agenda.listar`, `cuaderno.leer`, `memoria.buscar`. Después:
`pagos.*`, `bancos.*`.

### 4.1 Dónde se lee y dónde se escribe (tres fases)

**El defecto que esto evita (verificado en el código).** `cuotasDelNegocio` usa el cliente global
(`empresa.server.ts:21`). Dentro de `tenantTransaction`, ese cliente **no** usa la conexión de la transacción: sale
por otra conexión, sin el ajuste del negocio (`src/lib/rls.ts:118-119`). Con RLS prendido no da error: **devuelve
vacío**. Un parte armado así diría «no hay cobros vencidos» sin que nadie se entere. Lo mismo vale para
`recuadrosDeCuotas` (`:46`), `cashflowDeEmpresa` (`:82`) y `datosDeBancos` (`:113`). El aviso ya está escrito en el
código: «Lee por fuera de la transacción: llamarla antes de abrirla» (`gestion.server.ts:94`).

| Fase | Dónde corre | Con qué | Qué entra |
|---|---|---|---|
| **1 · LEER** | Fuera de toda transacción y dentro del contexto del negocio: en un pedido del panel ya está; en la tarea diaria se abre a mano con `runInTenantContext(tenantId, …)` (`src/lib/tenant-context.ts:36`) | Las lecturas de las pantallas y `ctx.db`. Cada consulta abre su transacción corta con el ajuste del negocio (`rls.ts:139-143`) | `leer` de las herramientas, memorias, interruptor, pausa, estado del gasto |
| **2 · PENSAR** | Fuera de toda transacción | Sin base | Llamada al proveedor de IA, control de cifras, filtro de texto |
| **3 · ESCRIBIR** | `tenantTransaction` corta, **sin** `timeoutMs`: rige el tope de 5 s (`rls.ts:172-174`) | Sólo `tx` | Tablas `Agente*`, cupos, `huella` y `ejecutar` |

- **Dentro de la fase 3 sólo se llaman funciones que reciben la conexión, y se les pasa `tx`.** Verificadas hoy:
  `tiposDeCambio` (`cobranza.server.ts:12`), `cobranzasDelNegocio` (`:75-81`), `cobranzaConCuotas` (`:94`),
  `pendienteDeLaCuota` (`:113`), `configProyectos` (`datos.server.ts:25`). Las de `empresa.server.ts` no la reciben: sólo
  van en la fase 1.
- **La huella se recalcula en la fase 3 con una consulta mínima propia sobre `tx`** (para una cuota:
  `tx.proyectoCuota.findFirst` con `id`, `tenantId` y los campos de la huella). Es la única lectura de negocio que no
  pasa por las lecturas de pantalla: no calcula plata, sólo compara si algo cambió.
- **Candado en el motor:** antes de la fase 1 y de la fase 2, el motor comprueba `getTenantStore()?.insideTx`
  (`tenant-context.ts:45`); si está dentro de una transacción, corta con error de programación. Una herramienta mal
  escrita falla en el test, no en producción en silencio.
- **Todo camino comprueba que no vino vacío por error:** el test con el rol sin bypass (§14) exige que el negocio A vea
  **lo propio (más de cero)** y nada de B, en la conversación, en el barrido, en `huella` y en `ejecutar`. La demo en
  memoria no sirve para esto: ahí toda conexión es superusuario (`avisos-programados-postgres.test.ts:4-5`).

### 4.2 Quién escribe qué en una respuesta

- El modelo escribe la **prosa**. Donde quiere mostrar renglones pone una marca (`[[filas:<id del resultado>]]`) y el
  código la reemplaza por la lista armada desde `filas`, cada renglón con su origen. El modelo no escribe orígenes: una
  línea «Fuente:» escrita por él se descarta.
- Toda cifra que quede en la prosa pasa el control de cifras y de **atribución** (§13). El mismo control corre sobre
  la introducción del parte y sobre lo que el modelo agregue a una propuesta.
- Los textos de confirmación («Anotado», «Dejé listo un recordatorio», «Listo para enviar») los emite el código después
  de que la escritura ocurrió; el modelo no puede afirmar que hizo algo.

## 5. Identidad y permisos del agente

- El agente **no tiene usuario con clave ni sesión**. Su identidad es `agente:<puesto>` (va a `actor` del registro y
  a `autor` de `registrarCambio`, `gestion.server.ts:84-92`).
- `ActorAgente` se arma con el **rol base que declara su equipo** (para este equipo, `ADMINISTRACION`; `permisoDe`,
  `gestion-core.ts:725-729`), recortado a los módulos que el puesto declara. Si un negocio le sacó a Administración un
  permiso, el agente también lo pierde. Ojo con el equipo de Dirección: ese rol tiene todo permitido en el código
  (`gestion-core.ts:726`), así que ahí el único límite es la lista de módulos del puesto; por eso la lista es
  obligatoria y un puesto sin módulos declarados no lee nada.
- En conversación, lo que se ve es la **intersección** entre el agente y la persona que habla, en **tres capas** (el
  diseño anterior sólo miraba la primera):
  1. **Módulo:** `puede` (`gestion.server.ts:44-46`).
  2. **Proyectos:** `filtroDeProyectos(humano)` (`:69-72`). Toda `Fila` con `proyectoId` se descarta si ese proyecto no
     es visible para la persona; las cuotas de la empresa (sin proyecto) sólo con el módulo `empresa`. Los totales se
     recalculan sobre lo que quedó: nunca se muestra un total que incluya lo que la persona no ve.
  3. **Columnas:** `columnasOcultas(humano)` (`:62-66`). Cada herramienta declara a qué columna de la ficha corresponde
     cada campo (`costoUnit`, `costoTotal`, `recargo`, `margen`, `gestion-core.ts:717-723`); el campo oculto se quita
     antes de llegar al modelo.
  El recorte lo hace el motor sobre el `Resultado`, no cada herramienta. De fábrica entran Dirección y Administración,
  que ven todos los proyectos (`gestion-core.ts:732`), así que hoy el recorte no quita nada; pero los permisos son
  editables por negocio y el test lo prueba con un rol que no ve todo.
- **El parte automático** (sin persona) se arma con los permisos del agente. Los totales del parte sólo se le muestran a
  quien ve todos los proyectos y el módulo `empresa`; el resto ve sus compromisos y el cartel «tu rol no ve el parte completo».
- Aprobar exige `exigirEditar` del módulo de la herramienta (`gestion.server.ts:56-60`) más el módulo `agentes`.

## 6. Motor de permisos y topes (`permisos-core.ts`, puro)

`decidirLlamada({ puesto, tarea, clase, config, estado }) → correr | proponer | derivar | negar(motivo)`

1. Interruptor del negocio apagado o puesto en pausa → `negar("pausado")`.
2. `nivel = min(techoDeCodigo[tarea], config.niveles[tarea] ?? inicial[tarea])`. Un valor guardado mayor al techo se
   ignora y se registra.
3. `lectura` → correr. `prepara` → nivel ≥ 1 propone; nivel 0 niega. `ejecuta` → nivel 2 corre **si pasa los topes y
   la huella**; nivel 1 lo convierte en propuesta; nivel 3 deriva.
4. **Topes con cupo atómico, no con «contar y después escribir».** `contadores.server.ts` → `tomarCupo(tx, { puesto,
   tope, periodo, max })`: `INSERT … ON CONFLICT DO NOTHING` de la fila y después un solo `UPDATE "AgenteContador" SET
   n = n + 1 WHERE … AND n < :max`. Cero filas = tope alcanzado y la transacción no escribe nada más. Va en la misma
   transacción que la escritura que consume el cupo. Los topes «abiertos a la vez» usan `periodo = 'abiertos'` y se
   devuelven al cerrar: el cierre es condicional (`updateMany … WHERE estado='ABIERTO'`, una fila) y recién entonces
   `n = n - 1`. «Una abierta por cuota» no es un contador: es el índice único parcial de §3.
5. Toda salida que no sea `correr` deja fila en el registro con su motivo.

### 6.1 Sólo lectura por construcción (reemplaza a la guardia de imports)

La guardia anterior era una lista negra de imports: una herramienta podía escribir con `prisma.<modelo>.update` sin
importar nada prohibido. Se reemplaza por tres cierres:

1. **`ctx.db` (`lectura.server.ts`):** fachada sobre el cliente que sólo expone `findMany`, `findFirst`, `count`,
   `aggregate` y `groupBy`, sobre los modelos que el puesto declara en su catálogo, con `tenantId` forzado en el
   `where`. Cualquier otra operación (`create`, `update`, `upsert`, `delete`, `$executeRaw`, `$queryRaw`,
   `$transaction`) o modelo no declarado **lanza** y queda en el registro. No da acceso a las tablas `Agente*`: esas se
   leen y escriben sólo por las puertas del motor.
2. **Las herramientas no tienen cliente de escritura a mano.** Los archivos `herramientas-*.server.ts` sólo pueden
   importar de una **lista blanca**: los tipos del motor, las reglas puras y las lecturas de pantalla nombradas en §4.
   El test estático falla si importan `@/lib/prisma`, `@/lib/prisma-base` o `@/lib/rls`, o si aparece en su código una
   llamada de escritura (`.create(`, `.createMany(`, `.update(`, `.updateMany(`, `.upsert(`, `.delete(`,
   `.deleteMany(`, `$executeRaw`, `$queryRaw`).
3. **En `src/lib/agentes/` sólo se escribe en tablas `Agente*`** y siempre con `tx`: el mismo test exige que toda
   llamada de escritura sea sobre un delegado `tx.agente…`. Las dos excepciones se nombran una por una: `avisar`
   (aviso interno, `gestion.server.ts:170`) y, desde la tanda 4, la conciliación (§7.1).

Tests: `solo-lectura.test.ts` (unidad: `ctx.db.proyectoCuota.update` lanza; un modelo no declarado lanza; `where` de
otro negocio se pisa) y `guardia-escrituras.test.ts` (estático, lista blanca, probado además contra código de ejemplo
para que no sea un test que nunca puede fallar, como hace `interruptores-escritura.test.ts:90-109`).

## 7. Propuestas y aprobación (`propuestas.server.ts`)

- **Crear** (fase 1, después fase 3): valida argumentos y `leer` fuera de transacción; adentro, `huella(tx)`,
  `tomarCupo`, `tarjeta` e `INSERT`. Si choca el índice único parcial (ya hay una PENDIENTE para esa herramienta y
  entidad) → se devuelve la existente, sin error. Hash de la huella: los campos que justifican la acción (para una
  cuota, `id · monto · moneda · venceEl · pagadoEl · anuladoEl`).
- **Decidir** (una transacción corta): leer la pausa del puesto con `tx`; `updateMany` de PENDIENTE a EJECUTADA con
  `count === 1` como candado (recurso de `acciones-empresa.ts:239-240`); `huella(tx)`; si cambió → VENCIDA en la misma
  transacción; si no, `ejecutar(tx)`. Un error deshace la transacción entera (la propuesta vuelve a PENDIENTE).
- **Paso a FALLIDA, condicional:** en una segunda transacción, `updateMany … WHERE id AND estado='PENDIENTE' AND
  huella = :laMisma` → FALLIDA. Si no tocó ninguna fila es que otra decisión ganó en el medio: no se pisa nada y se
  registra. Rechazar y vencer también son `updateMany` condicionales sobre PENDIENTE.
- **Rehacer:** una RECHAZADA, VENCIDA o FALLIDA ya no ocupa el índice: se puede crear otra en el momento (la clave
  anterior, con el día adentro, lo bloqueaba hasta el día siguiente y a la vez dejaba dos abiertas de días distintos).
- «Corregir y aprobar» sólo cambia el saludo, el cierre y la frase libre; el renglón de datos, `argumentos` y `resumen`
  no son editables. Si el texto corregido trae un enlace o un dato bancario, el panel lo avisa y pide confirmar (lo
  escribió una persona: decide ella).
- Vencimiento: 7 días; el barrido las pasa a VENCIDA.

### 7.1 Conciliación (tanda 4): no heredar la carrera de hoy

La acción actual comprueba «esa cuota ya está conciliada» y después actualiza, en dos pasos sueltos y sin transacción
(`acciones-empresa.ts:238-239`); `cuotaId` no es único en `ProyectoMovBanco` (`prisma/schema.prisma:4082`). Dos
movimientos distintos pueden quedar atados a la misma cuota si se concilian a la vez. La función de servidor que se
extrae (`conciliarEnTx(tx, …)`) hace, en este orden: candado de fila sobre la cuota (`SELECT … FOR UPDATE`, con su
`AND "tenantId" = …` escrito a mano, como exige `rls.ts:105-112`), comprobar que ningún movimiento la tenga, y el
`updateMany` condicional del movimiento. La acción manual pasa a llamarla dentro de `tenantTransaction`. Los importes
son `Float` (`schema.prisma:3852` y `:4079`): «importe exacto» se compara en centavos enteros (`Math.round(x * 100)`),
nunca con `===`. Un índice único sobre `cuotaId` sería la defensa de base, pero toca una tabla existente y puede chocar
con datos ya cargados: queda como decisión aparte (`05`, D13).

## 8. Agenda y disparadores

- Único despertador: la tarea diaria existente (`vercel.json:8-17`, 12:00 UTC = 9:00 ART). **No se agrega otra**
  (mismo criterio que `route.ts:31`). Granularidad: el día. Si no corrió, el siguiente barrido levanta lo atrasado
  (ventana de 7 días, como `avisarCuotas`, `gestion.server.ts:124-139`).
- **La ruta declara su tiempo.** Hoy `route.ts` no declara `maxDuration`. Se agrega `export const maxDuration` (valor
  provisional 120, como `proyectos/agentes/page.tsx:10`; el máximo del plan se lee en la documentación oficial de
  Vercel y se cita en el PR). El barrido de agentes va **último** en la ruta, después de los recordatorios de turnos
  (`route.ts:22`) y de los avisos (`:32-37`), y recibe por parámetro el tiempo que queda menos 15 s de margen.
- `barrerAgentes({ ahora, tiempoHasta })`: negocios con interruptor prendido (lectura como `contabilidadPrendidaEn`,
  `modulo.server.ts:20-37`), uno por uno; el error de uno no frena a los demás (`avisos-programados.server.ts:18-25`).
  **Ya no es «todo dentro de una transacción por negocio».** Por cada negocio, tres pasos:

  | Paso | Fase | Qué hace |
  |---|---|---|
  | A | 1 · LEER, en `runInTenantContext` | Tablas, pausa, cuotas (lecturas de pantalla), compromisos del día y atrasados, propuestas por vencer |
  | B | 3 · ESCRIBIR, transacciones cortas | **Todo lo que no necesita IA:** vencer propuestas; levantar compromisos (`updateMany` condicional sobre `revisadoEl`: sólo si no se revisó hoy); guardar el parte con sus números (`AgenteParte`; si choca el único del día, no repite); crear las propuestas de recordatorio con la plantilla (§13); avisos internos. Lotes de hasta 50 filas por transacción para no pasar los 5 s |
  | C | 2 · PENSAR, después 3 | Con lo que quede de tiempo y de gasto: hasta 5 redacciones (introducción del parte, frase libre). Cada una: reserva de gasto (§11), llamada con corte por tiempo, control de cifras y filtro, y una transacción corta que guarda el texto **sólo si** el parte o la propuesta siguen como estaban |

- Presupuesto de IA por negocio: lo que dé `min(40 s, tiempo restante ÷ negocios que faltan)`, con reloj inyectado. Lo
  que no entra queda «preparar al abrir» y se redacta cuando alguien abre el panel (mismo recurso que los avisos al
  abrir Inicio, `gestion.server.ts:148`). Si la función se corta entre B y C no queda nada a medias: los números ya
  están guardados y falta sólo el texto.
- El panel también llama al modelo fuera de transacción; `mi-equipo/page.tsx` declara `maxDuration` como sus vecinas.
- Idempotencia: el único parcial del parte, el de las propuestas, la `clave` de los compromisos y el `updateMany`
  condicional de `revisadoEl` hacen que dos corridas el mismo día, o dos a la vez, no dupliquen.

### 8.1 Compromisos y memoria: lo hace el código

- **Una promesa de pago no la anota el modelo.** Cuando el modelo llama `agenda.anotar`, el código no crea nada: arma
  una tarjeta en la charla con datos del sistema («¿Anoto que {cliente} paga el {fecha}?») y dos botones. Al tocar
  «Anotar», una acción de servidor valida fecha y entidad, toma el cupo y crea el compromiso. `creadoPor` es la persona.
- **Si el modelo no llamó a la herramienta, igual no se pierde:** la pestaña Conversar tiene siempre el botón «Anotar
  compromiso», y `agenda-core.pareceUnaPromesa(texto, ahora)` (regla pura: verbo de pago más una fecha o un día)
  ofrece «¿Anoto esta promesa?» con el formulario precargado cuando la vuelta terminó sin tarjeta.
- **Recordar tampoco depende de que el modelo se acuerde de buscar.** Antes de la primera llamada de cada vuelta, el
  código busca en el mensaje de la persona los nombres de clientes y proveedores del negocio y, si encuentra alguno,
  corre `memoria.buscar` por su cuenta y mete el resultado en `<datos>` con origen («Cuaderno», «Agenda» o «Historial ·
  charla del {fecha}»). El modelo además puede llamar a `memoria.buscar` para buscar otra cosa (caso M1).
- `memoria.buscar(texto, entidadId?)`: notas activas del puesto, compromisos de la entidad y mensajes de **las charlas
  de esa misma persona** con ese puesto (búsqueda por texto, últimos 90 días, hasta 10 extractos). Lo que dijo otra
  persona no se cruza por esta vía: lo compartido entre personas es el cuaderno y la agenda, que tienen autor.
  Sin índice de texto ni dependencias nuevas: alcanza para el volumen de un negocio; si deja de alcanzar, se anota.

## 9. Registro

`registrar(db, fila)` es la única puerta. Se llama desde el motor, no desde las herramientas, así ninguna queda sin
anotar. `detalle` guarda nombres de herramienta, identificadores y resultado; **no** guarda el texto completo de los
datos leídos ni datos bancarios. El informe mensual y la pestaña Registro leen de acá. La app no puede editar ni
borrar una fila: no hay código que lo haga y la base no se lo permite (§3).

## 10. Proveedor de IA y opción B

```ts
interface ProveedorIA {
  id: string;
  turno(p: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[]; maxTokens: number; corte: AbortSignal }):
    Promise<{ ok: true; texto: string; llamadas: Llamada[]; uso: { entrada: number; salida: number }; corte: string }
          | { ok: false; motivo: "caida" | "saturada" | "clave" | "rechazo" | "tiempo" }>;
}
```

| Ruta | Adaptador | Cuándo |
|---|---|---|
| 1 | `proveedor-claude`: API de mensajes con herramientas | Con clave paga cargada (decisión del dueño, `05` D1 y D4-bis) |
| 2 · opción B | El mismo contrato por otra nube, o `proveedor-esquema` contra otro modelo | Si la ruta 1 falla dos veces seguidas o está apagada |
| 3 | `respaldo-core`: plantillas con los números del sistema + derivación | Sin IA, caída, o gasto agotado |
| Pruebas | Proveedor de guion (respuestas fijas por caso) | Tests y CI. **No permite conversar libremente**: sirve para el guion de `02` §6, no para que el dueño pregunte lo que quiera (`05` D4-bis) |

- **El proveedor se llama siempre fuera de transacción** (§4.1) y con corte por tiempo (60 s, provisional). El proveedor
  de guion de los tests falla si lo llaman con una transacción abierta: así el error se ve en CI.
- **Clave propia del equipo.** El motor lee su clave paga de una variable propia (nombre a definir por el constructor,
  distinta de `ANTHROPIC_API_KEY`). Motivo, verificado: si se carga `ANTHROPIC_API_KEY` en el despliegue, los 7 agentes
  actuales pasan solos del cupo gratis a Claude (`ia.server.ts:40` y `:85`) y esos no tienen tope de gasto. Las
  variables son del despliegue, no del negocio: cargarlas afecta a todos los negocios que usen ese despliegue.
- **Ninguna suscripción personal es motor del producto** (decisión del dueño, 14/11): ni la de Claude ni la de Codex.
  El producto usa el cupo gratis con datos de demostración o una clave de API con tope (`05`, D4-bis).
- `proveedor-esquema` sirve para el servicio gratis que hoy usa MIA, que acepta respuesta por esquema pero no está
  probado con herramientas (`ia-gratis-core.ts:12-18`): el modelo devuelve `{ decir, llamar: { nombre, argumentos } | null }`.
- El motor **no** usa agentes administrados, conectores ni memoria del proveedor (condición de las decisiones, §3 y §5).
- La forma exacta del pedido con herramientas, los campos de consumo y los nombres de modelo **no se toman de
  memoria**: el constructor los lee en la documentación oficial (skill `claude-api`) y los cita en el PR. Lo que hay
  hoy en `ia.server.ts:22-26` y `:102-109` es el punto de partida, no la referencia.
- Modelo: parámetro por puesto. Se elige con la evaluación de 30 casos (norma del ERP: dentro de los productos, modelo
  chico elegido con evaluación). CI corre la ruta 2 y la 3 con el proveedor de guion: la opción B queda probada sin gastar.

## 11. Límite de gasto

- Tope mensual por negocio en micro-dólares: constante por defecto en el código (provisional, `05` D2) y, más
  adelante, valor por negocio que sólo cambia la consola del operador.
- **Reservar** (una transacción corta, antes de cada llamada; una vuelta de 6 pasos reserva 6 veces):
  1. `INSERT INTO "AgenteGasto" … ON CONFLICT ("tenantId","periodo") DO NOTHING`. Sin esto, la primera llamada de cada
     mes no encontraba fila, el `UPDATE` tocaba cero y el equipo quedaba «sin saldo» todo el mes.
  2. Un solo `UPDATE` condicional. Si la última reserva venció (`reservaVenceEl < :ahora`), lo reservado que quedó
     colgado **se pasa a gastado** (se cobra el peor caso) y la reserva arranca de cero; después suma `:estimado` y
     pone `reservaVenceEl = :ahora + 120 s`. Condición: `microUsd + reservado + :estimado <= :tope` (con lo vencido ya
     contado como gasto). Cero filas = no alcanza → ruta 3.
- **Cerrar** (al volver la llamada): si todavía no pasó el vencimiento de esa reserva, suma lo real a `microUsd` y resta
  `:estimado` de `reservado`. Si ya venció, no hace nada: esa reserva se cobra por lo estimado en la próxima reserva.
- **Si la función se corta** la reserva no queda trabada para siempre: vence sola a los 120 s (más que el corte de 60 s
  de la llamada) y se cuenta como gastada. El error va siempre para el lado de frenar, nunca de gastar de más. Límite
  conocido: con pedidos seguidos sin una pausa de 120 s, una reserva colgada tarda en liberarse; frena de más, no de menos.
- **`:estimado` incluye la entrada:** precio de entrada × tokens de entrada estimados (instrucciones + mensajes +
  definición de herramientas; conteo conservador por caracteres, provisional) + precio de salida × máximo de tokens de
  la respuesta. Cada cierre compara estimado contra real; si lo real supera lo estimado, se registra y se sube el
  coeficiente (se calibra en la tanda 5 con el conteo oficial).
- Precio por modelo en una tabla del código, **leída de la página oficial de precios y citada con fecha** (no de memoria).
- Además: 6 pasos por vuelta, tope de tokens por respuesta, 60 mensajes por persona por día (cupo en `AgenteContador`),
  24 mensajes por charla (igual que hoy, `diseno-core.ts:359`). Aviso interno a Dirección al 80 % del tope.

## 12. Interruptor por negocio y pausa

- Nuevo interruptor `equipo-agentes` en el catálogo (`interruptores.ts:66`): apagado de fábrica; sólo lo escribe la
  consola del operador (`interruptores.ts:15-20`); `cambiaLasApps: true`. Si la lectura falla, apagado.
- En pedidos del panel se lee con `interruptoresDelNegocio` (`interruptores.server.ts:56-59`); en el barrido, por
  negocio, con el patrón de `contabilidadPrendidaEn`.
- **En el ambiente de MIA lo prende GSG desde la consola del operador**, sólo para ese negocio (§15). Es el camino
  de siempre y no necesita código nuevo.
- **La siembra de la demo de desarrollo no puede escribir el interruptor desde `scripts/`.** El trinquete
  (`interruptores-escritura.test.ts:85-116`) recorre `src/` y `scripts/` y falla con cualquier archivo que escriba la
  entidad fuera de su lista (`:30-51`). Se prende en `prisma/seed-mia-producciones.ts:63-64`, donde la demo ya prende
  `inicio-por-apps` con el mismo renglón; ese archivo sólo corre contra una base local (`:29`). No se toca la lista del
  trinquete. Además: el archivo que lee el interruptor (`estado.server.ts`) no llama a `audit`/`auditAdmin`, porque el
  detector marca un archivo que nombra la entidad y además escribe auditoría (`:80-83`).
- Pausa por puesto y «Pausar todo»: `AgentePuesto.estado`, acción de servidor con `exigirEditar("agentes")` y auditoría.
- Freno de emergencia de GSG sin deploy: apagar el interruptor desde la consola.
- **Condición para salir en vivo con datos reales** (se suma a `05` D5 y D13): los 30 casos corridos **contra el
  modelo real** elegido, con los 12 casos trampa y los 4 de memoria pasando, y el resultado guardado en
  `docs/tenants/mia-producciones/agentes/` con modelo, fecha y n/n. Con el proveedor de guion solo no alcanza: el guion
  prueba el código, no al modelo. Prenderlo para la **prueba** del dueño y de Mariana, sin datos reales, no exige esto;
  cargar el primer dato real, sí. El texto `alPrender` del interruptor se lo recuerda al operador.

## 13. Seguridad

- **Aislamiento por negocio:** `tenantId` sale de la sesión o del barrido, jamás del modelo. Toda consulta lo lleva
  escrito además de RLS. Test con dos negocios sobre Postgres con el rol sin bypass (como
  `avisos-programados-postgres.test.ts`): un identificador ajeno devuelve «no existe» **y lo propio aparece** (§4.1).
- **Inyección de instrucciones hacia adentro:** todo dato cargado por personas viaja escapado dentro de `<datos>`
  (`escaparDatos`, `diseno-core.ts:377`), incluidos resultados de herramientas, notas del cuaderno e historial. Las
  instrucciones repiten la regla de `ia.server.ts:220`. Pero la defensa real es estructural: aunque el modelo
  obedezca un texto malicioso, sólo puede pedir herramientas de su puesto, con argumentos validados, sin ningún camino
  de escritura (§6.1), y nada irreversible corre sin una persona.
- **Inyección hacia afuera (clientes de MIA):** el recordatorio **no lo redacta el modelo**. Sale de la plantilla de
  `02` §3 (`plantillas-core.ts`) con contacto, negocio, concepto, evento, importe y fecha **puestos por el código**
  desde la base. El modelo sólo elige la variante (primer aviso, segundo aviso, por vencer) y puede sumar **una** frase
  libre de hasta 200 caracteres. `texto-seguro-core.ts` revisa esa frase y también los campos cargados por personas que
  la plantilla inserta (concepto, evento, contacto): bloquea enlaces (`http`, `www`, dominios), secuencias de 22 dígitos
  aunque vengan separadas por espacios, puntos o guiones (CBU o CVU), las palabras «alias», «CBU» y «CVU» y textos con
  forma de alias, mails y teléfonos. Frase bloqueada → se descarta y sale la plantilla sola. Campo bloqueado → no se
  arma la propuesta y se deriva («el concepto de la cuota trae un dato que no puedo mandar»). El mismo filtro corre
  sobre toda respuesta del modelo en la charla (los enlaces internos los pone el código, no el modelo). Antecedente:
  `revisarRespuesta` (`consulta-core.ts:156-174`), que ya frena links y contactos.
- **Control de cifras y de atribución:** `cifras-core` extrae importes, fechas y porcentajes de la prosa y exige (1)
  que cada uno figure en las `filas` leídas en esa vuelta o en el mensaje de la persona, y (2) que **no quede atribuido
  a otra entidad**: si en la misma oración aparece la etiqueta de una entidad leída (cliente, evento, proveedor), el
  importe tiene que ser de una fila de esa entidad. «Farma debe $ 500.000» se frena si los $ 500.000 son de otro
  cliente. Si no pasa, se reintenta una vez y, si persiste, se responde sólo con los renglones armados por el código y
  se registra. Corre también sobre la introducción del parte y la frase libre de las propuestas.
- **Datos que no salen:** las herramientas no devuelven CBU, CUIT, mails ni teléfonos al modelo en esta versión; los
  botones de WhatsApp y mail los resuelve el panel con el dato de la base después de aprobar.
- **Proveedor gratis:** sólo datos de demostración (`docs/tenants/mia-producciones/README.md`, «IA gratis hasta la
  venta»). Con datos reales, sólo un proveedor pago con términos leídos y consentimiento de MIA (`05` D1 y D5).
- **Acciones de servidor:** cada una vuelve a pedir actor, módulo e interruptor. Esconder el botón no protege
  (`gestion.server.ts:55`).
- **Secretos:** claves sólo en variables del servidor; nunca en el registro ni en los mensajes de error que ve la persona.

## 14. Pruebas

Deterministas: reloj inyectado, proveedor de guion, `TZ` fija, sin red.

| Qué | Tipo | Archivo |
|---|---|---|
| Niveles, techos, decisión por clase | Puro | `permisos-core.test.ts` |
| Control de cifras: acepta lo leído, frena lo inventado y lo atribuido a otra entidad | Puro | `cifras-core.test.ts` |
| Filtro de texto: enlace, 22 dígitos con y sin separadores, alias, mail, teléfono; deja pasar un importe normal | Puro | `texto-seguro-core.test.ts` |
| Recordatorio: los datos salen de la base aunque el modelo proponga otros | Puro | `plantillas-core.test.ts` |
| Gasto: costo con entrada y salida, redondeo en enteros, estimado ≥ real en los casos de guion | Puro | `gasto-core.test.ts` |
| Agenda: hoy, atrasados, no repetir, «parece una promesa» | Puro | `agenda-core.test.ts` |
| Vuelta del agente con guion: 6 pasos, herramienta inválida, sin IA, **el proveedor nunca se llama dentro de una transacción**, `leer` dentro de una transacción lanza | Unidad | `motor.test.ts` |
| `ctx.db` no escribe ni sale del negocio | Unidad | `solo-lectura.test.ts` |
| Lista blanca de imports y de escrituras | Estático | `guardia-escrituras.test.ts` |
| Los 30 casos (10 normales, 12 trampa, 4 de memoria, 4 de falla) | Guion | `casos-administracion.test.ts` |
| Dos negocios, **rol sin bypass**: A ve lo propio (más de cero) y nada de B, en conversación, barrido, huella y ejecución; identificador ajeno → «no existe»; clave compuesta impide colgar de otro negocio; `UPDATE` y `DELETE` sobre `AgenteAccion` rechazados | Postgres | `agentes-aislamiento-postgres.test.ts` |
| Rol que no ve todos los proyectos ni todas las columnas: no los recibe, y los totales se recalculan | Postgres | `agentes-permisos-postgres.test.ts` |
| Doble aprobación: una ejecución · dos «crear» a la vez: una propuesta · rehacer tras rechazo · FALLIDA no pisa una decisión ganadora · cuota cobrada en el medio → VENCIDA | Postgres, carrera | `propuestas-carrera-postgres.test.ts` |
| Cupos: N a la vez no pasan el tope; mismo compromiso dos veces → uno; dos barridos a la vez → un parte y un aviso | Postgres, carrera | `topes-carrera-postgres.test.ts` |
| Gasto: primera llamada del mes sin fila; N a la vez no pasan el tope; función cortada → la reserva vence y se cobra | Postgres, carrera | `gasto-carrera-postgres.test.ts` |
| Conciliación (tanda 4): dos movimientos a la misma cuota a la vez → uno gana; no regresión de la manual | Postgres, carrera | `conciliacion-carrera-postgres.test.ts` |
| Sin tablas: panel, acciones y barrido no rompen | Unidad | `estado-sin-migracion.test.ts` |
| Mismo número que Administración | Postgres | `cobranzas-mismo-numero-postgres.test.ts` |
| Los 30 casos contra el modelo real (no corre en CI; condición para prender, §12) | Manual, con gasto | comando de la tanda 5 |

Los tests de carrera se escriben **antes** de la certificación (norma de solidez de CI, punto 6).

## 15. Dónde se prueba: sobre lo real, en el ambiente de MIA

**Decisión del dueño (14/11/2026):** no hay vista previa en Vercel ni demostración levantada por una sesión. Se
construye el producto real y se prueba en el ambiente de MIA, que el dueño describe como un QA todavía sin datos
reales. **Orden:** primero prueba el dueño; después Mariana prueba el equipo de Administración. (El equipo de
Dirección, cuando exista, lo prueba Dirección.)

Qué implica técnicamente, punto por punto:

| # | Qué hace falta | De quién es |
|---|---|---|
| 1 | **El código publicado** en el despliegue que atiende al negocio de MIA. Entra por PR y CI, en una tanda de 6 o más PR con un solo push a `main` (regla vigente). Llega a todos los negocios de ese despliegue, apagado | Orquestadora, con las reglas de publicación |
| 2 | **La migración aplicada en la base donde vive ese negocio** (10 tablas nuevas y un `REVOKE` sobre una de ellas; no toca tablas existentes). Es **Gate 2: se eleva al dueño PR por PR**, con respaldo previo. Ojo: si el despliegue tiene `MIGRATE_DATABASE_URL`, el propio build de producción la aplica (`scripts/vercel-build.mjs:59-66`): publicar ese PR **es** aplicar la migración | Dueño |
| 3 | **El interruptor `equipo-agentes` prendido sólo para el negocio de MIA**, desde la consola del operador (§12). Los demás negocios no ven nada | GSG (operador) |
| 4 | **Usuarios:** el dueño con rol Dirección y Mariana con su rol (`05`, S1), con verificación en dos pasos, que es obligatoria para esos roles en una productora (`README.md` de MIA) | GSG, por el alta de siempre |
| 5 | **Datos para probar, inventados y cargados a mano en el negocio de MIA** (clientes, eventos, cuotas vencidas y por vencer). La siembra de la demo no sirve: se niega a correr fuera de una base local (`prisma/seed-mia-producciones.ts:29`) | Quien prueba, o un rol de GSG con orden del dueño |
| 6 | **Un «cerebro»** configurado en ese despliegue: decisión abierta del dueño (`05`, D4-bis). Con el proveedor de guion no se puede conversar libremente | Dueño |

**Provisional a confirmar — dónde vive hoy el ambiente de MIA.** Lo único que dice el repositorio:
`docs/tenants/mia-producciones/README.md:95` anota «Alta hecha el 02/11/2026 por comando … `--produccion`», y ese
comando con `--produccion` usa la conexión principal (`scripts/soporte/alta-negocio.mts:6` y `:37`). Eso indica que el
negocio `mia-producciones` está dado de alta **en la base de producción compartida**, atendido por el despliegue de
producción. **No se verificó contra Neon ni contra Vercel**, y el `CLAUDE.md` de Factory-GSG no lo nombra entre los
negocios provisionados. Hasta confirmarlo, el diseño asume ese caso, que es el más exigente:
- «Ambiente de MIA» sería entonces un **negocio sin datos reales dentro de la base de producción**, no una base aparte.
  La migración del punto 2 se aplica a la base que comparten todos los negocios (es aditiva y el resto no la usa).
- Las variables del punto 6 son del despliegue, no del negocio (§10): por eso el motor usa una clave propia.
- Si resulta ser otra base u otro despliegue, cambian los puntos 1, 2 y 6, no el diseño.

**Lo que no cambia:**
- Con el cupo gratis sólo se usan datos de demostración. **No se cargan datos reales antes de salir en vivo**, aunque el
  consentimiento de MIA ya esté dado (`05`, D5). El primer dato real exige la condición de §12 y un proveedor pago.
- Lo que la prueba deja en las tablas del equipo (charlas, propuestas, compromisos) se cancela desde el panel antes de
  salir en vivo. El registro no se borra (§3 y §9): el informe mensual cuenta desde la fecha de salida en vivo.
- **La demostración en memoria queda como herramienta de quien construye**, para su QA clic por clic
  (`node scripts/proyectos/demo-local.mjs --start`, `demo-local.mjs:5-11`, puerto 3218), con el interruptor prendido en
  su siembra (§12). No es el ambiente de prueba del dueño. Prueba el producto, **no el aislamiento**: ahí toda conexión
  es superusuario; el aislamiento lo prueban los tests de Postgres con el rol sin bypass (§14).

## 16. Riesgos técnicos anotados

1. `ProyectoCuota.monto` es `Float` (`prisma/schema.prisma:3852`); el pase a centavos está en construcción en otro PR
   (tablero MIA, M12). Las herramientas usan `redondear` y las lecturas existentes; al entrar ese PR, se revisa.
2. Hay dos defectos de plata abiertos en cobranza (tablero MIA, M3). El equipo lee con las mismas funciones: hereda
   el defecto y también el arreglo. No se prende con datos reales antes de que cierren.
3. La tarea diaria corre una vez: no hay seguimiento intradía.
4. El comentario de `acciones-diseno.ts:478-480` dice que Administración «ve pero no edita la IA»; el código dice que
   no la ve (`gestion-core.ts:648`). No bloquea (módulo nuevo), pero conviene corregir el comentario.
5. El control de atribución compara contra las etiquetas de las entidades **leídas en esa vuelta**. Un nombre que el
   modelo invente y que no esté entre ellas no se detecta por esta vía; lo cubre que los renglones los arma el código y
   los casos trampa T1 y T2 contra el modelo real.
6. El formato exacto de un alias bancario no se leyó en la fuente oficial: el filtro frena por palabra y por forma, y
   puede frenar de más. Se ajusta con la medición (`05`, S16).
7. Declarar `maxDuration` cambia la configuración de una ruta que ya corre en producción (los recordatorios de turnos).
   Es reversible y entra por PR; el máximo que permite el plan no está leído en la fuente (`05`, S15).
8. Probar sobre lo real quiere decir que el código y la migración llegan a la base y al despliegue de producción antes
   de que el dueño lo vea andar (§15). Lo que lo acota: interruptor apagado de fábrica, migración sólo aditiva, código
   que tolera la falta de tablas, y CI sin rojos nuevos antes de publicar.
9. Defensa de base que queda para después: un rol de base de sólo lectura para la fase 1. Es un cambio de permisos en
   Neon (decisión del dueño); hoy la lectura sola se garantiza en el código (§6.1).
