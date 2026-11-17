# Unboxing Fest · guía de operación

Activación: stand de Farmaonline en POP FEST 101.5 (5/12/2026, Parque Norte). Producción: MIA Producciones. Tecnología: Gestión Studio Grow.
Estado: **demo lista para mostrar.** Publicarla en el dominio de GSG y salir a redes necesita las confirmaciones de la sección 7.

## 1. Links (nombre + dominio de GSG)

| Para qué | Link |
|---|---|
| Portada con los 3 juegos | `https://unboxingfest.gsgapp.com.ar` |
| Tablet fija del stand | `…/juegos/unboxingfest/farmaonline-abrilo-vos.html#stand` |
| Tablet o celular del promotor que recorre la fila | `…#promotor` |
| Celular del visitante (QR, invitados, redes) | `https://unboxingfest.gsgapp.com.ar/?o=<origen>#qr` |
| Horas pico (partida de 30 s) | agregar `rapido` al final: `#stand-rapido` |
| Pantalla a pleno sol | agregar `sol`: `#stand-sol` (también se prende desde el panel) |
| Demo fuera de la ventana horaria | agregar `?demo=1` (muestra la marca «DEMO») |

**Origen** (`?o=`) dice de dónde vino cada lead: `redes`, `invitados`, `qr-bano`, `qr-barra`, `qr-grada`, `promotor1`… Un QR distinto por lugar permite medir cuál rinde.

## 2. Antes del evento: invitados y redes
- El link se puede compartir días antes. Hasta que se abre la ventana muestra una cuenta regresiva, cuándo se abre y un botón «Agendalo» que baja el evento al calendario.
- **Ventana provisional a confirmar:** abre el 5/12 a las 10:00 (6 h antes) y cierra el 6/12 a las 02:00. Se cambia en la configuración (`ventana`).
- Quien juega desde su casa recibe el código igual, pero **el premio se retira sólo en el stand** (lo dicen las bases): así el juego trae gente al stand.

## 3. Durante el evento
**Panel del stand:** mantené apretado el logo 3 segundos (en PC, Ctrl+Shift+L) y poné el PIN. Permite:
- validar el código que muestra la persona y marcarlo entregado (avisa si ya se usó, si está duplicado o si es falso);
- cargar el stock de premios físicos del mostrador: cada canje descuenta uno y, en cero, el panel indica entregar el cupón online;
- enviar los pendientes a la planilla y descargar el CSV de respaldo;
- prender el modo sol.

**Reglas que ya trae el juego:**
- un premio por persona (por email o WhatsApp en el equipo, y marca de duplicado en la planilla);
- los menores juegan y retiran el premio sin dejar datos;
- sin uso, la tablet vuelve sola al inicio.

## 3 bis. Reglas de juego limpio (un premio por persona)

**Se juega todas las veces que quieras; premio, uno solo.** Desde la segunda vez se juega sin premio: en el celular no aparece el botón de premio, y en la tablet el formulario responde «ya participaste».

El control tiene tres capas. Ninguna depende de que la persona diga la verdad, y **ninguna le pide al equipo del stand que revise mensajes**: el equipo sólo valida el código y sella la mano.

**Por qué los datos falsos no rinden:** inventar un email no da un segundo premio (la mano ya tiene sello) y el premio sólo se retira en persona. Lo que sí rinde es el WhatsApp real: suma un cupón extra. El incentivo está puesto del lado de la verdad, y la planilla separa los contactos comprobados (`whatsapp_real`) de los que no.

| Capa | Qué frena | Cómo |
|---|---|---|
| 1. **Sello en la mano al retirar** | Al que inventa datos para sacar varios códigos | El premio se entrega sólo en el mostrador. Al entregar se sella la mano; con sello no hay otro premio. Es el control de fondo del stock. |
| 2. **Planilla central** | Repetir con el mismo email o WhatsApp en otra tablet, y cobrar dos veces el mismo código | Antes de dar un código, el equipo consulta la planilla. Cada canje se valida ahí una sola vez, aunque haya varias tablets. Si sin señal se coló un segundo código, la planilla lo marca duplicado y el canje lo rechaza. |
| 3. **WhatsApp verificado, automático y opcional** | Números falsos en la base | Al terminar aparece un QR (tablet) o un botón (celular) que abre WhatsApp con «Mi código es FO-XXXXX» para el número de Farmaonline. La API de WhatsApp le avisa a la planilla, que marca `verificado_wa` y `whatsapp_real` sola; el celular de la persona muestra «✓ WhatsApp verificado» y el cupón extra. Nadie del stand lee mensajes. Un número falso no puede mandarlo: la base distingue los WhatsApp comprobados de los no comprobados. |

**Filtros automáticos en el formulario:**
- teléfonos imposibles (repetidos, escaleras, sin característica válida);
- emails descartables (mailinator y similares) y de relleno;
- un campo trampa invisible para bots;
- formularios completados en menos de 3 s o ráfagas de registros (quedan marcados en la columna `senales`).

**El canje, paso a paso (unos 10 segundos):**
1. La persona muestra el código.
2. «Validar» en el panel: responde verde (con el nombre de pila y qué entregar según el stock), ya canjeado, duplicado o falso.
3. Si está verde, se le pregunta el nombre: tiene que coincidir.
4. Se mira la mano: sin sello, se sella y se entrega.

Si el panel dice «WhatsApp verificado», además se le entrega el cupón extra. Si no lo verificó, igual retira su premio: la verificación es opcional.

**Menores:** juegan y retiran sin dejar datos. El control es el sello, y en un mismo celular no se puede repetir.

**Perdió el código:** en el panel, «¿Perdió su código?», se busca por email o WhatsApp.

**Hace falta en el stand:** un sello o tinta UV, el panel en cada tablet y señal (o el modo sin conexión, que queda para auditar). No hace falta un celular para leer WhatsApp.

**Verificación automática de WhatsApp, cómo se arma** (una vez, la hace quien administre la cuenta de WhatsApp de Farmaonline):
1. Número de WhatsApp de la marca en la plataforma de WhatsApp Business de Meta (API de la nube).
2. En el Apps Script, propiedades `WA_VERIFY_TOKEN` (cualquier clave) y `WA_WEBHOOK_KEY` (una clave larga).
3. En Meta, webhook = la URL de la planilla con `?k=<WA_WEBHOOK_KEY>`, token de verificación = `WA_VERIFY_TOKEN`, suscripción al campo `messages`.
4. En la configuración del juego, `waMarca` = el número de la marca.
5. Prueba: mandar «Mi código es FO-…» de un código de prueba y ver que la fila pasa a `verificado_wa`.

**Costo:** el sistema no responde mensajes, sólo los lee; recibir mensajes no tiene costo en la API. Si la marca quisiera contestar, desde el 1/10/2026 las respuestas de servicio se cobran por mensaje, con 1.000 gratis por mes por número (fuentes: developers.facebook.com/documentation/business-messaging/whatsapp/pricing y …/pricing/non-template-messages).

**Si la API no está lista para el evento:** el juego funciona igual. El botón de WhatsApp queda como canal de contacto y nadie del stand tiene que revisarlo; sólo no se marca `whatsapp_real` automáticamente.

## 4. Los datos llegan a la marca
- Cada lead se guarda en el equipo y se envía a una planilla de Google. Sin señal queda en cola y se reenvía solo; arriba se ve «N sin enviar».
- En el celular del visitante, una vez enviado, no queda nada personal en el teléfono.
- **Instalar la planilla** (una vez, desde la cuenta corporativa que va a ser dueña de los datos):
  1. Planilla → Extensiones → Apps Script → pegar `apps-script-leads.gs`.
  2. Propiedades del script → `TOKEN` = una clave larga.
  3. Implementar como aplicación web (ejecutar como yo; acceso: cualquier usuario).
  4. Copiar la URL y la clave en la configuración del juego (`endpoint`, `endpointToken`).
- Respaldo: cada hora, CSV desde el panel a un segundo equipo.
- Al cierre, cuando la planilla tiene todo, se borran los leads de las tablets (las bases dicen 48 h como máximo).

## 5. Checklist del día anterior
- [ ] Cambiar el PIN y la sal de los códigos (`pin`, `codeSalt`).
- [ ] Planilla instalada y probada con un lead de prueba (después borrarlo).
- [ ] Stock de premios cargado en cada tablet.
- [ ] Abrir una vez cada juego con señal, para que quede guardado sin conexión; después probar en modo avión.
- [ ] Fijar la pantalla: iPad con «Acceso guiado»; Android con «Fijar pantalla».
- [ ] Brillo al máximo, modo sol, cargador o batería externa, y funda contra el sol y el agua.
- [ ] QR impresos con su `?o=` y una prueba de cada uno.

## 6. Qué se probó (17/11/2026)
Un bot jugó como una persona: mouse en PC y toques reales en celular y tablet. Además se corrieron 38 pruebas de operación (planilla, cola sin señal, un premio por persona, stock del mostrador, menores, panel, CSV, ventana horaria, modo QR, filtros de datos falsos y verificación automática de WhatsApp) contra el Apps Script real, ejecutado en una planilla simulada. El 3D corrió por software, sin placa de video; falta probar en los equipos reales.

## 7. Falta confirmar (no lo decide GSG)
- **Farmaonline / MIA:** autorización registrada para usar la marca en el dominio de GSG; datos legales (razón social, CUIT, contacto); premios y unidades; condiciones del cupón; número de WhatsApp de la marca y alta en la API de WhatsApp (sección 3 bis); cupón extra por WhatsApp verificado; horario de la ventana.
- **Legal:** revisión de las bases y la privacidad por un abogado matriculado, y la inscripción de la base ante la AAIP.
- **Dueño de GSG:** publicar en producción (tanda de PR) y en qué cuenta vive la planilla (recomendado: una cuenta corporativa de Farmaonline o de MIA, no una personal).
