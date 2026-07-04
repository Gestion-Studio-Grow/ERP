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

- [ ] `/sesion-feature RBAC Fase 2 (ADR-017)` — autorización fina sobre la identidad ya construida en Fase 1: `requireUser()`/`requireRole(...)` al tope de cada Server Action y loader de `/admin` (mapa rol→permisos en código), ocultar en el front lo que RECEPTION/PROFESSIONAL no ven (UX, no seguridad), pantalla de gestión de usuarios para el OWNER (alta/baja, rol, reset password), y retirar `ADMIN_PASSWORD` (ya no es puerta sin dueño). *(origen: sesión de feature — 2026-07-03)*
- [ ] Cambiar el email **provisional** del OWNER (`macarenaarias21@gmail.com`) por el real de Carolina cuando lo tengamos — hoy es solo el identificador de login; se edita desde la gestión de usuarios (Fase 2) o con un update directo. *(origen: sesión de feature — 2026-07-03)*
- [ ] `/sesion-arquitectura Plugin ARCA: contrato de eventos/comandos + build-vs-buy del conector` — retoma el "Diseño detallado del Plugin ARCA" del INDEX y le suma la decisión relevada del mercado: definir el contrato concreto (`InvoiceCreated` → `RegisterFiscalDocument`, manejo de CAE/vencimiento/errores de ARCA, idempotencia por AMD) **y** elegir el conector inicial (comprar TusFacturas API / AfipSDK vs construir WS propios WSAA/WSFE), como implementación reemplazable detrás del plugin. Recomendación de negocio: **Buy primero, Build a escala** + alcance mínimo B/C monotributo/servicios. Insumo: `docs/facturador-electronico-arca-mercado-y-vision.md`. *(origen: sesión de negocio — 2026-07-04)*
- [ ] `/sesion-feature activar RLS de Postgres (ADR-018)` — **disparo: cuando se provisione el 2º tenant, no antes.** Migración con `ENABLE ROW LEVEL SECURITY` + policies `USING (tenant_id = current_setting('app.current_tenant_id'))` en cada tabla de negocio; rol de app sin `BYPASSRLS`; extensión de Prisma (`$allOperations`) que envuelve cada operación en `$transaction` con `SET LOCAL app.current_tenant_id`; resolución de tenant por request (subdominio/sesión) en `tenant.ts` conservando el assert fail-closed como red. **Ensayo obligatorio en branch de Neon con tenant sintético antes de tocar producción.** *(origen: sesión de arquitectura — 2026-07-03)*

## Hechos (pendientes de poda por `/sesion-consolidacion`)

- [x] `/sesion-feature RBAC Fase 1 (ADR-017)` — hecho y deployado: `User`+`UserRole` (migración `20260703170000_add_users_rbac` aplicada a Neon), login por email+password (cookie con `userId`, scrypt), `getCurrentUser()`, `actor` real en el audit. OWNER de Carolina sembrado (email provisional). tsc+build limpios, login verificado en preview. Falta Fase 2 (ver Abiertos). *(origen: sesión de feature — 2026-07-03 · cerrado 2026-07-03)*
