---
tipo: estado
generado: true
generado_el: 2026-10-18 20:31 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-18 20:31 UTC sobre `9478b460`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/sleepy-tesla-392rov` |
| HEAD | `9478b460` (2026-10-18) |
| Árbol | **42 archivo(s) sin commitear** _(sin contar `brain/`)_ |
| Tip de `main` | 68b43fd4 · 2026-10-13 · chore(inmobiliaria): los cobros de muestra del seed llevan número de recibo |

**Ramas locales (4, más reciente primero):** `claude/sleepy-tesla-392rov` · `integra/matias` · `claude/reset-golive` · `main`

**Últimos commits**

- 9478b460 · 2026-10-18 · merge: main al día antes de publicar CH y Magra
- 16d96eb3 · 2026-10-18 · merge: script de reseteo del go-live (sólo transaccional, modo prueba por defecto)
- 0f5e52e1 · 2026-10-18 · feat(ops): reseteo de go-live por negocio — borra lo transaccional de prueba, conserva maestros (D7.5 opción A)
- 8a81197a · 2026-10-18 · feat(ambiente-real): fuera los textos de prueba y los datos inventados de lo que ve el cliente
- 96bfe4a5 · 2026-10-18 · docs(ch): la factura del saldo del turno, lista para que decida la contadora (opción A preparada, B con migración)
- 80e3d345 · 2026-10-18 · docs(breakpoint): se trabaja sobre el ambiente real; re-auditoría del Gate aprobada con menores
- 6bcca738 · 2026-10-18 · merge: main al día en la versión candidata del UAT 16/10 antes de publicar
- 6dd5293b · 2026-10-18 · docs(breakpoint): el Gate de la rama del club y sus correcciones en el runbook del pase [preview]
- ea162da3 · 2026-10-18 · Merge remote-tracking branch 'origin/ccr-f8859297-5ru6oe' into ccr-63ed11dc-brcdpp
- b28a465b · 2026-10-18 · fix(club): la Auditoría del panel ya no muestra las fotos del club (PIN en claro, MB por fila) + tope 10 MB + control de otro club en el servidor [sin-deploy]
- fe6f49a7 · 2026-10-18 · fix(terminal): el panel instalable SÓLO para negocios con mostrador (terminal o club) — M6 del Gate [sin-deploy]
- a7598018 · 2026-10-18 · Merge remote-tracking branch 'origin/ccr-63ed11dc-ensayo' into ccr-63ed11dc-brcdpp

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
| Documentos en `docs/` | 350 |
| Palabras en `docs/` | 596.359 |
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
