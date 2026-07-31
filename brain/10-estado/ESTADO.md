---
tipo: estado
generado: true
tags: [brain/estado, fase-0]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧠 Estado — la foto derivada del repo

> Esto **no se escribe a mano**: sale de `git` + `prisma/migrations/` + `docs/`. Por eso no puede
> driftear (la causa de la lección **MP-12**). Es el arranque de la **Fase 0** de `CLAUDE.md`:
> leé esto en vez de `docs/ESTADO-ACTUAL.md` salvo que necesites el detalle narrativo.

## Git

| Campo | Valor |
|---|---|
| Rama actual | `claude/token-saving-brain-clients-5rur0j` |
| HEAD | `7341ae2` (2026-07-31) |
| Árbol | **4 archivo(s) sin commitear** |

**Últimos commits**

- 7341ae2 · 2026-07-31 · feat(brain): segundo cerebro — vault de notas atómicas derivado del repo (Fase 0 a ~15% del costo)
- d5185e1 · 2026-07-13 · Merge fix/fiscal-master-key-runtime — lectura runtime robusta de FISCAL_MASTER_KEY + diagnóstico sin exponer valor
- ee25ed2 · 2026-07-13 · fix(fiscal): endurecer lectura runtime de FISCAL_MASTER_KEY + diagnóstico sin exponer valor
- 1d48135 · 2026-07-13 · test(shine): actualizar contrato de orden de secciones tras edición de densidad
- 15a8ddd · 2026-07-13 · Merge diseno/shine-resumido — densidad del front de Shine: colección comprable primero (producto+precio a ~1.7 pantallas mobile) + fix overflow hero mobile
- fc0dede · 2026-07-13 · Merge ci/senal-verde — vallas del gate en jobs separados (visual/visual-aa BLOQUEANTES; lint no-bloqueante) + fix contraste badge 'Por kg' (ADR-040)
- c14f2c7 · 2026-07-13 · feat(shine): edición de densidad del front — el producto y el precio, primero
- eb60f0c · 2026-07-13 · ci(gates): destrabar la señal — vallas en jobs separados; visual/visual-aa BLOQUEANTES
- a6b96a5 · 2026-07-13 · Merge operador/reset-password — reset de contraseña del OWNER con revelado único + cambio forzado + modo masivo
- 5a4dd41 · 2026-07-13 · feat(operador): modo "Resetear TODOS los OWNER (primer uso)" con tabla revelada una sola vez
- ef5b81a · 2026-07-13 · feat(operador): reset de contraseña del OWNER con revelado único + cambio forzado
- b276a28 · 2026-07-12 · docs(handoff): aclaración del dueño — NO hay core-redesign pendiente

## Migraciones (Prisma)

- **Total en el repo:** 40
- **Últimas 5:** `20260710120000_invoice_origin_idempotency_unique` · `20260711120000_add_bancos_importacion` · `20260711140000_add_cartera_cliente` · `20260711140000_add_tenant_fiscal_credential` · `20260712120000_sprint_entregable_concurrency_guards`

> ⚠️ **Colisión de timestamp** — dos migraciones comparten prefijo, así que el orden de
> aplicación depende del desempate alfabético. Revisar antes de cualquier Gate 2:
> - `20260711140000` → `20260711140000_add_cartera_cliente` + `20260711140000_add_tenant_fiscal_credential`

> **Aplicado en Neon = NO verificable desde el repo.** Este bloque dice qué migraciones *existen*,
> no cuáles corrieron. Confirmar con el dueño (Gate 2, `CLAUDE.md`).

## Corpus de conocimiento

| Fuente | Volumen |
|---|---:|
| Documentos en `docs/` | 297 |
| Palabras en `docs/` | 425.827 |
| ADRs | 81 |
| Nodos en el grafo | 87 |

## Superficies con front propio

- `Magra`
- `Shine`

---

**Detalle narrativo:** [ESTADO-ACTUAL.md](../../docs/ESTADO-ACTUAL.md) · **Roadmap:** [ESTADO-Y-ROADMAP.md](../../docs/ESTADO-Y-ROADMAP.md) · **Decisiones:** [índice](../30-decisiones/000-INDICE.md) · **Guardarraíles:** [índice](../20-lecciones/000-INDICE.md)
