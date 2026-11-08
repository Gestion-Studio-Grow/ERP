# Sesión del panel con vencimiento en el servidor (08/11/2026)

**Qué cambió.** El token de la cookie `admin_session` pasa de `userId.firma` (sin fecha) a
`v2|<userId>|<emitido>|<vence>.HMAC("gsg-sesion-v2|" + payload)`. El proxy y `getCurrentUser` lo rechazan pasadas
las 8 h (`VIGENCIA_SESION_MS`), con `vence` más lejos que 8 h de `emitido`, o con `emitido` más de 60 s en el futuro.
Código: `src/lib/auth.ts`. Tests: `src/lib/auth-sesion.test.ts`.

**Para la gente (CH y el resto).** Nada visible el día del cambio: la cookie ya duraba 8 h en el navegador.
Lo nuevo: si alguien copia la cookie, deja de servir a las 8 h. Cuando vence, el login dice «Tu sesión venció»
(`?error=vencida`), no «contraseña incorrecta».

**Transición (los tokens viejos).** Un token del formato viejo vale hasta `finDeLaTransicion()`:
el momento del build de producción (`GSG_COMPILADO_EN`, lo inlinea `next.config.ts`) + 9 h, y nunca después del
15/12/2026 06:00 (`TOPE_DE_LA_TRANSICION`). Como desde el deploy ya no se emiten tokens viejos y cada cookie vieja
vence sola a las 8 h de su ingreso, nadie que esté trabajando al publicar queda afuera: sigue hasta el fin de su
turno de 8 h como siempre y el próximo ingreso ya es v2. Pasada la ventana, un token viejo (vigente o copiado) no abre
nada. Sin marca de build (dev, tests) el formato viejo se rechaza.

Bordes: si se publica después del 15/12, o se promueve un build de más de 9 h, quien esté adentro vuelve a entrar
una vez (ve «Tu sesión venció»). Cada redeploy reabre la ventana 9 h sólo para tokens viejos que ya existían.

**Pendiente (ENG-013, Gate 2).** Revocar en el servidor al cerrar sesión o cambiar la contraseña: pide una columna
en `User` (versión de sesión). Hoy el logout borra la cookie y el token sigue valiendo hasta su vencimiento (≤ 8 h).
