---
id: DX-1
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-1] Cómo mostrar el backoffice sin fricción (J-1/J-3)

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> demo = **FASE 1 sin secretos**; **toggle de persistencia** separa demo de operación; **nunca datos reales** en demo.

**Lección:** la demo navegable exige backoffice **accesible sin fricción pero aislado** (sin datos reales).

## Detalle

- **Síntoma:** el prospecto no podía navegar el backoffice de demo (o requería password).
- **Causa raíz:** la demo mezclaba "operación real" (login/datos) con "mostrar el producto".
- **Fix:** **backoffice-demo sin password + datos ficticios + toggle de persistencia**; puerta visible `/probar` + banner gateado por flag (commit `43aab61`), fixtures por rubro.
- **Lección:** la demo navegable exige backoffice **accesible sin fricción pero aislado** (sin datos reales).
- **Guardarraíl:** demo = **FASE 1 sin secretos**; **toggle de persistencia** separa demo de operación; **nunca datos reales** en demo.
- **Refs:** ADR-031, ADR-041; QA J-1/J-3.

## Decisiones relacionadas

- [ADR-031](../30-decisiones/ADR-031.md)
- [ADR-041](../30-decisiones/ADR-041.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
