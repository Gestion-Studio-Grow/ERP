---
id: DX-12
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-12] Una etiqueta de balanza se puede leer bien de dos maneras, y la equivocada cobra otro producto

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> - La detección pide una segunda etiqueta, o el número del producto, cuando hay empate. - El peso por cable se recuerda en la PC recién cuando la persona confirma en el asistente que coincide con la balanza. Una lectura en gramos tomada como kilos cobra diez veces de más. - Un ítem nuevo del menú (`ALL_ITEMS`) necesita su grupo en `nav-groups.ts`. Los recorridos E2E no lo detectan; la suite completa sí.

**Lección:** cuando no se conoce la marca, el dato que manda es el del local: una etiqueta real, el peso que marcó y el número del producto. Un formato «más común» es una suposición.

## Detalle

- **Síntoma:** en el recorrido de «Balanza y lector» (20/10/2026), el detector propuso primero un formato sin control
  del precio para una etiqueta que sí lo traía. La etiqueta se leía «bien» (el importe cerraba), pero el dígito de
  control quedaba pegado al número del producto. Con ese formato guardado, el lector no encontraba el producto.
- **Causa raíz:** con una sola etiqueta, los dos formatos dan el mismo importe. El orden «el más común primero» elegía
  el que no era.
- **Fix:** con dos etiquetas o más, si el control cierra en todas, gana el formato con control (que coincida por azar
  es 1 en 100). Además hay un campo opcional, «número del producto en la balanza», que desempata del todo.
- **Lección:** cuando no se conoce la marca, el dato que manda es el del local: una etiqueta real, el peso que marcó y
  el número del producto. Un formato «más común» es una suposición.
- **Guardarraíl:**
  - La detección pide una segunda etiqueta, o el número del producto, cuando hay empate.
  - El peso por cable se recuerda en la PC recién cuando la persona confirma en el asistente que coincide con la
    balanza. Una lectura en gramos tomada como kilos cobra diez veces de más.
  - Un ítem nuevo del menú (`ALL_ITEMS`) necesita su grupo en `nav-groups.ts`. Los recorridos E2E no lo detectan;
    la suite completa sí.
- **Refs:** `src/lib/supermercado/balanza-deteccion.ts`; `npm run test:balanza-e2e`; `docs/producto/balanzas-relevamiento.md`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
