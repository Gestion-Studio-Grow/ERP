// ============================================================================
// PEDÍ LOCAL · LA MARCA DEL LOCAL EN SU VIDRIERA — de la config a variables CSS seguras. PURA.
// ============================================================================
//
// `ConfigDeliveryLocal.marca` es opcional y todo lo de adentro también: sin material, la vidriera
// va con la piel GSG (los tokens del tema). Con material (y su autorización registrada, ADR-042),
// esto decide QUÉ se puede usar sin romper el contraste AA:
//   · `colorPrimario` pinta botones y el acento. El texto encima se elige (tinta o blanco) por
//     contraste; como texto suelto (precios, enlaces) sólo se usa si da ≥ 4,5:1 contra el fondo.
//   · `colorFondo` sólo se acepta si es claro (la piel es clara: los textos del tema no se invierten).
//   · `logoUrl` y `fotoPortada`: rutas propias (`/…`) o https. Otra cosa se ignora.
// Las variables son PROPIAS del módulo (`--pl-*`, local.module.css): los tokens de tema compartidos
// no se tocan.

export type MarcaDelLocal = {
  logoUrl?: string;
  colorPrimario?: string;
  colorFondo?: string;
  fotoPortada?: string;
};

export type PielDelLocal = {
  /** Variables CSS para el `style` de la raíz. Vacío = piel GSG. */
  variables: Record<string, string>;
  logoUrl: string | null;
  fotoPortada: string | null;
};

type Rgb = [number, number, number];

/** `#rgb` o `#rrggbb` → [r, g, b]; cualquier otra cosa, null. */
export function leerHex(x: string | undefined): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((x ?? "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** Luminancia relativa WCAG 2.x. */
export function luminancia([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contraste(a: Rgb, b: Rgb): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const TINTA: Rgb = [28, 25, 23];
const BLANCO: Rgb = [255, 255, 255];
const hex = (c: Rgb) => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
/** Fondo de referencia cuando el local no trae el suyo (la superficie hueso de la piel GSG). */
const HUESO: Rgb = [250, 248, 244];

function urlSegura(u: string | undefined): string | null {
  const s = (u ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return /^https:\/\/[^\s"'()<>]+$/i.test(s) ? s : null;
}

/** La piel de la vidriera: lo usable de la marca del local, o nada (piel GSG). */
export function pielDelLocal(marca: MarcaDelLocal | null | undefined): PielDelLocal {
  const variables: Record<string, string> = {};
  const fondo = leerHex(marca?.colorFondo);
  const fondoOk = fondo && luminancia(fondo) >= 0.6 ? fondo : null;
  if (fondoOk) variables["--pl-fondo"] = hex(fondoOk);

  const primario = leerHex(marca?.colorPrimario);
  if (primario) {
    const tinta = contraste(primario, TINTA) >= contraste(primario, BLANCO) ? TINTA : BLANCO;
    variables["--pl-primario"] = hex(primario);
    variables["--pl-sobre-primario"] = hex(tinta);
    // Como texto suelto, sólo si se lee contra el fondo (AA 4,5:1); si no, queda la tinta del tema.
    if (contraste(primario, fondoOk ?? HUESO) >= 4.5) variables["--pl-primario-texto"] = hex(primario);
  }
  return { variables, logoUrl: urlSegura(marca?.logoUrl), fotoPortada: urlSegura(marca?.fotoPortada) };
}
