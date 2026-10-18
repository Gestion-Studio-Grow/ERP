---
id: DX-10
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-10] Los tests unitarios estaban verdes y el Inicio igual mostraba como plata un pedido sin cobrar

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> - Todo tenant que sale a producción tiene su guion de UAT con matriz por rol, y su recorrido E2E repetible contra `next start` y Postgres local, nunca Neon. Modelo: `test:club-uat` y `test:magra-uat`. - Toda cifra de plata en una pantalla usa el `where` o la tabla de signos compartida. No se arma una lista propia de tipos «que entran».

**Lección:** antes de decir que algo está listo para producción, hay que recorrerlo como lo usa el cliente, sobre la app compilada y con datos reales en forma (pedido web, venta, caja abierta y cierre), y no sólo correr la suite. Cuando una pantalla muestra plata, el número sale de la misma función que usan las demás pantallas.

## Detalle

- **Síntoma:** en el UAT de MAGRA del 18/10/2026, con la suite verde (4962 tests), el recorrido clic por clic encontró dos
  cosas que se veían mal en pantalla. El Inicio sumaba en «Ingresos hoy» el pedido de la tienda recién entrado, sin pesar
  ni cobrar. Y el cierre del día pintaba la apertura del turno en la columna «Ingreso», sin sumarla, así que la columna
  no daba lo que decía el cuadro.
- **Causa raíz:** cada pantalla armaba su propio criterio de «lo que entra», en vez de usar la regla que ya existía y
  tenía test: `whereVentasCobradasConMedio` para las ventas y `movementSign` para la caja. Los tests probaban la regla,
  no que la pantalla la usara.
- **Fix:** las dos pantallas usan la regla compartida. Se sumó un test contra Postgres con RLS que falla con el código
  viejo, y un test que verifica que el cierre usa `movementSign`. Además quedó un recorrido repetible
  (`npm run test:magra-uat`), con la app de producción (`next start`) sobre una base local sembrada, que falla ante
  cualquier error de consola.
- **Lección:** antes de decir que algo está listo para producción, hay que recorrerlo como lo usa el cliente, sobre la
  app compilada y con datos reales en forma (pedido web, venta, caja abierta y cierre), y no sólo correr la suite.
  Cuando una pantalla muestra plata, el número sale de la misma función que usan las demás pantallas.
- **Guardarraíl:**
  - Todo tenant que sale a producción tiene su guion de UAT con matriz por rol, y su recorrido E2E repetible contra
    `next start` y Postgres local, nunca Neon. Modelo: `test:club-uat` y `test:magra-uat`.
  - Toda cifra de plata en una pantalla usa el `where` o la tabla de signos compartida. No se arma una lista propia de
    tipos «que entran».
- **Refs:** `docs/tenants/magra/UAT-PRODUCCION.md`; `src/tenants/magra/e2e/`; `src/lib/inicio-mostrador-postgres.test.ts`; DX-8.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
