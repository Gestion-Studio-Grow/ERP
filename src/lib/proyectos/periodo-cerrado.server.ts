/**
 * O40 · un solo candado de «período cerrado» para todo lo de Proyectos que asienta en la caja: cobros, cuotas, pagos,
 * anulaciones, pagos de la empresa, pagos de liquidación y rendiciones. Ningún módulo de `src/lib/proyectos/` crea un
 * movimiento de caja por otro camino que `asentarEnCajaTx` (lo vigila la búsqueda en el código de
 * t01-plata-postgres.test.ts, «C-O40 · búsqueda en el código»). Se lee ADENTRO de la transacción que asienta: si el día
 * o el mes se cerraron, la transacción entera se deshace y la acción devuelve el texto del rechazo (`rechazoDePeriodo`).
 *
 * Carrera con el cierre: el candado `cierre-dia:<negocio>` es el MISMO que toman cerrar el día
 * (`cierre-diario-actions.ts`), congelar el mes (`cierre-mes/acciones.ts`) y abrir un turno (`caja-actions.ts`), y pone
 * a un asiento y a un cierre uno detrás del otro. El candado solo no alcanza: el cierre del día y congelar el mes corren
 * en Serializable, y Postgres saca la foto de esa transacción en su primera sentencia, ANTES de esperar el candado. El
 * cierre que llegaba segundo no veía el asiento que había confirmado mientras esperaba: cerraba sin contarlo y asentaba
 * un sobrante (cert. MIA-064, fila 1), y congelar el mes cerraba el día como «sin movimientos».
 * Por eso el asiento también corre en Serializable (`transaccionQueAsienta`; `asentarEnCajaTx` lo exige). El asiento lee
 * la frontera, que el cierre escribe, y escribe en el libro, que el cierre lee. Con las dos en Serializable, Postgres
 * aborta a la segunda por ese ciclo, y el reintento de `tenantTransaction` la corre con una foto nueva:
 *   · si llegó primero el cierre, el asiento ve el día cerrado (o el mes congelado) y se rechaza;
 *   · si llegó primero el asiento, el cierre del día lo cuenta y congelar el mes lo ve y no congela.
 * Los dos órdenes, con el cierre real, los prueban los tests «C-O40 · carrera» de t01-plata-postgres.test.ts.
 *
 * T01b (MIA-075): el candado y la transacción pasaron a `src/lib/caja/candado-asiento.server.ts`, el único lugar que
 * escribe en `CashMovement` para todo el sistema (el libro a mano y los otros caminos que asientan, incluidos). Este
 * archivo queda con los mismos nombres para Proyectos.
 */
export {
  PeriodoCerradoError,
  rechazoDePeriodo,
  exigirPeriodoAbiertoTx,
  asentarEnCajaTx,
  transaccionQueAsienta,
  oPeriodoCerrado,
} from "@/lib/caja/candado-asiento.server";
