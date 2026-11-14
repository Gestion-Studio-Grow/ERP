# Equipo de agentes de Administración · MIA — 03 · Especificación técnica

> Diseño del 14/11/2026, **corregido dos veces ese día**: tras la revisión adversarial (`05`, sección F) y tras la
> verificación del diseño corregido, con los hechos y decisiones nuevas del dueño (`05`, sección G). **Ajuste final esa
> noche** (`05`, sección H): segunda verificación y la bandeja de GSG para el texto libre (§4.4). Nada construido ni
> aplicado. Las migraciones se **escriben sin aplicar** (Gate 2) y el código tolera su ausencia. Sin dependencias nuevas.

## 1. Principios que mandan sobre el resto

1. Los límites viven en el código. Las instrucciones del modelo sólo describen el trabajo.
2. El modelo nunca recibe ni devuelve `tenantId`, importes para ejecutar ni permisos: sólo identificadores que el
   código valida contra el negocio.
3. Un solo motor para todos los negocios (`src/lib/agentes/`); lo propio de cada rubro son las herramientas.
4. Todo es apagable: interruptor por negocio (lo prende GSG), pausa por puesto (la maneja el cliente). **Y se vuelve a
   mirar antes de cada paso que gasta y dentro de cada transacción que escribe** (§12.1).
5. Memoria y registro en tablas propias con RLS: no dependen del proveedor de IA.
6. **Leer, pensar y escribir van separados** (§4.1). Nunca se llama al modelo con una transacción abierta y nunca se
   lee con el cliente global dentro de una.
7. **Lo que no puede fallar no depende del modelo:** el origen de cada renglón, a quién pertenece cada importe, los
   compromisos y todo texto que sale hacia un tercero los arma o los controla el código (§4.2, §8.1, §13).
8. **El equipo sirve sin modelo.** El parte, las consultas de Cobranzas, el registro, la pausa y los permisos los
   calcula el código (§10.1). No hay conversación en vivo: hay un **buzón de pedidos** con plazo de respuesta (§4.3).
   Responder con IA los pedidos de texto libre es un agregado que se prende por negocio y sólo con una clave de API
   propia (§10). Mientras un negocio no la tenga, el texto libre lo contesta **una persona de GSG** desde una bandeja
   de la consola del operador (§4.4); ningún proceso contesta por ella. El diseño no depende de Cloudflare ni del
   acceso de un plan de Claude.

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
  respaldo-core.ts        puro   textos por plantilla cuando no hay IA (tanda 3; lo «sin modelo» de la tanda 1 es del motor, §10.1)
  proveedor.ts            puro   interfaz ProveedorIA + proveedor de guion (SÓLO tests y demo local; nunca en producción)
  proveedor-claude.server.ts     adaptador a la API de mensajes con herramientas, con clave propia del equipo (§10)
  buzon-core.ts           puro   estados del pedido, plazo, presupuesto de un intento y métricas del servicio
  buzon.server.ts                alta, toma, cierre, rescate y vencimiento de pedidos (§4.3)
  bandeja.server.ts              lo que hace una persona de GSG sobre un pedido en bandeja: listar, abrir, responder (§4.4)
  motor.server.ts                procesa un pedido (de la lista, sin modelo; de texto libre, hasta 6 pasos); único que llama al proveedor
  lectura.server.ts              `ctx.db`: acceso de SÓLO LECTURA al negocio, sobre el cliente con RLS (§6.1)
  contadores.server.ts           cupos de los topes con `updateMany` condicional (§6)
  memoria.server.ts              historial, compromisos, cuaderno, búsqueda (lecturas y escrituras)
  propuestas.server.ts           crear, decidir y ejecutar propuestas (transacción y huella)
  registro.server.ts             una fila por acción; nunca se edita ni se borra
  gasto.server.ts                una reserva por llamada: reservar, cerrar y cobrar las vencidas (§11)
  estado.server.ts               interruptores, pausa, vigencia sin caché (§12.1), ¿están las tablas?, ¿hay IA para este negocio?
  barrido.server.ts              lo que corre la tarea diaria, negocio por negocio, en tres pasos (§8)
  puestos/administracion.ts      catálogo: los 5 puestos, sus tareas, niveles iniciales, techos y topes
src/lib/proyectos/agentes/            ← herramientas de MIA (rubro productora)
  actor-agente.server.ts         arma el actor del agente y la vista de la persona (ver §5)
  herramientas-cobranzas.server.ts · -pagos · -bancos · -coordinacion · -comprobantes
  acciones-equipo.ts      "use server": dejar pedido, mi buzón, decidir propuesta, confirmar compromiso, agenda, cuaderno, pausar
src/app/admin/(dashboard)/proyectos/mi-equipo/   page.tsx + _hoy · _buzon · _aprobar · _agenda · _cuaderno · _registro · _ajustes
src/app/operador/(console)/bandeja/   ← consola del operador de GSG (§4.4)
  page.tsx · actions.ts ("use server") · bandeja-consola.server.ts (recorre los negocios) · ResponderPedido.tsx
```

Se tocan (poco) archivos existentes: `gestion-core.ts:616-631` (módulo nuevo `agentes`), `:645-651` (permiso de
fábrica: Administración `E`, el resto `N`), `:675-684` y `:704-712` (app `gestion-mi-equipo` en la barra de
Dirección y Administración); `src/apps/catalogo/comercial.ts` (alta de la app junto a `gestion-agentes`, `:302`);
`src/apps/espacios.ts:59`, `:204` y `:213` y `src/apps/visibles.ts:539` (las listas que nombran una por una las apps
de gestión: sin sumar `gestion-mi-equipo` ahí, la app no entra a su espacio ni a la barra);
`src/app/admin/(dashboard)/proyectos/equipo/page.tsx:126` (la tabla de permisos recorre `MODULOS`: la fila del módulo
`agentes` se muestra sólo con `equipo-agentes` prendido); `src/cambios/interruptores.ts` (dos interruptores al final del
catálogo, que empieza en `:66` y cierra en `:213`, §12); `src/app/operador/(console)/CabeceraConsola.tsx:51` (la ruta
de la bandeja entra a la sección «Pedidos», §4.4);
`src/app/admin/(dashboard)/layout.tsx:276-277` (la app entra a la barra sólo con el interruptor prendido, §12);
`src/app/api/cron/reminders/route.ts:31-37` (sumar el barrido, mismo patrón, **y declarar `maxDuration`**, §8, tanda
3); `prisma/seed-mia-producciones.ts:63-64` (prender el interruptor en la demo local, §12);
`prisma/rls/0002_app_role.sql` (un bloque antes de su `COMMIT`, §3). `ia.server.ts` **no se modifica**: el motor nuevo usa su
propio adaptador y los 7 agentes actuales siguen igual. No se construye ningún adaptador para el servicio sin cargo de
Cloudflare ni un segundo proveedor: la opción B queda como interfaz (§10).

**Más de un equipo en el mismo negocio (decisión del dueño, 14/11).** El equipo de Ale es el de **Dirección de MIA**,
en el mismo negocio que el de Administración; y después viene un equipo para la propia GSG, en su negocio (`05`,
sección D). Los dos entran como **otro archivo en `puestos/`** y sus herramientas; el motor, las tablas y el panel no
cambian. Para que eso sea cierto, el motor no puede asumir «un equipo por negocio» ni «rol Administración»:
- Cada archivo de `puestos/` declara un **equipo**: su identificador, el rol base de sus agentes, los módulos que hay
  que tener para verlo y sus puestos. Los identificadores de puesto llevan el equipo adelante
  (`administracion.cobranzas`, `direccion.…`), así no chocan en las tablas, que guardan `puesto` como texto.
- **Qué equipo ve cada persona lo decide el código:** toda lectura de pedidos, propuestas, agenda, cuaderno,
  partes y registro filtra por los puestos de los equipos visibles para esa persona. Administración no ve el equipo de
  Dirección ni su registro; Dirección ve los dos.
- El panel recibe la lista de equipos visibles por parámetro; el parte es uno por equipo y por día (§3).
- El tope de gasto es del negocio: lo comparten sus equipos (§11).

## 3. Modelo de datos (una migración aditiva, sin aplicar)

Nombre propuesto: `prisma/migrations/20261115120000_agentes_base/` (**verificar colisión de timestamp** contra las
ramas abiertas antes de escribirla; la última en este árbol es `20261110170000_tenant_cuit_verificado`). Sólo
`CREATE TABLE`, índices, claves foráneas, políticas y un `REVOKE` sobre una tabla nueva: no toca tablas existentes, no
agrega columnas a ninguna, no usa enums (texto validado en código, como `SupportTicket`). Plata en centavos enteros o
micro-dólares enteros, nunca `Float`. Son **11 tablas**. Eran 10 en el primer diseño: salieron las dos del historial
palabra por palabra (`AgenteConversacion` y `AgenteMensaje`) y entraron tres: el buzón (`AgentePedido`), las reservas de
gasto (`AgenteReserva`) y los ajustes por negocio (`AgenteAjuste`). **La bandeja de GSG (§4.4) no suma ninguna tabla:**
usa un estado más de `AgentePedido` (`EN_BANDEJA`, texto), una columna nueva (`respondidoPor`) y dos valores más en el
registro. Van todas en esta única migración, aunque algunas se usen recién en tandas siguientes: así hay un solo
Gate 2.

| Tabla | Campos principales | Notas |
|---|---|---|
| `AgentePuesto` | `tenantId`, `puesto` (texto del catálogo), `estado` ACTIVO·PAUSADO, `pausadoPor`, `pausadoEl`, `niveles` Json, `updatedAt` · único (`tenantId`,`puesto`) | Sin fila = activo con niveles iniciales. `niveles` nunca supera el techo del código |
| `AgentePedido` | `id`, `tenantId`, `puesto`, `userId`, `tipo` LISTA·LIBRE, `frecuente` (id del catálogo, si es de la lista), `argumentos` Json, `texto` (≤ 1000), `clave`, `estado` RECIBIDO·EN_CURSO·RESPONDIDO·NECESITA_PERSONA·SIN_RESPONDER·EN_BANDEJA, `pedidoEl`, `venceEl` (siempre: todo pedido tiene plazo), `tomadoHasta`, `intentos`, `respondidoEl`, `respuesta`, `filas` Json (renglones con su origen, armados por código), `motivo`, `conModelo`, `respondidoPor` (falta, salvo cuando contesta una persona de GSG: `operator:<nombre>`, §4.4) · único (`tenantId`,`id`) · **único** (`tenantId`,`userId`,`clave`) · índices (`tenantId`,`estado`,`venceEl`) y (`tenantId`,`userId`,`pedidoEl`) | El buzón (§4.3) y la memoria 1: reemplaza a las dos tablas de historial del primer diseño y al historial que hoy vive en el navegador (`diseno-core.ts:362`). `clave` es la del envío: un doble envío devuelve el mismo pedido |
| `AgenteCompromiso` | `id`, `tenantId`, `puesto`, `texto`, `fecha` (día), `entidad`, `entidadId`, `clave`, `estado` ABIERTO·CUMPLIDO·ROTO·CANCELADO, `creadoPor` (siempre una persona o `sistema`), `revisadoEl`, `cerradoEl` · índice (`tenantId`,`estado`,`fecha`) · **único parcial** (`tenantId`,`puesto`,`clave`) `WHERE estado='ABIERTO'` | Memoria 2. `clave` = `entidad:entidadId:fecha`; sin entidad, hash del texto normalizado + fecha. Dos toques o dos corridas no abren dos iguales |
| `AgenteNota` | `id`, `tenantId`, `puesto`, `texto` (≤ 500), `activa`, `autor`, `createdAt`, `updatedAt` | Memoria 3. Hasta 40 activas por puesto |
| `AgentePropuesta` | `id`, `tenantId`, `puesto`, `tarea`, `herramienta`, `entidad`, `entidadId`, `argumentos` Json, `resumen` Json (datos del sistema para la tarjeta), `texto`, `huella`, `estado` PENDIENTE·EJECUTADA·RECHAZADA·VENCIDA·FALLIDA, `venceEl`, `decididaPor`, `decididaEl`, `resultado` Json · único (`tenantId`,`id`) · **único parcial** (`tenantId`,`herramienta`,`entidad`,`entidadId`) `WHERE estado='PENDIENTE'` | Una sola abierta por herramienta y entidad, sin importar el día; rechazada o vencida, se puede rehacer en el momento |
| `AgenteParte` | `id`, `tenantId`, `equipo`, `dia`, `numeros` Json (los calcula el código), `intro` (texto de la IA, puede faltar), `createdAt` · **único** (`tenantId`,`equipo`,`dia`) | El parte **automático** de la mañana (tanda 3): uno por día, por equipo y por negocio, garantizado por la base. El parte «a pedido» es un pedido de la lista (§4.3), con cupo de 10 por día **por persona** (`sujeto = userId`; provisional, `05` S5). Eran 3 por puesto: una sola prueba los gastaba. No llama al modelo, así que el tope sólo frena el abuso; un doble toque no gasta cupo (misma `clave`) |
| `AgenteContador` | `tenantId`, `puesto`, `tope`, `sujeto` (`*` si el cupo es del puesto; el `userId` si es por persona), `periodo` (día `AAAA-MM-DD` en hora de Argentina, o `abiertos`), `n` · PK (`tenantId`,`puesto`,`tope`,`sujeto`,`periodo`) | Cupos de los topes (§6). Con `sujeto`, el tope de 60 pedidos por día es de cada persona y no del puesto |
| `AgenteAccion` | `id`, `tenantId`, `puesto`, `tipo` LECTURA·RESPUESTA·VENCIDO·PROPUESTA·DECISION·EJECUCION·DERIVACION·TOPE·RECHAZO·ERROR·PAUSA·LECTURA_GSG·RESPUESTA_GSG, `herramienta`, `detalle` Json (sin datos sensibles), `nivel`, `actor` (`agente:<puesto>`, usuario del negocio u `operator:<nombre>` para una persona de GSG, §4.4), `pedidoId`, `propuestaId`, `proveedor`, `modelo`, `tokensEntrada`, `tokensSalida`, `microUsd`, `ms`, `createdAt` · índice (`tenantId`,`createdAt`) · FK (`tenantId`,`pedidoId`) y (`tenantId`,`propuestaId`) | Registro. Sólo `INSERT`, **también en la base** (abajo) |
| `AgenteGasto` | `tenantId`, `periodo` (AAAA-MM), `gastado`, `comprometido` (gastado más reservas abiertas), `llamadas` · PK (`tenantId`,`periodo`) | Contador del tope de gasto, en micro-dólares enteros (§11) |
| `AgenteReserva` | `id`, `tenantId`, `periodo`, `estimado`, `venceEl`, `estado` ABIERTA·CERRADA·VENCIDA, `real`, `createdAt` · índice (`tenantId`,`estado`,`venceEl`) | **Una fila por llamada al modelo**, con su propio vencimiento: cada reserva vence sola y se cierra sola (§11) |
| `AgenteAjuste` | `tenantId` (PK), `objetivoSeg` (180 si falta), `topeMicroUsd` (puede faltar: rige el del código), `updatedAt`, `updatedPor` | Ajustes por negocio: el objetivo de respuesta del buzón y el tope de gasto. Sin fila, valen los del código. En la tanda 1 sólo se lee; cambiarlos desde la consola es de la tanda 5 |

**Aislamiento escrito en la base, no sólo en RLS** (patrón completo de
`prisma/migrations/20261106120000_support_ticket/migration.sql`, no sólo sus políticas):
- Cada tabla lleva `tenantId`, su clave foránea a `Tenant` y la política `tenant_isolation` (`:54-58`).
- Las tablas que son destino de otra llevan índice único (`tenantId`,`id`) (`:29-31`) y las hijas apuntan con **clave
  foránea compuesta** (`tenantId`,`…Id`) (`:51`): una fila del registro no puede colgar de un pedido de otro negocio aunque
  falle el código. Las compuestas van con `ON DELETE RESTRICT` (pedidos y propuestas no se borran).
- Los índices únicos parciales se escriben en SQL a mano (precedente:
  `prisma/migrations/20261104122000_contabilidad_ola1/migration.sql:191`); el constructor mira cómo quedó declarado ese
  precedente en `schema.prisma` y hace lo mismo.
- **Registro sin edición ni borrado, en la base:** el rol de la app recibe `UPDATE` y `DELETE` sobre toda tabla nueva por
  privilegios por defecto (`prisma/rls/0002_app_role.sql:63-64`). La migración se los quita a `AgenteAccion`:
  `REVOKE UPDATE, DELETE ON "AgenteAccion" FROM app_rls`, dentro de un `DO` que primero comprueba que el rol exista (en
  la base en memoria de la demo no existe). Como `0002_app_role.sql:58` los volvería a dar si alguien lo corre de
  nuevo, el mismo PR repite el `REVOKE` en ese archivo, **dentro de su transacción: después de los permisos por
  defecto (`:63-66`) y antes del `COMMIT` (`:68`)**, en un `DO` que primero comprueba que la tabla exista
  (`to_regclass('public."AgenteAccion"') IS NOT NULL`): ese archivo también corre en bases que todavía no tienen la
  migración, y un `REVOKE` suelto después del `COMMIT` quedaría fuera de la transacción y fallaría sin la tabla. Lo
  comprueba un test (§14), que además corre el archivo dos veces y sin la tabla.
- **Chocar con un único no se resuelve atrapando el error.** Dentro de una transacción de Postgres, una sentencia que
  falla deja la transacción abortada (lo recuerda `src/lib/contabilidad/modulo.server.ts:9-10`). Toda alta que puede
  chocar con un único (pedido, parte, compromiso, propuesta, fila del mes, contador) se hace con
  `createMany({ skipDuplicates: true })` y se mira `count`: 0 quiere decir «ya existía». Que eso cubra también los
  únicos parciales escritos a mano lo confirma el test de carrera (`05`, S20).

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
| **3 · ESCRIBIR** | `tenantTransaction` corta, **sin** `timeoutMs`: rige el tope de 5 s (`rls.ts:172-174`) | Sólo `tx` | Primero la vigencia (§12.1); después tablas `Agente*`, cupos, `huella` y `ejecutar` |

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
  **lo propio (más de cero)** y nada de B, en el buzón, en el barrido, en `huella` y en `ejecutar`. La demo en
  memoria no sirve para esto: ahí toda conexión es superusuario (`avisos-programados-postgres.test.ts:4-5`).

### 4.2 Quién escribe qué en una respuesta

- El modelo escribe la **prosa**. Donde quiere mostrar renglones pone una marca (`[[filas:<id del resultado>]]`) y el
  código la reemplaza por la lista armada desde `filas`, cada renglón con su origen. El modelo no escribe orígenes: una
  línea «Fuente:» escrita por él se descarta.
- Toda cifra que quede en la prosa pasa el control de cifras y de **atribución** (§13). El mismo control corre sobre
  la introducción del parte y sobre lo que el modelo agregue a una propuesta.
- Los textos de confirmación («Anotado», «Dejé listo un recordatorio», «Listo para enviar») los emite el código después
  de que la escritura ocurrió; el modelo no puede afirmar que hizo algo.

### 4.3 El buzón: de un pedido a su respuesta (doble envío, plazo, pausa y gasto)

**Decisión del dueño (14/11):** «No vamos a hacer la conversación en vivo, pero vamos a hacer un buzón de mensajes para
la gente. Con pedidos y con respuestas menores a 3 minutos.» No hay chat ni respuesta palabra por palabra: la persona
deja un pedido y lo ve en su buzón con su estado, su hora de pedido, su hora de respuesta y la respuesta entera.

**El pedido** es una fila de `AgentePedido` (§3). Dos tipos: **de la lista** (un pedido frecuente del puesto, que el
código resuelve sin modelo: para Cobranzas, «Cobranzas pendientes», «Cuotas vencidas», «Vencimientos de los próximos 7
días» y «Cuotas de un cliente»; para Coordinación, «Parte del día») y **de texto libre** (lo responde el motor con el
modelo o, si el negocio no tiene la IA, una persona de GSG: §4.4).

| Estado | Qué ve la persona | Cómo se llega |
|---|---|---|
| `RECIBIDO` | Recibido | Alta del pedido |
| `EN_CURSO` | En curso | Un proceso lo tomó |
| `RESPONDIDO` | Respondido, con su tiempo | Cierre con respuesta dentro del plazo |
| `NECESITA_PERSONA` | Necesita una persona, con el motivo y el enlace | Tarea de nivel 3, dato que falta, control de cifras que no pasa, o pausa o apagado en el medio |
| `SIN_RESPONDER` | Sin responder a tiempo | Pasó `venceEl` sin respuesta |
| `EN_BANDEJA` | «Necesita una persona: lo responde alguien de GSG» | Texto libre sin ruta 1 (§10). Corre el reloj y no lo toma ningún proceso: lo contesta una persona (§4.4) |

**Alta: `dejarPedido({ puesto, tipo, frecuente?, argumentos?, texto?, clave })`.** La `clave` la genera el navegador
**cuando se monta el formulario o el botón, no en el clic**, y la cambia recién cuando vuelve la respuesta de ese
envío: dos toques seguidos mandan la misma clave y son un solo pedido. Generada en el clic, cada toque sería un pedido
distinto y el único de la base no frenaría nada. Una transacción corta: vigencia (§12.1; con el puesto en pausa o el equipo apagado **no entra**
ningún pedido y se dice quién lo pausó), alta con `skipDuplicates` (`count = 0` es un reenvío: se devuelve el pedido
que ya estaba y no pasa nada más) y cupo de **60 pedidos por persona por día** (§6; sin cupo, se deshace). Se guarda
`venceEl = pedidoEl + objetivo`. El objetivo es de 180 s y se puede cambiar por negocio (`AgenteAjuste`, §3). Un pedido
de texto libre sin ruta 1 nace `EN_BANDEJA`, con el mismo `venceEl`, y no se le agenda ningún proceso (§4.4). «Sin ruta
1» quiere decir acá que falta la variable de la clave o que `equipo-agentes-ia` está apagado para el negocio, leído en
esa misma transacción. La falta de saldo no manda a la bandeja: sigue cerrando como `NECESITA_PERSONA` (paso 2b).

**Proceso: `procesarPedido(id, vista)`**, siempre en tres fases (§4.1). `vista` es la persona que dejó el pedido (su
`Actor`, armado con su propia sesión) y llega por parámetro: de ahí sale el recorte de §5.

| Paso | Dónde | Qué hace |
|---|---|---|
| 1 · Tomar | Una transacción corta | Vigencia. `updateMany` condicional: sólo si el pedido es **de la persona de la vista** (`userId`), está `RECIBIDO`, o `EN_CURSO` con `tomadoHasta` ya pasado, y le quedan al menos 30 s. Pone `EN_CURSO`, `tomadoHasta` e `intentos + 1`. `count = 0`: lo tiene otro proceso, no es de esa persona o ya no hay tiempo; se sale (el que se quedó sin tiempo lo cierra el punto 4 de abajo). **Sin vigencia no se sale en silencio:** el pedido se cierra como `NECESITA_PERSONA` con el motivo (pausa o apagado) y su fila de registro, que es lo que §12.1 deja escribir |
| 2a · De la lista | Fuera de transacción | `leer` de la herramienta del pedido, recorte en tres capas (§5) y renglones con su origen (§4.2). Sin proveedor y sin gasto |
| 2b · Texto libre, hasta 6 pasos | Transacción corta, después afuera | **Antes de gastar:** vigencia y reserva de gasto (§11), juntas en una transacción. Sin vigencia, se corta. Sin saldo, `NECESITA_PERSONA`. Después: llamada al modelo fuera de transacción, con corte `min(60 s, lo que le queda al intento)`; cierre de la reserva; lecturas de herramientas |
| 3 · Cerrar | Una transacción corta | Vigencia. `updateMany` condicional (`EN_CURSO` y el mismo número de intento) a `RESPONDIDO` o `NECESITA_PERSONA`, con `respondidoEl`, respuesta y renglones; fila de registro con el tiempo y si entró en el objetivo. Si ya pasó `venceEl`, se cierra como `SIN_RESPONDER` |

**Cómo se sostiene el objetivo de 3 minutos con lo que hay.** El proyecto tiene dos tareas programadas y las dos corren
una vez por día (`vercel.json:8-17`): no hay nada en el servidor que despierte cada minuto, y este diseño no agrega
una. Entonces:

1. **Se procesa apenas entra, en el mismo pedido web.** `dejarPedido` guarda la fila, responde «recibido» y deja el
   trabajo agendado con `after()` de `next/server`. Leído en las guías de Next 16.3.4
   (`node_modules/next/dist/docs/01-app/`): `after` corre cuando la respuesta ya se envió y dura hasta el `maxDuration`
   de la ruta (`03-api-reference/04-functions/after.md`); para las acciones de servidor ese valor se declara en la
   página (`03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`). No se espera adentro de la
   acción porque Next despacha las acciones de servidor de a una por cliente (`02-guides/server-actions.md`,
   «Sequential dispatch»): una acción larga trabaría el buzón. El repo ya usa `after` así
   (`src/lib/factoque-tramites-actions.ts:69`). Dentro de `after`, el trabajo corre en `runInTenantContext`
   (`tenant-context.ts:36`). La persona (`Actor`) se arma en la acción, antes de `after()`, y viaja por parámetro:
   adentro de `after()` no se vuelve a pedir la sesión.
2. **Cada intento tiene presupuesto:** termina 10 s antes de `venceEl` y nunca pasa de `maxDuration − 15 s`, con reloj
   inyectado. Con `maxDuration` 120 (provisional, `05` S17) y objetivo 180: un intento de hasta 105 s y lugar para un
   rescate. Los pedidos de la lista no llaman a nadie: se resuelven en esa misma vuelta.
3. **Rescate por sondeo, sólo de lo propio.** Mientras la persona tenga su buzón abierto con pedidos sin terminar, el
   panel consulta cada 5 s (provisional). Esa consulta (`miBuzon`), además de leer, vuelve a lanzar con `after()` **los
   pedidos de esa misma persona** que quedaron colgados (`RECIBIDO` hace más de 10 s, o `EN_CURSO` con `tomadoHasta`
   pasado) **y a los que todavía les quedan al menos 30 s**, la misma condición del paso 1: así no relanza cada 5 s un
   pedido que ya nadie va a tomar. Nunca relanza pedidos de otra persona ni pedidos `EN_BANDEJA`.
   Por qué sólo lo propio (verificado): la persona se arma desde la sesión (`actorActual`,
   `gestion.server.ts:33-42`) y no existe una función que la arme desde un `userId`; relanzar el pedido de otro lo
   procesaría con los permisos de quien está mirando, no de quien lo pidió. Se descartó crear
   `actorDe(tenantId, userId)`: sería una puerta para armar identidades sin sesión. El paso 1 repite la regla en la
   base (`userId` en el `where`) e impide que dos procesos tomen el mismo.
4. **Si se vence el plazo:** el pedido pasa a `SIN_RESPONDER` y no se reintenta solo. `miBuzon` empieza por cerrar los
   pedidos **propios** vencidos: `updateMany` condicional (`RECIBIDO` o `EN_CURSO`, con `venceEl` pasado) a
   `SIN_RESPONDER`, con su fila de registro; es una de las escrituras que valen aunque no haya vigencia (§12.1). Mientras
   tanto, el estado que se muestra se calcula con `venceEl`, así que nunca figura «en curso» pasado su plazo. Para los
   que nadie miró, la tarea diaria (tanda 3). La persona ve «Sin responder a tiempo» con «Reintentar» (un pedido nuevo)
   y «Pasárselo a una persona». Cuenta como fuera del objetivo. Un pedido `EN_BANDEJA` no pasa a `SIN_RESPONDER`: queda
   abierto hasta que una persona lo conteste (§4.4).

Qué queda garantizado y qué no: los pedidos de la lista se responden en la misma vuelta; ningún pedido queda «en
curso» pasado su plazo; el tiempo de cada pedido y el porcentaje dentro del objetivo salen de las horas guardadas, no
de una estimación. **No** se garantiza que todos los de texto libre lleguen a tiempo: depende del proveedor y de que la
función no se corte. Si se corta y quien lo pidió no tiene su buzón abierto, no hay rescate (§16, riesgo 9). Un
despertador por minuto sería otra entrada en `vercel.json`: es una decisión de plan y de gasto y no se propone ahora.

**Métricas reales (las pidió el dueño).** De cada pedido quedan `pedidoEl`, `respondidoEl`, `venceEl`, el estado, si
usó modelo y quién respondió. **Todas las cuentas salen de `AgentePedido`, que es la única fuente:** así entran también
los pedidos que siguen abiertos (recibidos, en curso, en bandeja) y los que ya pasaron su plazo sin que nadie los haya
marcado, con el estado calculado por `venceEl` y el reloj inyectado. El registro guarda una fila por pedido cerrado
(tiempo en milisegundos, si entró en el objetivo y quién respondió) como rastro que no se edita, no como fuente de la
cuenta: contado sobre el registro, un pedido sin cerrar no existiría. El parte y la pestaña Registro muestran, por día
y por mes: pedidos recibidos, respondidos, porcentaje dentro del objetivo, tiempo mediano y máximo, sin responder a
tiempo, derivados a una persona, en la bandeja de GSG y, aparte, **respondidos por una persona de GSG**.

**Pausa o apagado en el medio.** Con la vigencia caída, lo único que se escribe después es (a) el cierre de la reserva
ya tomada, que es la cuenta de plata ya gastada, (b) el pedido como `NECESITA_PERSONA` con el motivo y (c) su fila de
registro. La respuesta a medio armar no se guarda. Peor caso: una llamada que ya había salido termina y se cobra; no
sale ninguna más.

### 4.4 La bandeja de GSG: el texto libre lo contesta una persona

**Decisión del dueño (14/11, noche):** «Vamos a sumar la bandeja para que GSG conteste el texto libre.» Reemplaza al
estado «en espera de la IA» y al botón «Pedir ahora» del diseño anterior.

- **Qué entra.** Un pedido de texto libre de un negocio sin ruta 1 nace `EN_BANDEJA`, con su `venceEl` (§4.3). La
  persona lo ve como «Necesita una persona: lo responde alguien de GSG»; antes de mandarlo, el formulario le avisa que
  lo va a leer una persona de GSG (`02` §3). Con clave e interruptor de IA, el texto libre va al motor y no pasa por
  acá. Si la IA se prende con pedidos todavía en la bandeja, se quedan ahí hasta que una persona conteste.
- **Pantalla.** `/operador/bandeja`, dentro de «Pedidos» en la consola del operador. La lista muestra negocio, puesto,
  quién lo pidió, hace cuánto y si ya pasó su plazo; **no muestra el texto**. Una persona de GSG lo abre (ahí ve el
  texto), escribe la respuesta (texto plano, hasta 2000 caracteres, provisional) y la manda. La persona del negocio la
  ve en su buzón como «Respondido por una persona de GSG», con su hora y cuánto tardó.
- **Cómo lee entre negocios: el patrón de Soporte, sin nada nuevo.** La consola no tiene un rol que saltee RLS
  (`src/lib/operator-db.ts:8-15`): lee `Tenant` (sin RLS) y, por cada negocio, abre una transacción parada en ese
  negocio con `enElNegocio` (`operator-db.ts:37-46`), como `listarTickets`
  (`src/lib/soporte/tickets.server.ts:135-142`). La lista pide `requireSesionOperador`; las dos acciones empiezan por
  `operadorParaNegocio({ id })` (como `src/app/operador/(console)/soporte/actions.ts:38`), que además deja a CH sólo
  para el dueño de GSG. El trinquete `src/lib/operador/guardia-negocio.test.ts:394` lo exige y la bandeja **no** se
  anota en sus exentas (`:64`). Sin las tablas, cartel: `esTablaAusente` (`src/lib/soporte/alta.server.ts:38`).
- **Reparto del código.** `src/lib/agentes/bandeja.server.ts` recibe la transacción ya parada en el negocio y no
  importa `operator-db`: `listarEnTx(tx, tenantId)`, `abrirEnTx(tx, …)` y `responderEnTx(tx, …)`. Escribe sólo tablas
  `Agente*`, por su delegado (§6.1). El recorrido de negocios y el nombre de quien pidió (`tx.user`, sólo `id` y
  `name`) viven en la consola (`bandeja-consola.server.ts`).
- **Abrir** (`abrirEnTx`): vigencia, lee el pedido `EN_BANDEJA` de ese negocio y deja una fila `LECTURA_GSG` con
  `actor = operator:<nombre>`. Abrir es una acción (POST), no un enlace: sin esa fila no hay texto. Queda **quién
  leyó**.
- **Responder** (`responderEnTx`): vigencia; `updateMany` condicional `EN_BANDEJA → RESPONDIDO` con `respuesta`,
  `respondidoEl`, `respondidoPor = operator:<nombre>` y `conModelo = false`; `count = 0` quiere decir «ya lo respondió
  otra persona» y no se pisa; fila `RESPUESTA_GSG` con el tiempo y si entró en el objetivo. Queda **quién contestó**.
  El nombre sale de la sesión del operador, nunca del formulario. El negocio ve las dos filas en su Registro, como «GSG».
- **Se mide igual que el resto** (§4.3): tiempo desde `pedidoEl`, dentro o fuera del objetivo, y la cuenta aparte de
  respondidos por una persona. Un pedido en bandeja que pasó su plazo no se cierra como «sin responder»: sigue abierto
  y cuenta fuera del objetivo. Con el puesto en pausa o el equipo apagado no se puede abrir ni responder, y se dice
  por qué.
- **Invariante: por la bandeja sólo contesta una persona.** Queda prohibido por diseño que una sesión, una rutina o un
  proceso vigile la bandeja y conteste solo:
  1. Las únicas puertas son las dos acciones de servidor de `bandeja/actions.ts`, que piden la sesión de un operador.
     No hay ruta en `src/app/api/`, ni entrada para robots, ni webhook de respuesta, ni tarea programada.
  2. `abrirEnTx` y `responderEnTx` se importan sólo desde `bandeja-consola.server.ts`, y ese archivo sólo desde la
     página y las acciones de la bandeja.
  3. El motor, el rescate y la tarea diaria no tocan un pedido `EN_BANDEJA`: sus `updateMany` sólo toman `RECIBIDO` y
     `EN_CURSO`.
  4. La bandeja no importa el proveedor de IA ni `ia.server.ts`, y no usa `after(` ni `fetch(`. No hay «sugerir la
     respuesta con IA»: mandaría a un proveedor el texto de un negocio que no prendió la IA.

  Lo comprueban `bandeja-solo-personas.test.ts` (estático, probado además contra código de ejemplo para que pueda
  fallar) y `bandeja-postgres.test.ts` (§14). **Lo que el código no puede impedir:** que alguien maneje con un robot el
  navegador de una persona con sesión. Eso es regla de trabajo (`05`, sección H): ninguna sesión de Claude ni rutina
  usa una sesión de operador para contestar.
- **Lo que no hace, a la vista:** la persona de GSG ve el pedido, no los datos del negocio: contesta con lo que sabe o
  dice dónde mirarlo. Y no hay aviso automático de que entró un pedido: en la tanda 1 se mira la bandeja. Las dos son
  decisiones abiertas (`05`, sección H).

## 5. Identidad y permisos del agente

- El agente **no tiene usuario con clave ni sesión**. Su identidad es `agente:<puesto>` (va a `actor` del registro y
  a `autor` de `registrarCambio`, `gestion.server.ts:84-92`).
- `ActorAgente` se arma con el **rol base que declara su equipo** (para este equipo, `ADMINISTRACION`; `permisoDe`,
  `gestion-core.ts:725-729`), recortado a los módulos que el puesto declara. Si un negocio le sacó a Administración un
  permiso, el agente también lo pierde. Ojo con el equipo de Dirección: ese rol tiene todo permitido en el código
  (`gestion-core.ts:726`), así que ahí el único límite es la lista de módulos del puesto; por eso la lista es
  obligatoria y un puesto sin módulos declarados no lee nada.
- En un pedido, lo que se ve es la **intersección** entre el agente y la persona que lo dejó, en **tres capas** (el
  diseño anterior sólo miraba la primera):
  1. **Módulo:** `puede` (`gestion.server.ts:44-46`).
  2. **Proyectos:** `filtroDeProyectos(humano)` (`:69-72`). Toda `Fila` con `proyectoId` se descarta si ese proyecto no
     es visible para la persona; las cuotas de la empresa (sin proyecto) sólo con el módulo `empresa`. Los totales se
     recalculan sobre lo que quedó: nunca se muestra un total que incluya lo que la persona no ve.
  3. **Columnas:** `columnasOcultas(humano)` (`:62-66`). Cada herramienta declara a qué columna de la ficha corresponde
     cada campo (`costoUnit`, `costoTotal`, `recargo`, `margen`, `gestion-core.ts:717-723`); el campo oculto se quita
     antes de llegar al modelo.
  El recorte lo hace el motor sobre el `Resultado`, no cada herramienta, con las reglas de visibilidad que el rubro le
  pasa por parámetro desde `actor-agente.server.ts` (el motor no importa nada de `src/lib/proyectos/`, §6.1). De fábrica entran Dirección y Administración,
  que ven todos los proyectos (`gestion-core.ts:732`), así que hoy el recorte no quita nada; pero los permisos son
  editables por negocio y el test lo prueba con un rol que no ve todo.
- **El parte automático** (sin persona) se arma con los permisos del agente. Los totales del parte sólo se le muestran a
  quien ve todos los proyectos y el módulo `empresa`; el resto ve sus compromisos y el cartel «tu rol no ve el parte completo».
- **De quién es la vista:** siempre de quien dejó el pedido, armada con su propia sesión (`actorActual`,
  `gestion.server.ts:33-42`). No hay función que arme a una persona desde un `userId` y no se crea: por eso el rescate
  sólo toma pedidos propios (§4.3) y nada se procesa en nombre de otra persona.
- Aprobar exige `exigirEditar` del módulo de la herramienta (`gestion.server.ts:56-60`) más el módulo `agentes`.

## 6. Motor de permisos y topes (`permisos-core.ts`, puro)

`decidirLlamada({ puesto, tarea, clase, config, estado }) → correr | proponer | derivar | negar(motivo)`

1. Interruptor del negocio apagado o puesto en pausa → `negar("pausado")`. El `estado` que recibe sale de la vigencia
   leída en ese momento (§12.1), no de una lectura hecha al empezar la vuelta.
2. `nivel = min(techoDeCodigo[tarea], config.niveles[tarea] ?? inicial[tarea])`. Un valor guardado mayor al techo se
   ignora y se registra.
3. `lectura` → correr. `prepara` → nivel ≥ 1 propone; nivel 0 niega. `ejecuta` → nivel 2 corre **si pasa los topes y
   la huella**; nivel 1 lo convierte en propuesta; nivel 3 deriva.
4. **Topes con cupo atómico, no con «contar y después escribir».** `contadores.server.ts` → `tomarCupo(tx, { puesto,
   tope, sujeto, periodo, max })`: `createMany` de la fila con `skipDuplicates` y después un solo
   `tx.agenteContador.updateMany` con `where: { …, n: { lt: max } }` y `data: { n: { increment: 1 } }` (es un único
   `UPDATE … SET n = n + 1 WHERE … AND n < max`, sin SQL crudo). `count = 0` = tope alcanzado y la transacción se
   deshace entera con un error controlado. Va en la misma transacción que la escritura que consume el cupo. `sujeto` es
   `*` para los cupos del puesto y el `userId` para los cupos por persona (60 pedidos por día). Los topes «abiertos a
   la vez» usan `periodo = 'abiertos'` y se devuelven al cerrar: el cierre es condicional (`updateMany … where
   estado='ABIERTO'`, una fila) y recién entonces `n: { decrement: 1 }`. «Una abierta por cuota» no es un contador: es
   el índice único parcial de §3.
5. Toda salida que no sea `correr` deja fila en el registro con su motivo.

### 6.1 Sólo lectura por construcción (reemplaza a la guardia de imports)

La guardia anterior era una lista negra de imports: una herramienta podía escribir con `prisma.<modelo>.update` sin
importar nada prohibido. Se reemplaza por tres cierres:

1. **`ctx.db` (`lectura.server.ts`):** fachada escrita a mano que sólo expone `findMany`, `findFirst`, `count`,
   `aggregate` y `groupBy`, sobre los modelos que el puesto declara en su catálogo, con `tenantId` forzado en el
   `where`; sin `include`, y con `select` anidado sólo hacia modelos declarados. Cualquier otra operación (`create`,
   `update`, `upsert`, `delete`, `$executeRaw`, `$queryRaw`, `$transaction`) o modelo no declarado **lanza** y queda en
   el registro. No da acceso a las tablas `Agente*`: esas se leen y escriben sólo por las puertas del motor.
   - **Sobre qué cliente se arma:** sobre el `prisma` de `@/lib/prisma`, que con RLS prendido es el cliente extendido
     (`src/lib/rls.ts:86`): cada operación suelta abre su propia transacción corta y fija el negocio antes de consultar
     (`rls.ts:139-143`). **Nunca sobre `basePrisma`** (`@/lib/prisma-base`): es el cliente crudo, sin el ajuste del
     negocio; con el rol de la app devolvería vacío sin avisar.
   - **Nunca dentro de una transacción:** ahí el cliente extendido no abre la suya ni usa la de afuera; consulta directo,
     por otra conexión y sin el ajuste (`rls.ts:118-119`). Cada método de `ctx.db` mira `getTenantStore()`
     (`tenant-context.ts:45`) antes de consultar y **lanza** si `insideTx` es verdadero o si el negocio del contexto no
     es `ctx.tenantId`. En la tarea diaria se usa dentro de `runInTenantContext` (`tenant-context.ts:36`).
   - **Test «más de cero filas»** (Postgres, rol `app_rls`, RLS prendido, datos en A y en B): `ctx.db` de A trae más de
     cero filas de A y ninguna de B; llamado dentro de `tenantTransaction`, lanza. Y el test estático prohíbe
     `@/lib/prisma-base` en todo `src/lib/agentes/`, salvo en `barrido.server.ts` (tanda 3), que lista negocios como
     hace hoy `avisos-programados.server.ts:15`.
2. **Las herramientas no tienen cliente de escritura a mano.** Los archivos `herramientas-*.server.ts` sólo pueden
   importar de una **lista blanca**: los tipos del motor, las reglas puras y las lecturas de pantalla nombradas en §4.
   El test estático falla si importan `@/lib/prisma`, `@/lib/prisma-base` o `@/lib/rls`, o si aparece en su código una
   llamada de escritura (`.create(`, `.createMany(`, `.update(`, `.updateMany(`, `.upsert(`, `.delete(`,
   `.deleteMany(`, `$executeRaw`, `$queryRaw`).
3. **En `src/lib/agentes/` sólo se escribe en tablas `Agente*`**, siempre con `tx` y siempre por su delegado
   (`tx.agente…`): el mismo test lo exige, y exige que el motor **no importe nada de `src/lib/proyectos/`** (así sirve a
   otro rubro y al equipo de GSG). **No hay SQL crudo en el motor:** `$executeRaw` y `$queryRaw` quedan prohibidos en
   toda la carpeta, sin excepciones. Los cupos (§6) y la reserva de gasto (§11) se diseñaron para no necesitarlo:
   `createMany` con `skipDuplicates`, `updateMany` condicional con `increment` y `updateManyAndReturn`. Motivo: el SQL
   crudo no pasa por el candado de negocio de la aplicación y depende de un `AND "tenantId"` escrito a mano
   (`rls.ts:105-113`). El único SQL crudo de todo el diseño es el candado de fila de la conciliación (tanda 4, §7.1), y
   vive en `src/lib/proyectos/`, no en el motor. Las dos escrituras de negocio permitidas se las pasa el rubro por
   parámetro y se nombran una por una: `avisar` (aviso interno, `gestion.server.ts:170`) y, desde la tanda 4, la
   conciliación (§7.1). `bandeja.server.ts` cumple lo mismo: recibe `tx`, escribe sólo `Agente*` y no importa
   `@/lib/operator-db`; el `set_config` con SQL crudo que para la transacción en el negocio es el de la consola
   (`operator-db.ts:43`), fuera del motor (§4.4).

Tests: `solo-lectura.test.ts` (unidad: `ctx.db.proyectoCuota.update` lanza; un modelo no declarado lanza; `where` de
otro negocio se pisa; dentro de una transacción lanza), el «más de cero filas» de `agentes-aislamiento-postgres` (§14) y
`guardia-escrituras.test.ts` (estático: lista blanca, sin SQL crudo, sin `prisma-base`; probado además contra código de ejemplo
para que no sea un test que nunca puede fallar, como hace `interruptores-escritura.test.ts:90-109`).

## 7. Propuestas y aprobación (`propuestas.server.ts`)

- **Crear** (fase 1, después fase 3): valida argumentos y `leer` fuera de transacción; adentro, **vigencia** (§12.1:
  con el puesto en pausa o el interruptor apagado no se crea nada), `huella(tx)`, `tarjeta` y alta con
  `skipDuplicates`. Si `count = 0` ya hay una PENDIENTE para esa herramienta y entidad: se devuelve la existente, sin
  error. Si entró, `tomarCupo` (sin cupo, la transacción se deshace). Hash de la huella: los campos que justifican la
  acción (para una cuota, `id · monto · moneda · venceEl · pagadoEl · anuladoEl`).
- **Decidir** (una transacción corta): **candado de pausa** primero: la fila del puesto se asegura con
  `skipDuplicates` y se toca con `tx.agentePuesto.updateMany` `where estado='ACTIVO'` (no cambia nada, pero toma la
  fila); `count = 0` → está en pausa y no se decide. Así una pausa que llega a la vez espera a que la decisión termine
  o gana antes: no queda una aprobación ejecutada «después» de pausar. Después, el interruptor leído con `tx` (§12.1);
  `updateMany` de PENDIENTE a EJECUTADA con `count === 1` como candado (recurso de `acciones-empresa.ts:239-240`);
  `huella(tx)`; si cambió → VENCIDA en la misma transacción; si no, `ejecutar(tx)`. Un error deshace la transacción
  entera (la propuesta vuelve a PENDIENTE).
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
  | A | 1 · LEER, en `runInTenantContext` | Tablas, pausa, cuotas (lecturas de pantalla), compromisos del día y atrasados, propuestas por vencer, pedidos del buzón con el plazo pasado |
  | B | 3 · ESCRIBIR, transacciones cortas | **Todo lo que no necesita IA:** vencer propuestas; marcar «sin responder» los pedidos del buzón que pasaron su plazo y nadie miró (§4.3; sólo `RECIBIDO` y `EN_CURSO`, nunca los `EN_BANDEJA`, §4.4); levantar compromisos (`updateMany` condicional sobre `revisadoEl`: sólo si no se revisó hoy); guardar el parte con sus números (`AgenteParte`; si choca el único del día, no repite); crear las propuestas de recordatorio con la plantilla (§13); avisos internos. Lotes de hasta 50 filas por transacción para no pasar los 5 s |
  | C | 2 · PENSAR, después 3 | Con lo que quede de tiempo y de gasto: hasta 5 redacciones (introducción del parte, frase libre). Cada una: vigencia y reserva de gasto en una transacción (§12.1, §11), llamada con corte por tiempo, control de cifras y filtro, y una transacción corta que guarda el texto **sólo si** el parte o la propuesta siguen como estaban |

- Presupuesto de IA por negocio: lo que dé `min(40 s, tiempo restante ÷ negocios que faltan)`, con reloj inyectado. Lo
  que no entra queda «preparar al abrir» y se redacta cuando alguien abre el panel (mismo recurso que los avisos al
  abrir Inicio, `gestion.server.ts:148`). Si la función se corta entre B y C no queda nada a medias: los números ya
  están guardados y falta sólo el texto.
- El panel también llama al modelo fuera de transacción; `mi-equipo/page.tsx` declara `maxDuration` como sus vecinas.
- Idempotencia: el único del parte, el de las propuestas, la `clave` de los compromisos y el `updateMany`
  condicional de `revisadoEl` hacen que dos corridas el mismo día, o dos a la vez, no dupliquen.

### 8.1 Compromisos y memoria: lo hace el código

- **Una promesa de pago no la anota el modelo.** Cuando el modelo llama `agenda.anotar`, el código no crea nada: arma
  una tarjeta en la respuesta del pedido con datos del sistema («¿Anoto que {cliente} paga el {fecha}?») y dos botones. Al tocar
  «Anotar», una acción de servidor valida fecha y entidad, toma el cupo y crea el compromiso. `creadoPor` es la persona.
- **Si el modelo no llamó a la herramienta, igual no se pierde:** la pestaña Buzón tiene siempre el botón «Anotar
  compromiso», y `agenda-core.pareceUnaPromesa(texto, ahora)` (regla pura: verbo de pago más una fecha o un día)
  ofrece «¿Anoto esta promesa?» con el formulario precargado cuando el pedido se respondió sin tarjeta.
- **Recordar tampoco depende de que el modelo se acuerde de buscar.** Antes de la primera llamada de cada pedido, el
  código busca en el texto del pedido los nombres de clientes y proveedores del negocio y, si encuentra alguno,
  corre `memoria.buscar` por su cuenta y mete el resultado en `<datos>` con origen («Cuaderno», «Agenda» o «Historial ·
  pedido del {fecha}»). El modelo además puede llamar a `memoria.buscar` para buscar otra cosa (caso M1).
- `memoria.buscar(texto, entidadId?)`: notas activas del puesto, compromisos de la entidad y **los pedidos anteriores
  de esa misma persona** a ese puesto, con sus respuestas (búsqueda por texto, últimos 90 días, hasta 10 extractos). Lo que dijo otra
  persona no se cruza por esta vía: lo compartido entre personas es el cuaderno y la agenda, que tienen autor.
  Sin índice de texto ni dependencias nuevas: alcanza para el volumen de un negocio; si deja de alcanzar, se anota.

## 9. Registro

`registrar(db, fila)` es la única puerta. Se llama desde el motor, no desde las herramientas, así ninguna queda sin
anotar. `detalle` guarda nombres de herramienta, identificadores y resultado; **no** guarda el texto completo de los
datos leídos ni datos bancarios. El informe mensual y la pestaña Registro leen de acá. La app no puede editar ni
borrar una fila: no hay código que lo haga y la base no se lo permite (§3).

## 10. Proveedor de IA: una sola ruta con modelo, y el equipo sin modelo

```ts
interface ProveedorIA {
  id: string;
  turno(p: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[]; maxTokens: number; corte: AbortSignal }):
    Promise<{ ok: true; texto: string; llamadas: Llamada[]; uso: { entrada: number; salida: number }; corte: string }
          | { ok: false; motivo: "caida" | "saturada" | "clave" | "rechazo" | "tiempo" }>;
}
```

| Ruta | Qué es | Cuándo |
|---|---|---|
| 1 | `proveedor-claude`: API de mensajes con herramientas, con **clave de API propia del equipo** | Para los pedidos de texto libre, y sólo si se cumplen las tres: la variable de la clave está cargada en el despliegue, el negocio tiene prendido `equipo-agentes-ia` (§12) y queda saldo del mes (§11) |
| 2 · opción B | Sólo la interfaz `ProveedorIA` | **No se construye ningún segundo adaptador por ahora** (decisión del dueño, 14/11: «No utilizaremos Cloudflare por ahora»; `05` D8) |
| 3 | Sin modelo (§10.1): lo que calcula el código. El texto libre, sin clave o sin ese interruptor, va a la bandeja de GSG (§4.4) | En cualquier otro caso: sin clave, sin ese interruptor, proveedor caído o gasto agotado |
| Pruebas | Proveedor de guion (respuestas fijas por caso) | Tests, CI y la demo local de quien construye. **No existe en producción:** el motor publicado elige entre la ruta 1 y la ruta 3 |

- **El proveedor se llama siempre fuera de transacción** (§4.1) y con corte por tiempo (§4.3). El proveedor de guion de
  los tests falla si lo llaman con una transacción abierta: así el error se ve en CI.
- **Clave propia del equipo.** El motor lee su clave de una variable propia, `AGENTES_ANTHROPIC_API_KEY` (nombre
  propuesto), distinta de `ANTHROPIC_API_KEY`. Motivo, verificado: si se carga `ANTHROPIC_API_KEY` en el despliegue, los
  7 agentes actuales pasan solos del cupo gratis a Claude (`ia.server.ts:40` y `:85`) y esos no tienen tope de gasto.
- **La clave sola no alcanza.** Las variables son del despliegue y el despliegue `erp-ch` atiende a todos los negocios
  (§15). Por eso la ruta 1 pide además el interruptor `equipo-agentes-ia` del negocio: qué negocio manda sus datos a un
  proveedor se decide negocio por negocio y queda en su auditoría.
- **El servidor del producto nunca usa ni guarda el acceso de un plan de Claude** (ni credencial ni variable), ni el de
  Codex. El plan sirve para construir y para el trabajo del equipo de GSG dentro de Claude Code (`05`, D4-bis y sección
  D). Un «puente» que contestara pedidos del producto con el plan se evaluó y se descartó el 14/11 (`05`, D4-bis).
- **Cloudflare, fuera del camino.** El equipo no usa el servicio sin cargo. Los 7 agentes actuales de MIA y
  `ia-gratis-core.ts` quedan como están: este diseño no los toca.
- El motor **no** usa agentes administrados, conectores ni memoria del proveedor (condición de las decisiones, §3 y §5).
- La forma exacta del pedido con herramientas, los campos de consumo y los nombres de modelo **no se toman de
  memoria**: el constructor los lee en la documentación oficial (skill `claude-api`) y los cita en el PR. Lo que hay
  hoy en `ia.server.ts:22-26` y `:102-109` es el punto de partida, no la referencia.
- Modelo: parámetro por puesto. Para la prueba con clave, uno por defecto que el constructor toma de la documentación
  oficial (provisional a confirmar). El definitivo se elige con la evaluación de 30 casos (tanda 5; norma del ERP:
  dentro de los productos, modelo chico elegido con evaluación).

### 10.1 Sin modelo: lo que el equipo hace igual (se entrega en la tanda 1)

- **Los pedidos de la lista se responden siempre**, con clave o sin clave, y dentro del objetivo: los resuelve el
  código con las lecturas de Administración (§4, §4.3). Para Cobranzas: «Cobranzas pendientes», «Cuotas vencidas»,
  «Vencimientos de los próximos 7 días» y «Cuotas de un cliente» (el cliente se elige de una lista que arma el código).
  Para Coordinación: «Parte del día».
- **El parte del día** es un pedido de la lista. En la tanda 1 trae cobros vencidos, cobros de los próximos 7 días y
  las métricas del buzón (§4.3); los demás renglones entran con su tanda (`02` §1.1). El parte **automático** de la
  mañana y su tabla `AgenteParte` son de la tanda 3.
- **Los pedidos de texto libre, sin modelo, van a la bandeja de GSG** (§4.4): no se pierden, corre su reloj y los
  contesta una persona. La pantalla de la bandeja la entrega el brief 1D de la tanda 1.
- Buzón, registro, métricas, pausa, permisos, topes e interruptor funcionan igual con modelo y sin modelo.
- Los textos por plantilla (recordatorios, parte automático) son otra cosa: `plantillas-core.ts` y `respaldo-core.ts`,
  tandas 2 y 3.

## 11. Límite de gasto

- Tope mensual por negocio en micro-dólares: constante por defecto en el código (provisional, `05` D2) y, más
  adelante, valor por negocio que sólo cambia la consola del operador (tanda 5).
- **Dos tablas (§3).** `AgenteGasto` lleva, por mes, `gastado` y `comprometido` (gastado más reservas abiertas).
  `AgenteReserva` lleva **una fila por llamada**, con su estimado y **su propio vencimiento**. El diseño anterior tenía
  un solo vencimiento para todas: cada reserva nueva corría el de las demás y un cierre tardío descontaba la reserva
  de otro.
- **Reservar** (una transacción corta, la misma que mira la vigencia, §4.3; todo con delegados, sin SQL crudo). Una
  vuelta de 6 pasos reserva 6 veces:
  1. Fila del mes: `createMany` con `skipDuplicates`. Sin esto, la primera llamada de cada mes no encontraba fila y el
     equipo quedaba «sin saldo» todo el mes.
  2. Cobrar las vencidas: `tx.agenteReserva.updateManyAndReturn` `where estado='ABIERTA' y venceEl < ahora` → VENCIDA.
     Por cada mes devuelto, `gastado += la suma de sus estimados` (el `comprometido` no cambia: ya las contaba). Con
     dos pedidos a la vez ninguna se cobra dos veces: el segundo espera la fila y ya no la encuentra ABIERTA.
  3. Reserva condicional: `tx.agenteGasto.updateMany` `where comprometido <= tope − estimado`, con
     `comprometido += estimado` y `llamadas += 1`. `count = 0` = no alcanza → ruta 3, y esa transacción no escribe más.
  4. Alta de la fila de reserva: ABIERTA, `venceEl = ahora + 120 s`.
- **Cerrar** (transacción corta, al volver la llamada): `updateMany` de **esa** reserva `where id y estado='ABIERTA'` →
  CERRADA, con su `real`. Si `count = 1`: `gastado += real` y `comprometido += real − estimado`. Si `count = 0`, ya
  venció y se cobró por su estimado: no se toca nada. Un cierre tardío sólo puede tocar su propia fila.
- **Si la función se corta**, la reserva no queda trabada: vence sola a los 120 s (más que el corte de 60 s de la
  llamada) y se cuenta como gastada por su estimado en la próxima reserva de ese negocio. El error va siempre para el
  lado de frenar, nunca de gastar de más.
- **`estimado` incluye la entrada:** precio de entrada × tokens de entrada estimados (instrucciones + mensajes +
  definición de herramientas; conteo conservador por caracteres, provisional) + precio de salida × máximo de tokens de
  la respuesta. Cada cierre compara estimado contra real; si lo real supera lo estimado, se registra y se sube el
  coeficiente (se calibra en la tanda 5 con el conteo oficial).
- Precio por modelo en una tabla del código, **leída de la página oficial de precios y citada con fecha** (no de memoria).
- Además: 6 pasos por pedido dentro del presupuesto del intento (§4.3), tope de tokens por respuesta y 60 pedidos
  **por persona** por día (cupo en `AgenteContador` con `sujeto = userId`, §6). Aviso interno a Dirección al 80 % del
  tope.
- Sin modelo no hay gasto: los pedidos de la lista (§10.1) no reservan nada.

## 12. Interruptores por negocio y pausa

**Dos interruptores nuevos**, al final del catálogo (`interruptores.ts`: empieza en `:66` y cierra en `:213`), apagados de fábrica y escritos sólo por la
consola del operador (`interruptores.ts:15-20`). Si la lectura falla, apagados.

| Id | Qué prende | Texto para el operador (`alPrender`) |
|---|---|---|
| `equipo-agentes` | El panel «Mi equipo», el buzón y todo lo que calcula el código (§10.1). No manda datos a ningún proveedor. Mientras el otro esté apagado, los pedidos escritos van a la bandeja de GSG (§4.4) | «Suma la app Mi equipo a Dirección y Administración; no le quita apps a nadie. Sin IA, los pedidos escritos los lee y los contesta una persona de GSG desde la bandeja. Sin la migración aplicada, el negocio ve "Falta activar el equipo".» |
| `equipo-agentes-ia` | Responder con IA los pedidos de texto libre (ruta 1, §10). Sólo cuenta si el otro está prendido y la clave está cargada | «Los datos de este negocio viajan al proveedor de IA. Con datos reales exige el consentimiento escrito del cliente, con el proveedor nombrado, y los 30 casos contra el modelo real.» |

- **Los dos van con `cambiaLasApps: false`.** Con `true`, la consola arma la vista previa con las apps que se pierden
  y se ganan al pasar del menú de siempre a «Trabaja por apps», no con este interruptor
  (`interruptores-core.ts:384` y `:394`), y para prender exige aceptar esas pérdidas (`:294`): vista previa y fila de
  auditoría equivocadas. `equipo-agentes` suma una app y no quita ninguna. Que la app aparezca lo resuelve el código
  del panel: `layout.tsx:276-277` la deja pasar sólo con `equipo-agentes` prendido (el layout ya tiene los
  interruptores leídos, `:96`) y la ruta redirige a Inicio si está apagado.
- **Prender y apagar no necesita código nuevo en la consola.** La ficha del negocio dibuja un renglón por cada entrada
  del catálogo que no es «incorporada» (`InterruptoresCard.tsx:49`, `interruptores.ts:223`): con sumarlos al catálogo
  alcanza. Lo que sí es trabajo, y va en la tanda 5, es **fijar el tope de gasto por negocio** desde la consola.
- **Lectura en la puerta:** `interruptoresDelNegocio` (`interruptores.server.ts:56-59`). Está **guardada por pedido**:
  sirve para decidir si se muestra la pantalla, no para decidir si se sigue escribiendo (§12.1). En el barrido, por
  negocio, con el patrón de `contabilidadPrendidaEn` (`modulo.server.ts:20-37`).
- **La siembra de la demo local no puede escribir el interruptor desde `scripts/`.** El trinquete
  (`interruptores-escritura.test.ts:85-116`) recorre `src/` y `scripts/` y falla con cualquier archivo que escriba la
  entidad fuera de su lista (`:30-51`). Se prende en `prisma/seed-mia-producciones.ts:63-64`, donde la demo ya prende
  `inicio-por-apps` con el mismo renglón; ese archivo sólo corre contra una base local (`:29`). No se toca la lista del
  trinquete. Además, `estado.server.ts` lee con `filtroDeFilasValidas` y `estadoDesdeFilas` (como
  `modulo.server.ts:24-30`) y no contiene `audit(`, `auditAdmin(` ni `$executeRaw`: el detector marca un archivo que
  nombra la entidad y además tiene alguna de esas llamadas (`:70-83`).
- **Pausa por puesto y «Pausar todo»:** `AgentePuesto.estado`. «Pausar todo» pausa, en una transacción, cada puesto de
  los equipos que la persona ve. Acción de servidor con `exigirEditar("agentes")` y auditoría (en `acciones-equipo.ts`,
  no en `estado.server.ts`).
- Freno de emergencia de GSG sin deploy: apagar el interruptor desde la consola.
- **Condición para que la IA lea datos reales** (se suma a `05` D5 y D13): prender `equipo-agentes-ia` en un negocio
  con datos reales exige los 30 casos corridos **contra el modelo real** elegido, con los 12 casos trampa y los 4 de
  memoria pasando, y el resultado guardado en `docs/tenants/mia-producciones/agentes/` con modelo, fecha y n/n. Con el
  proveedor de guion solo no alcanza: el guion prueba el código, no al modelo. El control es de procedimiento (el texto
  `alPrender` se lo recuerda al operador), no de código. Prender `equipo-agentes` solo no manda datos afuera; en qué
  negocio se prende para la prueba lo decide el dueño (`05`, D15).

### 12.1 Vigencia: se vuelve a mirar antes de gastar y al escribir

Un pedido de texto libre puede tardar hasta su presupuesto (§4.3). Si alguien toca «Pausar todo» o GSG apaga el interruptor
en el medio, el equipo no puede seguir escribiendo ni gastando con lo que leyó al empezar.

`vigencia(tx, { tenantId, puesto })`, en `estado.server.ts`: lee **con `tx` y sin caché** la última fila válida de
`equipo-agentes` (la consulta de `modulo.server.ts:24-30`) y la fila del puesto en `AgentePuesto`. Devuelve `vigente` o
el motivo (`apagado`, `pausado`). Reglas:

1. **Toda transacción del equipo que escribe la llama primero.** Vale también al dejar un pedido: en pausa o apagado, no entra. Sin
   vigencia no se escribe, salvo lo que dice §4.3: cerrar una reserva ya tomada, dejar el pedido como «necesita una
   persona» o, si ya pasó su plazo, como «sin responder», y su fila de registro. Ninguna de las tres gasta ni muestra
   datos. Abrir y responder desde la bandeja de GSG no son excepción: piden vigencia (§4.4).
2. **Antes de cada llamada al modelo**, dentro de la transacción de la reserva (§11): sin vigencia no hay reserva, y
   sin reserva no hay llamada. Vale para cada uno de los 6 pasos de un pedido y para cada redacción del barrido.
3. La ruta 1 pide además `equipo-agentes-ia` prendido, leído en esa misma transacción.
4. Donde se ejecuta algo que no se deshace (decidir una propuesta, tandas 2 y 4), la pausa se toma con candado de fila
   (§7), no con una lectura.

Lo que queda, dicho: entre esa lectura y el final de su transacción corta pasan milisegundos, y una llamada al modelo
que ya salió termina y se cobra. Después de eso no sale ninguna más ni se guarda la respuesta.

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
  sobre toda respuesta del modelo a un pedido (los enlaces internos los pone el código, no el modelo). Antecedente:
  `revisarRespuesta` (`consulta-core.ts:156-174`), que ya frena links y contactos.
- **Control de cifras y de atribución:** `cifras-core` extrae importes, fechas y porcentajes de la prosa y exige (1)
  que cada uno figure en las `filas` leídas en esa vuelta o en el texto del pedido, y (2) que **no quede atribuido
  a otra entidad**: si en la misma oración aparece la etiqueta de una entidad leída (cliente, evento, proveedor), el
  importe tiene que ser de una fila de esa entidad. «Farma debe $ 500.000» se frena si los $ 500.000 son de otro
  cliente. Si no pasa, se reintenta una vez y, si persiste, se responde sólo con los renglones armados por el código y
  se registra. Corre también sobre la introducción del parte y la frase libre de las propuestas.
- **Datos que no salen:** las herramientas no devuelven CBU, CUIT, mails ni teléfonos al modelo en esta versión; los
  botones de WhatsApp y mail los resuelve el panel con el dato de la base después de aprobar.
- **Qué sale del sistema:** sin `equipo-agentes-ia`, nada: el equipo sólo lee y calcula. Con la ruta 1, al proveedor
  viaja lo que devuelven las herramientas, ya recortado y sin los datos de arriba. Con datos reales, sólo con la API
  paga, el consentimiento de MIA con el proveedor nombrado y los 30 casos (§12; `05` D1 y D5). El servicio sin cargo de
  Cloudflare no es parte de este equipo (§10).
- **Acciones de servidor:** cada una vuelve a pedir actor (`actorActual`, `gestion.server.ts:33-42`), módulo (`puede`,
  `:44-46`; `exigirEditar`, `:56-60`) e interruptor (`interruptoresDelNegocio`, `interruptores.server.ts:56-59`). Las
  que escriben miran además la vigencia dentro de su transacción (§12.1). Esconder el botón no protege
  (`gestion.server.ts:55`).
- **Bandeja de GSG (§4.4): la única lectura entre negocios de este diseño.** Va por el patrón que ya usa Soporte
  (`enElNegocio`, una transacción por negocio; sin rol que saltee RLS), con sesión de operador y la guardia por negocio
  como primera línea de cada acción. La lista no trae el texto del pedido; abrirlo y contestarlo dejan fila en el
  registro del negocio con el nombre del operador. El `tenantId` y el id del pedido que llegan del formulario se
  validan dentro de la transacción de ese negocio: un pedido de otro negocio da «no existe». Sólo contesta una persona
  (invariante de §4.4). Certificación adversarial obligatoria (`04`, tanda 1).
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
| Un pedido con guion: 6 pasos dentro del presupuesto, herramienta inválida, **el proveedor nunca se llama dentro de una transacción**, `leer` dentro de una transacción lanza; pausa o apagado entre dos pasos → no sale otra llamada, la respuesta no se guarda y el pedido queda «necesita una persona» | Unidad | `motor.test.ts` |
| Buzón, reglas puras con reloj inyectado: estados, plazo, presupuesto de un intento (termina 10 s antes del plazo), estado mostrado pasado el plazo, métricas calculadas sobre los pedidos, con abiertos y vencidos sin marcar adentro (tiempo, % dentro del objetivo, respondidos por una persona) | Puro | `buzon-core.test.ts` |
| Sin clave o sin `equipo-agentes-ia`: ninguna llamada de red; los pedidos de la lista se responden igual; el de texto libre nace `EN_BANDEJA`, con su plazo, y no se le agenda ningún proceso | Unidad | `sin-modelo.test.ts` |
| **Por la bandeja sólo contesta una persona:** `abrirEnTx` y `responderEnTx` se importan sólo desde la consola de la bandeja; ningún archivo de `src/app/api/` importa la bandeja; la bandeja no importa proveedor ni `ia.server`, ni usa `after(` ni `fetch(`; ningún `updateMany` del motor, del rescate ni del barrido nombra `EN_BANDEJA`. Probado contra código de ejemplo para que pueda fallar | Estático | `bandeja-solo-personas.test.ts` |
| Bandeja, con el rol sin bypass y dos negocios: la lista trae lo de cada negocio y no trae el texto; abrir deja `LECTURA_GSG` y responder deja `RESPUESTA_GSG`, las dos con `operator:<nombre>`; dos personas responden a la vez → una respuesta; el id de un pedido de otro negocio → «no existe»; `procesarPedido` y el rescate sobre un pedido `EN_BANDEJA` no lo toman; pasado su plazo sigue `EN_BANDEJA`; en pausa o apagado no se abre ni se responde; la respuesta cuenta en las métricas como «por una persona», con su tiempo | Postgres, carrera | `bandeja-postgres.test.ts` |
| `ctx.db` no escribe ni sale del negocio; dentro de una transacción lanza | Unidad | `solo-lectura.test.ts` |
| Lista blanca de imports y de escrituras; sin SQL crudo y sin `prisma-base` en el motor | Estático | `guardia-escrituras.test.ts` |
| Los 30 casos (10 normales, 12 trampa, 4 de memoria, 4 de falla) | Guion | `casos-administracion.test.ts` |
| Dos negocios, **rol sin bypass**: A ve lo propio (más de cero) y nada de B, en `ctx.db`, el buzón, el barrido, huella y ejecución; identificador ajeno → «no existe»; clave compuesta impide colgar de otro negocio; `UPDATE` y `DELETE` sobre `AgenteAccion` rechazados, también después de correr `0002_app_role.sql` dos veces; ese archivo corre sin error en una base sin la tabla | Postgres | `agentes-aislamiento-postgres.test.ts` |
| Rol que no ve todos los proyectos ni todas las columnas: no los recibe, y los totales se recalculan | Postgres | `agentes-permisos-postgres.test.ts` |
| Dos equipos en un negocio: cada persona ve sólo los puestos, pedidos, partes y registro de los suyos | Unidad | `equipos.test.ts` |
| Doble aprobación: una ejecución · dos «crear» a la vez: una propuesta · rehacer tras rechazo · FALLIDA no pisa una decisión ganadora · cuota cobrada en el medio → VENCIDA | Postgres, carrera | `propuestas-carrera-postgres.test.ts` |
| Cupos: N a la vez no pasan el tope; el cupo por persona no lo gasta otra persona; doble envío de un pedido con la misma clave → un pedido y un cupo; dos procesos sobre el mismo pedido → lo toma uno; pedido colgado → el rescate lo toma una sola vez; **el rescate de una persona no toma el pedido de otra del mismo negocio**; un pedido al que le quedan menos de 30 s no se relanza; sin vigencia al tomarlo → «necesita una persona»; pasado el plazo → «sin responder», sin más intentos; parte a pedido: el cupo es por persona; mismo compromiso dos veces → uno; dos barridos a la vez → un parte y un aviso | Postgres, carrera | `topes-carrera-postgres.test.ts` |
| Gasto: primera llamada del mes sin fila; N a la vez no pasan el tope; función cortada → esa reserva vence y se cobra una sola vez; una reserva nueva no corre el vencimiento de otra; un cierre tardío no toca la reserva de otro | Postgres, carrera | `gasto-carrera-postgres.test.ts` |
| Vigencia: en pausa o apagado no entra ningún pedido; pausa o apagado a mitad de un pedido → ninguna escritura posterior salvo el cierre de la reserva, el pedido como «necesita una persona» y el registro; decidir y pausar a la vez (tanda 2) → o decide antes o no decide | Postgres, carrera | `vigencia-carrera-postgres.test.ts` |
| Conciliación (tanda 4): dos movimientos a la misma cuota a la vez → uno gana; no regresión de la manual | Postgres, carrera | `conciliacion-carrera-postgres.test.ts` |
| Sin tablas: panel, acciones y barrido no rompen | Unidad | `estado-sin-migracion.test.ts` |
| Mismo número que Administración | Postgres | `cobranzas-mismo-numero-postgres.test.ts` |
| Los 30 casos contra el modelo real (no corre en CI; condición para prender, §12) | Manual, con gasto | comando de la tanda 5 |

Los tests de carrera se escriben **antes** de la certificación (norma de solidez de CI, punto 6).

## 15. Dónde se prueba: en producción, apagado para todos menos el negocio de la prueba

**Decisión del dueño (14/11/2026):** no hay vista previa en Vercel ni demostración levantada por una sesión. Se
construye el producto real y se prueba sobre lo real.

**Hecho confirmado (cierra `05` S15): MIA vive en producción, compartida con CH y los demás negocios.** Entra por
`mia-producciones.gsgapp.com.ar`, por el comodín `*.gsgapp.com.ar` del proyecto Vercel `erp-ch` (rama `main` del ERP),
y su negocio está en la rama `main` de Neon, la misma base de CH Estética. Fuente: ficha del cliente, Factory-GSG
`main`, `_accesos/clientes/mia-producciones.md` («verificado el 14/11/2026 contra Vercel» y «contra Neon», GSG-OPS-010),
leída de primera mano en esta corrección. La ficha anota el negocio como «provisionado el 02/11, sin activar». Dato de
la orquestadora: MIA empieza a usar el sistema el 18/11.

Qué implica:

1. **El código llega a todos los negocios de producción.** Va apagado por interruptor para todos (§12); con
   `equipo-agentes` apagado no hay app, ni ruta, ni barrido para ese negocio (`02` §4, criterio 1).
2. **La migración se aplica a la base que comparten todos.** Es aditiva (11 tablas nuevas y un `REVOKE` sobre una de
   ellas) y ningún otro negocio la usa, pero es **Gate 2: la decide el dueño, PR por PR**, con respaldo previo y con
   **ensayo en una copia** antes (una rama de Neon sacada de `main`: `prisma migrate deploy` ahí y comprobar tablas,
   políticas y `REVOKE`).
3. **Publicación por PR, CI y tanda.** La orquestadora recomienda que los agentes vayan en una tanda de publicación
   aparte.
4. **Las variables son del despliegue, no del negocio.** Por eso la clave es propia del equipo y la respuesta con IA
   se prende negocio por negocio (§10, §12).
5. Provisional a confirmar (`05`, S18): si `erp-ch` tiene cargada `MIGRATE_DATABASE_URL`. Si la tiene, el build de
   producción aplica la migración solo (`scripts/vercel-build.mjs:59-66`): publicar ese PR **es** aplicarla y ese push
   también es Gate 2.

Qué hace falta para la prueba (pasos y responsables en `04`, «Prueba sobre lo real»):

| # | Qué | De quién es |
|---|---|---|
| 1 | La migración ensayada en una copia y después aplicada a `main` de Neon, con respaldo (rotación de 4) | Dueño decide (Gate 2); la ejecuta el rol de operación |
| 2 | El código publicado en `erp-ch`, apagado | Orquestadora, con las reglas de publicación |
| 3 | El negocio de la prueba elegido (`05`, D15) | Dueño |
| 3b | Si eligió un negocio de prueba (opción A) y no existe uno de rubro productora (`05`, S22): darlo de alta en producción con el alta por comando (`npm run soporte:alta -- … --blueprint productora --por-apps --produccion`, `scripts/soporte/alta-negocio.mts:5-6`; con `--probar` primero, que no escribe) | Dueño decide (alta en la base de producción, con respaldo); la corre el rol de operación |
| 4 | Usuarios de prueba en ese negocio: uno Dirección (el dueño), uno Administración y uno Diseño, con verificación en dos pasos, obligatoria para esos roles en una productora (`README.md` de MIA) | GSG, por el alta de siempre; contraseña provisoria por mail aparte, con cambio obligatorio |
| 5 | Datos inventados cargados a mano en ese negocio. La siembra de la demo no sirve: se niega a correr fuera de una base local (`prisma/seed-mia-producciones.ts:29`) | Quien prueba, o un rol de GSG |
| 6 | `equipo-agentes` prendido sólo en ese negocio, desde la consola | GSG (operador) |
| 7 | **Ningún «cerebro» para la primera parte de la prueba:** se prueba lo que calcula el código (§10.1) y la bandeja de GSG (§4.4), con una persona de GSG con sesión de operador. Para responder texto libre con IA: la clave cargada y `equipo-agentes-ia` prendido en ese negocio (`05`, D4-bis) | Dueño |

**Reglas de datos.**
- Frase del dueño (14/11): «no vamos a utilizar datos reales ni tampoco interactuar con el equipo real de Mía antes de
  utilizar la API. Es decir, cuando el equipo de Mía aborde el sistema con datos reales, vamos a utilizar la API.» Por
  lo tanto la prueba de la tanda 1 la hace **el dueño, con datos inventados**. Mariana y el equipo de MIA entran cuando
  ese negocio pase a la API, con las condiciones de §12. (El equipo de Dirección, cuando exista, lo prueba Dirección.)
- Si el negocio de MIA ya tiene datos reales cuando la tanda 1 esté publicada (empieza a usarse el 18/11), la prueba con
  datos inventados necesita otro negocio: es la decisión D15 de `05`.
- Lo que la prueba deja en las tablas del equipo (pedidos y sus respuestas) queda en el negocio de la prueba. El registro no se
  borra (§3 y §9): el informe mensual cuenta desde la fecha de salida en vivo.
- **La demostración en memoria queda como herramienta de quien construye**, para su QA clic por clic
  (`node scripts/proyectos/demo-local.mjs --start`, `demo-local.mjs:5-11`, puerto 3218), con el interruptor prendido en
  su siembra (§12) y, para ver un pedido de texto libre respondido, con el proveedor de guion. No es el ambiente de prueba del dueño.
  Prueba el producto, **no el aislamiento**: ahí toda conexión es superusuario; el aislamiento lo prueban los tests de
  Postgres con el rol sin bypass (§14).

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
   Es reversible y entra por PR; el máximo que permite el plan no está leído en la fuente (`05`, S17).
8. Probar sobre lo real quiere decir que el código y la migración llegan a la base y al despliegue de producción, que
   comparten todos los negocios, antes de que el dueño lo vea andar (§15). Lo que lo acota: interruptor apagado de
   fábrica, migración sólo aditiva y ensayada en una copia, código que tolera la falta de tablas, y CI sin rojos nuevos
   antes de publicar.
9. El rescate depende de que quien dejó el pedido tenga su buzón abierto: si la función se corta y no lo tiene, el
   pedido queda «sin responder a tiempo» (§4.3). Un despertador por minuto es decisión de plan y de gasto.
10. El adaptador de la API no se puede probar contra el servicio real sin una clave: en CI corre contra respuestas
    armadas según la documentación (`04`, brief 1C).
11. La bandeja de GSG (§4.4) promete lo que una persona pueda cumplir: sin aviso automático y sin guardia, casi todos
    sus pedidos van a quedar fuera de los 3 minutos, y así se van a medir. Y el código no distingue a una persona de un
    robot que use su sesión: eso es regla de trabajo.
9. Defensa de base que queda para después: un rol de base de sólo lectura para la fase 1. Es un cambio de permisos en
   Neon (decisión del dueño); hoy la lectura sola se garantiza en el código (§6.1).
10. MIA empieza a usar el sistema el 18/11 en el mismo negocio donde se pensaba probar. Si entran datos reales antes de
    que la tanda 1 esté publicada, la prueba con datos inventados necesita otro negocio (`05`, D15).
11. El adaptador de la API se construye sin clave: se prueba contra respuestas armadas según la documentación oficial.
    Su primera llamada real ocurre en la prueba con clave y puede fallar ahí; se corrige en ese momento.
12. Que `skipDuplicates` cubra los únicos parciales escritos a mano no está probado: lo confirma el primer test de
    carrera (`05`, S20). Si no los cubriera, esas altas pasan a un `updateMany` condicional previo, sin SQL crudo.
13. Prender `equipo-agentes-ia` es un clic del operador: que antes estén el consentimiento y los 30 casos es un control
    de procedimiento, no de código (§12).
14. La vigencia se lee, no se bloquea (salvo al decidir una propuesta): queda una ventana de milisegundos y una llamada
    al modelo ya salida termina y se cobra (§12.1).
15. El objetivo de 3 minutos se sostiene sin un despertador por minuto: el pedido se procesa con `after()` en el mismo
    pedido web y lo rescata el sondeo del buzón (§4.3). Si la función se corta y nadie tiene el buzón abierto, ese
    pedido termina «sin responder a tiempo». El comportamiento de `after` en el plan de Vercel de `erp-ch` (cuánto dura
    de verdad) lo confirma la primera prueba en producción (`05`, S17).
