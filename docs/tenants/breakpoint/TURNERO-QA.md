# Turnero de Break Point: batería de tests, defectos encontrados y mediciones

**Fecha:** 15/10/2026 · **Rama:** `ccr-breakpoint-turnero` · **Etapa:** preventa, DEMO a costo cero.
Todo lo de este documento se corrió de verdad en esta sesión (Opus 5.5) y se puede volver a correr con los comandos de
abajo.

## Cómo se levanta

```bash
npm run turnero
# Turnero:              http://localhost:5173/turnero/
# Backoffice conectado: http://localhost:5173/club/?api=http://localhost:8787#clave=<la que imprime la consola>
# API:                  http://localhost:8787/api/salud
```

Son **dos servidores separados**: el back en el 8787 (`src/tenants/breakpoint/turnero/back/servidor.mjs`) y el front
estático en el 5173 (`servir-front.mjs`, que comprime con brotli/gzip, usa ETag y manda CSP). El front también se
puede servir desde cualquier hosting estático y apuntar al back con `?api=` o `<meta name="turnero-api">`.

**Demo pública sin servidor:** fuera de `localhost` (o con `?api=local`), el turnero corre el mismo núcleo dentro del
navegador (`local.mjs`). Así se puede mostrar en la URL gratuita del cliente sin pagar un servidor.

## La batería

| Capa | Archivo | Qué prueba | Resultado |
|---|---|---|---|
| Unidad: motor | `src/tenants/breakpoint/motor-club.test.ts` | Los 29 de antes, más 4 nuevos: seña online para nuevos y de confianza, plazo de seña (manual/auto, se avisa una sola vez, nunca pasa del inicio), `conSena`, `prefijoIds` | **33/33** |
| Unidad: conciliación | `turnero/conciliacion.test.ts` | Formatos de Mercado Pago y de bancos (fecha en letras, CBU/CVU, importe sin signo), números argentinos, exacto/parcial/excedente, duplicado por operación y por huella, cuenta ajena, ilegible/viejo/futuro → revisar, código inexistente, dos turnos sin código, sólo por monto → revisar con sugerencia, enmascarado | **17/17** |
| Unidad: ingreso y WhatsApp | `turnero/auth-whatsapp.test.ts` | scrypt con sal (nunca texto plano), reglas de clave, límite de intentos, sesión deslizante y que vence, cookie HttpOnly/SameSite/Secure, celulares argentinos, ID token de Google (válido; audiencia ajena, vencido, emisor falso, mail sin verificar, otra clave, `alg:none` y basura se rechazan), firma del webhook, `hub.challenge`, payloads de WhatsApp Cloud, canal y lector de demo | **13/13** |
| Dominio del turnero | `turnero/nucleo.test.ts` | Disponibilidad sin datos personales; respeta ocupados, fijos y el margen de hoy; doble reserva → 1 sola con alternativas; anti-acaparamiento; cliente de confianza sin seña; cancelar sólo lo propio; seña vencida en manual y en auto (con oferta a la lista de espera); WhatsApp de punta a punta; reintento de Meta y comprobante repetido; bandeja "a revisar" sin datos sensibles; pago parcial; imagen con OCR simulado; «Sí» a la lista de espera; sync del mostrador (acepta, rechaza lo que pisa, conserva de quién es la reserva); mantenimiento y bloqueos; registro e ingreso; Google demo; **y los arreglos del Gate**: versión por reserva, ids raros, celular sin verificar, mail sin verificar, modo real sin auto-confirmar, reintento tras un error | **27/27** |
| Contrato HTTP (integración) | `turnero/api.test.ts` | El back real por HTTP: config, CORS con credenciales y CSRF por `Origin`, 415/400/404, cookie de sesión, error genérico y bloqueo al 5.º intento, Google demo, sesión obligatoria, **20 jugadores al mismo turno a la vez → 1**, `Idempotency-Key`, firma del webhook y verificación, **SSE público + staff + jugador con un comprobante que entra por el webhook firmado**, cuenta ajena/imagen, sync del backoffice con 409, `TURNERO_MODO=real` sin secretos no arranca, cookie mal formada no da 500 | **15/15** |
| E2E (Playwright, Chromium) | `turnero/e2e/turnero.e2e.mjs` (`npm run test:turnero-e2e`) | Recorrido completo en **390 y 1440 px**, axe-core (WCAG 2.1 AA) en la pantalla y en los 3 diálogos, tiempo real entre dos navegadores, **backoffice conectado en ambos sentidos por la UI real**, rendimiento con 4G lenta + CPU x4, movimiento reducido, teclado, demo pública sin servidor, lista de espera, **CSP estricta sin bypass** y `?api=` hostil desde un host público | **68/68 verificaciones** (2 corridas seguidas en verde; con axe-core 4.12.1 y con 4.14.0) |
| Demo local (servidor en el navegador) | `turnero/demo-local.test.ts` | Mismo contrato que el back en el navegador: sesiones por pestaña, rutas del club, reserva web → club en vivo, seña, turno del mostrador → se ocupa; el bus cae a un servidor propio sin Web Locks | **2/2** |
| E2E del sitio servido (breakpointpadel) | `turnero/e2e/sitio.e2e.mjs` (corre dentro de `npm run test:turnero-e2e`) | Las páginas registradas en `sitio-estatico.ts` servidas por **el mismo manejador del ERP** (`responderSitioEstatico`, negocio `breakpoint`): el club solo es la demo de siempre, portada → turnero, reserva → seña, **sync en vivo entre pestañas** (turnero ↔ club en los dos sentidos, seña → novedades), toma de posta al cerrar la pestaña servidor, ningún pedido a otro origen | **26/26 verificaciones** |

Total de unidad e integración del turnero y el motor: **137 tests en verde** (incluye `sitio-estatico.test.ts`), más **108 verificaciones E2E** (82 del turnero + 26 del sitio servido), con axe-core 4.12.1 y con 4.14.0.
`tsc` del proyecto completo: verde. `next build`: verde. `npm test` del repo: las 24 fallas que quedan son ajenas al turnero (inmobiliaria, contrato ARCA, POS, sitio de la estética) y no tocan archivos de esta rama.

## Mediciones (se miden, no se prometen)

| Qué | Objetivo | Medido |
|---|---|---|
| LCP, celular 390 px, red «4G lenta» (150 ms, 1,6 Mbps) + CPU x4 | < 1,5 s | **≈ 0,52 s** |
| CLS | 0 | **0** |
| JS del turnero comprimido, modo con back | < 60 KB | **9,3 KB** gzip (`app.mjs`) |
| JS comprimido, demo pública sin servidor (app + núcleo + motor) | < 60 KB | **≈ 49 KB** brotli |
| Confirmación «¡Turno firme!» desde que llega el comprobante | en vivo | **80–130 ms** |
| Turno tomado que desaparece en el otro navegador | en vivo, sin recargar | **≈ 0,8 s** (incluye la animación de salida) |
| axe-core (WCAG 2.1 A/AA) en inicio y en los diálogos de reserva, ingreso y seña, a 390 y 1440 px | 0 graves | **0 violaciones** de cualquier nivel |
| Scroll horizontal de página | ninguno | ninguno (scrollWidth = ancho) |
| Errores de consola (turnero, backoffice conectado y modo demo) | 0 | **0** |

Las fuentes de Google se cortan en el E2E para no medir una red ajena. El LCP medido es con la fuente de sistema;
con `display=swap` y subsets de pocos KB, la fuente no bloquea el render.

## Defectos encontrados y corregidos (antes → después)

| # | Dónde se detectó | Antes | Después |
|---|---|---|---|
| D1 | prueba manual del back | El 409 de "turno ocupado" decía **«Se pisa con Ana Test»**: exponía el nombre de otro cliente | Mensaje genérico, más 3 alternativas cercanas. Test: ningún nombre en el 409 |
| D2 | `nucleo.test` | Un «**Sí!**» con tilde no tomaba la oferta de la lista de espera: en JS, `\b` es ASCII y no corta entre «í» y «!» | Se usa un lookahead que reconoce letras con tilde. Test con «Sí!» |
| D3 | `api.test` | El límite por IP del ingreso contaba **también los éxitos**: en el Wi-Fi del club (muchos jugadores, una IP) se bloqueaba en una noche movida | Por IP cuentan sólo los fallos (30 cada 15'); por usuario, 5. Test con 20 registros desde la misma IP |
| D4 | E2E 390 | El diseño dejó el **email obligatorio** en el registro (fricción; la llave es el celular) | Email opcional |
| D5 | captura de «firme» | Con el turno firme seguían «Mandá la seña y listo» y los datos para transferir | Título «¡Nos vemos en la cancha!» y datos ocultos. Test E2E |
| D6 | captura del diálogo | Texto ambiguo de seña («puede pedirte…», largo y en negrita) | El back informa `pideSena` para ese jugador: «$15.000 (50%) por transferencia» o «Sin seña: ya sos de la casa» |
| D7 | E2E backoffice | El backoffice conectado sondeaba con un pedido que respondía 401 y dejaba un error en la consola | `GET /api/staff/sesion` siempre responde 200 con `{staff}` |
| D8 | captura del backoffice | La bandeja marcaba **URGENTE «no pagó la seña»** en una reserva web que todavía estaba en plazo | `alertas` respeta el plazo de seña online. Test |
| D9 | `conciliacion.test` | El titular del comprobante perdía las tildes («Pérez» → «Perez») | Se lee del texto original con clases Unicode |
| D10 | integración con el diseño | El contrato de DOM pedía `#btn-salir`, pero el HTML deja `#usuario` vacío y la app se colgaba al cablear | El botón se crea al pintar y el clic se delega |
| D11 | revisión del código | `puente` (modo conectado) declarado después de `iniciar()` → `ReferenceError` en el primer `render()` (TDZ) | Se declara antes |
| D12 | plan de Fable | La demo pública no tiene servidor (host serverless: ni SSE ni estado): el turnero no andaría en la URL gratuita | Dominio isomórfico + adaptador local con el mismo núcleo. E2E sin pedidos a ninguna API |
| D13 | plan de Fable | Si se cortaba el SSE (4G que va y viene), se perdían los cambios hechos en el medio | Al reconectar se vuelven a pedir la disponibilidad y las reservas |
| D14 | plan de Fable | scrypt con p=1 (por debajo de OWASP) | N=2¹⁴, r=8, p=5 (≈ 16 MB por hash) |
| D15 | primer arranque | `generarDemo` con la hora real rompía, porque el escenario de "hoy" está armado a las 19:10 | El back usa la demo estándar; el reloj real sólo decide qué turnos ya pasaron |
| D16 | revisión del código | «¿Con quién jugás?» partía los nombres en cada «y» («Maty» → «Mat») | Separa por coma o por « y » entre espacios |
| D17 | revisión del código | La lista de espera pedía el celular con `window.prompt()` (inaccesible, feo) | Campo inline con label y error al lado. Test E2E |
| D19 | sesión del backoffice, con axe 4.14.0 | WCAG 2.5.3 «Label in Name»: el `aria-label` de los días («Hoy, jueves 15 oct») y de los turnos pisaba el texto visible; quien maneja el celu por voz y dice «jue 15» no lo encontraba. axe 4.12 no lo detectaba | Sin `aria-label`: el nombre es el texto visible más complementos ocultos con `.sr` («jue 15 de octubre», «19:30 a 21:00, Cancha 2, …»). Lo mismo en los botones «Copiar». El E2E acepta `AXE_PATH` para correr con otra versión de axe e informa la versión |
| D20 | E2E después de D19 | El `.sr` dentro de la tira de días (con scroll horizontal) se escapaba y ensanchaba la página a 931 px en el celu (la trampa que documenta la skill RAE) | `#dias{position:relative}` |
| D18 | `tsc` del proyecto | Error de tipos preexistente en el test del empaquetador (`morph = null` inferido como `null`) | JSDoc en `empaquetar()`. `tsc` del proyecto en verde |

## Defectos del QA en Chrome real (D21–D34) y cómo quedaron

Informe completo, con pasos y capturas: [`TURNERO-QA-CHROME.md`](TURNERO-QA-CHROME.md) (sesión local, en el Chrome del dueño).

| # | Antes | Después | Prueba |
|---|---|---|---|
| D21 (alta) | Los jugadores nuevos de la web y sus créditos no llegaban en vivo al backoffice | Evento `clientes` del back con las fichas que cambiaron (altas, créditos, deudas). El sync también acepta y reparte las fichas del mostrador. Al reconectar se bajan de nuevo | `nucleo.test` D21 ×2 · E2E «aparece en Clientes sin recargar» |
| D22 (alta, real) | En modo real se podía arrancar sin el número de WhatsApp del club y «Mandar comprobante» abría sin destinatario | `TURNERO_WHATSAPP_CLUB` obligatorio en modo real; si faltara, el botón no se muestra (en demo se usa `wa.me/?text=`, sin número inventado: DX-4) | `api.test` D22 |
| D23 | El repintado en vivo sacaba el foco del teclado; la grilla era región viva con más de 100 botones | La grilla no es región viva: «Se ocupó 23:00 Cancha 4» se anuncia en `#anuncio`. Al repintar, el foco vuelve al mismo turno o al vecino | E2E D23 ×3 |
| D24 | El foco caía al `body` (seña simulada, cerrar la seña, «Nuevo turno» en el backoffice) | Firme → foco en «Listo». Al cerrar, foco en la reserva de «Mis reservas». En el backoffice, foco en el botón principal del diálogo nuevo | E2E D24 ×3 |
| D25 | «Cancelás sin costo hasta 12 h antes» en turnos ya dentro de las 12 h; textos contradictorios al cancelar | Antes de reservar dice «Arranca en menos de 12 h: si lo cancelás, la seña queda retenida (vuelve como crédito sólo si alguien toma el turno)». Un solo texto para la cancelación tardía, que también se anuncia | E2E D25 |
| D26 | «Mis reservas» quedaba 10 pantallas abajo en el celular | «Mis turnos (n)» en el encabezado y enlace «Saltar a Mis reservas» (el foco queda en la sección) | E2E D26 · captura a 360 px sin desborde |
| D27 | Avisos de 2,5 s, sin historial, que se metían dentro del diálogo abierto | Panel fijo del turnero (abajo a la izquierda) con **historial de novedades**, contador y anuncio para lector de pantalla; no usa los avisos del backoffice ni entra a los diálogos | E2E publicado «contador de novedades» |
| D28 | El turno del mostrador no tenía código BP y el mensaje de seña iba sin alias ni código | El motor genera el código BP para toda seña. El back lo asegura en el sync (y lo cambia si choca) y el puesto lo adopta. El mensaje de WhatsApp lleva alias y código | `nucleo.test` D28 |
| D29 | Sin conexión seguía diciendo «En vivo» | Arranca en «Conectando…»; sin back dice «Sin conexión» y no deja los esqueletos de los días | E2E D29 |
| D30 | Día enfocado oculto en la tira; 142 paradas de Tab sin atajo | El día con foco se ve entero; ← → Inicio Fin entre días; enlace para saltar a «Mis reservas» | E2E D30 ×2 |
| D31 | La píldora «Turnero en vivo» tapaba «Estilo» | Vive abajo a la izquierda, en el panel del turnero | E2E D31 |
| D32 | En `127.0.0.1:5173` la CSP bloqueaba el back | `connect-src` acepta el back por `localhost` y por `127.0.0.1` | — |
| D33 | «Cancela el cliente (online)» en «Mis reservas»; el crédito sólo en un aviso de 4 s | «La cancelaste vos». El crédito a favor se muestra en «Mis reservas» (total) y **se usa solo en la próxima seña** | `nucleo.test` D33 |
| D34 | Un jugador podía tomar dos canchas a la misma hora | **No se cambió el comportamiento: lo decide el club.** Quedó como regla `unaCanchaPorHorario`, apagada por defecto | `nucleo.test` D34 |
| Obs. | El límite general de 300 pedidos/min por IP podía frenar el Wi-Fi del club | 1.200 por minuto por IP | — |

## Hallazgos del Gate de Excelencia (Auditoría GSG, Opus) y cómo quedaron

Veredicto: **APRUEBA CON OBSERVACIONES**. Se corrigieron todos los hallazgos que el Gate marcó como bloqueantes para la
venta y los menores, salvo los anotados en «Pendientes».

| # | Hallazgo | Arreglo | Test |
|---|---|---|---|
| G1 (mayor) | El backoffice podía pisar una reserva web con una copia vieja (el último que escribe gana): podía borrar una seña confirmada por WhatsApp | Versión `rev` por reserva: el back rechaza las copias viejas con 409 y devuelve la actual. El puesto adopta las versiones nuevas y, al reconectar, vuelve a bajar toda la agenda | `nucleo.test` Gate 1 |
| G2 (mayor) | Con un celular sin verificar alguien heredaba la ficha de otro cliente (y su confianza: sin seña) | Sólo se engancha a una ficha existente con el celular verificado (OTP, post-venta); si no, ficha propia | Gate 2 |
| G3 (mayor) | Toma previa de cuentas: Google se unía a una cuenta con contraseña cuyo mail nunca se verificó | Sólo se une si el mail de la cuenta está verificado; el ingreso con contraseña busca sólo cuentas con contraseña | Gate 3 |
| G4 (mayor) | El modo real podía arrancar con partes en demo sin avisar (Google demo abierto, secreto de WhatsApp al azar) | `TURNERO_MODO=demo\|real` explícito: en real no arranca si falta un secreto | `api.test` Gate 4 |
| G5 (mayor) | Un texto tipeado como comprobante dejaba el turno firme solo | En real, `autoConfirmar: false`: todo va a la bandeja como «pre-conciliado» hasta verlo acreditado en Mercado Pago o el banco | Gate 5 |
| G6 (mayor) | `?api=` aceptaba cualquier servidor (un link armado podía robar contraseñas o la clave del club), y en producción se caía al modo local en silencio | `?api=` sólo en localhost (backoffice: localhost o el mismo origen). El modo local sólo con la marca `<meta name="turnero-modo" content="demo">`; sin back ni marca, se avisa que no está configurado | E2E «host público» |
| G7 | `prompt()` para la clave del club | `<dialog>` con label | E2E backoffice |
| G8 | XSS por ids sin `esc()` + CSP con `'unsafe-inline'` en scripts | `esc()` en todos los atributos, ids validados en el sync, fuentes cargadas desde JS y CSP del turnero sin `'unsafe-inline'` en scripts | Gate 1 ids + E2E CSP estricta |
| G9 | Una cookie mal formada daba 500 | Se ignora la cookie (200) | `api.test` |
| G10 | Si fallaba el procesamiento, el reintento de Meta se ignoraba | El mensaje se marca como visto, pero si algo falla se desmarca | `nucleo.test` |
| G11 | SSE sin tope por IP | Máximo 30 conexiones por IP | — |
| G12 | E2E inestable: un repintado en vivo ocultaba el formulario de la lista de espera | El bloque no se oculta mientras el jugador carga el celular; el test espera a que terminen los repintados | 2 corridas seguidas en verde |

## Hallazgos del Gate sobre lo nuevo (QA en Chrome + publicación) y cómo quedaron

Veredicto: **APRUEBA CON OBSERVACIONES**. O6 y O7 hablaban del `vercel.json` del proyecto aparte, que se descartó: el
sitio va dentro del ERP en `breakpointpadel.gsgapp.com.ar`.

| # | Hallazgo | Arreglo | Prueba |
|---|---|---|---|
| O1 (media) | Las fichas se sincronizaban sin versión: una copia vieja del mostrador podía pisar un crédito o una deuda que la web acababa de mover | `rev` por ficha (lo sube el back en cada cambio). El sync rechaza las copias viejas y devuelve la actual; el puesto la adopta y avisa | `nucleo.test` Gate O1 |
| O2 | El sync copiaba la ficha cruda (con `__proto__` o campos raros) | Sólo los campos conocidos, montos numéricos; en reservas, sin `__proto__`/`constructor` | `nucleo.test` Gate O2 |
| O3 | Hora de las novedades con color fijo: poco contraste en modo oscuro | Colores del tema del club (`--muted`, `--line`) | — |
| O4 | A 440 px o menos, el estado «En vivo / Sin conexión» quedaba sólo como color | Desconectado = aro hueco (forma distinta) | — |
| O5 | «Mis turnos» en el botón y «Mis reservas» en la sección | Unificado en «Mis turnos» | E2E D26 |
| O8 | Si la pestaña servidor queda suspendida (Safari en el celular), retiene el lock | Si deja de latir 10 s, una pestaña del turnero le roba el lock (`steal`) y la suspendida pasa a cliente | — |

## Pendientes conocidos (no se corrigieron, con el porqué)

- **D34 (decisión del club):** si un jugador puede tener dos canchas a la misma hora. La regla existe y está apagada.
- **Sitio publicado:** la sync entre pestañas funciona en un mismo navegador (es la demo; entre dispositivos hace
  falta el back real, post-venta). Si se cierra la pestaña que hacía de
  servidor, otra toma la posta con una demo nueva y las sesiones de jugador se pierden (es una demo). En navegadores sin
  Web Locks o BroadcastChannel (muy viejos: Safari anterior a 15.4), cada pestaña anda sola, sin sync.

- **Fijar axe-core en devDependencies (4.14.x).** Hoy llega como dependencia transitiva (4.12.1 en este entorno). No se
  fijó porque regenerar `package-lock.json` acá falla: el proxy bloquea el tarball de `xlsx` del CDN de SheetJS (403).
  Mientras tanto, el E2E corre con cualquier versión vía `AXE_PATH` y la informa. Se fija en un entorno con acceso.

- **Hold antes del login (C20 del plan):** mientras alguien se registra, otro puede ganarle el hueco. Hoy recibe 409
  con alternativas; el hold con cookie `bp_hold` queda para la próxima vuelta.
- **Post-venta (§C, con credenciales que pega el dueño):** WhatsApp Cloud real (el adaptador existe, pero no está
  probado contra Meta sin credenciales), plantillas para escribir fuera de la ventana de 24 h, OCR real de
  imágenes, conciliación "acreditado" contra Mercado Pago o el extracto, Google con client id real, OTP por WhatsApp,
  recordatorios y link de cancelación firmado.
- **Persistencia:** el back guarda todo en memoria y un reinicio lo borra. Es a propósito (demo). En producción, la
  base del ERP con la exclusión de solapes en la base (DB-4, Gate 2).
- **Alcance del modo conectado:** se sincroniza la agenda; buffet, caja y stock siguen locales en cada puesto.
- **Del Gate, para post-venta:** detrás de un proxy hay que configurar qué IP se toma (`X-Forwarded-For` de confianza); si no, los límites por IP se vuelven globales. La verificación del celular (OTP) es la que habilita unir fichas.
- La ubicación «Ezeiza» y los precios y horarios son provisionales, a confirmar con el club.

— Elaborado por GSG
