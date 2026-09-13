---
tipo: estado
generado: true
generado_el: 2026-08-30 22:41 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-08-30 22:41 UTC sobre `f7b0095`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/private-music-server-k33eg9` |
| HEAD | `f7b0095` (2026-08-16) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | f7b0095 · 2026-08-16 · refactor(ch): la poda — de 9 secciones a 4, y el hero deja de firmar como plantilla |

**Ramas locales (2, más reciente primero):** `claude/private-music-server-k33eg9` · `main`

**Últimos commits**

- f7b0095 · 2026-08-16 · refactor(ch): la poda — de 9 secciones a 4, y el hero deja de firmar como plantilla
- d0199db · 2026-08-16 · fix(reserva): buscar "depilación" ya encuentra los servicios de depilación
- 27c8583 · 2026-08-16 · perf(infra): las funciones pasan a correr en São Paulo, donde está la base
- 9970ab5 · 2026-08-16 · perf(sitio): el modal de reserva deja de pesar en cada página; loaders sin trabajo duplicado
- 6e72eea · 2026-08-16 · feat(ch): ilustraciones provisorias de marca en las tarjetas de la vitrina
- 2e9d99c · 2026-08-16 · feat(ch): campaña dada de baja con sus datos a salvo + interactividad nativa del navegador
- 47bec19 · 2026-08-16 · feat(sitio): portón con clave para el front público, apagado por defecto
- e486b44 · 2026-08-16 · fix(ch): reservar deja de ser un trabajo — buscador, avance al elegir y vitrina compacta
- 56cf44e · 2026-08-16 · feat(ch): la home muestra tratamientos con precio exacto y la carta se muda a /servicios
- 59ff7a0 · 2026-08-16 · feat(nav): buscador en la barra + grupos completos, y menos peso por pantalla
- 63cb63c · 2026-08-15 · fix(accesos): aprovisionar modulos deja de ser una capacidad del dueno
- 2faaa3c · 2026-08-15 · feat(modulos): Campanias entra al catalogo de modulos

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
| Documentos en `docs/` | 298 |
| Palabras en `docs/` | 427.458 |
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
