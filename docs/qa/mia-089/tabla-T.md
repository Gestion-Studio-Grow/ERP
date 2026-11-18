# GSG-MIA-089 · T: un concepto de plata, un total

Criterio T del plan (`Factory-GSG 00-ESTADO/certificacion/GSG-MIA-089.md`). Cada concepto sale de **una** función; las
pantallas la suman, no la recalculan. Test por nombre: `src/lib/proyectos/mia089-plata-postgres.test.ts` (V2, V6) y
`gestion-core.test.ts` («MIA-089 · T: el pipeline…»); pantallas generales: `src/apps/visibles.test.ts` («MIA-089 · T: …»).

## De dónde sale cada número

| Concepto | Fuente única | Ficha | Administración | Rentabilidad | Dirección | Cashflow empresa |
|---|---|---|---|---|---|---|
| Vendido | `totalesFicha` (`gestion-core.ts:118`) | sí | — | `t.venta` | `venta` (`empresa.server.ts`, `proyectosConNumeros`) | — |
| Cobrado | `cobranzaDe` (`cobranza.server.ts`) | sí | `resumenConCobranza` | `cobrado` | `cobrado` vía `conciliarConCobros` | caja (no proyecta) |
| Por cobrar | `cobranzaDe` · **perdido = 0** (P2 = A) | sí | `aCobrar` | `porCobrar` | — | cuotas de cobro pendientes |
| Cobros vencidos | `conciliarConCobros`, tope = por cobrar (`cobranza-core.ts:403`) | sí | sí | — | `vencido` | — |
| Pagado | `resultadoReal.pagado` (`core.ts:140`) | sí | — | sí | — | caja |
| Por pagar | cuotas a proveedor pendientes **+ gastos directos sin pagar** (V6) | `datosResumen` (`ficha.server.ts`) | `resumen.aPagar` + lista «Gasto cargado sin pagar» (`empresa.server.ts`, `recuadrosDeCuotas`) | `real.porPagar` | — | egreso del mes a la fecha del gasto (`cashflowDeEmpresa`) |
| Costo real | `resultadoReal.costoReal` (`core.ts:140`) | sí | — | sí | `costoReal` (desvíos) | — |
| Pipeline | `ventaOEstimado` (`gestion-core.ts`) sobre leads abiertos | tablero «Pipeline» (`_pipeline.tsx:83`) | «Pipeline ponderado» (otra cuenta, ver abajo) | — | «Pipeline abierto» (`direccion/_tablero.tsx:26`) | — |

## Cuenta a mano (proyecto de los tests, misma semilla que V1–V8)

Presupuesto aprobado: 1 ítem a $ 1.000 + IVA 21 % = **$ 1.210**; anticipo 50 % = **$ 605**.

| Caso | Vendido | Cobrado | Por cobrar | Vencidos | Por pagar | Pantallas que lo dicen igual (test) |
|---|---|---|---|---|---|---|
| Seña cobrada | 1.210 | 605 | 1.210 − 605 = **605** | 0 | 0 | ficha, Administración, Rentabilidad (V2, antes de perder) |
| Perdido con seña cobrada + cuota a mano vencida $ 100 | 1.210 | 605 | **0** (P2 = A) | **0** (tope = por cobrar) | 0 | fuente única, Administración, Rentabilidad, Dirección (V2) |
| Lead con gasto directo 1.000 + 210 sin pagar | 0 | 0 | 0 | 0 | **1.210** | Rentabilidad = Administración = +1.210 en el cashflow del mes (V6) |
| El mismo gasto pagado | 0 | 0 | 0 | 0 | **0** | sale de las tres; 1 egreso en caja (V6) |

## Las dos explicaciones que pidió el plan

**El 1.000.000 del pipeline.** El tablero sumaba la venta de los ítems (`ficha.server.ts:76`, antes). Dirección suma la
venta o, sin ítems, lo estimado (`empresa.server.ts`, `ventaOEstimado`). Un lead con estimado de $ 1.000.000 y sin
presupuesto cargado pesaba 0 en una pantalla y 1.000.000 en la otra. Ahora las dos usan `ventaOEstimado` (test
«MIA-089 · T: el pipeline pesa…»). La semilla de MIA no tiene estimados: el proyecto exacto se confirma en la base real,
que no se consultó (Gate Neon). **Provisional a confirmar por el dueño.** El «Pipeline ponderado» del cashflow
(`gestion-core.ts`, `pipelinePonderado`) es otra cuenta: sólo propuestas enviadas, al 40 %, y ya lo dice su rótulo.

**«Costo real» antes de pagar.** Es diseño, no error: el costo real es el neto de los gastos cargados (pagados o no) más
lo comprometido en cuotas a proveedor (`core.ts:136-143`, GSG-UAT-008 · D6). Lo que todavía no se pagó está, además, en
«Por pagar». Se corrige el nombre si el dueño lo pide; el número no cambia.

## Pantallas generales para MIA

Cuentas a cobrar y a pagar generales no están en el panel cerrado de la productora (`apps/catalogo/comercial.ts`,
`panelCerrado`): fuera del menú y del buscador, sin tarjeta ni indicador, y por URL el layout redirige a Proyectos
(`app/admin/(dashboard)/layout.tsx:273`). CH no tiene panel cerrado y las sigue viendo. Test: `visibles.test.ts`
«MIA-089 · T».
