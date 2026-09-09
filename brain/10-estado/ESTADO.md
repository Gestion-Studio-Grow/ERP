---
tipo: estado
generado: true
generado_el: 2026-09-09 04:18 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-09-09 04:18 UTC sobre `0476abe`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/poker-solver-orchestrator-agents-hq26vd` |
| HEAD | `0476abe` (2026-09-02) |
| Árbol | **3 archivo(s) sin commitear** _(sin contar `brain/`)_ |
| Tip de `main` | 0476abe · 2026-09-02 · fix(shine): rutas absolutas — las imágenes no cargaban en la demo en vivo |

**Ramas locales (2, más reciente primero):** `claude/poker-solver-orchestrator-agents-hq26vd` · `main`

**Últimos commits**

- 0476abe · 2026-09-02 · fix(shine): rutas absolutas — las imágenes no cargaban en la demo en vivo
- 922c036 · 2026-09-02 · fix(shine): la etiqueta Desde ya no toca la hairline del pie (Gate B-9)
- a8850c7 · 2026-09-02 · fix(shine): cierra B-7/B-8 y M-5/M-6/M-7 del re-gate del catálogo
- 16b1375 · 2026-09-02 · fix(shine): cierra los 6 blockers y 4 must-fix del Gate del catálogo
- bc6b8d0 · 2026-09-02 · feat(shine): la tienda pasa al catálogo oficial — productos, precios y fotos reales
- 4de52b9 · 2026-09-02 · wip(shine): grilla de tienda con chips de familia, badges y swap de foto al hover
- 4cc66d6 · 2026-09-02 · fix(shine): la ficha adopta el aviso que no intercepta (Gate B-3) + D-1 y O-9..O-12
- c8d5e3d · 2026-09-02 · fix(shine): nav visible y clickeable, números AA, aviso que no ocluye (Gate B-1/B-1b/B-2)
- c488c4c · 2026-09-02 · redesign(shine): reestructura Challenger+referencias — portada tipográfica y carta única numerada
- b45e634 · 2026-09-01 · fix(shine): alts fieles a las fotos y sincronizados con el src (Gate B-2/O-8/O-9)
- e19fd05 · 2026-09-01 · fix(shine): height:auto activa el marco 3:2 (Gate B-1) + alts por momento
- d203901 · 2026-09-01 · redesign(shine): hero editorial — menos carga visual y foto nítida a tamaño honesto

## Migraciones (Prisma)

- **Total en el repo:** 41
- **Últimas 5:** `20260711120000_add_bancos_importacion` · `20260711140000_add_cartera_cliente` · `20260711140000_add_tenant_fiscal_credential` · `20260712120000_sprint_entregable_concurrency_guards` · `20260815120000_lead_campania`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 301 |
| Palabras en `docs/` | 432.613 |
| ADRs | 81 |
| Nodos en el grafo | 87 _(los 81 ADR + 6 enmiendas)_ |

## Superficies con front propio

- `Magra`
- `Shine`

## Lo que esta foto NO puede cubrir

Se deriva del repo, así que **solo sabe lo que el repo sabe**. Estos ítems de la Fase 0 no son
derivables y siguen viviendo en el documento narrativo — leelos ahí cuando el frente los toque:

- **Tenants vivos y su estado de publicación** → `docs/ESTADO-ACTUAL.md` §1
- **Gates abiertos y decisiones pendientes del dueño** → `docs/ESTADO-ACTUAL.md` (HANDOFF)
- **Bugs conocidos y frentes en curso** → `docs/ESTADO-ACTUAL.md` §7
- **Qué migraciones corrieron REALMENTE en Neon** → solo lo confirma el dueño (Gate 2)

---

**Detalle narrativo:** [ESTADO-ACTUAL.md](../../docs/ESTADO-ACTUAL.md) · **Roadmap:** [ESTADO-Y-ROADMAP.md](../../docs/ESTADO-Y-ROADMAP.md) · **Decisiones:** [índice](../30-decisiones/000-INDICE.md) · **Guardarraíles:** [índice](../20-lecciones/000-INDICE.md)
