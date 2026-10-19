---
id: DX-9
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-9] Una demo sin persistencia no aguanta un día real: recargar borra la jornada

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> - Toda demo que se vaya a usar de verdad tiene un modo real explícito: en blanco, guardado local, reloj real, bloqueo al recargar y respaldo. - El modo por defecto sigue siendo la demo, así los prospectos y los E2E no cambian. - Lo que no se puede sin servidor se dice en pantalla: sync entre equipos, reserva desde el celular del cliente y aprobación sin código.

**Lección:** antes de una prueba real, revisá tres cosas de la demo: **qué pasa al recargar**, **qué reloj usa** y **con qué datos arranca**. Las tres eran de demo.

## Detalle

- **Síntoma:** el club pidió una prueba de un día en el local (17/10/2026). La demo de `/club` arrancaba siempre con
  datos de ejemplo, un reloj simulado a las 19:10 y sin guardar nada. Un F5 en pleno torneo borraba la caja.
- **Causa raíz:** la demo a costo cero se diseñó para mostrar, no para operar. «Sin persistencia» es una regla de
  la preventa (no hay datos reales en el servidor), pero no significa «sin guardar en el dispositivo».
- **Fix:** el modo **jornada real** (`?modo=real`, que queda fijo en esa compu):
  - arranca en blanco con una consola de configuración, con los dueños sin PIN hasta que arman el suyo;
  - guarda solo en el navegador, con una sola pestaña (Web Locks) y respaldo descargable;
  - vuelve bloqueado al recargar y usa el reloj real, con la madrugada contada en el día que abrió.

  Sigue sin servidor ni base: costo cero y ninguna migración.
- **Lección:** antes de una prueba real, revisá tres cosas de la demo: **qué pasa al recargar**, **qué reloj usa**
  y **con qué datos arranca**. Las tres eran de demo.
- **Guardarraíl:**
  - Toda demo que se vaya a usar de verdad tiene un modo real explícito: en blanco, guardado local, reloj real,
    bloqueo al recargar y respaldo.
  - El modo por defecto sigue siendo la demo, así los prospectos y los E2E no cambian.
  - Lo que no se puede sin servidor se dice en pantalla: sync entre equipos, reserva desde el celular del cliente y
    aprobación sin código.
- **Refs:** `docs/tenants/breakpoint/DIA-DE-PRUEBA.md`; `npm run test:club-torneo`; DX-8.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
