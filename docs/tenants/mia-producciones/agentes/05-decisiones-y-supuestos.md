# Equipo de agentes de Administración · MIA — 05 · Decisiones del dueño y supuestos

> Diseño del 14/11/2026, **corregido el 14/11 tras la revisión adversarial y con las decisiones del dueño de ese día**
> (sección F). Lo reversible (código, pantallas, textos) ya está decidido en `01` a `04`. Acá va sólo lo que es del
> dueño: gasto, exposición a terceros, datos de un cliente, migraciones y permisos.

## A. Decisiones que esperan al dueño

Formato: opciones, **recomendada**, por qué, y qué se arriesga con cada una. Las que el dueño ya tomó el 14/11 dicen
«Decidido» y dejan a la vista lo que implican.

**Abiertas hoy, en orden de urgencia:** D4-bis (cerebro de la prueba) · D13 (migración, Gate 2) · S15 (confirmar dónde
vive el ambiente de MIA) · D1 y D2 (IA y tope con datos reales) · el resto no frena la construcción.

### D1 · Con qué IA trabaja el equipo cuando haya datos reales (gasto)

| Opción | Qué es | Riesgo |
|---|---|---|
| **A (recomendada)** | Construir y probar con el proveedor de guion y datos inventados; contratar la API paga recién para salir en vivo | Ninguno de gasto ahora. La calidad real de redacción se mide más tarde |
| B | Cargar ya una clave paga con tope bajo para medir los 30 casos contra el modelo real | Gasto antes de la venta (choca con «demo → venta → inversión»). Monto a definir con precios leídos en la fuente |
| C | Usar el servicio gratis con datos reales | No recomendada: no está aclarado qué hace con lo enviado (`docs/tenants/mia-producciones/README.md:25-29`) |

**Lo que cambió con la revisión:** el equipo **no sale en vivo con datos reales sin correr los 30 casos contra el modelo
real** (`03` §12). El guion prueba el código, no al modelo. Entonces el gasto de la opción B no se evita: se elige
**cuándo** hacerlo, y a más tardar es antes de cargar el primer dato real. Ninguna suscripción personal sirve para esto
(decisión del dueño, 14/11).

### D2 · Tope de gasto de IA por negocio y por mes

A: un tope único por defecto para todos · **B (recomendada): tope por negocio, fijado por GSG al prender el
interruptor**, con aviso al 80 % · C: sin tope (no recomendada: un cliente puede dejar sin servicio a todos, §3 de
las decisiones). Riesgo de B: hay que fijar un número sin haber medido; se propone arrancar bajo y subir. El monto
queda **provisional a confirmar** hasta leer los precios oficiales y medir el costo por conversación. El tope es del
negocio: si MIA tiene dos equipos (Administración y Dirección), lo comparten.

### D3 · Cómo sale el recordatorio de cobro hacia el cliente de MIA (exposición a terceros)

| Opción | Qué es | Riesgo |
|---|---|---|
| **A (recomendada)** | El sistema no envía: Mariana copia el texto o abre su WhatsApp o su mail | Un paso manual más. Cero riesgo de que el sistema le escriba mal a un cliente de MIA |
| B | Tras aprobar, el sistema manda el mail | Hay que tener dominio de envío de MIA, consentimiento y un control de destinatario. Un error llega a un tercero |
| C | WhatsApp por la API de Meta | Costo y reglas de Meta, número propio, y hoy la entrada de WhatsApp atiende sólo pádel (`src/app/api/webhooks/whatsapp/route.ts:139-202`) |

En las tres, tras la revisión, el texto sale de una plantilla con los datos puestos por el código y con enlaces, CBU y
alias bloqueados (`03` §13): el modelo ya no redacta lo que le llega al cliente de MIA.

### D4 · Dónde se prueba — **Decidido por el dueño (14/11/2026)**

**Decisión:** nada de vista previa en Vercel ni de demostración levantada por una sesión. Se construye el producto real
y **se prueba sobre lo real, en el ambiente de MIA**, que el dueño describe como un QA todavía sin datos reales.
**Orden:** primero prueba el dueño; después Mariana prueba el equipo de Administración.

Qué implica técnicamente (detalle en `03` §15 y pasos en `04`, «Prueba sobre lo real»):

1. El código de la tanda 1 se publica en el despliegue que atiende a MIA (PR, CI, tanda de 6 o más PR).
2. **La migración se aplica en la base donde vive el negocio de MIA: es Gate 2 y se eleva al dueño PR por PR** (D13).
3. El interruptor `equipo-agentes` se prende sólo para el negocio de MIA, desde la consola del operador.
4. Hace falta un «cerebro» configurado en ese despliegue (D4-bis, abierta).
5. Los datos de la prueba son inventados y se cargan a mano: la siembra de la demo se niega a correr fuera de una base
   local (`prisma/seed-mia-producciones.ts:29`).

Lo que se arriesga con lo decidido, para tenerlo a la vista:
- El código y la migración llegan a producción **antes** de que el dueño lo vea andar. Lo acota: interruptor apagado de
  fábrica, migración sólo aditiva, código que tolera la falta de tablas y CI sin rojos nuevos.
- Si MIA vive en la base compartida (S15), la migración se aplica a la base de todos los negocios, y las variables del
  «cerebro» son del despliegue, no del negocio.
- El registro de la prueba no se borra (es de sólo alta, también en la base): el informe mensual cuenta desde la salida
  en vivo.

Opciones que el dueño descartó y por qué quedan anotadas: (a) una sesión en la nube que levanta la demo en memoria y la
muestra en la vista previa de la app — no se verificó que esa vista resuelva el negocio por dirección, vive lo que
vive la sesión y no prueba el aislamiento; (b) vista previa en Vercel con una rama de Neon de demostración — el build
bloquea un Preview cuya base tenga al negocio vivo (`scripts/preview-base.mjs:16-33`), así que exigía una base vacía,
aplicar la migración a mano en esa rama y ocupar un lugar del tope de ramas. La demostración en memoria queda sólo como
herramienta de quien construye.

### D4-bis · Con qué «cerebro» conversa el equipo en esa prueba — **Abierta**

El proveedor de guion (respuestas fijas) alcanza para recorrer el guion de `02` §6, pero **no deja conversar**: el
dueño no puede preguntar lo que quiera. Para conversar hay dos caminos. **No se usan suscripciones personales como
motor** (decisión del dueño, 14/11).

| Opción | Qué es | Riesgo |
|---|---|---|
| G · cupo gratis | El servicio sin cargo que ya usa MIA (Cloudflare Workers AI), sólo con los datos inventados de la prueba | Sin gasto. Nunca se probó con herramientas (sección C, 1): puede fallar casos trampa, y el dueño estaría juzgando el producto con un modelo que no es el final. El cupo es diario y lo comparte con los agentes actuales y las imágenes (`README.md:25-27`). Los datos salen a un tercero que no aclara qué hace con ellos: por eso, sólo inventados. No está verificado que ese despliegue tenga hoy la cuenta cargada (`README.md:31`) |
| P · clave de API con tope bajo | Una clave paga, en una variable propia del equipo, con el tope de `03` §11 y un límite en la consola del proveedor | **Gasto antes de la venta** (choca con «demo → venta → inversión»): decisión del dueño. Muestra la calidad real. Obliga a adelantar el adaptador pago (`04`, brief 1C). Monto: provisional a confirmar, con precios leídos en la fuente. Ojo: la clave **no** va en `ANTHROPIC_API_KEY`, porque esa variable cambiaría de proveedor a los 7 agentes actuales, sin tope (`ia.server.ts:40` y `:85`) |
| Sólo guion | Sin conversación libre | Sin gasto y sin datos afuera. Sirve para validar pantallas y flujo, no para juzgar cómo responde |

**Recomendación (no es una decisión):** empezar por **G** con datos inventados, sabiendo que mide el flujo y no la
calidad final, y pasar a **P** cuando el dueño apruebe el gasto. Motivo: respeta «no se gasta antes de la venta» y el
ambiente todavía no tiene datos reales. Pero el gasto de P llega igual antes de salir en vivo (D1): si el dueño quiere
juzgar al equipo con el modelo que va a usar de verdad, conviene decidir P ahora, con un tope bajo. Mientras no haya
decisión, la tanda 1 se construye igual y se prueba con guion.

### D5 · Consentimiento de MIA — **Informado por el dueño (14/11/2026)**

**El dueño informa que el consentimiento de MIA está dado.** Constancia escrita: **a adjuntar** (archivo o enlace en
`docs/tenants/mia-producciones/`; hoy no está en el repositorio). **Igual no se usan datos reales antes de salir en
vivo.**

Para cuando se adjunte, lo que conviene que la constancia diga (se suma al pedido del PR de finanzas, tablero MIA, M26):
qué datos lee el equipo, a qué proveedor de IA viajan y qué no hace. El proveedor todavía no está elegido (D1 y D4-bis):
si la constancia no lo nombra, hay que completarla antes del primer dato real. Las leyes 25.326 y 24.240 siguen «sin
fuente oficial leída» (S13).

### D6 · Identidad del agente

**A (recomendada): identidad propia sin usuario ni clave** (`agente:cobranzas` en el registro), con los permisos
de Administración recortados por puesto. Riesgo: no figura en «Equipo y permisos» como una persona. · B: un usuario
real por agente. Riesgo: una cuenta con clave más por cuidar, y aparece en listados de personas, liquidaciones y
segundo factor. Las decisiones (§10) piden «su propio usuario y su rol, nunca la clave del dueño»: A cumple el
fondo (identidad y rol propios); si el dueño quiere la forma literal, es B.

### D7 · Quién puede aprobar

**A (recomendada): Administración y Dirección**, cada una según su permiso de editar el módulo. · B: sólo
Dirección. Riesgo de B: Mariana queda de cuello de botella si el permiso no es suyo (ver S1). · C: Administración
aprueba y Dirección recibe copia de lo aprobado (se puede sumar después).

### D8 · Opción B (qué pasa si Claude se cae o hay que cambiar)

**A (recomendada): hoy, ruta 3 (plantillas sin IA y derivación) y la interfaz lista; contratar una segunda ruta
recién con clientes pagos.** · B: el mismo Claude por otra nube (segunda cuenta paga). · C: otra familia de modelos
por API paga. Riesgo de A: en una caída el equipo sigue con números pero sin redacción. B y C son gasto y decisión
del dueño. **Ninguna suscripción personal es una opción acá** (ni la de Codex ni la de Claude): una suscripción es
para quien desarrolla, no para dar servicio a un cliente. El dueño lo confirmó el 14/11.

### D9 · Rol de Codex en la construcción

**A (recomendada): revisor independiente del diseño y de cada PR, y segundo constructor sólo en lo marcado «apta
para Codex»**; plata, seguridad, concurrencia y datos siempre en Opus alto. Todo entra por PR y CI. · B: sólo revisor. ·
C: no usarlo. Riesgo de A: un segundo estilo de código; lo acota el CI y la revisión de Opus. Tras la revisión del
14/11 queda apta una sola pieza: el informe mensual. Agenda y cuaderno pasó a Opus (ahora lleva cupos, clave única y
búsqueda en la memoria). Ver S9: falta confirmar plan, dónde corre, acceso y términos.

### D10 · Cuándo un puesto sube de nivel

**A (recomendada): lo decide el dueño, puesto por puesto, con el informe mensual a la vista; criterio mínimo
propuesto: 30 propuestas seguidas aprobadas sin corrección y cero vencidas por error del agente en 4 semanas.** ·
B: subida automática al cumplir el criterio (no recomendada: es un cambio de permisos). El número 30 es provisional.

### D11 · Qué modelo corre dentro del producto

**A (recomendada): se elige con la evaluación de 30 casos, el más barato que los pase todos** (norma del ERP para
productos). · B: el mismo que usan hoy los agentes de MIA (`ia.server.ts:23`). Riesgo de B: es el más caro por
conversación sin haber medido si hace falta.

### D12 · Qué se hace con el agente «Administrador» actual

**A (recomendada): convive hasta que Cobranzas esté probado; después se retira** de la lista (`diseno-core.ts:317-322`).
· B: retirarlo ya. Dato: hoy Administración ni siquiera lo ve de fábrica (`gestion-core.ts:648`).

### D13 · La migración (Gate 2)

Una sola, aditiva: **10 tablas nuevas** (eran 8; se sumaron el parte y los contadores), sus índices, claves foráneas y
políticas, y un `REVOKE` que le quita al rol de la app el permiso de editar y borrar **sólo** en la tabla nueva del
registro. No toca ninguna tabla existente. Se eleva al dueño **PR por PR**, con qué cambia, cómo se deshace (borrar las
10 tablas; no hay datos de negocio en ellas) y el respaldo previo.

**Lo que cambió con la decisión de D4:** probar sobre lo real exige aplicarla **antes** de la prueba del dueño, en la
base donde vive el negocio de MIA (S15). Si esa base es la compartida y el despliegue tiene `MIGRATE_DATABASE_URL`,
publicar el PR de la tanda 1 **es** aplicarla (`scripts/vercel-build.mjs:59-66`): ese push también es Gate 2.
**Recomendación:** aplicarla en la misma ventana que las de MIA que ya esperan («uno por uno, después de corregir»,
tablero MIA, M12), con un solo respaldo.

**Aparte, y no para ahora:** la defensa de base contra la doble conciliación (tanda 4) sería un índice único sobre
`ProyectoMovBanco.cuotaId`. Toca una tabla existente y puede chocar con datos ya cargados. Recomendación: resolverlo en
el código (candado de fila, `03` §7.1) y decidir el índice después de contar, en sólo lectura, si hay duplicados.

### D14 · Orden frente a lo ya decidido

Las decisiones (§15) ponían primero a GSG como cliente cero (seguimiento de clientes) y a MIA segundo. La orden del
14/11 pone a MIA primero: Administración, después Dirección (S14) y después el equipo de la propia GSG (sección D).
**Recomendación:** seguir la orden nueva; el motor es el mismo y cada equipo es otro archivo de puestos. Riesgo: MIA no
tiene operación diaria en el sistema, así que la prueba medida va a ser con datos inventados hasta que salga en vivo.

## B. Supuestos — todos «provisional a confirmar»

| # | Supuesto | Por qué importa | Cómo se confirma |
|---|---|---|---|
| S1 | **Rol de Mariana en el sistema.** La orden la nombra en administración; el relevamiento la muestra junto a Dirección (Factory-GSG `00-ESTADO/MIA-OPERACION-HOY.md:25`). El diseño sirve para los dos casos | Define quién aprueba (D7) y con qué usuario prueba | Ronda 2 de preguntas, usuarios y roles (tablero MIA, M2) |
| S2 | Las tareas de Administración de MIA son las del `01` §3 | Salen de sus planillas y del código, no de una charla con ella | Mostrarle el `01` §3 y §4 al dueño antes de mostrárselo a MIA |
| S3 | La tarea diaria corre una sola vez (9:00 ART) y no se agrega otra | Sin seguimiento dentro del día | Si hace falta, es decisión de plan de Vercel (gasto) |
| S4 | Los compromisos tienen fecha, no hora | Alcanza para cobranza | Uso real |
| S5 | Topes: 10 propuestas por día, 50 compromisos abiertos, 20 pares por conciliación, 40 notas por puesto, 60 mensajes por persona por día, 3 partes a pedido por día | Son el freno; ahora se cuentan con cupo atómico (`03` §6) | Se ajustan con la medición |
| S6 | El recordatorio usa la moneda del evento y el importe pendiente de la cuota | Hay un defecto abierto de cobro parcial y otro de precio en dólares (tablero MIA, M3) | No salir en vivo con datos reales hasta que cierren |
| S7 | `ProyectoCuota.monto` y `ProyectoMovBanco.importe` siguen en `Float` hasta que entre el pase a centavos (`prisma/schema.prisma:3852` y `:4079`; tablero MIA, M12) | Conciliación por importe exacto: se compara en centavos enteros | Revisar las herramientas cuando entre ese PR |
| S8 | Precios de los modelos y forma exacta de la API con herramientas | No se tomaron de memoria | El constructor los lee en la fuente oficial y los cita en el PR |
| S9 | **Codex:** qué plan es exactamente, dónde corre (máquina del dueño o nube de OpenAI), qué acceso al repositorio necesita, y los **términos de uso de OpenAI, que no están leídos en la fuente** | Acceso a un repo privado con código de plata y de seguridad; qué puede hacer OpenAI con lo que lee | Leer los términos en la página oficial antes de darle acceso; darle el acceso mínimo (lectura y PR, sin secretos ni entornos) |
| S10 | El panel va dentro de `proyectos` porque MIA es productora; el motor no depende de eso | Reutilización para Dirección (mismo negocio) y para GSG (otro negocio, quizá otro rubro) | Tanda 6 y el diseño del equipo GSG (sección D) |
| S11 | El equipo no devuelve al modelo CBU, CUIT, mails ni teléfonos | Menos datos personales afuera | Revisar con la constancia de consentimiento (D5) |
| S12 | Timestamp de la migración `20261115120000` | Puede chocar con ramas abiertas | El constructor lo verifica contra las ramas |
| S13 | Leyes 24.240, 25.326 y 20.488: sin fuente oficial leída | Contrato y descargo | Frente de dirección, antes de firmar con MIA |
| S14 | **Corregido por el dueño (14/11): el equipo de Ale es el de Dirección de MIA, en el mismo negocio**, y lo prueba Dirección. (Antes se suponía otro negocio.) Sus puestos no están relevados | El motor tiene que admitir más de un equipo por negocio, con rol base y visibilidad por equipo (`03` §2 y §5) | Relevar con el dueño qué puestos quiere Ale; se prueba en la tanda 6 |
| S15 | **Dónde vive hoy el ambiente de MIA.** El repositorio sólo dice que el alta se hizo el 02/11 con `--produccion` (`docs/tenants/mia-producciones/README.md:95`; `scripts/soporte/alta-negocio.mts:6` y `:37`): indicaría un negocio sin datos reales **dentro de la base de producción compartida**, atendido por el despliegue de producción. No verificado contra Neon ni Vercel; el `CLAUDE.md` de Factory-GSG no lo nombra entre los negocios provisionados | Define a qué base se aplica la migración (D13), a qué despliegue se le carga el «cerebro» (D4-bis) y si las variables alcanzan a otros negocios | Leer en Neon (sólo lectura) si existe el negocio `mia-producciones` y en Vercel qué dominio lo atiende; anotar en la ficha del cliente |
| S16 | Forma de un alias bancario: no se leyó en la fuente oficial. El filtro frena por palabra y por forma | Puede frenar de más o de menos | Leer la norma del BCRA y ajustar; medir cuánto frena |
| S17 | `maxDuration` de la tarea diaria: 120 s provisional; corte de la llamada a la IA: 60 s; vencimiento de la reserva de gasto: 120 s; estimado de tokens de entrada por caracteres | Tiempos y gasto del barrido | El máximo del plan, en la documentación de Vercel; el resto se calibra en la tanda 5 |

## C. Lo que no se pudo verificar

1. Cómo responde el servicio gratis a un pedido con herramientas: nunca se probó contra el servicio real
   (`README.md` de MIA, «No se pudo probar»). Por eso el adaptador por esquema y el proveedor de guion.
2. Estado actual de los PR de MIA posteriores al 14/11 11:40 UTC y si hay migraciones en ramas abiertas.
3. El cuerpo de `_diseno-agentes.tsx`: se cita como referencia de pantalla, no se leyó entero. (`revisarRespuesta`,
   `consulta-core.ts:156-174`, sí se leyó en la corrección: ya frena links y contactos.)
4. La propuesta comercial de MIA: es privada y no se abrió; este diseño no copia precios ni su contenido. Si la
   propuesta promete algo sobre agentes, hay que contrastarlo con el `01` §9.
5. Si la consola del operador ya permite sumar un interruptor nuevo sin tocar más que el catálogo.
6. **En qué base y en qué despliegue vive hoy el ambiente de MIA** (S15), y si ese despliegue tiene cargadas
   `MIGRATE_DATABASE_URL` y la cuenta del cupo gratis.
7. Que la constancia del consentimiento de MIA exista por escrito: el dueño informa que está dado; falta adjuntarla.
8. Los tests de la corrección no se corrieron: es un diseño. Los hallazgos se verificaron leyendo el código
   (`archivo:línea` en `03`); el comportamiento con el rol sin bypass lo prueba el primer test de la tanda 1.

## D. Equipo GSG (próximo diseño)

**Decisión del dueño (14/11/2026):** además se va a crear un equipo de agentes para la propia GSG, usado desde la
aplicación real del producto, igual que un cliente. Puestos que nombró: **programador, PM, arquitecto de soluciones y
testing**. **No se diseña acá.** Va lo que el motor tiene que permitir para que entre como otro archivo de puestos, y
las preguntas que hay que contestar antes de diseñarlo.

Lo que el motor ya tiene que permitir (y por eso se corrigió ahora):

1. **Más de un equipo por negocio**, cada uno con su rol base, sus módulos y su visibilidad (`03` §2 y §5).
2. **Motor sin nada de «proyectos»:** `src/lib/agentes/` no importa del módulo de la productora. Los permisos, los
   avisos internos y las escrituras de negocio se los pasa cada rubro por parámetro. Hoy el actor del agente se arma
   con los roles de `gestion-core.ts`, que son de la productora: el negocio de GSG va a necesitar su propia versión.
3. **Panel montable fuera de `proyectos`** (S10): los componentes reciben los equipos por parámetro; falta definir en
   qué ruta vive para un negocio que no es productora.
4. **Herramientas que leen fuera de la base del ERP.** El contrato (`leer`, `Fila`, `Origen`) no exige que el dato
   venga de Prisma, pero hoy todo origen es una pantalla del sistema. Un PM o un programador leen de otro lado: hace
   falta decidir cómo entra una fuente externa (credencial, límite de tiempo, costo) y tratarla como dato no confiable.
5. **Acciones con efecto afuera.** Hoy el motor sólo escribe en sus tablas y tiene una única escritura de negocio
   permitida. Un programador o un agente de testing que «ejecuta» algo necesita una clase de herramienta nueva, con su
   nivel, su huella y su registro. Hasta diseñarlo, todo lo que no sea leer es nivel 3 (lo hace una persona).
6. **Tope de gasto propio** del negocio de GSG, con clave de API propia (ninguna suscripción personal como motor).

Preguntas abiertas (del dueño o del próximo diseño):

1. **¿Qué negocio de GSG existe en el sistema?** El `CLAUDE.md` de Factory-GSG lista `beauty-spa`, `magra`,
   `shinevelas` y `adosmanos`; ninguno es GSG. ¿Se da de alta uno? ¿Con qué rubro y qué módulos?
2. **¿De dónde lee datos un PM?** ¿Del tablero y de la página de pendientes de Factory-GSG, de GitHub, de las sesiones?
   Ninguno vive en la base del ERP.
3. **¿De dónde lee un programador y un arquitecto?** ¿El repositorio del ERP, los ADR, el CI? ¿Con qué acceso?
4. **¿Qué puede ejecutar cada uno?** Programador: ¿propone un cambio o abre un PR? Testing: ¿corre suites, dónde y
   contra qué base? PM: ¿sólo informa o abre y cierra tareas? Arquitecto: ¿sólo recomienda?
5. **¿Cómo convive con lo que ya existe?** GSG ya trabaja con sesiones y agentes de Claude Code (orquestadora,
   `gsg-ingeniero`, `gsg-certificador`). ¿El equipo del producto los reemplaza, los consulta o sólo muestra su estado?
6. **¿Quién aprueba?** El dueño decide con un clic y los roles ejecutan (`10-GOBIERNO/roles-y-accesos.md`): ¿el panel
   «Mi equipo» de GSG pasa a ser ese lugar, o sigue siendo el tablero?
7. **Seguridad:** un agente dentro del producto que lee código de plata y de seguridad de todos los clientes. ¿Qué
   revisa el responsable de seguridad antes de prenderlo?
8. **Gasto:** cuatro puestos técnicos consumen mucho más que cobranzas. ¿Con qué tope y medido contra qué?

## E. Aviso de arranque (Paso 0)

La sesión que escribió este diseño tenía `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000`; la norma pide 400000. Se avisa a
la orquestadora. No afectó el trabajo (se cerró por debajo del techo de contexto).

## F. Cambios por la revisión del 14/11

Cada hallazgo se verificó contra el código antes de corregir. **Ninguno resultó falso.**

| # | Hallazgo | Estado | Qué se hizo y dónde |
|---|---|---|---|
| 1 | Lecturas vacías sin aviso dentro de una transacción | **Aplicado** | Cierto: `empresa.server.ts:21` usa el cliente global y `rls.ts:118-119` lo saca por otra conexión. Tres fases (leer, pensar, escribir), huella con `tx`, candado en el motor y test con el rol sin bypass que exige ver lo propio: `03` §4.1, §7, §8, §14 |
| 2 | El dueño no tiene dónde probar y el guion no deja conversar | **Aplicado, con la decisión del dueño** | D4 quedó decidida por el dueño (probar sobre lo real, en el ambiente de MIA); las opciones de sesión en la nube y de vista previa en Vercel quedan anotadas como descartadas. El «cerebro» se separó en D4-bis, abierta: `03` §15, `04` «Prueba sobre lo real» |
| 3 | La IA no puede correr dentro de una transacción | **Aplicado** | Cierto: tope de 5 s (`rls.ts:172-174`) y la ruta no declara `maxDuration`. Barrido en tres pasos, proveedor siempre fuera de transacción con corte por tiempo, `maxDuration` declarado, presupuesto con reloj inyectado: `03` §8, §10 |
| 4 | «No inventa» y «no olvida» dependían del modelo | **Aplicado** | La promesa se confirma con un botón y el compromiso lo crea el código; `memoria.buscar` y búsqueda automática antes de cada vuelta; renglones y orígenes armados por el código; control de atribución; 30 casos contra el modelo real como condición para salir en vivo: `03` §4.2, §8.1, §12, §13; `02` §1.2, §3, §4, §5 |
| 5 | Inyección hacia clientes de MIA | **Aplicado** | El recordatorio sale de la plantilla con datos puestos por el código; filtro de enlaces, 22 dígitos, alias, mails y teléfonos: `03` §13; `02` §3 |
| 6 | Carreras en topes, propuestas, compromisos y FALLIDA | **Aplicado** | Cupo con `UPDATE` condicional (`AgenteContador`), único parcial `WHERE estado='PENDIENTE'`, clave única de compromisos abiertos, FALLIDA condicional: `03` §3, §6, §7 |
| 7 | Gasto: fila del mes, reserva colgada, tokens de entrada | **Aplicado** | `ON CONFLICT` antes de reservar, reserva que vence a los 120 s y se cobra, estimado con entrada y salida: `03` §11 |
| 8 | La guardia de imports era una lista negra | **Aplicado** | `ctx.db` de sólo lectura, herramientas sin cliente de Prisma, lista blanca de imports y de escrituras, con dos tests: `03` §6.1 |
| 9 | La siembra choca con `interruptores-escritura.test.ts` | **Aplicado** | Cierto tal como estaba escrito (mandaba prender desde `scripts/`). Se prende en `prisma/seed-mia-producciones.ts:63-64`; no se toca la lista del trinquete: `03` §12, `04` brief 1B |
| 10 | RLS: índice (`tenantId`,`id`), claves compuestas, `AgenteAccion` sin editar ni borrar | **Aplicado** | Patrón completo de `support_ticket` y `REVOKE` con test: `03` §3. Se anota que `0002_app_role.sql:58` lo volvería a dar: el PR suma la línea ahí |
| 11 | La intersección de permisos ignoraba columnas y proyectos | **Aplicado** | Recorte en tres capas hecho por el motor, totales recalculados y test con un rol que no ve todo: `03` §5 |
| 12 | El parte no tenía tabla ni regla de uno por día | **Aplicado** | `AgenteParte` con único parcial por equipo y día; los «a pedido» por cupo: `03` §3, §8 |
| 13 | La tanda 4 heredaba la carrera de la conciliación | **Aplicado en el código; el índice único queda como decisión** | Cierto: `acciones-empresa.ts:238-239`, `cuotaId` sin único (`schema.prisma:4082`), importes `Float`. Candado de fila, comparación en centavos y test de carrera: `03` §7.1, `04` brief 4B. El índice único toca una tabla existente: D13 |

Decisiones del dueño del 14/11, incorporadas:

| # | Decisión | Dónde quedó |
|---|---|---|
| 1 | Ambiente de prueba: sobre lo real, en el ambiente de MIA; primero el dueño, después Mariana | D4; `03` §15; `04` «Prueba sobre lo real». Dónde vive ese ambiente: provisional a confirmar (S15) |
| 2 | Consentimiento de MIA dado; constancia a adjuntar; sin datos reales antes de salir en vivo | D5; sección C, 7 |
| 3 | El equipo de Ale es el de Dirección de MIA, en el mismo negocio | S14; `03` §2, §3 (`AgenteParte.equipo`), §5; `04` tanda 6 |
| 4 | Equipo de agentes para la propia GSG | Sección D (no se diseñó) |
| 5 | «Cerebro» de la prueba: sigue abierta; ninguna suscripción personal como motor | D4-bis, D8; `03` §10 |

Cambios que salen de la corrección y nadie pidió, para que estén a la vista:
- **C3 (anotar promesa) baja de nivel 2 a nivel 1**, con confirmación en la charla (`01` §4, `02` §1.2).
- **«Agenda y cuaderno» deja de ser apta para Codex** (D9, `04`).
- **El equipo usa una variable de clave propia**, no `ANTHROPIC_API_KEY`, para no cambiar a los agentes actuales (`03` §10).
- **Las tablas pasan de 8 a 10** (D13).
- **`02` §6 apuntaba a `03` §14 para el ambiente de prueba; era §15.** Corregido.
