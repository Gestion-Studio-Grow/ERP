---
id: MP-4
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-4] Subagentes gastando de más (Opus por herencia)

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> **todo subagente declara su modelo explícitamente al despacharlo**; **Opus 5 está habilitado** para subagentes de juicio (investigación, síntesis, auditoría); Sonnet/Haiku sigue siendo el default para volumen; Gate GSG siempre Opus. ⚠️ Ojo con la relectura fácil: lo que costó los US$ ~37 fue el modelo **accidental** (herencia sin que nadie lo eligiera), no el tier. La prohibición total curaba el síntoma y de paso mataba el caso legítimo.

**Lección:** el grunt work paralelo **no necesita Opus** — sigue siendo cierto.

## Detalle

- **Síntoma:** subagentes corriendo en **Opus por herencia** → gasto tirado (US$ ~37 medidos).
- **Causa raíz:** el subagente hereda el modelo del padre por default.
- **Fix (original, 2026-07):** subagentes en **Sonnet/Haiku**; Opus solo para el alto juicio y el Gate.
- **Lección:** el grunt work paralelo **no necesita Opus** — sigue siendo cierto.
- **Guardarraíl (actualizado 2026-08-11, enmienda ADR-032):** **todo subagente declara su modelo
  explícitamente al despacharlo**; **Opus 5 está habilitado** para subagentes de juicio (investigación,
  síntesis, auditoría); Sonnet/Haiku sigue siendo el default para volumen; Gate GSG siempre Opus.
  ⚠️ Ojo con la relectura fácil: lo que costó los US$ ~37 fue el modelo **accidental** (herencia sin que
  nadie lo eligiera), no el tier. La prohibición total curaba el síntoma y de paso mataba el caso legítimo.
- **Refs:** ADR-032 (+ enmienda 2026-08-11), `docs/organizacion/factory-reforzada.md`.


## Decisiones relacionadas

- [ADR-032](../30-decisiones/ADR-032.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
