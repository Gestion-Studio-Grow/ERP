// Marca de cada inmobiliaria en su sitio público y en los links del inquilino y del propietario.
// Es DATO por negocio, no código: sumar una inmobiliaria con marca propia es agregar su fila acá
// y sus archivos en public/tenants/<slug>/marca/. Sin fila, sale con su nombre en letras y la
// paleta neutra.
//
// 🔒 Antes de cargar la marca de un cliente (logo, fotos, colores) hace falta su autorización
// REGISTRADA (CLAUDE.md, "Generador de preset": sin OK explícito no se genera ni se muestra).
// Por eso acá sólo está la demo: su marca es inventada.

export interface MarcaInmo {
  logo: string | null;
  /** Color de marca (botones, filetes, carteles) y el color del texto que va encima. */
  acento: string;
  acentoTinta: string;
  tinta: string;
  papel: string;
  /** La frase grande de la portada. */
  lema: string;
  bajada: string;
  /** Foto de la portada. Sin ella, se usa la primera foto de la primera destacada. */
  portada: string | null;
  /** Año desde el que trabaja, si se quiere mostrar. */
  desde: number | null;
}

const NEUTRA: MarcaInmo = {
  logo: null,
  acento: "#2c6e77",
  acentoTinta: "#ffffff",
  tinta: "#14212b",
  papel: "#f7f5f1",
  lema: "Tu próxima propiedad, con alguien que conoce el barrio.",
  bajada: "Venta, alquiler, tasaciones y administración de alquileres.",
  portada: null,
  desde: null,
};

// Inmobiliaria Demo: marca inventada para mostrar el producto.
const DEMO: MarcaInmo = {
  ...NEUTRA,
  acento: "#b5533c",
  lema: "Encontrá tu lugar en zona sur.",
  bajada: "Venta, alquiler y tasaciones, con alguien que conoce cada cuadra.",
  portada: "/demo-inmo/casa-2.svg",
  desde: 2009,
};

// PDC Propiedades (Monte Grande). El dueño de GSG confirmó el 13/10/2026 que el cliente autorizó
// usar su marca: logo, colores y textos tomados ese día de www.pdcpropiedades.com.ar (rojo #e42528,
// gris #545456, lema de portada, "desde 2009", matrícula). El logo es el suyo (logo.png, 3152×1686);
// si mandan uno en vectores, reemplazarlo. Fotos de propiedades: todavía las de muestra.
const PDC: MarcaInmo = {
  logo: "/tenants/pdcinmobiliaria/marca/logo.png",
  acento: "#e42528",
  acentoTinta: "#ffffff",
  tinta: "#2b2b2d",
  papel: "#ffffff",
  lema: "Tu próxima propiedad en Monte Grande.",
  bajada: "Venta, alquiler y tasaciones en Esteban Echeverría y zona sur.",
  // La foto del local (Ramón Santamarina 1128), tomada de la portada de su sitio.
  portada: "/tenants/pdcinmobiliaria/marca/portada.jpg",
  desde: 2009,
};

const POR_SLUG: Record<string, MarcaInmo> = {
  "inmo-demo": DEMO,
  pdcinmobiliaria: PDC,
};

export function marcaInmo(slug: string | null | undefined): MarcaInmo {
  return (slug && POR_SLUG[slug]) || NEUTRA;
}
