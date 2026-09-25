// ============================================================================
// VENTAS DEL MOSTRADOR EN REPORTES — lo cobrado en el período, por día, medio y producto. PURO.
// ============================================================================
//
// Reportes medía sólo los cobros de TURNOS (Payment). En una carnicería, una velería o una
// tienda de pádel eso da $0 con el local vendiendo todo el día: el botón del Inicio decía
// "— Las ventas del mostrador se ven en el libro de caja". En un local de mostrador, Reportes
// muestra ahora sus ventas.
//
// EL MISMO RELOJ que el resto: una venta cuenta el día del negocio en que se creó y se cobró
// (`whereVentasCobradas`, la lista de Ventas del día), dentro de los bordes de día del período
// de Reportes (`bordesDelPeriodo`: 00:00 del primer día a 23:59:59,999 del último, hora
// argentina). Las anuladas no cuentan.
//
// Sin Prisma: recibe filas ya leídas.

import { round2 } from "@/lib/round";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import { filaCsv, pesosCsv } from "@/lib/libros/csv-ar";

export interface LineaDelMostrador {
  productId: string | null;
  name: string;
  quantity: number;
  saleUnit: "UNIT" | "WEIGHT";
  lineTotal: number;
}

export interface VentaDelMostrador {
  createdAt: Date;
  total: number;
  paymentMethod: string | null;
  /**
   * La venta quedó en la cuenta corriente del cliente ("A cuenta" en Vender). Se graba saldada
   * y SIN medio (order-core.ts): sin esta marca caía en "Sin medio registrado".
   */
  aCuenta?: boolean;
  /** Sus líneas. Vacío si las líneas llegan ya agrupadas aparte (ver `agruparVentasMostrador`). */
  items: readonly LineaDelMostrador[];
}

export interface FilaPorDia {
  dia: string;
  total: number;
  cantidad: number;
}

export interface FilaPorMedio {
  medio: string;
  etiqueta: string;
  total: number;
  cantidad: number;
}

export interface FilaPorProducto {
  clave: string;
  nombre: string;
  /** Kilos o unidades vendidos. */
  cantidad: number;
  porKilo: boolean;
  /** Lo cobrado por esas líneas (antes del descuento del pedido, si lo hubo). */
  total: number;
}

export interface ReporteMostrador {
  total: number;
  cantidad: number;
  /** Total / cantidad, o 0 sin ventas. */
  ticketPromedio: number;
  /** Del día más reciente al más viejo, sólo los días con ventas. */
  porDia: FilaPorDia[];
  porMedio: FilaPorMedio[];
  /** De mayor a menor por lo cobrado. */
  porProducto: FilaPorProducto[];
}

/**
 * Agrupa las ventas cobradas del período. `diaDe` pasa un instante al día del negocio y se
 * inyecta, para probar los bordes del día sin depender de la zona de la máquina.
 *
 * `lineas`: las líneas de esas ventas ya sumadas por la base (un `groupBy`), para no traer
 * cada ítem de un año de ventas. Si llegan, "por producto" sale de ellas y no de `items`. PURA.
 */
export function agruparVentasMostrador(
  ventas: readonly VentaDelMostrador[],
  diaDe: (instante: Date) => string,
  lineas?: readonly LineaDelMostrador[],
): ReporteMostrador {
  const porDia = new Map<string, FilaPorDia>();
  const porMedio = new Map<string, FilaPorMedio>();
  const porProducto = new Map<string, FilaPorProducto>();
  let total = 0;

  for (const v of ventas) {
    const monto = Number.isFinite(v.total) ? v.total : 0;
    total += monto;
    const dia = diaDe(v.createdAt);
    const d = porDia.get(dia) ?? { dia, total: 0, cantidad: 0 };
    d.total += monto;
    d.cantidad++;
    porDia.set(dia, d);

    const medio = v.paymentMethod ?? (v.aCuenta ? "A_CUENTA" : "SIN_MEDIO");
    const m = porMedio.get(medio) ?? {
      medio,
      etiqueta: v.paymentMethod ? etiquetaDeMedio(v.paymentMethod) : v.aCuenta ? "A cuenta (fiado)" : "Sin medio registrado",
      total: 0,
      cantidad: 0,
    };
    m.total += monto;
    m.cantidad++;
    porMedio.set(medio, m);

  }

  for (const it of lineas ?? ventas.flatMap((v) => v.items)) {
    // Por producto; una línea a mano (sin producto) se agrupa por su nombre.
    const clave = it.productId ?? `a-mano:${it.name.trim().toLowerCase()}`;
    const p = porProducto.get(clave) ?? { clave, nombre: it.name, cantidad: 0, porKilo: it.saleUnit === "WEIGHT", total: 0 };
    p.cantidad += Number.isFinite(it.quantity) ? it.quantity : 0;
    p.total += Number.isFinite(it.lineTotal) ? it.lineTotal : 0;
    porProducto.set(clave, p);
  }

  const redondear = <T extends { total: number }>(x: T): T => ({ ...x, total: round2(x.total) });
  return {
    total: round2(total),
    cantidad: ventas.length,
    ticketPromedio: ventas.length > 0 ? round2(total / ventas.length) : 0,
    porDia: [...porDia.values()].map(redondear).sort((a, b) => b.dia.localeCompare(a.dia)),
    porMedio: [...porMedio.values()].map(redondear).sort((a, b) => b.total - a.total),
    porProducto: [...porProducto.values()]
      .map((p) => ({ ...redondear(p), cantidad: Math.round(p.cantidad * 1000) / 1000 }))
      .sort((a, b) => b.total - a.total),
  };
}

/** "4,35" kilos o "12" unidades, con coma decimal. PURA. */
export function cantidadLegible(cantidad: number, porKilo: boolean): string {
  const n = porKilo ? Math.round(cantidad * 1000) / 1000 : Math.round(cantidad * 100) / 100; // no-es-plata: cantidad
  return `${String(n).replace(".", ",")} ${porKilo ? "kg" : "u."}`;
}

/**
 * El CSV de Reportes para un mostrador: resumen, por día, por medio y por producto. `;`,
 * coma decimal y CRLF, igual que el libro de caja y el paquete del mes. Sin BOM: lo pone la
 * ruta. PURA.
 */
export function csvVentasMostrador(r: ReporteMostrador, meta: { desde: string; hasta: string; negocio?: string }): string {
  const L: string[] = [];
  L.push(filaCsv("Ventas del mostrador", meta.negocio ?? "", `del ${meta.desde} al ${meta.hasta}`));
  L.push("");
  L.push(filaCsv("RESUMEN"));
  L.push(filaCsv("Ventas cobradas", pesosCsv(r.total)));
  L.push(filaCsv("Cantidad de ventas", r.cantidad));
  L.push(filaCsv("Ticket promedio", pesosCsv(r.ticketPromedio)));
  L.push("");
  L.push(filaCsv("POR DÍA"));
  L.push(filaCsv("Día", "Ventas", "Total"));
  for (const d of r.porDia) L.push(filaCsv(d.dia, d.cantidad, pesosCsv(d.total)));
  L.push("");
  L.push(filaCsv("POR MEDIO DE COBRO"));
  L.push(filaCsv("Medio", "Ventas", "Total"));
  for (const m of r.porMedio) L.push(filaCsv(m.etiqueta, m.cantidad, pesosCsv(m.total)));
  L.push("");
  L.push(filaCsv("POR PRODUCTO (antes del descuento del pedido)"));
  L.push(filaCsv("Producto", "Cantidad", "Unidad", "Total"));
  for (const p of r.porProducto) {
    L.push(filaCsv(p.nombre, String(p.cantidad).replace(".", ","), p.porKilo ? "kg" : "u.", pesosCsv(p.total)));
  }
  return L.join("\r\n") + "\r\n";
}
