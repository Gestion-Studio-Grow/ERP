"use server";

// ============================================================================
// CARGAR VENTAS DEL CUADERNO — la acción (Magra, tanda 2 · 2E; MG-060).
// ============================================================================
//
// Recibe las ventas anotadas en el cuaderno y graba CADA UNA con el alta de siempre
// (`createOrder`): la misma guardia (`orders:manage`), el mismo medio obligatorio, el mismo stock
// en la misma transacción, el mismo asiento del libro, la misma auditoría, y la misma clave de
// ticket (A-1) para que un reintento no duplique. Lo único nuevo viaja en el campo `occurredAt`,
// que `createOrder` valida con `decidirHoraDelCuaderno` (nunca en el futuro, nunca en un día
// cerrado, rol con permiso, detrás del interruptor del mostrador boutique).
//
// Se graban de a una, en el orden en que se vendieron, y cada una contesta por separado: una venta
// rechazada (sin stock, día cerrado) no frena a las demás, y la pantalla marca cuál quedó y por qué.

import { unstable_rethrow } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { createOrder } from "@/lib/order-actions";
import { logger } from "@/lib/logger";
import {
  formularioDeLaVenta,
  leerVentasDelCuaderno,
  ordenarPorHora,
  resultadoDeLaVenta,
  type ResultadoDelCuaderno,
  type ResultadoDeUnaVenta,
} from "./cuaderno-core";

export async function cargarVentasDelCuaderno(ventas: unknown): Promise<ResultadoDelCuaderno> {
  await requireCapability("orders:manage");
  const leidas = leerVentasDelCuaderno(ventas);
  if (!leidas.ok) return leidas;

  const resultados: ResultadoDeUnaVenta[] = [];
  for (const v of ordenarPorHora(leidas.ventas)) {
    try {
      resultados.push(resultadoDeLaVenta(v.clave, await createOrder(formularioDeLaVenta(v))));
    } catch (err) {
      // Un corte de Next (redirect por sesión vencida) sigue de largo. Cualquier otra cosa no prueba
      // que no se grabó: se dice que no se sabe y se reintenta con la MISMA clave.
      unstable_rethrow(err);
      logger.error("pedidos", "una venta del cuaderno falló por algo que no es un rechazo de negocio", err);
      resultados.push(resultadoDeLaVenta(v.clave, { ok: false, tipo: "sin-confirmar", error: "No pudimos confirmar si se grabó: volvé a tocar «Cargar» (no se duplica)." }));
    }
  }
  return { ok: true, resultados };
}
