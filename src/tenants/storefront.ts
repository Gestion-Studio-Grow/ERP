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

export interface StorefrontValueProp {
  icon: string;
  title: string;
  text: string;
}

export interface StorefrontLine {
  title: string;
  text: string;
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
    "Cera de soja natural, mecha de algodón y fragancias que cambian cómo se siente un espacio —más objetos de decoración elegidos con el mismo criterio. No vendemos productos sueltos: armamos el ambiente de tu casa. Elegí, encendé y habitá el momento.",
  valueProps: [
    { icon: "✿", title: "Cera de soja natural", text: "Vegetal, biodegradable y de combustión limpia: sin humo ni hollín." },
    { icon: "❖", title: "Velas + deco para el hogar", text: "Velas, difusores, objetos deco y accesorios que combinan entre sí." },
    { icon: "◈", title: "Hecho y elegido a mano", text: "Piezas en lotes chicos y una curaduría de deco con el mismo criterio." },
    { icon: "→", title: "Envío gratis desde $25.000", text: "Envío a domicilio en CABA y GBA; gratis a partir de $25.000." },
    { icon: "✳", title: "Sets de regalo", text: "Experiencias armadas para regalar —o para regalarte." },
  ],
  vacioTitle: "Mundos para tu casa",
  vacioLines: [
    { title: "Velas", text: "Aromáticas, decorativas y artesanales, en cera de soja con mecha de algodón." },
    { title: "Aromas", text: "Difusores, sahumerios y textiles para perfumar cada rincón por semanas." },
    { title: "Decoración", text: "Portavelas, bandejas, floreros y espejos que completan la escena." },
    { title: "Accesorios", text: "Los detalles del ritual: cortamechas, apagadores y fósforos largos." },
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
  reviews: [
    { name: "Carla P.", rating: 5, text: "Compré una vela y terminé armando toda la deco del living con ellos. El aroma dura muchísimo y queda divino." },
    { name: "Sofía M.", rating: 5, text: "El set de regalo es una experiencia: llega hermoso, se siente desde que abrís la caja. Ya pedí de nuevo." },
    { name: "Belén R.", rating: 5, text: "Me asesoraron por WhatsApp para combinar vela, difusor y portavela. Llegó todo perfecto y coordinado." },
  ],
  about: {
    title: "No vendemos velas. Creamos ambientes.",
    body: "Shine nació de una obsesión simple: que la luz y el aroma puedan cambiar cómo se siente un espacio. Empezamos con velas de soja hechas a mano y hoy sumamos difusores, objetos de decoración y los accesorios del ritual —todo elegido con el mismo criterio para que combine entre sí. No comprás un producto: armás el ambiente de tu casa. Para que tu luz nunca se apague.",
  },
  deliveryZones: ["CABA", "GBA"],
  paymentMethods: ["Efectivo", "Transferencia", "Débito", "Crédito", "Mercado Pago"],
  shipping: { flatRate: 3500, freeThreshold: 25000 },
};

const COPY_BY_SLUG: Record<string, StorefrontCopy> = {
  magra,
  shinevelas,
};

export function getStorefrontCopy(slug: string | null | undefined): StorefrontCopy | null {
  if (!slug) return null;
  return COPY_BY_SLUG[slug] ?? null;
}
