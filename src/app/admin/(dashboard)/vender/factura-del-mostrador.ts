// La factura en el mostrador, en palabras: a quién sale por defecto y, si desde esta pantalla no se
// puede facturar, por qué. PURO (lo arma MostradorDeVenta en el servidor y lo prueba
// factura-del-mostrador.test.ts).
//
// Por defecto la factura sale a CONSUMIDOR FINAL. El documento del comprador hace falta sólo si la
// norma lo exige (desde el umbral de identificación vigente, src/lib/fiscal/vigencias.ts) o si el
// cliente la pide a su nombre (la letra, A o C, depende del emisor): entonces se carga su CUIT o
// DNI en «Cliente» antes de cobrar, y la emisión lo toma de su ficha (invoice-from-order.ts). El
// umbral NO se escribe acá: sale de la tabla.

import { fmtMoneyARS } from "@/components/ui/format";

/** Lo que se dice debajo de la venta cobrada, sobre la factura. */
export function textoDelReceptor(umbralIdentificacion: number | null): string {
  const desde = umbralIdentificacion != null ? `, o la venta llega a ${fmtMoneyARS(umbralIdentificacion, 0)}` : "";
  return `Sale a consumidor final. Si el cliente pide la factura a su nombre${desde}, cargá su CUIT o DNI en «Cliente» antes de cobrar.`;
}

/**
 * Por qué desde esta pantalla no se ofrece «Facturar», o null si se ofrece. `puedeFacturar` es la
 * regla de la acción (app Facturación: módulo, capability, rubro); `rolFactura`, si el rol tiene
 * `billing:manage`.
 */
export function motivoSinFactura(o: { puedeFacturar: boolean; rolFactura: boolean }): string | null {
  if (o.puedeFacturar) return null;
  if (!o.rolFactura) return "La factura de esta venta la hace el dueño, desde Ventas del día.";
  return "Este negocio todavía no factura desde el sistema: la facturación electrónica la activa Gestión Studio Grow.";
}
