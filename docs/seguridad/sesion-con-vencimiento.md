# Sesión del panel con vencimiento en el servidor (08/11/2026)

**Qué cambió.** El token de la cookie `admin_session` pasa de `userId.firma` (sin fecha) a
`v2|<userId>|<emitido>|<vence>.HMAC("gsg-sesion-v2|" + payload)`. El proxy y `getCurrentUser` lo rechazan pasadas
las 8 h (`VIGENCIA_SESION_MS`), con `vence` más lejos que 8 h de `emitido`, o con `emitido` más de 60 s en el futuro.
Código: `src/lib/auth.ts`. Tests: `src/lib/auth-sesion.test.ts`.

**Para la gente (CH y el resto).** Nada visible el día del cambio: la cookie ya duraba 8 h en el navegador.
Lo nuevo: si alguien copia la cookie, deja de servir a las 8 h. Cuando vence, el login dice «Tu sesión venció»
(`?error=vencida`), no «contraseña incorrecta».

**Transición (los tokens viejos).** Un token del formato viejo vale sólo antes de `FIN_DE_LA_TRANSICION`
(src/lib/auth.ts): una fecha FIJA del código, 09/11/2026 12:00 Argentina (provisional, a confirmar; ~1 día después de
publicar). No depende del build: un redeploy no reabre la ventana. Como desde el deploy ya no se emiten tokens viejos y
cada cookie vieja vence sola a las 8 h de su ingreso, quien esté trabajando al publicar sigue hasta el fin de su turno.
Desde esa fecha, un token viejo (vigente o copiado) no abre nada, en ningún deploy; `legadoHasta` sólo puede acortarla.

Borde: si se publica después de esa fecha, quien esté adentro vuelve a entrar una vez (ve «Tu sesión venció»).

**Pendiente (ENG-013, Gate 2).** Revocar en el servidor al cerrar sesión o cambiar la contraseña: pide una columna
en `User` (versión de sesión). Hoy el logout borra la cookie y el token sigue valiendo hasta su vencimiento (≤ 8 h).
