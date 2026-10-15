# Turnero de Break Point — contrato de la API (front ↔ back)

**Qué es:** el contrato entre el front del jugador (`public/previews/breakpoint/turnero/`) y el back
(`src/tenants/breakpoint/turnero/back/servidor.mjs`), que es **lo construido**. El plan de Fable proponía otro
(`TURNERO-PLAN.md §8.3`); las diferencias y sus motivos están en `TURNERO-PLAN.md §13`. Los tests de integración
(`src/tenants/breakpoint/turnero/api.test.ts`) prueban este contrato contra el back real por HTTP.

**Convenciones**
- Todo es JSON (`Content-Type: application/json`). Las respuestas traen `ok: true|false`; cuando hay error, `motivo`
  viene en criollo, listo para mostrar.
- Cabeceras de seguridad en todas las respuestas: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y
  `Referrer-Policy: no-referrer`.
- **CORS:** sólo los orígenes de `TURNERO_ORIGENES` reciben `Access-Control-Allow-Origin` (con credenciales). En
  demo son `http://localhost:5173` y `http://127.0.0.1:5173`.
- **CSRF:** todo lo que no es GET exige un `Origin` permitido (salvo el webhook, que trae firma). Además el back
  exige `Content-Type: application/json`, y eso obliga al navegador a hacer el preflight.
- **Sesión del jugador:** cookie `bp_sesion` (HttpOnly, SameSite=Lax y Secure si `TURNERO_SEGURO=1`). Dura 30 días
  y se renueva con el uso.
- **Sesión del club:** cookie `bp_staff` (12 h), que se obtiene con la clave del club.
- **Modo:** `TURNERO_MODO=demo` (por defecto: Google, WhatsApp y cuentas simulados, y un comprobante que coincide deja el turno firme) o `real`. En real, el back **no arranca** si falta `GOOGLE_CLIENT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `TURNERO_STAFF_CLAVE` o `TURNERO_ORIGENES`, y **ningún comprobante confirma solo**: va a la bandeja como «pre-conciliado» hasta verlo acreditado.
- **Límites:** 300 pedidos por minuto por IP. En el ingreso, 5 fallos por usuario y 30 fallos por IP cada 15 minutos.
  Por IP cuentan **sólo los fallos**, porque en el Wi-Fi del club muchos jugadores comparten IP.
- Códigos: `200` ok · `201` creado · `400` datos inválidos · `401` sin sesión o credenciales malas · `403` origen no
  permitido o firma inválida · `404` no existe · `409` turno ocupado (con `alternativas`) · `413` cuerpo muy grande ·
  `415` no es JSON · `429` demasiados intentos (motivo con los minutos que faltan) · `500` sin detalle interno.

## Públicas (sin sesión)

| Método · ruta | Request | Response | Errores |
|---|---|---|---|
| `GET /api/salud` | — | `{ ok, demo, version }` | — |
| `GET /api/turnero/config` | — | `{ club, dias:[{fecha, dia, abre, cierra, feriado}]×14, duraciones:[60,90,120], politica:{horasCancelacionLibre, senaPct, minutosParaSenar, liberarSinSena}, cuentas:{alias, cvu, titular}, canchas:[{id, nombre, techada}], demo, google:{clientId, demo}, whatsapp:{numero, demo} }` | — |
| `GET /api/turnero/disponibilidad?fecha=AAAA-MM-DD&duracion=60\|90\|120&techadas=0\|1` | query | `{ ok, fecha, duracion, version, lluvia, mantenimiento:[nombre], slots:[{inicio, fin, canchaId, cancha, techada, pico, precio}] }`. **Sin nombres ni datos de nadie.** Hoy no ofrece lo que arranca en menos de 15 minutos. | 400 fecha fuera de los 14 días o duración rara |
| `GET /api/turnero/eventos` | SSE (`text/event-stream`) | `disponibilidad {fecha, canchaId?, version}` (público, sin datos personales) · `version {version}` al conectar · con sesión, además `mi-reserva {reserva, motivo}` y `espera {fecha, inicio, canchaId}` · latido cada 25 s · `retry: 3000` | — |

## Ingreso

| Método · ruta | Request | Response | Errores |
|---|---|---|---|
| `POST /api/auth/registro` | `{ nombre, tel, email?, clave }` | 201 `{ ok, usuario }` + `Set-Cookie: bp_sesion` | 400: celular inválido, clave débil (menos de 8 caracteres o muy común) o cuenta repetida |
| `POST /api/auth/ingresar` | `{ usuario: celular o mail, clave }` | `{ ok, usuario }` + cookie | 401 genérico ("no coinciden"; no revela si el usuario existe) · 429 al 5.º fallo |
| `POST /api/auth/google` | real: `{ credential }` (ID token de Google Identity Services) · demo: `{ cuentaDemo: 0\|1 }` | `{ ok, usuario }` + cookie | 401 si el token no valida: firma RS256 contra el JWKS de Google, `iss`, `aud` = `GOOGLE_CLIENT_ID`, `exp` y mail verificado |
| `POST /api/auth/salir` | `{}` | `{ ok }`; la sesión se invalida en el servidor | — |
| `GET /api/auth/yo` | — | `{ ok, usuario: { id, nombre, email, tel:"••• 1234", tieneCelular, google, pideSena } \| null }` | — |
| `POST /api/auth/celular` | `{ tel }` (sesión) | `{ ok, usuario }` | 400 · 401 |

## Reservas del jugador (con sesión)

| Método · ruta | Request | Response | Errores |
|---|---|---|---|
| `GET /api/turnero/reservas` | — | `{ ok, reservas:[Reserva] }` (de 7 días atrás en adelante) | 401 |
| `POST /api/turnero/reservas` | `{ fecha, inicio, canchaId, duracion, jugadores?:[nombre×3] }` · cabecera opcional `Idempotency-Key` | 201 `{ ok, reserva: Reserva }`. Con la misma clave se devuelve la misma respuesta (`Idempotent-Replay: true`), no otra reserva. | 401 · 400 · 409 `{ motivo, alternativas:[slot×3] }` (motivo genérico, nunca el nombre de quien ocupa) · 429 anti-acaparamiento (máximo 2 esperando seña y 4 por delante) |
| `DELETE /api/turnero/reservas/:id` | — | `{ ok, reserva, aTiempo, devuelto, enSuspenso }` | 404 si no es tuya · 409 si ya empezó |
| `POST /api/turnero/espera` | `{ fecha, desde, hasta, duracion, techadas }` | 201 `{ ok }` | 400 sin celular (hace falta para avisar) · 429 más de 3 listas |
| `POST /api/turnero/reservas/:id/simular-comprobante` | `{ variante: ok\|parcial\|ajeno\|imagen\|sin-codigo }` | `{ ok, resultados:[{ decision, motivo?, reservaId? }] }`. **Sólo DEMO:** arma un comprobante ficticio y lo hace entrar por el **mismo webhook firmado** que va a usar WhatsApp. | 404 con WhatsApp real |

**Reserva** = `{ id, fecha, inicio, fin, duracion, canchaId, cancha, techada, precio, pagado, saldo, estado, sena:{monto,
pagada, falta}, venceSena (epoch ms | null), senaVencida, liberarSinSena, ref ("BP-XXXX" | null), jugadores:[nombre],
cancelacionLibreHasta (epoch ms), motivoCancelacion, conciliacion:{nivel:"comprobante"} | null }`.
Los estados posibles son: `pendiente` (falta la seña) · `firme` · `en-cancha` · `jugada` · `falta` · `suspendida` ·
`cancelada`.

## WhatsApp Cloud (webhook)

| Método · ruta | Auth | Comportamiento |
|---|---|---|
| `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` | `WHATSAPP_VERIFY_TOKEN` | Devuelve el `challenge` en texto plano; si el token no coincide, 403. |
| `POST /api/whatsapp/webhook` | `X-Hub-Signature-256` = HMAC-SHA256 del **cuerpo crudo** con `WHATSAPP_APP_SECRET` (comparación en tiempo constante) | Sin firma válida responde 401 y no procesa nada. Con firma válida, por cada mensaje: deduplica por `id` (Meta reintenta), lee el comprobante (texto, o imagen por OCR), concilia y responde por WhatsApp. Cuerpo máximo: 256 KB. |

En la demo no hay App Secret: se genera uno efímero en cada arranque, y sólo el simulador del propio back puede firmar
con él.

## Club (backoffice conectado; cookie `bp_staff`)

| Método · ruta | Request | Response | Errores |
|---|---|---|---|
| `POST /api/staff/ingresar` | `{ clave }` (`TURNERO_STAFF_CLAVE`; en demo se imprime una al azar al arrancar) | `{ ok }` + `Set-Cookie: bp_staff` | 401 · 429 al 5.º fallo por IP |
| `GET /api/staff/sesion` | — | `{ ok, staff: bool }`. Siempre responde 200, así no ensucia la consola con un 401. | — |
| `GET /api/staff/estado` | — | `{ ok, estado (snapshot del motor), version, ahora:{fecha, min} }` | 401 |
| `GET /api/staff/eventos` | SSE | `reserva {reserva, motivo: nueva\|cancelada\|sena-confirmada\|sena-parcial\|sena-demorada\|sena-vencida\|desde-espera}` · `sync {puesto, reservas, bloqueos?, canchas?, fijos?, clima?, politica?}` · `revision {revision}` · `comprobante-rechazado {motivo, monto, operacion}` · `espera {espera}` | 401 |
| `POST /api/staff/sync` | `{ puesto, reservas:[reserva completa del motor, con su `rev`], bloqueos?, canchas?, fijos?, clima?, politica? }` (hasta 4 MB; ids `[\w-]{1,40}`) | `{ ok, aplicadas:[id], rechazadas:[{id, motivo, actual}], version, revs:{id: rev} }`. Responde **409** si una reserva pisa un turno activo (por ejemplo, uno vendido online en el medio) o si su `rev` no coincide con la del back (el puesto tenía una copia vieja: se le devuelve la actual). El puesto adopta `revs` para su próxima edición. | 401 · 409 |
| `GET /api/staff/revisiones` | — | `{ ok, revisiones:[{ id, tipo, cuando, tel:"••• 1234", monto, fecha, operacion:"••••1234", ref, motivo, sugerida, reservaId, estado }] }`. No incluye el teléfono completo ni el comprobante. | 401 |
| `POST /api/staff/revisiones/:id` | `{ aprobar, reservaId? }` | `{ ok }`. Aplica el pago al turno elegido o lo rechaza, y le avisa al jugador por WhatsApp. | 400 · 404 · 409 si el comprobante ya se usó |
| `GET /api/staff/buzon` | — | `{ ok, mensajes:[{ a:"••• 1234", texto, cuando }] }`. Sólo en DEMO: los WhatsApp que se "mandaron". | 401 |

## Qué back usa el front

- `?api=` **sólo se acepta en localhost** (en el backoffice: en localhost o con el mismo origen). En un host público, un link armado no puede mandar la contraseña del jugador ni la clave del club a otro servidor.
- En producción manda `<meta name="turnero-api" content="https://…">`.
- Sin back configurado, el modo local se activa **sólo** con la marca `<meta name="turnero-modo" content="demo">`. Sin back ni marca, el turnero avisa que no está configurado; nunca "reserva" en el navegador en silencio.

## Modo local (demo pública sin servidor)

Con la marca de demo y sin back (o con `?api=local` en localhost), el front no habla con un back. Carga `local.mjs`, que corre **el mismo
núcleo** (`dominio/nucleo.mjs` sobre `club/motor.mjs`) dentro del navegador y responde estas mismas rutas con las
mismas formas. El SSE se reemplaza por un emisor local. Nada sale del navegador. No hay firma de webhook (no hay
red): el comprobante simulado entra directo al mismo procesador de mensajes.

— Elaborado por GSG
