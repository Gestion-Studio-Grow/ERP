---
tipo: estado
generado: true
generado_el: 2026-10-18 20:40 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-18 20:40 UTC sobre `c9bef4a`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/magra-nivel-bp` |
| HEAD | `c9bef4a` (2026-10-18) |
| Árbol | **304 archivo(s) sin commitear** _(sin contar `brain/`)_ |
| Tip de `main` | _no disponible (este clon no trae `main` local)_ |

**Ramas locales (4, más reciente primero):** `claude/magra-nivel-bp` · `claude/magra-practicidad` · `claude/magra-eventualidades` · `claude/sleepy-tesla-392rov`

**Últimos commits**

- c9bef4a · 2026-10-18 · fix(seed-magra): MAGRA_SLUG sólo contra una base local (Gate B1) + menores del Gate
- 2010106 · 2026-10-18 · test(magra): la tienda sin WhatsApp del local no ofrece botones de WhatsApp (46/46)
- 0cba684 · 2026-10-18 · fix(tienda-magra): sin el WhatsApp del local, los botones de WhatsApp no aparecen (ambiente real)
- 10a56c8 · 2026-10-18 · fix(tienda-magra): ambiente real — dirección, horario o WhatsApp sin cargar no se muestran (ni «a confirmar»)
- 429887c · 2026-10-18 · fix(magra): ambiente real — sin formato de balanza guardado no hay campo de etiqueta, y el primer día no dice «de prueba»
- fbc4fa7 · 2026-10-18 · Merge remote-tracking branch 'origin/claude/sleepy-tesla-392rov' into claude/magra-nivel-bp
- d40a660 · 2026-10-18 · fix(sugerido): el factor de la semana tipo se marca como no-plata (guarda de redondeos) · lección DX-10 del UAT de MAGRA
- 9885d44 · 2026-10-18 · test(magra): el recorrido suma peso imposible, PLU, etiqueta de balanza y pedidos esperando (44/44)
- 72242b7 · 2026-10-18 · pedidos: recordatorio por WhatsApp para la clienta que no vino a retirar
- 40e0b19 · 2026-10-18 · pedidos: avisar cuando el peso real se aleja de lo que pidió la clienta
- 08457fb · 2026-10-18 · pedidos: marcar a la clienta que tiene otro pedido abierto
- 8b93457 · 2026-10-18 · pedidos: la línea de estado dice cuántos de la tienda esperan y desde cuándo

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
