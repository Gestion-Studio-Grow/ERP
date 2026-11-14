# Canales y bandeja · 04 · Prueba real y demostración

**Fecha:** 14/11/2026 · **Estado:** plan, sin código, **corregido por el desafío adversarial del 14/11** (`03` §20) ·
Nombre en clave y provisional.

Orden del dueño (14/11/2026): «que podríamos comenzar ya a probar, a hacer pruebas reales sobre el producto y
comenzar a mostrarlo y a venderlo. Yo me ocupo de mostrarlo en persona y venderlo.»

**Esto es un borrador.** Mostrar y vender lo hace el dueño. **Nada de este documento sale hacia afuera sin su OK,
pieza por pieza:** ni el guion, ni una frase, ni una captura, ni un mensaje.

**Lo primero, dicho sin vueltas:** hoy el asistente por WhatsApp **no existe como producto**. Existen las piezas
(`01`, sección 1). Este documento separa lo que se puede probar y mostrar hoy, lo que se puede después de cada
tanda, y lo que depende de plata o de terceros. Regla DEMO → VENTA → INVERSIÓN: todo lo que cuesta plata está
marcado **[decisión del dueño]**.

---

## A. Qué se puede probar ya

### A.1 Hoy, con lo que hay en el código

| Qué | Cómo | Para qué sirve | Límite y gasto |
|---|---|---|---|
| La entrada de WhatsApp | Simulador firmado del conector: arma un aviso con la firma de Meta y verifica firma, desafío y normalización (`src/plugins/whatsapp/conector.ts:140-165`, `:200-218`; `src/integraciones/registro.ts:305`) | Evidencia de que la puerta de entrada funciona | Prueba técnica, en local, sin gasto. No es para mostrar |
| La conversación guiada de turnos | Tests de `src/lib/wa-dispatch.ts` con puertos falsos (`:7-11`) | Evidencia de la lógica servicio → fecha → hora → confirmación | En local, sin gasto. No está conectada a nada |
| El circuito completo en un rubro | Clases de pádel: recibe, reconoce al alumno, cancela su clase y contesta (`src/app/api/webhooks/whatsapp/route.ts:139-208`) | Es la prueba, **en el código**, de que «le escribís y el sistema lo hace» | Sólo sus tests. Está apagado salvo una variable del despliegue (`route.ts:57`); si hoy está prendido en producción **no lo sé**. No se muestra ni se dice que funciona (recuadro de la sección C) |
| El sistema donde va a trabajar el asistente | Reserva pública que deja el turno en la agenda (`src/lib/actions.ts:548-581`); tienda con «Pedir por WhatsApp», que registra el pedido y abre el chat con el número de pedido (`src/lib/order-actions.ts:724-725`) | **Es lo que se puede mostrar hoy en persona** | **En local**, sin gasto: una computadora con el repo, base local y los negocios de ejemplo de `prisma/seed-qa-tenants.ts:5-14` (uno por rubro; sólo desarrollo). No es una dirección pública. El WhatsApp de hoy es un link que toca una persona (`order-actions.ts:1549-1552`) |
| Consultas con borrador del asistente | Formulario web → consulta → borrador → una persona aprueba (`src/app/api/consultas/route.ts:36`; `src/lib/proyectos/acciones-consultas.ts:47`, `:91`) | Muestra una bandeja con asistente, en versión «prepara y una persona aprueba» | **No es sin gasto.** Necesita una IA conectada, y el código la da por conectada sólo con la clave de Anthropic (gasto por uso, **[decisión del dueño]** sin tomar) o con una cuenta de Cloudflare, que el dueño descartó (`src/lib/proyectos/ia.server.ts:33-37`, `:39-46`). Sin ninguna, la pantalla dice «Falta conectar la IA» (`:29`). Además el envío es por mail o simulado (`src/lib/proyectos/consultas.server.ts:34-37`) y es del rubro productora |

### A.2 Con qué negocio

**No se asume el consentimiento de ningún negocio dado de alta.** CH Estética está en producción con datos reales;
Magra, Shine Velas y A Dos Manos son clientes reales configurando; MIA empieza el 18/11; Break Point está congelado
hasta el 16/11 y `circuito-wpe` está congelado sin fecha. Ninguno se usa para esto sin una autorización registrada de ese cliente, y
sus marcas no se muestran a terceros.

Hay tres lugares posibles, y hoy sólo existe el primero:

1. **En local, hoy.** Base de una computadora con los negocios de ejemplo del repo. Lo prepara una sesión, no el
   dueño. Antes de mostrarlos hay que revisar que ningún negocio de ejemplo lleve el nombre o los productos de un
   cliente: **no lo revisé**.
2. **Un negocio de demostración propio de GSG**, con datos inventados, que tenga turnos y tienda. **Recomendado**,
   y **no existe todavía**. El dueño ya ordenó que GSG entre al sistema «como si fuera un cliente real» (análisis de
   mercado, `:293-296`). Al 14/11 no encontré un negocio de GSG en `prisma/`, `scripts/` ni `src/` (búsqueda por
   nombre, no concluyente). Ese alta es otra sesión (handoff §5, punto 7) y toca la base de producción:
   **[decisión del dueño]**.
3. **Un cliente**, sólo con su autorización registrada.

### A.3 Después de la tanda C1, sin depender de Meta

C1 trae un **mensaje de prueba desde la consola de GSG**: entra por la misma puerta que un WhatsApp real, con la
misma firma. Con eso se prueba la bandeja completa:

1. Entra un mensaje y aparece en «Conversaciones» del negocio correcto.
2. Dos personas lo ven; una lo toma; la otra ve quién lo tiene.
3. Nota interna, etiqueta, asignar.
4. La regla de las 24 horas (con el reloj de prueba).

No requiere clave de IA, número ni cuenta de Meta. **Sí requiere** la migración aplicada en la base donde se pruebe:
en local se aplica sin pedir nada; en producción es Gate 2, **[decisión del dueño]**.

### A.4 WhatsApp real en el celular del dueño: todo lo que hace falta

Que el dueño le escriba al número del negocio desde su celular y lo vea entrar **no es un paso de C1 solo**. Hacen
falta las siete cosas:

1. **La tanda C1 publicada.** Hoy el conector no tiene salida (`conector.ts:193`) ni quién atienda el mensaje.
2. **El negocio de demostración de GSG dado de alta** (A.2). **[decisión del dueño]**
3. **La migración de canales aplicada** en esa base (Gate 2). **[decisión del dueño]**
4. **Cuenta de desarrollador de Meta, una app y un número.** Leído en
   https://developers.facebook.com/docs/whatsapp/cloud-api/get-started : pide una cuenta de Facebook, registrarse
   como desarrollador y elegir o crear un portfolio de negocio. Meta da un número de prueba y deja cargar números
   destino; la página no dice cuántos ni si tiene costo: **sin fuente oficial**. La cuenta es del titular: **un paso
   del dueño**.
5. **Las variables en Vercel:** el secreto de la app y el token de verificación (`conector.ts:25-26`). Los pega el
   dueño. El token del número va sellado en la conexión del negocio.
6. **Un despliegue.** Cargar variables implica desplegar, y publicar a `main` sigue sus reglas (PR, CI, tanda).
7. **El webhook de la app apuntado** a `/api/integraciones/whatsapp` y la conexión del negocio creada.

**Riesgo: cortarle el WhatsApp a las clases de pádel.** El código acepta **un solo secreto de app** para todos los
negocios (`conector.ts:5-8`), y la ruta del pádel verifica con esa misma variable y el mismo token
(`src/app/api/webhooks/whatsapp/route.ts:59`, `:43`).
- Si la prueba usa **otra** app de Meta, su secreto es otro: al cargarlo, la ruta del pádel rechaza sus avisos
  (`route.ts:63`).
- Si usa **la misma** app, apuntar el webhook a la ruta nueva deja de entregar en la del pádel, y la ruta nueva no
  sabe atender una clase de pádel. Que una app admita una sola dirección de webhook es **a leer en la fuente**.

**Regla:** antes de tocar algo en Meta o en las variables, una sesión lee qué hay cargado hoy (la dirección del
webhook y si el pádel está prendido). Si está prendido, la prueba con WhatsApp real espera a que las clases de pádel
pasen a la ruta nueva (`03` §5). Mientras tanto, la demostración usa el mensaje de prueba de A.3.

### A.5 Qué mide cada prueba y cuándo se da por válida

| Prueba | Evidencia que tiene que quedar | Válida si |
|---|---|---|
| P1 · Bandeja (tras C1) | 20 mensajes de prueba, 2 personas, capturas, filas en la base local | Criterios 1 a 8, 26 y 31 de `02` §7, n/n, y la certificación adversarial sin hallazgos abiertos |
| P2 · Asistente de consulta (tras C2) | 30 casos contra el modelo real, con modelo, fecha y n/n; tokens y segundos por turno | 12 de 12 casos trampa; ninguna respuesta con un dato que no esté en el sistema |
| P3 · Uso propio (tras C2; necesita número propio y el aviso de privacidad, sección B) | Una semana de GSG atendiendo consultas reales de sus propios interesados en su número | Porcentaje resuelto sin persona, correcciones y costo real por conversación, medidos |
| P4 · Tareas (tras C3) | El expediente de cada tarea, como lo define `09` §17.3 | Cada tarea **liberada** con el protocolo de `09` §17: su batería de ataque, su umbral y quién libera. No se repite acá. Ninguna tarea sin confirmación por botón; ninguna duplicada; agenda igual a lo conversado |

**La garantía de GSG es la evidencia** (dueño, 14/11): «nosotros brindamos la mejor evidencia en las pruebas […]
Vamos a atacar [al agente] para que se intente hacer que se equivoque, y cuando obtengamos la excelencia recién ahí
lo liberamos.» Por eso ninguna tarea se prende en un negocio antes de P4. `09` es
`docs/tenants/mia-producciones/agentes/09-tecnica-ejecucion.md`.

Los datos de prueba se limpian o se marcan antes de cerrar cada sesión.

---

## B. Lo que necesita gasto o un trámite

Los importes y los plazos que no tienen fuente oficial se sacaron: figuran como «sin dato».

| Qué | Para qué | Cuesta | Cuánto tarda | Fuente |
|---|---|---|---|---|
| **Clave de API del modelo** | Todo lo que usa IA (desde C2) | Por uso. **Importe: sin número hasta medirlo en C2** (`03` §14). **[decisión del dueño]**, sin tomar | Sin dato | — |
| **Número de teléfono** para el negocio de demostración | Mostrarlo con número y nombre propios | Un chip. Precio: sin dato. **[decisión del dueño]** | Sin dato. El número no puede estar en uso en WhatsApp (`docs/tenants/matiasconsoli/whatsapp-business-paso-a-paso.md:34-35`) | — |
| **Cuenta de desarrollador y app de Meta** | A.4 | Sin costo según la página de inicio | Sin dato; es un paso del titular | https://developers.facebook.com/docs/whatsapp/cloud-api/get-started |
| **Medio de pago en Meta** | Pasar el cupo de 1.000 mensajes de servicio por número y por mes; sin medio de pago Meta deja de entregarlos al agotarse | Tarifa de Argentina: **sin fuente oficial**. **[decisión del dueño]** (tarjeta del titular) | Sin dato | https://developers.facebook.com/docs/whatsapp/pricing |
| **Verificación del negocio en Meta** | Subir el límite de 250 destinatarios por día fuera de la ventana (sube a 2.000 y es del portfolio entero, no de cada número) y pasar de 2 a 20 números | Sin costo conocido | **Sin fuente oficial.** Qué documentación pide: sin leer. GSG todavía no tiene entidad jurídica: riesgo | https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md · https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers |
| **Nombre visible del número** | Que el cliente vea el nombre del negocio | Sin costo conocido | Pasa por revisión; plazo sin fuente oficial | https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names |
| **Plantillas** | Escribir fuera de las 24 horas (recordatorios, C5) | Se cobran por mensaje; tarifa sin fuente oficial | La página dice que la revisión «puede tardar hasta 24 horas» | https://developers.facebook.com/docs/whatsapp/message-templates/guidelines |
| **Operar los números de los clientes desde la app de GSG** | Que cada cliente conecte **su** número | Sin dato | **Sin fuente oficial.** Lo único que hay es el relato de un tercero, que no se usa | Abrir una sesión que lo lea en la documentación de Meta |
| **Tope de 20 números de WhatsApp en toda la plataforma** | Pasar de 20 conexiones entre todos los negocios | Trabajo de construcción, sin gasto externo | Sin estimar | `src/integraciones/conexiones.server.ts:592`, `:632`, `:642`. Con la conexión 21 el sistema deja de saber a qué negocio va cada mensaje, **para todos**. Cuenta números, no negocios |
| **Instagram y Messenger** | Canales siguientes | Sin dato | Revisión aparte, sin fuente | Posterior |
| **Migración de las tablas** | Todo desde C1 en producción | Sin costo | Gate 2. **[decisión del dueño]** | `03` §4 |
| **Despertador por minuto y plan de Vercel** | Rescatar un mensaje colgado; uso comercial del plan | Depende del plan | Otra sesión | Handoff §4, puntos 16 y 17 |
| **Autorización firmada, términos y datos personales** | Poder tratar datos de los clientes de un negocio, incluidos los sensibles si el negocio los autoriza, y saber qué exige que los datos salgan del país | Posible costo legal | Otra sesión. Todo lo legal está **a leer en la fuente** (`03` §12) | Handoff §4, puntos 10 a 13 |

**Lo que no depende del código es de terceros:** que los clientes conecten su propio número con la app de GSG.
Conviene empezar ese trámite apenas esté leído en la fuente, en paralelo con la construcción.

**Regla de Meta que puede frenar el producto entero:** los términos (4.7, modificados el 23/09/2026) prohíben el uso
por proveedores de IA cuando la IA es la función principal, y Meta lo decide a su criterio
(https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform). El diseño lo encara con alcance cerrado
y número del negocio (`03` §13), pero el riesgo existe y hay que decirlo si un interesado pregunta.

---

## C. Guion de demostración en persona (borrador, 10 minutos)

**Regla del guion:** cada paso lleva una marca. Se muestra **sólo** lo que ese día cumple su marca. Lo demás se
nombra como «lo que viene», con esas palabras.

- **[HOY, en local]**: corre el 14/11/2026 en una computadora con el repo, base local y negocios de ejemplo (A.2,
  punto 1). La prepara una sesión. No es una dirección pública ni se puede mandar por link.
- **[DESPUÉS DEL ALTA DE GSG]**: lo mismo, en la dirección real, cuando exista el negocio de demostración de GSG
  (A.2, punto 2).
- **[DESPUÉS DE LA TANDA Cn]**: existe cuando esa tanda esté publicada y probada (A.5). Si el paso pide algo más,
  lo dice.
- Las preguntas de apertura y de cierre no usan el sistema: van sin marca.

Nunca la marca ni los datos de un cliente. El celular del dueño y una pantalla con el sistema.

| Min | Qué hace | Qué dice (provisional, a aprobar por el dueño) | Marca |
|---|---|---|---|
| 0–1 | Pregunta antes de mostrar | «¿Cuántos mensajes de WhatsApp te entran por día? ¿Quién los contesta? ¿Qué pasa con los que llegan de noche?» | Sin marca: no usa el sistema |
| 1–3 | Muestra el sistema: la agenda y la tienda. Reserva un turno desde la página pública y lo muestra entrando en la agenda | «Esto es el sistema del negocio. Todo lo que pasa queda acá: turnos, pedidos, cobros.» | **[HOY, en local]**. En la dirección real: **[DESPUÉS DEL ALTA DE GSG]** |
| 3–4 | Hace un pedido con «Pedir por WhatsApp»: el pedido queda registrado y se abre el chat con el número de pedido. En local no se manda el mensaje: el chat se abre hacia el número del negocio de ejemplo | «Hoy el WhatsApp lo contesta una persona, pero el pedido ya quedó cargado.» | **[HOY, en local]**. En la dirección real: **[DESPUÉS DEL ALTA DE GSG]** |
| 4–6 | Entra un mensaje y aparece en «Conversaciones». Lo toma, responde, deja una nota. Con el mensaje de prueba de la consola (A.3) | «Todos los mensajes en un solo lugar, para todo el equipo. Se ve quién atiende a quién.» | **[DESPUÉS DE LA TANDA C1]**, en local. **Desde su celular**, con WhatsApp real: además el alta de GSG y los siete requisitos de A.4, con el pádel a salvo |
| 6–8 | Pregunta un precio y un horario. El asistente contesta con los datos del sistema. Pregunta algo que no está cargado: el asistente dice que no lo tiene y lo pasa a una persona | «No inventa. Lo que no sabe, lo pasa.» | **[DESPUÉS DE LA TANDA C2]**, con la clave de IA cargada **[decisión del dueño]**. Por WhatsApp real: además A.4 |
| 8–9 | Pide un turno, ve lo que el asistente va a hacer, toca «Confirmar» y muestra el turno en la agenda | «Te muestra lo que va a hacer, tocás Confirmar y queda hecho. Lo ves en tu agenda.» | **[DESPUÉS DE LA TANDA C3]**, con el motor de ejecución construido y esa tarea liberada (`09` §17) |
| 9–10 | Toca «Tomar la conversación» y muestra que el asistente calla. Muestra «Pausar todo» | «Vos mandás. Lo frenás cuando quieras y queda anotado todo lo que hizo.» | **[DESPUÉS DE LA TANDA C1]** |
| Cierre | Pregunta y anota | «¿Qué te gustaría que haga primero en tu negocio?» | Sin marca: no usa el sistema |

**Versión del 14/11/2026 (sólo pasos [HOY, en local]), 5 minutos:** minutos 0 a 4 y el cierre. Frase para lo que
falta: «El asistente que contesta y hace la tarea por WhatsApp lo estamos construyendo sobre este sistema. Cuando
esté probado te lo muestro funcionando; si te interesa, quedás entre los primeros.»

> ### Lo que NO se puede decir en una demostración
>
> Porque hoy no es cierto, o no está verificado.
>
> 1. **Que hoy algo responde por WhatsApp**, ni que el circuito del pádel ya funciona en producción. El circuito
>    está en el código, apagado salvo una variable, y no se verificó si está prendido.
> 2. **«Te lo hace sin tocar nada.»** Hace falta que el cliente toque «Confirmar» (`02` §4).
> 3. **Que de noche lo atiende una persona.** De noche contesta el asistente; lo que necesita una persona espera
>    al horario de atención.
> 4. **«Ilimitado» o «todos tus locales».** Hoy hay un tope de 20 números de WhatsApp en toda la plataforma.
> 5. **Un costo por conversación.** No está medido (`03` §14).
> 6. **Que Meta lo permite seguro.** La cláusula 4.7 de sus términos deja la decisión a criterio de Meta.
> 7. Que atiende Instagram, Messenger, mail o audios.
> 8. Que emite facturas o devuelve plata solo.
> 9. Un plazo para conectar el WhatsApp del interesado: depende de Meta y no hay fuente.
> 10. Que «no se equivoca». Lo que sí se puede contar, si el dueño lo aprueba: que cada tarea se ataca para
>     hacerla equivocar antes de habilitarla, y que se muestra con qué se la probó.
> 11. Que los mensajes de WhatsApp son gratis: hay un cupo mensual y después se pagan a Meta.
> 12. Cómo se reparte la responsabilidad por un error, como si fuera una condición cerrada: el criterio del dueño
>     está decidido, pero la redacción legal está pendiente (`09` §17.3).
> 13. Que trata datos de salud u otros datos sensibles: sólo con la autorización firmada del negocio, y lo legal
>     está sin leer en la fuente.

**Lo que conviene anotar de cada interesado** (es la validación de precio y de demanda que hoy falta): rubro;
mensajes por día; quién los atiende y cuántas horas; qué se pierde por no contestar a tiempo; qué herramienta usa
hoy y cuánto paga; qué tarea querría delegar primero; si daría una autorización firmada para que el asistente opere.

---

## D. Qué decir sobre el precio, sin inventar números

**Lo que es cierto hoy:**
- El producto tiene dos capas (dueño, 14/11): el sistema, y encima los puestos cubiertos por agentes.
- El precio de la capa 2 **no está validado**: faltan el costo real por conversación (se mide en C2; hoy no hay
  número) y las entrevistas con negocios (handoff §4, punto 15).
- WhatsApp tiene un costo propio que cobra Meta, aparte del nuestro.

**Qué decir (provisional, a aprobar por el dueño):**
- «Son dos cosas: el sistema, que tiene su plan, y el asistente, que se paga por puesto, como un empleado más.»
- «El precio del asistente lo estamos cerrando con los primeros negocios. No te voy a tirar un número que después
  cambie.»
- «Aparte está lo que cobra WhatsApp por los mensajes, que va directo a Meta. Hay un cupo mensual sin cargo.»
- «Contame cuánto te cuesta hoy atender el WhatsApp y te digo si te conviene.»
- Si insisten: «Te lo paso por escrito el [fecha].» Y cumplir la fecha.

**Qué no decir:**
- Ningún importe de la capa 2, ni «desde», ni rangos, ni un costo por conversación. Las cifras del análisis de
  mercado son estimaciones sin validar
  (`docs/sectores/agencia-digital/analisis-mercado/2026-11-14-linea-agentes-ia-para-pymes.md:69-70`).
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
| 1 | Con qué negocio se prueba y se muestra | (a) Negocio de demostración propio de GSG · (b) un cliente, con su autorización registrada · (c) sólo en local por ahora | (a) | (a) No prueba un rubro real, y el alta toca producción. (b) Expone la marca y los datos de un cliente. (c) No se puede mostrar fuera de una computadora preparada |
| 2 | Clave de API del modelo | (a) Cargarla con tope de gasto · (b) esperar | (a) al terminar C1 | (a) Gasto por uso, sin número hasta medirlo. (b) C2 en adelante queda frenado |
| 3 | Migración de las tablas (Gate 2) | (a) Aplicarla junto con la del motor, con ensayo en copia · (b) después | (a) | Toca la base compartida con un negocio en producción |
| 4 | Número y cuenta de Meta para la demostración | (a) Número de prueba de Meta ahora y chip propio después · (b) chip desde el inicio | (a) | (a) No muestra el nombre del negocio. (b) Gasto antes de la venta |
| 5 | Trámite para conectar números de clientes | (a) Abrir ya una sesión que lea los requisitos en Meta · (b) esperar a tener producto | (a) | Si se espera, el trámite de Meta puede frenar la primera venta |
| 6 | Orden de módulos | (a) Turnos, ventas, cobranzas · (b) ventas primero | (a) (`01`, sección 4) | (b) Toca plata y stock antes de medir |
| 7 | Cuándo se toca Meta para la prueba con WhatsApp real | (a) Primero leer qué hay cargado; si el pádel está prendido, esperar a pasarlo a la ruta nueva · (b) cambiar el webhook ya | (a) | (b) Puede cortar el WhatsApp de las clases de pádel de un cliente (A.4) |
| 8 | Qué frases del guion y del recuadro se usan | Aprobar pieza por pieza | — | Decir algo que hoy no es cierto |

## F. Qué no pude verificar

- Tarifa de WhatsApp para Argentina, plazos de verificación del negocio y de revisión de permisos, y qué permite el
  número de prueba: sin fuente oficial leída.
- Las páginas de Meta se leyeron con un lector automático que resume: hay que releerlas a mano antes de comprometer
  un costo o un plazo.
- Qué hay configurado hoy en Meta y en Vercel para WhatsApp, y si el circuito del pádel está prendido.
- Si una app de Meta admite una sola dirección de webhook de WhatsApp: a leer en la fuente.
- Si existe un negocio de GSG en la base, y qué nombres llevan los negocios de ejemplo del repo.
- El costo por conversación: no hay número hasta C2. Los precios por token se leen en la página oficial del
  proveedor el día de la medición.
- Lo que el desafío afirma de Meta sin dar la dirección (pasar a una persona sin demora, respetar la baja, no
  entrenar modelos con sus datos) y la Ley 25.326 (datos sensibles y datos que salen del país): a leer en la fuente.
