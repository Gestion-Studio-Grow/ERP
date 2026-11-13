// ============================================================================
// PEDÍ LOCAL · LA CARTA EXPLÍCITA DEL LOCAL — categoría, orden, descripción, foto y destacado. PURA.
// ============================================================================
//
// `Product` (getStorefront) trae id, nombre y precio, pero no categoría, descripción, foto ni
// destacado. Mientras no haya migración (Gate 2: `Product.category/description/imageUrl/featured`),
// esos datos viven en la config del local (`ConfigDeliveryLocal.carta`) y se cruzan con la carta
// del servidor por NOMBRE, sin tildes ni mayúsculas. El precio que se cobra es SIEMPRE el del
// servidor: el `precio` de acá sólo lo usa el seed de la prueba cerrada.
// Un producto que no figura (el local lo cargó con otro nombre) cae en la regla por palabras de la
// vidriera (src/app/tienda/local/carta.ts → categoriaDe).

import { urlSegura } from "./marca";

export type ProductoDelLocal = {
  /** Código estable del seed (`Product.codigo`). */
  codigo: string;
  nombre: string;
  /** Pesos enteros. Sólo para el seed: la vidriera cobra el precio del servidor. */
  precio: number;
  descripcion?: string;
  /** https (o ruta propia). Otra cosa se ignora. */
  imagen?: string;
  destacado?: boolean;
};

export type CategoriaDelLocal = {
  id: string;
  titulo: string;
  /** El dibujo de la tarjeta sin foto (Ilustracion.tsx): cafe, bebidas, brunch, pasteleria, granos. */
  dibujo?: string;
  productos: readonly ProductoDelLocal[];
};

/** Las categorías en el orden de la carta del local. */
export type CartaDelLocal = readonly CategoriaDelLocal[];

export type FichaDelProducto = {
  categoria: { id: string; titulo: string; dibujo?: string };
  /** Posición dentro de su categoría (el orden del local). */
  orden: number;
  descripcion: string | null;
  imagen: string | null;
  destacado: boolean;
};

/** El nombre sin tildes, en minúscula y sin espacios de más, para comparar. */
export function planoDelNombre(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Las fichas de la carta por nombre plano. Si un nombre se repite, gana el primero. */
export function fichasDeLaCarta(carta: CartaDelLocal | null | undefined): Map<string, FichaDelProducto> {
  const fichas = new Map<string, FichaDelProducto>();
  for (const c of carta ?? []) {
    const categoria = { id: c.id, titulo: c.titulo, ...(c.dibujo ? { dibujo: c.dibujo } : {}) };
    c.productos.forEach((p, orden) => {
      const clave = planoDelNombre(p.nombre);
      if (fichas.has(clave)) return;
      fichas.set(clave, {
        categoria,
        orden,
        descripcion: p.descripcion?.trim() || null,
        imagen: urlSegura(p.imagen),
        destacado: p.destacado === true,
      });
    });
  }
  return fichas;
}

/** Los destacados que HOY están en la carta del servidor, en el orden de la carta del local. */
export function destacadosDeLaCarta<P extends { name: string }>(productos: readonly P[], carta: CartaDelLocal | null | undefined): P[] {
  const porNombre = new Map(productos.map((p) => [planoDelNombre(p.name), p]));
  const out: P[] = [];
  for (const c of carta ?? []) {
    for (const x of c.productos) {
      const p = x.destacado ? porNombre.get(planoDelNombre(x.nombre)) : undefined;
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out;
}
