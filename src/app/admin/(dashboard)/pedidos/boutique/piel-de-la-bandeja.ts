// ============================================================================
// LA PIEL DE LA BANDEJA DEL MOSTRADOR BOUTIQUE — la misma que Vender y Armar (Magra, tanda práctica).
// ============================================================================
//
// La bandeja en columnas se arma con la hoja del diseño nuevo («renglón», `public/diseno/renglon.css`)
// acotada a esta pantalla, y esa hoja trae su paleta CLARA y su letra (Archivo Renglón, 88 KB): el
// flujo Vender → bandeja → Armar saltaba de oscuro a claro y bajaba una letra más. Con
// `data-piel="mostrador"` en la raíz de la bandeja:
//   · los colores vuelven a ser los del negocio (los que pone su estética en la raíz del panel, los
//     de Vender): los tokens de la piel se HEREDAN (`inherit`) y la paleta interna del renglón
//     (lienzo, hoja, tinta…) sale de ellos; la letra, la del panel (Open Sans en Magra);
//   · a 390 px no hay scroll de costado: la barra de filtros y las solapas de las columnas bajan de
//     renglón en vez de correrse, y el buscador ocupa su propia fila (antes quedaba en 54 px).
// Sólo existe con el mostrador boutique prendido: CH (apagado) no la recibe.
//
// Especificidad: todo va con `[data-diseno="renglon"][data-piel="mostrador"]` (dos atributos), por
// encima de las reglas de la hoja del renglón (un atributo en la raíz), cargue antes o después.

export const PIEL_DEL_MOSTRADOR = "mostrador";

const RAIZ = `[data-diseno="renglon"][data-piel="${PIEL_DEL_MOSTRADOR}"]`;

/** Los tokens que la estética del negocio pone en la raíz del panel: en la bandeja se heredan. */
export const TOKENS_HEREDADOS = [
  "--surface",
  "--surface-raised",
  "--surface-sunken",
  "--surface-inverted",
  "--text-strong",
  "--text",
  "--text-muted",
  "--text-faint",
  "--line",
  "--line-strong",
  "--accent",
  "--accent-hover",
  "--accent-soft",
  "--accent-ink",
  "--text-on-accent",
  "--success",
  "--success-soft",
  "--success-fill",
  "--warning",
  "--warning-soft",
  "--warning-fill",
  "--danger",
  "--danger-soft",
  "--danger-fill",
  "--info",
  "--info-soft",
  "--focus-ring",
  "--bar-track",
] as const;

/** La paleta interna del renglón, armada con los tokens heredados (los que usa el resto de la hoja). */
const PALETA_DEL_RENGLON: readonly [string, string][] = [
  ["--lienzo", "var(--surface)"],
  ["--hoja", "var(--surface-raised)"],
  ["--hundido", "var(--surface-sunken)"],
  ["--apretado", "var(--surface-sunken)"],
  ["--linea", "var(--line)"],
  ["--linea-2", "var(--line-strong)"],
  ["--linea-campo", "var(--line-strong)"],
  ["--tinta", "var(--text-strong)"],
  ["--tinta-cuerpo", "var(--text)"],
  ["--tinta-2", "var(--text-muted)"],
  ["--tinta-3", "var(--text-faint)"],
  ["--invertido", "var(--surface-inverted)"],
];

export const CSS_DE_LA_PIEL = [
  `${RAIZ}{color-scheme:inherit;font-family:inherit;--font-ui:inherit;`,
  TOKENS_HEREDADOS.map((t) => `${t}:inherit;`).join(""),
  PALETA_DEL_RENGLON.map(([t, v]) => `${t}:${v};`).join(""),
  `}`,
  // El cuerpo con la letra del panel (la hoja del renglón la fija en cada pieza con --font-ui).
  `${RAIZ} :is(input,select,textarea,button){font-family:inherit;}`,
  // 390 px: sin scroll de costado. La barra y las solapas bajan de renglón; el buscador, fila propia.
  `@media (max-width:639px){`,
  `${RAIZ} [data-tablero="pedidos"]>[data-ui="filtros"]{flex-wrap:wrap;overflow-x:visible;margin-inline:0;padding-inline:0;}`,
  `${RAIZ} [data-tablero="pedidos"]>[data-ui="filtros"]>[role="group"]{flex-wrap:wrap;max-width:100%;overflow-x:visible;}`,
  `${RAIZ} [data-tablero="pedidos"]>[data-ui="filtros"]>:has(>input[type="search"]){flex:1 1 100%;max-width:none;margin-left:0;}`,
  `}`,
  `@media (max-width:1023px){`,
  `${RAIZ} [data-bandeja="columnas"]>[role="tablist"]{flex-wrap:wrap;overflow-x:visible;}`,
  `}`,
].join("");
