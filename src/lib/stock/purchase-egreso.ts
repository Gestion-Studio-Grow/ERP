// La PLATA que sale cuando entra la mercadería: decide qué EGRESO del libro de caja le
// corresponde a una compra a proveedor. PURO — sin Prisma, sin tenant, sin reloj.
//
// POR QUÉ EXISTE ESTE ARCHIVO. Hasta acá `insertStockPurchase` registraba la compra,
// sumaba el stock por el ledger y NO escribía un solo peso en ningún lado: el sistema
// sabía exactamente cuánto había costado (`StockPurchase.totalCost`) y nunca lo usaba
// como dinero. El resultado práctico era uno de dos, los dos malos:
//
//   · La dueña tipeaba el egreso a mano en /admin/caja/libro — doble carga, en dos
//     pantallas sin vínculo entre sí, con el importe re-tipeado (y por lo tanto
//     re-equivocable).
//   · O no lo tipeaba, y el cierre del día le daba un faltante EXACTAMENTE igual a lo
//     que le había pagado al proveedor, que `cerrarDia` asienta como "Diferencia de
//     caja" imborrable.
//
// Es el mismo defecto del `closingDiff` varado: el sistema sabe que salió plata y no la
// asienta. Por eso el asiento va DENTRO de la misma transacción que la compra y el
// stock (ver `insertStockPurchase`): una compra con mercadería adentro y sin egreso es
// peor que ninguna de las dos.
//
// La DECISIÓN (¿corresponde egreso?, ¿por qué medio?, ¿con qué fecha contable?) vive
// acá, pura y testeable; la PERSISTENCIA vive en purchase-core.ts. Mismo corte que
// `cashSaleEligibility` / `recordCashSaleMovementInTx` en caja/cash-sale.ts.

import { round2 } from "@/lib/round";
import type { CashMethod } from "@/lib/caja/cash-register";
import { isFrozenDay, nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";

export type CompraKind = "COMPRA" | "REPOSICION";

// Cómo se pagó la compra. Son dos hechos distintos y hay que distinguirlos, porque la
// plata sale en momentos distintos:
//
//   · PAGADA — se le pagó al proveedor ahora. El egreso va al libro HOY.
//   · CUENTA_CORRIENTE — queda a deber (a 30 días, contra cheque, lo que sea). Hoy NO
//     salió un peso: asentar un egreso sería mentirle al arqueo, que a fin de día
//     mostraría un sobrante igual a la factura. El asiento va cuando se PAGA.
export type PagoDeCompra =
  | { estado: "PAGADA"; method: CashMethod | null }
  | { estado: "CUENTA_CORRIENTE" };

// BACKSTOP, ya no el caso normal.
//
// El formulario de compras AHORA pregunta cómo se pagó (`<Select name="pago">`) y no deja
// registrar una compra sin elegirlo, así que por el camino de la pantalla este default no se
// usa. Queda para el llamador que no es ese formulario (un import, un script, un submit sin
// JS): antes que no asentar nada —lo que deja el gasto fuera del libro— se asienta asumiendo
// efectivo y se DICE en el detalle de la fila ("medio no informado (asumido efectivo)"), y
// `medioAsumido: true` viaja en la decisión para que la Server Action lo audite.
//
// Por qué asumir es caro, y por qué el formulario tuvo que preguntarlo: `StockPurchase` no
// tiene ninguna columna de la que se pueda derivar el medio, y si se asume mal, el arqueo del
// día cierra con faltante en una columna y sobrante en la otra POR EL IMPORTE COMPLETO. Y
// hasta hace poco además apagaba el aviso de duplicado del libro, que comparaba por medio.
const MEDIO_ASUMIDO: CashMethod = "EFECTIVO";

/** Lo que asume el sistema cuando el llamador NO informa cómo se pagó. Ver `MEDIO_ASUMIDO`. */
export const PAGO_POR_DEFECTO: PagoDeCompra = { estado: "PAGADA", method: null };

// ── Marca del asiento ───────────────────────────────────────────────────────
//
// `CashMovement` NO tiene columna `purchaseId` (tiene `orderId`, `paymentId` y
// `collectionId`, y agregar una cuarta es una migración más sobre las que ya esperan
// autorización del dueño). Así que el rastro compra → asiento va donde ya van las otras
// marcas del libro que no tienen columna propia: en `createdBy`, igual que
// `corte-inicial:<día>`, `cierre-diario:<día>` y `arqueo-turno:<sessionId>`.
//
// Sirve para tres cosas: idempotencia (pre-chequeo dentro de la tx), impedir que el
// asiento se borre desde el libro (ver `deleteLibroEntry`), y poder rastrear de qué
// compra salió una fila.
export const COMPRA_ACTOR_PREFIX = "compra:";

export function compraMarker(purchaseId: string): string {
  return `${COMPRA_ACTOR_PREFIX}${purchaseId}`;
}

/** ¿Esta fila del libro la escribió el alta de una compra? Se usa para no dejar borrarla. */
export function esEgresoDeCompra(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(COMPRA_ACTOR_PREFIX);
}

/**
 * Marca de `createdBy` del INGRESO de caja por un reintegro del proveedor (la devolución de
 * mercadería que el proveedor paga en plata, supplier-return.ts). Vive acá, junto a la de la
 * compra, porque este módulo es puro y el libro la necesita para no dejar borrarla; la
 * devolución la re-exporta.
 */
export const REINTEGRO_ACTOR_PREFIX = "devolucion-proveedor:";

/** ¿Esta fila del libro la asentó el reintegro de una devolución a proveedor? */
export function esIngresoDeReintegro(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(REINTEGRO_ACTOR_PREFIX);
}

// Por qué una compra puede NO producir egreso. Ninguno es un error: son hechos del
// negocio, y el llamador los audita en vez de adivinar.
export type MotivoSinEgreso =
  | "reposicion-interna" // no es una compra a proveedor: no salió plata
  | "cuenta-corriente" // se debe: la plata sale cuando se pague
  | "sin-costo"; // total <= 0 o no finito: no hay nada que asentar

export type EgresoDeCompra = {
  type: "EGRESO";
  method: CashMethod;
  amount: number; // siempre > 0; el signo lo aplica el libro según `type`
  reason: string;
  createdBy: string; // marca `compra:<purchaseId>`
  dia: DayKey; // fecha CONTABLE del asiento (no necesariamente hoy: ver abajo)
  medioAsumido: boolean;
  diferidoPorCierre: boolean;
};

export type DecisionEgreso =
  | { asienta: true; egreso: EgresoDeCompra }
  | { asienta: false; motivo: MotivoSinEgreso };

/**
 * Fecha CONTABLE del egreso. Es `hoy`, salvo que hoy ya esté congelado por un cierre.
 *
 * Un día cerrado es inmutable: sus números ya se arquearon y se informaron, y meterle
 * una fila después haría que el libro deje de coincidir con el cierre que se publicó.
 * Pero rechazar la compra entera tampoco sirve — la mercadería entró de verdad, y una
 * compra rechazada a las 21:00 porque la caja se cerró a las 20:00 termina en que nadie
 * la registra. Se hace lo que hace cualquier libro: se imputa al PRIMER DÍA ABIERTO
 * (`nextDayKey` del último cerrado), y el detalle del asiento aclara la fecha real del
 * pago. Es exactamente lo que `frozenDayMessage` le pide al usuario cuando carga a mano.
 */
export function diaContableDelEgreso(hoy: DayKey, cerradoHasta: DayKey | null): DayKey {
  return isFrozenDay(hoy, cerradoHasta) ? nextDayKey(cerradoHasta!) : hoy;
}

// El proveedor entra al detalle recortado: el detalle se lee en una tabla angosta y en
// el teléfono, y una razón social larga empuja fuera de pantalla las aclaraciones de
// medio asumido / día diferido, que son justo lo que hay que ver.
const SUPPLIER_MAX = 48;

function detalleDeCompra(code: number, supplier: string | null): string {
  const s = (supplier ?? "").trim();
  if (!s) return `Compra #${code}`;
  const corto = s.length > SUPPLIER_MAX ? `${s.slice(0, SUPPLIER_MAX - 1).trimEnd()}…` : s;
  return `Compra #${code} · ${corto}`;
}

/**
 * ¿Qué egreso del libro le corresponde a esta compra? PURA: misma entrada, misma salida.
 *
 * Tres cortes, en este orden:
 *   1. REPOSICIÓN ≠ compra. El propio formulario lo dice: "reposición interna (recuento,
 *      devolución), el costo es opcional". Ahí no salió plata del negocio; el costo que
 *      se tipea es una valuación, no un pago. Asentarlo inventaría un egreso que nunca
 *      ocurrió, que es el defecto simétrico al que este archivo viene a arreglar.
 *   2. CUENTA CORRIENTE: se debe, no se pagó. Ver `PagoDeCompra`.
 *   3. Total en cero (una reposición sin costo cargada como compra, o datos basura): no
 *      hay nada que asentar.
 */
export function decidirEgresoDeCompra(input: {
  kind: CompraKind;
  purchaseId: string;
  code: number;
  supplier: string | null;
  totalCost: number;
  pago: PagoDeCompra;
  hoy: DayKey;
  cerradoHasta: DayKey | null;
}): DecisionEgreso {
  if (input.kind !== "COMPRA") return { asienta: false, motivo: "reposicion-interna" };
  if (input.pago.estado === "CUENTA_CORRIENTE") return { asienta: false, motivo: "cuenta-corriente" };

  const amount = round2(input.totalCost);
  if (!Number.isFinite(amount) || amount <= 0) return { asienta: false, motivo: "sin-costo" };

  const medioAsumido = input.pago.method == null;
  const method = input.pago.method ?? MEDIO_ASUMIDO;
  const dia = diaContableDelEgreso(input.hoy, input.cerradoHasta);
  const diferidoPorCierre = dia !== input.hoy;

  let reason = detalleDeCompra(input.code, input.supplier);
  if (medioAsumido) reason += " · medio no informado (asumido efectivo)";
  if (diferidoPorCierre) reason += ` · pagada el ${input.hoy}, día ya cerrado`;

  return {
    asienta: true,
    egreso: {
      type: "EGRESO",
      method,
      amount,
      reason,
      createdBy: compraMarker(input.purchaseId),
      dia,
      medioAsumido,
      diferidoPorCierre,
    },
  };
}
