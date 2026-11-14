# Canales y bandeja · 04 · Prueba real y demostración

**Fecha:** 14/11/2026 · **Estado:** plan, sin código · Nombre en clave y provisional.

Orden del dueño (14/11/2026): «que podríamos comenzar ya a probar, a hacer pruebas reales sobre el producto y
comenzar a mostrarlo y a venderlo. Yo me ocupo de mostrarlo en persona y venderlo.»

**Lo primero, dicho sin vueltas:** hoy el asistente por WhatsApp **no existe como producto**. Existen las piezas
(`01`, sección 1). Este documento separa lo que se puede probar y mostrar hoy, lo que se puede después de cada
tanda, y lo que depende de plata o de terceros. Regla DEMO → VENTA → INVERSIÓN: todo lo que cuesta plata está
marcado **[decisión del dueño]**.

---

## A. Qué se puede probar ya, sin gasto

### A.1 Hoy, con lo que hay en el código

| Qué | Cómo | Para qué sirve | Límite |
|---|---|---|---|
| La entrada de WhatsApp | Simulador firmado del conector: arma un aviso con la firma de Meta y verifica firma, desafío y normalización (`src/plugins/whatsapp/conector.ts:140-165`, `:200-218`; `src/integraciones/registro.ts:305`) | Evidencia de que la puerta de entrada funciona | Prueba técnica. No es para mostrar |
| La conversación guiada de turnos | Tests de `src/lib/wa-dispatch.ts` con puertos falsos (`:7-11`) | Evidencia de la lógica servicio → fecha → hora → confirmación | No está conectada a nada |
| El circuito completo en un rubro | Clases de pádel: recibe, reconoce al alumno, cancela su clase y contesta (`src/app/api/webhooks/whatsapp/route.ts:139-208`) | Es la prueba de que «le escribís y el sistema lo hace» funciona en este código | Está apagado salvo una variable del despliegue (`route.ts:57`). Si hoy está prendido en producción no lo sé: es un dato de configuración |
| El sistema donde va a trabajar el asistente | Reserva pública que deja el turno en la agenda (`src/lib/actions.ts:548-581`); tienda con «Pedir por WhatsApp», que registra el pedido y abre el chat con el número de pedido (`src/lib/order-actions.ts:724-725`) | **Es lo que se puede mostrar hoy en persona** | El WhatsApp de hoy es un link que toca una persona (`order-actions.ts:1549-1552`) |
| Consultas con borrador del asistente | Formulario web → consulta → borrador → una persona aprueba (`src/app/api/consultas/route.ts:36`; `src/lib/proyectos/acciones-consultas.ts:47`, `:91`) | Muestra una bandeja con asistente, en versión «prepara y una persona aprueba» | Necesita una IA conectada (`src/lib/proyectos/ia.server.ts:39-41`). El envío es por mail o simulado (`src/lib/proyectos/consultas.server.ts:34-37`). Es del rubro productora |

### A.2 Con qué negocio

**No se asume el consentimiento de ningún negocio dado de alta.** CH Estética está en producción con datos reales;
Magra, Shine Velas y A Dos Manos son clientes reales configurando; MIA empieza el 18/11; Break Point está congelado
hasta el 16/11 y `circuito-wpe` también. Ninguno se usa para esto sin una autorización registrada de ese cliente, y
sus marcas no se muestran a terceros.

**Recomendación: un negocio de demostración propio de GSG**, con datos inventados, que tenga turnos y tienda.

- El dueño ya ordenó que GSG entre al sistema «como si fuera un cliente real» (análisis de mercado, `:293-296`).
  Al 14/11 no encontré un negocio de GSG en `prisma/`, `scripts/` ni `src/` (búsqueda por nombre, no concluyente).
- Ese alta es otra sesión (handoff §5, punto 7). Darlo de alta en producción toca la base: **[decisión del dueño]**.
- Mientras tanto, las pruebas técnicas corren en una base local con datos de siembra.

### A.3 Después de la tanda C1, sin gasto y sin depender de Meta

C1 trae un **mensaje de prueba desde la consola de GSG**: entra por la misma puerta que un WhatsApp real, con la
misma firma. Con eso se prueba la bandeja completa en el negocio de demostración:

1. Entra un mensaje y aparece en «Conversaciones» del negocio correcto.
2. Dos personas lo ven; una lo toma; la otra ve quién lo tiene.
3. Nota interna, etiqueta, asignar.
4. La regla de las 24 horas (con el reloj de prueba).

No requiere clave de IA, número ni cuenta de Meta. **Sí requiere** la migración aplicada (Gate 2,
**[decisión del dueño]**).

### A.4 WhatsApp real sin gasto: el número de prueba de Meta

Para que el dueño tenga la conversación **en su propio celular**:

1. Cuenta de desarrollador de Meta, una app y el caso de uso de WhatsApp. Leído en
   https://developers.facebook.com/docs/whatsapp/cloud-api/get-started : pide una cuenta de Facebook, registrarse
   como desarrollador y elegir o crear un portfolio de negocio. La cuenta es del titular: **un paso del dueño**.
2. Meta da un número de prueba y deja cargar números destino. La página no dice cuántos ni si tiene costo: **sin
   fuente oficial**.
3. Cargar en Vercel el secreto de la app y el token de verificación (`conector.ts:25-26`). Los pega el dueño.
4. Apuntar el webhook de la app a `/api/integraciones/whatsapp` y crear la conexión del negocio de demostración.

Tres cosas a resolver antes:
- **El código acepta un solo secreto de app** (`conector.ts:5-8`). Si ya hay una app de Meta configurada para el
  pádel, la prueba tiene que usar esa misma app. Hay que mirar qué hay cargado hoy.
- Cargar variables implica un despliegue. Publicar a `main` sigue sus reglas (PR, CI, tanda).
- El envío de respuestas necesita C1 (hoy el conector no tiene salida, `conector.ts:193`).

### A.5 Qué mide cada prueba y cuándo se da por válida

| Prueba | Evidencia que tiene que quedar | Válida si |
|---|---|---|
| P1 · Bandeja (tras C1) | 20 mensajes de prueba, 2 personas, capturas, filas en la base local | Criterios 1 a 8 y 26 de `02` §7, n/n, y la certificación adversarial sin hallazgos abiertos |
| P2 · Asistente de consulta (tras C2) | 30 casos contra el modelo real, con modelo, fecha y n/n; tokens y segundos por turno | 12 de 12 casos trampa; ninguna respuesta con un dato que no esté en el sistema |
| P3 · Uso propio (tras C2; necesita número propio y el aviso de privacidad, sección B) | Una semana de GSG atendiendo consultas reales de sus propios interesados en su número | Porcentaje resuelto sin persona, correcciones y costo real por conversación, medidos |
| P4 · Tareas (tras C3) | 20 reservas y 10 cambios en el negocio de demostración | Ninguna tarea sin confirmación por botón; ninguna duplicada; agenda igual a lo conversado |

Los datos de prueba se limpian o se marcan antes de cerrar cada sesión.

---

## B. Lo que necesita gasto o un trámite

| Qué | Para qué | Cuesta | Cuánto tarda | Fuente |
|---|---|---|---|---|
| **Clave de API del modelo** | Todo lo que usa IA (desde C2) | Por uso. Con los supuestos de `03` §14, 200 conversaciones de prueba: ≈ US$ 2 con Haiku 5.5 o ≈ US$ 36 con Sonnet 5.5 sin caché. **[decisión del dueño]**, sin tomar | Minutos | Precios: skill `claude-api`, tabla del 03/11/2026. Consumo: supuesto, a medir |
| **Número de teléfono** para el negocio de demostración | Mostrarlo con número y nombre propios | Un chip. Precio: sin dato. **[decisión del dueño]** | El número no puede estar en uso en WhatsApp (`docs/tenants/matiasconsoli/whatsapp-business-paso-a-paso.md:34-35`) | — |
| **Cuenta de desarrollador y app de Meta** | A.4 | Sin costo según la página de inicio | Minutos; es un paso del titular | https://developers.facebook.com/docs/whatsapp/cloud-api/get-started |
| **Medio de pago en Meta** | Pasar el cupo de 1.000 mensajes de servicio por número y por mes; sin medio de pago Meta deja de entregarlos al agotarse | Tarifa de Argentina: **sin fuente oficial**. **[decisión del dueño]** (tarjeta del titular) | Minutos | https://developers.facebook.com/docs/whatsapp/pricing |
| **Verificación del negocio en Meta** | Subir el límite de 250 destinatarios por día fuera de la ventana y pasar de 2 a 20 números | Sin costo conocido | **Sin fuente oficial.** Qué documentación pide: sin leer. GSG todavía no tiene entidad jurídica: riesgo | https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md · https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers |
| **Nombre visible del número** | Que el cliente vea el nombre del negocio | Sin costo conocido | Pasa por revisión; plazo sin fuente oficial | https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names |
| **Plantillas** | Escribir fuera de las 24 horas (recordatorios, C5) | Se cobran por mensaje | «Hasta 24 horas» de revisión | https://developers.facebook.com/docs/whatsapp/message-templates/guidelines |
| **Operar los números de los clientes desde la app de GSG** | Que cada cliente conecte **su** número | Sin dato | **Sin fuente oficial.** El autor del producto de referencia contó un mes de revisión y «semanas o meses» para permisos: es un dato de un tercero, no de Meta | Abrir una sesión que lo lea en la documentación de Meta |
| **Instagram y Messenger** | Canales siguientes | Sin dato | Revisión aparte, sin fuente | Posterior |
| **Migración de las tablas** | Todo desde C1 en producción | Sin costo | Gate 2. **[decisión del dueño]** | `03` §4 |
| **Despertador por minuto y plan de Vercel** | Rescatar un mensaje colgado; uso comercial del plan | Depende del plan | Otra sesión | Handoff §4, puntos 16 y 17 |
| **Autorización firmada, términos y datos personales** | Poder tratar datos de los clientes de un negocio | Posible costo legal | Otra sesión | Handoff §4, puntos 10 a 13 |

**El camino más largo es de terceros:** que los clientes conecten su propio número con la app de GSG. Conviene
empezar ese trámite apenas esté leído en la fuente, en paralelo con la construcción, porque no depende del código.

**Regla de Meta que puede frenar el producto entero:** los términos (4.7, modificados el 23/09/2026) prohíben el uso
por proveedores de IA cuando la IA es la función principal, y Meta lo decide a su criterio
(https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform). El diseño lo encara con alcance cerrado
y número del negocio (`03` §13), pero el riesgo existe y hay que decirlo si un interesado pregunta.

---

## C. Guion de demostración en persona (10 minutos)

**Regla del guion:** cada paso lleva una marca. Se muestra **sólo** lo que ese día cumple su marca. Lo demás se
nombra como «lo que viene», con esas palabras.

- **[HOY]** existe y se puede mostrar el 14/11/2026.
- **[C1]**, **[C2]**, **[C3]**: existe cuando esa tanda esté publicada y probada (sección A.5).

Preparación: el negocio de demostración de GSG, con datos inventados. Nunca la marca ni los datos de un cliente. El
celular del dueño y una pantalla con el sistema.

| Min | Qué hace | Qué dice (provisional) | Marca |
|---|---|---|---|
| 0–1 | Pregunta antes de mostrar | «¿Cuántos mensajes de WhatsApp te entran por día? ¿Quién los contesta? ¿Qué pasa con los que llegan de noche?» | [HOY] |
| 1–3 | Muestra el sistema: la agenda y la tienda del negocio de demostración. Reserva un turno desde la página pública y lo muestra entrando en la agenda | «Esto es el sistema del negocio. Todo lo que pasa queda acá: turnos, pedidos, cobros.» | [HOY] |
| 3–4 | Hace un pedido con «Pedir por WhatsApp»: el pedido queda registrado y se abre el chat con el número de pedido | «Hoy el WhatsApp lo contesta una persona, pero el pedido ya quedó cargado.» | [HOY] |
| 4–6 | Desde su celular le escribe al número del negocio. El mensaje aparece en «Conversaciones». Lo toma, responde, deja una nota | «Todos los mensajes en un solo lugar, para todo el equipo. Se ve quién atiende a quién.» | [C1] |
| 6–8 | Pregunta por WhatsApp un precio y un horario. El asistente contesta con los datos del sistema. Pregunta algo que no está cargado: el asistente dice que no lo tiene y lo pasa a una persona | «No inventa. Lo que no sabe, lo pasa.» | [C2] |
| 8–9 | Pide un turno por WhatsApp, toca «Confirmar» y muestra el turno en la agenda | «No te contesta: te lo hace. Y vos lo ves en tu agenda.» | [C3] |
| 9–10 | Toca «Tomar la conversación» y muestra que el asistente calla. Muestra «Pausar todo» | «Vos mandás. Lo frenás cuando quieras y queda anotado todo lo que hizo.» | [C1] |
| Cierre | Pregunta y anota | «¿Qué te gustaría que haga primero en tu negocio?» | [HOY] |

**Versión del 14/11/2026 (sólo pasos [HOY]), 5 minutos:** minutos 0 a 4 y el cierre. Frase para lo que falta: «El
asistente que contesta y hace la tarea por WhatsApp lo estamos construyendo sobre este sistema. Cuando esté probado
te lo muestro funcionando; si te interesa, quedás entre los primeros.»

**Lo que el dueño no dice**, porque hoy no es cierto o no está verificado:
- Que ya contesta solo por WhatsApp.
- Que atiende Instagram, Messenger, mail o audios.
- Que emite facturas o devuelve plata solo.
- Un plazo para conectar el WhatsApp del interesado: depende de Meta y no hay fuente.
- Que «no se equivoca».
- Que los mensajes de WhatsApp son gratis: hay un cupo mensual y después se pagan a Meta.

**Lo que conviene anotar de cada interesado** (es la validación de precio y de demanda que hoy falta): rubro;
mensajes por día; quién los atiende y cuántas horas; qué se pierde por no contestar a tiempo; qué herramienta usa
hoy y cuánto paga; qué tarea querría delegar primero; si daría una autorización firmada para que el asistente opere.

---

## D. Qué decir sobre el precio, sin inventar números

**Lo que es cierto hoy:**
- El producto tiene dos capas (dueño, 14/11): el sistema, y encima los puestos cubiertos por agentes.
- El precio de la capa 2 **no está validado**: faltan el costo real por conversación (se mide en C2) y las
  entrevistas con negocios (handoff §4, punto 15).
- WhatsApp tiene un costo propio que cobra Meta, aparte del nuestro.

**Qué decir (provisional):**
- «Son dos cosas: el sistema, que tiene su plan, y el asistente, que se paga por puesto, como un empleado más.»
- «El precio del asistente lo estamos cerrando con los primeros negocios. No te voy a tirar un número que después
  cambie.»
- «Aparte está lo que cobra WhatsApp por los mensajes, que va directo a Meta. Hay un cupo mensual sin cargo.»
- «Contame cuánto te cuesta hoy atender el WhatsApp y te digo si te conviene.»
- Si insisten: «Te lo paso por escrito el [fecha].» Y cumplir la fecha.

**Qué no decir:**
- Ningún importe de la capa 2, ni «desde», ni rangos. Las cifras del análisis de mercado son estimaciones sin
  validar (`docs/sectores/agencia-digital/analisis-mercado/2026-11-14-linea-agentes-ia-para-pymes.md:69-70`).
- «Gratis», «ilimitado», «sin costo de WhatsApp».
- El precio del producto de referencia ni el de un competidor como si fuera el nuestro.
- Una prueba gratis, salvo que el dueño la haya decidido: un piloto sin cargo es gasto de IA y de atención de GSG
  **[decisión del dueño]**.

**Si preguntan por Factoque:** tiene sus precios definidos y es otro producto, de la capa 1. No se mezcla con el
precio del asistente.

---

## E. Decisiones que esperan al dueño

| # | Decisión | Opciones | Recomendada | Qué se arriesga |
|---|---|---|---|---|
| 1 | Con qué negocio se prueba y se muestra | (a) Negocio de demostración propio de GSG · (b) un cliente, con su autorización registrada | (a) | (a) No prueba un rubro real. (b) Expone la marca y los datos de un cliente |
| 2 | Clave de API del modelo | (a) Cargarla con tope de gasto · (b) esperar | (a) al terminar C1 | (a) Gasto chico y medido. (b) C2 en adelante queda frenado |
| 3 | Migración de las tablas (Gate 2) | (a) Aplicarla junto con la del motor, con ensayo en copia · (b) después | (a) | Toca la base compartida con un negocio en producción |
| 4 | Número y cuenta de Meta para la demostración | (a) Número de prueba de Meta ahora y chip propio después · (b) chip desde el inicio | (a) | (a) No muestra el nombre del negocio. (b) Gasto antes de la venta |
| 5 | Trámite para conectar números de clientes | (a) Abrir ya una sesión que lea los requisitos en Meta · (b) esperar a tener producto | (a) | Si se espera, el plazo de Meta frena la primera venta |
| 6 | Orden de módulos | (a) Turnos, ventas, cobranzas · (b) ventas primero | (a) (`01`, sección 4) | (b) Toca plata y stock antes de medir |

## F. Qué no pude verificar

- Tarifa de WhatsApp para Argentina, plazos de verificación del negocio y de revisión de permisos, y qué permite el
  número de prueba: sin fuente oficial leída.
- Las páginas de Meta se leyeron con un lector automático que resume: hay que releerlas a mano antes de comprometer
  un costo o un plazo.
- Qué hay configurado hoy en Meta y en Vercel para WhatsApp, y si el circuito del pádel está prendido.
- Si existe un negocio de GSG en la base.
- El costo real por conversación: es un supuesto hasta C2.
