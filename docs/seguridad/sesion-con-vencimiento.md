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
- **Riesgo aceptado:** una copia de su token viejo sigue canjeable mientras la excepción esté vigente. Para cerrarla:
  `LEGADO_V1_USUARIOS=ninguno` (o quitar el email del código).

**Pendiente (ENG-013, Gate 2).** Revocar en el servidor al cerrar sesión o cambiar la contraseña: pide una columna
en `User` (versión de sesión). Hoy el logout borra la cookie y el token sigue valiendo hasta su vencimiento (≤ 8 h).
