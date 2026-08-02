---
id: PD-2
categoria: PD
tipo: leccion
generado: true
tags: [brain/leccion, leccion/pd]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [PD-2] Deploy/migración corridos "solos"

**Categoría:** Prod / Deploy

> 🛡️ **Guardarraíl (la regla verificable):**
> **nunca** deploy ni `migrate deploy` sin OK explícito; lo irreversible se **eleva** (ADR-048/049).

**Lección:** push a GitHub es libre; **publicar y tocar la DB son acción humana del dueño**.

## Detalle

- **Síntoma:** riesgo de publicar o migrar prod sin querer.
- **Causa raíz:** confundir "push a `main`" con "deploy"; ambos son cosas distintas.
- **Fix:** Gate 1 (deploy = *"deployá"* del dueño) y Gate 2 (`migrate deploy` = OK Neon del dueño).
- **Lección:** push a GitHub es libre; **publicar y tocar la DB son acción humana del dueño**.
- **Guardarraíl:** **nunca** deploy ni `migrate deploy` sin OK explícito; lo irreversible se **eleva** (ADR-048/049).
- **Refs:** ADR-048, ADR-049, `CLAUDE.md` → "Autorización y gates".


## Decisiones relacionadas

- [ADR-048](../30-decisiones/ADR-048.md)
- [ADR-049](../30-decisiones/ADR-049.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
