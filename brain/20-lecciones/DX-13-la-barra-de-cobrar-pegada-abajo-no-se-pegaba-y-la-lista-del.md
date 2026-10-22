---
id: DX-13
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-13] La barra de «Cobrar» pegada abajo no se pegaba, y la lista del buscador la tapaba

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> `npm run test:mostrador-e2e` mide «Cobrar» sin desplazar en 360 a 1920 px y elige productos con Enter. En los E2E, el «Cobrar» del mostrador se busca dentro de `form[data-vender="mostrador"]`: la bandeja tiene su propio «Cobrar» por pedido. - Un formulario de página completa no se mete en un cajón: hereda los cortes por ancho de PANTALLA y, en un cajón de 30rem a 1024 px, sus dos columnas quedaban en `0px 415px`. Con «Diseño nuevo», «Cobrar en el mostrador» lleva a Vender entero (lo marcó el Gate, no la suite). - Con la venta vacía la barra no se fija (`data-fijo`): en un celular de 5" tapaba el buscador, que es el primer paso (WCAG 2.4.11, foco tapado).

**Lección:** «se ve en la captura» no alcanza: hay que medir que el botón esté a la vista arriba de todo y hacer el recorrido con teclado como el cajero. El E2E lo agarró; los tests unitarios no podían.

## Detalle

- **Síntoma:** al unificar el mostrador de Pedidos con Vender (dos columnas en pantalla ancha), en el celular el
  total y «Cobrar» aparecían recién al bajar hasta el final. Y al cargar un peso y apretar Enter, el buscador del
  renglón siguiente abría su lista encima de la barra: tocar «Efectivo» elegía un corte.
- **Causa raíz:** `position: sticky` se pega sólo dentro de su padre; la columna de cobro (el padre) empezaba al final
  del formulario. La lista del buscador (z-20) quedaba por encima de la barra (z-10). Además, en la columna angosta
  de 1024 px los renglones usaban cortes por ancho de pantalla y el nombre del producto quedaba en cero.
- **Fix:** la columna de cobro es `contents` hasta `lg` (la barra se pega a lo largo de todo el formulario); la barra
  va en z-20, después en el DOM, así gana; los renglones usan container queries (`@container`/`@md:`).
- **Lección:** «se ve en la captura» no alcanza: hay que medir que el botón esté a la vista arriba de todo y hacer
  el recorrido con teclado como el cajero. El E2E lo agarró; los tests unitarios no podían.
- **Guardarraíl:** `npm run test:mostrador-e2e` mide «Cobrar» sin desplazar en 360 a 1920 px y elige productos con
  Enter. En los E2E, el «Cobrar» del mostrador se busca dentro de `form[data-vender="mostrador"]`: la bandeja tiene
  su propio «Cobrar» por pedido.
  - Un formulario de página completa no se mete en un cajón: hereda los cortes por ancho de PANTALLA y, en un
    cajón de 30rem a 1024 px, sus dos columnas quedaban en `0px 415px`. Con «Diseño nuevo», «Cobrar en el
    mostrador» lleva a Vender entero (lo marcó el Gate, no la suite).
  - Con la venta vacía la barra no se fija (`data-fijo`): en un celular de 5" tapaba el buscador, que es el
    primer paso (WCAG 2.4.11, foco tapado).
- **Refs:** `src/app/admin/(dashboard)/vender/VenderForm.tsx`; `src/tenants/magra/e2e/mostrador.e2e.mjs`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
