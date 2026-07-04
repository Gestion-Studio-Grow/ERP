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
- [ ] `/sesion-feature verificar y mergear script de provisioning (ADR-019)` — **el script ya está escrito** en la rama `feature/performance` (`scripts/provision-tenant.ts`, 306 líneas: idempotente por `slug`, transaccional, aditivo, parametrizado, con guarda del gate ADR-018 que rechaza crear la 2ª fila de `Tenant` sin RLS; no comparte código con `prisma/seed.ts`; contraseña de bootstrap fuera del repo). Lo que **falta**: verificarlo (tsc + ensayo contra un tenant sintético en branch de Neon) y mergear. **No se mergeó a `main` en la consolidación 2026-07-04 a propósito**: la feature está gateada al 2º cliente y va junta con activar RLS (ADR-018) — es el mismo trabajo. Disparo real: 2º cliente. *(origen: sesión de arquitectura — 2026-07-04 · script escrito 2026-07-04)*
- [ ] `/sesion-feature importador CSV de clientes (ADR-019 §2.c, diferido)` — feature de migración de datos separada del alta; construir cuando exista un cliente concreto con lista real para importar (diseñar contra sus datos sucios de verdad). Nombre/teléfono/email, vista previa, tolerancia a datos sucios (ADR-009 §5). *(origen: sesión de arquitectura — 2026-07-04)*
- [ ] `/sesion-feature activar RLS de Postgres (ADR-018)` — **disparo: cuando se provisione el 2º tenant, no antes.** Migración con `ENABLE ROW LEVEL SECURITY` + policies `USING (tenant_id = current_setting('app.current_tenant_id'))` en cada tabla de negocio; rol de app sin `BYPASSRLS`; extensión de Prisma (`$allOperations`) que envuelve cada operación en `$transaction` con `SET LOCAL app.current_tenant_id`; resolución de tenant por request (subdominio/sesión) en `tenant.ts` conservando el assert fail-closed como red. **Ensayo obligatorio en branch de Neon con tenant sintético antes de tocar producción.** *(origen: sesión de arquitectura — 2026-07-03)*

## Hechos (podados por `/sesion-consolidacion` 2026-07-04)

_Barridos en la consolidación del 2026-07-04 tras verificar contra `git log` de `main` y el BACKLOG que están hechos y deployados: Liquidación de comisiones (+ migración `20260704130000`), Módulo Localización (+ migración `20260704120000`), Cliente reprograma su turno, RBAC Fase 1 y Fase 2. Rastro completo en el historial de git y en `BACKLOG.md`._

_Mergeado en esta misma consolidación (2026-07-04): **Lista de espera** (`feature/lista-de-espera`, feature P0 de `docs/ANALISIS-BRECHAS.md`) — merge a `main`, migración `20260704140000_add_waitlist` aplicada a Neon, build en verde; y **upgrade UX/UI base** (`feature/ux-ui-upgrade`) — capa de design tokens semánticos + primitivos `src/components/ui/`, aditiva y aún sin consumir en pantallas. Queda fuera de main a propósito: el **script de provisioning** (`feature/performance`, ADR-019) — ver Abiertos._
