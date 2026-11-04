---
id: DX-14
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-14] El mostrador de CH «no tenía» profesional, seña ni cupón: vivían en la otra solapa

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> - `npm run test:ch-mostrador-e2e` recorre el servicio por tarjeta hasta el turno cobrado y el producto hasta la factura. - La piel de un negocio vive en `globals.css` y `renglon.css` SIN capa: una utilidad de Tailwind no les gana. Para el acento del elegido o el total hace falta `!`, o la variante `in-data-[estetica=…]` para que sea sólo suyo. - Un formulario dentro del cajón mide la PANTALLA: en el cajón va en una columna y el pie de cobro fijo.

**Lección:** antes de unificar, una matriz de paridad con `archivo:línea` por función (qué campo, qué action, qué exige). Sin ella se migra de más (romper el alta del turno) o de menos (perder la seña).

## Detalle

- **Síntoma:** al pasar CH al mostrador único, la lista de lo que hacía su PosForm decía profesional, seña, cupón y
  vínculo con el turno. Mirado en el código, PosForm sólo vendía productos: todo eso es del alta del turno
  (NewAppointmentForm), en la solapa «Servicios».
- **Causa raíz:** se describía la pantalla («el mostrador de CH») y no el formulario que hace cada cosa.
- **Fix:** «Productos» pasa al mostrador único; «Servicios» queda con su alta del turno y suma tarjetas por servicio
  (duración, precio y quién lo hace) que completan las mismas listas. Nada se reescribe dos veces.
- **Lección:** antes de unificar, una matriz de paridad con `archivo:línea` por función (qué campo, qué action, qué
  exige). Sin ella se migra de más (romper el alta del turno) o de menos (perder la seña).
- **Guardarraíl:**
  - `npm run test:ch-mostrador-e2e` recorre el servicio por tarjeta hasta el turno cobrado y el producto hasta la
    factura.
  - La piel de un negocio vive en `globals.css` y `renglon.css` SIN capa: una utilidad de Tailwind no les gana. Para
    el acento del elegido o el total hace falta `!`, o la variante `in-data-[estetica=…]` para que sea sólo suyo.
  - Un formulario dentro del cajón mide la PANTALLA: en el cajón va en una columna y el pie de cobro fijo.
- **Refs:** `src/app/admin/(dashboard)/turnos/ServiciosEnTarjetas.tsx`; `src/tenants/ch/e2e/mostrador-ch.e2e.mjs`;
  `docs/tenants/ch/capturas/mostrador-unico/`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
