---
id: MP-15
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-15] "Da el resultado correcto" no es evidencia de que esté bien

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> todo entregable **numérico o algorítmico** declara su **criterio de éxito medible** y lo **verifica contra una verdad externa** (solución analítica, oráculo de fuerza bruta, o segunda implementación independiente). Si no se puede medir contra algo externo, se dice explícitamente que **no está verificado** — no se afirma que anda. Corolario para umbrales: se fijan con el número **medido**, así una regresión de un orden de magnitud rompe el test.

**Lección:** un entregable puede dar el número correcto por el motivo equivocado. Lo que hay que medir es la **métrica que define "bien hecho"**, no el output que uno esperaba ver.

## Detalle

- **Síntoma:** un motor de cálculo (solver CFR del PoC de poker) devolvía **el valor exacto correcto**
  (−1/18 en Kuhn poker, verificado contra la solución analítica publicada) y sin embargo estaba mal
  construido: convergía como `1/√T` en vez de `1/T`, o sea dejaba **40× más plata sobre la mesa** con el
  mismo cómputo.
- **Causa raíz:** se validó el **resultado** (el valor del juego) y no el **criterio de éxito real** (la
  explotabilidad, o sea la distancia al equilibrio). Las dos versiones —la buena y la mala— daban el
  mismo valor, así que el error era **invisible** para el test que había.
- **Fix aplicado:** medir explotabilidad por mejor respuesta en cada solve, con umbral **medido** (no
  aspiracional) en el test; y actualizaciones alternadas de CFR+ en vez de simultáneas.
- **Lección:** un entregable puede dar el número correcto por el motivo equivocado. Lo que hay que medir
  es la **métrica que define "bien hecho"**, no el output que uno esperaba ver.
- **Guardarraíl:** todo entregable **numérico o algorítmico** declara su **criterio de éxito medible** y
  lo **verifica contra una verdad externa** (solución analítica, oráculo de fuerza bruta, o segunda
  implementación independiente). Si no se puede medir contra algo externo, se dice explícitamente que
  **no está verificado** — no se afirma que anda. Corolario para umbrales: se fijan con el número
  **medido**, así una regresión de un orden de magnitud rompe el test.
- **Refs:** `productos/poker-solver/README.md`, `docs/estrategia/poker-solver-dictamen.md` §4.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
