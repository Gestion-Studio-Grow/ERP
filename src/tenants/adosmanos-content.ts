// Contenido editorial de la VIDRIERA de A DOS MANOS PÁDEL (tenant `adosmanos`).
//
// ⚠️ HONESTIDAD DE MARCA. El negocio real (@adosmanospadel, AR) NO tiene web ni redes
// públicas accesibles (Instagram login-walled; sin TiendaNube/Linktree — verificado en
// sesiones previas y 2026-07-13). Por eso NO se inventa identidad, historia ni reseñas.
// El copy se construye SÓLO con los hechos conocidos del negocio (rubro `padel`):
//   · dos líneas: palas + zapatillas, catálogo chico y elegido a mano
//   · marcas líderes: Adidas, Bullpadel, Nox, Siux, Head, Asics
//   · 28% off pagando por transferencia · cuotas 3 y 12 sin interés (Mercado Pago)
//   · envío gratis superando $300.000 · envíos a todo el país · cambios dentro de 30 días
//   · asesoramiento personalizado por WhatsApp · "vendemos lo que usaríamos en cancha"
//   · horario Lun a sáb, 10 a 19 h
// …y el MUNDO del pádel (velocidad, impacto, la pala, la cancha, la comunidad), que es
// dominio del rubro, no invención de marca. Sin reseñas (van vacías: no se fabrican).
//
// 🎨 IMÁGENES: generadas por IA (Pollinations, gratis — scripts/gen-adosmanos-imgs.sh),
// servidas locales desde /tenants/adosmanos/gen/. NO son fotos con derechos de marcas.
//
// El diseño que consume esto (src/app/tienda/AdosmanosFront.tsx) aplica la técnica
// scroll-reveal-composition (.claude/skills/): tipografía grande y liviana, lienzo ancho
// + vacío dosificado, revelado por scroll con opacity+translateY, color por la materia —
// sobre un lienzo cancha-de-noche (carbón + acento verde-teal del tenant), con el
// catálogo + carrito del ERP detrás (placeOnlineOrder → bandeja/POS/stock).

const GEN = "/tenants/adosmanos/gen";

export interface AdmValueProp {
  glyph: string; // figura de acento (no emoji de color)
  title: string;
  text: string;
}

export interface AdmLine {
  tag: string;
  title: string;
  text: string;
  img: string;
  href: string; // ancla a la sección del catálogo
}

export interface AdmContent {
  // Wordmark partido para pintar el acento en "DOS"
  brandLead: string; // "A "
  brandAccent: string; // "DOS"
  brandTail: string; // " MANOS"
  brandSub: string; // "Pádel · Tienda"
  whatsapp: string | null;
  // HERO
  heroEyebrow: string;
  heroTitle: string;
  heroTitleAccent: string; // segunda línea, en acento
  heroLede: string;
  heroImg: string;
  // Manifiesto (tesis de marca — el "por qué")
  manifestoKicker: string;
  manifestoTitle: string;
  manifestoBody: string;
  // Propuestas de valor
  valueProps: AdmValueProp[];
  // Dos líneas
  linesKicker: string;
  linesTitle: string;
  lines: AdmLine[];
  // Cómo comprar (medios de pago / envíos, hechos reales)
  buyKicker: string;
  buyTitle: string;
  payments: { label: string; text: string }[];
  // Marcas
  providersLabel: string;
  providers: string[];
  // About (honesto)
  aboutTitle: string;
  aboutBody: string;
  courtImg: string;
  // Footer
  hoursLabel: string;
  deliveryZones: string;
}

export const ADOSMANOS: AdmContent = {
  brandLead: "A ",
  brandAccent: "DOS",
  brandTail: " MANOS",
  brandSub: "Pádel · Tienda",
  whatsapp: null, // el CTA de WhatsApp pide el número just-in-time si no hay uno real configurado

  heroEyebrow: "Tienda de pádel",
  heroTitle: "TU JUEGO",
  heroTitleAccent: "EMPIEZA ACÁ",
  heroLede:
    "Dos líneas —palas y zapatillas— de las mejores marcas, elegidas a mano. No vendemos de todo: vendemos lo que probaríamos en cancha, y te ayudamos a encontrar la que le sirve a tu juego.",
  heroImg: `${GEN}/hero.jpg`,

  manifestoKicker: "Por qué A Dos Manos",
  manifestoTitle: "El sonido de la pala. La comunidad. La cancha.",
  manifestoBody:
    "El pádel no es solo un deporte: es el saque del sábado, la revancha, los amigos que se hacen en la cancha. Nosotros lo jugamos. Por eso el catálogo es chico y honesto: pocas palas y pocas zapatillas, las que de verdad valen la pena, con asesoramiento real para que compres tranquilo.",

  valueProps: [
    { glyph: "◆", title: "Elegidas a mano", text: "Pocas palas y zapatillas, las mejores marcas. No vendemos de todo: vendemos lo que recomendamos." },
    { glyph: "✳", title: "Asesoramiento real", text: "Te ayudamos por WhatsApp a elegir según tu nivel y tu juego, sin vueltas." },
    { glyph: "$", title: "28% off por transferencia", text: "Mejor precio pagando por transferencia. También débito, crédito y Mercado Pago." },
    { glyph: "▣", title: "Cuotas sin interés", text: "3 y 12 cuotas sin interés con Mercado Pago." },
    { glyph: "→", title: "Envíos a todo el país", text: "Envío gratis superando $300.000. Cambios dentro de los 30 días." },
  ],

  linesKicker: "Nuestras líneas",
  linesTitle: "Dos líneas, bien elegidas",
  lines: [
    { tag: "01", title: "Palas", text: "De iniciación a tope de gama: Adidas, Bullpadel, Nox, Siux y Head. Te ayudamos a encontrar el balance, la forma y el peso para tu juego.", img: `${GEN}/line-palas.jpg`, href: "#palas" },
    { tag: "02", title: "Zapatillas", text: "Agarre y amortiguación pensados para la pista: Asics, Adidas, Bullpadel y Head. La base de todo buen partido.", img: `${GEN}/line-zapas.jpg`, href: "#zapatillas" },
  ],

  buyKicker: "Cómo comprar",
  buyTitle: "Claro y sin vueltas",
  payments: [
    { label: "Transferencia", text: "28% off sobre el precio de lista." },
    { label: "Tarjetas", text: "Débito y crédito." },
    { label: "Mercado Pago", text: "3 y 12 cuotas sin interés." },
    { label: "Envíos", text: "A todo el país. Gratis superando $300.000." },
    { label: "Cambios", text: "Dentro de los 30 días." },
    { label: "Asesoramiento", text: "Por WhatsApp, antes y después de comprar." },
  ],

  providersLabel: "Trabajamos con",
  providers: ["Adidas", "Bullpadel", "Nox", "Siux", "Head", "Asics"],

  aboutTitle: "Vendemos lo que usaríamos nosotros.",
  aboutBody:
    "En A Dos Manos no vas a encontrar de todo: elegimos pocas palas y zapatillas, de las mejores marcas, y sumamos solo lo que probaríamos en cancha. La idea es simple: que puedas comprar con confianza y que, si tenés dudas, te asesoremos para encontrar la que de verdad te sirve según tu juego. Escribinos y lo resolvemos sin vueltas.",
  courtImg: `${GEN}/court.jpg`,

  hoursLabel: "Lun a sáb · 10 a 19 h",
  deliveryZones: "Envíos a todo el país",
};

// ── Catálogo → SECCIÓN + IMAGEN por categoría (el catálogo real viene del ERP; acá se
// agrupa y se le asigna la imagen de su mundo, mapeando por el nombre del producto).
export type AdmSectionId = "palas" | "zapatillas" | "pelotas" | "bolsos" | "accesorios";

export interface AdmSection {
  id: AdmSectionId;
  label: string;
  blurb: string;
  img: string;
}

export const ADM_SECTIONS: AdmSection[] = [
  { id: "palas", label: "Palas", blurb: "De iniciación a tope de gama", img: `${GEN}/cat-palas.jpg` },
  { id: "zapatillas", label: "Zapatillas", blurb: "Agarre y amortiguación para la pista", img: `${GEN}/cat-zapatillas.jpg` },
  { id: "pelotas", label: "Pelotas", blurb: "Presión y durabilidad para jugar", img: `${GEN}/cat-pelotas.jpg` },
  { id: "bolsos", label: "Paleteros y mochilas", blurb: "Para llevar todo a la cancha", img: `${GEN}/cat-bolsos.jpg` },
  { id: "accesorios", label: "Accesorios", blurb: "Grips, muñequeras y protectores", img: `${GEN}/cat-accesorios.jpg` },
];

// Clasifica un producto por su nombre (el Core no tiene campo `category` todavía).
// `\bpala` matchea "Pala" y "Palas" (singular/plural) SIN comerse "paletero" (pale≠pala).
// El orden importa: paleteros/mochilas se resuelven antes que el fallback de accesorios.
export function admSectionOf(name: string): AdmSectionId {
  const n = name.toLowerCase();
  if (/paletero|mochila|bolso/.test(n)) return "bolsos";
  if (/\bpala/.test(n)) return "palas";
  if (/zapatilla/.test(n)) return "zapatillas";
  if (/pelota/.test(n)) return "pelotas";
  return "accesorios"; // overgrips, grips, muñequeras, protectores
}

const SECTION_IMG = Object.fromEntries(ADM_SECTIONS.map((s) => [s.id, s.img])) as Record<AdmSectionId, string>;
export function admImageOf(name: string): string {
  return SECTION_IMG[admSectionOf(name)];
}
