# Canales y bandeja · 02 · Especificación funcional

**Fecha:** 14/11/2026 · **Estado:** diseño, sin código · Nombre en clave y provisional.
Los textos de pantalla son propuestas **provisionales a confirmar**; el tono y el nombre final los define el estudio
de diseño. No se usan el nombre, los textos ni el aspecto del producto de referencia.

**Depende de:** `07` a `10` de `docs/tenants/mia-producciones/agentes/` (camino de ejecución, topes, autorización
firmada). Acá se dice qué se le pide a ese diseño, no cómo lo resuelve.

---

## 1. Las cinco reglas del producto

1. **El agente trabaja en el sistema.** No contesta «te paso con alguien» si la tarea está en su puesto: contesta con
   la tarea hecha («Listo, te reservé el jueves a las 10»).
2. **Con autorización firmada del negocio.** Sin la autorización vigente para ese puesto y ese canal, el agente no
   responde ni ejecuta: la conversación la atiende el equipo.
3. **Vale el permiso más chico de los dos** (dueño, 14/11). Se ejecuta sólo lo que tienen permitido **a la vez** el
   puesto del agente y quien pide.
4. **Una persona sólo en la excepción.** Excepciones: supera un tope, hay plata ya cobrada, falta un dato, el cliente
   pide una persona, no se pudo identificar a quien escribe, o el pedido está fuera del puesto.
5. **Lo que escribe un tercero es un dato, nunca una orden.** Un mensaje no puede cambiar permisos, topes ni
   destinatarios.

## 2. Quién es «quien pide» cuando escribe un cliente final

El sistema tiene tres roles de personal (`src/lib/capabilities.ts:11`) y ninguno para el cliente final. No se le
crea un usuario ni se toca ese listado. Se define, en código, un cuarto actor que **no es un usuario**: el
**cliente final**, con dos grados.

| Grado | Cuándo | Qué puede pedir |
|---|---|---|
| **Visitante** | El canal no lo reconoce: número sin ficha, dos fichas con el mismo número, o un canal que no certifica el teléfono | Lo mismo que hoy puede hacer cualquiera en las páginas públicas sin iniciar sesión: ver servicios, precios, horarios y disponibilidad; reservar un turno; armar un pedido; dejar una consulta. **Nunca ve datos de nadie**, ni siquiera los que dice que son suyos |
| **Cliente reconocido** | El teléfono que **certifica el canal** coincide con una sola ficha del negocio | Además, ver y operar **lo suyo**: sus turnos, sus pedidos, su saldo, sus comprobantes; cancelar o cambiar su turno dentro de la regla del negocio; pedir su link de pago |

Por qué este es el rol mínimo correcto, con lo que ya hace el sistema:
- Reservar sin usuario ya existe y deja el turno pendiente (`src/lib/actions.ts:548-581`); pedir online también
  (`src/lib/order-actions.ts:726`).
- Operar «lo mío» sin usuario ya existe con un link personal: cancelar una clase
  (`src/lib/padel/acciones-alumno.ts:506`), responder un presupuesto (`src/lib/taller/acciones.ts:330`), ver un
  proyecto sin costos ni márgenes (`src/app/portal/[token]/page.tsx:9-10`). El teléfono certificado por el canal
  cumple el papel de ese link.
- Reconocer la ficha por teléfono, y tratar el empate, ya existe (`src/lib/clientes/ficha-por-telefono.ts:100`,
  `:58`).

**Lo que el cliente final no puede pedir nunca**, lo permita o no el puesto del agente: descuentos o cambios de
precio, anular o devolver un cobro, perdonar un saldo, ver o tocar datos de otra persona, emitir o anular una
factura, cambiar datos fiscales, y cualquier cosa del backoffice.

**Consecuencia de «el permiso más chico»:** como el cliente final es siempre el permiso más chico, el techo real es
el catálogo «de cara al cliente» de cada módulo (sección 6). Autorizar más al agente no amplía lo que un cliente
puede pedirle.

**Cuando quien escribe por el canal es alguien del equipo** (el dueño desde su celular): se lo trata como cliente
final. Las tareas internas se piden por el buzón de «Mi equipo», con su sesión. Así un número robado o prestado no
hereda permisos de personal.

## 3. El módulo base

### 3.1 Canales

| Canal | Fase | Notas |
|---|---|---|
| WhatsApp (número del negocio, API oficial de Meta) | Primera | Canal principal |
| Mensaje de prueba desde la consola de GSG | Primera | Para probar sin depender de Meta (ver `04`) |
| Chat en la página del negocio | Posterior | No depende de Meta; decisión del dueño |
| Instagram y Messenger | Posterior | Revisión de Meta aparte; decisión del dueño |
| Mail | Posterior | |

Pantalla **«Canales»** (Ajustes del módulo): por canal, su estado («Conectado», «Falta conectar», «Con problemas»),
el número, la última vez que entró un mensaje, y el uso del mes (mensajes enviados contra el cupo sin cargo de Meta).

### 3.2 Conversaciones (la bandeja compartida)

En pantalla se llama **«Conversaciones»**. «Bandeja» ya nombra otras tres cosas del sistema (pedidos, clientes para
contactar hoy, y la bandeja de GSG del motor), y repetirla confunde.

Estados de una conversación:

| Estado | Qué significa | Qué ve el equipo |
|---|---|---|
| **La atiende el asistente** | El agente responde solo | Punto verde y la última respuesta |
| **Necesita una persona** | Una excepción (regla 4), con su motivo | Arriba de todo, en rojo, con el motivo y el tiempo de espera |
| **La atiende [nombre]** | Alguien tomó el control | El nombre y hasta cuándo |
| **En pausa hasta [hora]** | El asistente no responde en esta conversación | La hora en que vuelve |
| **Cerrada** | Sin actividad o resuelta | Sale de la lista principal |

Qué puede hacer el equipo en una conversación:
- **Leer** todo el hilo, con quién escribió cada mensaje: el cliente, el asistente o una persona (con su nombre).
- **«Tomar la conversación»**: el asistente deja de responder ahí en el momento. **«Devolver al asistente»** lo
  reactiva.
- **«Pausar al asistente»** en esa conversación: 1 hora, hasta mañana o hasta que yo lo reactive.
- **Responder a mano.** Si pasaron más de 24 horas desde el último mensaje del cliente, la caja de texto se
  reemplaza por: «Pasaron más de 24 horas desde su último mensaje. WhatsApp sólo deja enviar un mensaje aprobado.»
  con la lista de plantillas aprobadas (sección 3.7).
- **Nota interna** (no sale al cliente), **etiquetas** y **asignar a** una persona.
- Ver al costado la **ficha del contacto** y **lo que hizo el asistente** en esa conversación (cada tarea, con hora
  y resultado).

Filtros: Necesitan una persona · Mías · Del asistente · Todas · por etiqueta · por canal.

**«Pausar todo»**: un botón que frena al asistente en todas las conversaciones del negocio. Queda anotado quién y
cuándo. Mientras tanto todo mensaje entra como «Necesita una persona».

### 3.3 Contactos

Un contacto es una persona en un canal. Si su teléfono coincide con una ficha de cliente, se muestran juntos y no se
duplica. Desde el contacto: ver sus conversaciones, sus turnos, pedidos y saldo (lo que el rol de quien mira permita),
etiquetarlo, y **«No escribirle más»** (baja).

El teléfono y el mail se muestran sólo a quien tiene ese permiso; al resto se le tapan, como en el resto del sistema
(`src/lib/capabilities.ts:48-49`).

Fuera de la primera versión: acciones masivas sobre contactos (van con las campañas, último del plan).

### 3.4 Lo que sabe el asistente (fuentes del negocio)

Pantalla **«Lo que sabe el asistente»**, con tres partes:

1. **Datos del sistema** (no se cargan: se leen en el momento). Servicios y precios, productos, horarios, dirección,
   medios de pago, zonas y costos de envío, regla de cancelación. Es la ventaja sobre un producto suelto: el precio
   que dice el asistente es el que está cargado, no una copia.
2. **Preguntas y respuestas** que carga el negocio («¿Tienen estacionamiento?» → «Sí, por la calle…»). Hasta 200.
3. **Textos del negocio** (políticas, cómo llegar, garantías). Hasta 20 textos de 5.000 caracteres.

Posterior: leer el sitio web del negocio y subir archivos.

Regla de contenido: **si la respuesta no está en una fuente, el asistente no la inventa.** Dice «Eso no lo tengo.
Le aviso a alguien del equipo» y la conversación pasa a «Necesita una persona». Precios, horarios, disponibilidad,
saldos y fechas salen **siempre** de los datos del sistema, nunca de un texto cargado ni de la redacción del modelo.

### 3.5 Probar antes de prender

Pantalla **«Probar»**: a la izquierda las instrucciones y las fuentes; a la derecha una conversación de prueba. En
prueba las tareas **no se ejecutan**: se muestra «Acá habría reservado el jueves 10:00». No se ofrece elegir modelo,
temperatura ni comparar modelos: son decisiones de GSG, tomadas con evaluación.

### 3.6 Corregir respuestas

Pantalla **«Respuestas del asistente»**: lista de respuestas con su conversación. En cada una: **«Estuvo bien»** o
**«Corregir»**. Al corregir, la persona escribe la respuesta correcta y elige:
- **«Guardar como pregunta y respuesta»**: pasa a las fuentes y vale desde ese momento.
- **«Sólo marcarla»**: queda como caso para la evaluación de GSG.

La corrección **no modifica** permisos, topes ni instrucciones del puesto. Una corrección sobre precio, horario o
saldo se rechaza con: «Ese dato sale del sistema. Corregilo en [pantalla].»

### 3.7 Mensajes que inicia el negocio

Fuera de las 24 horas, WhatsApp sólo permite mensajes aprobados por Meta. El módulo muestra las plantillas del
negocio con su estado («En revisión», «Aprobada», «Rechazada») y sólo deja usar las aprobadas. Redactarlas y
presentarlas a Meta lo hace GSG en la puesta en marcha.

### 3.8 Métricas

Pantalla **«Cómo viene»**, por día y por mes:
- Conversaciones nuevas, por canal.
- Resueltas por el asistente sin intervención · con intervención · sin responder.
- Tiempo hasta la primera respuesta (mediana y máximo).
- **Tareas hechas por módulo**: turnos reservados, turnos cancelados, pedidos armados, links de pago enviados y
  cuántos se pagaron.
- Motivos de «Necesita una persona», ordenados.
- Temas más consultados (por etiqueta).
- Respuestas corregidas sobre respuestas revisadas.
- Uso del mes: mensajes enviados contra el cupo sin cargo de Meta, y gasto de IA contra el tope del negocio.

No se mide «sentimiento»: es una inferencia sobre personas, sin evaluación que la respalde.

### 3.9 Transparencia, privacidad y baja

- El primer mensaje del asistente en una conversación dice que es un asistente automático del negocio y cómo pedir
  una persona. Texto provisional: «Hola, soy el asistente de [negocio]. Te ayudo con turnos y consultas. Si preferís
  hablar con una persona, escribí PERSONA.»
- El aviso de privacidad va en ese primer mensaje (el asistente contable ya lo hace así:
  `src/lib/contador-wa/bot.ts:36-38`).
- **«PERSONA»** pasa la conversación a «Necesita una persona» y el asistente calla.
- **«BAJA»** deja de escribirle a ese número hasta que escriba «ALTA».
- A un visitante se le responde un máximo de veces por día (tope provisional: 8), para que un número desconocido no
  consuma el servicio.

## 4. Cómo se enchufa un módulo

Cada módulo declara, en el código, dos listas. El negocio las ve en **«Qué hace el asistente»** y puede **apagar**
cualquier renglón. Encender algo que el código no trae no es posible.

- **Consultas:** lecturas, cada una con qué grado de cliente la puede pedir.
- **Tareas:** operaciones, cada una con su grado mínimo, su tope, si pide confirmación y qué pasa si se supera el
  tope.

Toda tarea sigue el mismo recorrido:
1. El asistente reúne los datos y **muestra lo que va a hacer** con datos del sistema («Turno de Manicura, jueves 20
   a las 10:00, con Laura, $ 12.000»).
2. El cliente **confirma tocando un botón** («Confirmar» / «Cambiar»). Un «dale» escrito no ejecuta nada que mueva
   plata o cancele algo.
3. El sistema ejecuta, y el asistente contesta **con el resultado real** (número de turno, link, estado).
4. Si no se pudo, lo dice y pasa a una persona. Nunca dice «listo» sin que el sistema lo haya confirmado.

## 5. Tres casos trabajados

### 5.1 Ventas y tienda

| | Visitante | Cliente reconocido |
|---|---|---|
| Consulta | Catálogo, precio, «hay / no hay» (nunca la cantidad), costo de envío a su zona, medios de pago | Además: sus pedidos y su estado |
| Tarea | Armar un pedido (queda en «Pedidos» como cualquier pedido online) | Además: repetir su último pedido; recibir el link de pago de **su** pedido |

Topes provisionales: 3 pedidos abiertos por contacto; importe máximo por pedido armado por el asistente, a fijar por
negocio; el link se arma por el importe que figura en el sistema, nunca por uno escrito en el chat.
A una persona: pedido que supera el importe máximo, producto sin precio, cambio en un pedido ya cobrado, cualquier
reclamo de plata.

Ejemplo:
> **Cliente:** Hola, ¿tienen la vela de lavanda grande?
> **Asistente:** Sí, hay. Vela de lavanda grande: $ 8.500. ¿Te la sumo a un pedido?
> **Cliente:** Sí, dos. Para Canning.
> **Asistente:** Te armo esto: 2 × Vela de lavanda grande, $ 17.000. Envío a Canning: $ 1.500. Total: $ 18.500.
> [Confirmar] [Cambiar]
> **Cliente:** (toca Confirmar)
> **Asistente:** Listo, pedido #1042. Pagalo acá: [link]. El link vence en 48 horas.

### 5.2 Turnos y reservas

| | Visitante | Cliente reconocido |
|---|---|---|
| Consulta | Servicios, precios, duración, horarios libres, regla de cancelación | Además: sus próximos turnos |
| Tarea | Reservar un turno (queda pendiente, como la reserva de la página) | Además: cancelar o cambiar **su** turno si la regla del negocio lo permite; anotarse en lista de espera |

Topes provisionales: 2 turnos futuros por contacto reservados por el asistente; 3 reservas por número por día.
A una persona: turno con seña cobrada (hoy el sistema no lo cancela sin decidir la plata,
`src/lib/actions.ts:1955-1962`), cambio fuera de término, más de un turno encadenado, pedido de descuento.

Ejemplo:
> **Cliente:** Necesito cambiar mi turno del jueves.
> **Asistente:** Tenés Manicura el jueves 20 a las 10:00 con Laura. ¿Para cuándo lo paso? Tengo viernes 21 a las
> 11:00 o a las 16:30.
> **Cliente:** Viernes 16:30.
> **Asistente:** Cambio tu turno de Manicura al viernes 21 a las 16:30 con Laura. [Confirmar] [Dejarlo como está]
> **Cliente:** (toca Confirmar)
> **Asistente:** Hecho. Te esperamos el viernes 21 a las 16:30.

### 5.3 Cobranzas

| | Visitante | Cliente reconocido |
|---|---|---|
| Consulta | Medios de pago del negocio | Su saldo, de qué es y desde cuándo |
| Tarea | Ninguna | Recibir el link de pago de su saldo o de una cuota; dejar anotado «pago el día X» |

**Nunca se informa una deuda a un visitante**, aunque dé nombre y documento: se le dice «Para ver tu cuenta
necesito que me escribas desde el número que tenemos registrado, o te paso con alguien del equipo».
Topes provisionales: un link por saldo por día; el importe es siempre el del sistema.
A una persona: «ya pagué» sin pago registrado, pedido de quita o de plan, discusión del monto.
Los **recordatorios** que inicia el negocio son otra etapa: necesitan plantilla aprobada por Meta y la decisión del
dueño sobre a quién y cada cuánto.

### 5.4 Soporte posventa (breve)

Consulta: estado de su pedido o turno, políticas cargadas. Tarea: registrar el reclamo (pide número de pedido y
qué pasó), etiquetarlo y pasarlo a una persona con todo junto. El asistente **no** resuelve cambios ni devoluciones.

## 6. Qué es del negocio y qué es de GSG

| Decide el negocio | Decide GSG |
|---|---|
| Fuentes, preguntas y respuestas, etiquetas | Modelo, instrucciones del puesto, evaluación |
| Apagar renglones de «Qué hace el asistente» | Qué renglones existen y sus techos |
| Bajar topes | El tope máximo |
| Pausar, tomar el control, corregir | Prender el módulo y la IA para ese negocio, con la autorización firmada |

## 7. Criterios de aceptación

**Canales y conversaciones**
1. Un mensaje de WhatsApp al número del negocio aparece en «Conversaciones» de **ese** negocio y de ningún otro.
2. El mismo mensaje entregado dos veces por Meta aparece una sola vez y se responde una sola vez.
3. Con el módulo apagado para el negocio, el mensaje no genera respuesta ni gasto.
4. Dos personas del equipo ven la misma conversación; si una la toma, la otra ve «La atiende [nombre]».
5. Tras «Tomar la conversación», el asistente no envía ningún mensaje más en esa conversación, incluida una
   respuesta que estuviera en preparación.
6. «Pausar todo» frena todas las respuestas del negocio y queda registrado quién lo hizo y cuándo.
7. Pasadas 24 horas del último mensaje del cliente, no se puede enviar texto libre: sólo una plantilla aprobada.
8. Un envío que Meta rechaza queda marcado «No se pudo enviar» con el motivo. Nunca figura como enviado.

**Identidad y permisos**
9. Un número sin ficha no recibe ningún dato de ningún cliente, aunque escriba un nombre, documento o teléfono.
10. Un número con dos fichas se trata como visitante y la conversación pasa a una persona con el motivo.
11. Un cliente reconocido sólo ve y opera turnos, pedidos y saldos de su ficha.
12. Ninguna tarea se ejecuta si no está permitida **a la vez** para el puesto y para el grado de quien escribe.
13. Un renglón apagado por el negocio deja de ofrecerse y de ejecutarse desde ese momento.
14. Un mensaje del cliente que pide cambiar reglas, precios, destinatarios o «ignorar las instrucciones» no cambia
    nada, y queda registrado como intento.

**Tareas**
15. Ninguna tarea que escribe se ejecuta sin la confirmación por botón de esa misma propuesta.
16. Si el dato cambió entre la propuesta y la confirmación (el horario se ocupó, el precio cambió), no se ejecuta:
    se vuelve a proponer.
17. El asistente no afirma un resultado que el sistema no devolvió.
18. Todo importe, precio, horario y saldo que aparece en una respuesta sale del sistema y coincide con él.
19. Superado un tope, la tarea no se ejecuta y la conversación pasa a una persona con el motivo.
20. Cada tarea ejecutada queda en el registro con conversación, contacto, tarea, resultado y hora, y se ve desde la
    conversación.

**Fuentes y corrección**
21. Si la respuesta no está en una fuente, el asistente lo dice y deriva.
22. Una corrección guardada como pregunta y respuesta se usa desde la conversación siguiente.
23. Una corrección sobre un dato del sistema se rechaza con la pantalla donde corregirlo.

**Privacidad**
24. El primer mensaje del asistente dice que es automático y cómo pedir una persona.
25. Tras «BAJA», no sale ningún mensaje a ese número hasta que escriba «ALTA».
26. Quien no tiene permiso para ver teléfonos los ve tapados en conversaciones y contactos.

**Métricas**
27. «Cómo viene» coincide con las conversaciones y tareas registradas, incluidas las que siguen abiertas.
28. El uso del mes muestra los mensajes enviados y el gasto de IA, y avisa al 80 % de cada tope.

## 8. Fuera de alcance de esta especificación

Elegir modelo o temperatura desde la pantalla; disparadores automáticos armados por el negocio; conexión con
planillas, calendarios o sistemas de terceros; acciones masivas sobre contactos; audios, imágenes y archivos
entendidos por el asistente (en la primera versión se reciben, se muestran al equipo y pasan a una persona).
