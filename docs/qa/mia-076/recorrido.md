# Consola de la Cuadrilla · recorrido de la QA ronda 4 (GSG-MIA-079, PR #188 en 99621d3)

Manual corto de cada puesto para esta ronda. El «Camino» de `registro.md` cita estas secciones
(`dueña §2`, `agente §1`, `persona §1`, `qa §1`). Criterios: certificación `00-ESTADO/certificacion/GSG-MIA-076.md`
C1 (con f y g), C2, C4 y C7, según el brief GSG-MIA-079 (el archivo de la certificación no se leyó de primera mano:
Factory-GSG quedó fuera del alcance de esta sesión; «Entendí» dice cómo se leyó cada letra).

## Entorno
- Rama `mia-062/consola-cuadrilla` en `99621d3`. Postgres 16 LOCAL (`/tmp/pgrun`, puerto 5433), base nueva del arnés
  `src/test/base-efimera.ts` (migraciones del repo + RLS con `app_rls`), nunca Neon. Datos ficticios.
- Negocio «Negocio A (prueba)» (`negocio-a.erp.test`). Personas: Duenia A (OWNER, la dueña), Cajera Humana,
  Nueva Provisoria (clave provisoria), Recepcion A, Ex Cajera (dada de baja). Agentes: Cobradora, con usuario
  «Usuario Cobradora» ya OWNER (el caso C1(f)); Redactora, con usuario «Usuario Redactora» (Recepción).
- Excepciones pendientes: «Devolver seña de Lucía Gómez» (plata, la más vieja), «Redactora frenada: falta el dato
  del proveedor» (frenado), «Reprogramar seguimiento» y «Marcar evento como verificado» (comunes).
- `next dev -p 3079` con `RLS_ENFORCEMENT=on`, `APP_BASE_DOMAIN=erp.test`. Playwright/Chromium, 1280×800 y 390×844,
  dsf 1. La clave de las cuentas es la constante del arnés: no se escribe acá.
- Dos detalles del entorno, no del producto: (1) el cliente de Prisma generado del contenedor era anterior a
  `comoUserId` y la consola de la dueña fallaba con «No se pudo hacer»: se corrió `prisma generate` y se reinició;
  (2) Chromium mandaba el WebSocket de HMR por el proxy del contenedor y la página no hidrataba: se lanzó sin las
  variables de proxy y detrás de un reenvío local (puerto 3179) que pone `Origin: localhost` sólo en el upgrade.
- Base mirada desde afuera como `neondb_owner` (usuarios, claves, `active`, `mustChangePassword`, rol, permisos,
  excepciones): foto antes y después de cada rechazo.
- Capturas fuera del repo (nada binario en Git), en el scratchpad de la sesión, `qa/cap/`. Ninguna muestra una clave.

## dueña §1 · Usuarios (control)
`/admin/login` con Duenia A → `/admin/usuarios` → «Cambiar la clave o dar de baja» de una persona → clave nueva →
«Cambiar clave». La dueña de verdad sí puede: es el control de que el rechazo del agente no es general.

## dueña §2 · Consola: agentes y accesos
`/admin/cuadrilla` → lista «Agentes». Cada tarjeta dice sus accesos; si el usuario del agente es Dueño/a o
Dirección, lleva «Alerta · …» en rojo. «Igualar los accesos» despliega «Mismos accesos que» (sólo personas del
puesto) y el botón «Igualar».

## dueña §3 · Abrir la primera
`/admin` → franja «Cuadrilla: N esperan tu decisión · Abrir la primera» → la más vieja abierta en
`/admin/cuadrilla?ex=…#decision`. Se mide sin desplazar: Aprobar y Rechazar dentro de la pantalla (a 390, por
encima de la barra inferior fija) y `scrollWidth` del documento.

## dueña §4 · Lote en la bandeja
`/admin/cuadrilla` → «Excepciones que esperan» → casillas «Elegir «…»» → «Aprobar (sin plata ni envíos)».

## agente §1 · Usuarios con un usuario de agente que ya es OWNER
`/admin/login` con «Usuario Cobradora» → `/admin/usuarios` (la pantalla se muestra entera, con sus formularios) →
«Crear usuario», «Cambiar la clave o dar de baja» → «Cambiar clave» / «Dar de baja a …», «Reactivar», y una casilla
de «Qué puede hacer cada persona». Cada intento tiene que rechazarse en el servidor sin escribir.

## agente §2 · Su consola
`/admin/cuadrilla?ex=<id de la plata>#decision` con el usuario del agente: tiene que ver «Mi hilo · <agente>», sin
bandeja, sin la excepción abierta y sin Aprobar/Rechazar.

## agente §3 · Acción de aprobar forjada
En la sesión del agente se pega el formulario «Aprobar» tomado de la consola de la dueña (mismo id de acción y de
excepción) y se envía. Tiene que rechazarse y la excepción seguir pendiente.

## persona §1 · Primer ingreso con clave provisoria
`/admin/login` con Nueva Provisoria → `/admin/cambiar-password`: la pantalla nombra la cuenta del negocio.

## persona §2 · Primer ingreso sin PIN
`/admin/login` con Cajera Humana → `/admin/definir-pin`: la pantalla nombra la cuenta del negocio.

## qa §1 · Control del registro
`node Factory-GSG/entorno/controles/registro-agente.mjs docs/qa/mia-076/registro.md`. Desde esta sesión no se pudo
correr (Factory-GSG fuera de alcance): lo corre ORQ-007.

## Chequeos de omisión (fuera de las filas; para quien certifica)
- `src/lib/user-actions.ts:65-66` (`getUsers`) y `src/app/admin/(dashboard)/usuarios/matriz.server.ts:32` sólo piden
  `users:manage`: el usuario de agente OWNER sigue LEYENDO Usuarios (nombres, mails, matriz). C1(f) pide que no
  escriba; leer no está en la letra.
- `src/app/admin/(dashboard)/ajustes/soporte/actions.ts:17-26` decide con `user.role`: un usuario de agente OWNER
  podría dar o sacar el consentimiento de Soporte GSG. No se probó en navegador (el interruptor estaba apagado).
- `src/lib/inmobiliaria/acciones.ts:1012,1027` y `src/lib/taller/acciones.ts:603` escriben configuración con sólo
  `users:manage`, sin mirar si el usuario es de un agente. Este negocio no tiene esas apps: no se probó.
