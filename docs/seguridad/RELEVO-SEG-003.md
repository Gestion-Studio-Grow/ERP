# Relevo GSG-SEG-003 → GSG-SEG-004 (PR #50, rama `claude/seguridad-2026-11-08`)

Cierre por límite de contexto (09/11/2026). Tip al escribir: `754d2d1` + este relevo.

## Orden del dueño (08/11)
«El usuario no se va a vencer ni nada. A lo sumo diseñaríamos un ingreso por PIN cuando el usuario ya está
logueado, para reactivarlo». Implementado en #50, sin tocar el canje de Macarena ni lo ya certificado.

## Qué cambió
- **La cuenta no vence.** Token v3 `v3|userId|ingreso|actividad.HMAC`. `ingreso` es el último ingreso por contraseña, Google o código (0 en el canje).
  `actividad` es el último uso. El proxy reemite la cookie con el uso cada ≥ 5 min (maxAge de 7 días).
- **Estados por inactividad:** activa < 15 min · bloqueada 15 min–7 días (pantalla de PIN) · vencida ≥ 7 días (contraseña).
- **PIN de 4 dígitos**, que se elige tras el primer ingreso o tras cambiar la contraseña. Se puede definir sólo con
  una contraseña ingresada hace menos de 15 min. Se guarda con scrypt (`hashPassword`). Con 5 errados se pide la contraseña
  y se borra la cookie; la reserva atómica del intento ocurre antes de comparar. Sin PIN → contraseña.
- No se reutilizó otro PIN: el de operador es otra cosa; motivo en `docs/seguridad/sesion-con-vencimiento.md`.

## Archivos clave
- `src/lib/sesion-constantes.ts:5-13`: 15 min, 7 días, 5 intentos y ventana de 15 min, todos marcados «PROVISIONAL A CONFIRMAR».
- `src/lib/auth.ts:89` VIDA_COOKIE · `:105` createSessionToken · `:132` leerSesion · `:160` readSessionToken (sólo
  activa) · `:169` sesionParaRenovar.
- `src/proxy.ts:219-234`: renovación de la cookie; bloqueada → `/admin/login/desbloquear`.
- `src/lib/sesion-pin.ts:75` desbloquearConPin (puro, falla cerrada) · `:118` puedeDefinirPin.
- `src/lib/sesion-pin.server.ts:43` reservarIntento (`updateMany` con `fallos < max`). Tolera la tabla ausente (P2021/P2022).
- `src/lib/ingreso.server.ts:56`: ofrece definir el PIN tras el ingreso. También lo ofrece `change-password-actions.ts`.
- Pantallas: `src/app/admin/login/desbloquear/` y `src/app/admin/definir-pin/`.
- `src/lib/sesion-legado.ts`: el canje emite v3 con ingreso 0, así que no puede definir PIN.

## Migración
- `prisma/migrations/20261108130000_user_pin/migration.sql`: **ADITIVA**. Crea `UserPin` con índices, FK a Tenant (RESTRICT) y a User (CASCADE), RLS y la policy `tenant_isolation`. No altera ni borra nada.
- **SIN APLICAR (Gate 2).** El código funciona sin ella: nadie tiene PIN y se pide la contraseña.
- Está en `prisma/lote-deploy.txt`; el runbook de ensayo y el de pase están regenerados.
- Si Vercel tiene `MIGRATE_DATABASE_URL`, el merge la aplica: Gate 2 del dueño.
- Orden de publicación: #44 → #50 → #48 → #53. #48 y #53 deben regenerar lote/runbooks después de #50.

## Verificación hecha
- `tsc` en 0. Build real OK con `NODE_OPTIONS=--max-old-space-size=6144`.
- Suite completa: 8722/8730. Las 4 fallas también fallan en `main` y son preexistentes:
  - cuenta-2d-pantalla
  - reminder-sweep-postgres
  - redondeos-locales
  - avisos-programados-postgres
- `pin-regresion-postgres` es flaky bajo carga y pasa si se corre sola.
- Tests nuevos o reescritos: `src/lib/auth-sesion.test.ts` (16) y `src/lib/sesion-pin.test.ts` (11). Se actualizaron también `sesion-legado.test.ts` y `club-crudo-proxy.test.ts`.
- QA clic por clic: `scripts/qa/_qa-sesion-pin.mjs`, que corre sobre una base local y nunca Neon → 22/22. Cubre:
  - bloqueo con PIN correcto
  - 5 errados
  - 7 días
  - usuario sin PIN
  - ventana para definir el PIN
  - renovación a los 6 min

## Falta
1. **Certificación adversarial (Opus):** el gsg-certificador sobre `c0912ce` fue cortado y no hay veredicto. Hay que
   relanzarla sobre `git diff main...HEAD` (riesgos: falsificación o reuso del token, fuerza bruta concurrente del PIN,
   plantar un PIN con una cookie robada, aislamiento por tenant de UserPin, tolerancia a la tabla ausente, canje) hasta CUMPLE.
2. **Descripción final del PR #50:** quitar el aviso «EN CURSO… NO PUBLICAR» y volcar qué cambió, la verificación,
   la certificación y las decisiones del dueño (constantes provisionales, Gate 2 de la migración, conflictos con #48 y #53).
3. **Informe ≤ 300 palabras a GSG-ORQ-004.**
