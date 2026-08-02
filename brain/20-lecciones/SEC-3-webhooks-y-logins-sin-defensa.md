---
id: SEC-3
categoria: SEC
tipo: leccion
generado: true
tags: [brain/leccion, leccion/sec]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [SEC-3] Webhooks y logins sin defensa

**Categoría:** Seguridad

> 🛡️ **Guardarraíl (la regla verificable):**
> verificar **firma** de todo webhook; **rate-limit** en endpoints de auth y API pública.

**Lección:** toda superficie pública necesita **autenticación de origen** y **límite de tasa**.

## Detalle

- **Síntoma:** superficies expuestas (webhook de pago, login) sin verificación ni límite.
- **Causa raíz:** faltaba firma de webhook y rate-limit.
- **Fix:** **firma del webhook MP** (`MP_WEBHOOK_SECRET`) + **rate-limit** en logins (hardening).
- **Lección:** toda superficie pública necesita **autenticación de origen** y **límite de tasa**.
- **Guardarraíl:** verificar **firma** de todo webhook; **rate-limit** en endpoints de auth y API pública.
- **Refs:** memoria Célula 2 hardening.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
