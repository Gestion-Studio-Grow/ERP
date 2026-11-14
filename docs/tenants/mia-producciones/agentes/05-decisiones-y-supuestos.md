# Equipo de agentes de Administración · MIA — 05 · Decisiones del dueño y supuestos

> Diseño del 14/11/2026. Lo reversible (código, pantallas, textos) ya está decidido en `01` a `04`. Acá va sólo lo
> que es del dueño: gasto, exposición a terceros, datos de un cliente, migraciones y permisos.

## A. Decisiones que esperan al dueño

Formato: opciones, **recomendada**, por qué, y qué se arriesga con cada una.

### D1 · Con qué IA trabaja el equipo cuando haya datos reales (gasto)

| Opción | Qué es | Riesgo |
|---|---|---|
| **A (recomendada)** | Construir y probar todo con el proveedor de guion y la demo; contratar la API paga recién cuando MIA esté activada y haya consentido | Ninguno de gasto. La calidad real de redacción se mide más tarde |
| B | Cargar ya una clave paga con tope bajo para medir los 30 casos contra el modelo real | Gasto antes de la venta (choca con «demo → venta → inversión»). Monto a definir con precios leídos en la fuente |
| C | Usar el servicio gratis con datos reales | No recomendada: no está aclarado qué hace con lo enviado (`docs/tenants/mia-producciones/README.md`, «IA gratis hasta la venta») |

### D2 · Tope de gasto de IA por negocio y por mes

A: un tope único por defecto para todos · **B (recomendada): tope por negocio, fijado por GSG al prender el
interruptor**, con aviso al 80 % · C: sin tope (no recomendada: un cliente puede dejar sin servicio a todos, §3 de
las decisiones). Riesgo de B: hay que fijar un número sin haber medido; se propone arrancar bajo y subir. El monto
queda **provisional a confirmar** hasta leer los precios oficiales y medir el costo por conversación.

### D3 · Cómo sale el recordatorio de cobro hacia el cliente de MIA (exposición a terceros)

| Opción | Qué es | Riesgo |
|---|---|---|
| **A (recomendada)** | El sistema no envía: Mariana copia el texto o abre su WhatsApp o su mail | Un paso manual más. Cero riesgo de que el sistema le escriba mal a un cliente de MIA |
| B | Tras aprobar, el sistema manda el mail | Hay que tener dominio de envío de MIA, consentimiento y un control de destinatario. Un error llega a un tercero |
| C | WhatsApp por la API de Meta | Costo y reglas de Meta, número propio, y hoy la entrada de WhatsApp atiende sólo pádel (`src/app/api/webhooks/whatsapp/route.ts:139-202`) |

### D4 · Dónde lo prueba el dueño

**A (recomendada): demostración en memoria** (`scripts/proyectos/demo-local.mjs`), sin tocar Neon ni Vercel y sin
gasto. Riesgo: hay que correrla en una máquina con el repo; si el dueño no la tiene a mano, alguien se la comparte
por pantalla. · B: vista previa en Vercel con una rama de Neon de prueba. Riesgo: aplica la migración en una rama
de Neon (Gate 2), ocupa un lugar del tope de ramas y hay que cuidar que no use datos reales.

### D5 · Consentimiento de MIA antes de usar datos reales

**A (recomendada): consentimiento escrito de MIA** (qué datos lee el equipo, a qué proveedor de IA viajan, qué no
hace) antes de prender el interruptor en producción; se suma al que ya pide el PR de finanzas (tablero MIA, M26).
B: prender con el contrato general. Riesgo de B: Ley 25.326 y Ley 24.240 figuran «sin fuente oficial leída» en las
decisiones (§5, punto 3): no se puede afirmar que el contrato general alcance.

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
del dueño. **La suscripción de Codex no es una opción acá:** una suscripción es para quien desarrolla, no para dar
servicio a un cliente.

### D9 · Rol de Codex en la construcción

**A (recomendada): revisor independiente del diseño y de cada PR, y segundo constructor sólo en tandas marcadas
«apta para Codex»** (agenda y cuaderno, informe mensual); plata, seguridad y datos siempre en Opus alto. Todo entra
por PR y CI. · B: sólo revisor. · C: no usarlo. Riesgo de A: un segundo estilo de código; lo acota el CI y la
revisión de Opus. Ver S9: falta confirmar plan, dónde corre, acceso y términos.

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

Una sola, aditiva, 8 tablas nuevas, no toca ninguna existente. Se eleva al dueño con qué cambia, cómo se deshace
(borrar las 8 tablas; no hay datos de negocio en ellas) y el respaldo previo. **Recomendación:** aplicarla en la
misma ventana que las de MIA que ya esperan («uno por uno, después de corregir», tablero MIA, M12), no antes.

### D14 · Orden frente a lo ya decidido

Las decisiones (§15) ponían primero a GSG como cliente cero (seguimiento de clientes) y a MIA segundo. La orden del
14/11 pone a MIA primero. **Recomendación:** seguir la orden nueva; el motor es el mismo y el puesto de seguimiento
de GSG se arma después como otro archivo de puestos. Riesgo: MIA no tiene operación diaria en el sistema, así que la
prueba medida va a ser con datos de demostración hasta que se active.

## B. Supuestos — todos «provisional a confirmar»

| # | Supuesto | Por qué importa | Cómo se confirma |
|---|---|---|---|
| S1 | **Rol de Mariana en el sistema.** La orden la nombra en administración; el relevamiento la muestra junto a Dirección (Factory-GSG `00-ESTADO/MIA-OPERACION-HOY.md:25`). El diseño sirve para los dos casos | Define quién aprueba (D7) | Ronda 2 de preguntas, usuarios y roles (tablero MIA, M2) |
| S2 | Las tareas de Administración de MIA son las del `01` §3 | Salen de sus planillas y del código, no de una charla con ella | Mostrarle el `01` §3 y §4 al dueño antes de mostrárselo a MIA |
| S3 | La tarea diaria corre una sola vez (9:00 ART) y no se agrega otra | Sin seguimiento dentro del día | Si hace falta, es decisión de plan de Vercel (gasto) |
| S4 | Los compromisos tienen fecha, no hora | Alcanza para cobranza | Uso real |
| S5 | Topes: 10 propuestas por día, 50 compromisos abiertos, 20 pares por conciliación, 40 notas por puesto, 60 mensajes por persona por día | Son el freno de nivel 2 | Se ajustan con la medición |
| S6 | El recordatorio usa la moneda del evento y el importe pendiente de la cuota | Hay un defecto abierto de cobro parcial y otro de precio en dólares (tablero MIA, M3) | No prender con datos reales hasta que cierren |
| S7 | `ProyectoCuota.monto` sigue en `Float` hasta que entre el pase a centavos (`prisma/schema.prisma:3852`; tablero MIA, M12) | Conciliación por importe exacto | Revisar las herramientas cuando entre ese PR |
| S8 | Precios de los modelos y forma exacta de la API con herramientas | No se tomaron de memoria | El constructor los lee en la fuente oficial y los cita en el PR |
| S9 | **Codex:** qué plan es exactamente, dónde corre (máquina del dueño o nube de OpenAI), qué acceso al repositorio necesita, y los **términos de uso de OpenAI, que no están leídos en la fuente** | Acceso a un repo privado con código de plata y de seguridad; qué puede hacer OpenAI con lo que lee | Leer los términos en la página oficial antes de darle acceso; darle el acceso mínimo (lectura y PR, sin secretos ni entornos) |
| S10 | El panel va dentro de `proyectos` porque MIA es productora; el motor no depende de eso | Reutilización para Ale | Se prueba en la tanda 6 |
| S11 | El equipo no devuelve al modelo CBU, CUIT, mails ni teléfonos | Menos datos personales afuera | Revisar con el consentimiento (D5) |
| S12 | Timestamp de la migración `20261115120000` | Puede chocar con ramas abiertas | El constructor lo verifica contra las ramas |
| S13 | Leyes 24.240, 25.326 y 20.488: sin fuente oficial leída | Contrato y descargo | Frente de dirección, antes de firmar con MIA |
| S14 | Ale tendrá su equipo en otro negocio (su taller figura como negocio aparte, tablero MIA, M20) | El motor no puede asumir «productora» | Confirmar con el dueño qué puestos quiere para Ale |

## C. Lo que no se pudo verificar

1. Cómo responde el servicio gratis a un pedido con herramientas: nunca se probó contra el servicio real
   (`README.md` de MIA, «No se pudo probar»). Por eso el adaptador por esquema y el proveedor de guion.
2. Estado actual de los PR de MIA posteriores al 14/11 11:40 UTC y si hay migraciones en ramas abiertas.
3. El cuerpo de `revisarRespuesta` (`consulta-core.ts:156`) y de `_diseno-agentes.tsx`: se citan como antecedente,
   no se leyeron enteros.
4. La propuesta comercial de MIA: es privada y no se abrió; este diseño no copia precios ni su contenido. Si la
   propuesta promete algo sobre agentes, hay que contrastarlo con el `01` §9.
5. Si la consola del operador ya permite sumar un interruptor nuevo sin tocar más que el catálogo.

## D. Aviso de arranque (Paso 0)

La sesión que escribió este diseño tenía `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000`; la norma pide 400000. Se avisa a
la orquestadora. No afectó el trabajo (se cerró por debajo del techo de contexto).
