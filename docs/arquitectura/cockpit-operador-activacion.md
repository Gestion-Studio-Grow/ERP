# Cockpit Operador — activación y lo que se eleva (T4)

**Estado:** ✅ Construido (reversible, detrás de flag) — 2026-07-07, Opus. Ruta `/operador/cockpit`.
**Implementa:** `docs/arquitectura/cockpit-operador-spec-T4.md` (W1–W6). Read-only, control-plane (ADR-021).
**Firma:** — Elaborado por GSG

---

## Qué quedó construido

Cockpit interactivo **read-only** en `/operador/cockpit` (dentro del plano de operador, misma auth
`requireOperator`). Seis widgets:
- **W1** Mapa de tenants (semáforo 🟢🟡🔴, desde metadata de plataforma — sin datos de negocio).
- **W2** Diagrama de arquitectura (SVG) coloreado por salud de componentes (app/DB/RLS/ARCA/MP/WhatsApp).
- **W3** Estado de la DB (Neon) — snapshot **en pausa por defecto** (ahorro plan free).
- **W4** Diagrama de flujo de gobernanza (PMO→Dueño→Arquitecto→Gate→Dispatch, ADR-049).
- **W5** Panel de información crítica (alertas rojas/amarillas + qué acción del dueño destraba cada una).
- **W6** Plan/roadmap en vivo (T1–T5 + horizontes), con auto-refresh por poll (30 s, pausa si la pestaña se oculta).

3D con **CSS puro + SVG** (cero dependencias nuevas; el peso vive en la ruta, no toca el bundle común).
Lógica de derivación **pura y testeada** (`src/lib/cockpit/`, 16 tests). Sello GSG en el footer del
control-plane; wording criollo (ADR-044).

## Flags que prende el dueño (reversibilidad — no son secretos)

| Variable | Efecto | Default |
|---|---|---|
| `COCKPIT_ENABLED` | Muestra el link **Cockpit** en el nav del operador. La ruta funciona igual sin el flag (acceso directo). | OFF |
| `COCKPIT_NEON` | Activa el snapshot **real** de la DB (W3) contra `pg_stat_activity`/`pg_locks` (solo lectura). Sin el flag, W3 muestra "en pausa" sin tocar Neon. | OFF |

## Lo que se ELEVA (no lo hace el agente)

1. **Rol de DB de solo-lectura para el control-plane (W3).** Hoy el snapshot de Neon usaría
   `operatorPrisma` (que apunta a `OPERATOR_DATABASE_URL ?? DATABASE_URL`). Para el monitoreo real (W3)
   lo correcto es apuntar `OPERATOR_DATABASE_URL` a un **rol read-only** (acceso a `pg_stat_*`, **sin**
   `BYPASSRLS` sobre datos de negocio). Es una acción de infra del dueño; el código ya está listo (solo
   lee vistas de sistema, gated por `COCKPIT_NEON`). **No lo activo yo.**
2. **Nada irreversible construido:** sin migraciones, sin deploy, sin secretos, cero escrituras.

## Follow-ups (con su propio Gate, fuera de T4)

- **Health-ping HTTP real por tenant (W1):** hoy el estado se deriva de la metadata de plataforma
  (status + si tiene URL publicada). El ping a `/api/health` por host de tenant (spec W1) reemplaza esa
  derivación sin tocar la UI (el modelo `TenantSalud` ya está listo).
- **W6 desde el doc en runtime:** hoy el plan/roadmap se espeja como dato tipado (`src/lib/cockpit/plan.ts`),
  que se actualiza al commitear. Parsear `plan-ventana-*.md`/`roadmap-gsg.md` en runtime es una mejora
  opcional (requiere incluir los docs en el bundle del server).
- **Cache del snapshot (W3):** cuando se prenda `COCKPIT_NEON`, sumar un cache de ~30–60 s para no
  consultar `pg_stat_*` en cada refresh (spec §2, Neon-free-consciente).

— Elaborado por GSG
