# Sesión del panel: vigencia por uso y PIN de desbloqueo (08/11/2026)

**Orden del dueño (08/11, textual):** «El usuario no se va a vencer ni nada. A lo sumo diseñaríamos un ingreso por PIN
cuando el usuario ya está logueado, para reactivarlo». Reemplaza las 8 h fijas de la primera versión de #50.

**El token.** La cookie `admin_session` lleva `v3|<userId>|<ingreso>|<actividad>.HMAC("gsg-sesion-v3|" + payload)`.
`actividad` = la última vez que se usó; `ingreso` = la última vez que se comprobó la contraseña (o Google, o clave y
código); 0 = nunca en esta sesión (el canje del token viejo). El servidor (proxy y `getCurrentUser`) decide con las
fechas firmadas. Código: `src/lib/auth.ts`, números en `src/lib/sesion-constantes.ts`. Tests: `src/lib/auth-sesion.test.ts`.

| Sin uso | Estado | Qué pasa |
|---|---|---|
| menos de 15 min | activa | abre todo; el proxy reemite la cookie como mucho cada 5 min (el uso la renueva) |
| 15 min a 7 días | bloqueada | no abre nada; `/admin/login/desbloquear` pide el PIN de 4 números (o la contraseña) |
| 7 días o más | vencida | login con «Tu sesión venció» (`?error=vencida`) |

15 min, 7 días, 5 intentos y la ventana de 15 min para elegir el PIN son **PROVISIONALES A CONFIRMAR** por el dueño.
La cuenta no vence nunca: mientras se use, la sesión sigue. La cookie dura 7 días en el navegador.

**El PIN** (`src/lib/sesion-pin.ts`, base en `sesion-pin.server.ts`, tabla `UserPin`):
- Lo elige cada usuario en `/admin/definir-pin`, que se ofrece después de entrar con la contraseña y después del cambio
  obligatorio de contraseña. Se puede saltear («Ahora no»): sin PIN, la sesión bloqueada pide la contraseña
  (`?error=inactiva`). Sólo se elige o cambia con un `ingreso` de menos de 15 min: una cookie robada con la sesión
  activa no alcanza para plantar un PIN propio. Nada de 1111 ni escaleras.
- Se guarda con scrypt, igual que la contraseña (`auth-password.ts`). Nunca en claro ni en la auditoría
  (`define_own_pin` registra sólo que lo eligió).
- Sólo destraba una sesión **bloqueada** de firma válida, de un usuario activo del negocio del pedido. Desbloquear pone
  la actividad en «ahora» y conserva el `ingreso`.
- Cada intento reserva un fallo con un `UPDATE … WHERE fallos < 5` antes de comparar: ni con pedidos en paralelo hay
  más de 5 comparaciones. Con 5 errados seguidos se borra la cookie y se pide la contraseña (`?error=pin`); entrar con
  la contraseña devuelve los intentos. Acertar los pone en 0.
- **No se reusó otro PIN:** `ProyectoPinIngreso` es un código por mail de un solo uso (segundo paso de la productora) y
  el PIN del club de Break Point es de la gente del club, guardado en el estado del club, no del usuario del ERP.
- **Migración** `20261108130000_user_pin`: aditiva, tabla nueva con RLS (`tenant_isolation`). Tabla aparte a propósito:
  una columna nueva en `User` rompería todo `user.find*` sin `select` contra una base sin migrar. Sin aplicar, el código
  tolera la ausencia (P2021 → nadie tiene PIN, se pide la contraseña; elegir PIN dice «todavía no disponible»).
  Está en `prisma/lote-deploy.txt`: el merge de #50 la aplica (Gate 2).

**Riesgo residual.** Con una copia de una cookie bloqueada (menos de 7 días), quien no sepa el PIN tiene 5 intentos de
10.000 (0,05 %) antes de que haga falta la contraseña. Una copia de una cookie activa sirve mientras se siga usando.

**Tokens viejos: corte inmediato, con UNA excepción** (orden del dueño, 08/11/2026, textual: «los accesos viejos se
mantienen, solamente el de Macarena Arias se mantiene, los demás no»). Se quitó la ventana de transición general
(`FIN_DE_LA_TRANSICION`): desde que se publica, `readSessionToken` no acepta el formato viejo de nadie.

- **Los demás usuarios:** al publicar, quien tenga una cookie vieja pasa por /admin/login/renovar, se le borra la cookie
  y ve el login con «Tu sesión venció». Entra de nuevo con su clave (o Google) y sigue con un token v3.
- **Macarena Arias (sólo en beauty-spa):** el proxy manda su token viejo (firma válida) a `/admin/login/renovar`
  (`src/app/admin/login/renovar/route.ts`), que carga el usuario DE LA BASE (activo, no borrado, del negocio del pedido)
  y, si el pedido es de `beauty-spa` y su email está en la lista, le cambia la cookie por un v3 en silencio (con `ingreso` 0) y la
  devuelve a donde iba. Lógica pura y tests: `src/lib/sesion-legado.ts`, `src/lib/sesion-legado.test.ts`.
- **Cómo se la identifica:** por email, `macarenaarias21@gmail.com` (el único suyo en el repo; `docs/PROXIMOS-PASOS.md`
  lo marca como «email provisional del OWNER» de CH): PROVISIONAL A CONFIRMAR. Variable `LEGADO_V1_USUARIOS` (emails
  separados por coma): si está cargada REEMPLAZA esa lista; `ninguno` la apaga. Si su usuario real tiene otro email, el
  dueño la carga en Vercel con ese email; si el email de la base cambia, la excepción deja de cubrirla (falla cerrada).
- **Desde el canje:** rige la vigencia por uso como para todos. Como el canje no comprobó su clave, no puede elegir PIN con
  esa sesión: la primera vez que se bloquee entra con su clave (y ahí elige el PIN). La excepción no se vuelve a usar.
- **Una sola vez y con fecha tope (cert 5, sin migración):** el canje exige que `User.lastLoginAt` sea nulo o anterior a
  `CORTE_LEGADO_V1` (08/11/2026 18:46 UTC, el momento de esta versión: anterior a cualquier publicación) y lo pone en
  la hora del canje con un `updateMany` condicional (`WHERE … AND (lastLoginAt IS NULL OR lastLoginAt < corte)`). Es
  un solo UPDATE atómico: con dos canjes simultáneos el segundo re-evalúa la condición sobre la fila ya escrita y no
  actualiza nada, así que pasa uno solo; cualquier copia posterior del token viejo se rechaza. Si entró con su clave
  después del corte (por ejemplo, entre esta versión y la publicación), el token viejo ya no se canjea: entra con su
  clave (falla cerrada). Desde `FIN_LEGADO_V1` (08/12/2026 00:00, hora argentina) no se canjea ningún token viejo.
  Apagado anticipado: `LEGADO_V1_USUARIOS=ninguno`.
- **Riesgo residual:** quien tenga una copia de su token viejo y la use ANTES que ella (y antes del 08/12/2026) obtiene
  UNA sesión v3 (que se bloquea a los 15 min sin uso y no puede elegir PIN); desde ahí ella ya no puede canjear y entra con su clave.
- **La ruta no es un trampolín ni borra sesiones ajenas:** el `next` pasa por `destinoInterno` (rechaza `//`, `\`,
  absolutas y caracteres de control como `/\t/evil.com`) y, si falla, va a `/admin`. Con una sesión v3 activa la ruta
  manda a `next` sin tocar la cookie (un GET cruzado no desloguea a nadie); la cookie sólo se borra si es un token viejo
  de firma válida que no se canjea. Lógica en `planDeRenovacion` (`src/lib/sesion-legado.ts`).

**Pendiente (ENG-013, Gate 2).** Revocar en el servidor al cerrar sesión o cambiar la contraseña: pide una columna
en `User` (versión de sesión). Hoy el logout borra la cookie; una copia del token sigue activa 15 min y bloqueada (con PIN) hasta 7 días sin uso.
