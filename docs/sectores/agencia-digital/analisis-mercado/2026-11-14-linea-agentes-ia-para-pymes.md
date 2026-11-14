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
