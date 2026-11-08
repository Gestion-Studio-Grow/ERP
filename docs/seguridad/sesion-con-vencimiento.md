# Sesión del panel con vencimiento en el servidor (08/11/2026)

**Qué cambió.** El token de la cookie `admin_session` pasa de `userId.firma` (sin fecha) a
`v2|<userId>|<emitido>|<vence>.HMAC("gsg-sesion-v2|" + payload)`. El proxy y `getCurrentUser` lo rechazan pasadas
las 8 h (`VIGENCIA_SESION_MS`), con `vence` más lejos que 8 h de `emitido`, o con `emitido` más de 60 s en el futuro.
Código: `src/lib/auth.ts`. Tests: `src/lib/auth-sesion.test.ts`.

**Para la gente (CH y el resto).** Nada visible el día del cambio: la cookie ya duraba 8 h en el navegador.
Lo nuevo: si alguien copia la cookie, deja de servir a las 8 h. Cuando vence, el login dice «Tu sesión venció»
(`?error=vencida`), no «contraseña incorrecta».

**Tokens viejos: corte inmediato, con UNA excepción** (orden del dueño, 08/11/2026, textual: «los accesos viejos se
mantienen, solamente el de Macarena Arias se mantiene, los demás no»). Se quitó la ventana de transición general
(`FIN_DE_LA_TRANSICION`): desde que se publica, `readSessionToken` no acepta el formato viejo de nadie.

- **Los demás usuarios:** al publicar, quien tenga una cookie vieja pasa por /admin/login/renovar, se le borra la cookie
  y ve el login con «Tu sesión venció». Entra de nuevo con su clave (o Google) y sigue con un token v2.
- **Macarena Arias (sólo en beauty-spa):** el proxy manda su token viejo (firma válida) a `/admin/login/renovar`
  (`src/app/admin/login/renovar/route.ts`), que carga el usuario DE LA BASE (activo, no borrado, del negocio del pedido)
  y, si el pedido es de `beauty-spa` y su email está en la lista, le cambia la cookie por un v2 en silencio y la
  devuelve a donde iba. Lógica pura y tests: `src/lib/sesion-legado.ts`, `src/lib/sesion-legado.test.ts`.
- **Cómo se la identifica:** por email, `macarenaarias21@gmail.com` (el único suyo en el repo; `docs/PROXIMOS-PASOS.md`
  lo marca como «email provisional del OWNER» de CH): PROVISIONAL A CONFIRMAR. Variable `LEGADO_V1_USUARIOS` (emails
  separados por coma): si está cargada REEMPLAZA esa lista; `ninguno` la apaga. Si su usuario real tiene otro email, el
  dueño la carga en Vercel con ese email; si el email de la base cambia, la excepción deja de cubrirla (falla cerrada).
- **Cuándo vuelve a entrar:** no hay renovación deslizante del v2 en el panel; a las 8 h del canje vence y entra con su
  clave como todos. Desde ahí ya tiene un v2 y la excepción no se vuelve a usar.
- **Una sola vez y con fecha tope (cert 5, sin migración):** el canje exige que `User.lastLoginAt` sea nulo o anterior a
  `CORTE_LEGADO_V1` (08/11/2026 18:46 UTC, el momento de esta versión: anterior a cualquier publicación) y lo pone en
  la hora del canje con un `updateMany` condicional (`WHERE … AND (lastLoginAt IS NULL OR lastLoginAt < corte)`). Es
  un solo UPDATE atómico: con dos canjes simultáneos el segundo re-evalúa la condición sobre la fila ya escrita y no
  actualiza nada, así que pasa uno solo; cualquier copia posterior del token viejo se rechaza. Si entró con su clave
  después del corte (por ejemplo, entre esta versión y la publicación), el token viejo ya no se canjea: entra con su
  clave (falla cerrada). Desde `FIN_LEGADO_V1` (08/12/2026 00:00, hora argentina) no se canjea ningún token viejo.
  Apagado anticipado: `LEGADO_V1_USUARIOS=ninguno`.
- **Riesgo residual:** quien tenga una copia de su token viejo y la use ANTES que ella (y antes del 08/12/2026) obtiene
  UNA sesión v2 de 8 h; desde ahí ella ya no puede canjear y entra con su clave.
- **La ruta no es un trampolín ni borra sesiones ajenas:** el `next` pasa por `destinoInterno` (rechaza `//`, `\`,
  absolutas y caracteres de control como `/\t/evil.com`) y, si falla, va a `/admin`. Con una sesión v2 válida la ruta
  manda a `next` sin tocar la cookie (un GET cruzado no desloguea a nadie); la cookie sólo se borra si es un token viejo
  de firma válida que no se canjea. Lógica en `planDeRenovacion` (`src/lib/sesion-legado.ts`).

**Pendiente (ENG-013, Gate 2).** Revocar en el servidor al cerrar sesión o cambiar la contraseña: pide una columna
en `User` (versión de sesión). Hoy el logout borra la cookie y el token sigue valiendo hasta su vencimiento (≤ 8 h).
