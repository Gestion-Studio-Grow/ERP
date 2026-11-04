# Rendí — motor de rendiciones de MIA (Core, puro)

Recorte del motor de `origin/frente/rendiciones` para las productoras (plan: `docs/tenants/mia-producciones/PLAN-RENDI.md` §1).
Una rendición = un gasto de proyecto que alguien del equipo pagó de su bolsillo o con un anticipo. Sin SAP, lote contable,
conciliación, haberes, motor fiscal ni QR de ARCA (README MIA punto 11: sin Compras ni IVA compras).

| Módulo | Qué hace |
|---|---|
| `tipos.ts` | `Centavos`, `MedioPago`, `EstadoRendicion`, `EventoRendicion`, `Rendicion`, `Anticipo`, `Cuadratura` |
| `dinero.ts` | `pesos`, `formatearPesos(Corto)`, `ivaDeLinea`, `sumar` (sin USD) |
| `aprobacion.ts` | Un nivel: DIRECCION o ADMINISTRACION, nunca quien rinde (`puedeAprobar`, `nivelesDeAprobacion`) |
| `rendicion.ts` | `aplicarAccion` (`borrador → enviada → (devuelta \| rechazada) → aprobada → reintegrada`), `calcularCuadratura` |

## Reglas de la casa que respeta

- **Puro:** sin Prisma, red, React, `Date.now()` ni `new Date()`. La fecha entra por parámetro.
- **Plata en centavos enteros.** Único redondeo: `Math.round` sobre centavos (`pesos()` usa `round2`, ADR-057).
  `ProyectoGasto` sigue en Float pesos (deuda anotada): la rendición guarda centavos y convierte con `pesos()`.
- **Acción inválida para el estado = error** en criollo («No se puede aprobar una rendición aprobada»): un doble
  `aprobar` no pasa. La idempotencia de la plata la ponen además las únicas de la base (`CashMovement`).
- **Separación de funciones:** nadie aprueba, devuelve, rechaza ni se reintegra lo propio.
- Lo pagado con anticipo no se reintegra por rendición: el sobrante o faltante sale de `calcularCuadratura`.
- **Cuadratura:** contra el anticipo cuentan sólo `aprobada`/`reintegrada` (lo demás es `pendiente`, informativo);
  `aReintegrar` es lo que TODAVÍA se debe: lo propio `aprobada` (no lo `reintegrada`) + el faltante menos
  `anticipo.reintegradoCentavos`.
- **Medio de pago:** `MEDIOS_PAGO` de `tipos.ts` (`PROPIO` · `ANTICIPO`) es la única fuente; son los mismos valores del
  CHECK de la migración (ANTICIPO exige `anticipoId`), y `rendiciones-core.test.ts` controla que coincidan.
- **Re-rendir:** rechazar anula el gasto; corregir es cargar un gasto nuevo (única `(tenantId, gastoId)`).

## Tests

```
node --import tsx --test "src/lib/rendiciones/*.test.ts"
```
