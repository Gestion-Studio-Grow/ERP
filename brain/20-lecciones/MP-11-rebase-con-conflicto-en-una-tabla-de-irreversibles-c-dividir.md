---
id: MP-11
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-11] Rebase con conflicto en una TABLA de irreversibles (§C): dividir la fila, no pisarla

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> conflicto en una tabla/lista con IDs → **antes de resolver, leer qué concepto describe cada lado**; si son distintos, **conservar ambos y renumerar** (como la colisión de ADR de MP-10); actualizar las referencias cruzadas. Nunca `checkout --ours/--theirs` sobre filas de `§C`.

**Lección:** en un conflicto sobre una **lista/tabla enumerada** (irreversibles, ADRs, tenants), el choque casi nunca es "misma cosa, dos versiones" sino "**dos cosas, mismo número**" → la resolución correcta es **renumerar y conservar ambas**, no elegir una. Es el mismo reflejo que MP-10 (diff primero, integrá el delta) pero a nivel fila.

## Detalle

- **Síntoma:** al rebasar `frente/diseno-vidrieras` (F1) sobre `main`, el único conflicto fue en `docs/ESTADO-ACTUAL.md §C`, dos veces, ambos sobre la **misma fila `I7`**: `main` la usaba para "material real de Shine/ADM" y F1 para "autorización de marca ADR-042". Tomar un lado a ciegas **perdía un irreversible entero** del otro.
- **Causa raíz:** dos frentes numeraron **conceptos distintos** con el mismo ID de fila (`I7`) en una tabla compartida; un `accept ours/theirs` los trata como el mismo ítem.
- **Fix:** **surface-before-overwrite aplicado a la fila** — se conservó el `I7` de `main` (material) y se **agregó** el de F1 como **`I8`** (autorización, marcada ✅ otorgada 2026-07-07), con las dependencias cruzadas escritas explícitas (I7 "atado a la autorización I8"). Cero pérdida de contenido de ninguno de los dos lados. Vallas (tsc + 559 tests + build) + Gate (Opus) antes del merge FF a `main` (`debb3c5`).
- **Lección:** en un conflicto sobre una **lista/tabla enumerada** (irreversibles, ADRs, tenants), el choque casi nunca es "misma cosa, dos versiones" sino "**dos cosas, mismo número**" → la resolución correcta es **renumerar y conservar ambas**, no elegir una. Es el mismo reflejo que MP-10 (diff primero, integrá el delta) pero a nivel fila.
- **Guardarraíl:** conflicto en una tabla/lista con IDs → **antes de resolver, leer qué concepto describe cada lado**; si son distintos, **conservar ambos y renumerar** (como la colisión de ADR de MP-10); actualizar las referencias cruzadas. Nunca `checkout --ours/--theirs` sobre filas de `§C`.
- **Refs:** MP-10 (renumerar en colisión), ADR-040 (Gate), ADR-048 (irreversibles); `docs/estrategia/F1-vidrieras-calibracion-y-gate-adr042.md`.

## Decisiones relacionadas

- [ADR-040](../30-decisiones/ADR-040.md)
- [ADR-042](../30-decisiones/ADR-042.md)
- [ADR-048](../30-decisiones/ADR-048.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
