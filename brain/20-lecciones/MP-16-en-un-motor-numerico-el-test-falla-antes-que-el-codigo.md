---
id: MP-16
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-16] En un motor numérico, el test falla antes que el código

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> ante un test rojo en un motor de cálculo: **(1)** verificar la afirmación contra la fuente del dominio, **(2)** recién si la afirmación resiste, buscar el bug, **(3)** nunca debilitar un test ni ajustar un oráculo para que cierre. Y: **no afirmar nada sobre nodos/ramas que el equilibrio nunca visita** — ahí la estrategia no está determinada y el test no prueba nada.

**Lección:** en dominios con teoría propia, un test rojo es primero una hipótesis sobre el test. "Ajustar" el motor para que pase habría **destruido** comportamiento correcto y sofisticado.

## Detalle

- **Síntoma:** tres tests seguidos en rojo en el PoC de poker. En los tres casos **el código estaba bien y
  la afirmación del test estaba mal**: (a) se asumió que una mano de 7 naipes podía ser color y full a la
  vez (es imposible por conteo); (b) se escribió que en Kuhn se defiende la reina `1/3` cuando la teoría
  publicada dice `α + 1/3`; (c) se afirmó que el solver iba a apostar las nuts, cuando con desventaja de
  rango el equilibrio es **pasar y tender una trampa**.
- **Causa raíz:** confundir "lo que yo esperaba" con "lo que dice la teoría del dominio". En un motor
  numérico la intuición del que escribe el test es la parte más débil de la cadena.
- **Fix aplicado:** en cada caso se verificó la afirmación contra la fuente (conteo combinatorio,
  literatura de Kuhn, teoría de rangos polarizados) **antes** de tocar el motor; el motor no se cambió.
- **Lección:** en dominios con teoría propia, un test rojo es primero una hipótesis sobre el test.
  "Ajustar" el motor para que pase habría **destruido** comportamiento correcto y sofisticado.
- **Guardarraíl:** ante un test rojo en un motor de cálculo: **(1)** verificar la afirmación contra la
  fuente del dominio, **(2)** recién si la afirmación resiste, buscar el bug, **(3)** nunca debilitar un
  test ni ajustar un oráculo para que cierre. Y: **no afirmar nada sobre nodos/ramas que el equilibrio
  nunca visita** — ahí la estrategia no está determinada y el test no prueba nada.
- **Refs:** `productos/poker-solver/test/river.test.mjs` (test de la trampa), `test/kuhn.test.mjs`.



---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
