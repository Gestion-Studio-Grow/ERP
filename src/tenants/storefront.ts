// Copy de vidriera POR TENANT — la "voz firma" y estructura de contenido de cada
// negocio, para que la vidriera espeje su sitio real y se sienta SUYA desde el minuto uno.
//
// Distinción (FUNDAMENTOS §2, ver docs/preventa/playbook-lectura-redes-a-tenant.md):
//   - El RUBRO (src/blueprints/retail/rubros.ts) da el wording GENÉRICO reusable.
//   - El TENANT da su copy PROPIO (tagline firma, propuestas de valor, secciones,
//     proveedores, reviews, about, footer) — lo que hace que la vidriera sea de ESE negocio.
//
// Se resuelve por slug mientras no exista contenido por tenant en DB (misma estrategia que
// el acento en src/lib/branding.ts). Sin match → null y la vidriera cae al wording del rubro.
//
// Contenido de MAGRA: espejado de su web oficial (magrameatmarket.com.ar). Los PRECIOS del
// catálogo son provisionales (rubro); estos textos/estructura son de su propia comunicación.

import type { ShippingConfig } from "@/lib/storefront-shipping";
import type { ProductSectionId } from "@/lib/storefront-visual";

export interface StorefrontValueProp {
  icon: string;
  title: string;
  text: string;
}

export interface StorefrontLine {
  title: string;
  text: string;
  /**
   * Sección del catálogo (`productSection`) que esta línea promociona (opcional).
   * Si está presente, la vidriera SOLO la muestra cuando esa sección tiene al menos
   * un producto comprable — evita "anunciar" un mundo (p. ej. Decoración/Accesorios)
   * con góndola vacía (QA m-1, 2026-07-07). Sin `section` → se muestra siempre
   * (comportamiento histórico, p. ej. las líneas de magra).
   */
  section?: ProductSectionId;
}

export interface StorefrontReview {
  name: string;
  rating: number; // 1-5
  text: string;
}

// Paso del "ritual" — narrativa experiencial (elegir aroma → encender → habitar).
export interface StorefrontRitualStep {
  icon: string;
  title: string;
  text: string;
}

// Set/combo de regalo — la tienda no vende sólo unidades sueltas, arma experiencias.
export interface StorefrontGiftSet {
  name: string;
  /** Qué trae el set (texto corto). */
  items: string;
  /** Precio del combo (ARS). Opcional: si no está, es "a consultar". */
  price?: number;
  /** Nota corta (p. ej. "más vendido", "edición limitada"). */
  note?: string;
}

export interface StorefrontCopy {
  /** Eyebrow del hero (arriba del nombre). */
  eyebrow: string;
  /** Frase madre / tagline firma. */
  tagline: string;
  /** Sub-titular punchy debajo de la frase madre (diferencial de marketing). */
  pitch?: string;
  /** Bajada del hero. */
  intro: string;
  /** Tira de propuestas de valor. */
  valueProps: StorefrontValueProp[];
  /** Sección "Envasados al vacío": título + líneas (vaca/cerdo/pollo). */
  vacioTitle: string;
  vacioLines: StorefrontLine[];
  /** Sección "Productos gourmet": título + ítems. */
  gourmetTitle: string;
  gourmetItems: string[];
  /** Proveedores/marcas. */
  providers: string[];
  /** Reviews reales del sitio. */
  reviews: StorefrontReview[];
  /** Sección "sobre nosotros". */
  about: { title: string; body: string };
  /** Footer. */
  deliveryZones: string[];
  paymentMethods: string[];
  /**
   * Config de envío del tenant (opcional). Presente → la vidriera calcula costo de
   * envío + nudge "te faltan $X para envío gratis" (ver storefront-shipping.ts).
   * Ausente → la vidriera se comporta como siempre (sin línea de envío). Provisional:
   * se persistirá por tenant en DB junto con branding/copy.
   */
  shipping?: ShippingConfig;
  /**
   * Sección experiencial "Armá tu ritual" (opcional). Presente → la vidriera muestra
   * el recorrido narrativo (elegir aroma → encender → habitar el momento). Para
   * tiendas donde la compra es una EXPERIENCIA, no sólo un producto.
   */
  ritual?: { title: string; intro: string; steps: StorefrontRitualStep[] };
  /**
   * Sets/combos de regalo (opcional). Presente → sección de experiencias armadas
   * (sets de regalo, cajas). Sube el ticket y ordena la decisión del cliente.
   */
  giftSets?: { title: string; intro?: string; sets: StorefrontGiftSet[] };
}

// --- MAGRA Meat Market (Canning) — espejado de su web ---
const magra: StorefrontCopy = {
  eyebrow: "MAGRA · Canning",
  tagline: "Esto no es una carnicería.",
  pitch: "Cortes de restaurante. Precio de barrio.",
  intro: "La calidad de las mejores parrillas de Buenos Aires, envasada al vacío para tu mesa —sin el precio del restaurante. No hace falta saber de cortes: solo tener buen gusto (y hambre).",
  valueProps: [
    { icon: "◆", title: "Calidad de parrilla top", text: "Los cortes que comés en los mejores restaurantes, envasados al vacío." },
    { icon: "$", title: "Precio de barrio", text: "Sin el markup del restaurante: pagás como en la carnicería, comés como afuera." },
    { icon: "→", title: "Envío gratis a domicilio", text: "Delivery sin cargo en Canning y alrededores." },
    { icon: "▣", title: "Todos los medios de pago", text: "Efectivo, débito, crédito, transferencia y Mercado Pago." },
    { icon: "✳", title: "Atención personalizada", text: "Te asesoramos y coordinamos tu pedido por WhatsApp." },
  ],
  vacioTitle: "Envasados al vacío",
  vacioLines: [
    { title: "Carne de vaca", text: "Distribuidor oficial de Estancia Don Ramón. Cortes premium seleccionados." },
    { title: "Cerdo", text: "Cortes magros, bajos en grasa." },
    { title: "Pollo orgánico", text: "Criado sin agregados, sabor natural." },
  ],
  gourmetTitle: "Productos gourmet",
  gourmetItems: [
    "Pastas italianas",
    "Conservas importadas",
    "Ensaladas y vegetales envasados",
    "Pescado congelado envasado",
  ],
  providers: ["Estancia Don Ramón", "Tinos", "Breaders", "Paladini", "Lamberti", "Formagge", "PizzaZen", "Maderasa"],
  // Reviews reales del sitio (Matías R., Jesica F., Macarena A. — 5/5). Textos que
  // reflejan los temas reales (calidad, envasado, atención por WhatsApp).
  reviews: [
    { name: "Matías R.", rating: 5, text: "Calidad impecable y todo llega perfecto, bien envasado al vacío. Una experiencia premium." },
    { name: "Jesica F.", rating: 5, text: "La atención por WhatsApp es un lujo: me asesoraron con cada corte. Volví a pedir enseguida." },
    { name: "Macarena A.", rating: 5, text: "Los encontré de casualidad y me sorprendió la presentación gourmet y el envío a casa." },
  ],
  about: {
    title: "Probadas por nosotros, elegidas para vos.",
    body: "Somos una boutique de carnes premium envasadas al vacío: la misma calidad que buscás en las mejores parrillas, a precio de carnicería de barrio. Seleccionamos cada corte de los mejores proveedores, con una línea gourmet elegida con el mismo criterio. Servicio puerta a puerta en Canning y alrededores.",
  },
  deliveryZones: ["Canning", "San Vicente", "Guernica", "Ezeiza", "Monte Grande"],
  paymentMethods: ["Efectivo", "Débito", "Crédito", "Transferencia", "Mercado Pago"],
};

// --- SHINE Velas de soja & deco (CABA) — voz de @shine.velas.store ---
// Segundo arquetipo, rubro `velas`. VISIÓN: no es sólo vender velas, es una
// EXPERIENCIA — velas + aromas + DECORACIÓN para el hogar + accesorios del ritual.
// Marca: "Que tu luz nunca se apague". Envío con umbral de envío gratis real (fijo
// $3.500, gratis desde $25.000). PRECIOS del catálogo (rubro) provisionales; estos
// textos son de su comunicación / la voz experiencial de la marca.
const shinevelas: StorefrontCopy = {
  eyebrow: "SHINE · Velas · aromas · deco",
  tagline: "No es una vela. Es un ambiente.",
  pitch: "Velas, aromas y decoración para vivir tu casa distinto.",
  intro:
    "Cera de soja, mecha de algodón y fragancias que cambian cómo se siente un espacio. No vendemos productos sueltos: armamos el ambiente de tu casa. Elegí, encendé y habitá el momento.",
  valueProps: [
    { icon: "✿", title: "Cera de soja natural", text: "Vegetal, biodegradable y de combustión limpia: sin humo ni hollín." },
    { icon: "❖", title: "Velas + deco para el hogar", text: "Velas, difusores, objetos deco y accesorios que combinan entre sí." },
    { icon: "◈", title: "Hecho y elegido a mano", text: "Piezas en lotes chicos y una curaduría de deco con el mismo criterio." },
    { icon: "→", title: "Envío gratis desde $25.000", text: "Envío a domicilio en CABA y GBA; gratis a partir de $25.000." },
    { icon: "✳", title: "Sets de regalo", text: "Experiencias armadas para regalar —o para regalarte." },
  ],
  vacioTitle: "Mundos para tu casa",
  vacioLines: [
    { title: "Velas", text: "Aromáticas, decorativas y artesanales, en cera de soja con mecha de algodón.", section: "velas" },
    { title: "Aromas", text: "Difusores, sahumerios y textiles para perfumar cada rincón por semanas.", section: "aromas" },
    { title: "Decoración", text: "Portavelas, bandejas, floreros y espejos que completan la escena.", section: "decoracion" },
    { title: "Accesorios", text: "Los detalles del ritual: cortamechas, apagadores y fósforos largos.", section: "accesorios" },
  ],
  gourmetTitle: "Aromas de temporada",
  gourmetItems: ["Vainilla y canela", "Flor de naranjo", "Sándalo", "Lavanda", "Coco y vainilla", "Jazmín", "Cedro y ámbar"],
  providers: [],
  ritual: {
    title: "Armá tu ritual",
    intro: "Un aroma no se compra, se vive. Tres pasos para convertir un momento cualquiera en algo tuyo.",
    steps: [
      { icon: "1", title: "Elegí tu aroma", text: "Cálido para relajar, cítrico para despertar, amaderado para concentrarte. Cada fragancia arma una escena distinta." },
      { icon: "2", title: "Encendé y respirá", text: "Sumá un difusor o un textil a juego y dejá que el ambiente cambie. La luz baja, el aroma sube." },
      { icon: "3", title: "Habitá el momento", text: "Un portavela lindo, una bandeja, tu música. Tu casa deja de ser un lugar y pasa a ser un estado." },
    ],
  },
  giftSets: {
    title: "Sets de regalo",
    intro: "Experiencias listas para regalar —o para darte un gusto.",
    sets: [
      { name: "Set Ritual", items: "Vela de soja + difusor a juego + fósforos largos", price: 21900, note: "El más elegido" },
      { name: "Caja Aromas", items: "3 velas aromáticas en caja de regalo", price: 22900 },
      { name: "Set Deco & Luz", items: "Vela decorativa + portavela de cerámica + bandeja", price: 24900, note: "Envío gratis" },
    ],
  },
  // Reviews: VACÍO a propósito. Las 3 que había (Carla P./Sofía M./Belén R.) venían del
  // preview de preventa marcado "datos de ejemplo" — nombres y textos INVENTADOS, no
  // testimonios reales. Presentarlos como clientes reales viola DX-5 + honestidad de marca.
  // Se dejan fuera hasta que el dueño aporte reseñas reales (capturas de IG/WhatsApp).
  reviews: [],
  about: {
    title: "No vendemos velas. Creamos ambientes.",
    body: "Shine nació de una obsesión simple: que la luz y el aroma puedan cambiar cómo se siente un espacio. Empezamos con velas de soja hechas a mano y hoy sumamos difusores, objetos de decoración y los accesorios del ritual —todo elegido con el mismo criterio para que combine entre sí. No comprás un producto: armás el ambiente de tu casa. Para que tu luz nunca se apague.",
  },
  deliveryZones: ["CABA", "GBA"],
  paymentMethods: ["Efectivo", "Transferencia", "Débito", "Crédito", "Mercado Pago"],
  shipping: { flatRate: 3500, freeThreshold: 25000 },
};

// --- A DOS MANOS Pádel (`adosmanos`, rubro `padel`) — voz de @adosmanospadel ---
// ⚠️ PROVISIONAL — relevamiento DX-5 real PENDIENTE. La fuente real del negocio es su
// Instagram (@adosmanospadel), hoy INACCESIBLE (login-walled; sin web/TiendaNube/Linktree
// públicos — verificado por WebFetch + WebSearch 2026-07-07). Por eso este copy se arma
// SÓLO con hechos del MODELO de negocio (rubro `padel` + términos conocidos: 2 líneas
// palas/zapatillas, marcas líderes, 28% off por transferencia, cuotas 3 y 12, envío gratis
// >$300.000, envíos a todo el país, cambios 30 días) y una voz de marca sobria y genérica.
// NO se inventa: reviews (van vacías), historia de origen ni precios fuera del rubro.
// El dueño debe aportar el material real (bio, about, testimonios, catálogo/precios) o una
// captura del IG para cerrar el DX-5 fiel. Marcado provisional a confirmar.
const adosmanos: StorefrontCopy = {
  eyebrow: "A DOS MANOS · Pádel",
  tagline: "Palas y zapatillas, para jugar mejor.",
  pitch: "Tienda chica, elegida a mano.",
  intro:
    "Dos líneas, las mejores marcas y asesoramiento personalizado. No vendemos de todo: elegimos pocas palas y zapatillas —las que valen la pena— y te ayudamos a encontrar la que le sirve a tu juego. Mirá el catálogo y hacé tu pedido.",
  valueProps: [
    { icon: "◆", title: "Elegidas a mano", text: "Pocas palas y zapatillas, las mejores marcas: no vendemos de todo, vendemos lo que recomendamos." },
    { icon: "✳", title: "Asesoramiento real", text: "Te ayudamos por WhatsApp a elegir según tu nivel y tu juego, sin vueltas." },
    { icon: "$", title: "28% off por transferencia", text: "Mejor precio pagando por transferencia; también débito, crédito y Mercado Pago." },
    { icon: "▣", title: "Cuotas sin interés", text: "3 y 12 cuotas sin interés con Mercado Pago." },
    { icon: "→", title: "Envíos a todo el país", text: "Envío gratis superando $300.000. Cambios dentro de los 30 días." },
  ],
  vacioTitle: "Nuestras líneas",
  vacioLines: [
    { title: "Palas", text: "De iniciación a tope de gama: Adidas, Bullpadel, Nox, Siux y Head.", section: "palas" },
    { title: "Zapatillas", text: "Agarre y amortiguación pensados para la pista: Asics, Adidas, Bullpadel y Head.", section: "calzado" },
  ],
  gourmetTitle: "También",
  gourmetItems: ["Pelotas", "Paleteros y mochilas", "Grips y overgrips", "Muñequeras", "Protectores"],
  providers: ["Adidas", "Bullpadel", "Nox", "Siux", "Head", "Asics"],
  // Sin reseñas reales relevadas → vacío (no se inventan clientes). El dueño las aporta.
  reviews: [],
  about: {
    title: "Vendemos lo que usaríamos nosotros.",
    body: "En A Dos Manos no vas a encontrar de todo: elegimos pocas palas y zapatillas, de las mejores marcas, y sumamos solo lo que probaríamos en cancha. La idea es simple: que puedas comprar con confianza y que, si tenés dudas, te asesoremos para encontrar la que de verdad te sirve según tu juego. Escribinos y lo resolvemos sin vueltas.",
  },
  deliveryZones: ["Envíos a todo el país"],
  paymentMethods: ["Transferencia (28% off)", "Débito", "Crédito", "Mercado Pago", "Cuotas 3 y 12 sin interés"],
  // shipping: se OMITE a propósito — el umbral real de envío gratis ($300.000) se comunica
  // como propuesta de valor, pero no hay tarifa plana real confirmada para el calculador.
};

const COPY_BY_SLUG: Record<string, StorefrontCopy> = {
  magra,
  shinevelas,
  adosmanos,
};

export function getStorefrontCopy(slug: string | null | undefined): StorefrontCopy | null {
  if (!slug) return null;
  return COPY_BY_SLUG[slug] ?? null;
}
