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

const COPY_BY_SLUG: Record<string, StorefrontCopy> = {
  magra,
};

export function getStorefrontCopy(slug: string | null | undefined): StorefrontCopy | null {
  if (!slug) return null;
  return COPY_BY_SLUG[slug] ?? null;
}
