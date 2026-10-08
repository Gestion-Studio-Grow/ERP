// Marca de cada taller en sus superficies propias (landing, link del cliente, papeles).
// Es DATO por negocio, no código: sumar un taller con marca propia es agregar su fila acá y
// sus archivos en public/tenants/<slug>/marca/. Sin fila, el taller sale con su nombre en
// letras y la paleta neutra.

export interface MarcaTaller {
  logo: string | null;
  /** Color de marca (botones, filetes). */
  rojo: string;
  tinta: string;
  papel: string;
  lema: string;
  servicios: string[];
  /** Puntaje público de Google, si se conoce. Provisional: se actualiza a mano. */
  google?: { puntaje: string; url: string };
}

const NEUTRA: MarcaTaller = {
  logo: null,
  rojo: "#c8102e",
  tinta: "#111111",
  papel: "#ffffff",
  lema: "Tu auto en buenas manos.",
  servicios: ["Mecánica general", "Frenos", "Tren delantero", "Service", "Inyección", "Diagnóstico computarizado"],
};

// Taller Mecánico AGR — Monte Grande. Leído de su Instagram (@tallermecanicoagr) y de su ficha de
// Google Maps el 08/10/2026, con autorización del dueño: óvalo blanco de borde negro, "AGR" en
// rojo, "Taller / Mecánico" en letra con serifa. El logo es el suyo: recortado de su posteo del
// 25/04/2026 (498×247, fondo transparente por fuera del óvalo).
const AGR: MarcaTaller = {
  logo: "/tenants/taller-agr/marca/logo.webp",
  rojo: "#c8102e",
  tinta: "#111111",
  papel: "#ffffff",
  lema: "Expertos en cuidado automotor.",
  servicios: ["Motores", "Frenos", "Suspensión y tren delantero", "Inyección", "Diagnóstico computarizado", "Service y mantenimiento"],
  google: { puntaje: "4,6", url: "https://maps.app.goo.gl/7JRjRZ53rN3Chx5x8" },
};

// El slug exacto lo fija el alta de la consola; se aceptan las variantes razonables.
const POR_SLUG: Record<string, MarcaTaller> = {
  "taller-agr": AGR,
  "taller-mecanico-agr": AGR,
  tallermecanicoagr: AGR,
  talleragr: AGR,
  agr: AGR,
};

export function marcaTaller(slug: string | null | undefined): MarcaTaller {
  return (slug && POR_SLUG[slug]) || NEUTRA;
}
