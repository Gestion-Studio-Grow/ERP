---
description: Sesión de seguridad — auditar la postura de seguridad y aplicar endurecimiento concreto
---

Sos una sesión de **SEGURIDAD** del tablero (`docs/TABLERO-SESIONES.md`). Tema de esta sesión: **$ARGUMENTS**

## Preconceptos (no re-descubrir nada de esto)

1. Leé `SECURITY.md` de la raíz — su sección "Estado de seguridad conocido (verificado, no aspiracional)" es el registro persistente de lo que ya se sabe. No repitas hallazgos que ya están ahí; buscá lo nuevo.
2. Leé `docs/adr/INDEX.md` y cargá **solo** los ADRs que tocan seguridad si el tema los pisa: 001 (multi-tenant + RLS), 005 (auth propio, no vendor), AMD-005 (MFA + rate limit en login, en `AMENDMENTS-revision-critica.md`). El INDEX resume; la verdad es el código.
3. **Verificá contra el código, no contra supuestos.** Estado real ya conocido a confirmar antes de opinar: `/admin` es una sola contraseña compartida (`src/lib/auth.ts`, `ADMIN_PASSWORD` global, sin usuarios ni roles); no hay MFA ni rate-limiting en el login; el aislamiento multi-tenant es a nivel de app (`tenantId` en toda query vía `getCurrentTenantId()`), RLS de Postgres diferida a propósito hasta el 2º tenant; `AuditLog` existe pero sin roles el `actor` no distingue personas.
4. **Los secretos no viven en el repo** (`DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, y opcionales `CRON_SECRET`/`RESEND_API_KEY`). Verificá que sigan gitignoreados (`git check-ignore .env`) y que nada nuevo los haya filtrado a código, logs o commits. Nunca los pegues en el chat ni en un doc.
5. **La base es producción real** (Neon). Cualquier prueba de seguridad pega contra datos reales del cliente — no corras nada destructivo ni de fuerza bruta contra producción; todo dato de prueba que crees, borralo antes de cerrar.
6. **Alcance de esta sesión:** encontrar y aplicar endurecimiento concreto (validación server-side faltante, headers, escape, autorización, manejo de secretos, rate-limit). Toda validación de negocio va server-side, dentro de la transacción si toca reservas (patrón de `bookAppointment`) — nunca confiar en el navegador.
7. **Límite con arquitectura:** si el arreglo es una *decisión estructural* (activar RLS, cambiar el modelo de auth, introducir roles), esta sesión **no la toma sola** — la anota y se abre `/sesion-arquitectura` para el ADR. Acá se aplican los fixes que no requieren decidir algo nuevo.
8. Stack: Next.js 16 con APIs distintas a tu entrenamiento — **leé `node_modules/next/dist/docs/` antes de escribir código Next** (regla de `AGENTS.md`).

## Cierre de sesión — no está "hecho" sin esto

- [ ] `npx tsc --noEmit` y `npm run build` limpios si tocaste código.
- [ ] Verificado en preview si el cambio es observable en el browser.
- [ ] `SECURITY.md` actualizado: hallazgos nuevos (corregidos o pendientes) reflejados en "Estado de seguridad conocido". El registro debe seguir siendo verificado, no aspiracional.
- [ ] Secretos confirmados fuera del repo; datos de prueba borrados de la base; scripts `scripts/_*.ts` de un solo uso, borrados.
- [ ] Si apareció una decisión estructural de seguridad: **no la dejes en un comentario** — anotala explícitamente para `/sesion-arquitectura` (y actualizá `BACKLOG.md` si cambió la prioridad de un ítem).
- [ ] Commit que explica el porqué (ver `CONTRIBUTING.md`) + push. Push a `main` deploya solo en Netlify.

Confirmá en una línea qué superficie vas a auditar y arrancá.
