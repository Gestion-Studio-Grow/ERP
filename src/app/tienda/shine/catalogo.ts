// ============================================================================
// EL CATÁLOGO DE SHINE — datos puros (sin React): familias, aromas, fotos y la nota del pedido.
// ============================================================================
//
// Fuente única: el catálogo oficial «Velas y Aromas» que subió la dueña el 02/09/2026, extraído
// página por página en docs/diseno/catalogo-shine-2026.md [VERIFICADO]. Las fotos son las del mismo
// PDF (public/demo-shine-shop/img/*.jpg), convertidas a WebP en public/tenants/shinevelas/productos/
// (`<foto>-480.webp` para miniaturas y `<foto>-900.webp` para tarjeta y ficha; el lado largo ≤ 900 px).
//
// En la vidriera manda el ERP: nombre, precio y stock salen de la base (lo carga la dueña). Este archivo
// sólo VISTE cada producto del ERP —familia, detalle, foto, aromas— buscándolo por su nombre
// normalizado (patrón quebienoles/perfumes.ts). Lo que no está en el catálogo no se inventa: un producto
// sin entrada lleva una foto real de su familia rotulada «Foto ilustrativa · a confirmar», o el ícono de
// la marca si ni la familia se reconoce. shine.test.ts ata todo esto al documento fuente.

export type FamiliaId = "envase" | "molde" | "perso" | "difu" | "extras";

/** Las familias del catálogo, en el orden de sus páginas (p5-20). «Personalizadas» separa las que se encargan con anticipación. */
export const FAMILIAS: readonly { id: FamiliaId; nombre: string }[] = [
  { id: "envase", nombre: "Velas de envase" },
  { id: "molde", nombre: "Velas de molde" },
  { id: "perso", nombre: "Personalizadas" },
  { id: "difu", nombre: "Difusores y home" },
  { id: "extras", nombre: "Extras" },
];

/** Aromas del catálogo (p3-4), con los nombres exactos. */
export const AROMAS_VELA = [
  "Vainilla & Caramelo",
  "Rosas",
  "Lavanda",
  "Frutos Rojos",
  "Bebé",
  "Coco & Lima",
  "Limón & Jengibre",
  "Flores Blancas",
  "Mango & Maracuyá",
] as const;
export const AROMAS_DIFUSOR = ["Peras & Flores", "Naranja & Jengibre", "Vaini & Coco", "Limón & Jengibre", "Flores Blancas", "Tilo"] as const;
/** Todos, sin repetir (Limón & Jengibre y Flores Blancas están en las dos cartas). */
export const TODOS_LOS_AROMAS: readonly string[] = [...new Set<string>([...AROMAS_VELA, ...AROMAS_DIFUSOR])];

/** Qué carta de aromas se ofrece: la de velas, la de difusores y home spray, o ninguna (el producto no lleva fragancia). */
export type CartaDeAromas = "vela" | "difusor" | null;

export function aromasDe(carta: CartaDeAromas): readonly string[] {
  return carta === "vela" ? AROMAS_VELA : carta === "difusor" ? AROMAS_DIFUSOR : [];
}

export type EntradaCatalogo = {
  /** Identificador estable (va en `?p=`). */
  clave: string;
  /** El nombre tal como figura en el catálogo. */
  nombre: string;
  familia: FamiliaId;
  /** El detalle del catálogo (tamaño, material, variantes); null si la página sólo trae nombre y precio. */
  detalle: string | null;
  /** Precio de la página del catálogo (02/09/2026). En pantalla manda el del ERP. */
  precio: number;
  /** El precio es «desde» (tiene varios tamaños). */
  desde?: boolean;
  /** Se encarga con anticipación (lo dice el catálogo). */
  conAnticipacion?: boolean;
  /** Fotos (nombre de archivo sin sufijo), la primera es la principal. */
  fotos: readonly string[];
  /** Qué ve la foto, para el `alt` (sin colores ni materiales que el catálogo no dice). */
  enFoto: string;
  carta: CartaDeAromas;
  /** Otras formas en que puede estar cargado en el ERP. */
  alias?: readonly string[];
};

const E = (e: EntradaCatalogo) => e;

export const CATALOGO: readonly EntradaCatalogo[] = [
  // ── Velas de envase (p7-12)
  E({ clave: "medio-kilo", nombre: "Medio kilo de vela", familia: "envase", detalle: "Frasco de vidrio con moños adheridos · 500 g", precio: 25000, fotos: ["medio-kilo"], enFoto: "vela de medio kilo en frasco de vidrio con moños", carta: "vela", alias: ["Medio kilo"] }),
  E({ clave: "morronero-figuras", nombre: "Morronero con figuras", familia: "envase", detalle: "Decorada con ositos, corazones, cereales o frambuesas", precio: 13000, fotos: ["morronero-figuras"], enFoto: "velas morronero decoradas con figuras", carta: "vela" }),
  E({ clave: "morronero-liso", nombre: "Morronero liso", familia: "envase", detalle: "200 g", precio: 12000, fotos: ["morronero-liso"], enFoto: "vela morronero lisa de 200 g", carta: "vela" }),
  E({ clave: "mini-morronero", nombre: "Mini morronero", familia: "envase", detalle: "100 g · puede variar el lazo", precio: 8000, fotos: ["mini-morronero"], enFoto: "velas mini morronero de 100 g con lazo", carta: "vela" }),
  E({ clave: "tenesse", nombre: "Envase Tenesse", familia: "envase", detalle: "320 g · liso, aplique alas o aplique mariposa", precio: 17000, fotos: ["tenesse-alas", "tenesse-mariposa"], enFoto: "vela en envase Tenesse de 320 g con aplique", carta: "vela", alias: ["Tenesse"] }),
  E({ clave: "lata", nombre: "Lata de vidrio", familia: "envase", detalle: "480 g · cerezas, patitas, ojo turco, estampitas florales o retro", precio: 28000, fotos: ["lata-cerezas", "lata-patitas"], enFoto: "vela en lata de vidrio de 480 g con motivo", carta: "vela" }),
  E({ clave: "refill-velas", nombre: "Refill velas de envase", familia: "envase", detalle: "100 g · con tu envase limpio y listo (si no, hay recargo por limpieza)", precio: 3000, fotos: ["refill-velas"], enFoto: "recarga de cera en un envase de vela", carta: "vela", alias: ["Refill de vela", "Refill velas"] }),
  // ── Personalizadas (p8-9: se encargan con anticipación)
  E({ clave: "huele-a-que", nombre: "“Huele a que…”", familia: "perso", detalle: "Elegís cómo termina la frase (…vas a ser abuela, la madrina, tío)", precio: 19000, conAnticipacion: true, fotos: ["huele-a-que"], enFoto: "vela personalizada con la frase «Huele a que…»", carta: "vela", alias: ["Huele a que"] }),
  E({ clave: "morronero-perso", nombre: "Morronero personalizado", familia: "perso", detalle: "Sticker con la frase que quieras (AMIGA, FAMILIA, COSMETÓLOGA…)", precio: 13000, conAnticipacion: true, fotos: ["morronero-perso"], enFoto: "vela morronero con sticker de frase personalizada", carta: "vela" }),
  // ── Velas de molde (p13-18)
  E({ clave: "peonia", nombre: "Peonia", familia: "molde", detalle: null, precio: 7500, fotos: ["peonia"], enFoto: "vela de molde con forma de peonia", carta: "vela", alias: ["Peonía"] }),
  E({ clave: "rosa", nombre: "Rosa", familia: "molde", detalle: null, precio: 6000, fotos: ["rosas"], enFoto: "velas de molde con forma de rosa", carta: "vela" }),
  E({ clave: "flor-de-loto", nombre: "Flor de loto", familia: "molde", detalle: null, precio: 7000, fotos: ["flor-loto"], enFoto: "vela de molde con forma de flor de loto", carta: "vela" }),
  E({ clave: "margarita", nombre: "Margarita", familia: "molde", detalle: "Sola · en bolsita de organza $3.000", precio: 2500, fotos: ["margaritas"], enFoto: "velas de molde con forma de margarita", carta: "vela" }),
  E({ clave: "bouquet", nombre: "Bouquet floral", familia: "molde", detalle: "Ramo de velas de molde", precio: 28000, fotos: ["bouquet"], enFoto: "bouquet de velas con forma de flores", carta: "vela", alias: ["Bouquet"] }),
  E({ clave: "oso-xl", nombre: "Oso XL", familia: "molde", detalle: null, precio: 8500, fotos: ["osos"], enFoto: "velas de molde con forma de oso", carta: "vela" }),
  E({ clave: "oso-teddy", nombre: "Oso Teddy", familia: "molde", detalle: null, precio: 7000, fotos: ["osos"], enFoto: "velas de molde con forma de oso", carta: "vela" }),
  E({ clave: "mini-oso", nombre: "Mini oso", familia: "molde", detalle: null, precio: 4500, fotos: ["osos"], enFoto: "velas de molde con forma de oso", carta: "vela" }),
  E({ clave: "pastillas", nombre: "Pastillas diseños", familia: "molde", detalle: null, precio: 6500, fotos: ["pastillas"], enFoto: "velas pastilla con diseños", carta: "vela", alias: ["Pastillas"] }),
  E({ clave: "corazon-texturado", nombre: "Corazón texturado", familia: "molde", detalle: null, precio: 7000, fotos: ["corazon-texturado"], enFoto: "vela de molde con forma de corazón texturado", carta: "vela" }),
  E({ clave: "leon", nombre: "León", familia: "molde", detalle: null, precio: 6000, fotos: ["leon-jirafa"], enFoto: "velas de molde con forma de león y de jirafa", carta: "vela" }),
  E({ clave: "jirafa", nombre: "Jirafa", familia: "molde", detalle: null, precio: 6000, fotos: ["leon-jirafa"], enFoto: "velas de molde con forma de león y de jirafa", carta: "vela" }),
  E({ clave: "almeja", nombre: "Almeja", familia: "molde", detalle: null, precio: 6000, fotos: ["almeja"], enFoto: "vela de molde con forma de almeja", carta: "vela" }),
  E({ clave: "buda", nombre: "Buda", familia: "molde", detalle: null, precio: 7000, fotos: ["buda"], enFoto: "vela de molde con forma de Buda", carta: "vela" }),
  E({ clave: "sol-luna", nombre: "Sol & Luna", familia: "molde", detalle: null, precio: 7500, fotos: ["sol-luna"], enFoto: "vela de molde con forma de sol y luna", carta: "vela", alias: ["Sol y Luna"] }),
  E({ clave: "columna-xl", nombre: "Columna XL", familia: "molde", detalle: null, precio: 14000, fotos: ["columnas"], enFoto: "velas columna de molde", carta: "vela" }),
  E({ clave: "columna-mini", nombre: "Columna mini", familia: "molde", detalle: null, precio: 6000, fotos: ["columnas"], enFoto: "velas columna de molde", carta: "vela" }),
  E({ clave: "bubble-corazon", nombre: "Bubble corazón", familia: "molde", detalle: null, precio: 16000, fotos: ["bubble-corazon"], enFoto: "vela bubble con forma de corazón", carta: "vela" }),
  E({ clave: "bubble-x2", nombre: "Bubble x2", familia: "molde", detalle: "Dos velas bubble", precio: 7500, fotos: ["bubble-x2"], enFoto: "dos velas bubble", carta: "vela" }),
  E({ clave: "candelabro", nombre: "Vela candelabro + moño", familia: "molde", detalle: null, precio: 27000, fotos: ["candelabro"], enFoto: "vela de candelabro con moño", carta: "vela", alias: ["Vela candelabro"] }),
  E({ clave: "perita", nombre: "Perita", familia: "molde", detalle: null, precio: 9500, fotos: ["perita"], enFoto: "vela de molde con forma de pera", carta: "vela" }),
  E({ clave: "cilindro", nombre: "Cilindro texturado", familia: "molde", detalle: null, precio: 8000, fotos: ["cilindro"], enFoto: "vela cilindro texturada", carta: "vela" }),
  E({ clave: "estructurales", nombre: "Estructurales x2", familia: "molde", detalle: "Par de velas estructurales", precio: 18000, fotos: ["estructurales"], enFoto: "par de velas estructurales", carta: "vela" }),
  E({ clave: "velon-mariposa", nombre: "Velón mariposa", familia: "molde", detalle: null, precio: 21000, fotos: ["velon-mariposa"], enFoto: "velón con mariposa", carta: "vela" }),
  // ── Difusores y home (p5-6)
  E({ clave: "difusor-petaca", nombre: "Difusor petaca", familia: "difu", detalle: "Vidrio · 200 cc · incluye varillas", precio: 15000, fotos: ["difusor-petaca"], enFoto: "difusor petaca de vidrio de 200 cc con varillas", carta: "difusor" }),
  E({ clave: "difusor-rose", nombre: "Difusor rosé", familia: "difu", detalle: "Plástico · 125 cc · incluye varillas", precio: 13000, fotos: ["difusor-rose"], enFoto: "difusor rosé de 125 cc con varillas", carta: "difusor", alias: ["Difusor rose"] }),
  E({ clave: "kit-difu-home", nombre: "Kit difu + home", familia: "difu", detalle: "Difusor rosé + home spray grande + varillas", precio: 23000, fotos: ["kit-difu-home"], enFoto: "kit de difusor rosé, home spray grande y varillas", carta: "difusor", alias: ["Kit difu home"] }),
  E({ clave: "home-spray-grande", nombre: "Home spray grande", familia: "difu", detalle: "Plástico · 250 cc", precio: 13000, fotos: ["home-spray-grande"], enFoto: "home spray grande de 250 cc", carta: "difusor" }),
  E({ clave: "home-spray-chico", nombre: "Home spray chico", familia: "difu", detalle: "Plástico transparente · 200 cc", precio: 10000, fotos: ["home-spray-chico"], enFoto: "home spray chico transparente de 200 cc", carta: "difusor" }),
  E({ clave: "refill-difu", nombre: "Refill difu/home", familia: "difu", detalle: "200 cc $9.000 · 300 cc $11.000 · 500 cc $19.000", precio: 9000, desde: true, fotos: ["refill-difu"], enFoto: "recarga para difusor y home spray", carta: "difusor", alias: ["Refill difu home", "Refill difusor"] }),
  // ── Extras (p19-20). [A VALIDAR con la dueña] si tabletas y bombones se eligen de la carta de velas:
  // el catálogo no lo dice, así que no se ofrece carta y la ficha invita a consultar el aroma.
  E({ clave: "tabletas", nombre: "Tabletas aromáticas", familia: "extras", detalle: null, precio: 6500, fotos: ["tabletas"], enFoto: "tabletas aromáticas", carta: null }),
  E({ clave: "apaga-velas", nombre: "Apaga velas", familia: "extras", detalle: "Con dijes", precio: 5000, fotos: ["apagavelas"], enFoto: "apaga velas con dijes", carta: null, alias: ["Apagavelas"] }),
  E({ clave: "bombones", nombre: "Bombones aromáticos", familia: "extras", detalle: "En bolsita de organza", precio: 3000, fotos: ["bombones"], enFoto: "bombones aromáticos en bolsita de organza", carta: null }),
];

/** "“Huele a que…”" → "huele a que"; "Sol & Luna" → "sol y luna"; "Peonía" → "peonia". */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDICE: ReadonlyMap<string, EntradaCatalogo> = new Map(
  CATALOGO.flatMap((e) => [e.nombre, ...(e.alias ?? [])].map((n) => [normalizar(n), e] as const)),
);
const POR_CLAVE: ReadonlyMap<string, EntradaCatalogo> = new Map(CATALOGO.map((e) => [e.clave, e]));

export function entradaDe(nombre: string): EntradaCatalogo | null {
  return INDICE.get(normalizar(nombre)) ?? null;
}
export function entradaPorClave(clave: string): EntradaCatalogo | null {
  return POR_CLAVE.get(clave) ?? null;
}

export const CARPETA = "/tenants/shinevelas";
export const rutaFoto = (foto: string, tam: 480 | 900) => `${CARPETA}/productos/${foto}-${tam}.webp`;

/** Familia de un producto que no está en el catálogo, por su nombre (p. ej. los de la semilla del rubro). */
export function familiaPorNombre(nombre: string): FamiliaId | null {
  const n = normalizar(nombre);
  if (/\b(difusor|home spray|aromatizante|sahumerio|textil)/.test(n)) return "difu";
  if (/\bpersonalizad/.test(n)) return "perso";
  if (/\b(vela|velon|velita)/.test(n)) return "envase";
  return null;
}

/** La foto real que representa a una familia cuando el producto no tiene la suya. */
const FOTO_DE_FAMILIA: Readonly<Record<FamiliaId, string | null>> = {
  envase: "morronero-liso",
  molde: "peonia",
  perso: "morronero-perso",
  difu: "difusor-rose",
  extras: null,
};

/** Cómo se ve un producto del ERP en la vidriera. */
export type Vista = {
  /** Para `?p=`: la clave del catálogo, o el id del producto si no está. */
  clave: string;
  familia: FamiliaId | null;
  detalle: string | null;
  /** Rutas de foto (900) en orden; vacío = sin foto (ícono de la marca). */
  fotos: readonly string[];
  /** Miniatura (480) de la primera foto, o null. */
  miniatura: string | null;
  /** La foto es de otro producto de la familia: se rotula «Foto ilustrativa · a confirmar». */
  ilustrativa: boolean;
  alt: string;
  carta: CartaDeAromas;
  aromas: readonly string[];
  conAnticipacion: boolean;
  desde: boolean;
  enCatalogo: boolean;
};

export function vistaDe(p: { id: string; name: string }): Vista {
  const e = entradaDe(p.name);
  if (e) {
    return {
      clave: e.clave,
      familia: e.familia,
      detalle: e.detalle,
      fotos: e.fotos.map((f) => rutaFoto(f, 900)),
      miniatura: rutaFoto(e.fotos[0], 480),
      ilustrativa: false,
      alt: `Foto del catálogo de Shine: ${e.enFoto}.`,
      carta: e.carta,
      aromas: aromasDe(e.carta),
      conAnticipacion: Boolean(e.conAnticipacion),
      desde: Boolean(e.desde),
      enCatalogo: true,
    };
  }
  const familia = familiaPorNombre(p.name);
  const foto = familia ? FOTO_DE_FAMILIA[familia] : null;
  const carta: CartaDeAromas = familia === "difu" ? "difusor" : familia ? "vela" : null;
  return {
    clave: p.id,
    familia,
    detalle: null,
    fotos: foto ? [rutaFoto(foto, 900)] : [],
    miniatura: foto ? rutaFoto(foto, 480) : null,
    ilustrativa: true,
    alt: foto ? `Foto ilustrativa de la familia ${nombreDeFamilia(familia)}: no es ${p.name}.` : "",
    carta,
    aromas: aromasDe(carta),
    conAnticipacion: false,
    desde: false,
    enCatalogo: false,
  };
}

export function nombreDeFamilia(id: FamiliaId | null): string {
  return FAMILIAS.find((f) => f.id === id)?.nombre ?? "Otros";
}

// ── La nota del pedido ────────────────────────────────────────────────────────────────────────
// El aroma de cada renglón viaja en `notes` (sin tocar el motor ni el schema): primero los renglones,
// «Peonia ×2 — Lavanda · Oso XL ×1 — Rosas», y después la nota libre de la clienta. El servidor corta la
// nota en 500 caracteres (order-actions.ts): si no entra todo, se recorta la nota libre, nunca los aromas.

export const TOPE_NOTA = 500;

export function notaConAromas(renglones: readonly { nombre: string; cantidad: number; aroma: string | null }[], libre: string): string {
  const aromas = renglones
    .filter((r) => r.aroma)
    .map((r) => `${r.nombre} ×${r.cantidad} — ${r.aroma}`)
    .join(" · ");
  const extra = libre.trim();
  if (!aromas) return extra.slice(0, TOPE_NOTA);
  const base = `Aromas: ${aromas}`.slice(0, TOPE_NOTA);
  if (!extra) return base;
  const lugar = TOPE_NOTA - base.length - 3;
  return lugar > 0 ? `${base} | ${extra.slice(0, lugar)}` : base;
}

// ── Para regalar (p13 y p6 del catálogo + el cierre de p21) ─────────────────────────────────
export const REGALOS: readonly { clave: string | null; titulo: string; texto: string; foto: string; enFoto: string }[] = [
  { clave: "bouquet", titulo: "Bouquet floral", texto: "Un ramo de velas de molde, con el aroma que elijas.", foto: "bouquet", enFoto: "bouquet de velas con forma de flores" },
  { clave: "kit-difu-home", titulo: "Kit difu + home", texto: "Difusor rosé, home spray grande y varillas.", foto: "kit-difu-home", enFoto: "kit de difusor rosé, home spray grande y varillas" },
  {
    clave: null,
    titulo: "Souvenirs y pedidos personalizados",
    texto: "Si buscabas algo que no encontraste acá, ¡consultanos! Realizamos souvenirs y pedidos personalizados.",
    foto: "huele-a-que",
    enFoto: "vela personalizada con la frase «Huele a que…»",
  },
];

/** Textos del catálogo (p2 y p21), copiados tal cual del documento fuente. */
export const MANIFIESTO =
  "Todas nuestras velitas: son aromáticas y podés elegir su fragancia. Están realizadas de forma artesanal, con mucho amor y cera de soja. No son solo velas. Son pausas, rituales y atmósferas que transforman lo cotidiano.";
export const CIERRE = "Si buscabas algo que no encontraste acá, ¡consultanos! Realizamos souvenirs y pedidos personalizados.";
