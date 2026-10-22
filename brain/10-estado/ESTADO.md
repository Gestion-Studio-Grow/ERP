---
tipo: estado
generado: true
generado_el: 2026-10-22 01:56 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-22 01:56 UTC sobre `b45d376`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `main` |
| HEAD | `b45d376` (2026-10-22) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | b45d376 · 2026-10-22 · fix(build): next build con 6 GB de heap en Vercel — el chequeo de tipos ya pide ~2,5 GB y el tope por defecto de Node ronda 2 GB |

**Últimos commits**

- b45d376 · 2026-10-22 · fix(build): next build con 6 GB de heap en Vercel — el chequeo de tipos ya pide ~2,5 GB y el tope por defecto de Node ronda 2 GB
- 2ba4df6 · 2026-10-22 · Merge remote-tracking branch 'origin/claude/ch-mostrador' into claude/sleepy-tesla-392rov
- c362cd2 · 2026-10-22 · Pedidos: el ancho del nombre arranca justo después del apilado; el test mira la sombra
- 56c64e3 · 2026-10-21 · Tabla densa: sombra en el borde con más tabla; Pedidos: lo accionable primero (A-2)
- 4433719 · 2026-10-21 · Merge remote-tracking branch 'origin/claude/ch-mostrador' into claude/sleepy-tesla-392rov
- 879e421 · 2026-10-21 · Tabla densa: el marco que se desliza se enfoca y tiene nombre si no entra (A-1)
- df763f7 · 2026-10-21 · Merge remote-tracking branch 'origin/claude/ch-mostrador' into claude/sleepy-tesla-392rov
- e24af7b · 2026-10-21 · Merge remote-tracking branch 'origin/ccr-63ed11dc-brcdpp' into claude/sleepy-tesla-392rov
- d35067e · 2026-10-21 · fix(club): la pasada a hash diferida suelta el «Deshacer» de antes (que traería los PIN en claro) y tiene su test (observaciones del Gate)
- 5b38e0a · 2026-10-21 · Tabla densa: se desliza en su marco y no empuja la página de costado (O4)
- 0e157d8 · 2026-10-21 · fix(club): deuda del PIN con hash — la pasada a hash al abrir corre con el navegador libre (m7), G8 no estrena una sal que no es hex y recorta el PIN viejo (O1/O2), test del aviso del link viejo (m5); copia del motor y sitio al día
- 3dc35bf · 2026-10-21 · fix(club): restaurar un respaldo en la demo del club de hoy no pasa los PIN a hash (sólo la jornada real) (Gate O3)

## Migraciones (Prisma)

- **Total en el repo:** 53
- **Últimas 5:** `20261009120000_taller_caja` · `20261013120000_modulo_inmobiliaria` · `20261013180000_inmobiliaria_ajustes` · `20261013210000_inmobiliaria_recibos` · `20261015120000_modulo_padel_clases`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 357 |
| Palabras en `docs/` | 613.623 |
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
