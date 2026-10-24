// ============================================================================
// EL CAMPO ÚNICO — del código leído al renglón del ticket (qtyText + aviso).
// ============================================================================
//
// COPIA de `app/admin/(dashboard)/vender/lectura-vender.ts` (reingeniería Magra, tanda 1 · 1F):
// el campo único vive en `src/lib/lector/` y no importa nada de `vender/`, para que Vender,
// Armar y Mermas lo usen sin depender de una pantalla. Mientras la vista vieja de Vender exista,
// las dos copias tienen que decir lo mismo (lo prueban los dos tests, que son espejo). Cuando 1B
// retire `CampoEtiqueta.tsx`, la de `vender/` se borra y queda ésta.
//
// Es la MISMA lectura que la caja del súper (supermercado/lectura.ts: interpretarEntrada,
// indexarPorCodigo, resolverCodigo) y el mismo formato de balanza del negocio. Acá sólo se
// traduce el resultado a lo que entiende un ticket: un producto y la cantidad TIPEADA (texto,
// como si la hubiera escrito la persona).
//
// LO QUE SE COBRA, DICHO SIN VUELTAS. Se cobra cantidad × precio del sistema; el servidor
// vuelve a calcular todo al cobrar. Entonces:
//   · Etiqueta con PESO: se cobra ese peso al precio por kilo del sistema. Si el papel dice otro
//     importe, la balanza tiene otro precio cargado (se avisa, no se esconde).
//   · Etiqueta con IMPORTE: se carga el peso que corresponde a ese importe con el precio del
//     sistema, al gramo. El total puede quedar unos centavos arriba o abajo del papel.
//
// PURO: sin base, sin React. Lo prueba linea-desde-lectura.test.ts.

import { indexarPorCodigo, interpretarEntrada, resolverCodigo, type ProductoDeCaja } from "@/lib/supermercado/lectura";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";
import { formatearCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";

/** Lo que el ticket tiene de cada producto (lo de `cargarVender`, o el pedido en Armar). */
export type ProductoDelLector = {
  id: string;
  name: string;
  codigo: string | null;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
};

export type IndiceDelLector = Map<string, ProductoDeCaja>;

/** Índice código/PLU → producto, con las mismas reglas que la caja (PLU con o sin ceros). PURA. */
export function indiceDelLector(productos: readonly ProductoDelLector[]): IndiceDelLector {
  return indexarPorCodigo(
    productos.map((p) => ({
      id: p.id,
      name: p.name,
      codigo: p.codigo,
      saleUnit: p.saleUnit,
      price: p.price,
      pricePerKg: p.pricePerKg,
      seccion: "",
      presentacion: null,
    })),
  );
}

export type LineaLeida =
  | {
      ok: true;
      productId: string;
      /** La cantidad como texto del campo ("1,25"); "" = falta el peso (código sin etiqueta). */
      qtyText: string;
      /** Lo que conviene saber de esta lectura (la regla del precio, el peso que falta), o null. */
      aviso: string | null;
    }
  | { ok: false; mensaje: string };

/** La regla del precio en una frase, para mostrar junto al campo. */
export const REGLA_DEL_PRECIO_DE_BALANZA =
  "Se cobra el precio por kilo del sistema. Si el papel dice otro importe, la balanza tiene otro precio cargado.";

/**
 * Lo tipeado (o leído) en el campo → el renglón. PURA. `formato` es el de la balanza del negocio;
 * null = el negocio no lee etiquetas de balanza (sólo códigos de producto).
 */
export function lineaDesdeLectura(
  texto: string | null | undefined,
  indice: IndiceDelLector,
  formato: FormatoBalanza | null,
): LineaLeida {
  const e = interpretarEntrada(texto);
  switch (e.tipo) {
    case "vacia":
      return { ok: false, mensaje: "Pasá la etiqueta por el lector o tipeá el código." };
    case "invalida":
      return { ok: false, mensaje: e.mensaje };
    case "multiplicador":
      return { ok: false, mensaje: `Poné la cantidad y el código juntos, por ejemplo ${e.cantidad}*código.` };
    case "busqueda":
      return { ok: false, mensaje: "Eso no es un código. Para buscar por nombre usá el buscador de al lado." };
  }
  const r = resolverCodigo(e.codigo, indice, formato, e.multiplicador);
  if (!r.ok) return { ok: false, mensaje: r.mensaje };
  const p = r.producto;
  if (r.cantidad == null) {
    return { ok: true, productId: p.id, qtyText: "", aviso: `"${p.name}" se vende por kilo: cargá el peso de la balanza.` };
  }
  const qtyText = formatearCantidad(r.cantidad);
  if (!r.porBalanza) return { ok: true, productId: p.id, qtyText, aviso: null };
  const porKilo = `${fmtMoneyARS(p.pricePerKg ?? 0)}/kg`;
  if (r.importe != null) {
    return {
      ok: true,
      productId: p.id,
      qtyText,
      aviso: `La etiqueta dice ${fmtMoneyARS(r.importe)}: se cargan ${qtyText} kg a ${porKilo} del sistema. Puede diferir unos centavos.`,
    };
  }
  return {
    ok: true,
    productId: p.id,
    qtyText,
    aviso: `${qtyText} kg a ${porKilo} del sistema. Si el papel dice otro importe, la balanza tiene otro precio cargado.`,
  };
}
