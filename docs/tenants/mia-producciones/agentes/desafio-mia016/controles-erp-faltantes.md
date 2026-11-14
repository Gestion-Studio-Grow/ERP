# Equipo de agentes de Administración · MIA — 08 · Controles del ERP que faltan antes de dejar escribir a los agentes

Auditoría de controles (plata y datos), 14/11/2026, rama `agentes/diseno-ejecucion`. Sólo lectura de código y del
esquema del repo: no se consultó Neon ni se tocó código. Las citas `archivo:línea` son del árbol de esa rama.

**Pregunta:** los agentes de Administración van a registrar cobros, confirmar conciliaciones, cargar comprobantes en
borrador y registrar promesas de pago por su cuenta, dentro de una autorización firmada y con topes. Una persona sigue
a cargo de ARCA, pagar, anular, CBU, borrar y todo lo que pase el tope. ¿Qué controles tiene que tener el ERP antes?

## 0. Qué es un «asiento» hoy en MIA (aclaración que cambia el análisis)

- MIA no registra asientos de partida doble. La plata de Administración vive en `ProyectoCuota` (lo que se espera
  cobrar o pagar, `prisma/schema.prisma:3838`), `ProyectoPago` (el cobro, `:3653`), `ProyectoGasto` (el costo real,
  `:3673`), `ProyectoMovBanco` (la línea del extracto, `:4071`) y `CashMovement` (el renglón del libro de caja, `:1686`).
  En este documento, «asiento» quiere decir el `CashMovement` que acompaña a cada cobro o pago.
- El módulo contable formal (`Asiento`/`AsientoLinea`/`Ejercicio`, `schema.prisma:4451-4508`, motor en
  `src/lib/contabilidad/repo.ts:296-370`) existe y está bien armado (partida doble, número correlativo con candado,
  contraasiento con único parcial), pero **ningún archivo de `src/` llama a `registrarAsiento`, `confirmarAsiento` ni
  `anularAsiento`**: los cobros y pagos de proyectos no generan asientos contables. Si algún día los agentes tienen
  que «confirmar asientos» contables, primero hay que conectar ese puente (ver g8).
- Todas las escrituras de plata son acciones de servidor que piden la sesión de una persona y reciben un `FormData`
  (`exigirEditar` → `actorActual` → `requireCapability`, `src/lib/proyectos/gestion.server.ts:33-60`). El agente no
  tiene sesión (`03` §5). Eso, por sí solo, ya es un hueco bloqueante (g1).

Estados: **existe** · **parcial** · **no existe**.

---

## a) Cierre mensual de período

**Estado: parcial (existe para la caja del mostrador; no alcanza a lo que tocan los agentes).**

Evidencia:
- El ejercicio contable sólo se cierra por año: `Ejercicio.estado` ABIERTO·CERRADO, sin período mensual
  (`schema.prisma:4451-4464`); el motor rechaza fechas fuera de un ejercicio abierto (`src/lib/contabilidad/asiento.ts:126-140`).
  Como el motor no está cableado (§0), hoy no frena nada.
- «Congelar el mes» existe (`src/lib/cierre-mes/cierre-mes.ts:17-29`, `acciones.ts:77`), pero es una fila de
  `AuditLog`, y su garantía se apoya en otro control: el libro de caja rechaza lo fechado en un día cerrado
  (`src/lib/caja/frontera-cierre.ts:48-89`). Lo usan el libro, los pedidos y el repositorio de cobros
  (`src/lib/settlement/collection-repo.ts:165`).
- **El módulo de proyectos no mira la frontera:** `grep frontera src/lib/proyectos` no devuelve nada. Cobrar
  (`acciones.ts:212-228`), marcar una cuota (`acciones-ficha.ts:793-812`, `acciones-empresa.ts:95-112`) y anular
  (`acciones-ficha.ts:913-918`) escriben `CashMovement` con `occurredAt` = ahora, aunque el día de hoy ya esté cerrado.
- Las fechas que sí se pueden elegir no tienen ningún control: `ProyectoGasto.fecha` acepta cualquier día
  (`acciones.ts:290`); el extracto importa líneas de cualquier fecha (`acciones-empresa.ts:216-220`); conciliar no mira la fecha
  del movimiento (`:228-244`).

Riesgo con un agente: carga un comprobante con fecha de un mes ya congelado y entregado a la contadora, o importa y
concilia líneas viejas, y el paquete del mes cambia sin que nadie lo reabra. Un cobro asentado después del cierre del
día descuadra el arqueo de ese día.

Qué agregar (aditivo):
1. `periodoAbiertoTx(tx, tenantId, fecha)` en `src/lib/caja/` o en `src/lib/cierre-mes/`: falso si la fecha cae en un mes congelado
   (última fila `CierreMes` de ese mes = congelar) o en un día cerrado (`lastClosedDayTx`). Sin migración: lee lo que
   ya existe.
2. Llamarla dentro de la transacción de toda escritura que use el agente (cobro, marcar cuota, conciliar, alta de
   comprobante, importación). Si el período está cerrado, el agente **deriva** a una persona: nunca reabre.
3. Fase 2 (con migración, Gate 2): tabla `PeriodoCierre(tenantId, periodo AAAA-MM, estado, cerradoPor, cerradoEl)`
   con único (`tenantId`,`periodo`), para dejar de inferir el estado de `AuditLog` (que además se purga, ver f).

## b) Documento fuente obligatorio

**Estado: no existe para cobros ni pagos; parcial para rendiciones.**

Evidencia:
- `registrarCobro` crea un `ProyectoPago` sólo con medio, monto y nota (`acciones.ts:212`): no lo ata a un movimiento
  del banco, a un comprobante ni a una cuota.
- El vínculo entre una cuota y lo que se cobró o pagó por ella **se guarda como texto en el registro de cambios**
  (`registrarCambio` con `campo: "Asiento"`, `acciones-ficha.ts:819`) y se busca por igualdad de texto para reabrir la cuota
  (`acciones-ficha.ts:892-893`). `ProyectoCambio` es una tabla de historial, editable por la app (ver f).
- El `CashMovement` de una cuota de la empresa no tiene clave foránea: se identifica por `createdBy = marca` y se
  busca por ese texto para anularlo (`acciones-empresa.ts:110`, `:132`).
- Conciliar y marcar pagado son dos decisiones separadas (`acciones-empresa.ts:227`): se puede marcar cobrada una cuota sin
  ningún movimiento del banco detrás.
- `ProyectoGasto.comprobante` es un texto libre de 60 caracteres (`schema.prisma:3686`, `acciones.ts:291`): sin
  tipo, punto de venta, número ni CUIT del emisor.
- Lo que sí está bien: la rendición exige el comprobante como `ProyectoArchivo` con clave foránea compuesta
  (`schema.prisma:4143-4144`), y `CashMovement` tiene claves foráneas a `proyectoPagoId`/`proyectoGastoId` (`:1743-1747`).

Riesgo con un agente: es exactamente la falla medida en `analisis-mercado/2026-11-14-linea-agentes-ia-para-pymes.md`
§14 (AccountingBench): el agente registra un cobro «que cierra» sin una transferencia real detrás, y nada lo frena.

Qué agregar (aditivo):
1. Regla de código para el agente (sin migración): **un cobro del agente sólo nace de un `ProyectoMovBanco` concreto**,
   con importe y sentido iguales en centavos enteros, y en la misma transacción concilia el movimiento y marca la
   cuota. Sin movimiento, el agente no cobra: propone.
2. Migración aditiva (Gate 2): `ProyectoPago.movBancoId` y `ProyectoCuota.pagoId`/`gastoId` (columnas que pueden
   faltar), con claves foráneas compuestas (`id`,`tenantId`), para reemplazar el vínculo por texto de
   `acciones-ficha.ts:819/893`. El código sigue leyendo el vínculo viejo si la columna no existe.
3. Comprobante de proveedor estructurado (tipo, punto de venta, número, CUIT, fecha, total en centavos) en una tabla
   nueva `ComprobanteBorrador` o dentro de `AgentePropuesta.argumentos`; ver g6.

## c) Tope de aprobación por monto y separación de funciones

**Estado: no existe tope de aprobación; separación de funciones sólo en rendiciones.**

Evidencia:
- El único «tope» de plata del módulo es de negocio, no de autorización: no cobrar más de lo que falta del presupuesto
  aprobado (`src/lib/proyectos/cobranza-core.ts:353-355`), y **no actúa si no hay presupuesto aprobado** (`c.total > 0`).
- `MAXIMO_CENTAVOS` es el máximo de BIGINT, no un tope (`src/lib/contabilidad/asiento.ts:100`). La capacidad
  `aprobaciones` de `ConfigContable` está declarada (`src/lib/contabilidad/config.ts:26`) y no la usa nadie.
- Separación de funciones: sólo `rendiciones/aprobacion.ts:19-21` («nadie aprueba lo propio»). En el resto, quien
  carga una cuota la puede marcar cobrada, conciliar y anular; los permisos son por módulo y rol
  (`gestion.server.ts:44-60`), sin distinguir proponer de aprobar.
- El motor de agentes diseñado (`03` §6) tiene cupos por cantidad (`AgenteContador`), no por monto.

Riesgo con un agente: dentro de su rol `ADMINISTRACION` (`03` §5) puede ejecutar cualquier importe, y además ese rol
**aprueba rendiciones** (`rendiciones/aprobacion.ts:8`): el agente podría aprobar la rendición que otro agente o una persona
propuso, o una que él mismo armó con otro actor.

Qué agregar:
1. En `permisos-core.ts` (puro, `03` §6): `topeMonto[tarea]` en centavos, por operación y por día, leído de la
   autorización firmada (`AgenteAjuste` o `AgentePuesto.niveles`, sin tabla nueva). Por encima → `proponer`. El monto
   del día se consume con el mismo `tomarCupo` atómico, con `tope = 'monto-dia'` y `n` en centavos (provisional a
   confirmar que `n` admita centavos: hoy está pensado como contador).
2. Separación de funciones en el motor: una `AgentePropuesta` no la puede decidir un actor `agente:*` ni la persona
   que dejó el pedido que la originó, si el monto supera el tope de «cuatro ojos» (provisional: igual al tope del
   agente).
3. Sacar a `agente:*` de los aprobadores: `motivoNoAprueba` rechaza un actor agente (`rendiciones/aprobacion.ts:19`), y el
   `ActorAgente` nunca recibe los módulos `liquidaciones` ni `rendiciones` en modo editar.

## d) Idempotencia en las escrituras de plata

**Estado: parcial. Marcar y anular son idempotentes; cobrar, conciliar e importar, no.**

| Escritura | Defensa hoy | Hueco | Evidencia |
|---|---|---|---|
| Marcar cuota de proyecto | `updateMany` con `pagadoEl: null` + candado de la cobranza | — | `acciones-ficha.ts:785`, `:793` |
| Marcar cuota de empresa | `updateMany` con `pagadoEl: null` | — | `acciones-empresa.ts:95` |
| Pagar gasto | `updateMany` con `pagadoEl: null` | — | `acciones.ts:320` |
| Asiento de caja por cobro o gasto | único (`tenantId`,`proyectoPagoId`,`type`) y (`…proyectoGastoId…`) | El de cuota de empresa no tiene FK ni único (sólo `createdBy`) | `schema.prisma:1779-1780`; `acciones-empresa.ts:110` |
| **Registrar cobro** | Ninguna: cada envío crea un `ProyectoPago` nuevo | Doble envío = dos cobros. El tope de presupuesto lo frena sólo si hay presupuesto aprobado y si el segundo lo pasa | `acciones.ts:212`; `cobranza-core.ts:354` |
| **Conciliar** | Comprueba y después actualiza, fuera de transacción; `cuotaId` no es único | Dos movimientos atados a la misma cuota a la vez | `acciones-empresa.ts:238-239`; `schema.prisma:4082`; ya anotado en `03` §7.1 |
| Desconciliar | Sin condición | Desconcilia lo que otra persona acaba de conciliar | `acciones-empresa.ts:251` |
| **Importar extracto** | Deduplica en memoria contra lo leído antes; sin único ni transacción | Dos importaciones a la vez duplican las líneas y el agente concilia movimientos que no existen | `acciones-empresa.ts:216-220`; `empresa-core.ts:242-251` |
| Asiento contable | Número con candado; contraasiento con único parcial | Sin único por (`origenTipo`,`origenId`): el mismo cobro se puede asentar dos veces | `repo.ts:247-252`; migración `20261104122000_contabilidad_ola1/migration.sql:191` |

Hay precedente en el propio repo: `Collection` tiene `@@unique([tenantId, idempotencyKey])` (`schema.prisma:2047`).

Qué agregar:
1. Sin migración (bloquea la conciliación del agente): `conciliarEnTx` como dice `03` §7.1 (candado `FOR UPDATE` sobre la
   cuota, con `AND "tenantId"` a mano, `src/lib/rls.ts:105-112`); `desconciliar` con `updateMany … where cuotaId = <la que se ve>`.
2. Sin migración: el agente cobra siempre a través de la propuesta, con su único parcial
   (`tenantId`,`herramienta`,`entidad`,`entidadId`) WHERE PENDIENTE (`03` §3), y la ejecución usa `updateMany` condicional
   (`estado = PENDIENTE` → `EJECUTADA`) antes de escribir la plata, en la misma transacción.
3. Migración aditiva (Gate 2): `ProyectoPago.clave` + único parcial (`tenantId`,`clave`); único parcial
   (`tenantId`,`cuotaId`) WHERE `cuotaId IS NOT NULL` en `ProyectoMovBanco` (antes, contar duplicados en una copia: D13);
   `ProyectoMovBanco.huella` = hash(cuenta, fecha, importe en centavos, descripción, ordinal) con único, para la importación;
   único parcial (`tenantId`,`origenTipo`,`origenId`) en `Asiento` WHERE `anulaAsientoId IS NULL AND origenTipo <> 'MANUAL'`.
   Altas con `createMany({ skipDuplicates: true })` (`03` §3).

## e) Reversión y anulación con asiento inverso, sin borrado

**Estado: existe (bien resuelto), con dos salvedades.**

Evidencia:
- Anular un cobro o un gasto marca `anuladoEl`/`anuladoPor` y escribe el `CashMovement` inverso con fecha de hoy
  (`acciones-ficha.ts:902-942`, `:944-970`); la cuota de empresa, igual (`acciones-empresa.ts:123-153`). La condición
  `anuladoEl: null` la hace idempotente.
- El motor contable anula con contraasiento confirmado y único parcial (`repo.ts:332-370`).
- No hay borrado físico de plata en `src/lib/proyectos` (sólo se borra una liquidación en `BORRADOR`, `acciones-empresa.ts:486`).

Salvedades:
- Reabrir la cuota depende del vínculo por texto en `ProyectoCambio` (b). Si esa fila falta, la anulación devuelve la
  plata pero la cuota queda pagada.
- `ProyectoMovBanco` cae en cascada si se borra la cuenta (`schema.prisma:4075`); hoy no hay acción que borre cuentas,
  pero tampoco una restricción.

Para los agentes: anular queda **siempre** en manos de una persona (autorización firmada). No hace falta construir nada
para la tanda; sí, que ninguna herramienta del agente llame a `anular*` (test de la lista de herramientas).

## f) Registro de auditoría con actor, y RLS/tenantId en las tablas de plata

**Estado: parcial.**

Evidencia, aislamiento:
- Todas las tablas de plata llevan `tenantId`. RLS se aplica por datos a toda tabla con `tenantId`
  (`prisma/rls/0001_enable_rls.sql:21-28`), y además las migraciones del módulo lo encienden en `ProyectoPago`,
  `ProyectoCuota`, `ProyectoMovBanco`, `ProyectoGasto`, `ProyectoCambio` y en las contables. El aislamiento de verdad depende de que la app
  conecte como `app_rls` (`0001_enable_rls.sql:30-38`): verificarlo en la tanda de publicación, no se midió acá.
- Varias escrituras corren con `prisma` fuera de `tenantTransaction` (conciliar, desconciliar, importar, saldo:
  `acciones-empresa.ts:200`, `:220`, `:239`, `:251`): ahí sólo protege el `where tenantId` del código; RLS sin el GUC no ve nada (`rls.ts:105-112`).

Evidencia, actor:
- `AuditLog.actor` es texto (`schema.prisma:1054`); `formatActor` conoce `user:`, `operator:`, `cliente:`, `system`
  y no conoce `agente:` (`src/lib/audit-actor.ts:9-31`): mostraría el texto crudo.
- `auditAdmin` saca el actor de la sesión (`src/lib/audit-core.ts:85-86`): sin sesión escribe `"admin"`. Se llama
  **después** de la transacción y `audit` se traga el error (`audit-core.ts:65-71`): puede moverse plata sin fila de auditoría.
- `ProyectoCambio.autor` y `CashMovement.createdBy` son nombres sueltos (`a.nombre`, `user.name`,
  `acciones-ficha.ts:803`; `schema.prisma:4253`, `:1756`): no distinguen persona de agente.
- `app_rls` tiene `UPDATE` y `DELETE` sobre todas las tablas (`prisma/rls/0002_app_role.sql:57-64`), incluidas `AuditLog` y
  `ProyectoCambio`. El diseño sólo se los quita a `AgenteAccion` (`03` §3).
- `AuditLog` se purga a los 18 meses (`src/lib/audit-retention.ts:70`): menos que los 10 años de conservación de registros
  contables (Código Civil y Comercial, art. 328; provisional a confirmar con la contadora).

Qué agregar:
1. Sin migración: `actor` del agente = `agente:<puesto>` (como dice `03` §5), con `autorizadoPor: user:<id>` en `changes`
   cuando ejecuta una propuesta aprobada; `formatActor` suma `agente:` → «Agente · <puesto>».
2. Sin migración: para las escrituras del agente, la fila de `AgenteAccion` (EJECUCION) se escribe **dentro** de la
   misma transacción que la plata (`03` §9 ya la hace la única puerta); si falla, se deshace todo.
3. Las funciones `…EnTx` (g1) reciben el actor y lo escriben en `autor`/`createdBy` con prefijo (`user:`/`agente:`).
4. Migración aditiva (Gate 2, aparte): `REVOKE UPDATE, DELETE` de `ProyectoCambio` para `app_rls` (con el mismo `DO`
   que comprueba el rol, `03` §3). `AuditLog` no se puede revocar mientras la purga corra con ese rol: exentar
   `entity` de plata de la purga o mover la retención a 10 años (decisión del dueño).

## g) Otros huecos bloqueantes

**g1. No hay capa de servicio con actor explícito (bloqueante para toda escritura del agente).** Cada escritura vive
en una acción `"use server"` atada a la sesión y al `FormData` (`acciones.ts:192-193`, `acciones-ficha.ts:748-760`,
`acciones-empresa.ts:80-81`). El agente no puede llamarlas sin inventar una sesión, que es justo lo que `03` §5
prohíbe. Agregar: extraer `registrarCobroEnTx`, `marcarCuotaEnTx`, `conciliarEnTx`, `crearGastoBorradorEnTx`
`(tx, actor, entrada)` puras de permisos, con la acción manual llamándolas; el permiso se decide afuera (persona:
`exigirEditar`; agente: `decidirLlamada`). Test de no regresión de la acción manual.

**g2. Plata en `Float`.** `ProyectoPago.monto`, `ProyectoCuota.monto`, `ProyectoMovBanco.importe`, `CashMovement.amount`
(`schema.prisma:3660`, `:3852`, `:4079`, `:1699`); comparaciones con tolerancia (`acciones-ficha.ts:788`, `cobranza-core.ts:354`).
Agregar: el agente compara y suma sólo en centavos enteros (`Math.round(x*100)`), helper único en `src/lib/dinero`.
Columnas `*Centavos` quedan como deuda (migración no aditiva de hecho: duplicaría la verdad).

**g3. Fecha valor.** Marcar y cobrar graban `new Date()` (`acciones-empresa.ts:95`, `acciones-ficha.ts:793`): un cobro
conciliado contra una transferencia de hace tres días queda con fecha de hoy. Agregar: `fechaValor` opcional en
`…EnTx`, igual a la fecha del movimiento del banco, controlada por `periodoAbiertoTx` (a).

**g4. Saldo bancario editable a mano y no derivado.** `guardarSaldo` pisa el saldo sin movimiento
(`acciones-empresa.ts:194-204`) y marcar suma con `increment` (`:99`). Agregar: el agente no tiene esa herramienta
(test de la lista); el parte muestra saldo del sistema contra saldo del extracto como alerta, no como dato.

**g5. Promesas de pago: no hay modelo, y el atajo es peligroso.** No hay tabla de promesas (`grep -i promesa
prisma/schema.prisma` vacío). El atajo sería mover el vencimiento de la cuota (`guardarDatoCuota`, `acciones-empresa.ts:161-167`),
que **esconde la mora**. Agregar: la promesa es un `AgenteCompromiso` (`03` §3, con su único parcial) ligado a
`entidad = ProyectoCuota`; el agente nunca escribe `venceEl`.

**g6. Comprobante «en borrador» no existe.** Un `ProyectoGasto` nace vivo: suma al costo real y a la deuda con el
proveedor desde el alta (`acciones.ts:281-296`), y no tiene estado. Tampoco hay control de duplicado de factura de
proveedor. Agregar: el borrador del agente vive en `AgentePropuesta` (argumentos estructurados, `03` §3) y sólo al
aprobar se crea el `ProyectoGasto`; único de factura de proveedor (`tenantId`,`supplierId`,`tipo`,`ptoVta`,`numero`) en la
tabla de comprobantes que se diseñe en la tanda 6 (migración, Gate 2).

**g7. La conciliación no compara el importe.** Sólo mira el sentido (`acciones-empresa.ts:237`). Para el agente, el
importe exacto en centavos y un único candidato son obligatorios (`04`, brief 4B); la acción manual puede seguir como está.

**g8. Contabilidad formal desconectada.** Si la autorización firmada habla de «confirmar asientos» en sentido contable,
hoy no hay qué confirmar (§0). Conectar el puente cobro/pago → `registrarAsiento` es un frente propio (con cuentas por
rol, `contabilidad/roles.ts`), fuera de estas tandas.

---

## Tabla priorizada

«Antes de» = la tanda del plan (`04`) en la que el agente empezaría a hacer esa escritura en nivel 2 (ejecuta solo).
Cobrar y registrar promesas no figuran como escritura en `04`: se ubican donde caen (provisional a confirmar al
replanificar).

| # | Control | Estado | Bloquea antes de | Migración |
|---|---|---|---|---|
| 1 | g1 · Funciones `…EnTx` con actor explícito | No existe | Cualquier escritura del agente (tanda 2, al ejecutar una propuesta) | No |
| 2 | f · Actor `agente:` + registro dentro de la misma transacción | Parcial | Cualquier escritura (tanda 2) | No |
| 3 | c · Tope por monto (operación y día) + cuatro ojos + agente fuera de los aprobadores | No existe | Cualquier escritura (tanda 2) | No |
| 4 | a · `periodoAbiertoTx` (mes congelado y día cerrado) en las escrituras del agente | Parcial | Cualquier escritura (tanda 2) | No |
| 5 | d · `conciliarEnTx` con candado + desconciliar condicional + importe exacto (g7) | No existe | Tanda 4 (conciliación) | No |
| 6 | b · Cobro del agente sólo desde un movimiento del banco, en una transacción | No existe | El cobro del agente (tanda 4, con la conciliación) | No |
| 7 | d · Ejecución de propuesta condicional (PENDIENTE → EJECUTADA) antes de escribir plata | Diseñado (`03` §3), sin construir | Tanda 2 | Va en la de agentes |
| 8 | g5 · Promesa = `AgenteCompromiso`; el agente no escribe `venceEl` | No existe | Tanda 3 | Va en la de agentes |
| 9 | g6 · Comprobante en borrador dentro de la propuesta | No existe | Tanda 6 | Va en la de agentes |
| 10 | g2/g3 · Centavos enteros y fecha valor en el borde del agente | No existe | Tanda 4 | No |
| 11 | d · Únicos: `ProyectoPago.clave`, `cuotaId` en `ProyectoMovBanco`, huella del extracto, origen del `Asiento` | No existe | Prender cobro y conciliación con datos reales | Sí (Gate 2, ensayo en copia, D13) |
| 12 | b · FKs `movBancoId`/`pagoId`/`gastoId` en lugar del vínculo por texto | No existe | Prender con datos reales | Sí (Gate 2) |
| 13 | f · `REVOKE UPDATE, DELETE` de `ProyectoCambio`; retención de `AuditLog` de plata | No existe | Prender con datos reales | Sí (Gate 2) + decisión del dueño |

Los ítems 1 a 10 son código, reversibles y sin migración: entran en las tandas. Los 11 a 13 tocan tablas existentes:
se escriben aditivos, sin aplicar, con el código tolerando su ausencia, y se elevan al dueño (Gate 2).

## Deuda anotada

- Plata en `Float` en todo el módulo de proyectos (g2): pasar a centavos es una migración de datos, no aditiva.
- Período mensual inferido de `AuditLog` en vez de tabla propia (a.3).
- Vínculo cuota ↔ cobro o gasto guardado como texto en `ProyectoCambio` (b), y `CashMovement` de cuota de empresa sin FK.
- Escrituras de Bancos fuera de `tenantTransaction` (f): hoy sin fuga, pero sólo con una de las capas.
- Saldo bancario editable a mano (g4).
- Retención de 18 meses de `AuditLog` contra la conservación legal (f); confirmar con la contadora.
- Motor contable sin conectar a la operación (§0, g8).
- No verificado acá (sin Neon): si producción conecta como `app_rls`, y si `20261104122000_contabilidad_ola1` y
  `20261101150000_proyecto_gestion_eventos` están aplicadas.
