// ============================================================================
// LEER LOS PAGOS DEL FORMULARIO — lo que escribió `PieDeCobro`, leído por el servidor.
// ============================================================================
//
// El pie (src/components/cobro/PieDeCobro.tsx) escribe en el formulario que lo contiene:
//
//   paymentMethod=<medio principal>   pagado=1
//   pago.medio=<m> pago.monto=<n>     (repetidos, en orden; sólo al dividir)
//   recibido=<n>                      (opcional: lo que entregó en efectivo, para el vuelto)
//
// Lo leen `createOrder`, `cobrarPedido` y `entregarPedido` (order-actions.ts). El servidor NO
// confía en la pantalla:
//
//   · Los montos de `pago.monto` son los ASIENTOS (lo que entra al libro por cada medio), y se
//     validan contra el total que calcula la base ADENTRO de la transacción
//     (`validarPagosContraElTotal`): si no suman exacto, no se graba nada. Acá sólo se mira la
//     forma: medios conocidos, una vez cada uno, importes positivos con centavos como mucho.
//   · El medio principal lo decide `medioPrincipal` con los asientos; si el formulario trajo
//     otro, se rechaza (la pantalla y el servidor no se pusieron de acuerdo: se vuelve a cobrar).
//   · Con un solo `pago.*` no es un pago mixto: es el cobro de siempre, con ese medio.
//   · Sin `pago.*`, el medio es el `paymentMethod` crudo y lo decide `medioDeCobroRequerido`,
//     como siempre (MAG-1): nada se asume.
//
// PURO: recibe un lector de campos (`formData.getAll`), sin Prisma ni React.

import { centavosDe } from "@/lib/dinero/redondeo";
import { leerMedioDeCobro } from "@/lib/caja/medio-cobro";
import { MAX_PAGOS, medioPrincipal, type AsientoDePago } from "@/lib/supermercado/pago-mixto";
import { CAMPOS_DEL_PIE } from "./pie-de-cobro-core";

export type PagosLeidos =
  | {
      ok: true;
      /** `pagado=1` (el pie) o `paid=on|true` (los formularios de siempre). */
      pagado: boolean;
      /** El medio crudo a validar con `medioDeCobroRequerido` ("" si no vino ninguno). */
      medio: string;
      /** Dos o más asientos = pago mixto. null = un solo medio (el de siempre). */
      asientos: AsientoDePago[] | null;
      /** Lo que entregó el cliente en efectivo, si vino y se entiende. No se guarda. */
      recibido: number | null;
    }
  | { ok: false; error: string };

const IMPORTE = /^\d{1,13}(\.\d{1,2})?$/;

export const PAGOS_NO_COINCIDEN = "El medio de la venta no coincide con los pagos que llegaron: volvé a cobrar.";

function importe(raw: string): number | null {
  const s = raw.trim();
  if (!IMPORTE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function leerPagos(campo: (nombre: string) => readonly string[]): PagosLeidos {
  const uno = (n: string) => String(campo(n)[0] ?? "").trim();
  const paid = uno("paid");
  const pagado = uno(CAMPOS_DEL_PIE.pagado) === "1" || paid === "on" || paid === "true";
  const crudo = uno(CAMPOS_DEL_PIE.medio);

  const recibidoTexto = uno(CAMPOS_DEL_PIE.recibido);
  const recibido = recibidoTexto ? importe(recibidoTexto) : null;
  if (recibidoTexto && recibido === null) return { ok: false, error: "Lo que entregó el cliente no se entiende: volvé a cobrar." };

  const medios = campo(CAMPOS_DEL_PIE.pagoMedio).map(String);
  const montos = campo(CAMPOS_DEL_PIE.pagoMonto).map(String);
  if (medios.length !== montos.length) return { ok: false, error: "Los pagos llegaron incompletos: volvé a cobrar." };
  if (medios.length === 0) return { ok: true, pagado, medio: crudo, asientos: null, recibido };
  if (medios.length > MAX_PAGOS) return { ok: false, error: `Hasta ${MAX_PAGOS} medios de pago por venta.` };

  const asientos: AsientoDePago[] = [];
  for (let i = 0; i < medios.length; i++) {
    const medio = leerMedioDeCobro(medios[i]);
    if (!medio) return { ok: false, error: "Hay un medio de pago que no se reconoce: elegilo de nuevo." };
    if (asientos.some((a) => a.medio === medio)) return { ok: false, error: "Un medio aparece dos veces en el pago." };
    const monto = importe(montos[i]);
    if (monto === null || !(centavosDe(monto) > 0)) return { ok: false, error: "Hay un pago sin importe o con un importe que no se entiende." };
    asientos.push({ medio, monto });
  }

  const medio = asientos.length === 1 ? asientos[0].medio : medioPrincipal(asientos)!;
  if (crudo && crudo !== medio) return { ok: false, error: PAGOS_NO_COINCIDEN };
  return { ok: true, pagado, medio, asientos: asientos.length > 1 ? asientos : null, recibido };
}

/**
 * El vuelto de un cobro: lo que entregó en efectivo menos lo que va en efectivo al libro. null
 * si no hay dato o no alcanza (no se inventa un vuelto). `efectivo` = el asiento en efectivo de
 * un pago mixto, o el total si se cobró todo en efectivo.
 */
export function vueltoDelCobro(p: { total: number; medio: string | null; asientos: readonly AsientoDePago[] | null; recibido: number | null }): number | null {
  if (p.recibido === null) return null;
  const efectivo = p.asientos ? (p.asientos.find((a) => a.medio === "EFECTIVO")?.monto ?? 0) : p.medio === "EFECTIVO" ? p.total : 0;
  if (!(efectivo > 0)) return null;
  const dif = centavosDe(p.recibido) - centavosDe(efectivo);
  return dif >= 0 ? dif / 100 : null;
}
