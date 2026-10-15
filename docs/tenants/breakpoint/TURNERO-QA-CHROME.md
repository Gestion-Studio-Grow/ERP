# Turnero de Break Point: QA en Chrome real (turnero web + backoffice conectado)

Hecho el 15/10/2026 por la sesión local «Integraciones de productos backoffice ERP», a pedido de la sesión «Padel court
management system». El dueño autorizó usar su Chrome real para las pruebas del navegador.

**Qué se probó:**
- versión `eda888b0`, el tip de `ccr-breakpoint-turnero`, que ya incluye D19 y D20;
- un worktree aparte (`C:\wt-turnero`), levantado con `npm run turnero` (back en :8787, front en :5173);
- todo local y en modo demo: nada de deploy, Neon, credenciales reales ni cuentas de terceros;
- la URL del backoffice con la clave no figura en este informe.

**Herramientas:**
- **Chrome real del dueño** (ventana de 1225 × 567): viajes de escritorio, backoffice conectado, dos pestañas, teclado, consola y red.
- **Chromium 1228 con Playwright 1.61.1**, emulando un Pixel 7 a **390 × 844**. Se usó para el viaje de celular, las
  mediciones con 4G lenta y axe. La ventana del Chrome real no se pudo achicar a 390 px (está maximizada y en segundo
  plano). El panel del navegador integrado tampoco sirvió: con la app de fondo no dibuja y las animaciones quedan
  congeladas. Las capturas `m*` salieron en tema claro porque Chromium no hereda el tema del sistema.
- **axe-core 4.12.1**, la versión instalada en esta PC. Como dice D19, la 4.12 no detecta «Label in Name».

Etiquetas: **[VERIFICADO]** = lo vi pasar en esta prueba · **[A VALIDAR]** = deducido del código, con el modo de cierre.

## Resumen

**Defectos:** 14 (D21–D34):
- 2 de severidad alta;
- 6 media;
- 5 baja;
- 1 que es una decisión del club.

**Los viajes principales funcionan de punta a punta** en escritorio y a 390 px:
- reservar con cuenta nueva, seña simulada, turno firme, «Mis reservas» y cancelar;
- lo mismo con Google simulado;
- la reserva web en la agenda sin recargar, en ambos sentidos;
- dos pestañas por el mismo turno: entra una sola.

| # | Severidad | Dónde | Defecto |
|---|---|---|---|
| D21 | **Alta** | backoffice | Los jugadores nuevos de la web y sus **créditos** no llegan en vivo al backoffice: aparecen recién al recargar |
| D22 | **Alta (para salir en real)** | back + turnero | En modo real no se exige el número de WhatsApp del club: «Mandar comprobante» abre WhatsApp **sin destinatario** |
| D23 | Media | turnero | Cuando otro jugador reserva, la grilla se repinta entera: el que usa teclado **pierde el foco**, y la grilla es una región `aria-live` |
| D24 | Media | turnero + backoffice | Foco perdido en los diálogos: después de «Simular comprobante», de cerrar o de reservar en el mostrador, el foco cae al `body` |
| D25 | Media | turnero | Dice «Cancelás sin costo hasta 12 h antes» en turnos que ya están dentro de las 12 h; recién al cancelar avisa que se retiene la seña |
| D26 | Media | turnero (celular) | «Mis reservas» queda al final: en un día cargado está **10 pantallas** más abajo |
| D27 | Media | backoffice | Avisos del turnero de 2,5 s, sin historial, y uno pisa al otro; con un diálogo abierto se meten **adentro del diálogo** |
| D28 | Media | backoffice + núcleo | El turno cargado en el mostrador no tiene código de reserva, y el mensaje para WhatsApp pide la seña sin alias ni código |
| D29 | Baja | turnero | Sin conexión con el club, el encabezado sigue diciendo «En vivo» |
| D30 | Baja | turnero | Teclado: el día enfocado queda casi oculto en la tira, y hay 142 paradas de Tab sin atajo |
| D31 | Baja | backoffice | La píldora «Turnero en vivo» tapa el botón «Estilo» al bajar la página |
| D32 | Baja | front local | Servido en `127.0.0.1:5173` no conecta nunca: la CSP sólo deja hablar con `localhost:8787` |
| D33 | Baja | turnero | Textos: «Cancela el cliente (online)» en «Mis reservas», y el crédito sólo se informa en un aviso de 4 s |
| D34 | A decidir | núcleo | Un mismo jugador puede tomar dos canchas a la misma hora |

---

## Defectos

### D21 · Alta · backoffice — los jugadores de la web y sus créditos no se actualizan en vivo [VERIFICADO]

**Pasos:**
1. Abrir el backoffice conectado y dejarlo abierto.
2. En el turnero, crear una cuenta nueva, reservar un turno de mañana, «Simular comprobante» y cancelar con más de 12 h.
   El turnero dice «Cancelado. Te quedan $19.000 de crédito en el club».
3. En el backoffice, ir a **Clientes**.

**Esperado:** el jugador nuevo con su crédito de $19.000.

**Obtenido:** «Clientes (24)», sin ninguno de los 5 jugadores creados por la web (`c11`). El back sí los tiene, con
el monedero en $19.000 y $21.000 (`GET /api/staff/estado`). Al **recargar** el backoffice aparecen: «Clientes (29)»
con los créditos (`c12`).

**Por qué pasa:** al conectar se baja todo el estado una sola vez (`club/conectado.mjs:41`). Después, en vivo, sólo se
actualizan `reservas, bloqueos, canchas, fijos, clima` (`club/conectado.mjs:98` y `:123`). `clientes` no está.

**Riesgo:** la recepción no ve un crédito que el club le debe al jugador y puede volver a cobrarle. Tampoco encuentra
por teléfono a un jugador que se registró por la web en esa misma tarde. El alcance conocido («se sincroniza la
agenda», en TURNERO-QA.md) no cubre este caso: acá hay plata.

### D22 · Alta para el modo real · back + turnero — el comprobante por WhatsApp no tiene destinatario [VERIFICADO en demo; A VALIDAR en real]

**Pasos:**
1. Reservar desde el turnero.
2. En «Mandá la seña y listo», mirar el botón «Mandar comprobante por WhatsApp».

**Obtenido:** `href="https://wa.me/?text=…"`, sin número. WhatsApp abre el selector de contactos, así que el jugador
no sabe a quién mandarlo y el comprobante no llega al club.

**Por qué pasa:** el número sale de `TURNERO_WHATSAPP_CLUB` (`back/servidor.mjs:116`), pero en modo real la lista de
variables obligatorias no la incluye (`back/servidor.mjs:40`). El front arma `wa.me/${numero}` aunque `numero` venga
vacío (`turnero/app.mjs:200-203`).

**Arreglo sugerido:** sumarla a las obligatorias del modo real, o esconder el botón si falta.

**Cierre del [A VALIDAR]:** levantar con `TURNERO_MODO=real` y las demás variables, sin `TURNERO_WHATSAPP_CLUB`, y ver
que arranca igual.

### D23 · Media · turnero — el repintado en vivo saca el foco del teclado y relee la grilla [VERIFICADO el foco; A VALIDAR la lectura]

**Pasos:**
1. En el turnero (viernes 16), poner el foco con Tab en «08:00 a 09:30, Cancha 1».
2. Desde otra pestaña o jugador, reservar cualquier otro turno de ese día (se probó 23:00, Cancha 4).

**Obtenido:** a los 2 s `document.activeElement` es `BODY`. El que navega con teclado vuelve al principio de la
página cada vez que alguien reserva, y un viernes a la noche eso pasa seguido.

**Por qué pasa:** `pintarGrilla` reemplaza toda la grilla con `innerHTML` (`turnero/app.mjs:111`). Esa grilla es
además `aria-live="polite"` (`turnero/index.html:58`): una región viva con más de 100 botones adentro.

**Arreglo sugerido:**
- sacar el `aria-live` de la grilla y anunciar el cambio en una región aparte («Se ocupó 23:00 Cancha 4»);
- al repintar, devolver el foco al mismo turno si sigue libre, o al vecino.

**Cierre del [A VALIDAR]:** con NVDA (ver «Lo que no se pudo probar»), contar qué se lee cuando otro reserva.

### D24 · Media · turnero + backoffice — foco perdido en los diálogos [VERIFICADO]

| Dónde | Paso | Foco después |
|---|---|---|
| Turnero | «Simular comprobante (demo)» con el diálogo de seña abierto | `BODY`, con el diálogo todavía abierto. El botón enfocado se esconde al pasar a firme (`turnero/app.mjs:204`; datos y WhatsApp en `:197`) |
| Turnero | «Listo» o Esc al cerrar el diálogo de seña | `BODY`: el turno que abrió el diálogo ya no existe porque se reservó |
| Backoffice | «Reservar» en «Nuevo turno» (el diálogo pasa a «Turno reservado ✔») | `BODY` |

Al cerrar «Turno reservado» el backoffice sí devuelve bien el foco a «+ Turno».

**Arreglo sugerido:** al pasar a firme, enfocar «Listo» o el título. Al cerrar, llevar el foco a la reserva nueva en
«Mis reservas».

### D25 · Media · turnero — la política de cancelación se informa mal en turnos dentro de las 12 h [VERIFICADO]

**Pasos:**
1. A las 12:37, reservar el turno de **hoy** de 14:00 (Cancha 3).

**Obtenido:**
- El diálogo dice «Cancelás sin costo hasta 12 h antes» (`c01`), cuando ya estamos dentro de las 12 h.
- Recién al tocar «Cancelar» aparece «Es tarde: la seña queda retenida. ¿Seguro?» (`c04`). Ese aviso dura 4 s
  (`turnero/app.mjs:272`) y no es una región viva: un lector de pantalla no lo anuncia.
- Al confirmar, el aviso dice «Si alguien toma el turno, la seña vuelve como crédito» (`turnero/app.mjs:279`), que
  contradice «queda retenida».

**Riesgo:** el jugador paga la seña creyendo que la puede recuperar. Hay que decírselo **antes** de reservar.

**Arreglo sugerido:** en `turnero/app.mjs:147`, si `inicio − 12 h` ya pasó, mostrar «Este turno ya no se cancela sin
costo». Unificar los dos textos de la cancelación tardía.

### D26 · Media · turnero en el celular — «Mis reservas» queda 10 pantallas más abajo [VERIFICADO]

A 390 × 844, en el viernes 16 (113 turnos), «Mis reservas» empieza en el píxel 8.545 de 9.053: **10,1 pantallas**
(`m06`). Hoy, con 31 turnos, está a 3,4 pantallas. En escritorio va en la columna derecha, pero en el DOM está
después de la grilla (`turnero/index.html:75-77`). El encabezado no tiene un acceso directo.

**Riesgo:** después de pagar, el jugador que quiere ver o cancelar su turno no lo encuentra.

**Arreglo sugerido:** un botón «Mis reservas (n)» en el encabezado, o subir el bloque arriba de la grilla cuando hay
sesión.

### D27 · Media · backoffice — avisos del turnero efímeros y metidos en otros diálogos [VERIFICADO]

**Avisos que llegaron:**
- «🌐 Reserva web: … (falta la seña)»;
- «✅ Seña por WhatsApp: … quedó firme»;
- «🌐 … canceló online».

**Problemas** (`club/app.mjs:93-112`):
- Duran **2,5 s** (`:112`).
- Uno pisa al anterior, porque se usa `replaceChildren` (`:110`).
- No quedan en ningún historial.
- **Si hay un diálogo abierto, el aviso se escribe dentro de ese diálogo** (`:97-104`). Con «Nuevo turno» abierto
  apareció «🌐 Reserva web: Jugador Demo · Cancha 3 22:00 (falta la seña)» como si fuera un mensaje del formulario
  (`c13`).

**Riesgo:** en un mostrador con gente, la recepción no se entera de una seña ni de una cancelación.

**Arreglo sugerido:** una bandeja o un contador de novedades persistente en el panel «Para resolver ahora», y avisos
que no se mezclen con el diálogo abierto.

### D28 · Media · backoffice + núcleo — el turno del mostrador no tiene código para la seña [VERIFICADO]

**Pasos:**
1. En el backoffice: «+ Turno» → Cancha 1, 21:00, 90 min, «Llegó por: teléfono», a nombre de «Cliente Telefonico QA»
   → Reservar.

**Obtenido:**
- El mensaje listo para WhatsApp dice «Para dejarlo firme falta la seña de $ 21.000 (transferencia o Mercado
  Pago)», **sin alias y sin código** (`c07`, `club/motor.mjs:1387`).
- En el back, esa reserva no tiene `ref`. El núcleo sólo genera el código en las reservas web (`dominio/nucleo.mjs:238`)
  y la sincronización conserva el que venga, pero no crea ninguno (`dominio/nucleo.mjs:466`).

**Riesgo:** el comprobante de ese cliente no se puede atar por código y cae a revisión manual. Que la conciliación lo
encuentre por el teléfono queda [A VALIDAR]: se cierra mandando un comprobante simulado desde el número del cliente.

**Arreglo sugerido:** generar `ref` también en el mostrador cuando hay seña, y sumar alias y código al mensaje.

### D29 · Baja · turnero — «En vivo» sin conexión [VERIFICADO]

**Pasos:** abrir el turnero sin back alcanzable. Se reprodujo con D32; apagando el back pasa lo mismo [A VALIDAR].

**Obtenido** (`c08`):
- el encabezado dice **«En vivo»**, un texto fijo del HTML (`turnero/index.html:30`) que sólo cambia cuando abre el
  canal en vivo (`turnero/app.mjs:341`);
- la grilla dice «No pudimos conectar con el club…»;
- los días quedan como esqueletos grises;
- «Mis reservas» dice «Todavía no tenés reservas».

**Arreglo sugerido:** arrancar en «Conectando…» y, en el estado `sin-conexion` (`turnero/app.mjs:461-466`), mostrar
«Sin conexión» y esconder los esqueletos.

### D30 · Baja · turnero — teclado: foco oculto en la tira de días y 142 paradas de Tab [VERIFICADO]

**Foco oculto:** con el sábado 17 elegido, la tira está corrida (`scrollLeft` 54). Al llegar con Tab a «hoy 15», el
botón enfocado queda **visible en 8 de sus 60 px** (`c10`). Es WCAG 2.2 · 2.4.11 «Focus Not Obscured». La tira sólo
se recentra al elegir un día (`turnero/app.mjs:76`), no al recibir el foco. Las flechas no mueven entre días.

**Paradas de Tab:** hay 142 en total: «Salir», 14 días, duración, el filtro de techadas y **120 turnos**, antes de
llegar a «Mis reservas». Hay landmarks (`main`, `aside`) y títulos `h2`, que sirven al lector de pantalla. Pero quien
usa sólo el teclado no tiene un «saltar a Mis reservas».

**Funciona bien:**
- foco visible: contorno naranja de 2,7 px;
- Enter en un turno abre el diálogo;
- Tab recorre el diálogo («Volver» → «Reservar»);
- Esc cierra los diálogos;
- el registro valida la contraseña corta.

### D31 · Baja · backoffice — la píldora «Turnero en vivo» tapa «Estilo» [VERIFICADO]

Al bajar la página, la píldora fija (`top: 8px; right: 12px; z-index: 70`, en `club/conectado.mjs:201`) se monta sobre
el botón «Estilo» del encabezado (`c06`). Sus rectángulos se superponen: píldora en x 1083–1198, «Estilo» en
x 1055–1142.

### D32 · Baja · front local — servido en `127.0.0.1` no conecta nunca [VERIFICADO]

**Pasos:** abrir `http://127.0.0.1:5173/turnero/`, con o sin `?api=http://127.0.0.1:8787`.

**Obtenido:**
- el pedido al back queda bloqueado («Failed to fetch») y se ve el estado de D29;
- el back acepta el origen `127.0.0.1:5173` (`turnero/levantar.mjs:12`) y el front elige `http://127.0.0.1:8787`
  (`turnero/app.mjs:18`);
- pero la CSP del front sólo deja `connect-src 'self' http://localhost:8787` (`turnero/servir-front.mjs:22`).

Sólo afecta al desarrollo local.

### D33 · Baja · turnero — textos

- En «Mis reservas», una cancelación propia figura como **«Cancela el cliente (online)»**, que es lenguaje del
  backoffice (`dominio/nucleo.mjs:251`). Sugerido: «La cancelaste vos».
- El crédito que queda después de cancelar **sólo aparece en un aviso de 4,2 s** (`turnero/app.mjs:53-59`, `:279`). En
  el celular ese aviso además tapa la tarjeta cancelada (`m08`). El turnero no muestra el saldo a favor en ningún otro
  lado.
- «Te quedan $X de crédito» informa sólo lo devuelto en esa cancelación, no el total.
- Si el crédito se descuenta solo en la próxima seña queda [A VALIDAR]: reservar de nuevo con ese jugador y mirar
  el monto pedido.

### D34 · A decidir con el club · núcleo — dos canchas a la misma hora [VERIFICADO]

El mismo jugador reservó el sábado 17 a las 20:00 la Cancha 3 y la Cancha 1, las dos esperando seña. Los límites son
«2 sin seña» y «4 por delante» (`dominio/nucleo.mjs:46`, `:225-226`), y no hay control de superposición por jugador.
Puede ser legítimo (un grupo que juega en dos canchas) o puede ser acaparamiento. **Lo decide el club.** El tope de 2
sin seña sí funciona: el tercer intento devolvió «Tenés turnos esperando la seña…».

---

## Lo que funcionó [VERIFICADO]

| Prueba | Resultado |
|---|---|
| Viaje en escritorio (Chrome real): turno → «Reservar» → registro → seña → «Simular comprobante» → firme → «Mis reservas» → cancelar | OK. Códigos BP-3DTZ y BP-CJF5 (`c02`, `c03`) |
| Viaje a 390 px (Chromium, Pixel 7): lo mismo y después Google simulado | OK (`m01`–`m09`). Botón «Crear cuenta» dentro de la pantalla (y 668–712 de 844) |
| Google simulado | Entra al instante; la demo siempre usa la misma cuenta («Jugador Demo») |
| Reserva web → agenda del backoffice | Aparece sin recargar, con «falta seña $15.000» y 3/4 jugadores; al pagar pasa a firme (`c05`) |
| Aviso de la seña en el backoffice | Llegan «🌐 Reserva web…», «✅ Seña por WhatsApp: … quedó firme» y «🌐 … canceló online» (con los límites de D27) |
| Turno telefónico → turnero | 21:00 Cancha 1 desaparece del turnero en ≈ 2 s, junto con los superpuestos (20:00, 20:30, 21:30, 22:00) |
| Dos pestañas, mismo turno, «Reservar» con 16 ms de diferencia | Entra una sola. La otra recibe «Ese turno se acaba de ocupar 😕» con 3 alternativas, y tocarlas cambia el turno del diálogo (`c09`) |
| Carrera por la API, dos jugadores distintos, 10 rondas simultáneas | **10/10** con exactamente un ganador y el otro con 409 |
| Clave del backoffice | Se borra de la barra de direcciones al conectar; al recargar entra con la sesión |
| «Reiniciar demo» conectado | Bloqueado a propósito: «la agenda es la del club y no se reinicia» |
| Scroll horizontal a 390 | Ninguno: `scrollWidth` 390 en inicio, diálogo, registro y seña |
| axe-core 4.12.1, WCAG 2.0/2.1/2.2 A y AA, a 390 | **0 violaciones** en inicio, diálogo de reserva y diálogo de ingreso |
| Consola y red, Chrome real (turnero y backoffice) y Chromium 390 | 0 errores, 0 violaciones de CSP y 0 pedidos fallidos. Todos los pedidos con 200 |

### Rendimiento: 390 px, «4G lenta» (150 ms, 1,6 Mbps / 750 kbps) y CPU ×4, sin caché

Se emuló con CDP en Chromium (`Network.emulateNetworkConditions` + `Emulation.setCPUThrottlingRate`), en 3 corridas.

| Corrida | Turnos visibles | FCP | LCP | CLS | TBT | Transferido | JS |
|---|---|---|---|---|---|---|---|
| 1 | 1,35 s | 0,66 s | 0,66 s | 0 | 219 ms | 18,8 KB | 8,4 KB |
| 2 | 1,54 s | 0,72 s | 0,72 s | 0,001 | 296 ms | 18,8 KB | 8,4 KB |
| 3 | 1,33 s | 0,61 s | 0,61 s | 0,001 | 156 ms | 18,8 KB | 8,4 KB |

- El LCP cumple el objetivo de < 1,5 s.
- El **TBT** (156–296 ms con CPU ×4) queda alrededor del umbral de 200 ms que Lighthouse considera «bueno» en celular.
  Es una observación, no un defecto.
- Las fuentes de Google terminan a los 0,86–1,0 s y no bloquean el render. El transferido no las cuenta, porque son de
  otro origen.

## Lo que no se pudo probar

- **Lighthouse:** no está instalado en esta PC, y bajarlo es una descarga que necesita el OK del dueño. Se reemplazó
  con las métricas de arriba, más axe y la revisión de buenas prácticas por consola y red.
- **Lector de pantalla (NVDA o Narrador):** esta sesión no puede escuchar el audio. Lo de D23 sobre la lectura queda
  [A VALIDAR] con NVDA.
- **Chrome real a 390 px:** la ventana no se achica. Se hizo en Chromium con emulación de celular, que es el mismo
  motor pero no es el Chrome del dueño.
- **Reconexión del canal en vivo** (cortar y volver la red): no se probó.

## Observaciones (no son defectos)

- El límite general de la API es de 300 pedidos por minuto **por IP** y cuenta todos los pedidos, incluidas las
  lecturas (`back/servidor.mjs:60`, `:255`). En el Wi-Fi del club, muchos jugadores salen con la misma IP. Es el mismo
  razonamiento de D3, pero para la API general. [A VALIDAR con una prueba de carga desde una sola IP.]
- El turnero y el backoffice cargan fuentes de Google: es un pedido a un tercero con la IP del jugador.

## Capturas (`qa-chrome/`)

**Chrome real, escritorio:**

| Captura | Qué muestra |
|---|---|
| `c01` | Reservar hoy 14:00: dice 12 h |
| `c02` | Esperando seña |
| `c03` | Turno firme |
| `c04` | «Es tarde: la seña queda retenida» |
| `c05` | Reserva web en la agenda del backoffice |
| `c06` | La píldora tapa «Estilo» |
| `c07` | Mensaje del turno telefónico sin código |
| `c08` | «En vivo» sin conexión |
| `c09` | Dos pestañas: 409 con alternativas |
| `c10` | Foco del día «hoy» oculto |
| `c11` | Clientes (24) sin los de la web |
| `c12` | Clientes (29) después de recargar |
| `c13` | Aviso web dentro de «Nuevo turno» |

**Chromium a 390 px:**

| Captura | Qué muestra |
|---|---|
| `m01` | Inicio |
| `m02` | Confirmá tu turno |
| `m03` | Registro |
| `m04` | Seña |
| `m05` | Firme |
| `m06` | Mis reservas |
| `m07` | Confirmar la cancelación |
| `m08` | Cancelada, con el crédito |
| `m09` | Ingreso con Google |

El viaje de celular reservó el turno de 16:30 a 18:00 de la Cancha 3. El filtro del script buscaba «18:00» y tomó el
turno que termina a esa hora. No es un defecto del turnero.

— Elaborado por GSG
