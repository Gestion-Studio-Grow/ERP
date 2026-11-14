# Equipo de agentes de Administración · MIA — 03 · Especificación técnica

> Diseño del 14/11/2026. Nada construido ni aplicado. Las migraciones se **escriben sin aplicar** (Gate 2) y el
> código tolera su ausencia. Sin dependencias nuevas.

## 1. Principios que mandan sobre el resto

1. Los límites viven en el código. Las instrucciones del modelo sólo describen el trabajo.
2. El modelo nunca recibe ni devuelve `tenantId`, importes para ejecutar ni permisos: sólo identificadores que el
   código valida contra el negocio.
3. Un solo motor para todos los negocios (`src/lib/agentes/`); lo propio de cada rubro son las herramientas.
4. Todo es apagable: interruptor por negocio (lo prende GSG), pausa por puesto (la maneja el cliente).
5. Memoria y registro en tablas propias con RLS: no dependen del proveedor de IA.

## 2. Capas y archivos nuevos

```
src/lib/agentes/                      ← motor común, sin nada de MIA ni de «proyectos»
  tipos.ts                puro   Puesto, Tarea, Nivel, Herramienta, Contexto, Resultado, Origen
  permisos-core.ts        puro   nivelEfectivo(), decidirLlamada(), topes y su conteo
  cifras-core.ts          puro   control de cifras de la respuesta contra lo leído
  gasto-core.ts           puro   costo de una llamada, saldo del mes, decisión «alcanza / no alcanza»
  agenda-core.ts          puro   qué compromisos tocan hoy (con atraso), estados
  respaldo-core.ts        puro   respuestas por plantilla cuando no hay IA
  proveedor.ts            puro   interfaz ProveedorIA + proveedor de guion (tests y demo)
  proveedor-claude.server.ts     adaptador a la API de mensajes con herramientas
  proveedor-esquema.server.ts    adaptador para modelos sin herramientas nativas (emula con JSON por esquema)
  motor.server.ts                la vuelta del agente (máx. 6 pasos), único que llama al proveedor
  memoria.server.ts              historial, compromisos, cuaderno (lecturas y escrituras)
  propuestas.server.ts           crear, decidir y ejecutar propuestas (transacción y huella)
  registro.server.ts             una fila por acción; nunca se edita ni se borra
  gasto.server.ts                reserva y cierre del gasto del mes
  estado.server.ts               interruptor del negocio, pausa por puesto, ¿están las tablas?
  barrido.server.ts              lo que corre la tarea diaria, negocio por negocio
  puestos/administracion.ts      catálogo: los 5 puestos, sus tareas, niveles iniciales y techos
src/lib/proyectos/agentes/            ← herramientas de MIA (rubro productora)
  actor-agente.server.ts         arma el actor del agente (ver §5)
  herramientas-cobranzas.server.ts · -pagos · -bancos · -coordinacion · -comprobantes
  acciones-equipo.ts      "use server": conversar, decidir propuesta, agenda, cuaderno, pausar
src/app/admin/(dashboard)/proyectos/mi-equipo/   page.tsx + _hoy · _conversar · _aprobar · _agenda · _cuaderno · _registro · _ajustes
```

Se tocan (poco) archivos existentes: `gestion-core.ts:616-631` (módulo nuevo `agentes`), `:645-651` (permiso de
fábrica: Administración `E`, el resto `N`), `:675-684` y `:704-712` (app `gestion-mi-equipo` en la barra de
Dirección y Administración); `src/apps/catalogo/comercial.ts` (alta de la app junto a `gestion-agentes`, `:302`);
`src/cambios/interruptores.ts:66` (interruptor `equipo-agentes`); `src/app/api/cron/reminders/route.ts:31-37`
(sumar el barrido, mismo patrón); `ia.server.ts` **no se modifica**: el motor nuevo usa sus propios adaptadores y
los 7 agentes actuales siguen igual.

**Equipo de Ale:** otro archivo en `puestos/` y otra carpeta de herramientas en el módulo de su rubro. El motor,
las tablas y el panel no cambian (el panel recibe el catálogo de puestos por parámetro).

## 3. Modelo de datos (una migración aditiva, sin aplicar)

Nombre propuesto: `prisma/migrations/20261115120000_agentes_base/` (**verificar colisión de timestamp** contra las
ramas abiertas antes de escribirla; la última en este árbol es `20261110170000_tenant_cuit_verificado`). Sólo
`CREATE TABLE` e índices: no toca tablas existentes, no agrega columnas a ninguna, no usa enums (texto validado en
código, como `SupportTicket`). Cada tabla lleva `tenantId` y la política `tenant_isolation`, copiada del patrón de
`prisma/migrations/20261106120000_support_ticket/migration.sql:54-58`. Plata en centavos enteros o micro-dólares
enteros, nunca `Float`.

| Tabla | Campos principales | Notas |
|---|---|---|
| `AgentePuesto` | `tenantId`, `puesto` (texto del catálogo), `estado` ACTIVO·PAUSADO, `pausadoPor`, `pausadoEl`, `niveles` Json, `updatedAt` · único (`tenantId`,`puesto`) | Sin fila = activo con niveles iniciales. `niveles` nunca supera el techo del código |
| `AgenteConversacion` | `id`, `tenantId`, `puesto`, `userId`, `titulo`, `origen` PANEL·TAREA, `createdAt`, `cerradaEl` | Memoria 1 |
| `AgenteMensaje` | `id`, `tenantId`, `conversacionId`, `rol` user·assistant·herramienta, `texto`, `origenes` Json, `createdAt` · índice (`tenantId`,`conversacionId`,`createdAt`) | El historial deja de vivir en el navegador (`diseno-core.ts:362`) |
| `AgenteCompromiso` | `id`, `tenantId`, `puesto`, `texto`, `fecha` (día), `entidad`, `entidadId`, `estado` ABIERTO·CUMPLIDO·ROTO·CANCELADO, `creadoPor`, `revisadoEl`, `cerradoEl` · índice (`tenantId`,`estado`,`fecha`) | Memoria 2. `revisadoEl` evita levantarlo dos veces el mismo día |
| `AgenteNota` | `id`, `tenantId`, `puesto`, `texto` (≤ 500), `activa`, `autor`, `createdAt`, `updatedAt` | Memoria 3. Hasta 40 activas por puesto |
| `AgentePropuesta` | `id`, `tenantId`, `puesto`, `tarea`, `herramienta`, `argumentos` Json, `resumen` Json (datos del sistema para la tarjeta), `texto` (lo redactado), `huella`, `clave`, `estado`, `venceEl`, `decididaPor`, `decididaEl`, `resultado` Json · único (`tenantId`,`clave`) | `clave` = herramienta + entidad + día: no hay dos propuestas iguales abiertas |
| `AgenteAccion` | `id`, `tenantId`, `puesto`, `tipo` LECTURA·PROPUESTA·DECISION·EJECUCION·DERIVACION·TOPE·RECHAZO·ERROR·PAUSA, `herramienta`, `detalle` Json (sin datos sensibles), `nivel`, `actor` (`agente:<puesto>` o usuario), `conversacionId`, `propuestaId`, `proveedor`, `modelo`, `tokensEntrada`, `tokensSalida`, `microUsd`, `ms`, `createdAt` · índice (`tenantId`,`createdAt`) | Registro. Sólo `INSERT`: el código no expone actualizar ni borrar |
| `AgenteGasto` | `tenantId`, `periodo` (AAAA-MM), `microUsd`, `reservado`, `llamadas` · PK (`tenantId`,`periodo`) | Contador del tope |

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
  leer(ctx: Contexto, a: A): Promise<Resultado<D>>;            // todas
  huella?(ctx: Contexto, a: A): Promise<string>;               // prepara / ejecuta
  tarjeta?(a: A, d: D): Tarjeta;                               // prepara: la arma el código
  ejecutar?(ctx: Contexto, a: A, tx: Tx): Promise<Resultado<unknown>>;  // sólo dentro de tenantTransaction
}
type Resultado<D> =
  | { ok: true; datos: D; origenes: Origen[] }
  | { ok: false; motivo: "sin_permiso" | "no_existe" | "tope" | "pausado" | "invalido" | "error"; mensaje: string };
interface Origen { etiqueta: string; enlace: string; leidoEl: string }
interface Contexto { tenantId: string; puesto: PuestoId; actor: ActorAgente; humano: Actor | null; ahora: Date; db: Tx | typeof prisma }
```

Reglas del contrato:
- `leer` usa las **mismas lecturas que las pantallas** (`cuotasDelNegocio`, `empresa.server.ts:20-43`;
  `recuadrosDeCuotas`, `:46`; `cobranzasDelNegocio`, `cobranza.server.ts:75`; `pendientesDeCobro`,
  `cobranza-core.ts:334`). No se escriben consultas paralelas de plata.
- Los importes van al modelo **ya formateados por el código** y cada uno queda anotado para el control de cifras.
- El resultado viaja al modelo dentro de `<datos>` con `bloqueDeDatos` (`diseno-core.ts:379-385`), nunca como texto libre.
- `ahora` se inyecta: ningún `Date.now()` dentro de reglas puras (norma de tests deterministas).

Herramientas de la primera entrega: `cobranzas.resumen`, `cobranzas.cuotas_vencidas`, `cobranzas.cuotas_por_vencer`,
`cobranzas.cuotas_de_cliente`, `coordinacion.parte_del_dia`, `equipo.derivar`. Segunda:
`cobranzas.preparar_recordatorio`, `agenda.anotar`, `agenda.listar`, `cuaderno.leer`. Después: `pagos.*`, `bancos.*`.

## 5. Identidad y permisos del agente

- El agente **no tiene usuario con clave ni sesión**. Su identidad es `agente:<puesto>` (va a `actor` del registro y
  a `autor` de `registrarCambio`, `gestion.server.ts:84-92`).
- `ActorAgente` se arma con el rol `ADMINISTRACION` del negocio (`permisoDe`, `gestion-core.ts:725-729`), recortado
  a los módulos que el puesto declara. Si un negocio le sacó a Administración un permiso, el agente también lo pierde.
- En conversación, lo que se ve es la **intersección** entre el permiso del agente y el de la persona que habla
  (`puede`, `gestion.server.ts:44-46`): el agente nunca le muestra a alguien lo que su rol no ve.
- Aprobar exige `exigirEditar` del módulo de la herramienta (`gestion.server.ts:56-60`) más el módulo `agentes`.

## 6. Motor de permisos y topes (`permisos-core.ts`, puro)

`decidirLlamada({ puesto, tarea, clase, config, estado, contadores }) → correr | proponer | derivar | negar(motivo)`

1. Interruptor del negocio apagado o puesto en pausa → `negar("pausado")`.
2. `nivel = min(techoDeCodigo[tarea], config.niveles[tarea] ?? inicial[tarea])`. Un valor guardado mayor al techo se
   ignora y se registra.
3. `lectura` → correr. `prepara` → nivel ≥ 1 propone; nivel 0 niega. `ejecuta` → nivel 2 corre **si pasa los topes y
   la huella**; nivel 1 lo convierte en propuesta; nivel 3 deriva.
4. Topes: constantes en el catálogo del puesto (por día, abiertos a la vez, por propuesta). El conteo se hace en la
   misma transacción que la escritura.
5. Toda salida que no sea `correr` deja fila en el registro con su motivo.

Guardia de imports: un test recorre `src/lib/agentes/` y `src/lib/proyectos/agentes/` y falla si aparece un import
de `acciones-ficha`, `acciones.ts`, `acciones-rendiciones`, `lib/caja`, `lib/contabilidad/repo` o de
`marcarCuotaEmpresa` (`acciones-empresa.ts:80`). La única escritura de negocio permitida es la conciliación,
reescrita como función de servidor que recibe la transacción.

## 7. Propuestas y aprobación (`propuestas.server.ts`)

- **Crear:** valida argumentos, `leer`, `huella` (hash de los campos que justifican la acción: para una cuota,
  `id · monto · moneda · venceEl · pagadoEl · anuladoEl`), `tarjeta`, `INSERT` con `clave`. Choque de `clave` → se
  devuelve la existente.
- **Decidir:** dentro de `tenantTransaction` (`src/lib/rls.ts:176`): `updateMany` de PENDIENTE a APROBADA con
  `count === 1` como candado (recurso de `acciones-empresa.ts:239-240`); recalcula la huella; si cambió → VENCIDA;
  si no, `ejecutar(tx)` → EJECUTADA; error → la transacción se deshace y, en una segunda transacción, FALLIDA.
- «Corregir y aprobar» sólo cambia `texto`; `argumentos` y `resumen` no son editables.
- Vencimiento: 7 días; el barrido las pasa a VENCIDA.

## 8. Agenda y disparadores

- Único despertador: la tarea diaria existente (`vercel.json:8-17`, 12:00 UTC = 9:00 ART). **No se agrega otra**
  (mismo criterio que `route.ts:31`). Granularidad: el día. Si no corrió, el siguiente barrido levanta lo atrasado
  (ventana de 7 días, como `avisarCuotas`, `gestion.server.ts:124-139`).
- `barrerAgentes()`: negocios con interruptor prendido (lectura como `contabilidadPrendidaEn`,
  `modulo.server.ts:20-37`), uno por uno en su `tenantTransaction`, y el error de uno no frena a los demás
  (`avisos-programados.server.ts:18-25`).
- Por negocio, **primero lo que no necesita IA**: vencer propuestas, levantar compromisos del día, calcular el parte,
  detectar cuotas que cruzaron el umbral, crear avisos internos. Después, con presupuesto de tiempo (40 s por
  negocio) y de gasto, hasta 5 redacciones. Lo que no entra queda marcado «preparar al abrir» y se redacta cuando
  alguien abre el panel (mismo recurso que los avisos al abrir Inicio, `gestion.server.ts:148`).
- Idempotencia: `revisadoEl` del compromiso y `clave` de la propuesta hacen que dos corridas el mismo día no dupliquen.

## 9. Registro

`registrar(db, fila)` es la única puerta. Se llama desde el motor, no desde las herramientas, así ninguna queda sin
anotar. `detalle` guarda nombres de herramienta, identificadores y resultado; **no** guarda el texto completo de los
datos leídos ni datos bancarios. El informe mensual y la pestaña Registro leen de acá.

## 10. Proveedor de IA y opción B

```ts
interface ProveedorIA {
  id: string;
  turno(p: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[]; maxTokens: number }):
    Promise<{ ok: true; texto: string; llamadas: Llamada[]; uso: { entrada: number; salida: number }; corte: string }
          | { ok: false; motivo: "caida" | "saturada" | "clave" | "rechazo" }>;
}
```

| Ruta | Adaptador | Cuándo |
|---|---|---|
| 1 | `proveedor-claude`: API de mensajes con herramientas | Con clave paga cargada (decisión del dueño, `05` D1) |
| 2 · opción B | El mismo contrato por otra nube, o `proveedor-esquema` contra otro modelo | Si la ruta 1 falla dos veces seguidas o está apagada |
| 3 | `respaldo-core`: plantillas con los números del sistema + derivación | Sin IA, caída, o gasto agotado |
| Pruebas y demo | Proveedor de guion (respuestas fijas por caso) | Tests, CI y la demo del dueño sin gastar |

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
- Antes de cada llamada: reserva atómica — un solo `UPDATE AgenteGasto SET reservado = reservado + :estimado WHERE
  tenantId… AND microUsd + reservado + :estimado <= :tope`; 0 filas = no alcanza → ruta 3. Al volver: se pasa lo
  real a `microUsd` y se libera la reserva. `:estimado` = costo del máximo de tokens de la llamada.
- Precio por modelo en una tabla del código, **leída de la página oficial de precios y citada con fecha** (no de memoria).
- Además: 6 pasos por vuelta, tope de tokens por respuesta, 60 mensajes por persona por día, 24 mensajes por charla
  (igual que hoy, `diseno-core.ts:359`). Aviso interno a Dirección al 80 % del tope.

## 12. Interruptor por negocio y pausa

- Nuevo interruptor `equipo-agentes` en el catálogo (`interruptores.ts:66`): apagado de fábrica; sólo lo escribe la
  consola del operador (`interruptores.ts:15-20`); `cambiaLasApps: true`. Si la lectura falla, apagado.
- En pedidos del panel se lee con `interruptoresDelNegocio` (`interruptores.server.ts:56-59`); en el barrido, por
  negocio, con el patrón de `contabilidadPrendidaEn`.
- Pausa por puesto y «Pausar todo»: `AgentePuesto.estado`, acción de servidor con `exigirEditar("agentes")` y auditoría.
- Freno de emergencia de GSG sin deploy: apagar el interruptor desde la consola.

## 13. Seguridad

- **Aislamiento por negocio:** `tenantId` sale de la sesión o del barrido, jamás del modelo. Toda consulta lo lleva
  escrito además de RLS. Test con dos negocios sobre Postgres con el rol sin bypass (como
  `avisos-programados-postgres.test.ts`): un identificador ajeno devuelve «no existe».
- **Inyección de instrucciones:** todo dato cargado por personas viaja escapado dentro de `<datos>`
  (`escaparDatos`, `diseno-core.ts:377`), incluidos resultados de herramientas, notas del cuaderno e historial. Las
  instrucciones repiten la regla de `ia.server.ts:220`. Pero la defensa real es estructural: aunque el modelo
  obedezca un texto malicioso, sólo puede pedir herramientas de su puesto, con argumentos validados, y nada
  irreversible corre sin una persona.
- **Control de cifras:** `cifras-core` extrae importes, fechas y porcentajes de la respuesta y exige que cada uno
  figure en lo leído en esa vuelta (o en el mensaje de la persona). Si no, se reintenta una vez y, si persiste, se
  responde con plantilla y se registra. Antecedente a revisar: `revisarRespuesta` (`consulta-core.ts:156`).
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
| Niveles, techos, topes, decisión por clase | Puro | `permisos-core.test.ts` |
| Control de cifras (acepta lo leído, frena lo inventado) | Puro | `cifras-core.test.ts` |
| Gasto: costo, saldo, redondeo en enteros | Puro | `gasto-core.test.ts` |
| Agenda: hoy, atrasados, no repetir | Puro | `agenda-core.test.ts` |
| Vuelta del agente con guion: 6 pasos, herramienta inválida, sin IA | Unidad | `motor.test.ts` |
| Los 30 casos (10 normales, 12 trampa, 4 de memoria, 4 de falla) | Guion | `casos-administracion.test.ts` |
| Dos negocios, rol sin bypass: nada cruza | Postgres | `agentes-aislamiento-postgres.test.ts` |
| Doble aprobación a la vez: una sola ejecución | Postgres, carrera | `propuestas-carrera-postgres.test.ts` |
| Reserva de gasto con N llamadas a la vez: no pasa el tope | Postgres, carrera | `gasto-carrera-postgres.test.ts` |
| Sin tablas: panel, acciones y barrido no rompen | Unidad | `estado-sin-migracion.test.ts` |
| Guardia de imports (no toca plata) | Estático | `guardia-imports.test.ts` |
| Mismo número que Administración | Postgres | `cobranzas-mismo-numero-postgres.test.ts` |

Los tests de carrera se escriben **antes** de la certificación (norma de solidez de CI, punto 6).

## 15. Dónde prueba el dueño sin tocar producción ni gastar

- **Demostración en memoria:** `node scripts/proyectos/demo-local.mjs --start` levanta un Postgres en memoria, aplica
  todas las migraciones del árbol (incluida la nueva, sólo ahí) y siembra MIA (`demo-local.mjs:5-11`, puerto 3218).
  No toca Neon ni Vercel.
- **IA de la demo:** proveedor de guion por defecto (cero costo, cero datos afuera). Opcional: el servicio gratis con
  los datos sembrados, que son de demostración.
- El interruptor `equipo-agentes` se prende en la siembra de la demo, no en producción.
- En producción, MIA sigue sin activar y el equipo queda apagado hasta que el dueño decida (`05` D4, D5, D13).

## 16. Riesgos técnicos anotados

1. `ProyectoCuota.monto` es `Float` (`prisma/schema.prisma:3852`); el pase a centavos está en construcción en otro PR
   (tablero MIA, M12). Las herramientas usan `redondear` y las lecturas existentes; al entrar ese PR, se revisa.
2. Hay dos defectos de plata abiertos en cobranza (tablero MIA, M3). El equipo lee con las mismas funciones: hereda
   el defecto y también el arreglo. No se prende con datos reales antes de que cierren.
3. La tarea diaria corre una vez: no hay seguimiento intradía.
4. El comentario de `acciones-diseno.ts:478-480` dice que Administración «ve pero no edita la IA»; el código dice que
   no la ve (`gestion-core.ts:648`). No bloquea (módulo nuevo), pero conviene corregir el comentario.
