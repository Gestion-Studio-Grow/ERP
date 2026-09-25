// ============================================================================
// RECIBIR MERCADERÍA — «el remito en la mano» (diseño nuevo). Reglas puras de la pantalla.
// ============================================================================
//
// Lo que decide la pantalla nueva antes de mandar: cómo se lee cada renglón del remito, cuánto
// suma, si la compra puede quedar a cuenta corriente y, sobre todo, POR QUÉ el botón todavía no
// se habilita, dicho en una frase al lado del botón (la pantalla de siempre lo dejaba gris sin
// decir nada). Las lecturas son las mismas que la pantalla de siempre (`ComprasForm`):
// `leerCantidad` / `leerImporte`, y el servidor vuelve a leer con las mismas funciones, así que
// lo que viaja no cambia. Sin "use client": se testea sin DOM.

import { leerCantidad, leerImporte } from "@/lib/pos-peso";
import { unidadCorta } from "../inventario/stock-core";

/** «5 unidad» → «5 u», la misma regla que la planilla de stock (el dato no se toca). */
export const unidadDelRenglon = unidadCorta;

export type ProductoRecibible = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
};
export type ProveedorElegible = {
  id: string;
  name: string;
  taxId: string | null;
};

/** Un renglón del remito tal como se tipeó (texto, no número: ver `pos-peso.ts`). */
export type RenglonTipeado = {
  key: number;
  productId: string;
  qtyText: string;
  costText: string;
};

export type RenglonLeido = RenglonTipeado & {
  producto: ProductoRecibible | undefined;
  cantidad: number;
  costo: number;
  importe: number;
  cantidadMal: boolean;
  costoMal: boolean;
};

export type MedioDeCompra = "" | "EFECTIVO" | "MP" | "TARJETA" | "CUENTA_CORRIENTE";

export const renglonVacio = (key: number, productId = ""): RenglonTipeado => ({
  key,
  productId,
  qtyText: "",
  costText: "",
});

/** Lee cada renglón: 0 mientras no haya algo legible; `…Mal` separa «no escribió» de «escribió algo que no es». */
export function leerRenglones(
  renglones: readonly RenglonTipeado[],
  porId: ReadonlyMap<string, ProductoRecibible>,
  conCostos: boolean,
): RenglonLeido[] {
  return renglones.map((r) => {
    const producto = porId.get(r.productId);
    const q = leerCantidad(r.qtyText);
    const c = leerImporte(r.costText);
    const cantidad = q.estado === "ok" ? q.valor : 0;
    const costo = conCostos && c.estado === "ok" ? c.valor : 0;
    return {
      ...r,
      producto,
      cantidad,
      costo,
      importe: producto && cantidad > 0 && costo > 0 ? cantidad * costo : 0,
      cantidadMal: !!producto && q.estado === "invalida",
      costoMal: conCostos && !!producto && c.estado === "invalida",
    };
  });
}

export const totalDelRemito = (leidos: readonly RenglonLeido[]) => leidos.reduce((s, r) => s + r.importe, 0);

/** Renglones que viajan (producto y cantidad): los que suman stock. */
export const renglonesQueEntran = (leidos: readonly RenglonLeido[]) =>
  leidos.filter((r) => r.producto && r.cantidad > 0);

export type EstadoDelRemito = {
  esCompra: boolean;
  conCostos: boolean;
  medio: MedioDeCompra;
  /** Hay proveedores cargados (se eligen de la lista). */
  conMaestro: boolean;
  proveedorId: string;
  leidos: readonly RenglonLeido[];
};

/**
 * Lo que falta para poder registrar, en la frase que va al lado del botón. `null` = se puede.
 * Mismas condiciones que la pantalla de siempre (y que el servidor, `decidirDeudaDeCompra`),
 * en el orden en que se llena el remito: primero lo que llegó, después cómo se pagó.
 */
export function queFaltaParaRegistrar(e: EstadoDelRemito): string | null {
  const malo = e.leidos.find((r) => r.cantidadMal || r.costoMal);
  if (malo) {
    const nombre = malo.producto?.name ?? "un producto";
    return malo.cantidadMal
      ? `La cantidad de ${nombre} no se entiende: con coma si tiene decimales (12,5).`
      : `El costo de ${nombre} no se entiende: escribilo como 6.543 o 6.543,50.`;
  }
  if (renglonesQueEntran(e.leidos).length === 0) return "Cargá qué llegó y cuánto.";
  if (!e.esCompra || !e.conCostos) return null;
  if (e.medio === "") return "Falta decir cómo se pagó.";
  if (e.medio === "CUENTA_CORRIENTE") {
    if (!e.conMaestro) return "Para dejarla a cuenta corriente, cargá antes al proveedor en Proveedores.";
    if (!e.proveedorId) return "A cuenta corriente: elegí a qué proveedor se le debe.";
    if (!(totalDelRemito(e.leidos) > 0)) return "A cuenta corriente: cargá el costo, sin costo no hay deuda.";
  }
  return null;
}

/** `?proveedor=` (desde la ficha del proveedor): sólo si es uno de la lista; si no, nada. */
export function proveedorDeLaUrl(
  valor: string | string[] | undefined,
  proveedores: readonly ProveedorElegible[],
): string {
  const id = Array.isArray(valor) ? valor[0] : valor;
  return id && proveedores.some((p) => p.id === id) ? id : "";
}

/** «Estaba corto»: los que están bajo el mínimo, primero los que más lejos quedaron, hasta `max`. */
export function cortosParaSumar<T extends ProductoRecibible>(
  productos: readonly T[],
  esBajo: (p: T) => boolean,
  max = 6,
): T[] {
  return productos
    .filter(esBajo)
    .sort((a, b) => a.stock - a.lowStockAt - (b.stock - b.lowStockAt) || a.name.localeCompare(b.name, "es"))
    .slice(0, max);
}

/** El detalle de una entrada ya registrada, en una línea: «Vacío 12 kg · Matambre 8 kg y 2 más». */
export function detalleDeEntrada(items: readonly { name: string; quantity: number; unit: string }[]): string {
  const fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
  const partes = items.slice(0, 2).map((i) => `${i.name} ${fmt.format(i.quantity)} ${unidadDelRenglon(i.unit)}`);
  const resto = items.length - partes.length;
  return resto > 0 ? `${partes.join(" · ")} y ${resto} más` : partes.join(" · ");
}
