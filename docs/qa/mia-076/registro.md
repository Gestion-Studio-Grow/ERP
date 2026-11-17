# Registro de turno · correcciones de #188 + techo de accesos (GSG-MIA-076)

QA en navegador real (Playwright/Chromium, 1280×800 y 390×844, dsf 1) contra `http://negocio-a.erp.test:3076`
(`next dev`), base Postgres LOCAL efímera con las migraciones del repo y RLS (`app_rls`), nunca Neon. Negocio
ficticio «Negocio A (prueba)». 17/11/2026. Capturas fuera del repo (sin binarios en Git): scratchpad de la sesión,
`qa/cap/`. Ninguna captura muestra una clave. Par: subagente Sonnet sin la conclusión del constructor (dos pasadas).

| # | Pedido | Esperado | Hice | Vi | Captura | Par | Estado |
|---|---|---|---|---|---|---|---|
| 1 | C1 · La lista no ofrece a la dueña | «Mismos accesos que» sin Dueño/a ni Dirección | Supervisora: tablero → «Igualar los accesos» de Cobradora (la lista se muestra abierta con `size` sólo para la foto) | «Cajera Humana · Recepción», «Cajera Nueva · Recepción», «Recepcion A · Recepción» | mia076-c1-lista-sin-duenia-1280.png, mia076-c1-lista-sin-duenia-390.png | coincide: 4 opciones, ninguna Dueño/a | hecho |
| 2 | C1 · Id de la dueña mandado a mano | Rechazo entero, nada escrito | Agregué al select una opción con el id de la dueña y apreté «Igualar» | «Esa persona es Dueño/a: el usuario de un agente nunca queda con ese rol. Elegí a alguien del puesto.» | mia076-c1-forjado-duenia-rechazado-1280.png, mia076-c1-forjado-duenia-rechazado-390.png | coincide: mismo texto; a 1280 la barra fija tapa el borde superior del aviso (se lee entero) | hecho |
| 3 | C2 · Detalle a 390 (envío con contenido largo y plata) | Aprobar y Rechazar a la vista sin desplazar; scrollWidth ≤ 390 | Bandeja → clic en la excepción | Botones de 577 a 621 px (la barra inferior empieza en 787); scrollWidth del detalle 358, de la página 390 | mia076-c2-detalle-envio-largo-390.png, mia076-c2-detalle-plata-390.png, mia076-c2-detalle-envio-largo-1280.png, mia076-c2-detalle-plata-1280.png | coincide: botones enteros, sin desborde | hecho |
| 4 | C3 · El agente contesta eligiendo el pedido | Mensaje con pedidoId y cita | Usuario de Cobradora: «A qué pedido contestás» = «Pasame las señas pendientes…», texto, «Mandar» | «Responde al pedido «Pasame las señas pendientes de esta semana» de las 17/11, 08:17» sobre el mensaje | mia076-c3-agente-elige-pedido-1280.png, mia076-c3-agente-elige-pedido-390.png, mia076-c3-agente-cita-1280.png, mia076-c3-agente-cita-390.png | coincide: cita sobre «Señas pendientes: 3…»; a 390 el select corta el texto del pedido (esperable) | hecho |
| 5 | C4 · Lote mixto (plata + común) | El aviso nombra primero la plata; nada aprobado | Marqué «Reprogramar seguimiento» y «Devolver seña», «Aprobar (sin plata ni envíos)» | «Plata: en el lote hay 1 de plata. No se aprobó nada: la plata se aprueba de a una, viendo el contenido.» | mia076-c4-lote-mixto-1280.png, mia076-c4-lote-mixto-390.png | coincide: mismo texto | hecho |
| 6 | C5 · cambiar-password con el nombre del negocio | «Cuenta de Negocio A (prueba)» | Login de una cuenta con cambio obligatorio | «Definí tu contraseña · Cuenta de Negocio A (prueba)» | mia076-c5-cambiar-password-1280.png, mia076-c5-cambiar-password-390.png | coincide (2.ª pasada; la 1.ª a 390 salió en plena transición y se repitió) | hecho |
| 7 | C5 · definir-pin con el nombre del negocio | «Cuenta de Negocio A (prueba)» | Login de la supervisora → «Elegí tu PIN» | «Cuenta de Negocio A (prueba)» | mia076-c5-definir-pin-1280.png, mia076-c5-definir-pin-390.png | coincide | hecho |

Observación (no es de esta tanda): en `next dev` local la cabecera de cambiar-password dice «Mi negocio» (marca
del host); por eso el nombre de la cuenta se lee del `tenantId` del usuario y no del host.
