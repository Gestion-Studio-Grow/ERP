# Equipo de agentes de Administración · MIA — 05 · Decisiones del dueño y supuestos

> Diseño del 14/11/2026, **corregido dos veces ese día**: tras la revisión adversarial (sección F) y tras la
> verificación del diseño corregido, con los hechos y decisiones nuevas del dueño (sección G). **Ajuste final esa
> noche** (sección H): segunda verificación, bandeja de GSG, las 6 tandas en cadena y un push por brief. Lo reversible (código, pantallas, textos) ya está decidido en `01` a `04`. Acá va sólo lo que es del
> dueño: gasto, exposición a terceros, datos de un cliente, migraciones y permisos.

## A. Decisiones que esperan al dueño

Formato: opciones, **recomendada**, por qué, y qué se arriesga con cada una. Las que el dueño ya tomó el 14/11 dicen
«Decidido» y dejan a la vista lo que implican.

**Abiertas hoy, en orden de urgencia:** D15 (en qué negocio prueba el dueño) · D13 (migración, Gate 2, con ensayo en
una copia) · D4-bis (con qué se responden los pedidos de texto libre: tres caminos) · D1 y D2 (IA y tope con datos reales) · el resto no frena la
construcción. **Ninguna frena construir la tanda 1**, que se prueba sin clave.

### D1 · Con qué IA trabaja el equipo cuando haya datos reales (gasto)

| Opción | Qué es | Riesgo |
|---|---|---|
| **A (recomendada)** | Construir con el proveedor de guion (sólo tests) y probar en producción lo que calcula el código, sin modelo; contratar la API paga recién para responder pedidos de texto libre con datos reales | Ninguno de gasto ahora. La calidad real de redacción se mide más tarde |
| B | Cargar ya una clave paga con tope bajo para responder pedidos de texto libre en la prueba y medir los 30 casos contra el modelo real | Gasto antes de la venta (choca con «demo → venta → inversión»). Monto a definir con precios leídos en la fuente |
| C | Usar el servicio sin cargo de Cloudflare | **Descartada por el dueño (14/11):** «No utilizaremos Cloudflare por ahora». Además no está aclarado qué hace con lo enviado (`docs/tenants/mia-producciones/README.md:25-29`) |

**Lo que cambió con la revisión:** el equipo **no sale en vivo con datos reales sin correr los 30 casos contra el modelo
real** (`03` §12). El guion prueba el código, no al modelo. Entonces el gasto de la opción B no se evita: se elige
**cuándo** hacerlo, y a más tardar es antes de que la IA lea el primer dato real. Ningún plan ni suscripción personal
sirve para esto (D4-bis). El dueño ya lo dijo el 14/11: «cuando el equipo de Mía aborde el sistema con datos reales,
vamos a utilizar la API».

### D2 · Tope de gasto de IA por negocio y por mes

A: un tope único por defecto para todos · **B (recomendada): tope por negocio, fijado por GSG al prender el
interruptor**, con aviso al 80 % · C: sin tope (no recomendada: un cliente puede dejar sin servicio a todos, §3 de
las decisiones). Riesgo de B: hay que fijar un número sin haber medido; se propone arrancar bajo y subir. El monto
queda **provisional a confirmar** hasta leer los precios oficiales y medir el costo por pedido. El tope es del
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
y **se prueba sobre lo real**.

**Hecho confirmado el 14/11 (cierra S15): MIA es producción, compartida con CH.** Entra por el comodín
`*.gsgapp.com.ar` del proyecto Vercel `erp-ch` (rama `main` del ERP) y su negocio está en la rama `main` de Neon, la
misma base de CH. Fuente: Factory-GSG `main`, `_accesos/clientes/mia-producciones.md` (verificado contra Vercel y Neon
por GSG-OPS-010), leída de primera mano en esta corrección. No hay un «ambiente de MIA» aparte.

Qué implica (detalle en `03` §15 y pasos en `04`, «Prueba sobre lo real»):

1. El código de la tanda 1 se publica en producción y llega a **todos** los negocios, apagado por interruptor.
   Publicación por PR, CI y tanda; la orquestadora recomienda una tanda de publicación aparte para agentes.
2. **La migración se aplica a la base que comparten todos los negocios: es Gate 2, del dueño, PR por PR**, con respaldo
   y con ensayo en una copia antes (D13).
3. El interruptor `equipo-agentes` se prende sólo en el negocio de la prueba (D15).
4. **No hace falta ningún «cerebro» para empezar a probar:** lo que calcula el código anda sin modelo. Con qué se
   responden los pedidos de texto libre es D4-bis.
5. Se dan de alta usuarios de prueba (Dirección, Administración y Diseño) y los datos son inventados, cargados a mano:
   la siembra de la demo se niega a correr fuera de una base local (`prisma/seed-mia-producciones.ts:29`).
6. **Quién prueba:** el dueño. Mariana y el equipo de MIA entran cuando su negocio pase a la API (frase del dueño en
   D4-bis). Antes se había escrito «después prueba Mariana»: queda corregido.

Lo que se arriesga con lo decidido, para tenerlo a la vista:
- El código y la migración llegan a producción **antes** de que el dueño lo vea andar. Lo acota: interruptor apagado de
  fábrica, migración sólo aditiva y ensayada, código que tolera la falta de tablas y CI sin rojos nuevos.
- Las variables del despliegue alcanzan a todos los negocios: por eso la clave es propia del equipo y responder con
  IA tiene su propio interruptor por negocio (`03` §10 y §12).
- El registro de la prueba no se borra (es de sólo alta, también en la base): el informe mensual cuenta desde la salida
  en vivo.

Opciones que el dueño descartó y por qué quedan anotadas: (a) una sesión en la nube que levanta la demo en memoria y la
muestra en la vista previa de la app — no se verificó que esa vista resuelva el negocio por dirección, vive lo que
vive la sesión y no prueba el aislamiento; (b) vista previa en Vercel con una rama de Neon de demostración — el build
bloquea un Preview cuya base tenga al negocio vivo (`scripts/preview-base.mjs:16-33`), así que exigía una base vacía,
aplicar la migración a mano en esa rama y ocupar un lugar del tope de ramas. La demostración en memoria queda sólo como
herramienta de quien construye.

### D4-bis · Con qué «cerebro» responde el equipo los pedidos de texto libre — **Abierta: tres caminos**

**Lo que ya no depende de esto:** la tanda 1 se prueba **sin ningún cerebro**. Parte, consultas de Cobranzas, registro,
pausa e interruptor los calcula el código (`03` §10.1; `04`, Prueba A). **No hay conversación en vivo:** el dueño
decidió un buzón de pedidos con respuesta en menos de 3 minutos (sección G). Los pedidos de la lista se responden sin
modelo. Lo único que espera esta decisión es **responder con IA los pedidos de texto libre** (`04`, Prueba B);
mientras tanto van a la **bandeja de GSG** y los contesta una persona (sección H; `03` §4.4).

**Lo que dijo el dueño (14/11):**
- «No utilizaremos Cloudflare por ahora».
- «El plan de Claude lo vamos a utilizar para todo lo que construyamos en prueba hasta que sacamos a producción y luego
  ahí sí utilizamos la API o pedimos la autorización».
- «No vamos a utilizar datos reales ni tampoco interactuar con el equipo real de Mía antes de utilizar la API. Es
  decir, cuando el equipo de Mía aborde el sistema con datos reales, vamos a utilizar la API.»

**Qué permite el plan y qué no** (citas leídas el 14/11 por la orquestadora y por un verificador; esta corrección no
releyó las páginas: S19):
- `https://code.claude.com/docs/en/legal-and-compliance`: el acceso del plan es para «ordinary use of Claude Code and
  other native Anthropic applications»; quien construye productos «should use API key authentication»; no se permite
  «to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users» ni «collect, store, or
  intermediate Claude.ai credentials». Sin excepción para pruebas.
- Política de uso (`https://www.anthropic.com/legal/aup`, «Do Not Abuse Our Platform»): prohíbe «Resell, proxy, or
  otherwise provide access to Claude through unauthorized means, including services that route requests through
  consumer subscriptions».
- Términos de consumidor (`https://www.anthropic.com/legal/consumer-terms`): prohíben acceder «through automated or
  non-human means, whether through a bot, script, or otherwise», salvo con clave de API o permiso explícito. Sanción:
  suspensión sin aviso y sin reembolso.

**Por lo tanto:** el plan sirve para **construir** y para el trabajo del equipo de GSG dentro de Claude Code. El motor
del producto corre en el servidor y necesita una clave de la API. El servidor nunca usa ni guarda el acceso del plan
(`03` §10). El diseño no depende de Cloudflare ni del plan.

**Evaluado y descartado: un «puente de Claude Code».** El 14/11 se evaluó un adaptador en el que el motor dejaba el
pedido en una cola y un proceso en la computadora del titular del plan lo contestaba con Claude Code. Un verificador
lo refutó con las citas de arriba: es enrutar pedidos de un producto por una suscripción de consumidor y es acceso
automatizado sin clave de API. **No está en el diseño** y no se construye salvo un sí por escrito de Anthropic (b).

| Camino | Qué es | Qué se arriesga |
|---|---|---|
| (a) Clave de la API con tope bajo | Una clave paga para responder los pedidos de texto libre de la prueba, en la variable propia del equipo, con el tope de `03` §11 y un límite puesto también del lado del proveedor. Monto que se habló: US$ 20 (provisional a confirmar) | **Gasto antes de la venta** (choca con «demo → venta → inversión»): decisión del dueño. Muestra la calidad real. La clave **no** va en `ANTHROPIC_API_KEY`: esa variable cambiaría de proveedor a los 7 agentes actuales, sin tope (`ia.server.ts:40` y `:85`). Sólo con datos inventados hasta cumplir `03` §12 |
| (b) Pedir autorización a Anthropic («contact sales») | La pregunta exacta: «¿Puede el titular de un plan Max correr `claude -p` o el Agent SDK en su propia máquina para contestar pedidos que encola el producto web de su empresa, en pruebas y siendo él el único usuario?» | Sin costo. Sin plazo conocido y la respuesta puede ser no. Hasta tener un sí por escrito no se construye nada sobre el plan |
| (c) Probar la tanda 1 sin modelo | Sólo la Prueba A de `04`: pedidos de la lista, parte, registro y pausa | Sin gasto y sin datos a un proveedor. Los pedidos de texto libre los contesta una persona de GSG desde la bandeja, y el dueño no juzga cómo responde el modelo hasta que haya clave |

**Recomendación (no es una decisión):** (c) ahora, porque no frena nada: la tanda 1 se construye y se prueba igual. En
paralelo (b), que no cuesta. Y (a) el día que el dueño quiera juzgar las respuestas del modelo: ese gasto llega igual antes de
que MIA entre con datos reales (D1). El código es el mismo en los tres caminos: el adaptador de la API queda construido
en la tanda 1 (`04`, brief 1C) y se prende con la variable de la clave y con `equipo-agentes-ia` en el negocio.

### D5 · Consentimiento de MIA — **Informado por el dueño (14/11/2026)**

**El dueño informa que el consentimiento de MIA está dado.** Constancia escrita: **a adjuntar** (archivo o enlace en
`docs/tenants/mia-producciones/`; hoy no está en el repositorio). **Igual la IA no lee datos reales antes de la API y
de las condiciones de `03` §12.**

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
para quien desarrolla, no para dar servicio a un cliente. El dueño lo confirmó el 14/11. **Tras la segunda
corrección:** la opción B queda sólo como interfaz; no se construye un segundo adaptador y Cloudflare queda fuera del
camino por ahora (`03` §10).

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
pedido sin haber medido si hace falta.

### D12 · Qué se hace con el agente «Administrador» actual

**A (recomendada): convive hasta que Cobranzas esté probado; después se retira** de la lista (`diseno-core.ts:317-322`).
· B: retirarlo ya. Dato: hoy Administración ni siquiera lo ve de fábrica (`gestion-core.ts:648`).

### D13 · La migración (Gate 2)

Una sola, aditiva: **11 tablas nuevas** (eran 10 en el primer diseño: salieron las dos del historial palabra por
palabra y entraron el buzón de pedidos, las reservas de gasto y los ajustes por negocio; `03` §3; la bandeja de GSG no
suma ninguna: es una columna y un estado del buzón), sus
índices, claves foráneas y políticas, y un `REVOKE` que le quita al rol de la app el permiso de editar y borrar **sólo**
en la tabla nueva del registro. No toca ninguna tabla existente. Se eleva al dueño **PR por PR**, con qué cambia, cómo
se deshace (borrar las 11 tablas; no hay datos de negocio en ellas) y el respaldo previo.

**Dónde se aplica (confirmado, S15):** en la rama `main` de Neon, **la base que MIA comparte con CH y con los demás
negocios**. Por eso va con dos cuidados: **ensayo en una copia** (una rama de Neon sacada de `main`, `prisma migrate
deploy` ahí y comprobar tablas, políticas y `REVOKE`) y respaldo con la rotación de 4. Hay que aplicarla **antes** de la
prueba del dueño. Si `erp-ch` tiene `MIGRATE_DATABASE_URL` (S18: provisional a confirmar), publicar el PR de la tanda 1
**es** aplicarla (`scripts/vercel-build.mjs:59-66`): ese push también es Gate 2.
**Recomendaciones:** la de la orquestadora, que los agentes vayan en una tanda de publicación aparte, apagados por
interruptor; y aplicarla en la misma ventana que las de MIA que ya esperan (tablero MIA, M12), con un solo respaldo.
La rama del ensayo ocupa un lugar del tope de 10 y borrarla después lo decide el dueño: la rotación automática sólo
cubre las `respaldo-*`.

**Aparte, y no para ahora:** la defensa de base contra la doble conciliación (tanda 4) sería un índice único sobre
`ProyectoMovBanco.cuotaId`. Toca una tabla existente y puede chocar con datos ya cargados. Recomendación: resolverlo en
el código (candado de fila, `03` §7.1) y decidir el índice después de contar, en sólo lectura, si hay duplicados.

### D14 · Orden frente a lo ya decidido

Las decisiones (§15) ponían primero a GSG como cliente cero (seguimiento de clientes) y a MIA segundo. La orden del
14/11 pone a MIA primero: Administración, después Dirección (S14) y después el equipo de la propia GSG (sección D).
**Recomendación:** seguir la orden nueva; el motor es el mismo y cada equipo es otro archivo de puestos. Riesgo: MIA
empieza a usar el sistema el 18/11 y el equipo de agentes llega después: la prueba del dueño es con datos inventados
(D15) y la prueba medida con datos reales espera a la API y a los 30 casos.

### D15 · En qué negocio prueba el dueño — **Abierta (nueva: sale de dos hechos que chocan)**

Hechos: (1) MIA vive en producción y empieza a usar el sistema el 18/11 (ficha del cliente y dato de la orquestadora).
(2) El dueño dijo: sin datos reales y sin el equipo real de MIA antes de la API (D4-bis). Si la tanda 1 se publica
después del 18/11, el negocio de MIA ya va a tener datos reales.

| Opción | Qué es | Qué se arriesga |
|---|---|---|
| **A (recomendada)** | Un negocio de prueba de rubro productora, en producción, con datos inventados: ahí se prenden los interruptores y prueba el dueño. El de MIA queda apagado hasta la API | Un alta en la base de producción (con respaldo, por el alta por comando de siempre): la decide el dueño. Convive con negocios reales, aislado como cualquier otro. Si ya existe un negocio de prueba de productora, se usa ese (S22, provisional a confirmar); si no, el alta es el paso 4b de `04`, «Antes de probar» |
| B | El negocio de MIA, sólo si la tanda 1 se publica antes de que entren datos reales | Quedan días hasta el 18/11 y antes hay que construir, certificar, ensayar la migración y publicar. Los datos inventados quedarían mezclados con los reales (borrarlos es decisión del dueño) |
| C | El negocio de MIA con sus datos reales, sólo con lo que calcula el código (sin IA, nada sale del sistema) | Contradice la frase del dueño tal como está escrita («no vamos a utilizar datos reales»). Sólo si el dueño lo aclara |

## B. Supuestos — todos «provisional a confirmar»

| # | Supuesto | Por qué importa | Cómo se confirma |
|---|---|---|---|
| S1 | **Rol de Mariana en el sistema.** La orden la nombra en administración; el relevamiento la muestra junto a Dirección (Factory-GSG `00-ESTADO/MIA-OPERACION-HOY.md:25`). El diseño sirve para los dos casos | Define quién aprueba (D7) y con qué usuario prueba | Ronda 2 de preguntas, usuarios y roles (tablero MIA, M2) |
| S2 | Las tareas de Administración de MIA son las del `01` §3 | Salen de sus planillas y del código, no de una charla con ella | Mostrarle el `01` §3 y §4 al dueño antes de mostrárselo a MIA |
| S3 | La tarea diaria corre una sola vez (9:00 ART) y no se agrega otra | Sin seguimiento dentro del día | Si hace falta, es decisión de plan de Vercel (gasto) |
| S4 | Los compromisos tienen fecha, no hora | Alcanza para cobranza | Uso real |
| S5 | Topes: 10 propuestas por día, 50 compromisos abiertos, 20 pares por conciliación, 40 notas por puesto, 60 pedidos por persona por día, 10 partes a pedido por persona y por día (eran 3 por puesto: una sola prueba los gastaba) | Son el freno; se cuentan con cupo atómico y los de pedidos y partes son de cada persona (`03` §3 y §6) | Se ajustan con la medición |
| S6 | El recordatorio usa la moneda del evento y el importe pendiente de la cuota | Hay un defecto abierto de cobro parcial y otro de precio en dólares (tablero MIA, M3) | No salir en vivo con datos reales hasta que cierren |
| S7 | `ProyectoCuota.monto` y `ProyectoMovBanco.importe` siguen en `Float` hasta que entre el pase a centavos (`prisma/schema.prisma:3852` y `:4079`; tablero MIA, M12) | Conciliación por importe exacto: se compara en centavos enteros | Revisar las herramientas cuando entre ese PR |
| S8 | Precios de los modelos y forma exacta de la API con herramientas | No se tomaron de memoria | El constructor los lee en la fuente oficial y los cita en el PR |
| S9 | **Codex:** qué plan es exactamente, dónde corre (máquina del dueño o nube de OpenAI), qué acceso al repositorio necesita, y los **términos de uso de OpenAI, que no están leídos en la fuente** | Acceso a un repo privado con código de plata y de seguridad; qué puede hacer OpenAI con lo que lee | Leer los términos en la página oficial antes de darle acceso; darle el acceso mínimo (lectura y PR, sin secretos ni entornos) |
| S10 | El panel va dentro de `proyectos` porque MIA es productora; el motor no depende de eso | Reutilización para Dirección (mismo negocio) y para GSG (otro negocio, quizá otro rubro) | Tanda 6 y el diseño del equipo GSG (sección D) |
| S11 | El equipo no devuelve al modelo CBU, CUIT, mails ni teléfonos | Menos datos personales afuera | Revisar con la constancia de consentimiento (D5) |
| S12 | Timestamp de la migración `20261115120000` | Puede chocar con ramas abiertas | El constructor lo verifica contra las ramas |
| S13 | Leyes 24.240, 25.326 y 20.488: sin fuente oficial leída | Contrato y descargo | Frente de dirección, antes de firmar con MIA |
| S14 | **Corregido por el dueño (14/11): el equipo de Ale es el de Dirección de MIA, en el mismo negocio**, y lo prueba Dirección. (Antes se suponía otro negocio.) Sus puestos no están relevados | El motor tiene que admitir más de un equipo por negocio, con rol base y visibilidad por equipo (`03` §2 y §5) | Relevar con el dueño qué puestos quiere Ale; se prueba en la tanda 6 |
| S15 | **RESUELTO (14/11).** MIA es producción, compartida con CH: comodín `*.gsgapp.com.ar` del proyecto Vercel `erp-ch` (rama `main` del ERP) y rama `main` de Neon. Fuente: Factory-GSG `main`, `_accesos/clientes/mia-producciones.md`, verificado contra Vercel y Neon por GSG-OPS-010; leída de primera mano en esta corrección | Código apagado por interruptor para todos; migración aditiva a la base compartida, con respaldo y ensayo en una copia (Gate 2); publicación por PR, CI y tanda | Ya confirmado. La ficha vence el 14/12/2026 (regla de los 30 días) |
| S16 | Forma de un alias bancario: no se leyó en la fuente oficial. El filtro frena por palabra y por forma | Puede frenar de más o de menos | Leer la norma del BCRA y ajustar; medir cuánto frena |
| S17 | `maxDuration` de la tarea diaria y del panel: 120 s provisional; objetivo de respuesta del buzón: 180 s; un intento termina 10 s antes del plazo y no pasa de `maxDuration` menos 15 s; sondeo del buzón cada 5 s; corte de cada llamada a la IA: 60 s o lo que quede; vencimiento de cada reserva de gasto: 120 s; estimado de tokens de entrada por caracteres | Tiempos, gasto y cumplimiento del objetivo de 3 minutos | El máximo del plan y cuánto deja correr `after`, en la documentación de Vercel y en la primera prueba en producción; el resto se calibra en la tanda 5 |
| S18 | Si el proyecto `erp-ch` tiene cargada `MIGRATE_DATABASE_URL` | Con la variable, publicar el PR de la tanda 1 aplica la migración: ese push es Gate 2 (D13) | Leerlo en Vercel (sólo lectura) antes de publicar. No se consultó en esta corrección |
| S19 | Las citas de los términos de Anthropic de D4-bis las leyeron la orquestadora y un verificador el 14/11; esta corrección no releyó las páginas | Deciden que el plan no puede ser motor del producto | Releer las tres páginas antes de escribirle a Anthropic (camino b) |
| S20 | Que `createMany` con `skipDuplicates` cubra los índices únicos **parciales** escritos a mano en la migración | De eso depende no duplicar propuestas, compromisos ni partes sin SQL crudo (`03` §3) | El primer test de carrera de la tanda 1; si no los cubre, `updateMany` condicional previo |
| S21 | Nombre de la variable de la clave (`AGENTES_ANTHROPIC_API_KEY`, propuesto), modelo por defecto para la prueba con clave y monto del tope (US$ 20 hablado) | Sin esto no se responde con IA ningún pedido de texto libre | El constructor de 1C lee modelos y precios en la fuente oficial; el monto lo confirma el dueño en D4-bis |
| S22 | Si ya existe en producción un negocio de prueba de rubro productora. **Sigue sin confirmar** | Evita un alta nueva para D15. Si no existe, hay que darlo de alta: paso 4b de `04`, «Antes de probar» | Lo lee el rol de operación, en sólo lectura |
| S23 | Bandeja de GSG: largo máximo de la respuesta (2000 caracteres), que el negocio vea «GSG» y no el nombre de la persona, y que un pedido en bandeja no se cierre solo aunque pasen días | Textos, privacidad de quien contesta y pedidos que pueden quedar abiertos | Uso real; lo ajusta el dueño |
| S24 | Nombre y slug del negocio de prueba, y desde qué máquina se corre el alta por comando (lee la conexión de producción de un archivo local, `scripts/soporte/alta-negocio.mts:21`) | Sin eso no se puede hacer el paso 4b | Lo define el dueño con el rol de operación |

## C. Lo que no se pudo verificar

1. Cómo responde el servicio sin cargo a un pedido con herramientas: nunca se probó. Ya no importa para este diseño:
   Cloudflare quedó fuera del camino (D4-bis) y no se construye un adaptador para ese servicio.
2. Estado actual de los PR de MIA posteriores al 14/11 11:40 UTC y si hay migraciones en ramas abiertas.
3. El cuerpo de `_diseno-agentes.tsx`: se cita como referencia de pantalla, no se leyó entero. (`revisarRespuesta`,
   `consulta-core.ts:156-174`, sí se leyó en la corrección: ya frena links y contactos.)
4. La propuesta comercial de MIA: es privada y no se abrió; este diseño no copia precios ni su contenido. Si la
   propuesta promete algo sobre agentes, hay que contrastarlo con el `01` §9.
5. ~~Si la consola del operador ya permite sumar un interruptor nuevo sin tocar más que el catálogo.~~ **Verificado en
   la segunda corrección:** sí (`InterruptoresCard.tsx:49`, `interruptores.ts:223`).
6. ~~En qué base y en qué despliegue vive MIA~~ (resuelto, S15). Sigue sin verificar si `erp-ch` tiene cargada
   `MIGRATE_DATABASE_URL` (S18).
7. Que la constancia del consentimiento de MIA exista por escrito: el dueño informa que está dado; falta adjuntarla.
8. Los tests de la corrección no se corrieron: es un diseño. Los hallazgos se verificaron leyendo el código
   (`archivo:línea` en `03`); el comportamiento con el rol sin bypass lo prueba el primer test de la tanda 1.
9. Los términos de Anthropic citados en D4-bis no se releyeron en esta corrección (S19).
10. El adaptador de la API no se puede probar contra el servicio real sin una clave (`03` §16, riesgo 10).
11. Ajuste final (sección H): la consola del operador y el alta por comando se leyeron en el código; no se abrió la
    consola ni se corrió nada. Que la demo local de quien construye tenga una sesión de operador para el QA de la
    bandeja: provisional a confirmar por el constructor de 1D.

## D. Equipo de proyecto de GSG (próximo diseño)

**No se diseña acá.** Va lo que el dueño decidió el 14/11, lo que el motor tiene que permitir y las preguntas que hay
que contestar antes de diseñarlo.

**Decisiones del dueño (14/11/2026):**
- **GSG entra a la base como un cliente real:** «Lo nuestro también tiene que ir subido a la base de datos como
  corresponde, como si fuera un cliente real […] con métricas reales». Implica dar de alta un negocio GSG en producción
  (con respaldo y script idempotente).
- **Qué es el equipo:** el **equipo de proyecto de la consultora**: programador, PM, arquitecto de soluciones y
  testing. Hoy está asignado al proyecto MIA y a todos los productos que se le venden, y se puede reasignar a otros
  proyectos. **Construye y mantiene; no lleva administración.** Después vendrá un equipo de mantenimiento.
- **Dónde corre:** dentro de Claude Code, con el plan de Claude. Es el uso normal del plan (D4-bis). **No corre en el
  motor del producto** y el servidor no usa el plan.
- **Cómo se refleja en el panel «Mi equipo» y cómo llegan sus métricas a la base: próximo diseño, sin puente.** El
  puente con el plan se evaluó y se descartó (D4-bis).

Lo que el motor ya tiene que permitir (y por eso se corrigió ahora):

1. **Más de un equipo por negocio**, cada uno con su rol base, sus módulos y su visibilidad (`03` §2 y §5).
2. **Motor sin nada de «proyectos»:** `src/lib/agentes/` no importa del módulo de la productora. Los permisos, los
   avisos internos y las escrituras de negocio se los pasa cada rubro por parámetro. Hoy el actor del agente se arma
   con los roles de `gestion-core.ts`, que son de la productora: el negocio de GSG va a necesitar su propia versión.
3. **Panel montable fuera de `proyectos`** (S10): los componentes reciben los equipos por parámetro; falta definir en
   qué ruta vive para un negocio que no es productora.
4. **Registro y métricas que no dependen de un proveedor:** las tablas del equipo guardan qué se hizo, quién y cuánto
   costó, venga de donde venga. Que el trabajo hecho en Claude Code quede anotado ahí es parte del próximo diseño.
5. **Herramientas que leen fuera de la base del ERP y acciones con efecto afuera:** hoy todo origen es una pantalla del
   sistema y el motor sólo escribe en sus tablas. Hasta diseñarlo, todo lo que no sea leer es nivel 3 (lo hace una
   persona).

Preguntas abiertas (del dueño o del próximo diseño):

1. **El negocio GSG:** ¿con qué rubro y qué módulos se da de alta? El `CLAUDE.md` de Factory-GSG lista `beauty-spa`,
   `magra`, `shinevelas` y `adosmanos`; ninguno es GSG.
2. **¿Qué son «métricas reales»?** ¿Tareas, PR, tests, costo en US$, horas? ¿De dónde salen (GitHub, sesiones,
   `medir-consumo.mjs`, tablero)? Ninguna vive hoy en la base del ERP.
3. **¿Cómo llegan a la base** sin que el servidor use el plan? (Por ejemplo, que la propia sesión de Claude Code las
   escriba al terminar. A diseñar y a contrastar con los términos.)
4. **¿Cómo se asigna y se reasigna** el equipo a un proyecto o a un cliente, y qué ve cada cliente de ese trabajo?
5. **¿Qué puede ejecutar cada puesto** desde el panel, si es que algo? Hoy la respuesta es: nada, sólo se ve.
6. **¿Quién aprueba?** El dueño decide con un clic y los roles ejecutan (`10-GOBIERNO/roles-y-accesos.md`): ¿el panel
   de GSG pasa a ser ese lugar, o sigue siendo el tablero?
7. **Seguridad:** qué revisa el responsable de seguridad antes de mostrar en un panel el estado de trabajo sobre código
   de plata y de seguridad de todos los clientes.
8. **Equipo de mantenimiento:** cuándo empieza y en qué se diferencia.

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
- **C3 (anotar promesa) baja de nivel 2 a nivel 1**, con confirmación de la persona, hoy un botón en la respuesta del
  pedido (`01` §4, `02` §1.2).
- **«Agenda y cuaderno» deja de ser apta para Codex** (D9, `04`).
- **El equipo usa una variable de clave propia**, no `ANTHROPIC_API_KEY`, para no cambiar a los agentes actuales (`03` §10).
- **Las tablas pasan de 8 a 10** (D13).
- **`02` §6 apuntaba a `03` §14 para el ambiente de prueba; era §15.** Corregido.

## G. Cambios por la verificación del 14/11

Segunda corrección. Un verificador adversarial revisó el diseño corregido (commit `951cc6a`) y concluyó que la tanda 1
no se podía abrir así. Cada hallazgo se verificó contra el código antes de corregir. **Ninguno resultó falso.**

| Hallazgo | Qué cambió | Dónde |
|---|---|---|
| **H1** · `ctx.db` no decía sobre qué cliente se arma | Cierto. Se arma sobre el `prisma` con RLS (`rls.ts:86`, `:139-143`), nunca sobre `basePrisma`, y lanza si lo llaman dentro de una transacción (`rls.ts:118-119`) o con otro negocio en el contexto. Test «más de cero filas» con el rol sin bypass | `03` §6.1 punto 1, §14; `04` brief 1A |
| **H2a** · La prueba terminaba en «se prueba con guion», y el guion es sólo de tests | Cierto. El proveedor de guion no existe en producción. La tanda 1 entrega lo que el código calcula sin modelo (los pedidos de la lista, con el parte del día entre ellos) y eso es lo que se prueba sin clave | `03` §10 y §10.1; `04` Prueba A; D4-bis |
| **H2b** · Faltaba el alta de usuarios | Cierto. Es el paso 5 de «Antes de probar»: Dirección, Administración y Diseño | `04`; `03` §15; `02` §6 |
| **H2c** · El guion pedía cosas de las tandas 2 y 4 | Cierto. El parte de la tanda 1 trae sólo cobros; cada paso del guion dice su tanda y si necesita IA | `02` §1.1 y §6; `03` §10.1; `04` |
| **H3a** · Conversar y armar el parte sin protección de doble envío | Cierto. Resuelto con el buzón: cada pedido es una fila con clave de envío única (`AgentePedido`); el reenvío devuelve el mismo pedido y no gasta otro cupo. El parte a pedido es un pedido de la lista | `03` §3, §4.3; `02` §4 (23) |
| **H3b** · «60 mensajes por persona» sin `userId` en la clave | Cierto. `AgenteContador` suma `sujeto` a su clave; el límite pasa a ser 60 **pedidos** por persona por día | `03` §3, §4.3, §6 punto 4, §11 |
| **H3c** · Un solo vencimiento para todas las reservas de gasto | Cierto. Tabla nueva `AgenteReserva`: una fila por llamada, con su vencimiento y su cierre. `AgenteGasto` pasa a `gastado` y `comprometido` | `03` §3, §11; `04` brief 1C; D13 (11 tablas) |
| **H3d** · Pausa e interruptor no se volvían a mirar al escribir | Cierto. `vigencia(tx)` al abrir cada transacción que escribe, empezando por la que recibe el pedido; al decidir una propuesta, candado de fila sobre el puesto | `03` §4.3, §7, §12.1; `04` reglas comunes y brief 2A |
| **H4** · Brief 1B: cita equivocada del interruptor, secciones sin indicar, dependencias incompletas | Cierto: en `gestion.server.ts:33-60` hay actor y permisos, no interruptor. El brief cita `actorActual` (`:33-42`), `puede` (`:44-46`), `exigirEditar` (`:56-60`) y el interruptor en `interruptores.server.ts:56-59`; nombra las secciones de `03` y todo lo que usa de 1A; 1A arranca con un commit de contratos | `04` briefs 1A y 1B; `03` §13 |
| **H5a** · «Sin código nuevo en la consola» contra «trabajo de la tanda 5» | **Una respuesta:** prender y apagar sale del catálogo, sin código nuevo (verificado: `InterruptoresCard.tsx:49`, `interruptores.ts:223`), desde la tanda 1. La tanda 5 sólo suma fijar el tope de gasto por negocio | `03` §12; `04` tanda 5; sección C punto 5 |
| **H5b** · `cambiaLasApps: true` daba vista previa y auditoría equivocadas | **Una respuesta: `cambiaLasApps: false`** en los dos interruptores (verificado: `interruptores-core.ts:294`, `:384`, `:394`). La app aparece por código: `layout.tsx:276-277` | `03` §2, §12; `04` briefs 1A y 1B |
| **H5c** · La guardia pedía sólo `tx.agente…` y el gasto necesitaba `$executeRaw` | **Una respuesta: no hay SQL crudo en el motor.** Cupos y gasto se rediseñaron con `skipDuplicates`, `updateMany` condicional y `updateManyAndReturn`; la guardia prohíbe `$executeRaw` y `$queryRaw` en toda la carpeta | `03` §3, §6, §6.1 punto 3, §11; `04` reglas comunes |
| **H6** · Una vuelta larga seguía escribiendo y gastando después de pausar o apagar | Cierto. Vigencia y reserva en la misma transacción antes de cada llamada; después del corte sólo se cierra la reserva ya tomada, el pedido queda «necesita una persona» y se registra; la respuesta no se guarda. Además cada intento tiene un presupuesto de tiempo (6 pasos de 60 s no entraban en 120 s) | `03` §4.3, §12.1, §14; `02` §4 (24) |

Hechos y decisiones nuevas del dueño, incorporados:

| # | Qué | Dónde quedó |
|---|---|---|
| N1 | S15 resuelto: MIA es producción, compartida con CH | S15, D4, D13; `03` §15; `04` encabezado y «Antes de probar» |
| N2 | Sin Cloudflare; el plan de Claude no es motor del producto; la tanda 1 se prueba sin clave y responder con IA se prende con la clave propia; el «puente» con el plan, evaluado y descartado | D1, D4-bis, D8; `03` §1 (8), §2, §10, §10.1; `04` brief 1C y Pruebas A y B |
| N5 | **No hay conversación en vivo: hay un buzón de pedidos** («No vamos a hacer la conversación en vivo, pero vamos a hacer un buzón de mensajes para la gente. Con pedidos y con respuestas menores a 3 minutos.», 14/11 ~21:35 UTC). Pedidos de la lista o de texto libre, con estado, horas y respuesta entera; objetivo de 3 minutos por negocio, medido; sin clave, los de la lista se responden igual y los de texto libre quedaban en espera (**cambiado esa noche: van a la bandeja de GSG, sección H**) | `01` §5 y §5.1; `02` §2, §3, §4 (22 a 27), §6; `03` §2, §3, §4.3, §10.1, §14, §16 (9); `04` tanda 1 entera |
| N3 | GSG entra a la base como cliente real; el equipo de GSG es el equipo de proyecto de la consultora y corre en Claude Code | Sección D (sigue siendo próximo diseño) |
| N4 | Agentes en una tanda de publicación aparte; migración con ensayo en una copia; MIA empieza a usar el sistema el 18/11 | D13, D15; `03` §15, §16 (8); `04` |

**Cómo se sostiene el objetivo de 3 minutos (para que esté a la vista):** el proyecto sólo tiene tareas programadas
que corren una vez por día (`vercel.json:8-17`) y no se agrega otra. El pedido se procesa apenas entra, después de
responder «recibido», con `after()` de Next (guías de Next 16.3.4 leídas del paquete, citadas en `03` §4.3); cada
intento termina 10 s antes del plazo; mientras alguien tenga el buzón abierto, el sondeo rescata los colgados; pasado
el plazo, el pedido queda «sin responder a tiempo», cuenta como fuera del objetivo y no se reintenta solo. Riesgo que
queda: si la función se corta y quien lo pidió no tiene su buzón abierto, no hay rescate (`03` §16, riesgo 9). Un despertador por
minuto sería una decisión de plan y de gasto: no se propone.

**Cantidad de tablas:** siguen siendo 11, pero no las mismas. Salen `AgenteConversacion` y `AgenteMensaje` (no hay
historial palabra por palabra). Entran `AgentePedido` (el buzón), `AgenteReserva` (H3c) y `AgenteAjuste` (objetivo de respuesta y tope de
gasto por negocio). El diseño verificado tenía 10.

Cambios que salen de esta corrección y nadie pidió, para que estén a la vista:
- **Segundo interruptor, `equipo-agentes-ia`.** La clave se carga en un despliegue que atiende a todos los negocios;
  sin un interruptor propio, cualquier negocio con el equipo prendido mandaría sus datos al proveedor (`03` §10, §12).
- ~~Los pedidos de texto libre que esperaban la IA no se procesan solos cuando la IA se conecta: la persona toca
  «Pedir ahora».~~ **Reemplazado esa noche (sección H):** ya no esperan; van a la bandeja de GSG y los contesta una
  persona. El botón «Pedir ahora» sale del diseño.
- **Un pedido vencido no recibe una respuesta tardía:** el intento se corta 10 s antes del plazo. Se prefirió un estado
  claro («sin responder a tiempo», con «Reintentar») a una respuesta que llega fuera de plazo (`03` §4.3).
- **`AgenteParte` queda sólo para el parte automático** (tanda 3); el parte a pedido es un pedido de la lista.
- **Decisión nueva D15** (en qué negocio prueba el dueño) y **Mariana pasa a probar después de la API**, por la frase
  del dueño.
- **El parte de la tanda 1 trae sólo cobros y las métricas del buzón**; pagos y bancos entran con la tanda 4
  (`02` §1.1).
- **El adaptador para modelos sin herramientas (`proveedor-esquema`) sale del diseño**; la opción B queda como interfaz.
- **El gasto estricto se construye en la tanda 1** (brief 1C), no en la tanda 3.

## H. Cambios por la segunda verificación y decisiones del 14/11 (noche)

Ajuste final, sobre el commit `8cf9021`. Una segunda verificación adversarial concluyó «se puede abrir con
condiciones»: dos bloqueantes, tres restos y siete observaciones. Después llegaron tres decisiones nuevas del dueño.
Cada punto se verificó contra el código antes de corregir; ninguno resultó falso. (Ojo con los nombres: en la sección
G hay otro N5, el del buzón. Acá los puntos llevan el número de la segunda verificación.)

| Punto | Qué cambió | Dónde |
|---|---|---|
| **B1** · El rescate procesaba pedidos de otras personas con la sesión de quien miraba | Cierto: la persona se arma desde la sesión (`gestion.server.ts:33-42`) y no hay función que la arme desde un `userId`. **Solución elegida: el rescate toma sólo los pedidos propios.** `procesarPedido(id, vista)` exige en la base que el pedido sea de esa persona; el actor se arma antes de `after()` y viaja por parámetro. Se descartó crear `actorDe(tenantId, userId)`: sería una puerta para armar identidades sin sesión | `03` §4.3 (paso 1 y puntos 1 y 3), §5, §14; `04` briefs 1A y 1B; `02` §4 (33) |
| **B2** · Faltaba el alta del negocio de prueba | Cierto. Paso 4b nuevo: mirar si existe (S22, sigue sin confirmar) y, si no, alta por comando (`scripts/soporte/alta-negocio.mts:5-6`), con `--probar` antes. Decide el dueño | `04` «Antes de probar» (4b); `03` §15 (3b); D15, S22, S24 |
| **Restos** · Menciones a mensajes y a conversación | Corregidas: `03` §3 (`AgenteContador`: «60 pedidos»), D11 («por pedido»), S21 («no se responde con IA ningún pedido»), S5 y sección F (C3). Quedan sólo la frase del dueño que decide que no hay conversación en vivo y la descripción de los 7 agentes actuales (`01` §2) | `03` §3; esta hoja, D11, D13, S5, S21, sección F |
| **O1** · Sin vigencia o sin plazo al tomar, nadie cerraba el pedido y el sondeo lo relanzaba cada 5 s | Sin vigencia, el pedido se cierra como «necesita una persona». El rescate sólo relanza pedidos con 30 s o más de plazo. Al leer su buzón, la persona cierra sus pedidos vencidos como «sin responder» | `03` §4.3 (paso 1, puntos 3 y 4), §12.1, §14 |
| **O2** · No se decía cuándo nace la clave del envío | Nace al montar el formulario o el botón, no en el clic, y cambia cuando vuelve la respuesta | `03` §4.3 (Alta); `04` brief 1B; `02` §4 (34) |
| **O3** · Métricas de pedidos sin cerrar | Todas las cuentas salen de `AgentePedido`; el registro es el rastro, no la fuente | `03` §4.3 (Métricas), §14 |
| **O4** · A 1B le faltaban archivos | Sumados `src/apps/espacios.ts:59`, `:204`, `:213`, `src/apps/visibles.ts:539` y `proyectos/equipo/page.tsx:126` (la fila del módulo, sólo con el interruptor prendido). Verificados | `03` §2; `04` tabla de la tanda 1 y brief 1B |
| **O5** · `interruptores.ts:66` es el comienzo del catálogo | El catálogo empieza en `:66` y cierra en `:213`; los dos nuevos van antes de ese cierre | `03` §2, §12; `04` brief 1A |
| **O6** · El `REVOKE` quedaba después del `COMMIT` y sin mirar si la tabla existe | Va dentro de la transacción de `0002_app_role.sql` (después de `:63-66`, antes de `:68`), en un `DO` que comprueba la tabla. El test lo corre dos veces y sin la tabla | `03` §3, §14; `04` brief 1A |
| **O7** · Los 3 partes por día se gastaban en una prueba | El cupo pasa a 10 por persona y por día (provisional). No llama al modelo y el doble toque no gasta cupo | `03` §3 (`AgenteParte`); S5; `04` Prueba A (2) |
| **N5 (bandeja)** · «Vamos a sumar la bandeja para que GSG conteste el texto libre.» | El texto libre de un negocio sin IA nace `EN_BANDEJA`, con su plazo, y lo contesta **una persona de GSG** en `/operador/bandeja`. Reemplaza al estado «en espera» y al botón «Pedir ahora». Lee entre negocios con el patrón de Soporte (`enElNegocio`, `operator-db.ts:37-46`; guardia `operadorParaNegocio`), deja en el registro del negocio quién leyó y quién contestó, y se mide igual, contado aparte. **Invariante con test: ningún proceso automático contesta por la bandeja.** No suma tablas: siguen siendo 11 (una columna, `respondidoPor`, y un estado) | `03` §1 (8), §2, §3, §4.3, §4.4 (nueva), §6.1, §10, §10.1, §12, §12.1, §13, §14, §15, §16 (11); `01` §5 y §5.1; `02` §2, §2.1 (nueva), §3, §4 (22, 28 a 32), §6 (5 y 5b); `04` brief 1D, certificación y Prueba A (5 a 7) |
| **N6 (cadena)** · «Hagamos más de una tanda, hagamos todas completas.» | Las 6 tandas se construyen en cadena, 1 → 6, sin esperar la prueba del dueño. Cada una abre su rama desde la anterior, verifica su brief contra el código real al abrirse y se cierra con su certificación antes de la siguiente. Publicar y Gate 2 no cambian | `04` encabezado, «Reglas comunes», Resumen, tandas 3, 5 y 6 |
| **N7 (un push)** · Cada push a una rama del ERP gasta un despliegue de Vercel (100 por día, por cuenta) | Commits locales y un push por brief, al terminar. Única excepción: el commit de contratos de 1A | `04` «Reglas comunes» |

**Regla de trabajo que sale de la bandeja (no es código):** ninguna sesión de Claude ni rutina programada usa una
sesión de operador para abrir o contestar pedidos de la bandeja. El código cierra las entradas automáticas (`03` §4.4);
no puede distinguir a una persona de un robot que maneje su navegador.

**Queda abierto, para el dueño:**
1. **Quién de GSG atiende la bandeja y cómo se entera.** Hoy no hay aviso automático: se mira la bandeja. Con un
   objetivo de 3 minutos, casi todos esos pedidos van a medirse fuera de plazo. Opciones: (a) dejarlo así y medir
   (recomendada para la prueba, sin costo); (b) un aviso a una persona (mail o WhatsApp), que avisa pero no contesta;
   (c) un objetivo distinto para lo que contesta una persona. Riesgo de (a): la métrica sale mala desde el primer día.
2. **Si la persona de GSG puede ver datos del negocio para contestar.** Hoy ve sólo el pedido. Abrirle los datos es
   más lectura entre negocios: decisión aparte, con su certificación.
3. **Aviso a MIA.** Los pedidos escritos, sin IA, los lee una persona de GSG. El formulario lo avisa antes de mandar;
   conviene que también lo diga la constancia de consentimiento (D5).
4. **Un pedido que se queda sin saldo de IA** sigue cerrando como «necesita una persona» del negocio; no va a la
   bandeja. Mandarlo ahí es un cambio chico, si el dueño lo quiere.
5. Siguen abiertas, sin cambios: D1, D2, D3, D4-bis, D15, S18 (`MIGRATE_DATABASE_URL`) y S22.
