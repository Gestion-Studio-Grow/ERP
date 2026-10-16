# Break Point Pádel: resultado del UAT en producción del 15/10/2026

**Contexto:**
- Guion: `docs/tenants/breakpoint/UAT-PRODUCCION.md` (main `35c302f3`).
- Producción: `breakpointpadel.gsgapp.com.ar`. Durante toda la prueba `/api/health` respondió con el commit `21cf0de3`.
- Lo corrió la sesión local «Integraciones de productos backoffice ERP», de 21:38 a 21:52 (hora de Argentina).

**Alcance que fijó el dueño:**
- en producción y **sin claves**: las partes 0 y 5, más el turnero con Google (demo), las reservas, el comprobante
  simulado y la sincronía con el club;
- todo en el Chrome real, en escritorio y a 390 px;
- lo que pide PIN o crear una cuenta con contraseña **no se corrió**: partes 1, 2 y 3, el paso 4.2 con celular y el
  club como Rober;
- no se tocaron la consola, Vercel ni Neon. Lo único que se hizo antes fue el alta, autorizada aparte.

**Cómo se probó cada cosa:**
- **Escritorio:** Chrome real, ventana de 1225 × 567.
- **390 px:** la ventana del Chrome no se puede achicar, así que se usaron dos marcos de 390 × 844 con `/turnero` y
  `/club`, dentro de una pestaña del mismo dominio. Fue posible porque el sitio no prohíbe que lo embeban (ver D38).
- **Un control con Chromium 1228 (Playwright) a 390 px:** el link «Mis turnos» del encabezado, que usa scroll
  suave. Con la ventana de Chrome oculta, el scroll suave no avanza.

**El alta, antes del UAT:**
- Negocio `breakpoint`, subdominio `breakpointpadel`, «Break Point Pádel», id `cmva026ye000008l8qhhnjw9j`.
- Dueño provisional «Soporte GSG».
- Sin CUIT, porque el dueño confirmó que no se va a facturar.
- La clave del dueño no se escribió en ningún lado.

## Pasos

| # | Paso | Estado | Evidencia |
|---|---|---|---|
| 0.1 | Portada propia: logo, azul #035BA8, borde naranja; no es «Mi negocio» | **OK** | `u01` |
| 0.2 | `/turnero` y `/club` cargan; consola sin errores; pedidos en 200 | **OK** | `u02`, `u03` |
| 0.3 | WPE y CH siguen igual; Break Point no se mezcla | **OK** | En WPE, «Break Point» figura en la lista de sedes, que es contenido propio. En la base, la fila de CH tiene la misma huella md5 antes y después del alta |
| 0.4 | `breakpointpadel…/admin` | **OK** | Rebota al ingreso del ERP con «BP · Break Point Pádel», sin datos de otro negocio (`u04`) |
| 0.5 | `wpe…/sitio-estatico/club` | **OK** | 404. También dan 404 `/club` y `/turnero` en el host de WPE (`u05`) |
| 1.x | Matriz de acceso de los 4 usuarios, alta y baja, PIN nuevo | **NO CORRIDO** | Pide PIN (fuera del alcance de esta pasada) |
| 2.x | Bloqueo con PIN | **NO CORRIDO** | Pide PIN. De paso: el candado bloquea, Esc no lo cierra y el foco va al PIN (`u24`) |
| 3.x | Los 8 pedidos del 15/10 | **NO CORRIDO** | Varios pasos piden PIN; quedan para el dueño |
| 4.1 | Turnero en A, club en B: «Turnero en vivo» | **OK** | `u03` |
| 4.2 | Ingreso con Google (demo) | **OK con falla intermitente** | Anduvo 5 de 6 veces; ver D37. Crear cuenta con celular: **NO CORRIDO** (contraseña) |
| 4.3 | Reserva futura (vie 16, 20:00, Cancha 2) → agenda del club | **OK** | Aparece sola con «falta seña $21.000», más las novedades «Cliente nuevo por la web» y «Reserva web» (`u06`, `u07`) |
| 4.4 | «Simular comprobante» → firme y novedad en el club | **OK** | Novedad «✅ Seña por WhatsApp…»; el turno sale sin deuda |
| 4.5 | Turno desde el club como Lu (vie 16, 22:00, Cancha 3) → se ocupa en el turnero | **OK** | Desaparecen los 5 horarios superpuestos de la Cancha 3. El mensaje ya trae alias y código (BP-LRKD) |
| 4.6 | Cerrar el primer turnero y abrir otro: el club sigue en vivo | **OK con defecto** | Sigue «en vivo», pero la demo arranca de cero y el club pierde las reservas sin avisar. Ver D36 (`u09`, `u10`) |
| 4.7 | WhatsApp sin número | **OK** | `wa.me/?text=…` |
| 5 | 6 estilos × claro/oscuro: agenda, turno abierto, bloqueo | **OK** | 12 combinaciones sin desbordes ni textos perdidos (`u11`–`u24`) |
| 5 | 390 px: turnero completo (Google → seña → firme → «Mis turnos» → cancelar) | **OK** | Sin scroll horizontal (373 de 390 px, con la barra). Ver `u25`–`u27` |
| 5 | 390 px: club como Lu | **OK** | Agenda y turno abierto (389 px) sin desbordes |
| 5 | 390 px: club como Rober | **NO CORRIDO** | Pide PIN |
| 5 | Crédito «Sistema hecho por Gestión Studio Grow» | **OK** | Sólo en el pie del club; no en la portada ni en el turnero |

**Arreglos del QA anterior que se ven publicados:**
- D21, en parte: hay una novedad «Cliente nuevo por la web». No se revisó la pestaña Clientes.
- D26 y D30: «Mis turnos (n)» en el encabezado y «Saltar a Mis turnos».
- D27: las novedades quedan en un historial.
- D28: alias y código en el mensaje del turno del mostrador.
- D31: la píldora se movió abajo a la izquierda.
- D33: la tarjeta dice «La cancelaste vos».
- D24: a 390 px, después de «Simular comprobante» el foco va a «Listo». En escritorio, en una medición quedó en
  `BODY` [A VALIDAR].

## Defectos (siguen la numeración del QA anterior)

| # | Severidad | Dónde | Defecto | Pasos | Evidencia |
|---|---|---|---|---|---|
| D35 | Media | club | El panel «Novedades del turnero» no se cierra con Esc ni con un clic afuera; sólo con la píldora. Abierto, **tapa «+ Turno»** y parte de la agenda: un clic en «+ Turno» cae sobre el panel. Panel `aside#bp-turnero` en y 277–555, «+ Turno» en y 265–303 | En `/club`, tocar la píldora, después Esc o clic afuera, después «+ Turno» | `u08` · `https://breakpointpadel.gsgapp.com.ar/club` |
| D36 | Media | demo turnero + club | Al cerrar la pestaña del turnero que hace de servidor, la que queda arranca **una demo nueva**: el club pierde las reservas web y las del mostrador, sin aviso. El historial de novedades sigue mostrando las de la demo anterior. Está documentado en `turnero/bus.mjs:5-6`. La rama ya tiene un arreglo sin publicar: `e81638ca` («toma de posta sin perder la demo») | Turnero A + club; reservar en A y cargar un turno en el club; cerrar A; abrir otro `/turnero` | `u09` (agenda del vie 16 sin las dos reservas), `u10` (el turnero nuevo muestra libres 20:00 C2 y 22:00 C3) |
| D37 | Media, intermitente [A VALIDAR] | turnero | En la pestaña nueva, recién convertida en servidor, el primer «Continuar con Google» **no hizo nada**: ni sesión, ni reserva, ni mensaje de error. Los dos intentos siguientes anduvieron. Pasó 1 vez de 3 en esa pestaña | Después de D36: elegir turno → Reservar → Continuar con Google | Sin captura: no queda nada a la vista |
| D38 | Baja (demo); media antes del turnero real | sitio estático | `/turnero` y `/club` responden **sin `X-Frame-Options` ni `frame-ancestors`**: se pueden embeber en cualquier sitio (clickjacking). Se comprobó embebiéndolos | `fetch('/turnero').headers` | Encabezados vacíos; así se hizo la prueba a 390 px |
| D39 | Baja | consola del operador | En «Marca y link» se ofrece el color «azul», pero la revisión avisa «Acento "azul" no está en los presets conocidos». El alta quedó con celeste para no grabar un valor desconocido | `/operador/alta` → «Marca y link» → azul → Revisar | Texto de la revisión |

## Observaciones (no son defectos)

- La pantalla de bloqueo muestra los PIN de la demo («Rober 11 · Majo 22 · Lu 33 · Caro 44»). Sirve para la demo; hay
  que sacarlos antes de una versión con usuarios reales.
- La pestaña de la consola con la clave del dueño quedó abierta para que la copie el dueño.

— Elaborado por GSG

## Arreglos (16/10) — pendientes de re-verificación en Chrome

Pasaron el Gate (aprobado tras dos rechazos: B1 ids repetidos después de la toma de posta, S1 dos servidores si se
roba el lock mientras se espera la foto). Commits bf608355 · 14d2a52c · 850e4c47.

| Defecto | Arreglo | Cómo se verificó |
|---|---|---|
| D35 | El panel «Novedades del turnero» se cierra con Esc y tocando afuera; ocupa menos alto; Esc no le roba el foco a otra cosa | E2E del sitio |
| D36 | El servidor reparte una foto de toda la demo (turnero, sesiones, buzón y contador de ids) después de cada cambio y al cerrarse; la pestaña que toma la posta sigue desde la más nueva | Test de pestaña nueva en otro proceso (3 reservas con seña + cancelación) y E2E (el club conserva la reserva web y la del mostrador) |
| D37 | Un pedido que se cruza con el cambio de servidor se reintenta una vez contra el NUEVO; «Continuar con Google» muestra «Entrando…» | Revisión del Gate (no tiene reproducción automática: queda a validar en Chrome) |
| D38 | `/`, `/turnero`, `/club` y `/previews/breakpoint/*` sólo se dejan embeber en el mismo sitio. WPE no cambia (freeze) | Tests de cabeceras |
| D39 | La revisión del alta toma los colores de la misma lista que ofrece la consola | Test de provisioning |

**Deuda anotada (no bloquea):**
- Dos fotos con la misma versión de reservas: si la de otra pestaña trae un usuario recién registrado, puede descartarse. Pasa en pocos casos.
- Una pestaña vieja congelada que recibe el lock deja a un turnero nuevo en «La demo se está iniciando» hasta que se descongele. Ya pasaba antes.
- Recargar la página saltea el bloqueo con PIN (la demo no tiene login real).
- El cambio de color de la ficha (celeste → azul) queda a decisión del dueño.

— Elaborado por GSG

## Re-verificación del 16/10

**Parte A, en producción (Chrome real, sesión de la PC):** D35 a D39 OK, sin defectos nuevos. D36 se probó con 3 reservas (2
con seña firme y 1 cancelada con crédito) y dos cambios de pestaña servidor. D37 dio 4 de 4. D38 tiene las cabeceras en `/`,
`/turnero`, `/club` y `/previews/breakpoint/…`, y WPE no las tiene (freeze intacto).

**Parte B (partes 1, 2, 3 y 4.2: las que piden PIN o contraseña):** la sesión de la PC no escribe PIN ni contraseñas en un
dominio público, ni siquiera los de la demo. Se corrió en Chromium contra el MISMO sitio empaquetado, servido por el mismo
manejador del ERP que usa producción, en un host público simulado. Script repetible: `npm run test:club-uat`
(`src/tenants/breakpoint/turnero/e2e/uat-b.e2e.mjs`). **Resultado: 42/42 OK (incluye un caso propio para D41), cero errores de consola.**

| Parte | Qué se comprobó | Estado |
|---|---|---|
| 1 · matriz | Rober y Majo ven las 9 pestañas; Lu y Caro sólo Agenda, Buffet, Caja y Clientes | OK |
| 1 · cuenta corriente | Los dueños la habilitan; recepción no ve el límite | OK |
| 1 · falta | «Sin cargo (excepción)» sólo para dueños | OK |
| 1 · descuento | Sin PIN se niega a los 4; con PIN de dueño se aplica, también si está logueada recepción | OK |
| 1.1 a 1.4 | PIN equivocado; pedir acceso, aprobarlo, entrar con permisos de recepción y revocarlo; PIN nuevo de Caro (el viejo deja de andar); el dueño no se saca el acceso a sí mismo | OK |
| 2 · bloqueo | Candado; Esc y atajos no abren nada detrás; 5 PIN mal → 30 s; su PIN desbloquea; «Entrar con otro usuario» cierra lo del anterior; más de 30 s afuera bloquea y menos no; inactividad de 1 min bloquea | OK |
| 3 · 8 pedidos | A cargo de, confirmación de créditos, «cargo», − / +, pasar un cargo, cargo manual, un descuento no se pasa, dos códigos, precios y rentabilidad | OK |
| 4.2 | Registro con celular: la contraseña corta se rechaza; con una válida reserva y pide la seña | OK |

Capturas en `uat-prod/b01…b07`.

**Mejoras que salieron del recorrido (arregladas en el mismo commit):**
- **D40 · baja:** un dueño que pide un descuento sin escribir el PIN veía «PIN incorrecto.». Ahora dice que el descuento lo autoriza el dueño con su PIN y dónde escribirlo.
- **D41 · baja:** el campo de PIN del bloqueo aceptaba letras, y dos letras contaban como un intento fallido. Ahora sólo entran números.
- **D42 · baja:** con una ventana abierta, la tecla L no bloqueaba (los atajos se apagan con una ventana abierta). Bloquear es de seguridad: ahora L anda aunque haya una ventana abierta, salvo mientras se escribe en un campo o con la búsqueda (Ctrl K) abierta. Ojo: con el foco en un botón de una ventana, una L cierra esa ventana y lo cargado sin guardar se pierde (es a propósito: quien bloquea se va del puesto). Figura en la ayuda de atajos (?).

— Elaborado por GSG
