// El JSON-LD de la tienda de MAGRA (P1-1, ronda 2): `Store` con lo que el local cargó y `Product` por corte con precio. PURO.
// Lo que falta no se publica: un corte sin precio cargado queda afuera (un `Product` sin oferta es un error para Google) y el
// teléfono o el Instagram de relleno no salen (los filtra `resolveMagraLocal`). El precio por kilo va con `unitCode: KGM`.

import { catalogoLd, negocioLd, type ProductoLd } from "@/lib/seo/jsonld";
import { ogDelNegocio } from "@/lib/seo/og";
import { packDeCorte, resolveMagraLocal, type MagraBrandingRow } from "@/tenants/magra-content";
import type { MagraProducto } from "./Etiqueta";

// Lo mismo que `unitPrice` de Etiqueta, que no se puede importar acá: Etiqueta trae componentes de cliente y este archivo corre en el servidor.
const unitPrice = (p: MagraProducto) => (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;

const NOMBRE = "MAGRA Meat Market";

export function jsonLdDeMagra(origen: string, productos: readonly MagraProducto[], branding: MagraBrandingRow | null): Record<string, unknown>[] {
  const url = `${origen}/tienda`;
  const local = resolveMagraLocal(branding);
  const og = ogDelNegocio("magra");
  const tienda = negocioLd("Store", {
    nombre: NOMBRE,
    url,
    imagen: og ? `${origen}${og.src}` : null,
    logo: `${origen}/tenants/magra/logo-footer.webp`,
    telefono: local.whatsapp ? `+${local.whatsapp}` : null,
    email: local.email,
    direccion: { calle: local.addressLine, ciudad: local.city },
    redes: local.instagramUrl ? [local.instagramUrl] : null,
  });
  const conPrecio: ProductoLd[] = productos
    .filter((p) => unitPrice(p) > 0)
    .map((p) => {
      const pack = packDeCorte(p.name);
      return {
        nombre: p.name,
        url,
        precio: unitPrice(p),
        hayStock: p.disponibilidad == null ? null : p.disponibilidad !== "sin-stock",
        imagen: pack ? `${origen}${pack.src}` : null,
        marca: "MAGRA",
        unidad: p.saleUnit === "WEIGHT" ? "KGM" : null,
      };
    });
  return conPrecio.length > 0 ? [tienda, catalogoLd(conPrecio, { nombre: NOMBRE, url })] : [tienda];
}
