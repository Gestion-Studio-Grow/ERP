// Contenido editorial de la VIDRIERA de MAGRA Meat Market (tenant `magra`).
//
// 🔒 COPIA SAGRADA — autorizada por el dueño, diseñada por el estudio @noctiluma_ para
// el sitio real (magrameatmarket.com.ar). Los textos de marketing (hero, propuestas de
// valor, envasados, gourmet, reseñas, about, contacto) están TEXTUALES: no se reescriben,
// no se "mejoran", no se parafrasean. Fuente literal: _ch-estetica-base/magra-copia-autorizada.md.
//
// 🎨 IMÁGENES: generadas por IA (Pollinations, gratis — ver scripts/gen-magra-imgs.sh) y
// servidas locales desde /tenants/magra/gen/. NO se usan las fotos con derechos del sitio
// real. Cada corte del catálogo real (seed-magra) se mapea a su imagen por nombre.
//
// El diseño que consume este contenido (src/app/tienda/MagraFront.tsx) baja la referencia
// aprobada del ADR-072 §8 (paleta carbón+hueso+oro · Bebas Neue + Open Sans · lenguaje
// "Vidriera editorial con riel de pedido") — el mockup docs/estrategia/diseno/assets/
// mockup-magra-vidriera.html, llevado a producto real (catálogo + carrito del ERP).

const GEN = "/tenants/magra/gen";

export interface MagraValueProp {
  /** Glifo de acento (una figura, no emoji de color — el color lo pone el oro). */
  glyph: string;
  title: string;
  text: string;
}

export interface MagraVacioLine {
  title: string;
  text: string;
  img: string;
}

export interface MagraGourmet {
  name: string;
  img: string;
}

export interface MagraReview {
  name: string;
  rating: number;
  text: string;
}

export interface MagraContent {
  brandLead: string; // "MA" antes del acento
  brandAccent: string; // "G" en oro
  brandTail: string; // "RA"
  brandSub: string; // "Meat Market · Canning"
  // HERO (textual, autorizado)
  heroEyebrow: string;
  heroTitle: string; // "¡Esto no es una carnicería!"
  heroLede: string;
  heroZone: string;
  // Franja de cortes (marquee) — cortes reales del catálogo, es rótulo de vidriera.
  marquee: string[];
  // Propuestas de valor (4, textual)
  valueProps: MagraValueProp[];
  // Envasados al vacío (3 bloques, textual)
  vacioTitle: string;
  vacio: MagraVacioLine[];
  // Productos gourmet (textual)
  gourmetTitle: string;
  gourmet: MagraGourmet[];
  // Proveedores (textual)
  providersTitle: string;
  providers: string[];
  // Reseñas reales (textual, con nombre)
  reviews: MagraReview[];
  // About (textual)
  aboutTitle: string;
  aboutBody: string;
  // Contacto (textual)
  address: string;
  phone: string;
  whatsapp: string; // número real (dígitos con código país para wa.me)
  email: string;
  hours: string;
  instagram: string; // handle
  instagramUrl: string;
  facebookUrl: string;
  deliveryZones: string[];
  paymentMethods: string;
  copyright: string;
}

export const MAGRA: MagraContent = {
  brandLead: "MA",
  brandAccent: "G",
  brandTail: "RA",
  brandSub: "Meat Market · Canning",

  heroEyebrow: "PRODUCTOS GOURMET PREMIUM",
  heroTitle: "¡Esto no es una carnicería!",
  heroLede:
    "MAGRA no es solo carne: es estilo, practicidad y sabor premium en un solo pack. No hace falta saber de cocina, ni de cortes. Solo tener buen gusto (¡y hambre!).",
  heroZone:
    "¡Si estás en Canning, San Vicente, Guernica, Ezeiza o Monte Grande, te lo llevamos a tu casa!",

  marquee: [
    "Ojo de bife",
    "Bife de chorizo",
    "Lomo",
    "Asado de tira",
    "Vacío",
    "Milanesas de nalga",
    "Envasado al vacío",
  ],

  valueProps: [
    { glyph: "→", title: "Free Shipping", text: "¡Te lo llevamos a tu casa sin costo!" },
    { glyph: "◆", title: "Calidad premium", text: "100% Garantizada. Productos seleccionados envasados." },
    { glyph: "▣", title: "Todos los medios de pago", text: "Efectivo, crédito, débito, transferencia bancaria y Mercado Pago" },
    { glyph: "✳", title: "Atención personalizada", text: "Dudas, pedidos o antojos: ¡escribinos por WhatsApp!" },
  ],

  vacioTitle: "Envasados al vacío",
  vacio: [
    { title: "Carne de vaca envasada al vacío", text: "Somos distribuidores oficiales de Estancia Don Ramón", img: `${GEN}/vacio-vaca.jpg` },
    { title: "Carne de cerdo envasada al vacío", text: "Cortes magros, bajos en grasa, sanos y llenos de sabor.", img: `${GEN}/vacio-cerdo.jpg` },
    { title: "Pollo orgánico envasado al vacío", text: "El clásico que siempre queda bien, fresco y práctico.", img: `${GEN}/vacio-pollo.jpg` },
  ],

  gourmetTitle: "Productos gourmet",
  gourmet: [
    { name: "Ensaladas y vegetales envasados", img: `${GEN}/gourmet-ensaladas.jpg` },
    { name: "Pescado congelado envasado", img: `${GEN}/gourmet-pescado.jpg` },
    { name: "Pasta italiana", img: `${GEN}/gourmet-pastas.jpg` },
    { name: "Conservas importadas", img: `${GEN}/gourmet-conservas.jpg` },
  ],

  providersTitle: "Nuestros proveedores",
  providers: ["Tinos", "Breaders", "Estancia Don Ramón", "Maderasa", "Paladini", "Formagge", "Lamberti", "Pizzazen"],

  reviews: [
    {
      name: "Matías R.",
      rating: 5,
      text: "¡Altísima calidad! Pedí varios cortes y todos llegaron perfectos, bien envasados y con pinta gourmet. La atención también de primera, te responden rápido y re bien predispuestos.",
    },
    {
      name: "Jesica F.",
      rating: 5,
      text: "Fui al local de casualidad y me llevé una sorpresa. Todo súper prolijo, los productos bien presentados y la atención de diez. Me explicaron cada corte con paciencia y buena onda. Volví y voy a seguir yendo.",
    },
    {
      name: "Macarena A.",
      rating: 5,
      text: "La carne es un 10. Súper tierna, sabrosa y viene al vacío impecable. Se nota que es buena de verdad. Además, me atendieron por WhatsApp con toda la onda, me ayudaron a elegir sin apurarme.",
    },
  ],

  aboutTitle: "Probadas por nosotros, elegidas para vos.",
  aboutBody:
    "En MAGRA ofrecemos una selección de carnes premium envasadas al vacío de los mejores proveedores, además de productos gourmet para acompañar tus comidas. Servicio puerta a puerta en Canning.",

  address: "José Champagnat 4351 – Local 1, Sotavento Point, Canning",
  phone: "+54 9 11 7609 5555",
  whatsapp: "5491161354042",
  email: "hola@magrameatmarket.com.ar",
  hours: "Lunes a sábados de 10 a 20 h · Domingos de 9 a 13 h",
  instagram: "@tiendamagra",
  instagramUrl: "https://www.instagram.com/tiendamagra",
  facebookUrl: "https://www.facebook.com/profile.php?id=61575131222502",
  deliveryZones: ["Canning", "San Vicente", "Guernica", "Ezeiza", "Monte Grande"],
  paymentMethods: "Efectivo, crédito, débito, transferencia bancaria y Mercado Pago",
  copyright: "© 2025 MAGRA Meat Market. Todos los derechos reservados.",
};

// Mapa nombre-de-corte → imagen generada (por nombre normalizado del catálogo real).
// Sin match → null (la card cae a un panel de marca con degradé cálido, nunca rota).
const CUT_IMG: { match: RegExp; img: string }[] = [
  { match: /ojo de bife/i, img: `${GEN}/ojo-de-bife.jpg` },
  { match: /asado de tira/i, img: `${GEN}/asado-de-tira.jpg` },
  { match: /bife de chorizo/i, img: `${GEN}/bife-de-chorizo.jpg` },
  { match: /lomo/i, img: `${GEN}/lomo.jpg` },
  { match: /vac[ií]o/i, img: `${GEN}/vacio.jpg` },
  { match: /milanesa/i, img: `${GEN}/milanesas.jpg` },
  { match: /picada/i, img: `${GEN}/picada.jpg` },
  { match: /pollo/i, img: `${GEN}/pollo.jpg` },
];

export function cutImage(name: string): string | null {
  return CUT_IMG.find((c) => c.match.test(name))?.img ?? null;
}

export const MAGRA_HERO_IMG = `${GEN}/hero.jpg`;
