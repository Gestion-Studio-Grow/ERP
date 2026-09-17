// Contenido EDITORIAL de la VIDRIERA de MAGRA Meat Market — de la MARCA, no de un local.
//
// ⚠️ LÍMITE DE ESTE ARCHIVO (y el porqué): acá va SÓLO lo que comparten los 5 locales —
// el relato de marca, las propuestas de valor, los proveedores, las reseñas, las imágenes.
// Los datos del LOCAL (dirección, horarios, WhatsApp, e-mail, Instagram) NO van acá: salen
// de `BusinessSettings`, que cada local carga en /admin/localizacion (ver `resolveMagraLocal`).
// Con 5 locales, un dato de local hardcodeado acá es la dirección de Canning publicada en la
// vidriera de Lomas: manda al cliente a la puerta equivocada, cinco veces.
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
  // "Meat Market". SIN la localidad: la localidad es dato del local y se la agrega la
  // vidriera desde `BusinessSettings.city` (ver `zoneLabel`). Si viviera acá, el local de
  // Lomas llevaría "Canning" escrito en el mástil.
  brandSub: string;
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
  // Zonas de entrega y medios de pago: EDITORIAL por ahora, no dato del local.
  // `BusinessSettings` no tiene columnas para esto (ver `model BusinessSettings` en
  // prisma/schema.prisma), así
  // que son iguales para los 5 locales hasta que exista dónde guardarlos por local. Marcado
  // como provisional a confirmar: Lomas no reparte en Canning.
  deliveryZones: string[]; // provisional a confirmar — mismo valor para todos los locales
  paymentMethods: string;
  copyright: string;
}

// --- Datos del LOCAL (una fila de BusinessSettings) ------------------------------------
//
// Forma exacta de lo que devuelve `getStorefront()` en `branding` (el select de
// BusinessSettings en src/lib/order-actions.ts). Todo nullable: un local recién dado de
// alta no cargó nada todavía.
export interface MagraBrandingRow {
  addressLine: string | null;
  city: string | null;
  hoursLabel: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
}

// Lo que la vidriera necesita para pintar el pie: cada campo o tiene el dato del local,
// o es null. NUNCA el dato de otro local.
export interface MagraLocal {
  addressLine: string | null;
  city: string | null;
  hours: string | null;
  /** Sólo dígitos, listo para wa.me. "" = el local no cargó su número. */
  whatsapp: string;
  /** Etiqueta visible, DERIVADA de `whatsapp`. No es un campo aparte: ver abajo. */
  whatsappLabel: string | null;
  email: string | null;
  instagram: string | null;
  instagramUrl: string | null;
  /**
   * Localidad del local, para el mástil y la etiqueta de envío ("Envío · Lomas de Zamora").
   * Sale de `BusinessSettings.city`, quedándose con lo que va antes de la coma: el negocio
   * suele cargar "Canning, Buenos Aires" y lo que el cliente reconoce es "Canning".
   * null = el local no cargó su ciudad → la vidriera omite la localidad en vez de inventarla.
   */
  zoneLabel: string | null;
}

const digitsOnly = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "");
const text = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

/**
 * Etiqueta visible del WhatsApp, DERIVADA de los mismos dígitos que arma el link.
 *
 * Por qué es una función y no un campo: hasta este cambio la vidriera pintaba el texto
 * "+54 9 11 7609 5555" y el href iba a `wa.me/5491161354042` — dos números distintos, uno
 * a la vista y otro en el click. El cliente llamaba a un número y le contestaba otro (o
 * nadie). Con la etiqueta derivada del dato, no se pueden volver a separar.
 *
 * Formato AR: +54 9 <área> <número>. El área es de 2 a 4 dígitos; 11 = CABA/GBA.
 * Cualquier otro formato se muestra tal cual con un "+" adelante: legible y sin inventar.
 */
export function whatsappLabel(digits: string): string | null {
  const d = digitsOnly(digits);
  if (!d) return null;
  if (d.startsWith("549") && d.length === 13) {
    const rest = d.slice(3);
    const areaLen = rest.startsWith("11") ? 2 : 3;
    const area = rest.slice(0, areaLen);
    const num = rest.slice(areaLen);
    // Corte al piso: los últimos 4 dígitos quedan siempre juntos, que es como se
    // escribe un número acá (11 7609 5555 · 221 456 7890).
    const cut = Math.floor(num.length / 2);
    return `+54 9 ${area} ${num.slice(0, cut)} ${num.slice(cut)}`;
  }
  return `+${d}`;
}

/** Instagram: acepta handle ("@tiendamagra"), handle pelado o URL completa. */
function resolveInstagram(raw: string | null): { handle: string; url: string } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    const handle = v.replace(/\/+$/, "").split("/").pop() || v;
    return { handle: `@${handle.replace(/^@/, "")}`, url: v };
  }
  const handle = v.replace(/^@/, "");
  return { handle: `@${handle}`, url: `https://www.instagram.com/${handle}` };
}

/**
 * Datos del local para la vidriera. UNA sola fuente: `BusinessSettings`.
 *
 * Sin fallback a los datos de Canning a propósito. La regla del producto es que un default
 * no puede mentir: o se pide el dato, o se asume y se DICE. Acá no se asume nada — el campo
 * que el local no cargó vuelve null y la vidriera lo pinta como "A confirmar", visible para
 * el dueño y honesto para el cliente. La alternativa (heredar la dirección de Canning) manda
 * gente a 30 km de distancia sin que nadie se entere.
 */
/** Última porción de la dirección = la localidad. Con red de contención a `city`. */
function localidadDe(addressLine: string | null | undefined, city: string | null | undefined): string | null {
  const partes = String(addressLine ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (partes.length > 1) return partes[partes.length - 1];
  const c = String(city ?? "").split(",")[0].trim();
  return c || null;
}

export function resolveMagraLocal(row: MagraBrandingRow | null | undefined): MagraLocal {
  const wa = digitsOnly(row?.whatsapp);
  const ig = resolveInstagram(row?.instagram ?? null);
  return {
    addressLine: text(row?.addressLine),
    city: text(row?.city),
    hours: text(row?.hoursLabel),
    whatsapp: wa,
    whatsappLabel: whatsappLabel(wa),
    email: text(row?.email),
    instagram: ig?.handle ?? null,
    instagramUrl: ig?.url ?? null,
    // LA LOCALIDAD, que es lo que el cliente reconoce ("Canning"), sale del FINAL de la
    // dirección: "José Champagnat 4351 – Local 1, Sotavento Point, Canning". NO de `city`,
    // que en este sistema es "Ciudad / provincia" y cuyo default es "Buenos Aires"
    // (`LOCATION_DEFAULTS` en settings.ts): leyendo de ahí, el mástil de Canning pasaba a
    // decir "Meat Market · Buenos Aires". Se cae a `city` sólo si no hay dirección cargada.
    zoneLabel: localidadDe(row?.addressLine, row?.city),
  };
}

// Datos REALES del local de Canning (relevados de magrameatmarket.com.ar, autorizados por
// el dueño). NO son un fallback de runtime: son el valor que hay que cargar UNA vez en
// /admin/localizacion del tenant `magra`. Quedan acá para que nadie los tenga que volver a
// buscar, no para que la vidriera de otro local los muestre.
// Ojo: `scripts/fix-magra-data-2026-07-07.ts` (BRANDING_FIX) escribió "José Champagnat 4351, Canning"
// (sin "Local 1, Sotavento Point"). Dos fuentes que ya no coinciden — otra razón para que
// el dato viva en un solo lugar: la fila del local.
export const MAGRA_CANNING_LOCALIZACION = {
  addressLine: "José Champagnat 4351 – Local 1, Sotavento Point, Canning",
  city: "Buenos Aires",
  hoursLabel: "Lunes a sábados de 10 a 20 h · Domingos de 9 a 13 h",
  whatsapp: "5491161354042", // el que abre el CTA hoy; el dueño confirma cuál es el bueno
  email: "hola@magrameatmarket.com.ar",
  instagram: "@tiendamagra",
} as const;

export const MAGRA: MagraContent = {
  brandLead: "MA",
  brandAccent: "G",
  brandTail: "RA",
  brandSub: "Meat Market",

  heroEyebrow: "PRODUCTOS GOURMET PREMIUM",
  heroTitle: "¡Esto no es una carnicería!",
  heroLede:
    "MAGRA no es solo carne: es estilo, practicidad y sabor premium en un solo pack. No hace falta saber de cocina, ni de cortes. Solo tener buen gusto (¡y hambre!).",
  // ⚠️ NO se usa tal cual: la promesa de reparto es un dato DEL LOCAL. Este texto nombra las
  // localidades que reparte Canning, y publicado en la vidriera de Lomas es una promesa que
  // ese local no puede cumplir — y está en el hero, lo primero que se lee. Se pinta a través
  // de `promesaDeReparto(local, content)`, que sólo lo muestra entero en el local que sí
  // reparte esas zonas. Queda acá porque es el copy real de Canning, no para heredarlo.
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


// ── La promesa de reparto, por local ────────────────────────────────────────
//
// `heroZone` y `aboutBody` traen las zonas de CANNING. Publicadas en la vidriera de otro
// local son una promesa que ese local no puede cumplir, y salen en el hero y en el "quiénes
// somos": lo primero y lo último que lee el cliente. `BusinessSettings` no tiene columna de
// zonas de reparto (ver `model BusinessSettings`), así que hasta que exista no se puede saber
// las de cada local — y no saberlas se dice, no se rellena con las del vecino.

/** La localidad que el copy editorial da por propia. Provisional a confirmar con el dueño. */
export const MAGRA_LOCALIDAD_EDITORIAL = "Canning";

/**
 * Qué promesa de reparto se publica en este local.
 *
 * · El local cuyo copy es el suyo (Canning) publica la lista entera, como hoy.
 * · Cualquier otro publica la versión sin zonas: reparte en SU localidad, que es lo único
 *   que se sabe con certeza de él. Sin localidad cargada, no se promete nada.
 */
export function promesaDeReparto(
  local: Pick<MagraLocal, "zoneLabel">,
  content: Pick<MagraContent, "heroZone">,
): string | null {
  const zona = local.zoneLabel?.trim();
  if (zona && zona.toLowerCase() === MAGRA_LOCALIDAD_EDITORIAL.toLowerCase()) return content.heroZone;
  if (zona) return `¡Si estás en ${zona} y alrededores, te lo llevamos a tu casa!`;
  return null;
}

/** El "quiénes somos", con el cierre de reparto atado al local en vez de a Canning. */
export function textoAbout(
  local: Pick<MagraLocal, "zoneLabel">,
  content: Pick<MagraContent, "aboutBody">,
): string {
  const zona = local.zoneLabel?.trim();
  const sinCierre = content.aboutBody.replace(
    new RegExp(`\\s*Servicio puerta a puerta en ${MAGRA_LOCALIDAD_EDITORIAL}\\.`),
    "",
  );
  return zona ? `${sinCierre} Servicio puerta a puerta en ${zona}.` : sinCierre;
}

/** ¿Este local es aquel del que salió el copy editorial (zonas de reparto incluidas)? */
export function esElLocalDelCopy(local: Pick<MagraLocal, "zoneLabel">): boolean {
  const zona = local.zoneLabel?.trim().toLowerCase();
  return zona === MAGRA_LOCALIDAD_EDITORIAL.toLowerCase();
}
