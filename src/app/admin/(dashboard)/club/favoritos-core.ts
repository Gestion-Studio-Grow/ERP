// ============================================================================
// FAVORITOS DEL MOSTRADOR — los 8 productos que se ofrecen de un toque en «Vender». PURO.
// ============================================================================
//
// Los 8 más vendidos de los últimos 7 días de caja (de 12 a 12: el día de caja de hoy y los 6 anteriores), contados
// en unidades desde lo cargado a cuentas (la venta de mostrador incluida: `rentabilidad` del motor, la misma cuenta
// que usa Números). Si en 7 días se vendieron menos de 8 productos distintos, se completa con los que el dueño marcó
// `favorito` y, si todavía faltan, con el resto del catálogo en su orden: el mostrador nunca arranca con la fila vacía.
//
// Sólo lo que se puede vender en el acto: activo, con precio, que no sea de alquiler (va a la cuenta de un jugador,
// buffet-mesa-core.ts) y con stock (un favorito agotado no se puede tocar: se cae de la fila hasta que se reponga).
// Bajo empate de unidades, el marcado primero y después el orden del catálogo: la fila no baila entre dos renders.

import { diaDeCaja, rentabilidad, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Producto } from "@/lib/club/motor.mjs";

/** Cuántos chips tiene la fila (diseño §1.2, «Favoritos»). */
export const FAVORITOS_A_LA_VISTA = 8;
/** La ventana de ventas que manda (diseño §3.7). */
export const DIAS_DE_FAVORITOS = 7;

/**
 * El dueño puede marcar productos como favoritos del mostrador. El motor no tiene el campo (la foto es JSON: si viene,
 * se respeta; si no, no pasa nada). Ver «Supuestos» del informe de la Tanda 2A.
 */
type ConFavorito = Producto & { favorito?: boolean };

export interface FavoritoDelMostrador {
  id: string;
  nombre: string;
  precio: number;
  /** Unidades vendidas en los últimos 7 días (0 si entró por favorito o por catálogo). */
  vendidos: number;
  /** Por qué está en la fila. */
  por: "ventas" | "favorito" | "catalogo";
}

/** Lo que se puede vender en el acto desde la hoja. */
export const vendibleEnElActo = (p: Producto) => p.activo !== false && !p.alquiler && p.precio > 0 && (p.stock == null || p.stock > 0);

/** Los días de caja que cuentan: de hoy-6 a hoy (día de caja, de corte a corte). */
export function ventanaDeFavoritos(estado: EstadoClub, ahora: Ahora): { desde: string; hasta: string } {
  const hasta = diaDeCaja(estado, ahora.fecha, ahora.min);
  return { desde: sumarDias(hasta, -(DIAS_DE_FAVORITOS - 1)), hasta };
}

export function favoritosDelMostrador(estado: EstadoClub, ahora: Ahora, cuantos = FAVORITOS_A_LA_VISTA): FavoritoDelMostrador[] {
  const vendidos = new Map(rentabilidad(estado, ventanaDeFavoritos(estado, ahora)).filas.map((f) => [f.productoId, f.unidades]));
  const catalogo = (estado.productos as ConFavorito[]).filter(vendibleEnElActo);
  const orden = new Map(catalogo.map((p, i) => [p.id, i]));
  const marcado = (p: ConFavorito) => (p.favorito === true ? 0 : 1);
  const porVentas = catalogo
    .filter((p) => (vendidos.get(p.id) ?? 0) > 0)
    .sort((a, b) => (vendidos.get(b.id) ?? 0) - (vendidos.get(a.id) ?? 0) || marcado(a) - marcado(b) || orden.get(a.id)! - orden.get(b.id)!);
  const yaEstan = new Set(porVentas.map((p) => p.id));
  const marcados = catalogo.filter((p) => !yaEstan.has(p.id) && p.favorito === true);
  for (const p of marcados) yaEstan.add(p.id);
  const resto = catalogo.filter((p) => !yaEstan.has(p.id));
  const fila = (p: ConFavorito, por: FavoritoDelMostrador["por"]): FavoritoDelMostrador => ({ id: p.id, nombre: p.nombre, precio: p.precio, vendidos: vendidos.get(p.id) ?? 0, por });
  return [...porVentas.map((p) => fila(p, "ventas")), ...marcados.map((p) => fila(p, "favorito")), ...resto.map((p) => fila(p, "catalogo"))].slice(0, Math.max(0, cuantos));
}

/** Para reusar la fila entre versiones del almacén (la hoja no se repinta si los favoritos son los mismos). */
export const firmaDeFavoritos = (f: readonly FavoritoDelMostrador[]) => f.map((x) => `${x.id}:${x.precio}`).join("|");
