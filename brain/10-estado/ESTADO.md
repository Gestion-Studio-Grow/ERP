---
tipo: estado
generado: true
generado_el: 2026-08-02 01:53 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-08-02 01:53 UTC sobre `e078f64`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/token-saving-brain-clients-5rur0j` |
| HEAD | `e078f64` (2026-08-01) |
| Árbol | **2 archivo(s) sin commitear** _(sin contar `brain/`)_ |
| Tip de `main` | d5185e1 · 2026-07-13 · Merge fix/fiscal-master-key-runtime — lectura runtime robusta de FISCAL_MASTER_KEY + diagnóstico sin exponer valor |

**Ramas locales (2, más reciente primero):** `claude/token-saving-brain-clients-5rur0j` · `main`

**Últimos commits**

- e078f64 · 2026-08-01 · docs(rfc-005): el parche exacto de activación, para aprobar o rechazar
- 5080895 · 2026-08-01 · feat(brain): configurar el grafo para que se lea como un cerebro, no como una madeja
- 434f4ac · 2026-07-31 · feat(brain): tres zonas nuevas — metodología, calibración y mapa código↔decisión
- 27586ed · 2026-07-31 · fix(brain): pasada de excelencia — 10 defectos encontrados por auditoría de 3 frentes
- 84f4126 · 2026-07-31 · feat(brain): el grafo de verdad — un nodo por decisión, dependencias como enlaces reales
- f2e8670 · 2026-07-31 · feat(brain): abrir el cerebro desde el móvil + arreglar la semántica de brain:check
- 7341ae2 · 2026-07-31 · feat(brain): segundo cerebro — vault de notas atómicas derivado del repo (Fase 0 a ~15% del costo)
- d5185e1 · 2026-07-13 · Merge fix/fiscal-master-key-runtime — lectura runtime robusta de FISCAL_MASTER_KEY + diagnóstico sin exponer valor
- ee25ed2 · 2026-07-13 · fix(fiscal): endurecer lectura runtime de FISCAL_MASTER_KEY + diagnóstico sin exponer valor
- 1d48135 · 2026-07-13 · test(shine): actualizar contrato de orden de secciones tras edición de densidad
- 15a8ddd · 2026-07-13 · Merge diseno/shine-resumido — densidad del front de Shine: colección comprable primero (producto+precio a ~1.7 pantallas mobile) + fix overflow hero mobile
- fc0dede · 2026-07-13 · Merge ci/senal-verde — vallas del gate en jobs separados (visual/visual-aa BLOQUEANTES; lint no-bloqueante) + fix contraste badge 'Por kg' (ADR-040)

## Migraciones (Prisma)

- **Total en el repo:** 40
- **Últimas 5:** `20260710120000_invoice_origin_idempotency_unique` · `20260711120000_add_bancos_importacion` · `20260711140000_add_cartera_cliente` · `20260711140000_add_tenant_fiscal_credential` · `20260712120000_sprint_entregable_concurrency_guards`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 297 |
| Palabras en `docs/` | 426.576 |
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
