---
tipo: estado
generado: true
generado_el: 2026-10-18 20:29 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-18 20:29 UTC sobre `eb4420a`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/ch-nivel-bp` |
| HEAD | `eb4420a` (2026-10-18) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | _no disponible (este clon no trae `main` local)_ |

**Ramas locales (2, más reciente primero):** `claude/ch-nivel-bp` · `claude/sleepy-tesla-392rov`

**Últimos commits**

- eb4420a · 2026-10-18 · merge: claude/sleepy-tesla-392rov (base del UAT 16/10 al día) en claude/ch-nivel-bp
- 86906c9 · 2026-10-18 · fix(ch): observaciones del Gate (M1–M11) y E2 sin regla inventada
- ac9a0d1 · 2026-10-18 · docs(ch): UAT en producción por rol, matriz de eventualidades y cierre del frente nivel Break Point [sin-deploy]
- 944933a · 2026-10-18 · test(ch): recorrido E2E del UAT de CH contra Postgres local (npm run test:ch-uat)
- bf4d03a · 2026-10-18 · fix(ch): turnos al nivel de Break Point — cobro con la caja cerrada, «no vino», ficha de la profesional, grilla y agenda práctica (apagada)
- 96bfe4a · 2026-10-18 · docs(ch): la factura del saldo del turno, lista para que decida la contadora (opción A preparada, B con migración)
- 6bcca73 · 2026-10-18 · merge: main al día en la versión candidata del UAT 16/10 antes de publicar
- 33efe9a · 2026-10-18 · docs(breakpoint): cómo correr el turnero con la hora de Argentina y el Gate del 18/10 [preview]
- 540cd1d · 2026-10-18 · fix(breakpoint): PIN por rol — el viejo de 2 no firma, un solo tope de intentos y PIN fáciles afuera (Gate M1–M7)
- ce3891c · 2026-10-18 · feat(breakpoint): PIN de 4 dígitos para los dueños y 2 para recepción, sin dejar afuera a los PIN viejos [sin-deploy]
- 55554a5 · 2026-10-17 · fix(breakpoint): re-Gate del archivado — doble clic, archivo ilegible y respaldo verificado [sin-deploy]
- b3d2529 · 2026-10-17 · fix(breakpoint): archivar y borrar copias sólo con el archivo descargado y verificado — Gate B1 + M1–M7 [sin-deploy]

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
| Documentos en `docs/` | 342 |
| Palabras en `docs/` | 566.468 |
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
