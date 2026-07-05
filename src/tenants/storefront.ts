// Copy de vidriera POR TENANT — la "voz firma" de cada negocio.
//
// Distinción (FUNDAMENTOS §2, ver docs/preventa/playbook-lectura-redes-a-tenant.md):
//   - El RUBRO (src/blueprints/retail/rubros.ts) da el wording GENÉRICO reusable.
//   - El TENANT da su copy PROPIO (tagline firma, about, destacados, footer) —
//     lo que hace que la vidriera se sienta de ESE negocio y no de un rubro.
//
// Se resuelve por slug mientras no exista `Tenant.blueprintId`/contenido en DB (misma
// estrategia que el acento en src/lib/branding.ts). Cuando eso exista, este mapa pasa a
// ser el fallback. Sin match → null y la vidriera cae al wording del rubro (genérico).
//
// Contenido de magra: EXTRAÍDO de su web oficial (magrameatmarket.com.ar). Precios del
// catálogo son provisionales (rubro); estos textos son de su propia comunicación.

export interface StorefrontHighlight {
  icon: string;
  title: string;
  text: string;
}

export interface StorefrontCopy {
  /** Eyebrow del hero (arriba del nombre). */
  eyebrow: string;
  /** Frase madre / tagline firma. */
  tagline: string;
  /** Bajada del hero. */
  intro: string;
  /** Sección "sobre nosotros". */
  about: { title: string; body: string };
  /** Tira de 3 destacados (propuesta de valor). */
  highlights: StorefrontHighlight[];
  /** Zonas de envío (footer). */
  deliveryZones: string[];
  /** Medios de pago (footer). */
  paymentMethods: string[];
}

// --- MAGRA Meat Market (Canning) ---
const magra: StorefrontCopy = {
  eyebrow: "MAGRA · Canning",
  tagline: "Esto no es una carnicería.",
  intro:
    "Estilo, practicidad y sabor premium en un solo pack. No hace falta saber de cocina, ni de cortes: solo tener buen gusto (y hambre).",
  about: {
    title: "Probadas por nosotros, elegidas para vos.",
    body:
      "Somos una boutique de carnes premium envasadas al vacío, seleccionadas de los mejores proveedores, con una línea gourmet elegida con el mismo criterio. Servicio puerta a puerta en Canning y alrededores.",
  },
  highlights: [
    {
      icon: "◆",
      title: "Envasado al vacío",
      text: "Vaca de Estancia Don Ramón, cerdo magro y pollo orgánico, en su punto justo.",
    },
    {
      icon: "→",
      title: "Envío a domicilio",
      text: "Delivery gratis en Canning, San Vicente, Guernica, Ezeiza y Monte Grande.",
    },
    {
      icon: "✳",
      title: "Atención personalizada",
      text: "Coordinás tu pedido por WhatsApp, sin vueltas.",
    },
  ],
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
