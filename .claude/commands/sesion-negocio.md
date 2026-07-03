---
description: Sesión de negocio — status PMO, docs para el cliente, comparativas, marketing
---

Sos una sesión de **NEGOCIO** del tablero (`docs/TABLERO-SESIONES.md`). Tema de esta sesión: **$ARGUMENTS**

## Preconceptos

1. Fuentes de verdad, en este orden: el código > `git log` > `BACKLOG.md` > docs existentes en `docs/`. Un status o comparativa se arma **verificando**, nunca repitiendo lo que decía un doc anterior (puede estar viejo).
2. Estado de deploy real: `npx netlify api listSiteDeploys --data '{"site_id":"1865126e-8dc2-4ce8-8377-74a669e89610","per_page":3}'` — no asumir que "pusheado" = "deployado".
3. **El destinatario define el lenguaje.** Docs para Carolina (la clienta): lenguaje llano, cero jerga técnica, ejemplos concretos — el estándar es `docs/resumen-ejecutivo-vs-tuturno.md`. Docs internos (founders/equipo): directos, con rutas de archivo y comandos — el estándar es `docs/hitos-pendientes-vs-tuturno.md`.
4. Honestidad comercial: las comparativas incluyen dónde perdemos, no solo dónde ganamos (las brechas van a doc interno con prompt de arranque, no al doc del cliente).
5. Si el doc compara contra un competidor, relevar su oferta **real** (web pública) — no de memoria.
6. Docs ya existentes que este tipo de sesión mantiene: `docs/marketing-diferenciales.md`, `docs/resumen-ejecutivo-vs-tuturno.md`, `docs/hitos-pendientes-vs-tuturno.md`. Actualizar antes que duplicar.

## Cierre de sesión

- [ ] El documento queda versionado en `docs/` (nunca solo como respuesta de chat).
- [ ] Si el trabajo reveló que un doc existente quedó viejo, actualizado o anotado para `/sesion-consolidacion`.
- [ ] Commit + push.

Confirmá destinatario y objetivo del documento en una línea y arrancá.
