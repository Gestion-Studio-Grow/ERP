# Guardia del agente OWNER · recorrido de la QA (GSG-MIA-081, PR #188 en 965f79c4)

Manual corto de cada puesto para esta ronda. El «Camino» de `registro.md` cita estas secciones (`agente §2`,
`dueña §3`, `redactora §1`, `operador §1`, `persona §1`, `qa §1`). Criterios: `00-ESTADO/certificacion/GSG-MIA-080.md`
de Factory-GSG, leído de primera mano: Q1 y lo visible de G1, G3, G4, G5 y C5. Sesión de QA distinta de la que
construyó (MIA-080) y de las QA anteriores (MIA-076, MIA-078, MIA-079).

## Entorno
- Rama `mia-062/consola-cuadrilla` en `965f79c4`, con `prisma generate` corrido antes. Postgres 16 LOCAL
  (`/tmp/pgrun`, puerto 5433), base nueva del arnés `src/test/base-efimera.ts` (migraciones del repo + RLS con
  `app_rls`), nunca Neon. Datos ficticios.
- Negocio «Negocio A (prueba)» (`negocio-a.erp.test`), sin ficha de marca, con los módulos `taller` e `inmobiliaria`
  y el interruptor «Soporte GSG» prendido (fila del operador en la auditoría). La tabla `SoporteConsentimiento`
  (pendiente de Gate 2) se creó en la base local con el mismo SQL del test `cuadrilla-guardia-agente-owner-postgres`.
- Personas: Duenia A (OWNER, la dueña humana), Recepcion A, Nueva Provisoria (clave provisoria).
- Agentes: **Cobradora** (pausada), con el usuario «Usuario Cobradora» cargado a mano en la base local con rol
  **OWNER** (el caso anómalo); **Redactora** (activa), con «Usuario Redactora» de Recepción; **Archivista** (pausada,
  sin usuario), la que se intenta reanudar.
- `next dev -p 3081` con `RLS_ENFORCEMENT=on` y `APP_BASE_DOMAIN=erp.test`; secretos de sesión y del operador
  locales, de prueba, que no se escriben acá. Playwright/Chromium, 390×844 y 1280×800, dsf 1. La clave de las
  cuentas es la constante del arnés.
- Detalle del entorno, no del producto: con las variables de proxy del contenedor el WebSocket de HMR no llegaba y la
  página no hidrataba. Chromium se lanzó sin esas variables, detrás de un reenvío local (puerto 3181) que pone
  `Origin: localhost` sólo en el upgrade.
- «Foto de la base» = lectura como `neondb_owner` (exento de RLS) de `SoporteConsentimiento`, `InmoConfig`,
  `TallerConfig`, `AgenteCuadrilla` (nombre y estado), `User` (rol, `active`, `mustChangePassword`, comienzo del hash)
  y el recuento de `AuditLog` del negocio, antes y después de cada envío.
- Capturas fuera del repo (nada binario en Git), en el scratchpad de la sesión, `qa/cap/`. Ninguna muestra una clave.

## agente §1 · Entrar con el usuario del agente OWNER
`/admin/login` con «Usuario Cobradora» y su clave → «Ingresar», a 390 y a 1280. Tiene que volver al login con el aviso
`agente_duenio` y no abrir el panel.

## agente §2 · Abrir pantallas por la dirección
Con la cookie que dejó el ingreso de §1: `/admin/ajustes/soporte`, `/admin/inmobiliaria/config/recibos`,
`/admin/inmobiliaria/config`, `/admin/taller/config`, `/admin/usuarios` (con la matriz «Qué puede hacer cada
persona») y `/admin/cuadrilla`. Todas tienen que llevar al login con el aviso.

## agente §3 · Escribir con la sesión del agente
Como el panel no le muestra ningún formulario, se usa el de la dueña: en la sesión de Duenia A se abre la pantalla y se
completa el cambio; antes de tocar el botón se reemplaza la cookie `admin_session` del navegador por la del agente
(la de §1) y se envía. Así la acción del servidor corre con la sesión del agente. Pantallas: Soporte (dar el permiso
n1), Recibos de inmobiliaria (prefijo `AGT`), Configuración de inmobiliaria (interés por mora 3 %), Configuración del
taller (margen 77 %). Foto de la base antes y después de cada envío: tiene que quedar igual.

## dueña §1 · Primer ingreso y PIN
`/admin/login` con Duenia A → `/admin/definir-pin` («Elegí tu PIN»): la hoja nombra al negocio → PIN de 4 números
dos veces → «Guardar».

## dueña §2 · Los mismos cambios, hechos por la dueña
Soporte → casilla del permiso n1 → botón del formulario. Recibos → prefijo `DUE` → «Guardar y ver». Configuración de
inmobiliaria → interés por mora `0,5` → «Guardar configuración». Configuración del taller → margen `40` → «Guardar
configuración». Foto de la base antes y después: cada uno tiene que quedar grabado.

## dueña §3 · Usuarios
`/admin/usuarios`: la lista de personas y la matriz «Qué puede hacer cada persona» se ven.

## dueña §4 · Consola: alerta y reanudar (G5)
`/admin/cuadrilla`, a 1280 y a 390 → lista «Agentes»: la tarjeta de Cobradora lleva «Alerta · …» → botón «Reanudar»
de Archivista. Tiene que negarse con el aviso y Archivista seguir pausada (foto de la base). El PR nombra a «reanudar»
como el único paso que prende la Cuadrilla en la app (los agentes se dan de alta a mano): no hay otro botón de
«activar» que probar.

## dueña §5 · Desbloquear con PIN
Con la sesión de Duenia A abierta se pide el bloqueo que hace el panel a los 15 minutos sin uso (`POST
/admin/login/bloquear` desde la página, lo mismo que manda el vigía de inactividad) → `/admin/login/desbloquear`: la
hoja nombra al negocio.

## persona §1 · Clave provisoria
`/admin/login` con Nueva Provisoria → `/admin/cambiar-password` («Definí tu contraseña»): la hoja nombra al negocio.

## redactora §1 · Agente que no es OWNER
`/admin/login` con «Usuario Redactora» → PIN → `/admin/cuadrilla`, a 390 y a 1280: «Mi hilo · Redactora», sin la
bandeja de supervisión.

## operador §1 · Reanudar desde la consola GSG (G5)
`/operador/login` con el operador dueño (local) → `/operador/cuadrilla` → «Reanudar» de Archivista. Tiene que negarse
con el mismo aviso y la base quedar igual.

## qa §1 · Control del registro
`node <factory-gsg>/entorno/controles/registro-agente.mjs docs/qa/mia-081/registro.md`, corrido por esta sesión con
Factory-GSG clonado de sólo lectura.

## Chequeos de omisión (fuera de las filas; para quien certifica)
- **La 404 del panel dice «Mi negocio».** `/admin/login/<dirección que no existe>` en un negocio sin ficha muestra
  «• Mi negocio» arriba de «No encontramos esta página» (`src/app/not-found.tsx:82` usa `brand.name`, que sin ficha
  es «Mi negocio»). No es una de las 3 pantallas de C5, pero es la misma falla de nombre (captura
  `mia081-x-404-390.png`). En definir-pin el texto «Mi negocio» va en el payload RSC de esa 404 global, sin verse.
- **El login también dice «Mi negocio».** La hoja de `/admin/login` (justo donde el agente OWNER lee su aviso) muestra
  «• Mi negocio» arriba, aunque la pestaña diga «Ingresá · Negocio A (prueba)»: `src/app/admin/login/page.tsx:78`
  usa `marcaDelNegocio(brand, identidad)` sin `Tenant.name`. Lo vio el par en `mia081-01-agente-entrar-390.png`.
- **El ingreso del agente OWNER sigue emitiendo la cookie.** El login la graba y recién la guardia la ignora. Lo que lee
  el token por su lado, sin `getSesionDelPanel`, no pasa por la guardia: `src/app/club-crudo/[[...archivo]]/route.ts`,
  `src/app/admin/login/desbloquear/page.tsx` y `segundo-paso/page.tsx` (además de `proxy.ts` y `sesion-pin.ts`). Esta
  QA no los recorrió con el agente OWNER; es la lista de G2 la que tiene que dar el motivo de cada uno.
- **G5 frena «reanudar», no lo que ya está activo.** Con Cobradora OWNER, Redactora siguió ACTIVO todo el recorrido
  (y su consola anda, que es lo que pide G4). Si «prender» incluye un agente ya activo, el criterio no lo cubre.
