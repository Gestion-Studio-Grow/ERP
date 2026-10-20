---
tipo: estado
generado: true
generado_el: 2026-10-20 03:38 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-20 03:38 UTC sobre `afb3413`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/balanza-universal` |
| HEAD | `afb3413` (2026-10-20) |
| Árbol | **12 archivo(s) sin commitear** _(sin contar `brain/`)_ |
| Tip de `main` | 5f0cac8 · 2026-10-19 · feat(consola): dar de alta a una persona desde la ficha del negocio |

**Ramas locales (6, más reciente primero):** `claude/balanza-universal` · `claude/balanza-serie` · `claude/magra-nivel-bp` · `claude/magra-practicidad` · `claude/magra-eventualidades` · `claude/sleepy-tesla-392rov`

**Últimos commits**

- afb3413 · 2026-10-20 · feat(balanza): «Tomar peso» en Vender y Pedidos, asistente por cable en Balanza y lector, y recorrido E2E (test:balanza-e2e, 24/24)
- 962de48 · 2026-10-20 · feat(balanza): «Tomar peso» y el asistente de la balanza por cable
- 318e872 · 2026-10-20 · feat(balanza): leer el peso de la balanza por cable (Web Serial) — protocolos, detector, hook y simulador
- 27eb20f · 2026-10-20 · feat(pedidos): el campo de la etiqueta de la balanza también en Pedidos (el POS que usa MAGRA desde el celular)
- f4d99c3 · 2026-10-20 · feat(balanza): pantalla «Balanza y lector» en el menú del mostrador — detectar, probar, guardar el formato y el PLU de cada producto
- 91f6621 · 2026-10-20 · feat(balanza): etiquetas de cualquier balanza — prefijo de 1 dígito, control del precio GS1, UPC-A, presets por marca y «detectar con una etiqueta»
- 5f0cac8 · 2026-10-19 · feat(consola): dar de alta a una persona desde la ficha del negocio
- 740867f · 2026-10-19 · fix(alta): «Profe de pádel» escrito a mano ya no cae en la tienda de pádel
- 3e2a5d6 · 2026-10-19 · fix(build): el control de [sin-deploy] no adivina la base y construye si no la tiene
- 35cb452 · 2026-10-19 · chore(lote): ensayo y pase de Neon regenerados con la migración del profe [sin-deploy]
- ead6a00 · 2026-10-19 · merge: main al día en la rama del profe Matías
- 9063bae · 2026-10-19 · docs(breakpoint): deuda anotada por el Gate del panel de casa y la estética por cliente

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
| Documentos en `docs/` | 355 |
| Palabras en `docs/` | 612.144 |
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
