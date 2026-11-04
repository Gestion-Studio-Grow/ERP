// ============================================================================
// «HOY» DEL NEGOCIO — el armado de la tarjeta del Inicio (venta-agenda-simple, T1). PURO.
// ============================================================================
//
// Lo que el dueño mira a la mañana o al cerrar, en una sola tarjeta de sólo lectura: turnos de
// hoy, lo cobrado hoy por medio, las ventas de productos y las señas que siguen sin entrar
// (docs/producto/venta-agenda/PLAN.md §3, fila «Dueño»). Los datos los lee `lector.ts`; acá se
// decide qué se muestra, sin base, para poder probarlo aparte (hoy-core.test.ts).
//
// Regla de honestidad: una parte que no se pudo leer llega como `null` y se muestra como
// «No se pudo leer», nunca como un cero. Un cero sólo sale de una lectura que dio cero.
//
// Lo cobrado sale del LIBRO de caja (`CashMovement`), igual que el cierre: es la plata que
// entró, no lo que se vendió. Cuenta:
//   · VENTA (mostrador, turno, taller…): suma;
//   · INGRESO atado a un cobro o a un pedido (cobro de fiado, seña): suma; un INGRESO suelto
//     (poner cambio en el cajón) NO es un cobro y no cuenta;
//   · EGRESO atado a un cobro o a un pedido (la anulación de un cobro): resta.
// El libro junta Débito y Crédito en TARJETA (D-C01) y, sin el paquete Gate 2, la transferencia
// en MP: el medio fino sale del cobro o del pedido de origen cuando lo hay.

import { centavosDe, redondearAlCentavo } from "@/lib/dinero/redondeo";
import { seniaDelServicio } from "@/lib/turnos/cobros";

/** Los medios que ve el dueño, en el orden de la tarjeta. */
export const MEDIOS_DEL_HOY = ["EFECTIVO", "TRANSFERENCIA", "MP", "DEBITO", "CREDITO"] as const;
export type MedioDelHoy = (typeof MEDIOS_DEL_HOY)[number] | "TARJETA_SIN_DETALLE";

export const ETIQUETA_DEL_MEDIO: Record<MedioDelHoy, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MP: "Mercado Pago",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  TARJETA_SIN_DETALLE: "Tarjeta sin detalle",
};

/** Una fila del libro de hoy, con el medio del cobro o del pedido que la originó (si lo hay). */
export interface MovimientoDelHoy {
  type: string;
  /** `CashMethod` del libro: EFECTIVO · MP · TARJETA · TRANSFERENCIA. */
  method: string;
  amount: number;
  collectionId: string | null;
  orderId: string | null;
  /** `PaymentMethod` del cobro (`Collection.method`) o del pedido (`Order.paymentMethod`). */
  medioDeOrigen: string | null;
}

/** El medio que ve el dueño para una fila del libro. PURA. */
export function medioDelMovimiento(m: Pick<MovimientoDelHoy, "method" | "medioDeOrigen">): MedioDelHoy | null {
  switch (m.method) {
    case "EFECTIVO":
      return "EFECTIVO";
    case "TRANSFERENCIA":
      return "TRANSFERENCIA";
    case "MP":
      // Sin el paquete Gate 2 la transferencia vive en MP: el cobro de origen dice cuál fue.
      return m.medioDeOrigen === "TRANSFERENCIA" ? "TRANSFERENCIA" : "MP";
    case "TARJETA":
      if (m.medioDeOrigen === "DEBITO") return "DEBITO";
      if (m.medioDeOrigen === "CREDITO") return "CREDITO";
      return "TARJETA_SIN_DETALLE";
    default:
      return null;
  }
}

/** +1 suma, -1 resta, 0 no es un cobro. PURA. */
export function signoDelCobro(m: Pick<MovimientoDelHoy, "type" | "collectionId" | "orderId">): 1 | -1 | 0 {
  const atado = Boolean(m.collectionId || m.orderId);
  if (m.type === "VENTA") return 1;
  if (m.type === "INGRESO") return atado ? 1 : 0;
  if (m.type === "EGRESO") return atado ? -1 : 0;
  return 0;
}

const redondear = (n: number) => redondearAlCentavo(n);

export interface FilaDeMedio {
  medio: MedioDelHoy;
  etiqueta: string;
  monto: number;
}

export interface CobradoDelHoy {
  total: number;
  /** Sólo los medios que se movieron, en el orden de `MEDIOS_DEL_HOY`. */
  filas: FilaDeMedio[];
  /**
   * «Tarjeta» = Débito + Crédito (+ lo que el libro anotó en tarjeta sin decir cuál). Sólo cuando
   * suma algo que no se ve en una fila sola: los dos medios a la vez o una parte sin detalle.
   */
  tarjeta: { monto: number; sinDetalle: number } | null;
}

/** Lo cobrado hoy por medio, a partir de las filas del libro. PURA. */
export function cobradoPorMedio(movimientos: readonly MovimientoDelHoy[]): CobradoDelHoy {
  const suma: Record<MedioDelHoy, number> = { EFECTIVO: 0, TRANSFERENCIA: 0, MP: 0, DEBITO: 0, CREDITO: 0, TARJETA_SIN_DETALLE: 0 };
  for (const m of movimientos) {
    const signo = signoDelCobro(m);
    const medio = medioDelMovimiento(m);
    if (signo === 0 || !medio || !Number.isFinite(m.amount)) continue;
    suma[medio] += signo * m.amount;
  }
  for (const k of Object.keys(suma) as MedioDelHoy[]) suma[k] = redondear(suma[k]);
  const filas = MEDIOS_DEL_HOY.filter((medio) => suma[medio] !== 0).map((medio) => ({ medio, etiqueta: ETIQUETA_DEL_MEDIO[medio], monto: suma[medio] }));
  const sinDetalle = suma.TARJETA_SIN_DETALLE;
  const tarjetaTotal = redondear(suma.DEBITO + suma.CREDITO + sinDetalle);
  const tarjeta = sinDetalle !== 0 || (suma.DEBITO !== 0 && suma.CREDITO !== 0) ? { monto: tarjetaTotal, sinDetalle } : null;
  const total = redondear(MEDIOS_DEL_HOY.reduce((acc, medio) => acc + suma[medio], 0) + sinDetalle);
  return { total, filas, tarjeta };
}

// ── Turnos ───────────────────────────────────────────────────────────────────

export interface TurnosDelHoy {
  total: number;
  atendidos: number;
  faltan: number;
  noVinieron: number;
}

/** De la cuenta por estado (turnos de hoy), los números de la tarjeta. Los cancelados no cuentan. PURA. */
export function turnosDelHoy(porEstado: readonly { status: string; cantidad: number }[]): TurnosDelHoy {
  const de = (s: string) => porEstado.filter((f) => f.status === s).reduce((a, f) => a + f.cantidad, 0);
  const atendidos = de("COMPLETED");
  const faltan = de("PENDING") + de("CONFIRMED");
  const noVinieron = de("NO_SHOW");
  return { total: atendidos + faltan + noVinieron, atendidos, faltan, noVinieron };
}

// ── Señas pendientes ─────────────────────────────────────────────────────────

/** Un turno de hoy o de mañana, Reservado o Confirmado, con lo que hace falta para su seña. */
export interface TurnoConSenia {
  id: string;
  startsAt: Date;
  clienta: string;
  servicio: string;
  precio: number;
  depositAmount: number | null;
  /** Suma de sus cobros (las anulaciones restan). */
  cobrado: number;
  /** ¿Quedó la marca «seña pedida» (AuditLog `deposit_requested`)? */
  pedida: boolean;
}

export interface SeniaPendiente {
  id: string;
  startsAt: Date;
  clienta: string;
  servicio: string;
  monto: number;
}

/** Las señas pedidas que siguen sin entrar (nada cobrado del turno), por hora. PURA. */
export function seniasPendientes(turnos: readonly TurnoConSenia[]): SeniaPendiente[] {
  return turnos
    .filter((t) => t.pedida && t.cobrado <= 0)
    .map((t) => ({ id: t.id, startsAt: t.startsAt, clienta: t.clienta, servicio: t.servicio, monto: seniaDelServicio({ depositAmount: t.depositAmount, precio: t.precio }) }))
    .filter((s) => s.monto > 0)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

// ── La tarjeta ───────────────────────────────────────────────────────────────

export interface VentasDelHoy {
  cantidad: number;
  total: number;
}

/** Lo que leyó el lector; `null` = esa parte no se pudo leer. */
export interface LecturaDelHoy {
  turnos: readonly { status: string; cantidad: number }[] | null;
  movimientos: readonly MovimientoDelHoy[] | null;
  ventas: VentasDelHoy | null;
  senias: readonly TurnoConSenia[] | null;
}

export interface TarjetaHoy {
  turnos: TurnosDelHoy | null;
  cobrado: CobradoDelHoy | null;
  ventas: VentasDelHoy | null;
  senias: SeniaPendiente[] | null;
  /** Las partes que no se pudieron leer, en palabras («los turnos», «lo cobrado»…). */
  sinLeer: string[];
}

/** Arma la tarjeta «Hoy». PURA. */
export function armarHoy(l: LecturaDelHoy): TarjetaHoy {
  const sinLeer: string[] = [];
  if (!l.turnos) sinLeer.push("los turnos");
  if (!l.movimientos) sinLeer.push("lo cobrado");
  if (!l.ventas) sinLeer.push("las ventas");
  if (!l.senias) sinLeer.push("las señas");
  return {
    turnos: l.turnos ? turnosDelHoy(l.turnos) : null,
    cobrado: l.movimientos ? cobradoPorMedio(l.movimientos) : null,
    ventas: l.ventas ? { cantidad: l.ventas.cantidad, total: redondear(l.ventas.total) } : null,
    senias: l.senias ? seniasPendientes(l.senias) : null,
    sinLeer,
  };
}

/** Pesos a la argentina: sin centavos salvo que los haya («$ 12.500», «$ 1.234,50»). PURA. */
export function pesosDelHoy(n: number): string {
  const conCentavos = centavosDe(n) % 100 !== 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: conCentavos ? 2 : 0,
  }).format(n);
}
