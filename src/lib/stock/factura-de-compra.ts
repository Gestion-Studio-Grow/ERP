// LA FACTURA DEL PROVEEDOR EN LA COMPRA QUE CARGA EL LOCAL (R3 del Challenger, cert. Magra T1).
//
// El problema: el local cargaba el N.º de factura como TEXTO LIBRE (va al detalle de la deuda,
// `AccountPayable.concept`), y cuando la contadora importaba «Mis Comprobantes Recibidos» la misma
// factura entraba como OTRA compra. La ficha del proveedor (`supplier-repo.ts`, suma de
// `StockPurchase.totalCost`) la contaba dos veces.
//
// El arreglo, SIN columnas nuevas: el local carga la factura en los campos fiscales que ya tiene
// `StockPurchase` (facturaTipo, facturaPuntoVenta, facturaNumero, facturaCuit, facturaFecha), que
// son exactamente la clave con la que la importación reconoce un comprobante (`claveRecibido`) y la
// del índice único `StockPurchase_factura_proveedor_key`. Entonces, sea cual sea el orden:
//   · local primero → la importación encuentra esa compra y la COMPLETA con el IVA de ARCA (no crea
//     otra);
//   · contadora primero → el alta del local encuentra la compra importada (sin renglones) y le
//     SUMA los renglones, el stock, el pago o la deuda (no crea otra);
//   · la misma factura cargada dos veces por el local → rechazo con el número de la compra.
// La decisión es pura y vive acá; la escritura, en purchase-core.ts y contador/recibidos-db.ts.
//
// PURO (sin base): lo usan el formulario de compras, la acción, el alta y la importación.

import { normalizarCuit, validarCuit } from "@/lib/fiscal/cuit";
import { NOTA_A_REVISAR, rotuloRecibido } from "@/lib/contador/recibidos-formato";

/** Los comprobantes que el local carga al recibir mercadería (catálogo de ARCA). */
export const TIPOS_DE_FACTURA_DE_COMPRA = [
  { tipo: 1, nombre: "Factura A" },
  { tipo: 6, nombre: "Factura B" },
  { tipo: 11, nombre: "Factura C" },
  { tipo: 51, nombre: "Factura M" },
] as const;

export type FacturaDeCompra = {
  tipo: number;
  puntoVenta: number;
  numero: number;
  /** 11 dígitos, sin guiones. */
  cuit: string;
  /** AAAAMMDD, como la guarda la importación (`facturaFecha`). */
  fecha: string;
};

/** Lo que llega del formulario (texto crudo). */
export type FacturaDelFormulario = {
  tipo?: unknown;
  puntoVenta?: unknown;
  numero?: unknown;
  cuit?: unknown;
  fecha?: unknown;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function entero(v: string, max: number): number | null {
  if (!/^\d{1,9}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= max ? n : null;
}

/** "2026-10-22" → "20261022"; null si no es un día de calendario. */
function diaAFiscal(dia: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(y, mo - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

/**
 * La factura del formulario. Todo vacío (tipo, punto de venta y número) = la compra no trae factura
 * (`null`, como siempre). Con alguno cargado, van los tres más el CUIT: el del formulario o, si
 * está vacío, el del proveedor elegido; si los dos están, tienen que ser el mismo (la factura es de
 * ese proveedor). La fecha es la de la factura; vacía, hoy. PURA.
 */
export function leerFacturaDeCompra(
  form: FacturaDelFormulario,
  opts: { hoy: string; cuitDelProveedor: string | null },
): { ok: true; factura: FacturaDeCompra | null } | { ok: false; error: string } {
  const tipoTxt = texto(form.tipo);
  const pvTxt = texto(form.puntoVenta);
  const numTxt = texto(form.numero);
  const cuitTxt = texto(form.cuit);
  if (!tipoTxt && !pvTxt && !numTxt) return { ok: true, factura: null };

  const tipo = Number(tipoTxt);
  if (!TIPOS_DE_FACTURA_DE_COMPRA.some((t) => t.tipo === tipo)) {
    return { ok: false, error: "Elegí qué comprobante es: Factura A, B, C o M." };
  }
  const puntoVenta = entero(pvTxt, 99999);
  if (puntoVenta === null) {
    return { ok: false, error: "El punto de venta de la factura es el primer número (por ejemplo 0001 en 0001-00012345): de 1 a 99999." };
  }
  const numero = entero(numTxt, 99999999);
  if (numero === null) {
    return { ok: false, error: "El número de la factura es el segundo número (por ejemplo 00012345 en 0001-00012345): de 1 a 99999999." };
  }

  const delProveedor = opts.cuitDelProveedor ? normalizarCuit(opts.cuitDelProveedor) : "";
  let cuit: string;
  if (cuitTxt) {
    const v = validarCuit(cuitTxt);
    if (!v.ok) return { ok: false, error: `CUIT del proveedor: ${v.motivo}` };
    cuit = v.cuit;
    if (delProveedor && delProveedor !== cuit) {
      return {
        ok: false,
        error: "El CUIT de la factura no es el del proveedor elegido. Revisá la factura o elegí el proveedor que la emitió.",
      };
    }
  } else if (delProveedor && validarCuit(delProveedor).ok) {
    cuit = delProveedor;
  } else {
    return { ok: false, error: "Poné el CUIT del proveedor que figura en la factura (o cargáselo en Proveedores)." };
  }

  const fechaTxt = texto(form.fecha);
  const fecha = diaAFiscal(fechaTxt || opts.hoy);
  if (!fecha) return { ok: false, error: "La fecha de la factura no es una fecha válida. Elegila en el calendario." };
  return { ok: true, factura: { tipo, puntoVenta, numero, cuit, fecha } };
}

/** «Factura A 00001-00012345», el mismo rótulo que la importación y el Libro IVA. PURA. */
export function rotuloDeLaFactura(f: Pick<FacturaDeCompra, "tipo" | "puntoVenta" | "numero">): string {
  return rotuloRecibido(f);
}

/**
 * La marca de la compra con factura que cargó el LOCAL: sin el IVA del comprobante, todavía no da
 * crédito fiscal (el Libro IVA la muestra «a revisar»). La importación de la contadora la reemplaza
 * por los datos de ARCA al vincularla.
 */
export const MARCA_FACTURA_DEL_LOCAL =
  `${NOTA_A_REVISAR} factura cargada por el local sin el IVA del comprobante; se completa al importar Mis Comprobantes Recibidos.`;

/** Las notas de la compra del local con factura: lo que escribió + la marca. PURA. */
export function notasDeCompraConFactura(notas: string | null): string {
  return [notas?.trim(), MARCA_FACTURA_DEL_LOCAL].filter(Boolean).join(" ");
}

/** Lo que escribió el local, sin la marca (para conservarlo al vincular). PURA. */
export function notasDelLocalSinMarca(notas: string | null): string {
  if (!notas) return "";
  const i = notas.indexOf(MARCA_FACTURA_DEL_LOCAL);
  return (i === -1 ? notas : notas.slice(0, i)).trim();
}

/** La compra que ya tiene esa factura (misma clave), tal como la lee el alta. */
export type CompraConEsaFactura = { code: number; renglones: number; importada: boolean };

/**
 * ¿Qué hace el alta del local con una factura que ya está en el negocio? PURA.
 *   · nada con esa clave → `nueva`;
 *   · la importó la contadora y no tiene renglones → `vincular` (se le suman los renglones);
 *   · cualquier otra (ya la cargó el local) → `rechazo`, con el número de la compra.
 */
export function decidirFacturaDeCompra(
  existente: CompraConEsaFactura | null,
  rotulo: string,
): { accion: "nueva" } | { accion: "vincular" } | { accion: "rechazo"; error: string } {
  if (!existente) return { accion: "nueva" };
  if (existente.importada && existente.renglones === 0) return { accion: "vincular" };
  return {
    accion: "rechazo",
    error: `Esa factura (${rotulo}) ya está cargada en la compra #${existente.code}: no se carga dos veces. Si llegó otra mercadería, cargala con su propia factura.`,
  };
}
