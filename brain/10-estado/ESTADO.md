---
tipo: estado
generado: true
generado_el: 2026-10-18 21:26 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-18 21:26 UTC sobre `0dbb3ea6`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/sleepy-tesla-392rov` |
| HEAD | `0dbb3ea6` (2026-10-18) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | 68b43fd4 · 2026-10-13 · chore(inmobiliaria): los cobros de muestra del seed llevan número de recibo |

**Ramas locales (4, más reciente primero):** `claude/sleepy-tesla-392rov` · `integra/matias` · `claude/reset-golive` · `main`

**Últimos commits**

- 0dbb3ea6 · 2026-10-18 · fix(magra): menores del re-Gate — la vitrina vacía no nombra WhatsApp si no hay número; JSDoc de pasosParaArrancar pegado a su función
- dd8a1e9f · 2026-10-18 · Merge remote-tracking branch 'origin/claude/sleepy-tesla-392rov' into claude/magra-nivel-bp
- c9bef4a3 · 2026-10-18 · fix(seed-magra): MAGRA_SLUG sólo contra una base local (Gate B1) + menores del Gate
- 98e7bcf7 · 2026-10-18 · merge: CH al nivel Break Point (guion, E2E, eventualidades, practicidad apagada)
- fe316444 · 2026-10-18 · docs(brain): mapa regenerado con la lección DB-5 [sin-deploy]
- 20101067 · 2026-10-18 · test(magra): la tienda sin WhatsApp del local no ofrece botones de WhatsApp (46/46)
- 0cba6843 · 2026-10-18 · fix(tienda-magra): sin el WhatsApp del local, los botones de WhatsApp no aparecen (ambiente real)
- 10a56c80 · 2026-10-18 · fix(tienda-magra): ambiente real — dirección, horario o WhatsApp sin cargar no se muestran (ni «a confirmar»)
- 9478b460 · 2026-10-18 · merge: main al día antes de publicar CH y Magra
- 16d96eb3 · 2026-10-18 · merge: script de reseteo del go-live (sólo transaccional, modo prueba por defecto)
- 429887ca · 2026-10-18 · fix(magra): ambiente real — sin formato de balanza guardado no hay campo de etiqueta, y el primer día no dice «de prueba»
- fbc4fa75 · 2026-10-18 · Merge remote-tracking branch 'origin/claude/sleepy-tesla-392rov' into claude/magra-nivel-bp

## Migraciones (Prisma)

- **Total en el repo:** 52
- **Últimas 5:** `20261008120000_modulo_taller` · `20261009120000_taller_caja` · `20261013120000_modulo_inmobiliaria` · `20261013180000_inmobiliaria_ajustes` · `20261013210000_inmobiliaria_recibos`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 352 |
| Palabras en `docs/` | 602.977 |
| ADRs | 87 |
| Nodos en el grafo | 93 _(los 87 ADR + 6 enmiendas)_ |

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
