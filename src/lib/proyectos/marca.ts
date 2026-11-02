// Marca de cada productora en sus superficies propias (propuesta al cliente, papeles). Es DATO por
// negocio: sumar una con marca propia es agregar su fila acá y sus archivos en
// public/tenants/<slug>/marca/. Sin fila, sale con su nombre en letras y la paleta neutra.

export interface MarcaProductora {
  logoOscuro: string | null;
  logoClaro: string | null;
  acento: string;
  papel: string;
  tinta: string;
  lema: string;
}

const NEUTRA: MarcaProductora = { logoOscuro: null, logoClaro: null, acento: "#111111", papel: "#ffffff", tinta: "#111111", lema: "" };

// MIA Producciones. Leído de miaproducciones.com.ar el 01/11/2026 (estilos computados y variables de
// :root), con autorización del dueño: letra Work Sans, azul #0049D5, crema #E3E1D4, tinta #1A1A1A. Su
// sitio avisa que se está renovando: confirmar que esta sigue siendo la marca vigente.
const MIA: MarcaProductora = {
  logoOscuro: "/tenants/mia-producciones/marca/logo-negro.svg",
  logoClaro: "/tenants/mia-producciones/marca/logo-crema.svg",
  acento: "#0049D5",
  papel: "#E3E1D4",
  tinta: "#1A1A1A",
  lema: "Creamos. Diseñamos. Desarrollamos. Producimos.",
};

const POR_SLUG: Record<string, MarcaProductora> = {
  "mia-producciones": MIA,
  miaproducciones: MIA,
  mia: MIA,
};

export function marcaProductora(slug: string | null | undefined): MarcaProductora {
  return (slug && POR_SLUG[slug]) || NEUTRA;
}
