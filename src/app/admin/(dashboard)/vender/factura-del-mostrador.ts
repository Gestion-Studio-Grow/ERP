// La factura en el mostrador, en palabras: a quién sale por defecto y, si desde esta pantalla no se
// puede facturar, por qué. PURO (lo arma MostradorDeVenta en el servidor, lo usa el bloque Cliente
// de Vender y lo prueba factura-del-mostrador.test.ts).
//
// Por defecto la factura sale a CONSUMIDOR FINAL. El documento del comprador hace falta sólo si la
// norma lo exige (desde el umbral de identificación vigente, src/lib/fiscal/vigencias.ts) o si el
// cliente la pide a su nombre (la letra, A o C, depende del emisor). La emisión toma el documento
// de la FICHA del cliente atada a la venta (invoice-from-order.ts). El umbral NO se escribe acá:
// sale de la tabla.
//
// DÓNDE se carga el documento depende del bloque Cliente que tenga la pantalla (MG-018):
//   · el bloque de siempre (teléfono y nombre) NO tiene campo de CUIT: el texto no puede mandar a
//     cargarlo ahí. Se carga en la ficha del cliente («Datos para facturar») y ahí lo toma la
//     factura;
//   · el bloque nuevo (`ClienteDeLaVenta`, interruptor `mostrador-boutique`) tiene «CUIT/DNI»: ahí
//     sí se carga antes de cobrar, y queda en la ficha de la venta.

import { fmtMoneyARS } from "@/components/ui/format";

type Quien = "cliente" | "clienta";

/** ¿El bloque Cliente de esta pantalla tiene el campo «CUIT/DNI»? (sólo el de `ClienteDeLaVenta`) */
export type OpcionesDelBloque = { conDocumento?: boolean };

/** Lo que se dice debajo de la venta cobrada, sobre la factura. */
export function textoDelReceptor(
  umbralIdentificacion: number | null,
  quien: Quien = "cliente",
  { conDocumento = false }: OpcionesDelBloque = {},
): string {
  const desde = umbralIdentificacion != null ? `, o la venta llega a ${fmtMoneyARS(umbralIdentificacion, 0)}` : "";
  const [el, Rotulo] = quien === "clienta" ? ["la clienta", "Clienta"] : ["el cliente", "Cliente"];
  if (conDocumento) {
    return `Sale a consumidor final. Si ${el} pide la factura a su nombre${desde}, cargá su CUIT o DNI en «${Rotulo}» antes de cobrar.`;
  }
  // Sin campo de documento en la pantalla: se dice dónde está de verdad.
  return `Sale a consumidor final. Si ${el} pide la factura a su nombre${desde}, buscá su ficha por teléfono en «${Rotulo}» antes de cobrar; el CUIT o DNI se carga en su ficha, en «Datos para facturar».`;
}

/** Lo que se sabe del documento escrito en el bloque Cliente. */
export type DocumentoDeLaVenta =
  | { estado: "vacio" }
  | { estado: "invalido"; motivo: string }
  /** `enFicha`: la venta va atada a una ficha que ya tiene este documento guardado. */
  | { estado: "valido"; enFicha: boolean; nombre?: "CUIT" | "CUIL" | "DNI" };

/**
 * Por qué desde esta pantalla no se ofrece «Facturar», o null si se ofrece. `puedeFacturar` es la
 * regla de la acción (app Facturación: módulo, capability, rubro); `rolFactura`, si el rol tiene
 * `billing:manage`. Con el bloque nuevo, el Mostrador sabe además si el documento ya quedó en la
 * venta (MG-018): la factura la hace el dueño, pero no tiene que volver a pedirlo.
 */
export function motivoSinFactura(o: {
  puedeFacturar: boolean;
  rolFactura: boolean;
  documento?: DocumentoDeLaVenta;
  conDocumento?: boolean;
}): string | null {
  if (o.puedeFacturar) return null;
  if (!o.rolFactura) {
    const d = o.documento;
    if (d?.estado === "valido" && d.enFicha) {
      return `La factura la hace el dueño desde Ventas del día; el ${d.nombre ?? "CUIT"} ya quedó en la venta.`;
    }
    if (o.conDocumento) {
      return "La factura la hace el dueño desde Ventas del día; si la pide a su nombre, cargá el CUIT acá para que salga a su nombre.";
    }
    return "La factura de esta venta la hace el dueño, desde Ventas del día.";
  }
  return "Este negocio todavía no factura desde el sistema: la facturación electrónica la activa Gestión Studio Grow.";
}

/**
 * El tilde «Facturar al cobrar» del bloque Cliente: si se puede tildar y, si no, por qué.
 *   · sin permiso o sin facturación en el negocio → el motivo de `motivoSinFactura`;
 *   · documento mal escrito → no se tilda, con el motivo del documento (MG-016);
 *   · documento bien escrito pero todavía no guardado en la ficha → no se tilda: la factura lo
 *     toma de la ficha, y sin guardarlo saldría a consumidor final;
 *   · sin documento → se tilda: sale a consumidor final.
 */
export function estadoFacturarAlCobrar(o: {
  puedeFacturar: boolean;
  rolFactura: boolean;
  documento: DocumentoDeLaVenta;
}): { habilitado: boolean; motivo: string | null } {
  const sin = motivoSinFactura({ ...o, conDocumento: true });
  if (sin) return { habilitado: false, motivo: sin };
  const d = o.documento;
  if (d.estado === "invalido") return { habilitado: false, motivo: d.motivo };
  if (d.estado === "valido" && !d.enFicha) {
    return { habilitado: false, motivo: "Guardá los datos para facturar: la factura sale con lo que está en la ficha." };
  }
  return { habilitado: true, motivo: d.estado === "vacio" ? "Sin CUIT ni DNI, la factura sale a consumidor final." : null };
}
