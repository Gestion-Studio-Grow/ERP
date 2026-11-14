# Línea nueva: agentes de IA y automatizaciones para PyMEs (14/11/2026)

**Estado:** tesis validada por dos agentes (Advisory y Challenger). **No es decisión:** el primer paso lo elige el dueño.
**Origen:** pedido del dueño el 14/11/2026, a partir del video «How He Sells AI Agents for €2,750 + Monthly Support»
(canal Nick Vasilescu, https://youtu.be/Y8MJG3iDtSo; transcripción pegada por el dueño, traducción automática).

## 1. La tesis del dueño

Además de vender el sistema de gestión, GSG vende agentes de IA y automatizaciones que ocupan puestos dentro de un
proceso de negocio (atención al cliente, ventas y seguimiento, cobranza, administración, compras y stock) en
comercios, locales y fábricas. Sobre el ERP propio, sobre el sistema que el cliente ya tenga y en apps de celular.
Modelo: implementación con método (oficio de implementador SAP del dueño) más abono mensual. Motor: Claude, con una
opción B para no depender de un solo proveedor.

## 2. El caso del video (hechos de la transcripción)

- «Carson», diseñador web en Bélgica, instala un asistente personal de IA para el dueño de la PyME.
- Precio: €2.750 de instalación (2 a 3 horas en el local) y €250 por mes de soporte.
- Armado: Hermes Agent sobre una computadora en la nube (Orgo), suscripción de ChatGPT, Telegram, Composio
  (conectores), Honcho (memoria), Obsidian, Latitude (observabilidad), Tailscale.
- Habilidades del primer día: correo, parte de la mañana, aviso de mails sin respuesta y una tarea nocturna.
- Venta: videos en Instagram (5.000 seguidores), llamada gratis, 2 o 3 reuniones por día, ~5 clientes con abono.
- Lo que admite: le cuesta vender ampliaciones, el agente es lento, comparte cuentas de suscripción entre clientes
  y frena el crecimiento porque el soporte no está listo. Próximo paso suyo: agentes pre-armados por rubro
  conectados al sistema contable (Odoo).

## 3. ¿Se puede hacer todo sobre Claude?

**El cerebro, sí. Los canales, no.** Fuente: tabla de disponibilidad por plataforma de la documentación de Claude
(leída el 14/11/2026).

| Pieza de Carson | Reemplazo |
|---|---|
| Hermes + suscripción de ChatGPT | API de Claude con cuenta comercial (nunca suscripciones compartidas) |
| Orgo (una computadora por cliente) | No hace falta: el agente corre en nuestra infraestructura, un negocio más |
| Composio (conectores) | Herramientas propias sobre la API de cada sistema |
| Honcho + Obsidian (memoria) | Base propia por negocio |
| Latitude (observabilidad) | Registro propio de consumo y errores por cliente (a construir) |
| Telegram | WhatsApp, que es de Meta: tiene su costo y sus reglas, Claude no lo reemplaza |

En el ERP ya existe un módulo con dos proveedores de IA (Claude y uno alternativo): `src/lib/proyectos/ia.server.ts:22-36`.

### Opción B

- Conversación, uso de herramientas y memoria funcionan igual en la API de Claude, Amazon Bedrock, Google Vertex y
  Microsoft Foundry. Los agentes administrados por Anthropic y el conector MCP **no** están en Bedrock ni en Vertex.
- Por eso la opción B sólo existe si se construye sobre el núcleo, con una capa propia que no dependa del proveedor.
- Ruta 1: API de Claude. Ruta 2: el mismo Claude por otra nube. Ruta 3: respuestas de respaldo con plantillas y
  derivación a una persona.
- Caídas medidas (Challenger, https://status.claude.com/history.rss): 25 incidentes del 29/09 al 14/11/2026, 7 con
  la API afectada, de 11 a 59 minutos.
- Tope de gasto por organización: con una sola cuenta, un cliente con mucho uso deja sin servicio a todos
  (https://platform.claude.com/docs/en/api/rate-limits). Hace falta un tope por cliente.
- Términos comerciales (https://www.anthropic.com/legal/commercial-terms): revender el servicio tal cual requiere
  aprobación; lo vendible es un producto propio.

## 4. Mercado argentino (Advisory, consultado el 14/11/2026)

- Encuesta nadIA (Di Tella, Fundar, Observatorio PyME, BID; 402 PyMEs de 10 a 249 empleados; industria y software):
  41,6 % ya usa IA, 56 % está experimentando, 57 % no mide el impacto y sólo 4 % tiene presupuesto para IA
  (https://mercado.com.ar/ruta-digital/ia-en-pymes-argentinas-416-ya-la-usa-pero-57-no-mide-impacto).
- Dónde la usan: marketing y ventas 54,7 %, administración 45,1 %, producción 40 %, logística 6,2 %
  (https://www.itsitio.com/ar/?p=190674).
- «Ser los primeros» es falso en atención por WhatsApp: Meta Business AI, Tiendanube con Chat Nube, Cliengo
  (US$ 119 y 259 por mes, https://www.cliengo.com/pricing), Vambe y Darwin AI ya están.
- Duotach (Buenos Aires) ya ofrece IA sobre Tango, Bejerman y Dux con Claude
  (https://duotach.com/blog/integrar-ia-tango-bejerman-dux).
- Nicho con lugar: lo administrativo (cobranza, carga de comprobantes, conciliación) en PyMEs de 10 a 249 empleados.
- Precio que el Advisory estima defendible, a validar: instalación de US$ 500 a 1.500 y abono de US$ 100 a 250 por
  mes, más el consumo de Meta.
- Tarifa de WhatsApp para Argentina: **sin fuente oficial** (la página de Meta no muestra la tabla en texto y dos
  páginas oficiales se contradicen sobre los mensajes de servicio).

## 5. Objeciones del Challenger (veredicto: ajustar)

1. La opción B no existe si se construye sobre herramientas exclusivas de Claude (ver sección 3).
2. Un solo punto de corte para todos los clientes: caídas y tope de gasto compartido.
3. Agentes que actúan (cobran, facturan, prometen precio o stock): el error lo paga el comercio. Ley 24.240 y
   Ley 25.326 quedaron **sin fuente oficial leída**; hay que leerlas antes de firmar un contrato.
4. «Si ya tienen su sistema, también funciona» no vale para todos: Tiendanube tiene API pública
   (https://tiendanube.github.io/api-documentation/intro); Tango depende de versión y licencia (fuente secundaria);
   Xubio y Contabilium, sin documentación oficial encontrada.
5. Operación: guardia permanente con un equipo de una persona; costo de IA en dólares contra abono en pesos.
6. Ser primero no defiende. Defienden ARCA y Mercado Pago propios, el método de implementación y los casos reales.

## 6. Condiciones mínimas para que la línea sea confiable

- Núcleo propio sobre la API de mensajes, con la segunda ruta probada en CI.
- Tope de gasto y registro de consumo por cliente.
- Acciones de plata o de promesa con aprobación humana o límites duros en el código.
- Respuesta de respaldo y derivación a una persona durante una caída.
- Consentimiento de datos personales y descargo en el contrato.
- Costo por conversación medido con 20 a 50 casos antes de fijar el abono.

## 7. Donde los validadores no coinciden

- **Advisory:** primer agente de cobranza, sobre Tango o Bejerman, para PyMEs de 10 a 249 empleados.
- **Challenger:** primer agente de atención por WhatsApp sobre el ERP propio, sólo lectura; sin sistemas ajenos
  (salvo Tiendanube) ni acciones de plata hasta 90 días sin incidentes.

## 8. Qué construir (propuesta, sujeta a la decisión del dueño)

1. Primer puesto: **asistente de cobranza que no toca plata.** Arma la lista de deudores, redacta y manda los
   recordatorios, registra respuestas y deriva a una persona. No cobra ni modifica saldos.
2. Datos: del ERP propio o de una planilla exportada del sistema del cliente. Integraciones directas, después.
3. Validación sin gasto: 3 pilotos, midiendo plata cobrada y costo por conversación.
4. Método de implementación en etapas (relevamiento, diseño del puesto, construcción, prueba con casos, salida en
   vivo, soporte), escrito una vez y reutilizado.

## 9. Cómo se vende frente a ChatGPT y a los asistentes generales (ampliación del 14/11, pedido del dueño)

- **Mensaje:** «ChatGPT te contesta; el agente te lo hace».
- El asistente general no conoce el negocio salvo que le peguen los datos; el agente está conectado al sistema.
- El asistente general espera la pregunta; el agente trabaja solo, de noche, por horario o cuando pasa algo.
- El agente tiene un puesto: tareas definidas, permisos, límites, registro de lo que hizo y soporte detrás.
- Se mide en resultado del negocio (plata cobrada, turnos recuperados), no en respuestas.
- Advertencia: los asistentes generales ya suman conectores y modo agente. Lo que defiende es lo local (ARCA,
  Mercado Pago, WhatsApp, sistemas argentinos), el método de implementación y el soporte.
- «ARM» (confirmado por el dueño): seguimiento de clientes que lleva el agente, en vez de una persona cargando un CRM.

## 10. El agente ejecuta: escalera de permisos por puesto

El dueño pidió que el agente ejecute por el cliente, con permisos. Se diseña como los roles y autorizaciones de un
sistema de gestión: cada agente tiene su propio usuario y su rol, nunca la clave del dueño.

| Nivel | Qué puede | Ejemplo |
|---|---|---|
| 0 · Consulta | Sólo lee | Responder cuánto se debe, qué turnos hay |
| 1 · Prepara | Deja listo y una persona aprueba con un toque | Lista de recordatorios, factura en borrador |
| 2 · Ejecuta con límites | Hace solo dentro de topes fijos en el código | Mandar recordatorios, reprogramar turnos, facturar hasta un monto |
| 3 · Siempre con persona | Lo irreversible | Pagos salientes, notas de crédito, cambios masivos de precio, borrar |

Reglas: los límites van en el código y no en las instrucciones del agente; toda acción queda registrada; hay un
botón para frenarlo; se arranca en el nivel 1 y se sube de nivel por puesto cuando se midió sin errores.
En el ERP ya hay un antecedente: los agentes de MIA se bloquean según los permisos del usuario
(`src/lib/proyectos/diseno-core.ts:349`).

## 11. Reglas de Meta para WhatsApp (leídas en fuente oficial el 14/11/2026)

- **Foto y nombre por número:** la API de perfil del negocio permite foto por número; el nombre visible es
  obligatorio y pasa por revisión (https://developers.facebook.com/documentation/business-messaging/whatsapp/business-profiles,
  https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names).
- **Cantidad de números:** una cuenta nueva arranca con tope de 2; sube a 20 con verificación del negocio
  (https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers).
- **IA (términos, sección 4.7, modificados el 23/09/2026):** prohibido usar la plataforma cuando la IA es la función
  principal ofrecida; permitido el uso incidental o accesorio
  (https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform). Consecuencia de diseño: la
  conversación larga con el agente va en el panel propio; WhatsApp queda para avisos, aprobaciones y mensajes del
  negocio a sus clientes.
- **Mensajes iniciados por el negocio:** fuera de la ventana de 24 horas, sólo plantillas aprobadas. El recordatorio
  de pago figura como ejemplo de utilidad
  (https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization).
- **Sin fuente oficial:** si el nombre visible admite el nombre de un asistente; si el recordatorio de deuda vencida
  cuenta como utilidad; tarifa de Argentina.

## 12. Manual de arranque para el dueño

Página con el flujo completo, el rol del dueño, la primera venta, la instalación, el mantenimiento y casos
(MIA Producciones, estética, comercio, fábrica): https://claude.ai/artifact/Aa27VY7nXTKCNgia66fG3Y

## 13. Requisito del dueño: que no inventen y que no olviden (14/11/2026)

Principio: ningún modelo es perfecto, así que los datos y la memoria viven en el sistema y no en el modelo.

**Para que no invente**
- Cada dato del negocio (saldo, precio, stock, turno) se lee del sistema en el momento; el agente sólo redacta.
- Cuentas y fechas las hace el código.
- Cada respuesta indica el origen del dato; si no está, responde «no lo tengo» y deriva.
- Antes de ejecutar una acción de nivel 2, el código vuelve a comparar contra el sistema.

**Para que no olvide: tres memorias en nuestra base, por negocio**
- Historial: lo que pasó con cada contacto.
- Agenda de compromisos: cada promesa o pendiente es una tarea con fecha; el sistema despierta al agente ese día.
- Cuaderno del puesto: reglas y excepciones del negocio, visibles y corregibles por el cliente en el panel.
- Al ser propia, la memoria no cambia si se cambia de modelo o se usa la opción B. La herramienta de memoria de
  Claude la implementa quien construye y está disponible en las cinco plataformas (tabla de disponibilidad, 14/11).

**Cómo se comprueba**
- Casos trampa antes de salir (preguntas por datos que no existen), dentro de los 20 a 50 casos de prueba.
- Prueba de memoria: dato dado un día y preguntado días después; promesa registrada y seguida.
- Informe mensual: compromisos registrados, cumplidos y olvidados (meta: cero olvidados).

## 14. Dolores con agentes de IA: relevamiento y desafío (14/11/2026)

Pedido del dueño: entender el dolor en la región, con Reddit como fuente. Datos crudos:
`2026-11-14-apendice-dolores-agentes-ia.md`.

**Límites de la evidencia**
- Reddit devuelve 403 al acceso automático; no se leyó ningún hilo directo ni apareció ninguno en español.
- Del lado de quien vende, todo es global y en inglés. Única encuesta regional sólida: nadIA (402 PyMEs de industria
  y software, de 10 a 249 empleados), que no representa a todas las PyMEs.
- Varias fuentes son de vendedores, y el desafío detectó fuentes repetidas dentro de los conteos.

**Lo que aparece (sin orden de importancia: la evidencia no alcanza para ordenar)**
- Del cliente: no se llega a una persona; soporte del proveedor lento; difícil de configurar; cobros y bajas
  difíciles; bloqueo del número de WhatsApp; respuestas inventadas o incorrectas; desconfianza del cliente final
  (64 % preferiría que no se use IA en atención, Gartner, sólo extracto).
- De quien vende: el cliente no adopta ni tiene responsable; integraciones que se rompen; bajas tempranas; cuesta
  mostrar el resultado; costo variable contra abono fijo; plataformas que lo dan incluido (Meta Business AI, gratis
  en Argentina).

**Contabilidad**
- Los agentes fallan en lo contable, y no sólo en lo encadenado: APEX-Accounting (30/07/2026) mide 160 tareas de
  cierre; mejor modelo 56,4 % con crédito parcial y 2,6 % si se exige acertar las 8 repeticiones.
- AccountingBench (18/07/2025, modelos de 2025): menos de 1 % de desvío el primer mes y más de 15 % después, con
  transacciones inventadas para pasar los controles.
- Caso Bench (19/02/2025): recortó contadores apostando a la IA y quebró.
- CPCECABA intimó a un servicio de IA contable por la Ley 20.488 (06/10/2025).

**Conclusiones tras el desafío (refutador)**
- NO se puede afirmar cuál es «el dolor principal» con esta evidencia.
- NO se puede afirmar que los controles clásicos de un sistema de gestión resuelvan las fallas medidas: un asiento
  balanceado con la cuenta equivocada pasa la partida doble, y los agentes evaluados tomaron transacciones ajenas
  para pasar controles. Tampoco es una ventaja exclusiva.
- Estado real del ERP, verificado en código: bloqueo por ejercicio anual y no por período mensual
  (`prisma/schema.prisma:4456`); origen del asiento opcional y admite MANUAL (`prisma/schema.prisma:4475`);
  contraasiento sí existe (`prisma/schema.prisma:4477`); `MAXIMO_CENTAVOS` es el máximo de la base, no un tope de
  aprobación (`src/lib/contabilidad/asiento.ts:100`).
- SÍ se sostiene, con reservas: no vender un «agente contador» que cierre libros; vender tareas administrativas
  acotadas con aprobación humana.
- Dato faltante que cambia la decisión: entrevistas a 10 a 15 PyMEs argentinas sobre cuánto pagarían por mes por
  un puesto acotado, frente a Meta Business AI gratis y a lo que ya incluyen Xubio y Alegra.

## 15. Qué se puede crear, cómo opera y primer cliente (14/11/2026)

Cuadro completo y diagrama de flujo: secciones «Qué podemos crear», «Cómo opera» y «Primer cliente» del manual
(https://claude.ai/artifact/Aa27VY7nXTKCNgia66fG3Y).

**Orden propuesto**
1. Base común (permisos, registro, tres memorias, derivación, informe, panel): se construye una vez.
2. Seguimiento de clientes (ARM): cliente cero.
3. Cobranza sin mover plata: primer cliente pago.
4. Parte de la mañana: incluido en cada puesto.
5. Después: recepción y turnos, conciliación propuesta.
6. Tras prueba medida: carga de comprobantes y trabajo por pantalla.
7. No primero: atención de consultas (Meta la da gratis). No crear: agente contador que cierre libros; asistente
   general en WhatsApp.

**Flujo de un puesto:** disparador → lee datos del sistema → revisa memorias → prepara → según nivel (1 pide
aprobación; 2 el código vuelve a comparar y ejecuta; 3 deriva) → registra → si queda pendiente, compromiso con
fecha que vuelve a disparar; si no, suma al informe.

**Primer cliente**
- Corrección: se había sugerido CH Estética por tener movimiento diario. El tablero del 14/11 dice que la dueña
  todavía no ingresó (Factory-GSG `00-ESTADO/tablero/CH.md`, fila 3) y que MIA no está activada en producción
  (`00-ESTADO/tablero/MIA.md`, encabezado). Hoy ningún cliente tiene operación diaria dentro del sistema.
- Cliente cero: GSG. Puesto de seguimiento de los propios clientes (firma sin respuesta, ronda de preguntas sin
  contestar, acceso sin usar), en nivel 1, con aprobación del dueño en la página de decisiones.
- Primer cliente pago: MIA Producciones, como segunda etapa, con el sistema andando y datos reales. Primer puesto:
  cobranza de cuotas (el agente Administrador ya prepara textos). Condición: consentimiento escrito de MIA.
- En paralelo: entrevistas a 10 a 15 PyMEs para fijar precio y elegir el segundo cliente.

**API de Reddit:** las páginas oficiales devolvieron 403 al lector; no hay fuente leída sobre cómo pedirla hoy.

## 16. Modelo de ganancia (14/11/2026, para el tablero)

**Dónde está la ganancia**
- Abono por puesto, todos los meses. Es el centro del negocio.
- Más puestos en el mismo cliente: sin costo de venta ni de relevamiento.
- Un motor para muchos negocios: un cliente nuevo del mismo rubro es configuración.
- La implementación cubre la puesta en marcha; no es donde se gana.

**Qué la puede comer**
- La atención por cliente (soporte, ajustes, vigilancia): tiempo del dueño y consumo de las sesiones de GSG. Sin medir.
- Bajas tempranas, modelo equivocado, tipo de cambio (IA en dólares, abono en pesos) y precio de mercado (Meta gratis).

**Cuenta por puesto y por mes (supuestos, no medición)**
- Supuesto de uso: 1.100 tareas por mes, 20.000 tokens de entrada y 1.000 de salida por tarea.
- Precios de lista de Claude (tabla del 03/11/2026): Haiku 5.5 US$ 0,10 / 0,50 por millón; Sonnet 5.5 US$ 2 / 10;
  Opus 5.5 US$ 4 / 20.
- Costo de IA: Haiku ≈ US$ 3; Sonnet ≈ US$ 55; Opus ≈ US$ 110. Sin contar el ahorro por caché.
- Con abono de US$ 150 por puesto (estimación de mercado sin validar): margen antes de fijos de ≈ 98 % con Haiku,
  ≈ 63 % con Sonnet y ≈ 27 % con Opus.
- Ejemplo con 50 clientes y 2 puestos cada uno: ingreso US$ 15.000 por mes; IA US$ 275 (Haiku) o US$ 5.500 (Sonnet).
- Punto de equilibrio: costos fijos ÷ margen por cliente. Con fijos de ejemplo de US$ 1.000 y Sonnet: 6 clientes.

**Lo que falta para que el modelo sea cierto:** costo real por tarea (tanda 5 del diseño de MIA), horas de atención
por cliente, costos fijos reales de GSG, tarifa de WhatsApp si el sistema envía, y precio validado con clientes.
Calculadora: sección «La ganancia» del manual (https://claude.ai/artifact/Aa27VY7nXTKCNgia66fG3Y).

## 17. Órdenes del dueño del 14/11/2026 sobre la construcción (escritas en la sesión session_01BtqRUKojnK9M175EeSA8pp)

- Construir completo el primer equipo de agentes para MIA: primero Administración (Mariana); después Dirección (Ale).
- Diseño por un agente Fable; construcción por Opus en esfuerzo alto. Diseño en `docs/tenants/mia-producciones/agentes/`.
- Prueba sobre el producto real en el ambiente de MIA (QA, sin datos reales): primero el dueño, después Mariana;
  Dirección prueba su equipo. Sin vista previa ni demostración aparte.
- El consentimiento de MIA está dado según el dueño (constancia a adjuntar); igual no se usan datos reales antes de
  salir en vivo.
- Equipo propio de GSG sobre el mismo producto: programador, PM, arquitecto de soluciones y testing. Diseño pendiente.
- Suscripción de Codex disponible para este producto: revisor y segundo constructor acotado.
- ABIERTO: con qué IA corre la prueba. El dueño planteó dar servicio con suscripciones personales hasta 50 clientes;
  los términos de Anthropic leídos el 14/11 lo prohíben (code.claude.com/docs/en/legal-and-compliance). Sin resolver.
