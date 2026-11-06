// Lo PURO de «el cliente de la venta» (buscar-para-venta-core.ts): lo alcanza también el componente de cliente
// (`ClienteDeLaVenta.tsx`), así que acá no entra nada de servidor (ni `Prisma` por valor). El core lo re-exporta.

import { validarCuit } from "@/lib/fiscal/cuit";
import { DOC_TIPO } from "@/lib/fiscal/decidir-comprobante";

/** Desde cuántos caracteres se busca. Con menos, cualquier letra trae medio negocio. */
export const MINIMO_PARA_BUSCAR = 3;

export type CuitDeLaVenta =
  | { ok: true; cuit: string; formateado: string }
  | { ok: false; motivo: string };

/**
 * El CUIT que se carga en Vender, con el motivo en las palabras del mostrador (MG-016). La regla
 * es la única del repo (`validarCuit`, módulo 11); acá sólo cambia la frase del verificador. No
 * se sugiere «el dígito correcto»: si el error está en otro número, «corregir» el último fabrica
 * el CUIT de otra persona — por eso se pide mirar la constancia. PURA.
 */
export function revisarCuit(valor: string | number | null | undefined): CuitDeLaVenta {
  const r = validarCuit(valor, "CUIT");
  if (r.ok) return { ok: true, cuit: r.cuit, formateado: r.formateado };
  if (r.error === "DIGITO_VERIFICADOR") {
    return { ok: false, motivo: "Ese CUIT no cierra: revisá el último número y los demás contra la constancia de ARCA." };
  }
  return { ok: false, motivo: r.motivo };
}

/** Qué documento es lo escrito en «CUIT/DNI». */
export type DocumentoEscrito =
  | { estado: "vacio" }
  | { estado: "valido"; docTipo: number; docNro: string; texto: string }
  | { estado: "invalido"; motivo: string };

/**
 * Lee el campo único «CUIT/DNI»: 11 números son un CUIT (se valida el verificador), de 6 a 8 un
 * DNI. `docTipo` permite forzar CUIL (86) cuando el formulario lo eligió. PURA.
 */
export function leerDocumento(crudo: string | null | undefined, docTipo?: number | null): DocumentoEscrito {
  const texto = String(crudo ?? "").trim();
  if (texto === "") return { estado: "vacio" };
  if (!/^[\d\s.\-/]+$/.test(texto)) {
    return { estado: "invalido", motivo: "El CUIT o DNI lleva sólo números (se puede escribir con guiones o puntos)." };
  }
  const d = texto.replace(/\D/g, "");
  if (d.length === 11 || docTipo === DOC_TIPO.CUIT || docTipo === DOC_TIPO.CUIL) {
    const c = revisarCuit(d);
    if (!c.ok) return { estado: "invalido", motivo: docTipo === DOC_TIPO.CUIL ? c.motivo.replace(/\bCUIT\b/g, "CUIL") : c.motivo };
    const tipo = docTipo === DOC_TIPO.CUIL ? DOC_TIPO.CUIL : DOC_TIPO.CUIT;
    return { estado: "valido", docTipo: tipo, docNro: c.cuit, texto: `${tipo === DOC_TIPO.CUIL ? "CUIL" : "CUIT"} ${c.formateado}` };
  }
  if (d.length >= 6 && d.length <= 8 && Number(d) > 0) {
    const dni = String(Number(d));
    return { estado: "valido", docTipo: DOC_TIPO.DNI, docNro: dni, texto: `DNI ${Number(dni).toLocaleString("es-AR")}` };
  }
  return { estado: "invalido", motivo: "Un CUIT tiene 11 números y un DNI entre 6 y 8. Revisá lo que escribiste." };
}
