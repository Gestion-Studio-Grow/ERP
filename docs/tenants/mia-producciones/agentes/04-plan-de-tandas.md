# Equipo de agentes de Administración · MIA — 04 · Plan de tandas

> Diseño del 14/11/2026. Cada tanda: 1 o 2 constructores Opus 5.5 en esfuerzo alto, una rama, un PR, CI verde por
> nombre contra `main`. Nada se despliega ni se aplica a Neon desde una tanda: la migración se escribe sin aplicar y
> el interruptor nace apagado. Publicar y Gate 2 siguen las reglas vigentes (tanda de 6 o más PR; migración, del dueño).

## Reglas comunes a todos los briefs

- Paso 0: `get_session` (modelo Opus 5.5, esfuerzo alto, ventana 400000) y `git status`.
- Leer sólo los `archivo:línea` del brief y la sección indicada de `03-especificacion-tecnica.md`.
- Sin dependencias nuevas. Sin `Date.now()` en reglas ni en tests. Commit por pathspec explícito.
- Informe ≤ 300 palabras: qué, verificación n/n, archivo:línea, pendientes.
- Tests y `tsc` devuelven sólo el resumen.

## Quién revisa: Opus certifica, Codex desafía

Dato del dueño (14/11): GSG va a tener una suscripción de **Codex** (el agente de programación de OpenAI) para este
producto.

- **Rol propuesto:** revisor independiente, de otra familia de modelos, del diseño (estos cinco documentos) y de
  cada PR. Cumple el punto 4 del lema («un agente distinto del que lo hizo busca por qué podría estar mal»).
- **Segundo constructor, sólo en tandas acotadas** que no toquen plata, seguridad ni datos: marcadas abajo con
  «apta para Codex». Todo lo demás se construye y se certifica en Opus alto, como manda el `CLAUDE.md`.
- **Todo lo que haga Codex entra por PR y CI**, igual que el resto. Sus hallazgos se anotan en el PR; no reemplazan
  la certificación adversarial de Opus en plata, seguridad, concurrencia y datos: se suman.
- **No corre el producto:** los agentes de MIA no usan esa suscripción (ver `05`, D8 y S9).
- Provisional a confirmar: plan exacto, dónde corre, acceso al repositorio y términos de uso (`05`, S9).

## Resumen

| Tanda | Qué deja | Constructores | Certificación adversarial | Migración |
|---|---|---|---|---|
| 1 | **El dueño conversa con Cobranzas y arma el parte en la demo**, con origen de cada dato, registro y pausa | 2 (A motor, B herramientas y panel) | Seguridad y datos (aislamiento, permisos, inyección) | Se escribe, sin aplicar |
| 2 | Para aprobar, recordatorio de cobro, agenda y cuaderno | 2 | Concurrencia (doble aprobación) y seguridad | No |
| 3 | Tarea diaria, parte automático, seguimiento de compromisos, tope de gasto estricto, respaldo sin IA | 1 | Concurrencia y plata (gasto) | No |
| 4 | Cuentas a pagar y Bancos (conciliación al aprobar) | 2 | Plata y datos | No |
| 5 | 30 casos contra el modelo real, elección de modelo, opción B en CI, consola del operador, informe mensual | 1 + revisión | Seguridad (consola) | No |
| 6 | Comprobantes; base lista para el equipo de Ale | 1 | Datos | A definir |

Dependencias: 1 → 2 → 3; 4 después de 2; 5 después de 3; 6 después de 5 y de la prueba medida.

---

## Tanda 1 — Motor y primer puesto (deja algo usable)

### Brief 1A · constructor del motor (≈ 1,9 KB)

```
Rol: ingeniero del ERP (Opus alto). Tarea: motor de agentes, sin pantalla.
Diseño: docs/tenants/mia-producciones/agentes/03-especificacion-tecnica.md §2-§6, §9-§13.
Construí en src/lib/agentes/: tipos.ts, permisos-core.ts, cifras-core.ts, gasto-core.ts, proveedor.ts
(interfaz + proveedor de guion), proveedor-esquema.server.ts, motor.server.ts, registro.server.ts,
estado.server.ts, gasto.server.ts (versión simple: control antes de llamar), puestos/administracion.ts.
Migración prisma/migrations/<timestamp sin colisión>_agentes_base: las 8 tablas de §3, sólo CREATE,
RLS copiada de prisma/migrations/20261106120000_support_ticket/migration.sql:54-58. NO se aplica.
Modelos en prisma/schema.prisma (bloque nuevo al final).
Patrones a copiar:
- tolerar la falta de tablas: src/lib/contabilidad/modulo.server.ts:40-56 y repo.ts:62-65
- interruptor por negocio: src/cambios/interruptores.ts:66 (agregar «equipo-agentes», apagado) y
  lectura fuera de pedido: src/lib/contabilidad/modulo.server.ts:20-37
- datos como datos: src/lib/proyectos/diseno-core.ts:377-385
- transacción por negocio: src/lib/rls.ts:176
No modificar src/lib/proyectos/ia.server.ts. El modelo nunca recibe tenantId.
Tests (antes de terminar): permisos-core, cifras-core, gasto-core, motor (guion: 6 pasos, herramienta
inválida, sin IA), estado-sin-migracion, guardia-imports, agentes-aislamiento-postgres (dos negocios).
Verificación: npx tsc --noEmit · node --import tsx --test <archivos> · npm run gates. Sólo resumen.
Entrega: rama, PR en borrador, informe ≤ 300 palabras con n/n y archivo:línea.
```

### Brief 1B · constructor de herramientas y panel (≈ 1,9 KB)

```
Rol: ingeniero del ERP (Opus alto). Tarea: puesto Cobranzas (sólo lectura), Coordinación (parte a pedido)
y panel «Mi equipo». Depende de los tipos de 1A (acordar tipos.ts primero; hasta entonces, contra la interfaz
de 03 §4).
Diseño: 02-especificacion-funcional.md §1.1, §1.2, §2, §3 y 03 §4, §5.
Construí:
- src/lib/proyectos/agentes/actor-agente.server.ts (03 §5; permisoDe en gestion-core.ts:725-729)
- herramientas-cobranzas.server.ts y herramientas-coordinacion.server.ts usando SÓLO las lecturas
  existentes: empresa.server.ts:20-43 y :46, cobranza.server.ts:75, cobranza-core.ts:334
- acciones-equipo.ts ("use server"): conversar, armarParte, pausar, reanudar. Cada una: actorActual +
  módulo nuevo «agentes» + interruptor (gestion.server.ts:33-60)
- módulo y app: gestion-core.ts:616-631, :645-651, :675-684, :704-712; src/apps/catalogo/comercial.ts:302
- src/app/admin/(dashboard)/proyectos/mi-equipo/: pestañas Hoy, Conversar, Registro, Ajustes.
  Referencia de pantalla: proyectos/agentes/page.tsx:13-29 y _diseno-agentes.tsx
- siembra de la demo: prender «equipo-agentes» sólo ahí (scripts/proyectos/demo-local.mjs)
El historial se guarda en la base (AgenteConversacion, AgenteMensaje), no en el navegador.
Kit visual: DESIGN.md y .claude/rules/. Celular 375 px. Sello GSG.
Tests: cobranzas-mismo-numero-postgres (igual a Administración al centavo), casos T1, T2, T4, T6, T12
con guion, acceso por rol (Diseño no entra). QA: guion de 02 §6, pasos 1-6, 12-14, clic por clic.
Verificación: tsc · tests · npm run build. Informe ≤ 300 palabras.
```

**Certificación de la tanda 1 (Opus alto, sobre el diff):** aislamiento entre negocios; que ninguna acción de
servidor quede sin control de módulo e interruptor; inyección por concepto de cuota y por nombre de cliente; que el
modelo no pueda fijar `tenantId` ni importes. **Revisión de Codex:** el PR completo, buscando caminos sin registro.

---

## Tanda 2 — Aprobar, recordar y no olvidar

### Brief 2A · propuestas y aprobación (≈ 1,5 KB)

```
Rol: ingeniero del ERP (Opus alto, superficie: concurrencia y seguridad).
Diseño: 03 §7 y 01 §7. Construí src/lib/agentes/propuestas.server.ts (crear, decidir, ejecutar con huella),
la herramienta cobranzas.preparar_recordatorio y la pestaña «Para aprobar» con Aprobar, Corregir y aprobar,
Rechazar y Deshacer (5 s).
Candado de una sola decisión: mismo recurso que src/lib/proyectos/acciones-empresa.ts:239-240, dentro de
tenantTransaction (src/lib/rls.ts:176). Aprobar exige exigirEditar (gestion.server.ts:56-60).
La tarjeta la arma el código con datos de la base; argumentos y resumen no se editan.
Tras aprobar un recordatorio: botones Copiar, WhatsApp y mail resueltos por el panel
(consulta-core.ts:67); el sistema no envía nada.
ESCRIBÍ PRIMERO: propuestas-carrera-postgres.test.ts (dos aprobaciones a la vez → una ejecución;
cuota cobrada entre propuesta y aprobación → VENCIDA).
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

### Brief 2B · agenda y cuaderno (≈ 1,2 KB) — apta para Codex como segundo constructor

```
Rol: constructor. Sin plata ni permisos nuevos: usa lo de la tanda 1.
Diseño: 02 §2 (pestañas Agenda y Cuaderno), 03 §3 (AgenteCompromiso, AgenteNota), §8.
Construí src/lib/agentes/agenda-core.ts (puro, reloj inyectado), memoria.server.ts, herramientas
agenda.anotar (nivel 2, topes de 02 §1.2), agenda.listar, cuaderno.leer, y las dos pestañas.
Las notas viajan al modelo dentro de <datos> (diseno-core.ts:377-385), nunca como instrucciones.
Tests: agenda-core.test.ts, casos de memoria M1 y M4 con guion, topes de compromisos.
QA: guion de 02 §6, pasos 10 y 11. Verificación: tsc · tests. Informe ≤ 300 palabras.
```

**Certificación:** carrera de aprobación; que «Corregir y aprobar» no permita cambiar importes ni destinatario;
inyección por nota del cuaderno.

---

## Tanda 3 — Que trabaje solo cada mañana, con freno de gasto

### Brief 3 (≈ 1,6 KB)

```
Rol: ingeniero del ERP (Opus alto, superficie: concurrencia y plata).
Diseño: 03 §8, §10 (ruta 3), §11.
Construí src/lib/agentes/barrido.server.ts y sumalo a src/app/api/cron/reminders/route.ts:31-37 con el mismo
patrón (import dinámico, catch, resumen en la respuesta). NO agregar entradas a vercel.json.
Por negocio: patrón de src/lib/proyectos/avisos-programados.server.ts:14-27. Primero lo que no usa IA;
después hasta 5 redacciones con 40 s de presupuesto; el resto queda «preparar al abrir».
Ventana de atraso de 7 días como gestion.server.ts:124-139. Avisos internos: gestion.server.ts:170-179.
Gasto estricto: reserva atómica de 03 §11 en gasto.server.ts; aviso al 80 %.
respaldo-core.ts: parte y respuestas por plantilla sin IA.
ESCRIBÍ PRIMERO: gasto-carrera-postgres.test.ts (N llamadas a la vez no pasan el tope) y los casos de
memoria M2 y M3 (reloj inyectado; dos corridas el mismo día no duplican).
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación:** que el barrido de un negocio no lea otro; idempotencia de la corrida; que el tope no se pase con
llamadas simultáneas; que sin `CRON_SECRET` no corra (`route.ts:17-20`).

---

## Tanda 4 — Cuentas a pagar y Bancos

### Brief 4A · Cuentas a pagar (≈ 1,1 KB)

```
Rol: ingeniero del ERP (Opus alto, superficie: plata, sólo lectura).
Diseño: 02 §1.3. Herramientas pagos.resumen, pagos.de_la_semana, pagos.sin_factura (aviso interno, nivel 2)
y pagos.proponer_semana (nivel 1; al aprobar crea compromisos, no paga).
Lecturas: empresa.server.ts:20-43 (tipo PAGO), :82 (cashflow), :113 (saldos). Los saldos proyectados los
calcula el código en enteros.
Tests: mismo número que Administración; casos T3, T5, T9; saldo insuficiente.
Verificación: tsc · tests. Informe ≤ 300 palabras.
```

### Brief 4B · Bancos (≈ 1,3 KB)

```
Rol: ingeniero del ERP (Opus alto, superficie: plata y datos).
Diseño: 02 §1.4, 03 §6 (única escritura de negocio permitida).
Extraé la regla de src/lib/proyectos/acciones-empresa.ts:227-244 a una función de servidor que reciba la
transacción y dejá la acción actual llamándola (sin cambiar su comportamiento: test de no regresión).
Herramientas bancos.sin_conciliar y bancos.proponer_conciliacion: sólo importe y sentido exactos y un único
candidato; hasta 20 pares; cada par se aprueba por separado. No marca la cuota como pagada.
Modelo de datos: prisma/schema.prisma:4071-4086.
Tests: T10 (dos candidatos → deriva), carrera (el par se concilia a mano mientras espera → VENCIDA),
otra moneda → deriva, no regresión de la conciliación manual.
Verificación: tsc · tests · build. Informe ≤ 300 palabras.
```

**Certificación (plata y datos):** que la conciliación propuesta no pueda atar una cuota ya conciliada ni de sentido
opuesto; redondeo; que nada marque pagado.

---

## Tanda 5 — Medir, elegir modelo, opción B y consola

Un constructor Opus alto, más revisión de Codex. Contenido:
1. `proveedor-claude.server.ts` leyendo la documentación oficial (skill `claude-api`), con cita en el PR.
2. Corrida de los 30 casos contra 2 o 3 modelos candidatos **sólo si el dueño aprobó el gasto** (`05` D1): tabla de
   aciertos, costo por conversación y por parte. Sin aprobación, la tanda entrega todo con guion y deja el comando listo.
3. CI: los 30 casos con guion por ruta 2 y ruta 3 (opción B probada sin gastar).
4. Consola del operador: prender y apagar `equipo-agentes` y fijar el tope por negocio (certificación de seguridad).
5. Informe mensual (pestaña y PDF simple) — **apta para Codex** como segundo constructor: sólo lee el registro.

## Tanda 6 — Comprobantes y base para Ale

Después de la prueba medida con MIA. Comprobantes (R1, R2) en nivel 1. Para Ale: un archivo nuevo en
`src/lib/agentes/puestos/` y sus herramientas en el módulo de su rubro; el motor, las tablas y el panel no se tocan.
Si hiciera falta tocarlos, es señal de que algo de MIA se filtró al motor: se corrige ahí.

## Medición al cierre de cada tanda

`medir-consumo.mjs` sobre los transcripts (tokens, US$ por modelo) y fila en `00-ESTADO/metricas/esfuerzo-alto.md`.
Se anota aparte lo que encontró Codex y lo que encontró la certificación de Opus, para saber si la revisión de otra
familia de modelos suma hallazgos distintos.
