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

- [ ] Cambiar el email **provisional** del OWNER (`macarenaarias21@gmail.com`) por el real de Carolina cuando lo tengamos — hoy es solo el identificador de login; se edita desde la gestión de usuarios (Fase 2) o con un update directo. *(origen: sesión de feature — 2026-07-03)*
- [ ] `/sesion-feature implementar script de provisioning (ADR-019)` — **disparo: cuando aparezca un 2º cliente; el alta del tenant #2 va junta con activar RLS (ADR-018), es el mismo trabajo.** Crear `scripts/provision-tenant.ts` idempotente por `slug`, transaccional (todo-o-nada), parametrizado (nombre, `slug`, email del OWNER): siembra `Tenant` + `User` OWNER (patrón ADR-017, bootstrap por canal seguro, nunca en el repo) + catálogo blueprint mínimo editable (horarios Lun–Sáb 9–19 por defecto + categorías/servicios de ejemplo borrables). Guard que rechace crear una 2ª fila en `Tenant` si RLS (ADR-018) no está aplicado. **No** compartir código con `prisma/seed.ts` (seed de demo de Carolina, con `deleteMany`). Portal self-service, panel super-admin e importador CSV quedan diferidos (ver ADR-019 §2). *(origen: sesión de arquitectura — 2026-07-04)*
- [ ] `/sesion-feature importador CSV de clientes (ADR-019 §2.c, diferido)` — feature de migración de datos separada del alta; construir cuando exista un cliente concreto con lista real para importar (diseñar contra sus datos sucios de verdad). Nombre/teléfono/email, vista previa, tolerancia a datos sucios (ADR-009 §5). *(origen: sesión de arquitectura — 2026-07-04)*
- [ ] `/sesion-feature activar RLS de Postgres (ADR-018)` — **disparo: cuando se provisione el 2º tenant, no antes.** Migración con `ENABLE ROW LEVEL SECURITY` + policies `USING (tenant_id = current_setting('app.current_tenant_id'))` en cada tabla de negocio; rol de app sin `BYPASSRLS`; extensión de Prisma (`$allOperations`) que envuelve cada operación en `$transaction` con `SET LOCAL app.current_tenant_id`; resolución de tenant por request (subdominio/sesión) en `tenant.ts` conservando el assert fail-closed como red. **Ensayo obligatorio en branch de Neon con tenant sintético antes de tocar producción.** *(origen: sesión de arquitectura — 2026-07-03)*

## Hechos (pendientes de poda por `/sesion-consolidacion`)

- [x] `/sesion-feature RBAC Fase 2 (ADR-017)` — hecho y deployado: mapa rol→capacidades como dato en código (`src/lib/capabilities.ts`, roles OWNER/RECEPTION/PROFESSIONAL), `requireCapability(...)` server-side (`src/lib/authz.ts`) al tope de cada Server Action y loader de `/admin` (PROFESSIONAL scopeado a su propia agenda), navegación y KPI de ingresos ocultos por rol en el front (UX, no seguridad), pantalla `/admin/usuarios` del OWNER (alta, baja/reactivación con guarda de último OWNER y auto-baja, reset de contraseña, todo auditado), y `ADMIN_PASSWORD` **retirada** (docs de deploy/contributing/migración actualizados). `getCurrentUser` envuelto en `cache()` para deduplicar el lookup por request. tsc + build limpios. *(origen: sesión de feature — 2026-07-03 · cerrado 2026-07-04)*
- [x] `/sesion-feature RBAC Fase 1 (ADR-017)` — hecho y deployado: `User`+`UserRole` (migración `20260703170000_add_users_rbac` aplicada a Neon), login por email+password (cookie con `userId`, scrypt), `getCurrentUser()`, `actor` real en el audit. OWNER de Carolina sembrado (email provisional). tsc+build limpios, login verificado en preview. Falta Fase 2 (ver Abiertos). *(origen: sesión de feature — 2026-07-03 · cerrado 2026-07-03)*
