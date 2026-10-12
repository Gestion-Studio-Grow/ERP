---
tipo: estado
generado: true
generado_el: 2026-10-12 15:20 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-12 15:20 UTC sobre `921e0d2`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `main` |
| HEAD | `921e0d2` (2026-10-12) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | 921e0d2 · 2026-10-12 · fix(taller): la portada no muestra los servicios de ejemplo del alta |

**Últimos commits**

- 921e0d2 · 2026-10-12 · fix(taller): la portada no muestra los servicios de ejemplo del alta
- 590bd8e · 2026-10-11 · chore: reintento del deploy (falló la descarga de una fuente de Google en el build)
- 3d35eb9 · 2026-10-11 · chore(taller): script del camino B del runbook para migrar producción a mano
- 050e8c2 · 2026-10-09 · feat(taller): los cobros entran al libro de caja y la entrega descuenta el stock
- f6527e0 · 2026-10-08 · fix(taller): redondeo de la casa, pista de rubro sin 'taller' a secas y migración declarada en el lote
- 168ca94 · 2026-10-08 · feat(taller): logo real de AGR tomado de su Instagram y WhatsApp confirmado
- 9e9b8d7 · 2026-10-08 · feat(taller): panel, link del cliente y página pública de Taller Mecánico AGR
- e4d436b · 2026-10-08 · feat(taller): rubro y módulo de taller mecánico (tablas con RLS, reglas y acciones)
- 5df8208 · 2026-10-08 · buscatufoto: producto de GSG servido en su propio host (buscatufoto.gsgapp.com.ar)
- 3c2bcf7 · 2026-09-27 · consola: el login dice con qué usuario se entra y no depende del id de una action
- ce36bd3 · 2026-09-27 · consola: la clave del dueño se compara sin espacios ni Enter en los bordes
- 440e5fc · 2026-09-27 · supermercado: fit-gap y recorrido de punta a punta

## Migraciones (Prisma)

- **Total en el repo:** 49
- **Últimas 5:** `20260911120000_profesional_cobra_en_mostrador` · `20260925120000_lanzamiento_base` · `20260925150000_comprobante_autorizado_inmutable` · `20261008120000_modulo_taller` · `20261009120000_taller_caja`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 323 |
| Palabras en `docs/` | 511.117 |
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
