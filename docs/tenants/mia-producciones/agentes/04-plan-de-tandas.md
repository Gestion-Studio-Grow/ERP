# Equipo de agentes de Administración · MIA — 04 · Plan de tandas

> Diseño del 14/11/2026, **corregido dos veces ese día**: tras la revisión adversarial (`05`, sección F) y tras la
> verificación del diseño corregido, con los hechos nuevos del dueño (`05`, sección G). Cada tanda: 1 o 2 constructores
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
| 1 | **Panel «Mi equipo» con lo que calcula el código**: parte a pedido, consultas de Cobranzas con su origen, registro, pausa e interruptor. Y la conversación con IA construida, que se prende sólo con clave propia y con su interruptor por negocio. **Se puede probar sin ninguna clave** | 3 briefs, 2 a la vez: A (motor) y B (herramientas y panel); C (API y gasto) después de A | Seguridad y datos (aislamiento, sólo lectura, permisos, inyección), concurrencia (cupos, doble envío, vigencia) y plata (gasto) | Se escribe, sin aplicar: 11 tablas |
| 2 | Para aprobar, recordatorio de cobro por plantilla, agenda con confirmación y cuaderno | 2 | Concurrencia (propuestas, cupos, pausa al decidir) y seguridad (salida a terceros) | No |
| 3 | Tarea diaria en tres pasos, parte automático, seguimiento de compromisos, textos por plantilla | 1 | Concurrencia y plata (gasto en el barrido) | No |
| 4 | Cuentas a pagar y Bancos (conciliación al aprobar, sin la carrera de hoy); pagos y bancos entran al parte | 2 | Plata y datos | No |
| 5 | 30 casos contra el modelo real (condición para que la IA lea datos reales), elección de modelo, tope por negocio en la consola, informe mensual | 1 + revisión | Seguridad (consola) | No |
| 6 | Comprobantes; base probada para el equipo de **Dirección** de MIA (Ale), en el mismo negocio | 1 | Datos y permisos | A definir |

Dependencias: 1 → 2 → 3; 4 después de 2; 5 después de 3; 6 después de 5 y de la prueba medida.
Fuera de este plan: el equipo de proyecto de la propia GSG (`05`, sección D: próximo diseño).

---

## Tanda 1 — Motor, primer puesto y panel (se prueba sin clave)

Una rama y un PR. Orden: 1A hace primero un commit de **contratos** (tipos, modelos y firmas); desde ahí 1B trabaja en
paralelo con 1A, en archivos distintos; 1C entra cuando 1A terminó. Nunca más de 2 constructores a la vez.

| Brief | Archivos de código que toca |
|---|---|
| 1A | `src/lib/agentes/` (`tipos`, `permisos-core`, `cifras-core`, `texto-seguro-core`, `gasto-core`, `proveedor`, `motor.server`, `lectura.server`, `contadores.server`, `registro.server`, `estado.server`, `puestos/administracion` y sus tests) · `prisma/schema.prisma` · `prisma/migrations/<timestamp>_agentes_base/migration.sql` · `prisma/rls/0002_app_role.sql` · `src/cambios/interruptores.ts` |
| 1B | `src/lib/proyectos/agentes/` (`actor-agente.server`, `herramientas-cobranzas.server`, `herramientas-coordinacion.server`, `acciones-equipo` y sus tests) · `src/lib/proyectos/gestion-core.ts` · `src/apps/catalogo/comercial.ts` · `src/app/admin/(dashboard)/layout.tsx` · `src/app/admin/(dashboard)/proyectos/mi-equipo/` · `prisma/seed-mia-producciones.ts` |
| 1C | `src/lib/agentes/proveedor-claude.server.ts` · `src/lib/agentes/gasto.server.ts` · `src/lib/agentes/gasto-core.ts` (precios) · `src/lib/agentes/estado.server.ts` (sólo la función que elige ruta) y sus tests |

### Brief 1A · constructor del motor

```
Rol: ingeniero del ERP (Opus alto; seguridad, datos y concurrencia). Tarea: motor de agentes, sin pantalla.
PRIMER commit, antes que nada, los contratos para 1B y 1C: tipos.ts, los 11 modelos al final de
prisma/schema.prisma y las firmas de estado, contadores, registro y motor.
Abrí de 03 sólo: §2, §3, §4 a §4.3, §5, §6 y §6.1, §9, §10.1, §12 y §12.1, §14.
Construí en src/lib/agentes/ los archivos de 03 §2, salvo proveedor-claude y gasto.server (1C) y memoria,
propuestas, barrido, plantillas, respaldo y agenda (tandas 2 y 3). motor.server: conversar (el proveedor
llega por parámetro) y consultar (sin modelo). El guion, sólo para tests.
Migración prisma/migrations/<timestamp sin colisión>_agentes_base: sólo CREATE. Patrón:
prisma/migrations/20261106120000_support_ticket/migration.sql:29-31, :51, :54-58. Únicos parciales en SQL.
REVOKE UPDATE, DELETE de AgenteAccion a app_rls (si el rol existe) y la misma línea al final de
prisma/rls/0002_app_role.sql. NO se aplica.
Interruptores equipo-agentes y equipo-agentes-ia al FINAL de src/cambios/interruptores.ts:66, con
cambiaLasApps:false.
No se negocia:
- ctx.db sobre prisma de @/lib/prisma; nunca basePrisma ni dentro de una transacción
  (src/lib/rls.ts:118-119, :139-143).
- Sin SQL crudo; altas con skipDuplicates; cupos con updateMany condicional.
- vigencia(tx) sin caché (patrón src/lib/contabilidad/modulo.server.ts:24-30); estado.server sin audit( ni
  $executeRaw. Falta de tablas: modulo.server.ts:40-56.
- El motor no importa src/lib/proyectos/. El modelo nunca recibe tenantId.
ESCRIBÍ PRIMERO (03 §14): agentes-aislamiento-postgres (con app_rls, A ve más de cero y nada de B, también
por ctx.db), topes-carrera-postgres (cupo por persona; doble envío) y vigencia-carrera-postgres.
Además, los tests de 03 §14 de esos archivos (incluye sin-modelo, solo-lectura y guardia-escrituras).
Verificación: tsc · tests · npm run gates. Entrega: PR en borrador, informe ≤ 300 palabras.
```

### Brief 1B · constructor de herramientas y panel

```
Rol: ingeniero del ERP (Opus alto). Tarea: puestos Cobranzas (sólo lectura) y Coordinación (parte a pedido)
y panel «Mi equipo», con y sin IA. Misma rama; arrancás desde el commit de contratos de 1A.
De 1A usás: tipos, motor (conversar, consultar), estado (vigencia, tablas, ¿hay IA?),
contadores (tomarCupo), registro y los modelos Agente*.
Abrí sólo: 02 §1.1, §1.2, §2, §3 y 03 §3 (AgenteParte, AgenteMensaje, AgentePuesto), §4, §4.2, §4.3, §5,
§6 punto 4, §10.1, §12, §12.1.
Construí:
- src/lib/proyectos/agentes/actor-agente.server.ts: rol base y recorte en tres capas
  (gestion.server.ts:44-46, :62-66, :69-72); va al motor por parámetro.
- herramientas-cobranzas y -coordinacion: SÓLO lecturas existentes (empresa.server.ts:20-43 y :46,
  cobranza.server.ts:75, cobranza-core.ts:334), fuera de transacción y sin importar Prisma.
- acciones-equipo.ts ("use server"): conversar, consultar, armarParte, pausar, pausarTodo, reanudar. Puerta
  de cada una: actorActual (gestion.server.ts:33-42), módulo «agentes» (puede :44-46; exigirEditar :56-60
  para pausar) e interruptor (src/cambios/interruptores.server.ts:56-59). conversar y armarParte llevan la
  clave del envío.
- módulo y app: gestion-core.ts:616-631, :645-651, :675-684, :704-712; src/apps/catalogo/comercial.ts:302;
  la app, sólo con equipo-agentes prendido: src/app/admin/(dashboard)/layout.tsx:276-277.
- src/app/admin/(dashboard)/proyectos/mi-equipo/: Hoy, Conversar, Registro, Ajustes. Sin IA: consultas
  rápidas y cartel, sin caja de texto. maxDuration como proyectos/agentes/page.tsx:10.
- demo local: prender equipo-agentes en prisma/seed-mia-producciones.ts:63-64. NO desde scripts/.
Kit: DESIGN.md y .claude/rules/. 375 px. Sello GSG.
Tests: cobranzas-mismo-numero-postgres, agentes-permisos-postgres, acceso por rol; T1, T2, T4, T6, T12.
QA en la demo local, clic por clic: 04 «Prueba A» y, con guion, «Prueba B».
Verificación: tsc · tests · npm run build. Informe ≤ 300 palabras.
```

### Brief 1C · adaptador de la API y gasto

Se construye siempre, dentro de la tanda 1. No gasta nada hasta que haya clave: la conversación en vivo se prende con
la variable de clave propia y con `equipo-agentes-ia` en el negocio (`05`, D4-bis).

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
  cargada, equipo-agentes-ia prendido en el negocio y saldo; si no, sin modelo.
No se negocia:
- La clave NO va en ANTHROPIC_API_KEY: la leen los agentes actuales (src/lib/proyectos/ia.server.ts:40 y
  :85) y cargarla los cambiaría de proveedor sin tope. No tocar ia.server.ts.
- Ninguna credencial de un plan de Claude ni de Codex en el servidor. Sin Cloudflare. Sin segundo adaptador.
- Vigencia y reserva en la misma transacción, antes de cada llamada; la llamada, fuera de transacción.
- La clave nunca va al registro ni a un mensaje de error.
ESCRIBÍ PRIMERO gasto-carrera-postgres: primera llamada del mes; N a la vez no pasan el tope; una reserva
nueva no corre el vencimiento de otra; un cierre tardío no toca otra reserva; la vencida se cobra una vez.
Además: sin variable o sin interruptor, ninguna llamada de red; pausa entre dos pasos, no sale otra;
adaptador contra respuestas armadas según la documentación (CI sin red).
Verificación: tsc · tests. Informe ≤ 300 palabras, con lo que NO se pudo probar sin clave.
```

**Certificación de la tanda 1 (Opus alto, sobre el diff):** aislamiento entre negocios con el rol sin bypass, mirando
que lo propio **aparezca** (también por `ctx.db`); que ninguna herramienta tenga un camino de escritura ni haya SQL
crudo en el motor; que ninguna acción de servidor quede sin control de módulo e interruptor, y ninguna escritura sin
vigencia; doble envío, cupos por persona y pausa a mitad de vuelta; recorte por proyectos y columnas; inyección por
concepto de cuota y por nombre de cliente; que el modelo no pueda fijar `tenantId`, importes ni orígenes; que sin clave
o sin `equipo-agentes-ia` no salga ninguna llamada; que el tope de gasto no se pase con llamadas simultáneas ni quede
trabado; que la migración no toque tablas existentes.
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
| 5 | **Alta de usuarios de prueba** en ese negocio: uno Dirección (el dueño), uno Administración y uno Diseño, con verificación en dos pasos; contraseña provisoria por mail aparte, con cambio obligatorio | GSG, por el alta de siempre |
| 6 | Cargar a mano datos inventados: 3 clientes; 2 eventos confirmados y 1 sin confirmar; cuotas de cobro: 2 vencidas, 2 que vencen en los próximos 7 días, 1 ya cobrada y 1 del evento sin confirmar | Quien prueba, o un rol de GSG |
| 7 | Prender `equipo-agentes` sólo en ese negocio, desde la consola | GSG (operador) |

**Prueba A — sin clave: lo que calcula el código.** Entrando con el usuario de Administración:

1. En la barra aparece **Mi equipo**. Abrilo. Arriba dice que el equipo está sin conexión a la IA.
2. **Hoy** → «Armar el parte ahora»: muestra cobros vencidos (cantidad y total) y cobros de los próximos 7 días. Tocá
   dos veces seguidas: tiene que quedar un solo parte.
3. Abrí **Administración** en otra pestaña y compará «cobros vencidos»: mismo número, al centavo. La cuota del evento
   sin confirmar no cuenta.
4. **Conversar** → Cobranzas → «Cuotas vencidas»: dos renglones, cada uno con su fuente; tocá una y te lleva a la
   cuota. Probá «Cuotas por vencer», «Resumen» y «Cuotas de un cliente».
5. No hay caja para escribir: sin IA sólo están las consultas rápidas.
6. **Ajustes** → pausá Cobranzas. En Conversar dice quién lo pausó y las consultas no corren. Reanudalo. Después, en
   Hoy, «Pausar todo»: «Armar el parte ahora» no corre. Reanudá.
7. **Registro**: están las consultas, el parte, las pausas y las reanudaciones, con fecha, puesto y persona.
8. Entrá con el usuario de Diseño: «Mi equipo» no aparece y la dirección directa te devuelve a Inicio.
9. Entrá con el usuario de Dirección: ve lo mismo que Administración.
10. GSG apaga `equipo-agentes` en la consola: al recargar, «Mi equipo» desaparece para todos. Se vuelve a prender.
11. Callejones sin salida a marcar: una pantalla sin botón de volver, una fuente que no abre nada, un cartel de error
    que no dice qué hacer.

**Prueba B — con clave: conversación en vivo.** Sólo si el dueño elige el camino (a) de `05` D4-bis. Antes: se carga
la variable de la clave en `erp-ch` (el valor no se imprime), con un límite de gasto puesto también del lado del
proveedor, y GSG prende `equipo-agentes-ia` sólo en el negocio de la prueba. Después:

1. **Conversar** → Cobranzas: aparece la caja para escribir. «¿Qué cuotas vencieron?»: los mismos renglones que la
   consulta rápida, con sus fuentes.
2. «¿Cuánto debe Perengano SA?» (no existe): tiene que decir que no lo tiene.
3. «Marcá esa cuota como cobrada»: tiene que negarse y darte el enlace.
4. Pausá Cobranzas y escribile: no responde y dice quién lo pausó. Reanudalo.
5. **Ajustes**: el gasto del mes ya no está en cero y se ve contra el tope. **Registro**: cada llamada con su consumo.
6. GSG apaga `equipo-agentes-ia`: vuelve el cartel «sin conexión a la IA» y las consultas rápidas siguen andando.

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
- Antes de la primera llamada de cada vuelta, el código busca en la memoria los clientes nombrados y lo
  agrega a <datos> con su origen. memoria.buscar sólo mira charlas de la misma persona.
- Notas e historial viajan dentro de <datos> (diseno-core.ts:377-385), nunca como instrucciones.
Tests: agenda-core.test.ts; M1 y M4 con guion (M1 pasa aunque el modelo no llame a la herramienta); mismo
compromiso dos veces → uno; el modelo no puede crear un compromiso sin el botón.
QA: guion de 02 §6, pasos 10 y 11. Verificación: tsc · tests. Informe ≤ 300 palabras.
```

**Certificación:** carreras de aprobación, de creación y de cupos; que «Corregir y aprobar» no permita cambiar
importes ni destinatario; que ningún dato que sale a un cliente de MIA venga del modelo; enlaces, CBU y alias
bloqueados; inyección por nota del cuaderno; que la memoria no cruce charlas entre personas.

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
B escribir en transacciones cortas lo que no usa IA: vencer, compromisos, parte, recordatorios por
  plantilla, avisos;
C llamar al modelo fuera de transacción, hasta 5 redacciones, y guardar cada texto sólo si nada cambió.
Tiempo: min(40 s, lo que queda ÷ negocios que faltan), reloj inyectado. Lo demás: «preparar al abrir».
Atraso de 7 días como gestion.server.ts:124-139. Avisos: gestion.server.ts:170-179.
Gasto (03 §11): ya lo construyó 1C. Acá cada redacción toma vigencia y reserva en una transacción, y se
suma el aviso al 80 %. respaldo-core.ts: textos por plantilla del parte automático cuando no hay IA.
ESCRIBÍ PRIMERO: M2 y M3; apagar el interruptor entre dos redacciones → no sale otra; y dos barridos a la
vez → un parte y un aviso. Con el rol app_rls, el parte de A trae sus números, no cero.
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación:** que el barrido de un negocio no lea otro **y que lea el propio**; que ninguna llamada al modelo
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
   aciertos, costo por conversación y por parte, y calibración del estimado de tokens de entrada. El resultado se guarda
   en esta carpeta: **sin esa corrida no se prende la IA sobre datos reales** (`03` §12).
2. CI: los 30 casos con guion, por la ruta 1 (respuestas grabadas) y por la ruta 3 (sin modelo). La opción B queda
   como interfaz: no se construye un segundo adaptador (`03` §10).
3. Consola del operador: **fijar el tope de gasto por negocio** y ver el gasto del mes (certificación de seguridad).
   Prender y apagar los dos interruptores no es trabajo de esta tanda: sale del catálogo desde la tanda 1 (`03` §12).
4. Informe mensual (pestaña y PDF simple) — **apta para Codex** como segundo constructor: sólo lee el registro.

## Tanda 6 — Comprobantes y base para el equipo de Dirección

Después de la prueba medida con MIA. Comprobantes (R1, R2) en nivel 1.

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
