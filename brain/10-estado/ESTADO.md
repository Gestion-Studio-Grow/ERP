---
tipo: estado
generado: true
generado_el: 2026-10-16 17:30 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-10-16 17:30 UTC sobre `7db83f5`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `ccr-f8859297-5ru6oe` |
| HEAD | `7db83f5` (2026-10-16) |
| Árbol | limpio _(sin contar `brain/`)_ |
| Tip de `main` | 7db83f5 · 2026-10-16 · docs(breakpoint): el UAT parte B da 42/42 con el caso de D41 [sin-deploy] |

**Ramas locales (2, más reciente primero):** `ccr-f8859297-5ru6oe` · `main`

**Últimos commits**

- 7db83f5 · 2026-10-16 · docs(breakpoint): el UAT parte B da 42/42 con el caso de D41 [sin-deploy]
- 0baa078 · 2026-10-16 · fix(breakpoint): Gate de 60ec502f — el UAT parte B corre fuera de este entorno
- 60ec502 · 2026-10-16 · fix(breakpoint): UAT parte B (accesos, bloqueo, pedidos) 41/41 + D40–D42
- 6d906b6 · 2026-10-16 · docs(breakpoint): estado de los arreglos D35–D39 en el resultado del UAT
- 850e4c4 · 2026-10-16 · fix(breakpoint): Gate S1 — un robo del lock mientras se espera la foto no deja dos servidores
- 14d2a52 · 2026-10-16 · fix(breakpoint): Gate de D35–D39 — ids sin choques tras la toma de posta y robustez del bus
- bf60835 · 2026-10-16 · fix(breakpoint): defectos del UAT en producción D35–D39
- 786abed · 2026-10-16 · Merge remote-tracking branch 'origin/ccr-breakpoint-turnero' into ccr-63ed11dc-brcdpp
- c00b920 · 2026-10-15 · docs(breakpoint): resultado del UAT en producción del 15/10 — D35–D39
- 35c302f · 2026-10-15 · docs(breakpoint): guion de UAT en producción con matriz de acceso por usuario [sin-deploy]
- 21cf0de · 2026-10-15 · fix(breakpoint): el cargo manual pide «Poné el monto» (ya hay selector Cargo/Descuento)
- 91ca3fd · 2026-10-15 · fix(breakpoint): hallazgos del Gate — un descuento no se pasa de cuenta y el destino no queda bajo lo pagado

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
| Documentos en `docs/` | 336 |
| Palabras en `docs/` | 554.521 |
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
