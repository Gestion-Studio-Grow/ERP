// JSON-LD por rubro (SEO ronda 2, P0). Constructores PUROS: reciben datos ya leídos de la base (nunca del copy) y
// devuelven el objeto schema.org. Lo que falta no se inventa: un campo sin dato no se emite (dirección, teléfono,
// horarios, calificación). Cada front los arma y los pinta con <JsonLd> (src/components/seo/JsonLd.tsx).

import { admiteCentavos, textoAlCentavo } from "@/lib/dinero/redondeo";
type Obj = Record<string, unknown>;

/** Quita claves vacías (undefined, null, "", [] y objetos sin datos) para no publicar campos sin dato. PURA. */
export function sinVacios<T extends Obj>(o: T): T {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const limpio = sinVacios(v as Obj);
      if (Object.keys(limpio).filter((x) => x !== "@type" && x !== "addressCountry").length === 0) continue;
      out[k] = limpio;
      continue;
    }
    out[k] = v;
  }
  return out as T;
}

function sinContexto(o: Obj): Obj {
  const { "@context": _c, ...resto } = o;
  void _c;
  return resto;
}

export type Direccion = { calle?: string | null; ciudad?: string | null; provincia?: string | null; cp?: string | null };

function direccionPostal(d?: Direccion | null): Obj | undefined {
  if (!d) return undefined;
  return { "@type": "PostalAddress", streetAddress: d.calle, addressLocality: d.ciudad, addressRegion: d.provincia, postalCode: d.cp, addressCountry: "AR" };
}

export type Franja = { dia: number; abre: string; cierra: string };

/** Horario semanal (0 = domingo … 6 = sábado, "HH:MM") → `OpeningHoursSpecification`. PURA. */
export function horarios(franjas: readonly Franja[] | null | undefined): Obj[] {
  const DIAS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (franjas ?? [])
    .filter((f) => f.dia >= 0 && f.dia <= 6 && /^\d{2}:\d{2}$/.test(f.abre) && /^\d{2}:\d{2}$/.test(f.cierra))
    .map((f) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DIAS[f.dia]}`, opens: f.abre, closes: f.cierra }));
}

export type Negocio = {
  nombre: string;
  url: string;
  descripcion?: string | null;
  imagen?: string | null;
  logo?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: Direccion | null;
  horarios?: readonly Franja[] | null;
  /** Perfiles públicos verificables (Instagram, etc.). */
  redes?: readonly string[] | null;
};

/** `@type` por rubro: tienda, estética, taller, club/cancha, profe, software. */
export type TipoDeNegocio = "Store" | "HealthAndBeautyBusiness" | "AutoRepair" | "SportsActivityLocation" | "Person" | "SoftwareApplication";

export function negocioLd(tipo: Exclude<TipoDeNegocio, "Person" | "SoftwareApplication">, n: Negocio): Obj {
  return sinVacios({
    "@context": "https://schema.org",
    "@type": tipo,
    "@id": `${n.url}#negocio`,
    name: n.nombre,
    url: n.url,
    description: n.descripcion,
    image: n.imagen,
    logo: n.logo,
    telephone: n.telefono,
    email: n.email,
    address: direccionPostal(n.direccion),
    openingHoursSpecification: horarios(n.horarios),
    sameAs: n.redes ?? undefined,
  });
}

export type ProductoLd = {
  nombre: string;
  url: string;
  precio: number | null;
  /** `true` hay stock; `false` agotado; `null` no se sabe (no se emite availability). */
  hayStock?: boolean | null;
  imagen?: string | null;
  marca?: string | null;
  descripcion?: string | null;
  sku?: string | null;
  /** Precio por unidad de medida (carne por kilo): `KGM`. */
  unidad?: "KGM" | null;
  /** Atributos (aroma de una vela, talle). */
  atributos?: readonly { nombre: string; valor: string }[] | null;
};

export function productoLd(p: ProductoLd, vendedor?: { nombre: string; url: string } | null): Obj {
  const conPrecio = p.precio != null && admiteCentavos(p.precio) && p.precio > 0;
  const oferta = conPrecio
    ? sinVacios({
        "@type": "Offer",
        price: textoAlCentavo(p.precio as number),
        priceCurrency: "ARS",
        url: p.url,
        availability: p.hayStock == null ? undefined : p.hayStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        priceSpecification: p.unidad
          ? { "@type": "UnitPriceSpecification", price: textoAlCentavo(p.precio as number), priceCurrency: "ARS", unitCode: p.unidad, referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: p.unidad } }
          : undefined,
        seller: vendedor ? { "@type": "Organization", name: vendedor.nombre, url: vendedor.url } : undefined,
      })
    : undefined;
  return sinVacios({
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nombre,
    url: p.url,
    image: p.imagen,
    description: p.descripcion,
    sku: p.sku,
    brand: p.marca ? { "@type": "Brand", name: p.marca } : undefined,
    additionalProperty: (p.atributos ?? []).map((a) => ({ "@type": "PropertyValue", name: a.nombre, value: a.valor })),
    offers: oferta,
  });
}

/** Catálogo como `ItemList` de `Product` (una sola etiqueta por página en vez de una por producto). */
export function catalogoLd(productos: readonly ProductoLd[], vendedor: { nombre: string; url: string }): Obj {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: productos.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: sinContexto(productoLd(p, vendedor)) })),
  };
}

export type ServicioLd = { nombre: string; url: string; precio?: number | null; duracionMin?: number | null; descripcion?: string | null };

export function servicioLd(s: ServicioLd, proveedor: { nombre: string; url: string; tipo: TipoDeNegocio }): Obj {
  return sinVacios({
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.nombre,
    url: s.url,
    description: s.descripcion,
    provider: { "@type": proveedor.tipo, name: proveedor.nombre, url: proveedor.url },
    offers: s.precio != null && admiteCentavos(s.precio) && s.precio > 0 ? { "@type": "Offer", price: textoAlCentavo(s.precio), priceCurrency: "ARS" } : undefined,
    // ISO 8601: PT60M.
    timeRequired: s.duracionMin ? `PT${Math.round(s.duracionMin)}M` : undefined,
  });
}

export function personaLd(p: {
  nombre: string;
  url: string;
  oficio?: string | null;
  imagen?: string | null;
  redes?: readonly string[] | null;
  lugar?: Negocio | null;
  ofertas?: readonly { nombre: string; precio: number | null }[] | null;
}): Obj {
  return sinVacios({
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.nombre,
    url: p.url,
    jobTitle: p.oficio,
    image: p.imagen,
    sameAs: p.redes ?? undefined,
    workLocation: p.lugar ? sinContexto(negocioLd("SportsActivityLocation", p.lugar)) : undefined,
    makesOffer: (p.ofertas ?? [])
      .filter((o) => o.precio != null && admiteCentavos(o.precio) && o.precio > 0)
      .map((o) => ({ "@type": "Offer", name: o.nombre, price: textoAlCentavo(o.precio as number), priceCurrency: "ARS" })),
  });
}

/** Serializa para `<script type="application/ld+json">` sin abrir la puerta a cerrar la etiqueta. PURA. */
export function serializarLd(datos: Obj | Obj[]): string {
  return JSON.stringify(datos)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}
