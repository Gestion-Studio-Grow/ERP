---
id: DX-10
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-10] Un lector que "tipea" mientras el cobro anterior todavía no volvió

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> toda entrada automática al ticket pasa por una función pura que recibe el estado del cobro (`en vuelo | en duda | libre`) y se testea el caso "leer durante el cobro" antes de integrarla.

**Lección:** una entrada de datos que no espera al usuario (lector, balanza, ráfaga) tiene que conocer **todos** los estados de la pantalla, incluido el envío en vuelo; si no, el próximo cliente entra al ticket del anterior.

## Detalle

- **Síntoma:** el Gate de las terminales de mostrador (16/10/2026) encontró que en `/vender`, con la ráfaga del lector
  activa, un código leído mientras el cobro anterior esperaba respuesta sonaba "ok", se sumaba al ticket y `limpiar()`
  lo borraba al volver el cobro: el producto se entregaba sin cobrar.
- **Causa raíz:** el guardarraíl miraba sólo los estados de cobro "en duda" (sin respuesta / ya grabada), no el envío
  **en vuelo**. La caja con lector no lo tenía porque bloquea con `cobrando`.
- **Fix:** `motivoParaNoSumar` (puro, testeado, `src/lib/terminal/lector-core.ts`) y una marca de punta a punta con
  `try/finally` en el submit: durante el cobro, lo que pasa el lector se rechaza con «Esperá que termine el cobro».
- **Lección:** una entrada de datos que no espera al usuario (lector, balanza, ráfaga) tiene que conocer **todos** los
  estados de la pantalla, incluido el envío en vuelo; si no, el próximo cliente entra al ticket del anterior.
- **Guardarraíl:** toda entrada automática al ticket pasa por una función pura que recibe el estado del cobro
  (`en vuelo | en duda | libre`) y se testea el caso "leer durante el cobro" antes de integrarla.
- **Refs:** `docs/producto/PLAN-TERMINALES-MOSTRADOR.md` (T-2); commit `222ad87c`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
