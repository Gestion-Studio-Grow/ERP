# Unboxing Fest · guía de operación

Activación: stand de Farmaonline en POP FEST 101.5 (5/12/2026, Parque Norte). Producción: MIA Producciones. Tecnología: Gestión Studio Grow.
Estado: **publicado en `unboxingfest.gsgapp.com.ar` (fase 1: cuenta regresiva).** La fase 2 (planilla conectada, clave del equipo, llave en vivo) se publica antes del evento; falta lo de la sección 7.

## 1. Links (nombre + dominio de GSG)

| Para qué | Link |
|---|---|
| Portada con los 3 juegos (público) | `https://unboxingfest.gsgapp.com.ar` |
| Probar los juegos sin premio, fuera de horario | `https://unboxingfest.gsgapp.com.ar/?demo=1` |
| Pantalla del stand con el QR en vivo | `…/juegos/unboxingfest/pantalla.html` |
| Tablet fija del stand | `…/juegos/unboxingfest/farmaonline-abrilo-vos.html#stand` |
| Tablet o celular del promotor que recorre la fila | `…#promotor` |
| Celular del visitante (QR, invitados, redes) | `https://unboxingfest.gsgapp.com.ar/?o=<origen>` |
| Horas pico (partida de 30 s) | agregar `rapido` al final: `#stand-rapido` |
| Pantalla a pleno sol | agregar `sol`: `#stand-sol` (también se prende desde el panel) |

**Origen** (`?o=`) dice de dónde vino cada lead: `redes`, `invitados`, `whatsapp`, `qr-bano`, `qr-barra`, `promotor1`… Un QR distinto por lugar permite medir cuál rinde.

**Demo:** con `?demo=1` se juega fuera de horario, el código sale `DEMO-…`, no tiene premio, el mostrador lo rechaza y no se manda nada a la planilla.

## 2. Antes del evento: apertura online
- El link se puede compartir antes. Hasta que se abre la ventana muestra una cuenta regresiva, cuándo se abre y un botón «Agendalo».
- **Ventana provisional a confirmar:** se abre 1 o 2 horas antes del evento (decisión del dueño, 17/11) y cierra al terminar. Se cambia en la configuración (`ventana`).
- **Online no se gana nada que se pueda usar online.** Quien juega desde su casa recibe un código que vale recién cuando lo **activa en el stand** (sección 3 bis). Así el juego trae gente al stand.
- **Entrada por WhatsApp (celular de MIA):** en redes se publica el QR de WhatsApp Business del celular de MIA con un mensaje ya escrito («Quiero jugar al Unboxing Fest»). El mensaje de bienvenida automático de la app responde con el link `https://unboxingfest.gsgapp.com.ar/?o=whatsapp`. La app lo manda la primera vez que alguien escribe o después de 14 días sin chatear ([ayuda de WhatsApp](https://faq.whatsapp.com/501866148528310/?cms_platform=android)). Los números reales quedan en ese celular.
  - Texto sugerido para la bienvenida: «¡Hola! Gracias por sumarte al Unboxing Fest de Farmaonline 🎁. Jugá acá: https://unboxingfest.gsgapp.com.ar/?o=whatsapp. Tu premio se retira en el stand de Farmaonline en POP FEST. Este número es sólo para el juego.»

## 3. Durante el evento
**Pantalla del stand:** un equipo (tablet, notebook o TV con navegador) abre `pantalla.html`, se carga la clave del equipo con señal, y queda mostrando el QR en vivo. El QR cambia cada minuto; si se corta la señal, la pantalla sigue funcionando. La pantalla no guarda la clave del equipo: guarda una clave que sirve sólo para ese día y el siguiente, así que cada día del evento se vuelve a cargar.

**Panel del stand:** mantené apretado el logo 3 segundos (en PC, Ctrl+Shift+L) y poné la **clave del equipo**. La clave la valida la planilla (no está escrita en la página) y queda guardada en esa tablet. Permite:
- validar el código que muestra la persona y marcarlo entregado (avisa si ya se usó, si está duplicado, si es falso o si falta activarlo);
- activar en el mostrador el premio de alguien que no pudo escanear la pantalla (la persona está ahí);
- cargar el stock de premios físicos del mostrador: cada canje descuenta uno y, en cero, el panel indica entregar el cupón;
- enviar los pendientes a la planilla y descargar el CSV de respaldo;
- prender el modo sol.

**Reglas que ya trae el juego:**
- un premio por persona (por email o WhatsApp, con la planilla central);
- los menores juegan y retiran el premio sin dejar datos;
- sin uso, la tablet vuelve sola al inicio.

## 3 bis. Juego limpio: llave por persona

**Se juega todas las veces que quieras; premio, uno solo.** Desde la segunda vez se juega sin premio.

**El premio de cada código vale recién cuando se activa EN el stand.** Cada persona activa el suyo, de una de estas formas, todas automáticas:

| Forma | Cómo | Quién hace algo |
|---|---|---|
| **QR en vivo** (la principal) | Jugó en su celular → escanea con la cámara el QR de la pantalla del stand → su celular muestra «✓ Premio activado» con su código. | Nadie del equipo. |
| **Tablet del stand** | Lo que se juega en una tablet con la clave del equipo cargada queda activado solo. | Nadie (la tablet se prepara el día anterior). |
| **Tarjeta única** (opcional, a confirmar con Ale) | MIA entrega una tarjeta con un QR propio. La persona la escanea antes o después de jugar y su premio queda activado. Cada tarjeta sirve una sola vez. | Imprenta, antes del evento. |
| **Mostrador** | Si alguien no pudo escanear (sin batería, sin cámara), el equipo lo activa desde el panel. | El equipo, un toque. |

**Por qué es seguro:**
- El QR en vivo sólo lo puede dibujar la pantalla del stand: se firma con una clave que vive en la planilla, no en la página. Una foto del QR vence a los 3 minutos.
- Con la clave de la pantalla no se pueden fabricar tarjetas: las tarjetas se firman con el secreto del stand, que nunca sale de la planilla.
- Canjear y buscar códigos exige la clave del equipo, validada por la planilla.
- El premio se retira en persona y se sella la mano. Online no hay nada canjeable.
- El premio no depende del puntaje: hacer trampa en el juego no da nada.
- La llave en vivo prueba que la persona está frente al stand, no quién es: durante 3 minutos alguien podría reenviarla. El tope de un premio por persona lo dan la planilla (email o WhatsApp) y el sello en la mano.
- Las tablets del equipo guardan la clave del equipo: van bloqueadas en modo kiosco (sección 5) y la clave se cambia después del evento.

**Filtros automáticos en el formulario:**
- teléfonos imposibles (repetidos, escaleras, sin característica válida);
- emails descartables (mailinator y similares) y de relleno;
- un campo trampa invisible para bots;
- formularios completados en menos de 3 s o ráfagas de registros (quedan marcados en la columna `senales`).

**El canje, paso a paso (unos 10 segundos):**
1. La persona muestra el código.
2. «Validar» en el panel: responde verde (con el nombre de pila y qué entregar según el stock), ya canjeado, duplicado, falso o **sin activar**.
3. Si dice «sin activar» y la persona está ahí: «Activar en el mostrador» y vuelve a validar solo.
4. Se le pregunta el nombre: tiene que coincidir.
5. Se mira la mano: sin sello, se sella y se entrega.

**Menores:** juegan y retiran sin dejar datos. El control es el sello, y en un mismo celular no se puede repetir.

**Perdió el código:** en el panel, «¿Perdió su código?», se busca por email o WhatsApp.

**Hace falta en el stand:** la pantalla con el QR en vivo (a la vista de la fila, cerca del mostrador), un sello o tinta UV, el panel en cada tablet y **señal estable** (un router o un celular dedicado como módem). Sin señal sólo se entregan los códigos jugados en esa misma tablet; los de los celulares se entregan cuando vuelve la señal, porque no hay forma segura de verificarlos.

**Verificación por la API de WhatsApp (opcional, no hace falta):** el script ya trae el webhook por si más adelante se usa la API de WhatsApp de la marca (propiedades `WA_VERIFY_TOKEN` y `WA_WEBHOOK_KEY`). Sin eso, el juego funciona igual.

## 4. Los datos llegan a la marca
- Cada lead se guarda en el equipo y se envía a una planilla de Google. Sin señal queda en cola y se reenvía solo; arriba se ve «N sin enviar».
- En el celular del visitante, una vez enviado, no queda nada personal en el teléfono (sólo el código).
- Los números de quienes escriban al WhatsApp de la entrada quedan en el celular de MIA: las bases lo informan.
- **Instalar la planilla** (una vez, desde la cuenta corporativa que va a ser dueña de los datos):
  1. Planilla → Extensiones → Apps Script → pegar `apps-script-leads.gs`.
  2. Configuración del proyecto → Propiedades del script:
     - `TOKEN` = una clave larga al azar (va dentro de la página; sólo frena el ruido);
     - `STAFF_KEY` = la clave del equipo del stand, **de 12 caracteres o más, generada al azar** (por ejemplo, con un gestor de contraseñas; nada de «farmaonline26»; con menos de 12 la planilla no la acepta); no va en la página. Se cambia después del evento;
     - `STAND_SECRET` = otra clave larga al azar, de 16 caracteres o más (no va en la página).
  3. Implementar → Aplicación web · ejecutar como: yo · acceso: cualquier usuario.
  4. Copiar la URL y el `TOKEN` en la configuración del juego (`endpoint`, `endpointToken`).
  5. Si se usan tarjetas: en el editor, ejecutar `generarTarjetas` (por defecto, 500). Llena la hoja «tarjetas» con serie, clave y link para la imprenta.
- **Capacidad:** Google permite 30 ejecuciones a la vez por cuenta ([cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas)). Alcanza para el stand; si hay un pico, el juego guarda en cola y reintenta.
- Respaldo: cada hora, CSV desde el panel a un segundo equipo.
- Al cierre, cuando la planilla tiene todo, se borran los leads de las tablets (las bases dicen 48 h como máximo).

## 5. Checklist del día anterior
- [ ] Planilla instalada con `TOKEN`, `STAFF_KEY` y `STAND_SECRET`, y probada con un lead de prueba (después borrarlo).
- [ ] Cambiar la sal de los códigos (`codeSalt`) y cargar `endpoint` y `endpointToken`; publicar la fase 2.
- [ ] Entrar una vez al panel de **cada tablet** con la clave del equipo (queda guardada).
- [ ] Pantalla del stand: abrir `pantalla.html`, cargar la clave y probar con un celular que el QR activa un código de prueba.
- [ ] WhatsApp de MIA: mensaje de bienvenida y QR de la app cargados; probar desde un celular que nunca escribió.
- [ ] Stock de premios cargado en cada tablet.
- [ ] Abrir una vez cada juego con señal, para que quede guardado sin conexión; después probar en modo avión.
- [ ] Fijar la pantalla: iPad con «Acceso guiado»; Android con «Fijar pantalla».
- [ ] Brillo al máximo, modo sol, cargador o batería externa, y funda contra el sol y el agua.
- [ ] QR impresos con su `?o=` y una prueba de cada uno.

## 6. Qué se probó (17/11/2026)
- Un bot jugó como una persona: mouse en PC y toques reales en celular y tablet.
- 38 pruebas de operación (planilla, cola sin señal, un premio por persona, stock, menores, panel, CSV, ventana horaria, modo celular, filtros de datos falsos) contra el Apps Script real, ejecutado en una planilla simulada.
- 36 pruebas de la llave por persona, con ataques: QR viejo o del futuro, llave inventada, tarjeta falsa o reusada, tarjeta fabricada con la clave de la pantalla, canje sin la clave del equipo, segundo código de la misma persona, fórmulas en los datos; y el recorrido completo en el navegador (pantalla → celular → mostrador).
- 5 pruebas de la demo en el dominio público.
- El 3D corrió por software, sin placa de video; falta probar en los equipos reales y con la planilla real (Apps Script) instalada.

## 7. Falta confirmar (no lo decide GSG)
- **Farmaonline / MIA:** datos legales (razón social, CUIT, contacto); premios y unidades; condiciones del cupón; horario de la ventana; celular de MIA para el WhatsApp de entrada; tarjetas únicas sí o no (Ale).
- **Legal:** revisión de las bases y la privacidad por un abogado matriculado, y la inscripción de la base ante la AAIP.
- **Dueño de GSG:** en qué cuenta vive la planilla (recomendado: una cuenta corporativa de Farmaonline o de MIA, no una personal) y publicar la fase 2.
