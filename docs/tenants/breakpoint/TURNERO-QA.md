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
| Unidad: ingreso y WhatsApp | `turnero/auth-whatsapp.test.ts` | scrypt con sal (nunca texto plano), reglas de clave, límite de intentos, sesión deslizante y que vence, cookie HttpOnly/SameSite/Secure, celulares argentinos, ID token de Google (válido; audiencia ajena, vencido, emisor falso, mail sin verificar, otra clave, `alg:none` y basura se rechazan), firma del webhook, `hub.challenge`, payloads de WhatsApp Cloud, canal y lector de demo | **14/14** |
| Dominio del turnero | `turnero/nucleo.test.ts` | Disponibilidad sin datos personales; respeta ocupados, fijos y el margen de hoy; doble reserva → 1 sola con alternativas; anti-acaparamiento; cliente de confianza sin seña; cancelar sólo lo propio; seña vencida en manual y en auto (con oferta a la lista de espera); WhatsApp de punta a punta; reintento de Meta y comprobante repetido; bandeja "a revisar" sin datos sensibles; pago parcial; imagen con OCR simulado; «Sí» a la lista de espera; sync del mostrador (acepta, rechaza lo que pisa, conserva de quién es la reserva); mantenimiento y bloqueos; registro e ingreso; Google demo | **21/21** |
| Contrato HTTP (integración) | `turnero/api.test.ts` | El back real por HTTP: config, CORS con credenciales y CSRF por `Origin`, 415/400/404, cookie de sesión, error genérico y bloqueo al 5.º intento, Google demo, sesión obligatoria, **20 jugadores al mismo turno a la vez → 1**, `Idempotency-Key`, firma del webhook y verificación, **SSE público + staff + jugador con un comprobante que entra por el webhook firmado**, cuenta ajena/imagen, sync del backoffice con 409 | **13/13** |
| E2E (Playwright, Chromium) | `turnero/e2e/turnero.e2e.mjs` (`npm run test:turnero-e2e`) | Recorrido completo en **390 y 1440 px**, axe-core (WCAG 2.1 AA) en la pantalla y en los 3 diálogos, tiempo real entre dos navegadores, **backoffice conectado en ambos sentidos por la UI real**, rendimiento con 4G lenta + CPU x4, movimiento reducido, teclado, demo pública sin servidor y lista de espera | **64/64 verificaciones** |

Total de unidad e integración del turnero y el motor: **98 tests en verde**, más **64 verificaciones E2E**.

## Mediciones (se miden, no se prometen)

| Qué | Objetivo | Medido |
|---|---|---|
| LCP, celular 390 px, red «4G lenta» (150 ms, 1,6 Mbps) + CPU x4 | < 1,5 s | **≈ 0,52 s** |
| CLS | 0 | **0** |
| JS del turnero comprimido, modo con back | < 60 KB | **8,6 KB** gzip (`app.mjs`) |
| JS comprimido, demo pública sin servidor (app + núcleo + motor) | < 60 KB | **≈ 47 KB** brotli |
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
| D18 | `tsc` del proyecto | Error de tipos preexistente en el test del empaquetador (`morph = null` inferido como `null`) | JSDoc en `empaquetar()`. `tsc` del proyecto en verde |

## Pendientes conocidos (no se corrigieron, con el porqué)

- **Hold antes del login (C20 del plan):** mientras alguien se registra, otro puede ganarle el hueco. Hoy recibe 409
  con alternativas; el hold con cookie `bp_hold` queda para la próxima vuelta.
- **Post-venta (§C, con credenciales que pega el dueño):** WhatsApp Cloud real (el adaptador existe, pero no está
  probado contra Meta sin credenciales), plantillas para escribir fuera de la ventana de 24 h, OCR real de
  imágenes, conciliación "acreditado" contra Mercado Pago o el extracto, Google con client id real, OTP por WhatsApp,
  recordatorios y link de cancelación firmado.
- **Persistencia:** el back guarda todo en memoria y un reinicio lo borra. Es a propósito (demo). En producción, la
  base del ERP con la exclusión de solapes en la base (DB-4, Gate 2).
- **Alcance del modo conectado:** se sincroniza la agenda; buffet, caja y stock siguen locales en cada puesto.
- La ubicación «Ezeiza» y los precios y horarios son provisionales, a confirmar con el club.

— Elaborado por GSG
