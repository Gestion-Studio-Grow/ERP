// Marca de cada profe en sus superficies públicas (turnero y link del alumno).
// Es DATO por negocio, no código: sumar un profe con marca propia es agregar su fila acá y sus
// archivos en public/tenants/<slug>/marca/. Sin fila, sale con su nombre en letras y la paleta
// de cancha neutra.
//
// ADR-034: no se copia foto, logo ni textos del Instagram del profe hasta que la autorización
// quede registrada en docs/tenants/<slug>/README.md. Hasta entonces, la paleta neutra.

export interface MarcaProfe {
  logo: string | null;
  /** Fondo de la cabecera (la cancha de noche). */
  tinta: string;
  /** Color de acción (botones, filetes): el verde de la cancha. */
  cancha: string;
  /** Verde vivo para "libre" y "listo". */
  vivo: string;
  papel: string;
  texto: string;
  suave: string;
  linea: string;
  lema: string;
}

const NEUTRA: MarcaProfe = {
  logo: null,
  tinta: "#101619",
  cancha: "#197934",
  vivo: "#30d158",
  papel: "#f5f5f7",
  texto: "#1d1d1f",
  suave: "#6e6e73",
  linea: "#e4e4e9",
  lema: "Elegí día y hora. Te confirmo por WhatsApp.",
};

const POR_SLUG: Record<string, MarcaProfe> = {
  // Matías Consoli (@matiasconsoli): provisional a confirmar. Sin autorización registrada
  // todavía, va la paleta neutra con su nombre en letras.
};

export function marcaProfe(slug: string | null | undefined): MarcaProfe {
  return (slug && POR_SLUG[slug]) || NEUTRA;
}
