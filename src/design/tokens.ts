// ============================================================================
// TOKENS DE «RENGLÓN» — la fuente única del color, la forma, la letra y el movimiento.
// ============================================================================
//
// «Un renglón por cosa. La plata en su columna. Una tecla por renglón.» (ADR-099)
//
// Los valores son texto CSS (OKLCH, `var()`, `color-mix(in oklch, …)`, `oklch(from …)`). De acá salen:
//   · el bloque de variables de la hoja (src/design/hoja.ts arma public/diseno/renglon.css);
//   · el test de contraste (tokens.test.ts), que resuelve cada par con el acento real de cada
//     negocio (ACCENT_PRESETS de src/lib/branding.ts), en claro y en oscuro, con los neutros de
//     respaldo y con los neutros teñidos del negocio;
//   · la galería (/operador/diseno).
//
// DOS CAPAS DE NOMBRES, un solo valor:
//   · los nombres de ROL de «Renglón» (`--lienzo`, `--hoja`, `--hundido`, `--linea`, `--tinta`…),
//     que usan las piezas nuevas;
//   · los nombres SEMÁNTICOS que ya consume todo el panel por Tailwind (`bg-surface`,
//     `text-muted`, `border-line`, `bg-accent`…, globals.css @theme inline). Cada uno apunta al rol.
//     Por eso, con `data-diseno="renglon"` en la raíz de un layout, las pantallas que todavía no se
//     rehicieron toman la materia nueva (plana, sin sombras, la letra, el gris del negocio) sin
//     tocar una clase.
//
// EL GRIS DEL NEGOCIO: los neutros se declaran una vez con matiz 80 y croma casi nulo (respaldo) y,
// donde el navegador entiende color relativo, toman el MATIZ del acento del negocio
// (`oklch(from var(--accent) L C h)`): CH queda gris petróleo, MAGRA gris vino, Shine gris ámbar,
// sin tocar un token a mano. Las dos versiones se miden (tokens.test.ts).

export type Modo = "claro" | "oscuro";

/** El acento de GSG cuando no hay negocio (consola del operador, contador, Facturita, galería): carbónico. */
export const ACENTO_GSG = {
  claro: "oklch(38% 0.16 285)",
  sobreClaro: "#ffffff",
  oscuro: "oklch(80% 0.1 285)",
  sobreOscuro: "oklch(17% 0.01 285)",
} as const;

const acentoYSobre = (modo: Modo) =>
  modo === "claro"
    ? {
        "--accent": `var(--tenant-accent-light, ${ACENTO_GSG.claro})`,
        "--text-on-accent": `var(--tenant-on-accent-light, ${ACENTO_GSG.sobreClaro})`,
      }
    : {
        "--accent": `var(--tenant-accent-dark, ${ACENTO_GSG.oscuro})`,
        "--text-on-accent": `var(--tenant-on-accent-dark, ${ACENTO_GSG.sobreOscuro})`,
      };

/**
 * Los neutros por rol: luminosidad y croma. El matiz lo pone el respaldo (80) o el acento del
 * negocio (bloque `@supports` de la hoja). Un solo lugar para los dos: `neutros()`.
 */
const NEUTROS: Record<Modo, Record<string, [l: string, c: number]>> = {
  claro: {
    "--lienzo": ["97.2%", 0.004], // fondo de la pantalla
    "--hoja": ["99.3%", 0.002], // filas, campos, hojas emergentes
    "--hundido": ["94.6%", 0.005], // cabecera de tabla, chip, kbd, pista del segmentado
    "--apretado": ["91.5%", 0.006], // tecla neutra apretada
    "--linea": ["88%", 0.006], // la raya de 1 px
    "--linea-2": ["76%", 0.008], // raya fuerte: total del ticket, foco de fila
    "--linea-campo": ["58%", 0.012], // el borde de un campo: 3:1 con lo que lo rodea (WCAG 1.4.11)
    "--tinta": ["20%", 0.012], // texto fuerte
    "--tinta-cuerpo": ["26%", 0.012], // texto de lectura
    "--tinta-2": ["42%", 0.012], // secundario
    "--tinta-3": ["49%", 0.012], // terciario (≥ 13 px)
    "--invertido": ["23%", 0.012], // aviso flotante
  },
  oscuro: {
    "--lienzo": ["17%", 0.006],
    "--hoja": ["21%", 0.007],
    "--hundido": ["25.5%", 0.008],
    "--apretado": ["29%", 0.008],
    "--linea": ["31%", 0.008],
    "--linea-2": ["42%", 0.01],
    "--linea-campo": ["56%", 0.012],
    "--tinta": ["95%", 0.004],
    "--tinta-cuerpo": ["88%", 0.006],
    "--tinta-2": ["76%", 0.008],
    "--tinta-3": ["68%", 0.008],
    "--invertido": ["94%", 0.004],
  },
};

/** Matiz de respaldo de los neutros (donde no hay color relativo): un gris apenas tibio. */
export const MATIZ_RESPALDO = 80;

function neutros(modo: Modo, tenido: boolean): Record<string, string> {
  return Object.fromEntries(
    Object.entries(NEUTROS[modo]).map(([k, [l, c]]) => [
      k,
      tenido ? `oklch(from var(--accent) ${l} ${c} h)` : `oklch(${l} ${c} ${MATIZ_RESPALDO})`,
    ]),
  );
}

/** Los neutros teñidos con el matiz del negocio: van en el bloque `@supports` de la hoja. */
export function neutrosTenidos(modo: Modo): Record<string, string> {
  return neutros(modo, true);
}

/** Colores por modo (neutros de respaldo). Orden: roles, nombres de siempre, acento, estados. */
export const COLORES: Record<Modo, Record<string, string>> = {
  claro: {
    ...neutros("claro", false),
    // Los nombres que consume el panel (Tailwind), apuntando al rol.
    "--surface": "var(--lienzo)",
    "--background": "var(--lienzo)",
    "--surface-raised": "var(--hoja)",
    "--surface-floating": "var(--hoja)",
    "--surface-sunken": "var(--hundido)",
    "--surface-pressed": "var(--apretado)",
    "--surface-inverted": "var(--invertido)",
    "--text-strong": "var(--tinta)",
    "--foreground": "var(--tinta)",
    "--text": "var(--tinta-cuerpo)",
    "--text-muted": "var(--tinta-2)",
    "--text-faint": "var(--tinta-3)",
    "--text-inverted": "var(--lienzo)",
    "--line": "var(--linea)",
    "--line-strong": "var(--linea-2)",
    "--line-field": "var(--linea-campo)",
    // El acento del negocio (lo inyecta el layout) y sus derivados.
    ...acentoYSobre("claro"),
    "--acento": "var(--accent)",
    "--sobre-acento": "var(--text-on-accent)",
    "--accent-hover": "color-mix(in oklch, var(--accent), black 12%)",
    "--accent-soft": "color-mix(in oklch, var(--accent) 9%, var(--hoja))",
    "--acento-fondo": "var(--accent-soft)",
    "--accent-ink": "color-mix(in oklch, var(--accent) 80%, var(--tinta))",
    // Estados: palabra (ink), fondo tonal (soft) y señal para puntos y rayas (fill, 3:1).
    "--success": "oklch(44% 0.11 155)",
    "--success-soft": "oklch(95.2% 0.035 155)",
    "--success-fill": "oklch(58% 0.14 155)",
    "--warning": "oklch(48% 0.098 70)",
    "--warning-soft": "oklch(95.6% 0.036 82)",
    "--warning-fill": "oklch(62% 0.125 68)",
    "--danger": "oklch(47% 0.17 27)",
    "--danger-soft": "oklch(95.2% 0.024 22)",
    "--danger-fill": "oklch(56% 0.19 27)",
    "--danger-solid": "oklch(47% 0.17 27)",
    "--text-on-danger": "oklch(99% 0.004 27)",
    "--info": "var(--accent-ink)",
    "--info-soft": "var(--accent-soft)",
    "--info-fill": "var(--accent)",
    "--cobrado": "var(--success)",
    "--atencion": "var(--warning)",
    "--peligro": "var(--danger)",
    "--bar-track": "var(--hundido)",
    "--focus-ring": "var(--accent)",
    "--seleccion": "var(--accent-soft)",
  },
  oscuro: {
    ...neutros("oscuro", false),
    "--surface": "var(--lienzo)",
    "--background": "var(--lienzo)",
    "--surface-raised": "var(--hoja)",
    "--surface-floating": "var(--hoja)",
    "--surface-sunken": "var(--hundido)",
    "--surface-pressed": "var(--apretado)",
    "--surface-inverted": "var(--invertido)",
    "--text-strong": "var(--tinta)",
    "--foreground": "var(--tinta)",
    "--text": "var(--tinta-cuerpo)",
    "--text-muted": "var(--tinta-2)",
    "--text-faint": "var(--tinta-3)",
    "--text-inverted": "var(--lienzo)",
    "--line": "var(--linea)",
    "--line-strong": "var(--linea-2)",
    "--line-field": "var(--linea-campo)",
    ...acentoYSobre("oscuro"),
    "--acento": "var(--accent)",
    "--sobre-acento": "var(--text-on-accent)",
    "--accent-hover": "color-mix(in oklch, var(--accent), white 10%)",
    "--accent-soft": "color-mix(in oklch, var(--accent) 16%, var(--hoja))",
    "--acento-fondo": "var(--accent-soft)",
    "--accent-ink": "color-mix(in oklch, var(--accent) 82%, white)",
    "--success": "oklch(79% 0.13 155)",
    "--success-soft": "oklch(27% 0.045 155)",
    "--success-fill": "oklch(70% 0.15 155)",
    "--warning": "oklch(83% 0.12 82)",
    "--warning-soft": "oklch(28% 0.045 75)",
    "--warning-fill": "oklch(78% 0.14 78)",
    "--danger": "oklch(77% 0.13 25)",
    "--danger-soft": "oklch(27% 0.055 25)",
    "--danger-fill": "oklch(68% 0.17 25)",
    "--danger-solid": "oklch(70% 0.16 25)",
    "--text-on-danger": "oklch(18% 0.03 25)",
    "--info": "var(--accent-ink)",
    "--info-soft": "var(--accent-soft)",
    "--info-fill": "var(--accent)",
    "--cobrado": "var(--success)",
    "--atencion": "var(--warning)",
    "--peligro": "var(--danger)",
    "--bar-track": "var(--hundido)",
    "--focus-ring": "var(--accent)",
    "--seleccion": "var(--accent-soft)",
  },
};

/**
 * Sombras por modo. Materia plana: NADA de sombra en filas, bloques ni teclas. Una sola sombra, de
 * una capa, para lo que flota (hoja, paleta, aviso, menú). Las variables de siempre (`shadow-card`,
 * `shadow-raised`…) quedan en `none` para que las pantallas viejas pierdan el relieve sin tocarlas.
 */
export const SOMBRAS: Record<Modo, Record<string, string>> = {
  claro: {
    "--sombra-flota": "0 8px 24px oklch(20% 0.01 80 / 0.16)",
    "--shadow-xs": "none",
    "--shadow-sm": "none",
    "--shadow-md": "none",
    "--shadow-lg": "var(--sombra-flota)",
  },
  oscuro: {
    "--sombra-flota": "0 8px 24px oklch(0% 0 0 / 0.5)",
    "--shadow-xs": "none",
    "--shadow-sm": "none",
    "--shadow-md": "none",
    "--shadow-lg": "var(--sombra-flota)",
  },
};

/** Lo que no cambia con el modo: forma, letra, grilla, movimiento. */
export const COMUNES: Record<string, string> = {
  // Forma: 4 px en teclas, campos, chips y marcas; 6 px en hojas, paleta y avisos; 0 en tablas,
  // bloques y renglones. Los cuatro de siempre (rounded-sm/md/lg/xl de Tailwind) bajan a esa escala.
  "--radius-sm": "4px",
  "--radius": "4px",
  "--radius-lg": "6px",
  "--radius-xl": "6px",
  "--radio-control": "4px",
  "--radio-flota": "6px",
  // Letra: una sola familia variable (Archivo: ancho 62–125, peso 100–900). Los anchos son la
  // jerarquía: rótulos y folios condensados, texto normal, cifras semicondensadas y pesadas.
  "--font-ui": '"Archivo Renglon", "Archivo Renglon Respaldo", Arial, sans-serif',
  "--wdth-rotulo": "85%",
  "--wdth-folio": "85%",
  "--wdth-titulo": "90%",
  "--wdth-cifra": "95%",
  "--wdth-cifra-grande": "85%",
  "--wdth-tecla": "95%",
  // Grilla del renglón: la plata siempre en la misma columna, en todas las pantallas.
  "--col-plata": "8rem",
  "--col-folio": "5.5rem",
  "--renglon": "2.5rem",
  "--renglon-movil": "3.25rem",
  "--margen": "1rem",
  "--ancho-max": "87.5rem",
  // Movimiento: 120 / 200 / 320 ms con una sola curva. Sin JS de animación.
  "--dur-1": "120ms",
  "--dur-2": "200ms",
  "--dur-3": "320ms",
  "--ease-out": "cubic-bezier(.2, .8, .2, 1)",
  // Piso táctil: 44 px en todo lo tocable.
  "--tap-min": "2.75rem",
};

// ── Pares que se miden ──────────────────────────────────────────────────────────────────────

/** Tinta principal: 7:1 (AAA). Texto: 4,5:1 (WCAG 1.4.3). Gráficos y bordes de un control: 3:1 (1.4.11). */
export type Minimo = 7 | 4.5 | 3;

export interface Par {
  /** Variable del frente (texto, punto, borde). */
  frente: string;
  /** Variable del fondo. Si es translúcido, se compone sobre `sobre`. */
  fondo: string;
  /** Si el fondo es translúcido: sobre qué superficie se apoya. */
  sobre?: string;
  minimo: Minimo;
  /** Dónde aparece, en una línea. */
  que: string;
}

const FONDOS = ["--lienzo", "--hoja", "--hundido"];

export const PARES: readonly Par[] = [
  // La tinta principal a 7:1 sobre las tres superficies; el resto de la tinta a 4,5:1.
  ...FONDOS.map((fondo) => ({ frente: "--tinta", fondo, minimo: 7 as const, que: `tinta sobre ${fondo}` })),
  ...["--tinta-cuerpo", "--tinta-2", "--tinta-3"].flatMap((frente) =>
    FONDOS.map((fondo) => ({ frente, fondo, minimo: 4.5 as const, que: `texto ${frente} sobre ${fondo}` })),
  ),
  { frente: "--tinta", fondo: "--apretado", minimo: 4.5, que: "tecla neutra apretada" },
  { frente: "--tinta", fondo: "--seleccion", minimo: 4.5, que: "fila seleccionada" },
  { frente: "--tinta-2", fondo: "--seleccion", minimo: 4.5, que: "detalle de una fila seleccionada" },
  { frente: "--text-inverted", fondo: "--surface-inverted", minimo: 4.5, que: "aviso flotante" },
  // El acento.
  { frente: "--text-on-accent", fondo: "--accent", minimo: 4.5, que: "palabra sobre la tecla principal" },
  { frente: "--text-on-accent", fondo: "--accent-hover", minimo: 4.5, que: "tecla principal con el puntero encima" },
  ...FONDOS.map((fondo) => ({
    frente: "--accent-ink",
    fondo,
    minimo: 4.5 as const,
    que: `acento como texto (enlace, pestaña) sobre ${fondo}`,
  })),
  { frente: "--accent-ink", fondo: "--accent-soft", minimo: 4.5, que: "acento sobre su fondo tonal" },
  { frente: "--accent", fondo: "--lienzo", minimo: 3, que: "raya de foco y pestaña activa sobre el lienzo" },
  { frente: "--accent", fondo: "--hoja", minimo: 3, que: "raya de foco sobre una fila" },
  // El borde de los campos.
  { frente: "--linea-campo", fondo: "--hoja", minimo: 3, que: "borde del campo sobre la hoja" },
  { frente: "--linea-campo", fondo: "--lienzo", minimo: 3, que: "borde del campo sobre el lienzo" },
  { frente: "--linea-campo", fondo: "--hundido", minimo: 3, que: "borde del campo sobre lo hundido" },
  // Estados: palabra sobre su fondo tonal y sobre las superficies; señal (punto, raya) a 3:1.
  ...["success", "warning", "danger"].flatMap((e) => [
    { frente: `--${e}`, fondo: `--${e}-soft`, minimo: 4.5 as const, que: `marca ${e} sobre su fondo` },
    { frente: `--${e}`, fondo: "--hoja", minimo: 4.5 as const, que: `marca ${e} sobre una fila` },
    { frente: `--${e}`, fondo: "--lienzo", minimo: 4.5 as const, que: `marca ${e} sobre el lienzo` },
    { frente: `--${e}`, fondo: "--hundido", minimo: 4.5 as const, que: `marca ${e} sobre lo hundido` },
    { frente: `--${e}-fill`, fondo: "--hoja", minimo: 3 as const, que: `señal ${e} sobre una fila` },
    { frente: `--${e}-fill`, fondo: "--lienzo", minimo: 3 as const, que: `señal ${e} sobre el lienzo` },
  ]),
  { frente: "--text-on-danger", fondo: "--danger-solid", minimo: 4.5, que: "«Tocá de nuevo para anular»" },
];

/** Todas las variables de un modo (comunes + colores + sombras), como las declara la hoja. */
export function variablesDe(modo: Modo, tenido = false): Record<string, string> {
  return { ...COMUNES, ...COLORES[modo], ...(tenido ? neutrosTenidos(modo) : {}), ...SOMBRAS[modo] };
}
