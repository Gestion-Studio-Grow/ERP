// ESQUELETO (commit de tests en rojo, GSG-MIA-056 · T04): sólo tipos y firmas. El código llega en el commit siguiente.
export type Centavos = number;
export interface PorcentajesPrecio { productor1: number; productor2: number; comercial: number; rentabilidad: number; margenError: number; iibGa: number }
export interface TopeRedondeo { pct: number; medidoSobre: "bruto" | "neto" }
export interface EntradaPrecio { costoOriginal: Centavos; adicionales: Centavos; porcentajes: PorcentajesPrecio; totalVenta: Centavos | null; tope: TopeRedondeo }
export interface Precio {
  costoOriginal: Centavos; adicionales: Centavos; rentabilidad: Centavos;
  comisiones: { productor1: Centavos; productor2: Centavos; comercial: Centavos };
  margenError: Centavos; subtotal: Centavos; iibGa: Centavos; totalVenta: Centavos | null;
  redondeoBruto: Centavos | null; redondeoNeto: Centavos | null; redondeoPuntos: number | null;
  totalMenorAlSubtotal: boolean; pasaTope: boolean;
}
const SIN = (): never => { throw new Error("sin implementar"); };
export const PORCENTAJES_PLANTILLA = {} as PorcentajesPrecio & { provisional: true };
export const TOPE_PLANTILLA = {} as TopeRedondeo & { provisional: true };
export function aPuntosBasicos(_pct: number): number { return SIN(); }
export function multiplicarPorPuntos(_c: Centavos, _pb: number): Centavos { return SIN(); }
export function calcularPrecio(_e: EntradaPrecio): Precio { return SIN(); }
