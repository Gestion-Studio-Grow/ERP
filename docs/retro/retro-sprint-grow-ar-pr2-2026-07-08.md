# 🔁 Retro — Sprint GROW-AR · PR-2/M2 (reingeniería de interfaz backoffice)

> **Formato:** ADR-047 (rutina de retroalimentación) — **cadencia (a)** al cierre del sprint: memoria +
> 1 caso (`docs/lecciones-aprendidas/registro.md`) + 1 mejora de brief/skill por célula.
> **Escribe:** S5 (Juicio Crítico, Opus). **Fecha:** 2026-07-08 · **Rama:** `claude/sprint-startup-generic-rf6x0m`.
> **Modelo del sprint:** pool fijo de 5 sesiones (S1–S4 ejecución reversible, S5 Gate/integración en Opus).

---

## 0. Resultado del sprint

**PR-2/M2 (agrupación de nav + densidad + primitivos + candados, todo behind flags DEFAULT OFF) entregado
en la rama del sprint y cableado por S5.** El skeleton de nav de S4 quedó **wired** a `AdminShell.tsx`/
`layout.tsx` detrás del flag maestro `NAV_GROUPING_ENABLED` (OFF) → con el flag apagado el backoffice
renderiza la nav plana legada **idéntica** a hoy.

**Veredicto del Gate (S5/Opus): ✅ PASA CON OBSERVACIONES.** Reglas duras del Gate: todas verdes
(reversibilidad, flags/candados default OFF, naming Comercio/Empresa, tier canal neutro, §C elevado y no
ejecutado, Neon intacto, consistencia ADR-058/059). Vallas: **tsc limpio · 596 tests verdes** (baseline
577, +19). 1 observación no bloqueante (naming de grupos, ver caso MP-15). **No se mergeó a `main`** — el
merge lo decide el dueño con la lista de §C resuelta.

---

## PALANCA 1 · MEMORIA (facts al día)

Se actualiza `docs/ESTADO-ACTUAL.md` (bloque PUNTO DE PARTIDA): PR-2/M2 landed en la rama + Gate pasado +
§C·I6 nuevo (dependencia BMC-lite ↔ fix de stock). Facts persistentes para memoria de sesión:
- **Motor de dos modelos:** roadmap M0✅→M1✅(PR-1)→**M2 en curso** (PR-2 nav/densidad/primitivos landed
  behind flags OFF; falta set `lite` por rubro = PR-3). Avance global del motor ~25–30%.
- **Perfiles GROW-AR:** `PROFILES_ENABLED`/`NAV_GROUPING_ENABLED`/`UPGRADE_TEASER_ENABLED` **todos default
  OFF**; perfil resuelto **en memoria** (`getActiveProfile`, sin `Tenant.profile`); invariante de NAV con
  property-test; invariante de DATO = deuda declarada M4/§C.
- **§C vivos del rediseño:** `Tenant.profile`+migración (Gate 2) · entidades nuevas (ADR aparte) ·
  **§C·I6 BMC-lite ↔ fix doble-descuento (worktree `calidad`)** · deploy/Neon pago/cert ARCA.

## PALANCA 2 · CASOS → `docs/lecciones-aprendidas/registro.md`

Se registra **[MP-15] Deviación de una decisión de ADR citando una autoridad no trazable en el repo**
(naming de los 5 grupos). Detalle y guardarraíl en el registro.

## PALANCA 3 · SKILLS / BRIEFS (1 mejora por célula)

| Sesión / rol | Observación del sprint | Mejora al brief/skill |
|---|---|---|
| **S1** (mapa/mercado) | Sesgo optimista "SAP-piensa-en-empresa" casi mete fiado en el piso universal del micro; lo corrigió la revisión S5. | Brief: al curar scope items, **marcar explícitamente cada supuesto sin evidencia en la base de tenants** y proponer gating por rubro por default, no piso universal. |
| **S2** (primitivos/tokens) | Ejecución limpia: tokens aditivos con `--density:1` = cero cambio visual; tier neutro respetado; a11y (44px/AA/sr-only). | Brief: mantener el patrón "capa aditiva con default identidad" como estándar de reversibilidad de UI. Sin cambios. |
| **S3** (candados/flags) | Excelente: 2 flags independientes, candado que **colapsa a legado** con teaser OFF, runbook de rollback, reversibilidad probada por test. | Brief: promover "flag maestro + flag fino, ambos OFF, con test de colapso-a-legado" como patrón canónico de PR reversible. |
| **S4** (nav 5 grupos) | Entregó skeleton limpio y trazable, **pero** cambió el naming de ADR-059 D3 citando un override no verificable (→ MP-15). | Brief: si una decisión de un ADR aceptado se cambia, **traer el rastro de autoridad al mismo commit** (confirmación del dueño en doc) o marcarlo como **propuesta para el Gate**, nunca commitearlo como hecho. |
| **S5** (Gate/integración) | Acierto: **scopear el diff del Gate desde el inicio del sprint (`a730c57..HEAD`), no desde `merge-base`** — evitó leer el schema/migración pre-existente (ADR-057) como violación de reversibilidad del sprint. | Brief del integrador: **siempre gatear el delta del sprint** y re-elevar por separado los §C pre-existentes que la rama ya cargaba. |
| **PMO / método** | Pool de 5 sesiones sobre una rama compartida funcionó (commits por pathspec, sin race). | Mantener; documentar el rol integrador (S5) como dueño único de la reconciliación previa al Gate. |

---

## 4. Qué salió bien / a reforzar
- **Bien:** reversibilidad ejemplar (todo behind flags OFF, cero DB); disciplina §C (nada ejecutado);
  naming Comercio/Empresa y tier neutro respetados en código; la revisión adversarial S5 del mapa **antes**
  de que S4 agrupara evitó construir sobre un supuesto flojo (fiado) — el momento correcto para el juicio.
- **A reforzar:** trazabilidad de autoridad cuando una sesión se desvía de un ADR (MP-15).

## 5. Follow-ups abiertos (no bloquean el Gate)
- [ ] **Confirmar naming de los 5 grupos** (criollo D3 vs. neutro-profesional de S4) — dueño.
- [ ] **Verificación en navegador del estado ON** (`NAV_GROUPING_ENABLED=on`) — no corrida (flag OFF +
      worktree con junction/Turbopack); hacer en un entorno con node_modules real antes de encender en prod.
- [ ] **PR-3/M2:** set `lite` por rubro + `KpiTile`/`EmptyState`; **`DataTable`** como hito propio con
      presupuesto de a11y (ADR-059 D6, fix #5).

— Retro por S5 (Juicio Crítico, Opus) · Gate ADR-040 · cadencia (a) ADR-047
