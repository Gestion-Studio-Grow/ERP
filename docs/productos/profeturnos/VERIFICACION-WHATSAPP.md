# ProfeTurnos — Verificación del profe por código de WhatsApp (diseño corto)

> Borrador para el dueño. Lo pidió la orquestadora el 10/11/2026 (decisión 2: verificar por WhatsApp, no por mail).
> El alta sigue cerrada (`PROFETURNOS_ALTA_ABIERTA` apagada) hasta que esto esté publicado.
> Los precios de Meta salen de fuentes secundarias (revendedores) del tarifario del 01/10/2026: **a validar en el tarifario oficial de Meta**.

## Qué se verifica
Que el WhatsApp que el profe carga en el alta es suyo. Los alumnos le escriben a ese número desde el turnero, así que si alguien carga el de otra persona, los mensajes le llegan a esa persona (observación media de la certificación de T1).

## Opciones de canal

| | A · Código «al revés» (recomendada) | B · Código de Meta (plantilla de autenticación) |
|---|---|---|
| Cómo funciona | El alta muestra un código de 6 dígitos y un botón «Verificar por WhatsApp». El botón abre `wa.me/<número GSG>?text=Mi código ProfeTurnos: 482913`. El profe toca Enviar. El webhook de Cloud API recibe el mensaje: WhatsApp ya garantiza el número que lo envía. Si el código coincide y el número es el del alta, queda verificado | GSG le manda al profe un código con una plantilla de autenticación aprobada (botón «copiar código»), y el profe lo escribe en la pantalla |
| Costo por verificación | **Cero** para el mensaje que entra: lo inicia el usuario y no tiene cargo. La respuesta «¡Listo, verificado!» es un mensaje de servicio, y los primeros 1.000 por mes son gratis. Se puede no responder y mostrar el OK en pantalla | ≈ **US$ 0,026** por mensaje entregado a +54 (unos $30 hoy), y se paga también cuando el profe no completa |
| Plantilla aprobada | No hace falta | Sí, de autenticación (se aprueba en minutos) |
| Riesgo | El profe tiene que salir de la pantalla y volver. Lo resuelve que la pantalla vaya mirando sola si ya llegó el mensaje | Mensajes que no llegan y costo por intentos fallidos o abuso |
| Código que ya existe | El webhook de WhatsApp de padel (`src/lib/padel/whatsapp-cloud.ts`: `firmaValida`, `responderDesafio`) y la ruta `api/webhooks/whatsapp` | El mismo cliente Cloud (`credencialesCloud`) |

**Recomendación: A.** No cuesta nada por profe, no depende de que Meta apruebe una plantilla y verifica mejor: el número lo prueba WhatsApp, no un código que alguien puede reenviar.

## Qué necesita el dueño (para A o B)
1. **Un número dedicado de GSG** para Cloud API. No puede ser uno que esté en uso en la app de WhatsApp. Puede ser un chip nuevo o un número virtual.
2. **Cuenta de Meta Business (portfolio) + app en Meta for Developers con WhatsApp.** Sin verificar el negocio, Meta deja hasta 250 destinatarios por día iniciados por la empresa, y eso alcanza para A, que no inicia conversaciones. La verificación del negocio tarda de 1 a 5 días hábiles y conviene para crecer.
3. **Medio de pago en Meta.** Para A casi no se usa, pero Meta lo pide.
4. **Variables en Vercel** (las carga el dueño; acá van sólo los nombres): `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, el secreto de la app para la firma y el token de verificación del webhook. Si el número de GSG es distinto del de padel, van con nombres propios de ProfeTurnos.
5. **Webhook de la app de Meta** apuntando a la ruta de verificación de ProfeTurnos.
6. Para B, además, la plantilla de autenticación aprobada.

## Plazo
- Construcción de A: **1 tanda**. Incluye código de un solo uso con vencimiento a 15 min, candado e intentos limitados, webhook con firma fail-closed, pantalla que espera, y tests con certificación adversarial (seguridad).
- Del lado de Meta: el mismo día, si el dueño ya tiene la cuenta Business. Con la verificación del negocio, entre 1 y 5 días hábiles más.

## Plan B mientras no esté: alta asistida
- El profe completa el alta y queda **pendiente de verificar**: crea el negocio, pero el turnero no se publica.
- GSG le escribe por WhatsApp desde el número de siempre, confirma que el número es suyo y lo **habilita a mano** desde la consola del operador, que deja una fila de auditoría `profeturnos.verificado`.
- Así se puede abrir el alta sin esperar a Meta, y cuando A esté publicado, la habilitación pasa a ser automática.
- Esto también lleva código: estado «pendiente» y botón en la consola. Es **una tanda chica**, que se puede hacer antes que A.

## A validar
- La tarifa oficial de Meta para Argentina, en el CSV oficial.
- Si la verificación del negocio es obligatoria para las plantillas de autenticación (sólo importa para B).
- Si el tope de 250 por día es por portfolio o por número.
