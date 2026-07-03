# Próximos pasos — cola de handoff entre sesiones

**Qué es:** la cola donde cada sesión deja el trabajo concreto que disparó, para que la
sesión siguiente lo lea del repo en vez de re-descubrirlo en una charla. Es la pieza que
faltaba de ADR-008: las decisiones ya persistían como ADR y las features en BACKLOG, pero
el *handoff* ("qué sigue después de cerrar esto") vivía en el chat — lo único que la sesión
siguiente no lee. Ver **ADR-016**.

**Cómo se usa (lo hacen los comandos solos, no a mano):**
- **Al abrir** una sesión: el comando lee esta cola y ofrece los ítems abiertos que le tocan
  a su tipo como punto de arranque por defecto, antes de preguntar en blanco.
- **Al cerrar** una sesión: si disparó un follow-up concreto, lo agrega acá con el comando
  sugerido; si completó un ítem de la cola, lo marca hecho.
- **Al consolidar:** `/sesion-consolidacion` poda esta cola (saca lo hecho, revalida lo abierto).

**Convención de cada ítem:** `[ ]` abierto / `[x]` hecho · comando sugerido · descripción ·
`(origen: <tipo de sesión> — <fecha>)`. Lo hecho se deja tildado hasta que consolidación lo
barre, así queda rastro de una sesión a la otra.

---

## Abiertos

- [ ] `/sesion-feature implementar RBAC/usuarios (ADR-017)` — tabla `User` + enum `UserRole` + migración que siembra el OWNER de Carolina; `auth.ts` (token con `userId`, hashing scrypt), login por email+password, `getCurrentUser()`/`requireRole()`, `actor` real en `audit.ts`, `requireRole(...)` en cada Server Action de `/admin`, UI de gestión de usuarios. Sin romper el acceso actual. *(origen: sesión de arquitectura — 2026-07-03)*

## Hechos (pendientes de poda por `/sesion-consolidacion`)

- [x] `/sesion-feature blindar getCurrentTenantId fail-closed (ADR-015)` — hecho: `src/lib/tenant.ts` ahora resuelve fail-closed (throw si hay ≠1 tenant, sin cache) y los comentarios de `tenant.ts` y `schema.prisma` quedaron corregidos. tsc + build limpios. *(origen: sesión de arquitectura — 2026-07-03 · cerrado 2026-07-03)*
