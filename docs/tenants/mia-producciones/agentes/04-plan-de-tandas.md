# Equipo de agentes de Administración · MIA — 04 · Plan de tandas

> Diseño del 14/11/2026, **corregido el 14/11 tras la revisión adversarial y con las decisiones del dueño de ese día**
> (`05`, sección F). Cada tanda: 1 o 2 constructores Opus 5.5 en esfuerzo alto, una rama, un PR, CI verde por nombre
> contra `main`. Ninguna tanda despliega ni aplica nada a Neon: la migración se escribe sin aplicar y el interruptor
> nace apagado. Publicar y Gate 2 siguen las reglas vigentes (tanda de 6 o más PR; la migración, del dueño, PR por PR).

## Reglas comunes a todos los briefs

- Paso 0: `get_session` (modelo Opus 5.5, esfuerzo alto, ventana 400000) y `git status`.
- Leer sólo los `archivo:línea` del brief y la sección indicada de `03-especificacion-tecnica.md`.
- Sin dependencias nuevas. Sin `Date.now()` en reglas ni en tests. Commit por pathspec explícito.
- **Tres fases, siempre** (`03` §4.1): leer fuera de transacción, llamar al modelo fuera de transacción, escribir en
  una transacción corta y sólo con `tx`.
- Informe ≤ 300 palabras: qué, verificación n/n, archivo:línea, pendientes.
- Tests y `tsc` devuelven sólo el resumen.

## Quién revisa: Opus certifica, Codex desafía

Dato del dueño (14/11): GSG va a tener una suscripción de **Codex** (el agente de programación de OpenAI) para este
producto.

- **Rol propuesto:** revisor independiente, de otra familia de modelos, del diseño (estos cinco documentos) y de
  cada PR. Cumple el punto 4 del lema («un agente distinto del que lo hizo busca por qué podría estar mal»).
- **Segundo constructor, sólo en tandas acotadas** que no toquen plata, seguridad, concurrencia ni datos: marcadas
  abajo con «apta para Codex». Tras la revisión queda una sola: el informe mensual (tanda 5). Agenda y cuaderno dejó
  de serlo: ahora lleva cupos, clave única y búsqueda en la memoria.
- **Todo lo que haga Codex entra por PR y CI**, igual que el resto. Sus hallazgos se anotan en el PR; no reemplazan
  la certificación adversarial de Opus en plata, seguridad, concurrencia y datos: se suman.
- **No corre el producto:** ninguna suscripción personal es motor de los agentes (decisión del dueño, 14/11; `05`, D8
  y D4-bis).
- Provisional a confirmar: plan exacto, dónde corre, acceso al repositorio y términos de uso (`05`, S9).

## Resumen

| Tanda | Qué deja | Constructores | Certificación adversarial | Migración |
|---|---|---|---|---|
| 1 | **Cobranzas conversa y Coordinación arma el parte**, con origen de cada dato armado por el código, registro y pausa. Listo para probar en el ambiente de MIA cuando se publique y se aplique la migración | 2 (A motor, B herramientas y panel) | Seguridad y datos (aislamiento, sólo lectura, permisos, inyección) | Se escribe, sin aplicar |
| 2 | Para aprobar, recordatorio de cobro por plantilla, agenda con confirmación y cuaderno | 2 | Concurrencia (propuestas y cupos) y seguridad (salida a terceros) | No |
| 3 | Tarea diaria en tres pasos, parte automático, seguimiento de compromisos, tope de gasto estricto, respaldo sin IA | 1 | Concurrencia y plata (gasto) | No |
| 4 | Cuentas a pagar y Bancos (conciliación al aprobar, sin la carrera de hoy) | 2 | Plata y datos | No |
| 5 | 30 casos contra el modelo real (condición para salir en vivo), elección de modelo, opción B en CI, consola del operador, informe mensual | 1 + revisión | Seguridad (consola) | No |
| 6 | Comprobantes; base probada para el equipo de **Dirección** de MIA (Ale), en el mismo negocio | 1 | Datos y permisos | A definir |

Dependencias: 1 → 2 → 3; 4 después de 2; 5 después de 3; 6 después de 5 y de la prueba medida.
Fuera de este plan: el equipo de la propia GSG (`05`, sección D: próximo diseño).

---

## Tanda 1 — Motor y primer puesto (deja algo usable)

### Brief 1A · constructor del motor

```
Rol: ingeniero del ERP (Opus alto; seguridad y datos). Tarea: motor de agentes, sin pantalla.
Diseño: 03-especificacion-tecnica.md §2-§6.1 y §9-§13.
Construí en src/lib/agentes/ los archivos de 03 §2, salvo propuestas, memoria, barrido, respaldo, plantillas
y proveedor-claude. gasto.server.ts: versión simple (fila del mes con ON CONFLICT y control antes de llamar).
Migración prisma/migrations/<timestamp sin colisión>_agentes_base, 10 tablas (03 §3): sólo CREATE, único
(tenantId,id) y claves compuestas, únicos parciales en SQL, RLS y REVOKE UPDATE, DELETE de AgenteAccion
a app_rls (si el rol existe). Patrón:
prisma/migrations/20261106120000_support_ticket/migration.sql:29-31, :51, :54-58. NO se aplica.
Modelos al final de prisma/schema.prisma. El mismo REVOKE, al final de prisma/rls/0002_app_role.sql.
No se negocia:
- Tres fases (03 §4.1). Motivo: src/lib/rls.ts:118-119 y :172-174.
- ctx.db de sólo lectura; las herramientas no importan Prisma (03 §6.1).
- Varios equipos por negocio: el catálogo declara equipo, rol base y módulos (03 §2).
- El modelo nunca recibe tenantId. No modificar src/lib/proyectos/ia.server.ts.
Patrones: falta de tablas, src/lib/contabilidad/modulo.server.ts:40-56; interruptor «equipo-agentes»
(apagado), src/cambios/interruptores.ts:66; su lectura, modulo.server.ts:20-37; datos como datos,
src/lib/proyectos/diseno-core.ts:377-385.
ESCRIBÍ PRIMERO: agentes-aislamiento-postgres (rol app_rls: A ve lo suyo, más de cero, y nada de B; leer
dentro de una transacción lanza; UPDATE y DELETE de AgenteAccion rechazados) y topes-carrera-postgres.
Además: permisos-core, cifras-core (atribución), texto-seguro-core, gasto-core, motor (el guion falla si
lo llaman dentro de una transacción), solo-lectura, guardia-escrituras, estado-sin-migracion, y dos
equipos en un negocio (cada persona ve sólo los suyos).
Verificación: npx tsc --noEmit · node --import tsx --test <archivos> · npm run gates.
Entrega: rama, PR en borrador, informe ≤ 300 palabras.
```

### Brief 1B · constructor de herramientas y panel

```
Rol: ingeniero del ERP (Opus alto). Tarea: puestos Cobranzas (sólo lectura) y Coordinación (parte a pedido),
y panel «Mi equipo». Depende de tipos.ts de 1A (hasta que esté, contra la interfaz de 03 §4).
Diseño: 02-especificacion-funcional.md §1.1, §1.2, §2, §3 y 03 §4, §4.2, §5.
Construí:
- src/lib/proyectos/agentes/actor-agente.server.ts: rol base del equipo y recorte en tres capas (módulo,
  proyectos, columnas): gestion.server.ts:44-46, :62-66, :69-72.
- herramientas-cobranzas y -coordinacion: SÓLO las lecturas existentes (empresa.server.ts:20-43 y :46,
  cobranza.server.ts:75, cobranza-core.ts:334), en la fase de lectura, sin importar Prisma. Devuelven
  filas con entidad, etiquetas, cifras y origen (03 §4).
- acciones-equipo.ts ("use server"): conversar, armarParte (AgenteParte, cupo de 3 por día), pausar,
  reanudar. Cada una: actorActual + módulo «agentes» + interruptor (gestion.server.ts:33-60).
- módulo y app: gestion-core.ts:616-631, :645-651, :675-684, :704-712; src/apps/catalogo/comercial.ts:302.
- src/app/admin/(dashboard)/proyectos/mi-equipo/: Hoy, Conversar, Registro, Ajustes. Declarar maxDuration
  (como proyectos/agentes/page.tsx:10). Renglones y orígenes los dibuja el código (03 §4.2).
- demo de desarrollo: prender «equipo-agentes» en prisma/seed-mia-producciones.ts:63-64. NO desde scripts/
  (rompe src/cambios/interruptores-escritura.test.ts).
Historial en la base (AgenteConversacion, AgenteMensaje). Kit: DESIGN.md y .claude/rules/. 375 px. Sello GSG.
Tests: cobranzas-mismo-numero-postgres (al centavo), agentes-permisos-postgres (un rol que no ve todo no
recibe proyectos ni columnas ajenas), casos T1, T2, T4, T6, T12 con guion, acceso por rol.
QA en la demo en memoria: guion de 02 §6, pasos 1-6 y 12-14, clic por clic.
Verificación: tsc · tests · npm run build. Informe ≤ 300 palabras.
```

### Brief 1C · adaptador pago — **sólo si el dueño elige clave de API en `05` D4-bis**

```
Rol: ingeniero del ERP (Opus alto; superficie: plata, por el gasto).
Diseño: 03 §10 y §11. Construí src/lib/agentes/proveedor-claude.server.ts leyendo la forma del pedido, los
campos de consumo y los modelos en la documentación oficial (skill claude-api), con cita en el PR.
La clave va en una variable propia del equipo, NO en ANTHROPIC_API_KEY: esa la leen los agentes actuales
(src/lib/proyectos/ia.server.ts:40 y :85) y cargarla los cambiaría de proveedor sin tope.
Adelantá de la tanda 3 el gasto estricto de 03 §11: fila del mes, reserva condicional que vence y se cobra,
estimado con entrada y salida. Precios: de la página oficial, citados con fecha.
ESCRIBÍ PRIMERO gasto-carrera-postgres. CI sin red: el adaptador se prueba con respuestas grabadas.
Verificación: tsc · tests. Informe ≤ 300 palabras.
```

**Certificación de la tanda 1 (Opus alto, sobre el diff):** aislamiento entre negocios con el rol sin bypass, mirando
que lo propio **aparezca**; que ninguna herramienta tenga un camino de escritura; que ninguna acción de servidor quede
sin control de módulo e interruptor; recorte por proyectos y columnas; inyección por concepto de cuota y por nombre de
cliente; que el modelo no pueda fijar `tenantId`, importes ni orígenes; que la migración no toque tablas existentes.
**Revisión de Codex:** el PR completo, buscando caminos sin registro.

### Prueba sobre lo real, después de la tanda 1 (decisión del dueño, 14/11)

No hay demo para el dueño: prueba en el ambiente de MIA (`03` §15). Pasos, en orden, y de quién es cada uno:

1. El PR de la tanda 1 entra en una tanda de publicación (6 o más PR, un push a `main`) — orquestadora.
2. **Gate 2:** aplicar la migración en la base donde vive el negocio de MIA, con respaldo previo — **decisión del
   dueño, PR por PR**. Si el despliegue tiene `MIGRATE_DATABASE_URL`, publicar el PR ya la aplica.
3. Confirmar en qué base y en qué despliegue vive hoy MIA (`05`, S15: provisional a confirmar).
4. Decidir el «cerebro» de la prueba (`05`, D4-bis: abierta) y cargar su configuración.
5. Prender `equipo-agentes` sólo para MIA, desde la consola del operador.
6. Cargar a mano datos inventados (clientes, eventos, cuotas vencidas y por vencer).
7. **Prueba el dueño** con el guion de `02` §6 (con la tanda 1: pasos 1 a 6 y 12 a 14).
8. **Después prueba Mariana** el equipo de Administración.

---

## Tanda 2 — Aprobar, recordar y no olvidar

### Brief 2A · propuestas, aprobación y recordatorio

```
Rol: ingeniero del ERP (Opus alto; superficie: concurrencia y seguridad).
Diseño: 03 §7, §13 (inyección hacia afuera) y 02 §3. Construí src/lib/agentes/propuestas.server.ts,
plantillas-core.ts, la herramienta cobranzas.preparar_recordatorio y la pestaña «Para aprobar» (Aprobar,
Corregir y aprobar, Rechazar, Deshacer 5 s).
- Crear: leer fuera de transacción; adentro huella(tx), cupo e INSERT. Choque del único parcial → devuelve
  la abierta.
- Decidir: una transacción corta: updateMany PENDIENTE→EJECUTADA con count === 1 (recurso de
  src/lib/proyectos/acciones-empresa.ts:239-240), huella(tx), ejecutar(tx). FALLIDA, rechazar y vencer:
  condicionales sobre PENDIENTE. Aprobar exige exigirEditar (gestion.server.ts:56-60).
- El recordatorio sale de la plantilla con datos puestos por el código; el modelo elige la variante y suma,
  como mucho, una frase que pasa texto-seguro-core. Campo con enlace, CBU o alias → no se arma: deriva.
- Tras aprobar: Copiar, WhatsApp y mail resueltos por el panel (consulta-core.ts:67). El sistema no envía.
ESCRIBÍ PRIMERO propuestas-carrera-postgres: doble aprobación → una ejecución; dos «crear» a la vez → una;
rehacer tras rechazo; FALLIDA no pisa una decisión ganadora; cuota cobrada en el medio → VENCIDA.
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
Diseño: 03 §8, §10 (ruta 3) y §11.
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
Gasto estricto (03 §11; si ya lo hizo 1C, sólo revisarlo): fila del mes con ON CONFLICT, reserva
condicional que vence a los 120 s y se cobra, estimado con entrada y salida, aviso al 80 %.
respaldo-core.ts: parte y respuestas sin IA.
ESCRIBÍ PRIMERO: gasto-carrera-postgres (primera llamada del mes; N a la vez; función cortada), M2 y M3, y
dos barridos a la vez → un parte y un aviso. Con el rol app_rls, el parte de A trae sus números, no cero.
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

## Tanda 5 — Medir, elegir modelo, opción B y consola

Un constructor Opus alto, más revisión de Codex. Contenido:
1. `proveedor-claude.server.ts` leyendo la documentación oficial (skill `claude-api`), con cita en el PR, si no lo
   hizo ya el brief 1C.
2. Corrida de los 30 casos contra 2 o 3 modelos candidatos **sólo si el dueño aprobó el gasto** (`05` D1): tabla de
   aciertos, costo por conversación y por parte, y calibración del estimado de tokens de entrada. El resultado se guarda
   en esta carpeta: **sin esa corrida no se sale en vivo con datos reales** (`03` §12).
3. CI: los 30 casos con guion por ruta 2 y ruta 3 (opción B probada sin gastar).
4. Consola del operador: prender y apagar `equipo-agentes` y fijar el tope por negocio (certificación de seguridad).
5. Informe mensual (pestaña y PDF simple) — **apta para Codex** como segundo constructor: sólo lee el registro.

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
