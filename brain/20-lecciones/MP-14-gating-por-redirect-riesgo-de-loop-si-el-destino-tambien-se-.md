---
id: MP-14
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-14] Gating por redirect → riesgo de LOOP si el destino también se gatea

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> antes de enforcar gating con `redirect()`, mapear el destino para CADA rol y CADA combinación de módulos apagados; si algún destino puede estar gateado, no redirigir — usar 404/estado neutro o esconder. Nunca redirigir a la home del rol si esa home es gateable.

**Lección:** un guard que redirige necesita un destino **probadamente terminal** (accesible para todo rol/estado, nunca gateado). Ante la duda, **esconder > redirigir**: ocultar no puede loopear.

## Detalle

- **Síntoma:** al querer enforcar el gating de módulos a nivel URL (redirigir si el módulo está apagado), el destino natural (`/admin` o la home del rol) puede ser **otra página gateada** → loop. Caso concreto: `PROFESSIONAL` con `agenda` apagada → su home ES agenda → redirect infinito.
- **Causa raíz:** un guard que redirige sin garantizar que el destino sea SIEMPRE accesible para ese rol/estado. El gating por módulo no es barrera de seguridad (eso es el rol, ADR-017) — sumarlo como redirect encima del gating por rol crea combinaciones que hacen loop.
- **Fix (esta sesión):** **NO** se shippeó el URL-enforcement; se dejó el **nav-gating** (esconde el ítem, sin redirect → no loopea) como la UX entregada, y el URL-block quedó como follow-up con diseño loop-safe pendiente.
- **Lección:** un guard que redirige necesita un destino **probadamente terminal** (accesible para todo rol/estado, nunca gateado). Ante la duda, **esconder > redirigir**: ocultar no puede loopear.
- **Guardarraíl:** antes de enforcar gating con `redirect()`, mapear el destino para CADA rol y CADA combinación de módulos apagados; si algún destino puede estar gateado, no redirigir — usar 404/estado neutro o esconder. Nunca redirigir a la home del rol si esa home es gateable.
- **Refs:** ADR-017 (ocultar nav = UX; rol = seguridad), ADR-054/055, ADR-047 (retro).

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
