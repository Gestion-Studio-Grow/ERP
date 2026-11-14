# Canales y bandeja · 01 · Alcance por módulo

**Fecha:** 14/11/2026 · **Estado:** diseño, sin código, **corregido por el desafío adversarial del 14/11** (`03`
§20) · **Nombre:** «Canales y bandeja» es un nombre en clave y provisional; el nombre comercial lo define el estudio
de diseño.

**Qué es.** Un módulo transversal del sistema: los canales por los que el cliente final le escribe al negocio
(WhatsApp primero) y una bandeja compartida donde el equipo ve todo. Sobre esa base trabaja un agente que **contesta
con la tarea hecha, con la confirmación del propio cliente** (muestra lo que va a hacer y la ejecuta cuando el
cliente toca «Confirmar»), en el módulo que corresponda (turnos, tienda, cobranzas…). Es un puesto de la capa 2 («agentes
como servicio») montado sobre el motor de agentes en construcción.

**Órdenes del dueño que mandan (14/11/2026).** «que pienses, razones e investigues qué otros módulos pueden ser
abarcados por este producto, no solamente el de ventas» · «que sería también un módulo o aplicado a otros módulos» ·
«Vale el permiso más chico de los dos» · «Yo me ocupo de mostrarlo en persona y venderlo».

**Método.** Todo lo que se afirma del sistema lleva `archivo:línea` leído el 14/11/2026 en la rama
`ccr-2ca0bd20-2lovs8`. No se consultó Neon ni Vercel. Lo que no se pudo verificar está en la sección 6.

**Depende de.** El camino de ejecución general, la autorización firmada y la liberación por pruebas están en `07` a
`10` de `docs/tenants/mia-producciones/agentes/` (otro agente; van a certificación). Este módulo **usa** ese camino y
no lo redefine: cómo entra un cliente final está en `03` §3 y lo que se le pide al motor, en `03` §19.

---

## 1. Lo que ya existe en el código y sirve de base

| Pieza | Qué hace hoy | Dónde |
|---|---|---|
| Entrada firmada de WhatsApp, una URL para todos los negocios | Verifica la firma de Meta, separa cada mensaje por el número que lo recibió y lo normaliza a `mensaje.recibido` y `mensaje.estado` | `src/plugins/whatsapp/conector.ts:36-44`, `:72-137`, `:173-192` |
| Ruteo del número al negocio | El `phone_number_id` se busca entre las conexiones del conector; una cuenta externa es de un solo negocio | `src/integraciones/conexiones.server.ts:640-645`; `prisma/schema.prisma:2324-2330` |
| Registro sin duplicados de lo que entra | Una fila por evento, con clave única del proveedor; el texto se guarda **tapado** | `src/integraciones/entrada.server.ts:163-191`; `schema.prisma:2355-2380` |
| Lugar para enchufar quien atiende el mensaje | Un manejador por conector. Hoy WhatsApp **no tiene**: el mensaje queda «recibido, sin handler» | `entrada.server.ts:105-110`, `:138`, `:226-229`; el único cableado es Mercado Pago (`src/app/api/integraciones/c/[token]/route.ts:22`) |
| Salida por WhatsApp | El conector declara «Sin salida todavía» | `conector.ts:193` |
| Circuito completo de WhatsApp en un rubro (clases de pádel) | Recibe, identifica al alumno por teléfono, cancela su clase si escribe «CANCELAR» exacto, contesta dentro de las 24 horas y deja todo anotado. Apagado salvo `PADEL_WHATSAPP=cloud` | `src/app/api/webhooks/whatsapp/route.ts:54-57`, `:139-208`; envío en `src/lib/padel/notificador.ts:52-79` |
| Plantillas de Meta en código | Catálogo de plantillas del pádel y armado del cuerpo (plantilla o texto libre) | `src/lib/padel/whatsapp-cloud.ts:159-188` |
| Conversación guiada de turnos, sin modelo | Prototipo puro con puertos: servicio → fecha → hora → confirmación. **No está conectado a nada** | `src/lib/wa-dispatch.ts:1-17`, puertos en `:31-42`; sólo lo nombran sus propios archivos |
| Asistente del estudio contable por WhatsApp | Máquina de estados pura, con 9 reglas de seguridad probadas. **Sin adaptador**: nadie la importa | `src/lib/contador-wa/bot.ts:1-41`; tablas en `schema.prisma:2452-2515` |
| Mini bandeja de consultas con agente (productora) | Consulta con mensajes, intención, borrador del agente y aprobación de una persona. El envío hoy es por mail o simulado | `schema.prisma:3784-3822`; `src/lib/proyectos/consulta-core.ts:1-12`; `src/lib/proyectos/consultas.server.ts:34-37`, `:52` |
| Reconocer a un cliente por su teléfono | Busca la ficha por teléfono normalizado y avisa si hay empate | `src/lib/clientes/ficha-por-telefono.ts:100`, `:58` |
| Links para el cliente final sin usuario | La llave es un token: taller, portal de proyectos, alumno de pádel | `src/app/seguimiento/[token]/page.tsx:8`; `src/app/portal/[token]/page.tsx:9-10`; `src/lib/padel/acciones-alumno.ts:506` |
| WhatsApp del resto del sistema | Es un link `wa.me` que toca una persona: «el sistema no manda nada solo» | `src/lib/order-actions.ts:1549-1553`; `src/lib/notifications.ts:5-8` |
| Motor de agentes | En construcción (tanda 1A). En esta rama `src/lib/agentes/` todavía no existe | Diseño: `docs/tenants/mia-producciones/agentes/03-especificacion-tecnica.md` §2 (`:30-54`) |

Conclusión de la base: **la entrada está hecha y certificada; faltan el manejador, la salida, la conversación como
dato del negocio y la pantalla.** El rubro pádel demuestra que el circuito completo funciona en este código.

---

## 2. Tabla de módulos

**Nota de cercanía (1 a 3):** 3 = se puede probar con lo que existe más el módulo base; 2 = las piezas existen pero
falta cablearlas o un permiso nuevo; 1 = falta una base (regla de Meta, control del sistema o decisión del dueño).

| # | Módulo | Qué consulta el cliente final | Qué ejecuta el agente | Qué existe hoy (`archivo:línea`) | Qué falta | Riesgo | Nota |
|---|---|---|---|---|---|---|---|
| 1 | **Turnos y reservas** (estética, taller, consultorio) | Horarios, precios, disponibilidad, su próximo turno, la regla de cancelación | Reservar; cancelar o cambiar **su** turno dentro de la regla; anotarse en lista de espera; confirmar que va | Huecos: `src/lib/actions.ts:145`. Reserva pública sin usuario, nace PENDIENTE: `actions.ts:548-581`. Regla de cambio online: `src/lib/turnos/practica.ts:100`. Conversación guiada: `wa-dispatch.ts:31-42`. Lista de espera: `schema.prisma:1239` | Adaptador de los puertos; cancelar y cambiar hoy exigen permiso de personal (`actions.ts:1964`, `:990`): hace falta la versión «el cliente sobre lo suyo»; la seña online no existe (`actions.ts:573-574`) | Medio. Un turno con seña cobrada no se cancela sin decidir la plata (`actions.ts:1955-1962`): eso va a una persona | **3** |
| 2 | **Clases** (pádel, profesores) | Sus clases, horarios libres, cómo paga | Pedir clase, cancelar, avisar «no voy», cambiar horario | Circuito de WhatsApp completo: `webhooks/whatsapp/route.ts:139-208`. Acciones del alumno por link: `acciones-alumno.ts:134`, `:506`, `:553`, `:643` | Pasar de variables del despliegue a conexión por negocio (pendiente anotado en `notificador.ts:15-17`); pedir clase por chat | Bajo a medio | **3** |
| 3 | **Ventas y tienda** | Catálogo, precio, si hay o no hay, costo de envío, medios de pago | Armar el pedido, cotizar el envío, mandar el link de pago | Pedido online sin usuario: `order-actions.ts:726`. No se revela cuánto stock hay: `order-actions.ts:719`. Envío: `src/lib/envios/tarifa.ts:119`. Link de Mercado Pago con el monto **siempre de la base**: `src/lib/cobros/link-de-pedido.server.ts:1-6`, `:29`. Lector de pedidos escritos por chat (carnicería): `src/lib/pedidos/interpretar-whatsapp.ts:991` | Adaptador; el link de pago depende de un módulo que figura sin aplicar en producción (`prisma/pending-gate2/README.md:5`) | Medio a alto: plata y stock | **2** |
| 4 | **Pedidos y entregas** | «¿Por dónde va mi pedido?», cuándo retira, cuándo llega | Informar el estado; avisar «está listo» (mensaje que inicia el negocio) | Estados del pedido: `order-actions.ts:988`. Aviso manual con constancia: `order-actions.ts:1555-1558` | Lectura «mis pedidos» por contacto; el aviso automático necesita plantilla aprobada | Bajo (sólo lee) | **2** |
| 5 | **Cobranzas** (fiado, cuotas, saldos de turnos) | «¿Cuánto debo?», desde cuándo, cómo pago | Mandar el link de pago; anotar una promesa de pago; recordatorio (lo inicia el negocio) | Deuda del cliente: `src/lib/clientes/fiado.ts:189`. Texto del recordatorio (provisional): `fiado.ts:280-288`. Antigüedad de la deuda: `src/lib/cuentas/aging.ts`. Cuotas de proyectos: `src/lib/proyectos/cobranza.server.ts` | Recordatorio fuera de las 24 horas = plantilla aprobada; si «deuda vencida» cuenta como utilidad está **sin fuente oficial** (análisis de mercado, `:153-154`) | Alto: plata y dato sensible (decirle una deuda al número equivocado) | **2** consulta y link · **1** recordatorios |
| 6 | **Consultas comerciales y presupuestos** (productora, inmobiliaria, taller) | Pide presupuesto, pregunta por una propiedad, responde un presupuesto | Tomar los datos que faltan, dejar la consulta calificada, derivar; nunca da un precio que no esté en el sistema | Consulta con mensajes y canal WHATSAPP declarado: `schema.prisma:3784-3803`, `consulta-core.ts:11`. Regla «un borrador que da un precio o promete una fecha no sale»: `consulta-core.ts:4-5`. Inmobiliaria: `src/lib/inmobiliaria/acciones.ts:318`. Taller, aprobar por link: `src/lib/taller/acciones.ts:330` | Entrada real por WhatsApp (hoy web y mail); unificar con la conversación del módulo base | Bajo a medio | **3** (ya se puede mostrar la versión web) |
| 7 | **Soporte posventa y reclamos** | «Me llegó mal», «no me anda», «quiero cambiarlo» | Abrir el caso, pedir lo que falta (número de pedido, foto), etiquetar y asignar; cambios y devoluciones van a una persona | No hay casos del negocio hacia sus clientes. `SupportTicket` es el soporte de GSG a sus negocios (`src/lib/soporte/tickets.server.ts` lee con `operator-db`; canales en `src/lib/soporte/config.ts:77`) | Se resuelve con el módulo base (conversación + etiqueta + asignación + nota). No hace falta tabla de casos al principio | Bajo | **2** |
| 8 | **Proyectos** (clientes de una productora) | Estado del proyecto, próximas fechas, entregables, sus cuotas | Registrar una aprobación o un pedido de cambio | Portal por token, que nunca muestra costos, márgenes ni proveedores: `src/app/portal/[token]/page.tsx:9-10` | Lecturas por contacto con el mismo recorte del portal | Medio (confidencialidad) | **2** |
| 9 | **Facturación con Factoque** | «Mandame la factura», «¿me la hacés a este CUIT?» | Reenviar un comprobante ya emitido. **Emitir queda con una persona** | Emisión: `src/lib/facturita-actions.ts:194`; factura de una venta: `order-actions.ts:1596`. Envíos de comprobante: `schema.prisma:2589`. Plantilla prevista: `src/lib/contador-wa/mensajes.ts:17` | Lectura «mis comprobantes» por contacto; decisión sobre emitir (una factura en ARCA no se deshace: handoff §4, punto 4) | Alto (fiscal) | **2** reenviar · **1** emitir |
| 10 | **Estudio contable** (cartera de clientes) | Manda el extracto del banco, pregunta por sus facturas del mes | Recibir el archivo, cargarlo al negocio correcto, avisar | Asistente completo y probado, sin adaptador: `contador-wa/bot.ts:1-41`; tablas: `schema.prisma:2472-2515` | El adaptador («R2-F1», `bot.ts:8-9`) y la descarga de archivos | Alto (datos fiscales de terceros) | **2** |
| 11 | **Clientes y campañas** (recuperar clientes, cumpleaños, reseñas, hueco liberado) | (Lo inicia el negocio) | Escribirle al cliente con su permiso | A quién escribir hoy: `src/lib/crm/bandeja.ts:127`. Permiso y baja: `src/lib/crm/constancias.ts:81-90`. Textos: `src/lib/crm/textos.ts:32` | Plantillas de marketing aprobadas, permiso previo, cuidado de la calidad del número | Alto por reglas de Meta | **1** |
| 12 | **Taller** | «¿Cómo va mi auto?», presupuesto | Informar el estado; registrar la respuesta al presupuesto | Seguimiento por token: `src/app/seguimiento/[token]/page.tsx:12-22`; `taller/acciones.ts:330` | Lecturas por contacto | Bajo | **2** |

**Módulos que este producto no cubre:** inventario, compras, caja, contabilidad, locales y precios
(`src/apps/catalogo/logistica.ts`, `finanzas.ts`, `locales.ts`, `precios.ts`). No tienen nada que el cliente final
pida por un canal. Son de los puestos internos del motor (el buzón de «Mi equipo»), no de este módulo.

---

## 3. Qué tienen en común todos los módulos (y por eso es un módulo base)

1. **Identificar a quien escribe** por el dato que certifica el canal (el teléfono viene dentro del aviso firmado por
   Meta, `conector.ts:72-97`), nunca por lo que la persona dice de sí misma.
2. **Leer sólo lo suyo.** El patrón ya está en el pádel: busca al alumno por teléfono y sólo toca su próxima clase
   (`webhooks/whatsapp/route.ts:144-162`).
3. **Ejecutar con confirmación explícita.** El pádel no cancela con un «no» suelto: exige la palabra exacta o el botón
   (`route.ts:9-12`, `:168-170`).
4. **Derivar a una persona** cuando hay plata ya cobrada, un dato que falta o algo fuera del alcance.
5. **Dejar todo anotado** y a la vista del equipo.

Cada módulo aporta sólo dos listas: qué se puede **consultar** y qué se puede **ejecutar**. El resto es común.

---

## 4. Orden recomendado y por qué

| Orden | Qué | Por qué |
|---|---|---|
| 0 | **Módulo base sin IA:** WhatsApp de entrada y salida, conversaciones, contactos, tomar el control, notas | Es lo que le falta a todos. Ya es útil solo (bandeja compartida del equipo) y se prueba sin clave de API ni gasto de modelo |
| 1 | **Agente de sólo consulta** con las fuentes del negocio | Riesgo mínimo: no escribe nada. Permite medir costo y calidad reales antes de dejarlo ejecutar |
| 2 | **Turnos y clases** | El circuito ya funciona en pádel; reservar no mueve plata; la reserva pública ya existe sin usuario; es el uso más frecuente y el negocio vivo en producción es de turnos |
| 3 | **Ventas y tienda**, con **Pedidos** (estado) | Reusa pedido online y link de pago, pero toca plata y stock: va después de haber medido el paso 2 |
| 4 | **Cobranzas** (saldo y link; después recordatorios) | Mayor valor para el negocio y mayor riesgo. Los recordatorios dependen de plantillas aprobadas por Meta |
| 5 | **Consultas comerciales, proyectos, soporte, taller** | Casi todo es lectura más derivación; se suman como configuración |
| 6 | **Factoque:** reenviar comprobantes | Emitir sigue con una persona hasta que el dueño decida otra cosa |
| 7 | **Campañas que inicia el negocio** | Lo más expuesto a las reglas y a la calidad del número. Último |

**Por qué no ventas primero**, aunque sea el caso de la referencia: en este sistema el pedido toca stock y plata, y el
link de pago depende de un módulo sin aplicar. Turnos da el mismo efecto de demostración («le escribí y me dejó el
turno reservado») con menos riesgo y con más código ya hecho.

---

## 5. Decisiones mías que el dueño tiene que conocer

1. **Turnos antes que ventas** (sección 4).
2. **El paso 0 no usa IA.** La bandeja compartida sale primero y sola. Así hay algo real para mostrar aunque la clave
   de API siga sin decidirse (handoff §4, punto 14).
3. **Emitir facturas y devolver plata quedan fuera del agente** en todas las fases de este plan.
4. **Las campañas van últimas**: un número marcado por Meta como de baja calidad deja al negocio sin canal.
5. **El estudio contable no se mezcla** con este módulo en la primera versión: ya tiene su asistente diseñado y sus
   tablas propias. Comparten la entrada y la salida de WhatsApp.

## 6. Qué no pude verificar

- Si las tablas de `prisma/pending-gate2/` están aplicadas en producción: sólo leí el documento que lo afirma
  (`prisma/pending-gate2/README.md:3-7`).
- El motor de agentes en código: `src/lib/agentes/` no está en esta rama. Trabajé con su diseño.
- Qué negocios tienen el módulo `whatsapp` prendido o una conexión cargada: es un dato de la base.
- **Corregido el 14/11:** los documentos `07` a `10` **sí están en la rama**. De `09-tecnica-ejecucion.md` leí las
  secciones 2 a 7, 10 y 17. No leí `07`, `08` ni `10` enteros, ni el esquema unificado al que `09` §2 remite (está
  en otra rama).
- Si `09` acepta la lista de `03` §19. Hasta entonces, ninguna tarea de canal escribe en el negocio.
- Lo que el desafío afirma de Meta y de la ley sin dar la dirección (pasar a una persona sin demora, respetar la
  baja, no entrenar modelos con sus datos, datos que salen del país): está marcado «a leer en la fuente».
