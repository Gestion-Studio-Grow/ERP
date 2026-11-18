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

## MIA-099 · la semilla proyecto por proyecto: **sin confirmar**

Estado: **sin confirmar**. La tabla de la semilla necesita una base local nueva con las migraciones y la semilla de esta rama.
El comando que la crea quedó esperando la aprobación del dueño (18/11, 05:21 UTC) y ORQ-007 ordenó no rodearlo. Comando exacto,
para que el dueño lo apruebe (Postgres local del contenedor, nunca Neon):

```
createdb -h /tmp/pgrun -p 5433 -U postgres mia099_demo
DATABASE_URL="postgresql://postgres@localhost:5433/mia099_demo?host=/tmp/pgrun" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres@localhost:5433/mia099_demo?host=/tmp/pgrun" npx tsx prisma/seed-mia-producciones.ts
```

Con la base, se completa una fila por proyecto: venta neta, ganancia presupuestada, cobrado, por cobrar y por pagar, en
Rentabilidad, Dirección y la ficha, y la cuenta a mano al lado.

**Lo que ya se puede contar a mano** (números de la certificación GSG-MIA-094, `00-ESTADO/certificacion/GSG-MIA-094.md:54`,
leídos en pantalla por la certificadora; no los medí yo):

| Pantalla | Antes de perder 2026-009 | Con 2026-009 perdido (antes de MIA-099) | Esperado con la decisión 1 = A | Cuenta a mano |
|---|---|---|---|---|
| Rentabilidad · Vendido (neto, aprobado) | 156.554.000 | 156.554.000 | **144.139.000** | 156.554.000 − 12.415.000 (venta de 2026-009) |
| Dirección · Facturación 2026 | 156.554.000 | 144.139.000 | 144.139.000 | sin cambio: ya excluía el perdido (`empresa-core.ts:157`) |
| Rentabilidad · Ganancia presupuestada | 42.974.000 · 27,45 % | 42.974.000 · 27,45 % | **39.459.000 · 27,38 %** | 42.974.000 − 3.515.000; 39.459.000 / 144.139.000 = 27,375 % |
| Dirección · Margen acumulado | 42.974.000 | 39.459.000 · 27,38 % | 39.459.000 · 27,38 % | sin cambio |

El test «T (MIA-099)» de `src/lib/proyectos/mia089-plata-postgres.test.ts` comprueba la misma igualdad contra Postgres real con
un perdido confirmado: Rentabilidad = Dirección en venta neta y en ganancia, y por cobrar 1.210 (la venta con IVA, cobrada en 0).

**Diferencias que siguen y no son de MIA-099** (hallazgos abiertos, para el dueño):
- «Ganancia real» de Rentabilidad sigue sumando el perdido: lo que se gastó en él se gastó. Se dejó así a propósito.
- Rentabilidad no filtra por año y Dirección sí (Facturación 2026); un Lead con presupuesto aprobado entra en Rentabilidad y no en
  Dirección. Si la semilla trae alguno de los dos casos, se ve con la base: sin confirmar.
