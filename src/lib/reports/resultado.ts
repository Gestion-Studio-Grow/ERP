// ============================================================================
// RESULTADO DEL MES — cuánto dejó el mes: ventas menos lo que costó lo vendido menos los
// gastos. PURO.
// ============================================================================
//
// LA PREGUNTA. La dueña ve el saldo del libro de caja y cree que eso es lo que ganó. No lo
// es: el libro mezcla lo que se vendió con lo que se compró para vender, lo que se le pagó
// a un proveedor por una deuda vieja y lo que ella misma se llevó. Esta cuenta separa lo
// que es resultado de lo que es sólo plata que se movió.
//
// LA CUENTA:
//   VENTAS    = los pedidos del mes cobrados o dejados a cuenta (no anulados) + los turnos
//               cobrados en el mes (el mismo reloj que Reportes: la fecha del cobro).
//               Para un Responsable Inscripto, sin IVA (21%, la misma cuenta con la que hoy
//               factura el sistema, fiscal.ts `calcularImpuestos`).
//   COSTO     = lo que costó lo vendido (costo-vendido.ts): el costo guardado en cada venta,
//               y los insumos que consumieron los servicios.
//   GASTOS    = los egresos del libro de caja del mes que SON gasto, reconocidos por la marca
//               que deja cada camino del sistema (la misma que usa el libro, `clasificarOrigen`):
//                 · comisiones pagadas;
//                 · diferencias de caja (un faltante es pérdida; un sobrante, ganancia);
//                 · los egresos cargados a mano (o importados de la planilla): "sin
//                   categoría" hasta que el libro tenga categorías (necesita una columna).
//   NO SON GASTO, y se muestran aparte para que nadie los reste a mano:
//                 · la compra de mercadería (entra al costo cuando se vende, no cuando se compra);
//                 · el pago de una deuda a un proveedor (la compra ya se contó);
//                 · el retiro del dueño (es plata del dueño, no un gasto del negocio);
//                 · la anulación de una venta (la venta anulada ya no suma);
//                 · el reintegro de un proveedor, el cobro de un fiado y los ingresos cargados
//                   a mano (un aporte, un préstamo o un cobro que ya se contó por otro lado).
//
// Sin Prisma: recibe filas ya leídas (resultado-lectura.ts las lee).

import { round2 } from "@/lib/round";
import { movementSign, type CashMovementType } from "@/lib/caja/cash-register";
import { clasificarOrigen } from "@/lib/caja/libro-caja";
import { IMPORT_ACTOR_PREFIX } from "@/lib/caja/import-caja";
import type { CondicionLibro } from "@/lib/libros/libro-iva";
import {
  costearInsumos,
  costearLineas,
  lineasDe,
  pedidosQueSonVenta,
  type LineaCosteada,
  type PedidoDelPeriodo,
  type SalidaDeStock,
} from "./costo-vendido";

// ── IVA ──────────────────────────────────────────────────────────────────────

/** La alícuota con la que el sistema factura hoy a un Responsable Inscripto (fiscal.ts). */
export const ALICUOTA_GENERAL = 0.21;

/**
 * ¿Los importes van sin IVA? Sólo para un Responsable Inscripto: su precio de venta incluye un
 * IVA que no es suyo. Un monotributista no discrimina IVA: lo que cobra es lo que vende. La
 * condición sale de lo que el negocio facturó (libro-iva.ts); sin comprobantes no se sabe, y
 * los importes quedan como se cobraron (la pantalla lo dice). PURA.
 */
export function vaSinIva(condicion: CondicionLibro): boolean {
  return condicion === "responsable-inscripto";
}

/** Un importe con IVA incluido, sin el IVA (si corresponde). PURA. */
export function netoDeIva(monto: number, condicion: CondicionLibro): number {
  return vaSinIva(condicion) ? round2(monto / (1 + ALICUOTA_GENERAL)) : round2(monto);
}

// ── Qué es cada movimiento del libro para el resultado ───────────────────────

export type RubroDeCaja =
  | "venta" // ya está en las ventas (pedido o turno cobrado): no se cuenta dos veces
  | "comision"
  | "diferencia-caja"
  | "sin-categoria"
  | "compra"
  | "pago-deuda"
  | "retiro"
  | "anulacion"
  | "cobro-fiado"
  | "reintegro-proveedor"
  | "ingreso-manual"
  | "ajuste-inicial"
  | "apertura";

/** Los rubros que SON gasto (o resultado) del mes. */
export const RUBROS_GASTO: readonly RubroDeCaja[] = ["comision", "diferencia-caja", "sin-categoria"];

export interface MovimientoDeCaja {
  type: CashMovementType;
  amount: number;
  createdBy: string | null;
  orderId: string | null;
}

/**
 * Qué es un movimiento del libro para el resultado. Se apoya en la clase contable del libro
 * (`clasificarOrigen`): la misma marca que decide la columna "Origen" del CSV de la contadora
 * decide acá si es gasto. Lo único que se agrega es separar lo importado de la planilla (que
 * eran gastos y cobros tipeados a mano) del corte inicial (el ajuste que ata el saldo al
 * conteo físico, que no es resultado de ningún mes). PURA.
 */
export function rubroDeCaja(m: MovimientoDeCaja): RubroDeCaja {
  const { origen } = clasificarOrigen({ type: m.type, createdBy: m.createdBy, orderId: m.orderId });
  switch (origen) {
    case "venta-mostrador":
    case "cobro-turno":
      return "venta";
    case "comision":
      return "comision";
    case "diferencia-caja":
      return "diferencia-caja";
    case "egreso-manual":
      return "sin-categoria";
    case "ingreso-manual":
      return "ingreso-manual";
    case "retiro":
      return "retiro";
    case "compra":
      return "compra";
    case "anulacion":
      return "anulacion";
    case "cobro-cuenta-corriente":
      return "cobro-fiado";
    case "pago-cuenta-corriente":
      return "pago-deuda";
    case "reintegro-proveedor":
      return "reintegro-proveedor";
    case "apertura":
      return "apertura";
    case "corte-importacion": {
      if (!String(m.createdBy ?? "").startsWith(IMPORT_ACTOR_PREFIX)) return "ajuste-inicial";
      if (m.type === "RETIRO") return "retiro";
      return movementSign(m.type) < 0 ? "sin-categoria" : "ingreso-manual";
    }
  }
}

// ── La cuenta ────────────────────────────────────────────────────────────────

export interface HechosDelMes {
  condicion: CondicionLibro;
  /** Pedidos NO anulados creados en el mes. */
  pedidos: readonly PedidoDelPeriodo[];
  /** Ids de los pedidos que tienen una cuenta a cobrar viva (se dejaron a cuenta). */
  pedidosACuenta: ReadonlySet<string>;
  /** Salidas de stock del mes (VENTA y CONSUMO). */
  salidas: readonly SalidaDeStock[];
  /** Costo de hoy por producto (null = sin costo). */
  costoVigente: Readonly<Record<string, number | null>>;
  /** Turnos cobrados en el mes (por fecha de cobro). */
  turnos: { total: number; cantidad: number };
  /** Movimientos del libro de caja con fecha contable en el mes. */
  caja: readonly MovimientoDeCaja[];
}

export interface ResultadoDelMes {
  condicion: CondicionLibro;
  /** ¿Los importes de ventas van sin IVA? */
  sinIva: boolean;
  ventas: {
    /** Pedidos cobrados. */
    mostrador: number;
    mostradorCantidad: number;
    /** Pedidos dejados a cuenta (fiado): la venta es del mes, se cobre después o no. */
    aCuenta: number;
    aCuentaCantidad: number;
    turnos: number;
    turnosCantidad: number;
    /** Todo lo de arriba, como se cobró (con IVA si lo lleva). */
    bruto: number;
    /** Lo que entra al resultado: sin IVA para un inscripto, igual al bruto si no. */
    neto: number;
  };
  costo: {
    mercaderia: number;
    insumos: number;
    total: number;
    /** Líneas que la venta no guardó con costo y se costearon con el de hoy. */
    lineasAlCostoDeHoy: number;
    /** Líneas sin ningún costo: quedan afuera del costo. */
    lineasSinCosto: number;
    /** Lo vendido en esas líneas sin costo (con IVA si lo lleva). */
    vendidoSinCosto: number;
    /** Consumos de servicios sin costo. */
    insumosSinCosto: number;
  };
  gastos: {
    comisiones: number;
    /** Faltantes menos sobrantes. Negativo = sobró plata (suma al resultado). */
    diferenciasDeCaja: number;
    sinCategoria: number;
    sinCategoriaCantidad: number;
    total: number;
  };
  resultado: number;
  /** Resultado sobre ventas netas, o `null` sin ventas. */
  margenSobreVentas: number | null;
  /** Lo que se movió en el libro y NO entra al resultado, para que se vea y no se reste a mano. */
  fuera: {
    compras: number;
    pagosDeDeudas: number;
    retiros: number;
    anulaciones: number;
    cobrosDeFiado: number;
    reintegros: number;
    ingresosManuales: number;
    ingresosManualesCantidad: number;
  };
  /** Las líneas vendidas, costeadas (las usa Margen). */
  lineas: LineaCosteada[];
}

/** El resultado del mes a partir de los hechos. PURA. */
export function calcularResultado(h: HechosDelMes): ResultadoDelMes {
  const { cobrados, aCuenta } = pedidosQueSonVenta(h.pedidos, h.pedidosACuenta);
  const suma = <T>(xs: readonly T[], f: (x: T) => number) => round2(xs.reduce((s, x) => s + f(x), 0));

  const mostrador = suma(cobrados, (p) => p.total);
  const enCuenta = suma(aCuenta, (p) => p.total);
  const turnos = round2(h.turnos.total);
  const bruto = round2(mostrador + enCuenta + turnos);
  const neto = netoDeIva(bruto, h.condicion);

  // El costo de la mercadería es SIN IVA siempre que el costo se haya cargado así; hoy el
  // formulario de compras no lo pregunta, así que se toma como se cargó.
  const lineas = costearLineas(lineasDe([...cobrados, ...aCuenta]), h.salidas, h.costoVigente);
  const insumos = costearInsumos(h.salidas, h.costoVigente);
  const mercaderia = suma(lineas, (l) => l.costo);
  const sinCosto = lineas.filter((l) => l.fuente === "sin-costo");

  let comisiones = 0;
  let diferencias = 0;
  let sinCategoria = 0;
  let sinCategoriaCantidad = 0;
  const fuera = {
    compras: 0,
    pagosDeDeudas: 0,
    retiros: 0,
    anulaciones: 0,
    cobrosDeFiado: 0,
    reintegros: 0,
    ingresosManuales: 0,
    ingresosManualesCantidad: 0,
  };
  for (const m of h.caja) {
    if (!(Number.isFinite(m.amount) && m.amount > 0)) continue;
    const signo = movementSign(m.type);
    switch (rubroDeCaja(m)) {
      case "comision":
        // Una corrección de una comisión (un ingreso con su marca) la descuenta.
        comisiones += -signo * m.amount;
        break;
      case "diferencia-caja":
        // Faltante (egreso) suma al gasto; sobrante (ingreso) lo baja.
        diferencias += -signo * m.amount;
        break;
      case "sin-categoria":
        sinCategoria += m.amount;
        sinCategoriaCantidad++;
        break;
      case "compra":
        fuera.compras += m.amount;
        break;
      case "pago-deuda":
        fuera.pagosDeDeudas += m.amount;
        break;
      case "retiro":
        fuera.retiros += m.amount;
        break;
      case "anulacion":
        fuera.anulaciones += m.amount;
        break;
      case "cobro-fiado":
        fuera.cobrosDeFiado += m.amount;
        break;
      case "reintegro-proveedor":
        fuera.reintegros += m.amount;
        break;
      case "ingreso-manual":
        fuera.ingresosManuales += m.amount;
        fuera.ingresosManualesCantidad++;
        break;
      case "venta":
      case "ajuste-inicial":
      case "apertura":
        break;
    }
  }
  for (const k of Object.keys(fuera) as (keyof typeof fuera)[]) {
    if (!k.endsWith("Cantidad")) fuera[k] = round2(fuera[k]);
  }

  const costoTotal = round2(mercaderia + insumos.costo);
  const gastosTotal = round2(comisiones + diferencias + sinCategoria);
  const resultado = round2(neto - costoTotal - gastosTotal);

  return {
    condicion: h.condicion,
    sinIva: vaSinIva(h.condicion),
    ventas: {
      mostrador,
      mostradorCantidad: cobrados.length,
      aCuenta: enCuenta,
      aCuentaCantidad: aCuenta.length,
      turnos,
      turnosCantidad: h.turnos.cantidad,
      bruto,
      neto,
    },
    costo: {
      mercaderia,
      insumos: insumos.costo,
      total: costoTotal,
      lineasAlCostoDeHoy: lineas.filter((l) => l.fuente === "costo-de-hoy").length,
      lineasSinCosto: sinCosto.length,
      vendidoSinCosto: suma(sinCosto, (l) => l.importe),
      insumosSinCosto: insumos.sinCosto,
    },
    gastos: {
      comisiones: round2(comisiones),
      diferenciasDeCaja: round2(diferencias),
      sinCategoria: round2(sinCategoria),
      sinCategoriaCantidad,
      total: gastosTotal,
    },
    resultado,
    margenSobreVentas: neto > 0 ? resultado / neto : null,
    fuera,
    lineas,
  };
}

/** ¿Hay algo que mostrar? Sin ventas ni gastos, el mes no tiene resultado que dar. PURA. */
export function mesSinMovimiento(r: ResultadoDelMes): boolean {
  return r.ventas.bruto === 0 && r.costo.total === 0 && r.gastos.total === 0;
}
