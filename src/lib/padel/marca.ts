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
  /** Fondo de las tarjetas y los campos (sobre el papel). */
  superficie: string;
  /** Texto sobre la tinta (la cabecera). */
  sobreTinta: string;
  /** Texto sobre la cancha (el botón principal). */
  sobreCancha: string;
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
  superficie: "#ffffff",
  sobreTinta: "#ffffff",
  sobreCancha: "#ffffff",
  lema: "Elegí día y hora. Te confirmo por WhatsApp.",
};

const POR_SLUG: Record<string, MarcaProfe> = {
  // Matías Consoli (@matiasconsoli): provisional a confirmar. Sin autorización registrada
  // todavía, va la paleta neutra con su nombre en letras.
};

export function marcaProfe(slug: string | null | undefined): MarcaProfe {
  return (slug && POR_SLUG[slug]) || NEUTRA;
}

// ── La piel como variables CSS ──────────────────────────────────────────────────────────────
// La paleta se inyecta UNA sola vez en el contenedor raíz de cada pantalla pública
// (src/app/clases/_piel.tsx) y los componentes la leen con `var(--padel-*)`: ningún hex suelto
// en un `style` (regla de marca, matias-DISENO.md §1.2 · M-052). Los colores de peligro no son
// del profe: salen del tema (`--danger`), así el rojo es el mismo en todo el producto.

/** Las variables que pinta `varsCss`, por si un componente quiere nombrarlas sin tipear el string. */
export const VARS_PADEL = {
  tinta: "--padel-tinta",
  cancha: "--padel-cancha",
  vivo: "--padel-vivo",
  papel: "--padel-papel",
  texto: "--padel-texto",
  suave: "--padel-suave",
  linea: "--padel-linea",
  superficie: "--padel-superficie",
  sobreTinta: "--padel-sobre-tinta",
  sobreCancha: "--padel-sobre-cancha",
} as const satisfies Partial<Record<keyof MarcaProfe, `--padel-${string}`>>;

export type VarsPadel = Record<`--padel-${string}`, string>;

const COLOR_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * La marca del profe como variables CSS, para el `style` del contenedor raíz. Sólo claves
 * `--padel-*`: un hex nunca queda fuera de una variable. Un color mal cargado en la fila del
 * profe (no es un hex) cae al de la paleta neutra en vez de romper la pantalla.
 */
export function varsCss(m: MarcaProfe): VarsPadel {
  const vars: VarsPadel = {};
  for (const [clave, variable] of Object.entries(VARS_PADEL) as [keyof typeof VARS_PADEL, string][]) {
    const valor = m[clave];
    vars[variable as `--padel-${string}`] = typeof valor === "string" && COLOR_HEX.test(valor) ? valor : NEUTRA[clave];
  }
  vars["--padel-peligro"] = "var(--danger)";
  vars["--padel-peligro-suave"] = "var(--danger-soft)";
  vars["--padel-ok-suave"] = "color-mix(in srgb, var(--padel-cancha) 12%, var(--padel-superficie))";
  return vars;
}
