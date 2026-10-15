---
tipo: estado
generado: true
generado_el: 2026-10-15 14:52 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-15 14:52 UTC sobre `5ecbd94`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `ccr-breakpoint-turnero` |
| HEAD | `5ecbd94` (2026-10-15) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | _no disponible (este clon no trae `main` local)_ |

**Ramas locales (2, más reciente primero):** `ccr-breakpoint-turnero` · `ccr-63ed11dc-brcdpp`

**Últimos commits**

- 5ecbd94 · 2026-10-15 · fix(breakpoint): turnero — hallazgos del Gate de Excelencia (versión por reserva, modo real, ?api= seguro)
- 814abd5 · 2026-10-15 · chore(brain): sincroniza el mapa derivado del repo (npm run brain)
- 185bebd · 2026-10-15 · feat(breakpoint): turnero — demo pública sin servidor, logo oficial y defectos de la batería corregidos
- be44cac · 2026-10-15 · Merge remote-tracking branch 'origin/ccr-63ed11dc-brcdpp' into ccr-breakpoint-turnero
- 27d0cf3 · 2026-10-15 · feat(breakpoint): turnero web de canchas — front y back separados, en vivo con el backoffice
- 4c4a12e · 2026-10-15 · feat(breakpoint): marca real del club en el backoffice (logo SVG, colores medidos, publicaciones)
- c740bcf · 2026-10-15 · breakpoint: marca autorizada según el dueño (15/10); falta registrarla en ADR-034
- beefba4 · 2026-10-15 · breakpoint: marca relevada de Instagram (logo, colores medidos, 6 imágenes, fuentes)
- 15714ae · 2026-10-15 · feat(breakpoint): 5 estilos visuales premium para el backoffice (Chapa por defecto)
- ff94a69 · 2026-10-15 · feat(breakpoint): backoffice minimalista y fluido (paleta ⌘K, atajos, deshacer, transiciones)
- dccc93a · 2026-10-15 · perf(breakpoint): la pantalla se actualiza con morph en vez de re-pintar todo
- 62586fd · 2026-10-15 · feat(breakpoint): segunda vuelta con el pedido del club — cancha y buffet separados, cuenta corriente, PIN, proveedores, caja 12 a 12

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
| Documentos en `docs/` | 333 |
| Palabras en `docs/` | 544.123 |
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
