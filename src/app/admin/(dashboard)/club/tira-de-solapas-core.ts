// LA TIRA DE SOLAPAS DEL CLUB — qué se ve a la vista y qué va a «Más». PURO.
//
// Como el club de hoy (public/previews/breakpoint/club/app.mjs, `pestanias`): hasta 5 a la vista, en el orden del día
// (el dueño arranca por su Tablero), y el resto en «Más». La que se eligió desde «Más» se ve como solapa activa al
// lado, así nunca queda escondida la pantalla en la que estás. Antes eran 12 solapas en fila: en 1366 se partían en
// dos líneas y aparecía una barra de scroll (pedido del dueño, 20/10/2026).

/** El orden de uso del día: lo de todos los días adelante, la configuración al final. */
const ORDEN = ["tablero", "agenda", "buffet", "caja", "clientes", "fijos", "canchas", "tienda", "stock", "proveedores", "novedades", "configuracion"];
export const A_LA_VISTA = 5;

export interface Tira<T extends { id: string }> {
  principales: T[];
  /** La elegida desde «Más», a la vista mientras está elegida (o `null`). */
  elegidaDeMas: T | null;
  mas: T[];
}

export function armarTira<T extends { id: string }>(visibles: readonly T[], elegida: string, aLaVista = A_LA_VISTA): Tira<T> {
  const pos = (id: string) => {
    const i = ORDEN.indexOf(id);
    return i < 0 ? ORDEN.length : i;
  };
  const orden = [...visibles].sort((a, b) => pos(a.id) - pos(b.id));
  if (orden.length <= aLaVista + 1) return { principales: orden, elegidaDeMas: null, mas: [] };
  const principales = orden.slice(0, aLaVista);
  const resto = orden.slice(aLaVista);
  const elegidaDeMas = resto.find((s) => s.id === elegida) ?? null;
  return { principales, elegidaDeMas, mas: resto.filter((s) => s !== elegidaDeMas) };
}
