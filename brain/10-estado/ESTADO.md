---
tipo: estado
generado: true
generado_el: 2026-11-05 05:57 UTC
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> ⏱️ **Foto tomada el 2026-11-05 05:57 UTC sobre `b0dc696`.**
> No se escribe a mano: sale de `git` + `prisma/migrations/` + `docs/`, así que **al momento
> de generarla no puede estar desactualizada** (es la causa de la lección **MP-12**). Pero una
> vez commiteada envejece como cualquier archivo: **si la estás leyendo en GitHub o en el celular,
> mirá la fecha de arriba**. Para tenerla fresca: `npm run brain`.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/gsg-technology-options-i0wmqu` |
| HEAD | `b0dc696` (2026-11-05) |
| Árbol | **3 archivo(s) sin commitear** _(sin contar `brain/`)_ |
| Tip de `main` | ee193f1 · 2026-11-02 · MIA: ampliar y eliminar imágenes del Estudio, el agente propone las piezas, y consultas con espera sin respuesta humana, orden por demora, respuesta por otro canal y cliente reutilizado |

**Ramas locales (2, más reciente primero):** `claude/gsg-technology-options-i0wmqu` · `main`

**Últimos commits**

- b0dc696 · 2026-11-05 · docs(gobierno): política de modelos para todas las sesiones + advertencia del estado real del paquete S2 [sin-deploy]
- 5b2849d · 2026-11-05 · fix(agenda): certificación del pase 05/11 — editar turno detrás de «Agenda interactiva» y reprogramar mira profesional y servicio
- a907c7a · 2026-11-05 · Merge remote-tracking branch 'origin/claude/ch-venta-buscar-turnos' into claude/pase-agenda-ch
- 70eb121 · 2026-11-05 · docs(agenda): relevo — comisiones T1 hecha, falta certificar [sin-deploy]
- 163c75e · 2026-11-05 · docs(agenda): relevo — historia clínica con la auditoría estricta cerrada (d3a0f31) [sin-deploy]
- d453789 · 2026-11-05 · docs(agenda): relevo de la sesión — publicado, ramas listas, en curso y pendientes [sin-deploy]
- 1292dd5 · 2026-11-05 · test(agenda): e2e de Editar (servicio+hora → Guardar → Deshacer), WhatsApp del cajón y Pagos; verificado el wip de editar [sin-deploy]
- 19b937c · 2026-11-04 · feat(ch): Vender — un campo para servicio o producto; un servicio abre «Turnos libres» por profesional (agenda-interaccion) [sin-deploy]
- a33ce85 · 2026-11-04 · test(vender): turnos libres sin agenda:manage se ven sin tecla [sin-deploy]
- ceb0f3c · 2026-11-04 · wip: trabajo a medias rescatado tras reinicio del contenedor (sin verificar) [sin-deploy]
- ebac5d8 · 2026-11-04 · wip: trabajo a medias rescatado tras reinicio del contenedor (sin verificar) [sin-deploy]
- a98c867 · 2026-11-04 · fix(agenda): pulido a 375 — chips deslizables, barra 2x2, pie opaco del alta, una sola planilla montada

## Migraciones (Prisma)

- **Total en el repo:** 62
- **Últimas 5:** `20261101120000_modulo_proyectos` · `20261101130000_proyecto_gastos` · `20261101140000_proyecto_entregables` · `20261101150000_proyecto_gestion_eventos` · `20261102120000_consultas`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 398 |
| Palabras en `docs/` | 712.447 |
| ADRs | 88 |
| Nodos en el grafo | 94 _(los 88 ADR + 6 enmiendas)_ |

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
