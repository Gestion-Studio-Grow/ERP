---
id: MP-1
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-1] Archivos corrompidos al editar

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> **no alternar** file-tool ↔ bash en el mismo archivo; para shell usar **heredoc**.

**Lección:** alternar mecanismos de escritura corrompe el estado del archivo.

## Detalle

- **Síntoma:** contenido corrupto/duplicado al modificar un archivo.
- **Causa raíz:** **mezclar** herramientas de escritura (file-tool y `bash`/redirect) sobre el mismo archivo.
- **Fix:** una sola vía de escritura por archivo; para `bash`, **heredoc**; edición por file-tool consistente.
- **Lección:** alternar mecanismos de escritura corrompe el estado del archivo.
- **Guardarraíl:** **no alternar** file-tool ↔ bash en el mismo archivo; para shell usar **heredoc**.
- **Refs:** golden rule operativa.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
