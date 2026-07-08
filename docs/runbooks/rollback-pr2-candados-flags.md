# 🔒 Runbook — Candados y flags de PR-2/M2 (nav agrupada GROW-AR)

**Objetivo:** que la reingeniería de interfaz de PR-2 (ADR-059) sea reversible con **un solo movimiento**
en cualquier punto, sin tocar datos ni migraciones. Este documento fija los flags, su default, y el
camino exacto de rollback.

- **Autor:** Sesión de plataforma (candados + wiring de flags) · **Fecha:** 2026-07-08
- **Rama:** `claude/sprint-startup-generic-rf6x0m` · **Base:** ADR-058/059, `roadmap-dos-modelos.md` M2
- **Territorio de esta sesión:** `src/modules/flags.ts`, `src/modules/candado.ts` (+ test), `src/lib/profile-gating.ts`.
  **NO toca** primitivos/tokens (`globals.css`, los 7 primitivos) ni la agrupación de nav (`AdminShell.tsx`) —
  esos son territorio de otras sesiones del mismo sprint; este runbook documenta los flags que consumen.

---

## 1. Los flags (todos DEFAULT OFF, todos PURA/env, cero DB)

| Flag (env var) | Función | Default | Qué gatea |
|---|---|---|---|
| `PROFILES_ENABLED` | `profilesEnabled()` | OFF | **Ya existía (M1).** Motor de perfiles lite/enterprise en sí — si está OFF, `activeProfile` es siempre `null` y todo lo de abajo es un no-op. |
| `NAV_GROUPING_ENABLED` | `navGroupingEnabled()` | OFF | **Interruptor MAESTRO de PR-2.** Nav de 5 grupos + densidad + primitivos nuevos. OFF → nav plana legada de 17 ítems, sin cambios. |
| `UPGRADE_TEASER_ENABLED` | `upgradeTeaserEnabled()` (global) / `getUpgradeTeaserEnabled()` (server, por tenant) | OFF | El **candado** en sí (D3): si los ítems `enterprise-only` que un tenant `lite` no alcanza se muestran **bloqueados** (candado + `UpgradeSheet`) o simplemente **no se muestran** (default, igual que hoy). |

**Los tres son independientes entre sí** — apagar uno no depende de los otros ni los afecta. Se pueden
subir de a uno (M1 ya está en `main` con `PROFILES_ENABLED` OFF; `NAV_GROUPING_ENABLED` y
`UPGRADE_TEASER_ENABLED` llegan con PR-2, también OFF).

## 2. La lógica del candado (`src/modules/candado.ts`)

`resolveNavLockState(itemPerfilMin, { activeProfile, teaserEnabled })` devuelve uno de tres estados:
`"visible"` · `"locked"` · `"hidden"`. Es la extensión al **tercer estado** de lo que hoy es binario
(`perfilGateAllows`). La garantía dura, cubierta por `candado.test.ts`:

> **Con `teaserEnabled=false` (default), `resolveNavLockState` NUNCA devuelve `"locked"`** — colapsa
> exactamente a `visible`/`hidden`, idéntico al gate binario de hoy. El candado no puede "quedar a
> medio prender": o el flag está ON y aparece bloqueado, o está OFF y el ítem directamente no está.

## 3. Camino de rollback (de más chico a más grande)

1. **Solo el candado se ve raro / mal accesible →** apagar `UPGRADE_TEASER_ENABLED` (o no setearlo).
   Los ítems enterprise-only vuelven a ocultarse sin más — cero impacto en la nav agrupada ni en el resto.
2. **Toda la nav nueva de PR-2 da problemas (grupos, densidad, primitivos) →** apagar
   `NAV_GROUPING_ENABLED`. El backoffice vuelve a la nav plana legada al instante, en cualquier
   ambiente, sin redeploy de datos ni migración — es un flag de env, efecto inmediato en el próximo request.
3. **El motor de perfiles completo da problemas →** apagar `PROFILES_ENABLED` (ya documentado desde M1).
   Con esto en OFF, los otros dos flags quedan sin efecto igual (todo pasa a `"visible"`/legado).
4. **Rollback de código (última instancia) →** revertir el/los commits de PR-2. Cero datos que
   reconciliar: todo el estado vive en memoria (`PROFILE_OVERRIDES`/`TEASER_OVERRIDES`, ambos vacíos hoy)
   o en el env — no hay columna nueva en `prisma/schema.prisma` (eso sigue siendo §C · Gate 2, ADR-059 D1).

## 4. Qué NO cubre esto (fuera de este candado, elevado o de otra sesión)

- **Persistencia real del perfil/opt-in por tenant** (`Tenant.profile`, columna del opt-in de venta del
  candado) — sigue sin existir en el schema. Es **§C · Gate 2** (ADR-059 D1), no se toca acá.
- **El render del candado** (ícono, `NavItem` de 3 estados, `UpgradeSheet`) — primitivos/tokens, otra sesión.
- **La agrupación de 5 grupos y el mapa rol↔perfil (`perfilMin` en `ALL_ITEMS`)** — `AdminShell.tsx`, otra sesión.

— Elaborado por GSG (sesión de plataforma — candados + wiring de flags, PR-2/M2)
