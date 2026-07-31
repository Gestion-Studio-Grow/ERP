---
id: PD-3
categoria: PD
tipo: leccion
generado: true
tags: [brain/leccion, leccion/pd]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [PD-3] Cron horario rompe el deploy en Vercel Hobby

**Categoría:** Prod / Deploy

> 🛡️ **Guardarraíl (la regla verificable):**
> en Hobby, **cron diario**; si hace falta sub-diario → **parar y avisar** (es gasto).

**Lección:** el plan free tiene límites que rompen el deploy, no solo el runtime.

## Detalle

- **Síntoma:** el deploy falla al configurar un cron `0 * * * *`.
- **Causa raíz:** Vercel **Hobby** no permite cron sub-diario.
- **Fix:** cron **diario** (`0 12 * * *`).
- **Lección:** el plan free tiene límites que rompen el deploy, no solo el runtime.
- **Guardarraíl:** en Hobby, **cron diario**; si hace falta sub-diario → **parar y avisar** (es gasto).
- **Refs:** `docs/metodologia/demo-publica-costo-cero.md` (errores típicos).

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
