---
id: PD-1
categoria: PD
tipo: leccion
generado: true
tags: [brain/leccion, leccion/pd]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [PD-1] Build de Vercel "colgado"

**Categoría:** Prod / Deploy

> 🛡️ **Guardarraíl (la regla verificable):**
> rutas públicas/demo **`force-static` sin DB**; **no matar** un build por lento — revisar logs antes.

**Lección:** build lento ≠ build roto; el prerender contra DB tarda.

## Detalle

- **Síntoma:** el build de Vercel parece colgado / no termina.
- **Causa raíz:** el **prerender de rutas que tocan la DB** es lento; no está colgado, está trabajando.
- **Fix:** entender que tarda; `/demo` es `force-static` (sin DB) para el primer link vivo.
- **Lección:** build lento ≠ build roto; el prerender contra DB tarda.
- **Guardarraíl:** rutas públicas/demo **`force-static` sin DB**; **no matar** un build por lento — revisar logs antes.
- **Refs:** ADR-031, `docs/metodologia/demo-publica-costo-cero.md`.

## Decisiones relacionadas

- [ADR-031](../30-decisiones/ADR-031.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
