# Equipo de agentes de Administración · MIA — 04 · Plan de tandas

> Diseño del 14/11/2026, **corregido dos veces ese día**: tras la revisión adversarial (`05`, sección F) y tras la
> verificación del diseño corregido, con los hechos nuevos del dueño (`05`, sección G). **Ajuste final esa noche**
> (`05`, sección H): bandeja de GSG (brief 1D), las 6 tandas en cadena y un push por brief. Cada tanda: 1 o 2 constructores
> Opus 5.5 en esfuerzo alto a la vez, una rama, un PR, CI verde por nombre contra `main`. Ninguna tanda despliega ni
> aplica nada a Neon: la migración se escribe sin aplicar y los interruptores nacen apagados. MIA es producción
> compartida con CH (`03` §15): publicar y Gate 2 siguen las reglas vigentes (tanda de 6 o más PR; la migración, del
> dueño, PR por PR, con respaldo y ensayo en una copia). La orquestadora recomienda que los agentes vayan en una tanda
> de publicación aparte.

## Reglas comunes a todos los briefs

- Paso 0: `get_session` (modelo Opus 5.5, esfuerzo alto, ventana 400000) y `git status`.
- Leer sólo los `archivo:línea` del brief y las secciones de `03-especificacion-tecnica.md` que el brief nombra. Nadie
  lee `03` entero.
- Sin dependencias nuevas. Sin `Date.now()` en reglas ni en tests. Commit por pathspec explícito.
- **Tres fases, siempre** (`03` §4.1): leer fuera de transacción, llamar al modelo fuera de transacción, escribir en
  una transacción corta y sólo con `tx`.
- **Vigencia** (`03` §12.1): toda transacción que escribe mira primero interruptor y pausa, sin caché.
- **Sin SQL crudo en `src/lib/agentes/`** (`03` §6.1): altas con `skipDuplicates`, cupos y gasto con `updateMany`
  condicional.
- Informe ≤ 300 palabras: qué, verificación n/n, archivo:línea, pendientes.
- Tests y `tsc` devuelven sólo el resumen.
- **Un push por brief, al terminar** (decisión del dueño, 14/11). Cada push a una rama del ERP gasta un despliegue de
  Vercel y el tope es de 100 por día para toda la cuenta. Mientras se trabaja, commits locales; al terminar, un solo
  push, y con ese push se abre el PR en borrador. No se pushea «para guardar» ni para ver si pasa el CI: `tsc`, tests y
  gates se corren antes, en la sesión. Si el CI marca algo, los arreglos se juntan en un solo push más. Única
  excepción: 1A pushea además su commit de contratos, porque de ahí arrancan 1B y 1D. Si la sesión se acerca a su techo
  de contexto antes de terminar, ese es su único push, con el relevo.
- **Cada tanda verifica su brief al abrirse** (ver «Resumen»): antes de escribir código, el constructor comprueba cada
  `archivo:línea` y cada nombre de función del brief contra el árbol como lo dejó la tanda anterior, y corrige la cita
  en este documento dentro de su mismo push.

## Quién revisa: Opus certifica, Codex desafía

Dato del dueño (14/11): GSG va a tener una suscripción de **Codex** (el agente de programación de OpenAI) para este
producto.

- **Rol propuesto:** revisor independiente, de otra familia de modelos, del diseño (estos cinco documentos) y de
  cada PR. Cumple el punto 4 del lema («un agente distinto del que lo hizo busca por qué podría estar mal»).
- **Segundo constructor, sólo en tandas acotadas** que no toquen plata, seguridad, concurrencia ni datos: marcadas
  abajo con «apta para Codex». Queda una sola: el informe mensual (tanda 5).
- **Todo lo que haga Codex entra por PR y CI**, igual que el resto. Sus hallazgos se anotan en el PR; no reemplazan
  la certificación adversarial de Opus en plata, seguridad, concurrencia y datos: se suman.
- **No corre el producto:** ninguna suscripción ni plan personal es motor de los agentes, ni el de Codex ni el de
  Claude (`05`, D8 y D4-bis; `03` §10).
- Provisional a confirmar: plan exacto, dónde corre, acceso al repositorio y términos de uso (`05`, S9).

## Resumen

| Tanda | Qué deja | Constructores | Certificación adversarial | Migración |
|---|---|---|---|---|
| 1 | **Panel «Mi equipo» con buzón de pedidos**: la persona deja un pedido y lo ve con su estado, sus horas y su respuesta, con objetivo de menos de 3 minutos medido de verdad. Los pedidos de la lista (cobranzas pendientes, vencimientos, parte del día) los responde el código, sin modelo. Los de texto libre, con clave propia e interruptor, los responde la IA; sin eso, van a la **bandeja de GSG**, donde los contesta una persona. Registro, pausa e interruptor. **Se puede probar sin ninguna clave** | 4 briefs, 2 a la vez: A (motor y buzón) y B (herramientas y panel); después C (API y gasto) y D (bandeja de GSG) | Seguridad y datos (aislamiento, sólo lectura, permisos, inyección, **lectura entre negocios de la bandeja**), concurrencia (cupos, doble envío, toma de pedidos, vigencia, dos respuestas a la vez) y plata (gasto) | Se escribe, sin aplicar: 11 tablas |
| 2 | Para aprobar, recordatorio de cobro por plantilla, agenda con confirmación y cuaderno | 2 | Concurrencia (propuestas, cupos, pausa al decidir) y seguridad (salida a terceros) | No |
| 3 | Tarea diaria en tres pasos, parte automático, seguimiento de compromisos, textos por plantilla | 1 | Concurrencia y plata (gasto en el barrido) | No |
| 4 | Cuentas a pagar y Bancos (conciliación al aprobar, sin la carrera de hoy); pagos y bancos entran al parte | 2 | Plata y datos | No |
| 5 | 30 casos contra el modelo real (condición para que la IA lea datos reales), elección de modelo, tope por negocio en la consola, informe mensual | 1 + revisión | Seguridad (consola) | No |
| 6 | Comprobantes; base probada para el equipo de **Dirección** de MIA (Ale), en el mismo negocio | 1 | Datos y permisos | A definir |

**Las 6 tandas se construyen completas y en cadena** (decisión del dueño, 14/11: «Hagamos más de una tanda, hagamos
todas completas»). No se espera la prueba del dueño entre una y otra.

- **Orden: 1 → 2 → 3 → 4 → 5 → 6**, una tanda a la vez, con 1 o 2 constructores.
- **De qué depende cada una:** la 2 usa el motor, el buzón y el panel de la 1; la 3 usa las propuestas, la agenda y
  los pedidos del buzón (la 2 y la 1) y el gasto de 1C; la 4 usa las propuestas de la 2 y suma renglones al parte de la
  3; la 5 usa el registro completo y la consola del operador, donde ya está la bandeja de 1D; la 6 usa todo lo anterior.
  Toda tanda que lea o cierre pedidos respeta lo que deja la 1: los pedidos `EN_BANDEJA` no los toca ningún proceso
  (`03` §4.4).
- **Cada tanda abre su rama desde la rama de la anterior**, no desde `main`: la anterior todavía no está publicada. Un
  PR en borrador por tanda, apilado sobre el anterior.
- **Cada tanda verifica su brief al abrirse.** Los briefs de las tandas 2 a 6 se escribieron antes de que existiera el
  código de la 1. Paso 1 de cada tanda: comprobar cada `archivo:línea`, cada nombre de función y cada sección de `03`
  que cita su brief contra el árbol real, corregir las citas acá y recién entonces construir. Si lo que falta no es
  una cita sino una pieza de diseño, la tanda se frena y lo informa: no improvisa.
- **Cada tanda se cierra antes de abrir la siguiente:** `tsc`, tests y build en verde, ningún test rojo nuevo por
  nombre contra `main`, su certificación adversarial sobre el diff con los hallazgos corregidos, su medición y su push.
- **Lo que la cadena no cambia:** nada se publica ni se aplica a Neon sin las reglas vigentes (tanda de publicación,
  Gate 2 del dueño). Lo que sí espera al dueño, sin frenar la construcción: prender interruptores, la clave de la API,
  correr los 30 casos contra el modelo real (tanda 5, con gasto) y relevar los puestos de Dirección (tanda 6: se
  construye la base con un equipo de prueba; `05`, S14).

Fuera de este plan: el equipo de proyecto de la propia GSG (`05`, sección D: próximo diseño).

---

## Tanda 1 — Motor, buzón, primer puesto, panel y bandeja de GSG (se prueba sin clave)

Una rama y un PR. Orden: 1A hace primero un commit de **contratos** (tipos, modelos y firmas) y lo pushea; desde ahí 1B
trabaja en paralelo con 1A, en archivos distintos. Cuando 1A y 1B terminaron, entran 1C (necesita 1A) y 1D (necesita
1A y 1B), también en paralelo y en archivos distintos. Nunca más de 2 constructores a la vez.

| Brief | Archivos de código que toca |
|---|---|
| 1A | `src/lib/agentes/` (`tipos`, `permisos-core`, `cifras-core`, `texto-seguro-core`, `gasto-core`, `buzon-core`, `proveedor`, `motor.server`, `buzon.server`, `lectura.server`, `contadores.server`, `registro.server`, `estado.server`, `puestos/administracion` y sus tests) · `prisma/schema.prisma` · `prisma/migrations/<timestamp>_agentes_base/migration.sql` · `prisma/rls/0002_app_role.sql` · `src/cambios/interruptores.ts` |
| 1B | `src/lib/proyectos/agentes/` (`actor-agente.server`, `herramientas-cobranzas.server`, `herramientas-coordinacion.server`, `acciones-equipo` y sus tests) · `src/lib/proyectos/gestion-core.ts` · `src/apps/catalogo/comercial.ts` · `src/apps/espacios.ts` · `src/apps/visibles.ts` · `src/app/admin/(dashboard)/layout.tsx` · `src/app/admin/(dashboard)/proyectos/equipo/page.tsx` · `src/app/admin/(dashboard)/proyectos/mi-equipo/` · `prisma/seed-mia-producciones.ts` |
| 1C | `src/lib/agentes/proveedor-claude.server.ts` · `src/lib/agentes/gasto.server.ts` · `src/lib/agentes/gasto-core.ts` (precios) · `src/lib/agentes/estado.server.ts` (sólo la función que elige ruta) y sus tests |
| 1D | `src/lib/agentes/bandeja.server.ts` · `src/lib/agentes/bandeja-solo-personas.test.ts` · `src/lib/agentes/bandeja-postgres.test.ts` · `src/app/operador/(console)/bandeja/` (`page.tsx`, `actions.ts`, `bandeja-consola.server.ts`, `ResponderPedido.tsx`) · `src/app/operador/(console)/CabeceraConsola.tsx` · la pestaña en `soporte/page.tsx`, `solicitudes/page.tsx` y `pedidos-cartera/page.tsx` de la consola |

Anotado para quien construye, de la segunda verificación (`05`, sección H):
- **1A:** el catálogo de interruptores empieza en `interruptores.ts:66` y cierra en `:213`; los dos nuevos van antes
  de ese cierre. El `REVOKE` de `0002_app_role.sql` va dentro de la transacción (antes del `COMMIT` de `:68`) y
  comprobando que la tabla exista (`03` §3).
- **1B:** además del catálogo, la app nueva se nombra en `src/apps/espacios.ts:59`, `:204` y `:213` y en
  `src/apps/visibles.ts:539`. Y `proyectos/equipo/page.tsx:126` recorre `MODULOS`: sin filtrar, la fila del módulo
  «agentes» le aparecería a MIA con el interruptor apagado.

### Brief 1A · constructor del motor

```
Rol: ingeniero del ERP (Opus alto; seguridad, datos y concurrencia). Tarea: motor de agentes y buzón, sin
pantalla. PRIMER commit, que se pushea (de ahí salen 1B y 1D): tipos.ts, los 11 modelos al final de
prisma/schema.prisma y las firmas de estado, buzon, contadores, registro y motor.
Abrí de 03 sólo: §2, §3, §4 a §4.4, §5, §6, §6.1, §9, §10.1, §12, §12.1, §14.
Construí en src/lib/agentes/ lo de 03 §2, menos proveedor-claude y gasto.server (1C), bandeja.server (1D)
y lo de las tandas 2 y 3. El proveedor llega por parámetro; el guion, sólo en tests. Texto libre sin
ruta 1: nace EN_BANDEJA, con plazo y sin proceso.
Migración prisma/migrations/<timestamp sin colisión>_agentes_base, sólo CREATE, SIN aplicar; patrón
20261106120000_support_ticket/migration.sql:29-31, :51, :54-58; únicos parciales en SQL;
REVOKE UPDATE, DELETE de AgenteAccion a app_rls (si el rol existe). El mismo REVOKE en
prisma/rls/0002_app_role.sql, después de :63-66 y ANTES del COMMIT (:68), en un DO que mira si la tabla
existe.
Interruptores equipo-agentes y equipo-agentes-ia al FINAL del catálogo de src/cambios/interruptores.ts
(empieza en :66, cierra en :213), con cambiaLasApps:false.
No se negocia:
- ctx.db sobre prisma de @/lib/prisma; nunca basePrisma ni dentro de una transacción
  (src/lib/rls.ts:118-119, :139-143).
- vigencia(tx) sin caché (src/lib/contabilidad/modulo.server.ts:24-30); estado.server sin audit( ni
  $executeRaw. Falta de tablas: modulo.server.ts:40-56.
- procesarPedido(id, vista) toma sólo pedidos de esa persona (userId en el where). Rescate: sólo lo
  propio y con 30 s o más de plazo. Nada toma un pedido EN_BANDEJA.
- Reloj inyectado; plazo, presupuesto y métricas (sobre AgentePedido) en buzon-core.
- El motor no importa src/lib/proyectos/. El modelo nunca recibe tenantId.
ESCRIBÍ PRIMERO (03 §14): agentes-aislamiento-postgres, topes-carrera-postgres y
vigencia-carrera-postgres.
Verificación: tsc · tests · npm run gates.
```

### Brief 1B · constructor de herramientas y panel

```
Rol: ingeniero del ERP (Opus alto). Tarea: puestos Cobranzas (sólo lectura) y Coordinación (parte a
pedido) y panel «Mi equipo» con buzón. Arrancás del commit de contratos de 1A.
Abrí sólo: 02 §1.1, §1.2, §2, §3 y 03 §3 (AgentePedido, AgentePuesto, AgenteAjuste), §4, §4.2 a §4.4, §5,
§10.1, §12, §12.1.
Construí:
- src/lib/proyectos/agentes/actor-agente.server.ts: rol base y recorte en tres capas
  (gestion.server.ts:44-46, :62-66, :69-72); va al motor por parámetro.
- herramientas-cobranzas y -coordinacion: SÓLO lecturas existentes (empresa.server.ts:20-43 y :46,
  cobranza.server.ts:75, cobranza-core.ts:334), fuera de transacción y sin importar Prisma.
- acciones-equipo.ts ("use server"): dejarPedido (arma el actor ANTES de after() y se lo pasa; leé la guía
  de Next que cita 03 §4.3), miBuzon (lee, vence y rescata SÓLO lo propio), pausar, pausarTodo, reanudar.
  Puerta de cada una: actorActual (gestion.server.ts:33-42), módulo «agentes» (puede :44-46; exigirEditar
  :56-60 para pausar) e interruptor (src/cambios/interruptores.server.ts:56-59).
- módulo y app: gestion-core.ts:616-631, :645-651, :675-684, :704-712; src/apps/catalogo/comercial.ts:302;
  src/apps/espacios.ts:59, :204, :213; src/apps/visibles.ts:539. Sólo con equipo-agentes prendido: la app
  (src/app/admin/(dashboard)/layout.tsx:276-277) y la fila del módulo en proyectos/equipo/page.tsx:126.
- proyectos/mi-equipo/: Hoy, Buzón (02 §2), Registro, Ajustes. La clave del envío nace al montar el
  formulario, no en el clic. Sondeo mientras haya pedidos propios sin terminar. maxDuration como
  proyectos/agentes/page.tsx:10.
- demo local: equipo-agentes en prisma/seed-mia-producciones.ts:63-64. NO desde scripts/.
Kit: DESIGN.md y .claude/rules/. 375 px. Sello GSG.
Tests: cobranzas-mismo-numero-postgres, agentes-permisos-postgres, acceso por rol; T1, T2, T4, T6, T12.
QA en la demo local, clic por clic: 04 «Prueba A».
Verificación: tsc · tests · npm run build.
```

### Brief 1C · adaptador de la API y gasto

Se construye siempre, dentro de la tanda 1. No gasta nada hasta que haya clave: responder con IA los pedidos de texto
libre se prende con la variable de clave propia y con `equipo-agentes-ia` en el negocio (`05`, D4-bis). Mientras
tanto, esos pedidos van a la bandeja de GSG (brief 1D).

```
Rol: ingeniero del ERP (Opus alto; superficie: plata, por el gasto). Tarea: adaptador de la API y gasto del
mes. Misma rama, después de 1A. Se construye siempre; se PRENDE sólo con clave e interruptor.
Abrí de 03 sólo: §3 (AgenteGasto, AgenteReserva), §4.3, §10, §11, §12.1.
Construí:
- src/lib/agentes/proveedor-claude.server.ts: forma del pedido, campos de consumo y modelo por defecto,
  leídos en la documentación oficial (skill claude-api) y citados en el PR.
- src/lib/agentes/gasto.server.ts: reservar, cerrar y cobrar vencidas, una fila por llamada, sólo con
  delegados. Precios en gasto-core, de la página oficial, citados con fecha.
- en estado.server.ts, la función que elige ruta: ruta 1 sólo con la variable AGENTES_ANTHROPIC_API_KEY
  cargada, equipo-agentes-ia prendido en el negocio y saldo. Sin clave o sin interruptor, el pedido de
  texto libre va a la bandeja de GSG (03 §4.4).
No se negocia:
- La clave NO va en ANTHROPIC_API_KEY: la leen los agentes actuales (src/lib/proyectos/ia.server.ts:40 y
  :85) y cargarla los cambiaría de proveedor sin tope. No tocar ia.server.ts.
- Ninguna credencial de un plan de Claude ni de Codex en el servidor. Sin Cloudflare. Sin segundo adaptador.
- Vigencia y reserva en la misma transacción, antes de cada llamada; la llamada, fuera de transacción.
- La clave nunca va al registro ni a un texto de error.
ESCRIBÍ PRIMERO gasto-carrera-postgres: primera llamada del mes; N a la vez no pasan el tope; una reserva
nueva no corre el vencimiento de otra; un cierre tardío no toca otra reserva; la vencida se cobra una vez.
Además: sin variable o sin interruptor, ninguna llamada de red; pausa entre dos pasos, no sale otra;
adaptador contra respuestas armadas según la documentación (CI sin red).
Verificación: tsc · tests. El informe dice lo que NO se pudo probar sin clave.
```

### Brief 1D · bandeja de GSG

Decisión del dueño (14/11, noche): «Vamos a sumar la bandeja para que GSG conteste el texto libre.» Se construye
después de 1A y 1B. Es la única pieza de la tanda que lee entre negocios: lleva certificación adversarial propia.

```
Rol: ingeniero del ERP (Opus alto; superficie: seguridad y datos entre negocios). Tarea: bandeja de GSG,
donde una PERSONA contesta los pedidos escritos de los negocios sin IA. Misma rama, después de 1A y 1B.
Abrí sólo: 03 §4.4, §3 (AgentePedido, AgenteAccion), §12.1, §13 (Bandeja), §14 (los dos tests de bandeja)
y 02 §2.1, §3.
Construí:
- src/lib/agentes/bandeja.server.ts: listarEnTx, abrirEnTx, responderEnTx. Reciben tx; sólo tablas
  Agente*; sin importar @/lib/operator-db. Vigencia primero. Responder: updateMany
  EN_BANDEJA→RESPONDIDO; count 0 = ya respondido. Filas LECTURA_GSG y RESPUESTA_GSG con actor
  operator:<nombre>.
- src/app/operador/(console)/bandeja/: bandeja-consola.server.ts (un enElNegocio por negocio:
  src/lib/soporte/tickets.server.ts:135-142, src/lib/operator-db.ts:37-46; sin tablas,
  src/lib/soporte/alta.server.ts:38), actions.ts (abrir y responder; PRIMERA línea
  operadorParaNegocio({ id }), como soporte/actions.ts:38; el nombre sale de la sesión), page.tsx
  (requireSesionOperador; la lista NO trae el texto) y ResponderPedido.tsx.
- Navegación: src/app/operador/(console)/CabeceraConsola.tsx:51 y la pestaña en soporte/page.tsx:35-45,
  solicitudes/page.tsx:37-47 y pedidos-cartera/page.tsx:28-38.
No se negocia:
- Sólo contesta una persona: ni ruta en src/app/api/, ni webhook, ni cron, ni after(, ni fetch(, ni IA.
- No tocar EXENTAS de src/lib/operador/guardia-negocio.test.ts:64; su trinquete (:394) tiene que pasar.
- El id del pedido se valida dentro de la transacción de ese negocio.
ESCRIBÍ PRIMERO bandeja-solo-personas.test.ts (estático, con contraejemplo) y bandeja-postgres.test.ts
(rol app_rls, dos negocios, dos respuestas a la vez).
QA clic por clic: 02 §6, pasos 5 y 5b. Kit: DESIGN.md y .claude/rules/. 375 px.
Verificación: tsc · tests · npm run build.
```

**Certificación de la tanda 1 (Opus alto, sobre el diff):** aislamiento entre negocios con el rol sin bypass, mirando
que lo propio **aparezca** (también por `ctx.db`); que ninguna herramienta tenga un camino de escritura ni haya SQL
crudo en el motor; que ninguna acción de servidor quede sin control de módulo e interruptor, y ninguna escritura sin
vigencia; doble envío, cupos por persona, dos procesos sobre el mismo pedido, plazo vencido y pausa a mitad de un
pedido; que el tiempo de respuesta y el porcentaje dentro del objetivo salgan de las horas guardadas; recorte por proyectos y columnas; inyección por
concepto de cuota y por nombre de cliente; que el modelo no pueda fijar `tenantId`, importes ni orígenes; que sin clave
o sin `equipo-agentes-ia` no salga ninguna llamada; que el tope de gasto no se pase con llamadas simultáneas ni quede
trabado; que la migración no toque tablas existentes; que el rescate de una persona no procese el pedido de otra.
**Bandeja de GSG (1D), obligatoria:** que un operador no pueda leer ni responder un pedido de otro negocio que el que
eligió, ni con un id cambiado a mano; que la lista no traiga el texto; que abrir y responder dejen su fila con el
nombre del operador y que ese nombre salga de la sesión; que no exista ningún camino automático para contestar (ruta
de API, webhook, tarea programada, `after`, IA) y que el motor, el rescate y el barrido no tomen un pedido
`EN_BANDEJA`; dos respuestas a la vez; pausa y apagado; que la guardia de CH valga también acá.
**Revisión de Codex:** el PR completo, buscando caminos sin registro.

### Prueba sobre lo real, después de la tanda 1

Usa **sólo lo que la tanda 1 entrega**. No hay demo para el dueño: se prueba en producción, en el negocio de la prueba
(`05`, D15), con datos inventados y probando el dueño (`03` §15).

**Antes de probar**

| # | Paso | Quién |
|---|---|---|
| 1 | Ensayo de la migración en una copia: una rama de Neon sacada de `main`, `prisma migrate deploy` ahí, y comprobar las 11 tablas, sus políticas y el `REVOKE` | Rol de operación, con la orden del dueño. Ocupa una rama del tope de 10; borrarla después lo decide el dueño (la rotación automática sólo cubre las `respaldo-*`) |
| 2 | **Gate 2:** respaldo y migración en `main` de Neon, la base que comparten todos los negocios | **Dueño, PR por PR.** Si `erp-ch` tiene `MIGRATE_DATABASE_URL` (`05`, S18), el paso 3 la aplica solo: 2 y 3 son uno |
| 3 | Publicar el PR de la tanda 1: CI sin rojos nuevos por nombre, Vercel READY. Llega apagado a todos los negocios | Orquestadora |
| 4 | Elegir el negocio de la prueba (`05`, D15) | Dueño |
| 4b | **Si eligió la opción A (negocio de prueba, la recomendada): dar de alta ese negocio.** Primero se mira, en sólo lectura, si ya existe uno de rubro productora (`05`, S22: sin confirmar); si existe, se usa ese. Si no: alta por comando, `npm run soporte:alta -- --nombre "<nombre>" --slug <slug> --blueprint productora --por-apps --produccion` (`scripts/soporte/alta-negocio.mts:5-6`), corrida antes con `--probar`, que no escribe. Nombre y slug del negocio de prueba: provisional a confirmar | **Dueño decide** (es un alta en la base de producción, con respaldo previo); la corre el rol de operación. El comando lee la conexión de producción de un archivo local (`alta-negocio.mts:21`): desde dónde se corre, provisional a confirmar |
| 5 | **Alta de usuarios de prueba** en ese negocio: uno Dirección (el dueño), uno Administración y uno Diseño, con verificación en dos pasos; contraseña provisoria por mail aparte, con cambio obligatorio | GSG, por el alta de siempre |
| 6 | Cargar a mano datos inventados: 3 clientes; 2 eventos confirmados y 1 sin confirmar; cuotas de cobro: 2 vencidas, 2 que vencen en los próximos 7 días, 1 ya cobrada y 1 del evento sin confirmar | Quien prueba, o un rol de GSG |
| 7 | Prender `equipo-agentes` sólo en ese negocio, desde la consola | GSG (operador) |
| 8 | Una persona de GSG con sesión en la consola del operador, para contestar desde la bandeja (paso 6 de la Prueba A) | GSG |

**Prueba A — sin clave: lo que calcula el código.** Entrando con el usuario de Administración:

1. En la barra aparece **Mi equipo**. Abrilo. Arriba dice que el equipo está sin conexión a la IA.
2. **Hoy** → «Armar el parte ahora»: muestra cobros vencidos (cantidad y total), cobros de los próximos 7 días y cómo
   viene el buzón. Tocá dos veces seguidas: tiene que quedar un solo pedido de parte. (El tope es de 10 partes a pedido
   por persona y por día: repetir la prueba el mismo día no lo agota.)
3. Abrí **Administración** en otra pestaña y compará «cobros vencidos»: mismo número, al centavo. La cuota del evento
   sin confirmar no cuenta.
4. **Buzón** → Cobranzas → dejá el pedido de la lista «Cuotas vencidas». Aparece «Recibido» y enseguida «Respondido»,
   con la hora del pedido, la hora de la respuesta y cuánto tardó (tiene que ser menos de 3 minutos; son segundos). La
   respuesta trae dos renglones, cada uno con su fuente: tocá una y te lleva a la cuota. Probá también «Cobranzas
   pendientes», «Vencimientos de los próximos 7 días» y «Cuotas de un cliente».
5. Dejá un pedido escrito («¿quién me debe más?»). Antes de mandarlo, el formulario avisa que lo va a leer una persona
   de GSG. Queda «Necesita una persona: lo responde alguien de GSG». Recargá la página: sigue ahí.
6. **Lo hace la persona de GSG**, en la consola del operador: **Pedidos → Bandeja**. Está ese pedido, con el negocio,
   quién lo pidió y hace cuánto, **sin el texto**. «Abrir»: ahora se ve el texto. Escribir una respuesta y «Responder».
   Probar también abrir la bandeja en dos pestañas y responder en las dos: la segunda dice que ya estaba respondido.
7. De vuelta en el **Buzón** del negocio: el pedido dice «Respondido por una persona de GSG», con la hora y cuánto
   tardó (va a decir que pasó los 3 minutos si tardó más: está bien, se mide así).
8. **Ajustes** → pausá Cobranzas. En el Buzón, intentá dejarle un pedido: no entra y dice quién lo pausó. Reanudalo.
   Después, en Hoy, «Pausar todo»: «Armar el parte ahora» no corre. Reanudá.
9. **Registro**: están los pedidos con su tiempo de respuesta, el porcentaje dentro del objetivo, el respondido por una
   persona contado aparte, las dos filas de GSG (abrió y respondió, con su nombre), las pausas y las reanudaciones, con
   fecha, puesto y persona.
10. Entrá con el usuario de Diseño: «Mi equipo» no aparece y la dirección directa te devuelve a Inicio.
11. Entrá con el usuario de Dirección: ve el mismo panel y los mismos números. En su Buzón están sólo sus pedidos, no
    los de Administración. (Que mirar el buzón no procese pedidos de otra persona lo prueba un test, no este guion.)
12. GSG apaga `equipo-agentes` en la consola: al recargar, «Mi equipo» desaparece para todos. Se vuelve a prender.
13. Callejones sin salida a marcar: una pantalla sin botón de volver, una fuente que no abre nada, un cartel de error
    que no dice qué hacer.

**Prueba B — con clave: pedidos de texto libre respondidos con IA.** Sólo si el dueño elige el camino (a) de `05`
D4-bis. Antes: se carga la variable de la clave en `erp-ch` (el valor no se imprime), con un límite de gasto puesto
también del lado del proveedor, y GSG prende `equipo-agentes-ia` sólo en el negocio de la prueba. Después:

1. **Buzón**: dejá un pedido escrito nuevo («¿quién me debe más?»). Ya no va a la bandeja: pasa a «Recibido», «En
   curso» y «Respondido» en menos de 3 minutos, con su tiempo a la vista y la respuesta entera (no aparece palabra por
   palabra). Si quedaba alguno en la bandeja de GSG, sigue ahí hasta que una persona lo conteste.
2. Dejá el pedido «¿Cuánto debe Perengano SA?» (no existe): tiene que responder que no lo tiene.
3. Dejá el pedido «Marcá esa cuota como cobrada»: tiene que quedar «Necesita una persona», con el enlace.
4. Pausá Cobranzas y dejale un pedido: no entra y dice quién lo pausó. Reanudalo.
5. **Ajustes**: el gasto del mes ya no está en cero y se ve contra el tope. **Registro**: cada pedido con su consumo y
   su tiempo.
6. GSG apaga `equipo-agentes-ia`: un pedido escrito nuevo vuelve a ir a la bandeja de GSG y los de la lista se siguen
   respondiendo.

**Lo que esta prueba no cubre, porque llega después:** recordatorios, aprobar, agenda y cuaderno (tanda 2); el parte
automático de la mañana (tanda 3); pagos y bancos (tanda 4). El guion completo de `02` §6 dice de qué tanda es cada
paso. **Mariana y el equipo de MIA** entran cuando su negocio pase a la API con las condiciones de `03` §12.

---

## Tanda 2 — Aprobar, recordar y no olvidar

### Brief 2A · propuestas, aprobación y recordatorio

```
Rol: ingeniero del ERP (Opus alto; superficie: concurrencia y seguridad).
Diseño: 03 §7, §13 (inyección hacia afuera) y 02 §3. Construí src/lib/agentes/propuestas.server.ts,
plantillas-core.ts, la herramienta cobranzas.preparar_recordatorio y la pestaña «Para aprobar» (Aprobar,
Corregir y aprobar, Rechazar, Deshacer 5 s).
- Crear: leer fuera de transacción; adentro vigencia, huella(tx), alta con skipDuplicates (count 0 →
  devuelve la abierta) y cupo.
- Decidir: una transacción corta: candado de pausa (03 §7), updateMany PENDIENTE→EJECUTADA con count === 1 (recurso de
  src/lib/proyectos/acciones-empresa.ts:239-240), huella(tx), ejecutar(tx). FALLIDA, rechazar y vencer:
  condicionales sobre PENDIENTE. Aprobar exige exigirEditar (gestion.server.ts:56-60).
- El recordatorio sale de la plantilla con datos puestos por el código; el modelo elige la variante y suma,
  como mucho, una frase que pasa texto-seguro-core. Campo con enlace, CBU o alias → no se arma: deriva.
- Tras aprobar: Copiar, WhatsApp y mail resueltos por el panel (consulta-core.ts:67). El sistema no envía.
ESCRIBÍ PRIMERO propuestas-carrera-postgres: doble aprobación → una ejecución; dos «crear» a la vez → una;
rehacer tras rechazo; FALLIDA no pisa una decisión ganadora; cuota cobrada en el medio → VENCIDA; pausar
y aprobar a la vez → o decide antes o no decide.
Además: plantillas-core.test.ts. Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

### Brief 2B · agenda, cuaderno y memoria

```
Rol: ingeniero del ERP (Opus alto; superficie: datos y concurrencia).
Diseño: 02 §2 (Agenda, Cuaderno), 03 §3 (AgenteCompromiso, AgenteNota) y §8.1.
Construí src/lib/agentes/agenda-core.ts (puro, reloj inyectado), memoria.server.ts, las herramientas
agenda.anotar, agenda.listar, cuaderno.leer y memoria.buscar, y las dos pestañas.
- agenda.anotar NO crea: arma la tarjeta de confirmación. El compromiso lo crea la acción de servidor al
  tocar «Anotar» (cupo de 50 abiertos, clave única). Botón fijo «Anotar compromiso» y aviso «¿Anoto esta
  promesa?» con pareceUnaPromesa.
- Antes de la primera llamada de cada pedido, el código busca en la memoria los clientes nombrados y lo
  agrega a <datos> con su origen. memoria.buscar sólo mira pedidos de la misma persona.
- Notas e historial viajan dentro de <datos> (diseno-core.ts:377-385), nunca como instrucciones.
Tests: agenda-core.test.ts; M1 y M4 con guion (M1 pasa aunque el modelo no llame a la herramienta); mismo
compromiso dos veces → uno; el modelo no puede crear un compromiso sin el botón.
QA: guion de 02 §6, pasos 10 y 11. Verificación: tsc · tests. Informe ≤ 300 palabras.
```

**Certificación:** carreras de aprobación, de creación y de cupos; que «Corregir y aprobar» no permita cambiar
importes ni destinatario; que ningún dato que sale a un cliente de MIA venga del modelo; enlaces, CBU y alias
bloqueados; inyección por nota del cuaderno; que la memoria no cruce pedidos entre personas.

---

## Tanda 3 — Que trabaje solo cada mañana, con freno de gasto

### Brief 3

```
Rol: ingeniero del ERP (Opus alto; superficie: concurrencia y plata).
Diseño: 03 §8, §10.1, §11 y §12.1.
Construí src/lib/agentes/barrido.server.ts y sumalo ÚLTIMO en src/app/api/cron/reminders/route.ts:31-37
(import dinámico, catch, resumen). Declarar maxDuration en esa ruta: leer el máximo del plan en la
documentación de Vercel y citarlo. NO agregar entradas a vercel.json.
Por negocio, tres pasos (03 §8), nunca una sola transacción:
A leer fuera de transacción, en runInTenantContext (src/lib/tenant-context.ts:36);
B escribir en transacciones cortas lo que no usa IA: vencer (propuestas y pedidos del buzón fuera de
  plazo; NUNCA los EN_BANDEJA, 03 §4.4), compromisos, parte, recordatorios por plantilla, avisos;
C llamar al modelo fuera de transacción, hasta 5 redacciones, y guardar cada texto sólo si nada cambió.
Tiempo: min(40 s, lo que queda ÷ negocios que faltan), reloj inyectado. Lo demás: «preparar al abrir».
Atraso de 7 días como gestion.server.ts:124-139. Avisos: gestion.server.ts:170-179.
Gasto (03 §11): ya lo construyó 1C. Acá cada redacción toma vigencia y reserva en una transacción, y se
suma el aviso al 80 %. respaldo-core.ts: textos por plantilla del parte automático cuando no hay IA.
ESCRIBÍ PRIMERO: M2 y M3; apagar el interruptor entre dos redacciones → no sale otra; y dos barridos a la
vez → un parte y un aviso. Con el rol app_rls, el parte de A trae sus números, no cero.
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación:** que el barrido no cierre ni conteste un pedido `EN_BANDEJA`; que el barrido de un negocio no lea
otro **y que lea el propio**; que ninguna llamada al modelo
ocurra con una transacción abierta; idempotencia con dos corridas a la vez; que el tope no se pase con llamadas
simultáneas ni quede trabado si la función se corta; que sin `CRON_SECRET` no corra (`route.ts:17-20`).

---

## Tanda 4 — Cuentas a pagar y Bancos

### Brief 4A · Cuentas a pagar

```
Rol: ingeniero del ERP (Opus alto; superficie: plata, sólo lectura).
Diseño: 02 §1.3 y 03 §4.1. Herramientas pagos.resumen, pagos.de_la_semana, pagos.sin_factura (aviso
interno, nivel 2) y pagos.proponer_semana (nivel 1; al aprobar crea compromisos, no paga).
Lecturas, sólo en la fase de lectura: empresa.server.ts:20-43 (tipo PAGO), :82 (cashflow), :113 (saldos).
Ninguna recibe la conexión: no se llaman dentro de una transacción. Los saldos proyectados los calcula el
código en centavos enteros.
Tests: mismo número que Administración; casos T3, T5, T9; saldo insuficiente.
Verificación: tsc · tests. Informe ≤ 300 palabras.
```

### Brief 4B · Bancos

```
Rol: ingeniero del ERP (Opus alto; superficie: plata y datos).
Diseño: 02 §1.4 y 03 §7.1 (única escritura de negocio permitida).
Extraé la regla de src/lib/proyectos/acciones-empresa.ts:227-244 a conciliarEnTx(tx, …) y dejá la acción
actual llamándola dentro de tenantTransaction. NO copies su carrera (:238-239 comprueba y después
actualiza, sin transacción; cuotaId no es único, prisma/schema.prisma:4082): candado de fila sobre la cuota
(SELECT … FOR UPDATE con su AND "tenantId" a mano, src/lib/rls.ts:105-112), comprobar, updateMany
condicional.
Herramientas bancos.sin_conciliar y bancos.proponer_conciliacion: sólo importe y sentido exactos y un único
candidato; hasta 20 pares; cada par se aprueba por separado. No marca la cuota como pagada.
Importes en Float (schema.prisma:3852 y :4079): comparar en centavos enteros, nunca con ===.
ESCRIBÍ PRIMERO conciliacion-carrera-postgres: dos movimientos a la misma cuota a la vez → uno gana; el
par se concilia a mano mientras espera → VENCIDA. Además: T10 (dos candidatos → deriva), otra moneda →
deriva, no regresión de la conciliación manual.
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación (plata y datos):** que la conciliación propuesta no pueda atar una cuota ya conciliada ni de sentido
opuesto, tampoco con dos pedidos a la vez; redondeo; que nada marque pagado; que la acción manual no cambie salvo en
la carrera que se cierra.

---

## Tanda 5 — Medir, elegir modelo y consola

Un constructor Opus alto, más revisión de Codex. Contenido:
1. Corrida de los 30 casos contra 2 o 3 modelos candidatos **sólo si el dueño aprobó el gasto** (`05` D1): tabla de
   aciertos, costo por pedido y por parte, y calibración del estimado de tokens de entrada. El resultado se guarda
   en esta carpeta: **sin esa corrida no se prende la IA sobre datos reales** (`03` §12).
2. CI: los 30 casos con guion, por la ruta 1 (respuestas grabadas) y por la ruta 3 (sin modelo). La opción B queda
   como interfaz: no se construye un segundo adaptador (`03` §10).
3. Consola del operador: **fijar el tope de gasto por negocio** y ver el gasto del mes (certificación de seguridad).
   Prender y apagar los dos interruptores no es trabajo de esta tanda: sale del catálogo desde la tanda 1 (`03` §12).
4. Informe mensual (pestaña y PDF simple) — **apta para Codex** como segundo constructor: sólo lee el registro y los
   pedidos. Separa lo respondido por el código, por el modelo y por una persona de GSG (`03` §4.3).
5. La consola del operador ya tiene la bandeja de GSG desde la tanda 1 (brief 1D): lo de esta tanda se suma a esa
   sección sin tocar sus dos acciones ni abrirle una entrada automática.

## Tanda 6 — Comprobantes y base para el equipo de Dirección

Se construye en cadena, después de la tanda 5, sin esperar la prueba medida con MIA (decisión del dueño, 14/11: las 6
tandas completas). Lo que sí espera esa prueba es prenderla en un negocio con datos reales. Comprobantes (R1, R2) en
nivel 1.

**Equipo de Dirección (Ale), en el mismo negocio (decisión del dueño, 14/11).** No es otro negocio ni otro rubro: es
otro archivo en `src/lib/agentes/puestos/` y sus herramientas, junto a las de Administración. Sus puestos no están
diseñados (`05`, S14: falta relevar qué quiere Ale). Esta tanda deja probado, con un equipo de prueba, que el motor lo
admite sin tocarse: rol base Dirección con módulos declarados uno por uno, panel con dos equipos, parte por equipo, y
que **Administración no ve el equipo de Dirección ni su registro**. Lo prueba Dirección. Si hiciera falta tocar el
motor, las tablas o el panel, es señal de que algo de Administración se filtró al motor: se corrige ahí.

## Medición al cierre de cada tanda

`medir-consumo.mjs` sobre los transcripts (tokens, US$ por modelo) y fila en `00-ESTADO/metricas/esfuerzo-alto.md`.
Se anota aparte lo que encontró Codex y lo que encontró la certificación de Opus, para saber si la revisión de otra
familia de modelos suma hallazgos distintos.
