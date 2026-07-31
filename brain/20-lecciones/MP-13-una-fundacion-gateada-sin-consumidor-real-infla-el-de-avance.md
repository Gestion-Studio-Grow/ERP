---
id: MP-13
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-13] Una fundación gateada SIN consumidor real infla el % de avance

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> al reportar % de una fundación/flag, distinguir **construido** de **consumido**; no contar "listo" una capa sin al menos un consumidor real cableado y verde.

**Lección:** una fundación recién "vale" cuando algo la usa; hasta entonces el % es aspiracional. El consumidor es el que descubre los huecos del contrato.

## Detalle

- **Síntoma:** la fundación de módulos (`src/modules/`, ADR-054) figuraba "implementada" pero nadie del backoffice la usaba; el % "listo" tapaba que faltaba lo que el dueño realmente ve (prender/apagar apps).
- **Causa raíz:** medir avance por "código escrito" y no por "consumido de punta a punta". Una fundación detrás de flag, sin UI ni cableado, es deuda oculta: no valida su propio diseño.
- **Fix:** cablear un **consumidor real** (la vidriera `/admin/modulos`) contra la fundación → obligó a exponer la superficie (`vista.ts`), probó variante+dependencias con datos reales y subió el % con evidencia (pantalla + tests + build), no con optimismo.
- **Lección:** una fundación recién "vale" cuando algo la usa; hasta entonces el % es aspiracional. El consumidor es el que descubre los huecos del contrato.
- **Guardarraíl:** al reportar % de una fundación/flag, distinguir **construido** de **consumido**; no contar "listo" una capa sin al menos un consumidor real cableado y verde.
- **Refs:** ADR-054 (repo de módulos), ADR-055 (variante), ADR-040 (Gate), ADR-047 (retro).

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
