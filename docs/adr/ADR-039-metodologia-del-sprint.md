# ADR-039: Metodología del `sprint` — FASE 0 obligatoria, estructura por core/frente, PMO merge-master, cierre/backup

**Estado:** Aceptado — vigente (metodología viva en `docs/METODOLOGIA-SPRINT.md`)
**Fecha:** 2026-07-06
**Depende de:** ADR-008 (un thread = un tema; repo como memoria), ADR-016 (handoff persistido)
**Relacionado:** ADR-032 (modelo de trabajo/modelos), ADR-040 (Gate de Excelencia), ADR-001/ADR-018 (multi-tenant/RLS)
**Fuente viva (detalle):** `docs/METODOLOGIA-SPRINT.md` · `.claude/commands/sprint.md`

---

## Contexto
El trabajo se dispara desde el móvil con **`sprint`** y corre en **varios frentes en paralelo**. Sin una
mecánica repetible se repiten tres errores caros: **errores de migración**, **cosas dejadas afuera** y
**pérdida de contexto** entre sesiones. Hace falta fijar la metodología como decisión, no como costumbre.

## Decisión
`sprint` abre una metodología **obligatoria**:
1. **FASE 0 — "sin la foto completa no se despacha":** antes de abrir nada, el PMO barre repo (tip de
   `main`, ramas/worktrees, WIP, `prisma/migrations/` incl. colisiones de timestamp) + prod/DB/migraciones
   y produce/actualiza **`docs/ESTADO-ACTUAL.md`**. Si no quedó al día, el sprint **no arranca**.
2. **Estructura por core/frente:** **1 frente = 1 worktree = 1 sesión** aislada. Se **paraleliza por
   dominio/core, NUNCA por tenant** (el multi-tenant se resuelve una vez en plataforma/RLS, ADR-001/018);
   el tenant solo es unidad de sesión para **delivery**.
3. **PMO por encima:** asigna cores, **secuencia en serie lo compartido** (`schema.prisma`, migraciones,
   auth/tenancy) y es el **único merge-master** a `main`.
4. **Coordinación por el REPO, no por el chat:** cada frente lee su bocado y deja su estado en el repo
   (rama + `## Sprint activo` + `ESTADO-FRENTES.md`). El repo es la memoria compartida.
5. **Cierre/backup (FASE FINAL):** al pausar, `main` limpio + **git tag anotado `snapshot/AAAA-MM-DD`**
   pusheado + `ESTADO-ACTUAL.md` actualizado. El tag es el punto de retorno.

## Consecuencias
- **(+)** Paralelo real sin pisarse (aislamiento por worktree); **memoria en el repo** → `status`/`seguimos`
  reconstruyen sin leer el chat; menos errores de migración y de contexto.
- **(−)** Disciplina de worktrees (**`npm install` por worktree**, no copiar `node_modules`) y de
  **secuenciar los cimientos compartidos** en serie; costo de mantener `ESTADO-ACTUAL.md` al día.
- **Combina con:** ADR-032 (qué modelo corre cada célula + tope de concurrencia), ADR-040 (Gate antes de
  integrar). Fallback documentado (sin poder abrir sesiones): una sola sesión reutilizada en serie.

## Estado
**Aceptado — vigente.** Este ADR fija la *decisión*; el detalle operativo vive y se mantiene en
`docs/METODOLOGIA-SPRINT.md` y `.claude/commands/sprint.md` (si divergen, es hallazgo de
`/sesion-consolidacion`).
