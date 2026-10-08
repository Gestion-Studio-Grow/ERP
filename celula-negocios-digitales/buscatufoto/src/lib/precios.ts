import type { Album, Cotizacion, Cupon } from "./tipos";

/**
 * Motor de precios del carrito. Puro y determinista: lo usan el carrito (para mostrar) y el repositorio
 * (para cobrar). El total que se cobra SIEMPRE lo recalcula el repositorio; nunca se confía en el del carrito.
 *
 * Reglas:
 *  - Lista = Σ precio unitario (foto o video).
 *  - Se elige la opción más barata entre: (a) lista con el mejor escalón de descuento por cantidad,
 *    (b) el mejor paquete repetido tantas veces como entre + el resto a precio unitario.
 *    Escalón y paquete no se suman.
 *  - Paquete con cantidad 0 = "todo el álbum": aplica cuando se lleva todo.
 *  - El cupón se aplica sobre el subtotal; porcentaje con tope opcional, o monto fijo. Nunca deja negativo.
 */
export interface ItemCotizable {
  tipo: "foto" | "video";
}

export function precioUnitario(album: Pick<Album, "precioFoto" | "precioVideo">, tipo: "foto" | "video"): number {
  return tipo === "video" && album.precioVideo > 0 ? album.precioVideo : album.precioFoto;
}

export function cotizar(
  album: Pick<Album, "precioFoto" | "precioVideo" | "paquetes" | "escalones" | "cupones">,
  items: ItemCotizable[],
  codigoCupon: string | null,
  totalMediosAlbum: number,
): Cotizacion {
  const cantidad = items.length;
  const precios = items.map((i) => precioUnitario(album, i.tipo)).sort((a, b) => b - a);
  const lista = precios.reduce((s, p) => s + p, 0);

  let subtotal = lista;
  let regla: Cotizacion["regla"] = { tipo: "unitario", etiqueta: "Precio por unidad" };

  // (a) escalón
  const escalon = [...album.escalones]
    .filter((e) => e.desde > 0 && e.porcentaje > 0 && cantidad >= e.desde)
    .sort((a, b) => b.porcentaje - a.porcentaje)[0];
  if (escalon) {
    const conEscalon = Math.round(lista * (1 - Math.min(90, escalon.porcentaje) / 100));
    if (conEscalon < subtotal) {
      subtotal = conEscalon;
      regla = { tipo: "escalon", etiqueta: `${escalon.porcentaje} % off llevando ${escalon.desde} o más` };
    }
  }

  // (b) paquetes: los ítems más caros entran primero al paquete (mejor para el comprador)
  for (const p of album.paquetes) {
    if (p.precio <= 0) continue;
    const tam = p.cantidad === 0 ? totalMediosAlbum : p.cantidad;
    if (tam <= 0 || cantidad < tam) continue;
    if (p.cantidad === 0 && cantidad !== totalMediosAlbum) continue;
    const veces = Math.floor(cantidad / tam);
    const resto = precios.slice(veces * tam).reduce((s, x) => s + x, 0);
    const conPaquete = veces * p.precio + resto;
    if (conPaquete < subtotal) {
      subtotal = conPaquete;
      regla = {
        tipo: "paquete",
        etiqueta: p.cantidad === 0 ? `Paquete ${p.nombre}` : `Paquete ${p.nombre}${veces > 1 ? ` × ${veces}` : ""}`,
      };
    }
  }

  const ahorroCantidad = lista - subtotal;

  let cupon: Cotizacion["cupon"] = null;
  let errorCupon: string | null = null;
  const codigo = (codigoCupon ?? "").trim().toUpperCase();
  if (codigo) {
    const c = album.cupones.find((x) => x.codigo.toUpperCase() === codigo);
    const motivo = motivoCuponInvalido(c);
    if (motivo) errorCupon = motivo;
    else if (c && cantidad > 0) cupon = { codigo: c.codigo, descuento: descuentoCupon(c, subtotal) };
  }

  const total = Math.max(0, subtotal - (cupon?.descuento ?? 0));
  return { cantidad, lista, regla, ahorroCantidad, subtotal, cupon, errorCupon, total };
}

export function motivoCuponInvalido(c: Cupon | undefined): string | null {
  if (!c) return "Ese cupón no existe para este álbum.";
  if (!c.activo) return "Ese cupón está pausado.";
  if (c.usosMax > 0 && c.usos >= c.usosMax) return "Ese cupón ya se usó todas las veces permitidas.";
  return null;
}

export function descuentoCupon(c: Cupon, subtotal: number): number {
  let d = c.tipo === "porcentaje" ? Math.round((subtotal * Math.min(100, c.valor)) / 100) : Math.round(c.valor);
  if (c.tipo === "porcentaje" && c.tope > 0) d = Math.min(d, c.tope);
  return Math.max(0, Math.min(d, subtotal));
}
