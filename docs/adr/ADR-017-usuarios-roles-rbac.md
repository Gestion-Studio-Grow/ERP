# ADR-017: Modelo de usuarios, roles y autorización (RBAC) para el piloto

**Estado:** Aceptado — pendiente de implementación (2026-07-03)
**Concretiza:** ADR-009 §3 (RBAC de 3 roles) y §4 (audit actor = quién) para la arquitectura real del piloto (Camino A).
**Reconcilia con:** ADR-005 (auth propio) — documenta una divergencia deliberada de Camino A respecto de su mecanismo aspiracional (JWT+refresh+argon2+Lucia).
**Depende de:** ADR-015 (resolución de tenant fail-closed — el lookup de usuario es tenant-scoped).

---

## 1. Problema

`/admin` es hoy **una sola contraseña compartida**: `ADMIN_PASSWORD` global, cookie HMAC firmada con payload fijo `"admin"` (`src/lib/auth.ts`, `auth-actions.ts`, guard en `src/proxy.ts`). No existe el concepto de usuario.

El costo no es teórico: ya está construido un `AuditLog` append-only completo (ADR-010 G4) que intercepta **toda** mutación en un único punto (`src/lib/audit.ts`), pero `auditAdmin()` escribe `actor: "admin"` a mano. En el momento en que una segunda persona use el panel (Carolina tiene empleadas: recepción, profesionales), el audit trail **miente** — dice "admin" para todo y no sirve para saber quién hizo qué. Es infraestructura ya pagada que no rinde por falta de una identidad.

ADR-009 §3 ya decidió el *qué* conceptual (3 roles predefinidos, sin editor granular), pero lo ancló a una arquitectura que este piloto no tiene ("claims en el JWT", "capa de comandos del Core"). Falta la decisión concreta para lo que existe: cookie firmada + Server Actions. Eso es lo que resuelve este ADR.

**Restricción dura (no negociable):** no romper el acceso de Carolina. La migración deja su login funcionando desde el primer deploy.

## 2. Decisiones

### 2.a Identidad — tabla `User` propia, no reusar `Professional`

Modelo `User` tenant-scoped (ADR-001): `id`, `tenantId`, `name`, `email` (identificador de login, único por tenant), `passwordHash`, `role`, `active` + `deletedAt` (soft-delete, patrón del resto del schema), `professionalId?` (link opcional al `Professional` cuando el usuario es un profesional que además opera el panel), `lastLoginAt?`, timestamps.

**Alternativas:**
- **Reusar `Professional` como login (descartada):** el dueño y la recepción **no son** profesionales, y no todo profesional tiene (ni quiere) login. Meter `passwordHash`/`role` en `Professional` acopla la seguridad con la agenda y deja al dueño sin dónde vivir. El link opcional `User.professionalId` da lo mismo sin el acople.
- **Dropdown "¿quién sos?" que alimenta el `actor` (descartada, es teatro):** cero costo, pero cualquiera elige cualquier nombre — no hay autenticación real y el audit trail queda **forjable**. No cierra el problema, lo disfraza.

### 2.b Roles — enum fijo de 3, sin editor granular

`enum UserRole { OWNER, RECEPTION, PROFESSIONAL }`, exactamente los de ADR-009 §3 (Dueño/Recepción/Profesional). `OWNER` absorbe el "admin" de hoy.

| Rol | Puede |
|---|---|
| **OWNER** | Todo: configuración, precios, reportes financieros, gestión de usuarios. |
| **RECEPTION** | Agenda, alta de clientes, cobrar, comprobantes. **No** ve reportes financieros ni edita precios/config. |
| **PROFESSIONAL** | Solo su propia agenda (leer + marcar completado/no-show), vía `professionalId`. |

No se construye editor de permisos por-tenant en esta fase — ADR-009 §3 ya lo decidió y **no se re-discute**: los negocios chicos quieren roles con nombres que entienden, no una matriz. La granularidad custom espera a un cliente Mid-Market que la pida y la pague.

### 2.c Mecanismo de auth — evolucionar la cookie HMAC, no adoptar JWT/Lucia (divergencia Camino A)

Se mantiene la cookie `httpOnly` firmada con HMAC-SHA256 que ya existe; **cambia solo el payload**: de `"admin"` fijo a el `userId`. `createSessionToken(userId)`, `isValidSessionToken` devuelve el `userId` verificado, y un helper nuevo `getCurrentUser()` resuelve cookie → verifica firma → carga el `User` (chequeando `active` y que siga existiendo).

**Alternativas:**
- **JWT + refresh tokens + Lucia/argon2, como pide ADR-005 (descartada por ahora):** ese mecanismo era la aspiración *de plataforma* (multi-tenant a escala, `tenant_id` como claim para RLS). Para un panel de staff de un solo tenant es más maquinaria de la que el problema necesita. Camino A (ADR-010) dice evolucionar lo que hay: la cookie firmada ya es "auth propio" (cumple el espíritu de ADR-005, no viola "no vendor") y alcanza. El día que llegue RLS + multi-tenant real (ADR-015 §b futuro), se revisita el salto a claims/JWT — este ADR lo deja anotado, no lo cierra.
- **Vendor (Auth0/Clerk) (descartada):** viola ADR-005 (auth propio) y su costo por MAU. Sin cambios.

### 2.d Hashing de contraseñas — `scrypt` de la stdlib, no argon2 nativo

Cada `User` guarda `passwordHash` con salt por usuario, formato `scrypt$<salt>$<hash>`, usando `node:crypto.scrypt` (el login corre en un Server Action = runtime Node, no edge).

**Alternativa argon2 (que nombraba ADR-005) (descartada por ahora):** argon2 es más fuerte, pero es una dependencia nativa/wasm con fricción de build en Netlify. `scrypt` es memory-hard, está en la stdlib (cero deps), y es suficiente para la escala de un panel de staff. Es **reemplazable** sin tocar el resto (el hash es un detalle encapsulado en `auth.ts`). Se documenta la divergencia respecto de ADR-005 para no re-discutirla.

*Nota de compatibilidad edge:* el `proxy.ts` (middleware, corre en edge) solo **verifica la firma** de la cookie con Web Crypto (ya lo hace) — nunca hashea contraseñas. El hashing vive solo en el Server Action de login. No hay conflicto de runtime.

### 2.e Autorización — se chequea en la capa de Server Actions, no solo en el front

El `proxy.ts` sigue haciendo el portón grueso ("¿hay sesión válida?"). La autorización fina (¿este rol puede esta acción?) se chequea **en el server**, con helpers `requireUser()` y `requireRole(...roles)` llamados al tope de cada Server Action de `/admin` y de cada loader de página admin. El mapa rol→permisos vive en código (no en la base). Ocultar un botón en el front es **UX, no seguridad** (ADR-009 §3 ya lo dijo: "ocultar un botón no es seguridad").

**Alternativa "solo middleware" (descartada):** el middleware de Next corre en edge, sin acceso cómodo a la base, y no ve la semántica de la acción (no distingue "ver agenda" de "editar precios"). La autorización pertenece a la capa de comandos — que en este piloto son los Server Actions, el equivalente real a la "capa de comandos del Core" de ADR-009.

### 2.f El pago: `actor` real en el audit trail

`auditAdmin()` deja de hardcodear `"admin"`: lee el usuario de la sesión (`getCurrentUser()`) y escribe `actor: "user:<id>"`. La pantalla de auditoría resuelve `id → name`. Las filas históricas con `"admin"` quedan como están (rastro previo al modelo de usuarios). **Esta es la razón de ser del ADR**: convierte un `AuditLog` ya construido pero mudo en un registro que dice quién.

## 3. Migración sin romper el acceso de Carolina

La migración que agrega `User`/`UserRole` **siembra un `User` OWNER** con el `name`/`email` de Carolina y un `passwordHash` derivado del `ADMIN_PASSWORD` actual (o una contraseña de bootstrap que se le comunica por canal seguro, nunca en el repo). Desde el primer deploy, su login sigue andando — cambia de "solo contraseña" a "email + contraseña". `ADMIN_PASSWORD` se retira una vez sembrado el OWNER (deja de ser una puerta sin dueño). Los demás usuarios (recepción, profesionales) los da de alta el OWNER desde el panel.

## 4. Impacto

- **ADRs que toca:** concretiza ADR-009 §3/§4 (de "Propuesto" a decidido para Camino A); documenta divergencia de mecanismo respecto de ADR-005 (cookie evolucionada en vez de JWT/argon2/Lucia) — ADR-005 no se invalida, se marca que su auth era escala-plataforma y el piloto evoluciona lo que hay.
- **Schema (implementación en `/sesion-feature` posterior):** `enum UserRole`; `model User` (con `professionalId?` → `Professional`, y el back-relation en `Professional`); migración que siembra el OWNER. Todo con `tenantId` (ADR-001).
- **Código (misma feature):** `auth.ts` (token con `userId`, hashing scrypt), `auth-actions.ts` (login por email+password), nuevo `getCurrentUser()`/`requireRole()`, `audit.ts` (`actor` desde sesión), cada Server Action de `/admin` con su `requireRole(...)`, UI de login (campo email) + pantalla de gestión de usuarios para el OWNER.
- **BACKLOG:** el ítem crítico "Roles y permisos" pasa de decisión abierta a "implementar según ADR-017".
- **Cola de handoff (ADR-016):** se agrega `/sesion-feature implementar RBAC/usuarios (ADR-017)`.

## 5. Decisión final

Se acepta: `User` propia tenant-scoped + enum de 3 roles (ADR-009) + evolución de la cookie HMAC para cargar `userId` + hashing scrypt de stdlib + autorización en la capa de Server Actions + `actor` real en el audit. Es la opción "simple y correcta ahora" que resuelve el problema forzante de hoy (audit trail mudo, panel sin identidad) sin adoptar la maquinaria de escala-plataforma (JWT/refresh/argon2/RLS) que el piloto todavía no necesita, y sin romper el acceso actual. El salto a claims/JWT queda anotado para cuando llegue el multi-tenant real.
