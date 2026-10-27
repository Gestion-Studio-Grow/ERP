// ============================================================================
// EL CAMPO ÚNICO — ¿lo que entró es una etiqueta de la balanza, un código o un nombre?
// ============================================================================
//
// Reingeniería Magra, tanda 1 · 1F (contrato `CampoUnico`, magra-DISENO.md §4.0). En el mostrador
// hay UN campo «Escaneá o buscá» y le entra de todo: el lector de la balanza "tipea" la etiqueta
// con un Enter, el lector de barras el EAN de un carbón, y la persona escribe «vacío». Acá se
// decide qué fue, con la MISMA lectura que la caja del súper (`supermercado/lectura.ts`:
// `interpretarEntrada` + `resolverCodigo`, el formato de balanza del negocio):
//
//   · etiqueta  → producto + kilos de la etiqueta + el importe del papel (si lo trae) + el precio
//                 por kilo del sistema, para mostrar «Etiqueta $X · Sistema $Y» (MG-023);
//   · codigo    → producto (+ la cantidad: 1, o la del multiplicador «3*…»; null = va por kilo y
//                 falta el peso);
//   · texto     → lo escrito, para el buscador por nombre;
//   · desconocida → lo crudo y POR QUÉ no se pudo leer, en criollo (no frena la venta).
//
// LO QUE SE COBRA no se decide acá: el campo sólo identifica. Se cobra cantidad × precio del
// sistema y el servidor vuelve a calcular todo al cobrar (ver linea-desde-lectura.ts).
//
// Sobre el contrato: los campos `cantidad` (en `codigo`) y `mensaje` (en `desconocida`) son
// AGREGADOS al contrato de §4.0, no lo cambian: quien codificó contra él sigue compilando.
//
// PURO: sin base, sin React. Lo prueba decidir-lectura.test.ts.

import { indexarPorCodigo, interpretarEntrada, resolverCodigo, type ProductoDeCaja } from "@/lib/supermercado/lectura";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";
import { formatearCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";

/** Lo que el campo tiene de cada producto (contrato §4.0; `price` es opcional y agregado). */
export type ProductoDelCampo = {
  id: string;
  name: string;
  codigo: string | null;
  saleUnit: "UNIT" | "WEIGHT";
  pricePerKg: number | null;
  /**
   * Precio por unidad. Si quien integra lo pasa (aunque sea null), un producto por unidad sin
   * precio se avisa al leerlo. Si no lo pasa, el campo no juzga el precio: sólo identifica.
   */
  price?: number | null;
};

export type LecturaUnica =
  | { tipo: "etiqueta"; productId: string; kg: number; importeEtiqueta: number | null; precioSistema: number }
  | {
      tipo: "codigo";
      productId: string;
      /** Unidades (1, o las del «3*código»); null = producto por kilo leído por su código: falta el peso. */
      cantidad: number | null;
    }
  | { tipo: "texto"; texto: string }
  | {
      tipo: "desconocida";
      crudo: string;
      /** Por qué no se pudo leer, para decirlo en pantalla. */
      mensaje: string;
    };

export type IndiceDelCampo = Map<string, ProductoDeCaja>;

/**
 * El campo no pone precios: a un producto por unidad del que no se informó el precio se le da
 * uno de marcador para que `resolverCodigo` no lo rechace por «no tiene precio cargado». Nunca
 * sale del campo: la lectura `codigo` no lleva precio.
 */
const PRECIO_NO_INFORMADO = 1;

/** Índice código/PLU → producto, con las mismas reglas que la caja (PLU con o sin ceros). PURA. */
export function indiceDelCampo(productos: readonly ProductoDelCampo[]): IndiceDelCampo {
  return indexarPorCodigo(
    productos.map((p) => ({
      id: p.id,
      name: p.name,
      codigo: p.codigo,
      saleUnit: p.saleUnit,
      price: p.price !== undefined ? p.price : p.saleUnit === "UNIT" ? PRECIO_NO_INFORMADO : null,
      pricePerKg: p.pricePerKg,
      seccion: "",
      presentacion: null,
    })),
  );
}

/**
 * Lo que entró en el campo → qué es. PURA. `formato` es el de la balanza del negocio; null = sin
 * formato guardado: sólo códigos de producto y texto (una etiqueta 2x se busca como código común).
 */
export function decidirLectura(
  texto: string | null | undefined,
  indice: IndiceDelCampo,
  formato: FormatoBalanza | null,
): LecturaUnica {
  const crudo = String(texto ?? "");
  const e = interpretarEntrada(crudo);
  switch (e.tipo) {
    case "vacia":
      return { tipo: "desconocida", crudo, mensaje: "Pasá la etiqueta o el código por el lector, o escribí el nombre." };
    case "invalida":
      return { tipo: "desconocida", crudo, mensaje: e.mensaje };
    case "multiplicador":
      return { tipo: "desconocida", crudo, mensaje: `Poné la cantidad y el código juntos, por ejemplo ${e.cantidad}*código.` };
    case "busqueda":
      return { tipo: "texto", texto: e.texto };
  }
  const r = resolverCodigo(e.codigo, indice, formato, e.multiplicador);
  if (!r.ok) return { tipo: "desconocida", crudo, mensaje: r.mensaje };
  const p = r.producto;
  if (r.porBalanza && r.cantidad != null) {
    return { tipo: "etiqueta", productId: p.id, kg: r.cantidad, importeEtiqueta: r.importe, precioSistema: p.pricePerKg ?? 0 };
  }
  return { tipo: "codigo", productId: p.id, cantidad: r.cantidad };
}

/** Redondeo al centavo, como el servidor (`buildOrderLines`). */
function alCentavo(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lo que el sistema cobra por una etiqueta: kilos × precio por kilo, al centavo. PURA. */
export function importeDelSistema(l: Extract<LecturaUnica, { tipo: "etiqueta" }>): number {
  return alCentavo(l.kg * l.precioSistema);
}

/** ¿El papel dice otro importe que el sistema? (sólo etiquetas con importe). PURA. */
export function etiquetaDistintaDelSistema(l: Extract<LecturaUnica, { tipo: "etiqueta" }>): boolean {
  return l.importeEtiqueta != null && Math.abs(alCentavo(l.importeEtiqueta) - importeDelSistema(l)) >= 0.01;
}

/**
 * La frase que anuncia lo que entró (para el `aria-live` y la línea de abajo del campo). PURA.
 * `nombreDe` da el nombre del producto por su id.
 */
export function anunciarLectura(l: LecturaUnica, nombreDe: (productId: string) => string | undefined): string {
  switch (l.tipo) {
    case "etiqueta": {
      const nombre = nombreDe(l.productId) ?? "el producto";
      const base = `Entró ${nombre}: ${formatearCantidad(l.kg)} kg a ${fmtMoneyARS(l.precioSistema)}/kg, ${fmtMoneyARS(importeDelSistema(l))}.`;
      return etiquetaDistintaDelSistema(l)
        ? `${base} Etiqueta ${fmtMoneyARS(l.importeEtiqueta)} · Sistema ${fmtMoneyARS(importeDelSistema(l))}.`
        : base;
    }
    case "codigo": {
      const nombre = nombreDe(l.productId) ?? "el producto";
      if (l.cantidad == null) return `Entró ${nombre}: cargá el peso.`;
      return l.cantidad === 1 ? `Entró ${nombre}.` : `Entraron ${l.cantidad} de ${nombre}.`;
    }
    case "texto":
      return `Buscando «${l.texto}».`;
    case "desconocida":
      return l.mensaje;
  }
}
