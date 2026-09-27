// ============================================================================
// LO QUE ENTRA POR EL CAMPO DE LA CAJA — lector, balanza, multiplicador o búsqueda.
// ============================================================================
//
// El lector de código de barras se comporta como un teclado: "escribe" los dígitos en el campo
// que tiene el foco y manda un Enter. Por eso la caja tiene UN campo y todo pasa por acá:
//
//   · "7790895000997"        → un código: se busca el producto (EAN, o PLU si se tipea corto).
//   · "2000123012508"        → una etiqueta de la balanza (prefijo 20-29 del formato del negocio).
//   · "3*7790895000997"      → tres de ese producto (también "3x", "3 x", "3×").
//   · "3*" y Enter           → deja el 3 esperando: el próximo código entra por 3.
//   · "coca"                 → una búsqueda por nombre (para lo que no tiene código o no se lee).
//
// El multiplicador vale sólo para productos por unidad: el peso lo da la balanza.
//
// PURO: sin base, sin React. La caja arma un índice del catálogo al cargar y resuelve cada
// lectura en el navegador (no espera al servidor entre un código y el siguiente). El servidor
// vuelve a decidir todo al cobrar, con los precios de la base.

import { limpiarCodigoLeido, variantesDeBusqueda, esGtinValido } from "./ean";
import { esCodigoDeBalanza, leerEtiquetaDeBalanza, renglonDeBalanza, type FormatoBalanza } from "./balanza";

export const MAX_MULTIPLICADOR = 999;

export type Entrada =
  | { tipo: "vacia" }
  | { tipo: "multiplicador"; cantidad: number }
  | { tipo: "codigo"; codigo: string; multiplicador: number | null }
  | { tipo: "busqueda"; texto: string; multiplicador: number | null }
  | { tipo: "invalida"; mensaje: string };

/** Interpreta lo que quedó en el campo cuando llegó el Enter. PURA. */
export function interpretarEntrada(raw: string | null | undefined): Entrada {
  const s = String(raw ?? "").trim();
  if (!s) return { tipo: "vacia" };
  const m = /^(\d{1,4})\s*[*xX×]\s*(.*)$/.exec(s);
  let multiplicador: number | null = null;
  let resto = s;
  if (m) {
    multiplicador = Number(m[1]);
    resto = m[2].trim();
    if (!(multiplicador >= 1) || multiplicador > MAX_MULTIPLICADOR) {
      return { tipo: "invalida", mensaje: `La cantidad va de 1 a ${MAX_MULTIPLICADOR}.` };
    }
    if (!resto) return { tipo: "multiplicador", cantidad: multiplicador };
  }
  const limpio = limpiarCodigoLeido(resto);
  if (/^\d+$/.test(limpio)) return { tipo: "codigo", codigo: limpio, multiplicador };
  return { tipo: "busqueda", texto: resto, multiplicador };
}

/** Un producto del catálogo, como lo tiene la caja en memoria. */
export interface ProductoDeCaja {
  id: string;
  name: string;
  codigo: string | null;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  seccion: string;
  /** Presentación ("900 ml"): para el precio por litro del cartel. */
  presentacion: string | null;
}

/** Índice código → producto. Los códigos se guardan sin espacios en los bordes. */
export function indexarPorCodigo(productos: readonly ProductoDeCaja[]): Map<string, ProductoDeCaja> {
  const m = new Map<string, ProductoDeCaja>();
  for (const p of productos) {
    const c = p.codigo?.trim();
    if (c && !m.has(c)) m.set(c, p);
  }
  // Un código interno corto (el PLU "00201") se encuentra también tipeado sin ceros ("201").
  for (const p of productos) {
    const c = p.codigo?.trim();
    if (c && /^\d{1,7}$/.test(c)) {
      const sinCeros = c.replace(/^0+(?=\d)/, "");
      if (!m.has(sinCeros)) m.set(sinCeros, p);
    }
  }
  return m;
}

function buscarPorCodigo(indice: Map<string, ProductoDeCaja>, codigo: string): ProductoDeCaja | null {
  for (const v of variantesDeBusqueda(codigo)) {
    const p = indice.get(v);
    if (p) return p;
  }
  return null;
}

export type Resolucion =
  | {
      ok: true;
      producto: ProductoDeCaja;
      /** Unidades o kilos; `null` = producto por peso leído por su código: falta el peso. */
      cantidad: number | null;
      /** El importe de la etiqueta de balanza (se cobra ése), o null. */
      importe: number | null;
      porBalanza: boolean;
    }
  | { ok: false; mensaje: string };

/**
 * Del código leído al renglón. PURA. `formato` es el de la balanza del negocio (null = el
 * negocio no usa balanza con etiqueta).
 */
export function resolverCodigo(
  codigo: string,
  indice: Map<string, ProductoDeCaja>,
  formato: FormatoBalanza | null,
  multiplicador: number | null = null,
): Resolucion {
  // 1. Etiqueta de balanza: sólo si el código tiene la forma y NO es un producto cargado con ese
  //    mismo código (un negocio puede tener un código interno 2x en un producto por unidad).
  if (formato && esCodigoDeBalanza(codigo, formato) && !indice.has(codigo)) {
    const l = leerEtiquetaDeBalanza(codigo, formato);
    if (!l.ok) return { ok: false, mensaje: l.mensaje };
    const producto = buscarPorCodigo(indice, l.plu);
    if (!producto) {
      return { ok: false, mensaje: `La balanza mandó el producto ${l.plu}, que no está en el catálogo: cargale ese código en el catálogo.` };
    }
    if (multiplicador != null && multiplicador !== 1) {
      return { ok: false, mensaje: "La etiqueta de la balanza ya trae el peso: no lleva multiplicador." };
    }
    const r = renglonDeBalanza(l, producto);
    if (!r.ok) return { ok: false, mensaje: r.mensaje };
    return { ok: true, producto, cantidad: r.cantidad, importe: r.importe, porBalanza: true };
  }
  const producto = buscarPorCodigo(indice, codigo);
  if (!producto) {
    if ((codigo.length === 8 || codigo.length >= 12) && !esGtinValido(codigo)) {
      return { ok: false, mensaje: "El código se leyó mal (el último dígito no cierra). Pasalo de nuevo o tipealo." };
    }
    return { ok: false, mensaje: `No hay ningún producto con el código ${codigo}. Buscalo por nombre o cargalo en el catálogo.` };
  }
  const precio = producto.saleUnit === "WEIGHT" ? producto.pricePerKg : producto.price;
  if (precio == null || !(precio > 0)) {
    return { ok: false, mensaje: `"${producto.name}" no tiene precio cargado. Cargalo en el catálogo o cobralo con precio a mano en Vender.` };
  }
  if (producto.saleUnit === "WEIGHT") {
    if (multiplicador != null) return { ok: false, mensaje: `"${producto.name}" se vende por peso: pesalo en la balanza.` };
    return { ok: true, producto, cantidad: null, importe: null, porBalanza: false };
  }
  return { ok: true, producto, cantidad: multiplicador ?? 1, importe: null, porBalanza: false };
}

/** Normaliza para buscar por nombre: minúsculas y sin acentos. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Los productos cuyo nombre tiene TODAS las palabras buscadas, hasta `max`. PURA. */
export function buscarPorNombre<T extends Pick<ProductoDeCaja, "name">>(productos: readonly T[], texto: string, max = 8): T[] {
  const palabras = norm(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const out: T[] = [];
  for (const p of productos) {
    const n = norm(p.name);
    if (palabras.every((w) => n.includes(w))) {
      out.push(p);
      if (out.length >= max) break;
    }
  }
  return out;
}
