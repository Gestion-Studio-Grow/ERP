// ============================================================================
// VENDER — lo que se decide sin base: descuento, vuelto, precio a mano, más vendidos y el
// texto del ticket.
// ============================================================================
//
// Vive junto a la pantalla porque es el frente del mostrador el que lo escribe; lo importan la
// pantalla (client component) y la Server Action (`createOrder`). El descuento y el precio a
// mano, que usa también el núcleo del alta, están en src/lib/venta-reglas.ts (re-exportados
// acá). Todo es DATO PURO: sin Prisma, sin React, sin nada de servidor. Si un día importara el
// `prisma` de valor, Turbopack rompería el build de /admin/vender sin que tsc lo vea.
//
// La regla de cada cosa se decide UNA vez y la aplican los dos lados: la pantalla la usa
// para avisar antes de cobrar y el servidor para rechazar, con el mismo texto. Si la pantalla
// y el servidor tuvieran reglas propias, el cajero vería "Cobrar" habilitado y un rechazo
// después, o al revés.

import { round2 } from "@/lib/round";
import { leerImporte, formatearCantidad } from "@/lib/pos-peso";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import { fmtDateTimeAr } from "@/lib/datetime";
import { fmtMoneyARS } from "@/components/ui/format";

// ── DESCUENTO y PRECIO A MANO: viven en src/lib/venta-reglas.ts ──────────────
//
// Las usa también el núcleo del alta (order-core.ts, el de la tienda y la API) y el ajuste de
// un pedido (order-anulacion.ts): por eso no viven en la carpeta de la pantalla. Se
// re-exportan acá para que la pantalla siga importando todo lo de Vender de un solo lugar.

export {
  TOPE_DESCUENTO_RECEPCION_PCT,
  topeDeDescuento,
  aplicarDescuento,
  descuentoDelAjuste,
  descuentoDelFormulario,
  NOMBRE_A_MANO_MAX,
  validarLineaAMano,
  lineasAManoDelFormulario,
  type TipoDescuento,
  type PedidoDeDescuento,
  type ResultadoDescuento,
  type LineaAMano,
} from "@/lib/venta-reglas";

// ── VUELTO ───────────────────────────────────────────────────────────────────
//
// Sólo con efectivo, y no se guarda: es la cuenta que el cajero hacía de cabeza con la cola
// esperando. Lo que entra al libro es el total de la venta, no lo que el cliente dio.

export type Vuelto =
  | { estado: "sin-dato" }
  | { estado: "invalido" }
  | { estado: "falta"; falta: number }
  | { estado: "ok"; vuelto: number };

export function calcularVuelto(total: number, pagoConRaw: string | null | undefined): Vuelto {
  const l = leerImporte(pagoConRaw);
  if (l.estado === "vacio") return { estado: "sin-dato" };
  if (l.estado === "invalida") return { estado: "invalido" };
  const dif = round2(l.valor - round2(total));
  if (dif < 0) return { estado: "falta", falta: round2(-dif) };
  return { estado: "ok", vuelto: dif };
}

// ── MÁS VENDIDOS: los 8 botones rápidos ──────────────────────────────────────

export const BOTONES_RAPIDOS = 8;
/** Días hacia atrás que miran los botones rápidos. */
export const DIAS_MAS_VENDIDOS = 30;

/**
 * Los ids de los productos más vendidos que HOY se pueden vender, en orden. PURA.
 *
 * Entra el conteo de líneas por producto (cuántas veces se vendió, no cuántos kilos: sumar
 * kilos con unidades no ordena nada). Se descartan las líneas sin producto (precio a mano) y
 * los productos que ya no se venden (sin precio, inactivos o borrados): un botón que no
 * funciona es peor que ninguno.
 */
export function masVendidos(
  grupos: readonly { productId: string | null; _count: { _all: number } }[],
  vendibles: ReadonlySet<string>,
  n = BOTONES_RAPIDOS,
): string[] {
  return grupos
    .map((g, i) => ({ id: g.productId, veces: g._count._all, i }))
    .filter((g): g is { id: string; veces: number; i: number } => !!g.id && vendibles.has(g.id))
    .sort((a, b) => b.veces - a.veces || a.i - b.i)
    .slice(0, n)
    .map((g) => g.id);
}

// ── EL TICKET ────────────────────────────────────────────────────────────────
//
// Comprobante NO fiscal para el cliente: por WhatsApp o impreso en 58 mm. Dice "No válido
// como factura" hasta que la venta se facture (ola 3). Las cantidades van con coma, como se
// leen acá ("1,24 kg", no "1.24").

export const LEYENDA_NO_FACTURA = "No válido como factura";

export type LineaTicket = {
  nombre: string;
  cantidad: number;
  porPeso: boolean;
  precio: number;
  total: number;
  /** Sin producto: se cargó con precio a mano. El cliente no lo ve; la pantalla sí. */
  aMano: boolean;
};

/** Una venta tal como la muestra el ticket. Serializable: viaja del servidor a la pantalla. */
export type VentaTicket = {
  id: string;
  code: number;
  /** ISO. */
  creada: string;
  lineas: LineaTicket[];
  subtotal: number;
  descuento: number;
  total: number;
  /** `PaymentMethod` tal cual, o null si no está cobrada. */
  medio: string | null;
  /** Nombre del cliente, o null si es la venta anónima de mostrador. */
  cliente: string | null;
  telefono: string | null;
  anulada: boolean;
};

export type OrdenParaTicket = {
  id: string;
  code: number;
  createdAt: Date | string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string | null;
  customerName: string;
  customerPhone: string;
  status: string;
  items: readonly {
    productId: string | null;
    name: string;
    saleUnit: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

/** El nombre que ponen el POS y la vidriera cuando no hay cliente. */
const SIN_CLIENTE = "Mostrador";

export function ventaDeOrden(o: OrdenParaTicket): VentaTicket {
  const nombre = o.customerName.trim();
  return {
    id: o.id,
    code: o.code,
    creada: new Date(o.createdAt).toISOString(),
    lineas: o.items.map((it) => ({
      nombre: it.name,
      cantidad: it.quantity,
      porPeso: it.saleUnit === "WEIGHT",
      precio: it.unitPrice,
      total: it.lineTotal,
      aMano: it.productId == null,
    })),
    subtotal: o.subtotal,
    descuento: o.discount,
    total: o.total,
    medio: o.paymentMethod,
    cliente: nombre && nombre !== SIN_CLIENTE ? nombre : null,
    telefono: o.customerPhone.trim() || null,
    anulada: o.status === "CANCELLED",
  };
}

/** "1,24 kg × $12.500,00" o "2 u × $3.900,00". */
export function detalleDeLinea(l: LineaTicket): string {
  if (l.aMano) return "";
  return `${formatearCantidad(l.cantidad)} ${l.porPeso ? "kg" : "u"} × ${fmtMoneyARS(l.precio)}${l.porPeso ? "/kg" : ""}`;
}

export type RenglonTicket = { texto: string; importe?: string; fuerte?: boolean; chico?: boolean };

/**
 * El ticket en renglones: lo mismo arma el impreso (58 mm) y el texto de WhatsApp, así los
 * dos dicen exactamente lo mismo. `pagoCon` sólo existe en el momento de cobrar (no se guarda).
 */
export function renglonesDelTicket(
  v: VentaTicket,
  opts: { negocio: string; pagoCon?: number | null },
): RenglonTicket[] {
  const r: RenglonTicket[] = [];
  r.push({ texto: opts.negocio, fuerte: true });
  r.push({ texto: `Ticket #${v.code} · ${fmtDateTimeAr(v.creada)}`, chico: true });
  if (v.cliente) r.push({ texto: `Cliente: ${v.cliente}`, chico: true });
  if (v.anulada) r.push({ texto: "VENTA ANULADA", fuerte: true });
  for (const l of v.lineas) {
    r.push({ texto: l.nombre, importe: fmtMoneyARS(l.total) });
    const det = detalleDeLinea(l);
    if (det) r.push({ texto: `  ${det}`, chico: true });
  }
  if (v.descuento > 0) {
    const pct = v.subtotal > 0 ? round2((v.descuento / v.subtotal) * 100) : 0;
    r.push({ texto: "Subtotal", importe: fmtMoneyARS(v.subtotal) });
    r.push({
      texto: `Descuento${pct > 0 ? ` (${String(pct).replace(".", ",")} %)` : ""}`,
      importe: `−${fmtMoneyARS(v.descuento)}`,
    });
  }
  r.push({ texto: "TOTAL", importe: fmtMoneyARS(v.total), fuerte: true });
  if (v.medio) r.push({ texto: `Pagó con ${etiquetaDeMedio(v.medio).toLowerCase()}`, chico: true });
  if (v.medio === "EFECTIVO" && opts.pagoCon != null) {
    const vuelto = round2(opts.pagoCon - v.total);
    if (vuelto >= 0) {
      r.push({ texto: "Recibido", importe: fmtMoneyARS(opts.pagoCon), chico: true });
      r.push({ texto: "Vuelto", importe: fmtMoneyARS(vuelto), chico: true });
    }
  }
  r.push({ texto: LEYENDA_NO_FACTURA, chico: true });
  return r;
}

/** El ticket como texto para WhatsApp (negritas con *). */
export function textoDelTicket(v: VentaTicket, opts: { negocio: string; pagoCon?: number | null }): string {
  return renglonesDelTicket(v, opts)
    .map((x) => {
      const linea = x.importe ? `${x.texto.trim()}: ${x.importe}` : x.texto.trim();
      return x.fuerte ? `*${linea}*` : linea;
    })
    .join("\n");
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * El ticket como página HTML de 58 mm, para imprimir en la térmica desde un iframe aparte.
 * Por qué un documento propio y no `window.print()` sobre la pantalla: con la pantalla, la
 * impresora de rollo imprime (en blanco) todo el alto de la página y tira papel de más. El
 * texto va escapado: el nombre del cliente o de una línea a mano lo tipeó una persona.
 * Sin probar en una impresora térmica real.
 */
export function htmlDelTicket(renglones: readonly RenglonTicket[]): string {
  const filas = renglones
    .map((r) => {
      const clases = [r.fuerte ? "f" : "", r.chico ? "c" : ""].filter(Boolean).join(" ");
      const texto = escaparHtml(r.texto.trim());
      return r.importe
        ? `<div class="r ${clases}"><span>${texto}</span><span>${escaparHtml(r.importe)}</span></div>`
        : `<div class="${clases}">${texto}</div>`;
    })
    .join("");
  return (
    "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Ticket</title><style>" +
    "@page{size:58mm auto;margin:0}" +
    "html,body{margin:0;padding:0;background:#fff;color:#000}" +
    "body{width:58mm;box-sizing:border-box;padding:2mm 3mm 6mm;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace}" +
    ".r{display:flex;justify-content:space-between;gap:2mm}.r span:last-child{white-space:nowrap}" +
    ".f{font-weight:700}.c{font-size:10px}div{margin:0 0 1px;overflow-wrap:anywhere}" +
    "</style></head><body>" +
    filas +
    "</body></html>"
  );
}
