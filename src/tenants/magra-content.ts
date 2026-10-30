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
// 🎨 IMÁGENES (29/10/2026, fronts/magra/DISENO.md §7): la vidriera usa SÓLO fotos reales —los
// packs de Estancia Don Ramón, la línea gourmet y los logos de proveedores, del sitio de MAGRA
// (autorizado, ver magra-replica.ts)— y, donde no hay foto, el despiece de marca. Las de
// /tenants/magra/gen/ (IA) quedan en los campos `img` de abajo sólo por compatibilidad: el front
// no las muestra.
//
// El diseño que consume este contenido (src/app/tienda/MagraFront.tsx) baja la referencia
// aprobada del ADR-072 §8 (paleta carbón+hueso+oro · Bebas Neue + Open Sans · lenguaje
// "Vidriera editorial con riel de pedido") — el mockup docs/estrategia/diseno/assets/
// mockup-magra-vidriera.html, llevado a producto real (catálogo + carrito del ERP).

import { normalizarTelefono } from "@/lib/clientes/telefono";

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
    // Corte al piso: los últimos 4 dígitos quedan siempre juntos, con guion, que es como se
    // escribe un número acá (11 7609-5555 · 221 456-7890).
    const cut = Math.floor(num.length / 2);
    return `+54 9 ${area} ${num.slice(0, cut)}-${num.slice(cut)}`;
  }
  return `+${d}`;
}

/** Instagram: acepta handle ("@tiendamagra"), handle pelado o URL completa. */
function resolveInstagram(raw: string | null): { handle: string; url: string } | null {
  const v = (raw ?? "").trim();
  // El relleno del alta («@instagram-a-confirmar», rubros.ts) no es una cuenta: no se publica.
  if (!v || /a[-_ ]?confirmar/i.test(v)) return null;
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

/**
 * El WhatsApp del local en formato internacional argentino, listo para wa.me
 * (`549` + área + número, 13 dígitos), o `""` si no se puede interpretar con seguridad.
 *
 * Por qué: el panel guarda lo que se tipeó sin los guiones. Con «11-6677-8890» quedaba
 * `1166778890` y la tienda armaba `wa.me/1166778890`, que WhatsApp lee como +1 (EE. UU.):
 * la clienta terminaba en el chat de otro. Sobre la clave nacional de `normalizarTelefono`
 * (la misma que usan las fichas de clientas):
 *   - se sacan `00`, `54`, el `0` de larga distancia, el `9` internacional y el `15` local;
 *   - lo que queda tiene que ser área + número = 10 dígitos, con un área que exista
 *     (`11`, o que empiece con 2 o 3);
 *   - se publica siempre con `549` adelante: WhatsApp en la Argentina es celular y lleva el 9,
 *     también cuando lo cargaron «+54 11 …» sin el 9.
 * Lo demás —incompleto, de otro país, o el relleno «+54 9 11 0000 0000» (los 8 finales
 * iguales)— vuelve `""`: no se muestra ni se ofrece. Mejor sin botón que a un chat ajeno.
 */
export function whatsappInternacionalAR(raw: string | null | undefined): string {
  const clave = normalizarTelefono(raw);
  if (clave.length !== 10 || !/^(11|[23])/.test(clave)) return "";
  if (/^(\d)\1{7}$/.test(clave.slice(-8))) return "";
  return `549${clave}`;
}

/**
 * ¿Es un WhatsApp de verdad? Sí, si `whatsappInternacionalAR` lo puede interpretar. Un número
 * que no lo es NO se muestra ni se ofrece: la vidriera no manda a nadie a un chat que no existe.
 */
export function esWhatsAppValido(digits: string | null | undefined): boolean {
  return whatsappInternacionalAR(digits) !== "";
}

/**
 * El link del chat de un pedido, con el número del LOCAL ya normalizado. El servidor arma el
 * `wa.me` con los dígitos crudos del panel (`chatDelPedido`, order-actions.ts) y con
 * «1166778890» eso es un chat en EE. UU.: la vidriera le cambia el número por el de
 * `whatsappInternacionalAR` (el mismo dato, bien escrito) y deja el texto del pedido intacto.
 * Sin número del local, no hay chat.
 */
export function chatConElNumeroDelLocal(href: string | null | undefined, whatsappDelLocal: string): string | null {
  if (!href || !whatsappDelLocal) return null;
  return href.replace(/^https:\/\/wa\.me\/\+?\d*/, `https://wa.me/${whatsappDelLocal}`);
}

export function resolveMagraLocal(row: MagraBrandingRow | null | undefined): MagraLocal {
  // Normalizado a 549 + área + número. Relleno, incompleto o ilegible = no cargado: sin botón,
  // sin línea en el pie y sin la vía «whatsapp».
  const wa = whatsappInternacionalAR(row?.whatsapp);
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
    // El local no cobra con tarjeta (la caja no tiene el medio): no se promete crédito ni débito.
    { glyph: "▣", title: "Medios de pago", text: "Efectivo, transferencia bancaria y Mercado Pago" },
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
  paymentMethods: "Efectivo, transferencia bancaria y Mercado Pago",
  copyright: "© 2025 MAGRA Meat Market. Todos los derechos reservados.",
};

// ── Fotos de producto: SÓLO las reales ─────────────────────────────────────────
//
// Las fotos de `gen/` (IA) ya no van en el hero ni en la carta: no son el producto real y se
// notan (fronts/magra/DISENO.md §7). La única foto real de producto es la de los packs de
// Estancia Don Ramón del sitio de MAGRA (`hero-carnes.png`, autorizada: magra-replica.ts). De esa
// foto salen el hero y el pack de los 5 cortes que aparecen en ella.
//
// ⚠️ Provisional a confirmar con el dueño: el recorte de su foto como foto de producto por corte es
// uso derivado de lo autorizado (replicar su sitio). Si no lo autoriza, `PACKS_REALES = false` y la
// carta sale entera con el despiece de marca.
const PACKS_REALES = true;
const MAGRA_DIR = "/tenants/magra";

/** Un pack recortado de la foto real: WebP 480×600 (4:5) sobre negro. */
export interface MagraPack {
  src: string;
  width: number;
  height: number;
  /** Lo que dice la etiqueta del pack en la foto. */
  rotulo: string;
}

// Orden importa: «Medio Lomo» antes que «Lomo».
const PACK_DE_CORTE: { match: RegExp; pack: string; rotulo: string }[] = [
  { match: /rack de ojo|ojo de bife/i, pack: "ojo-de-bife", rotulo: "Ojo de bife" },
  { match: /asado del medio/i, pack: "asado-del-medio", rotulo: "Asado del medio" },
  { match: /medio lomo/i, pack: "medio-lomo", rotulo: "Medio lomo" },
  { match: /^lomo\b|lomo sin cord[oó]n/i, pack: "lomo", rotulo: "Lomo" },
  { match: /tapa de nalga|milanesas? de nalga/i, pack: "milanesa-de-nalga", rotulo: "Milanesa de nalga" },
];

export function packDeCorte(name: string): MagraPack | null {
  if (!PACKS_REALES) return null;
  const m = PACK_DE_CORTE.find((c) => c.match.test(name));
  return m ? { src: `${MAGRA_DIR}/packs/pack-${m.pack}.webp`, width: 480, height: 600, rotulo: m.rotulo } : null;
}

/** La foto real de los packs (1100×874), en WebP a dos anchos. */
export const MAGRA_HERO = {
  src: `${MAGRA_DIR}/hero-carnes.webp`,
  srcSet: `${MAGRA_DIR}/hero-carnes-720.webp 720w, ${MAGRA_DIR}/hero-carnes.webp 1100w`,
  width: 1100,
  height: 874,
} as const;

// ── Lo que sigue usando la vidriera nueva (TiendaNueva, interruptor «Diseño nuevo») ──────────
// Esa vidriera es compartida y no es de este front: mantiene sus imágenes generadas (gen/) hasta
// que la ajusten (pedido anotado en el informe de fronts/magra). El front editorial no las usa.
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

/** Imagen GENERADA por corte, sólo para la vidriera nueva (TiendaNueva). */
export function cutImage(name: string): string | null {
  return CUT_IMG.find((c) => c.match.test(name))?.img ?? null;
}

/** Hero GENERADO, sólo para la vidriera nueva (TiendaNueva). */
export const MAGRA_HERO_IMG = `${GEN}/hero.jpg`;

/** Las fotos reales de la línea gourmet (mismo orden que `MAGRA.gourmet`), WebP 560×560. */
export const MAGRA_GOURMET_FOTOS: Record<string, string> = {
  "Ensaladas y vegetales envasados": `${MAGRA_DIR}/gourmet-ensaladas.webp`,
  "Pescado congelado envasado": `${MAGRA_DIR}/gourmet-pescado.webp`,
  "Pasta italiana": `${MAGRA_DIR}/gourmet-pasta.webp`,
  "Conservas importadas": `${MAGRA_DIR}/gourmet-conservas-560.webp`,
};

/** Logo real de cada proveedor (170×131, crema sobre transparente), por el nombre del copy. */
export const MAGRA_LOGO_PROVEEDOR: Record<string, string> = {
  Tinos: `${MAGRA_DIR}/prov-tinos.webp`,
  Breaders: `${MAGRA_DIR}/prov-breaders.webp`,
  "Estancia Don Ramón": `${MAGRA_DIR}/prov-don-ramon.webp`,
  Maderasa: `${MAGRA_DIR}/prov-maderasa.webp`,
  Paladini: `${MAGRA_DIR}/prov-paladini.webp`,
  Formagge: `${MAGRA_DIR}/prov-formagge.webp`,
  Lamberti: `${MAGRA_DIR}/prov-lamberti.webp`,
  Pizzazen: `${MAGRA_DIR}/prov-pizzazen.webp`,
};

// ── El nombre del catálogo: proveedor y detalle salen del paréntesis ─────────────
//
// «Tapa de Nalga (Estancia Don Ramón)» → nombre «Tapa de Nalga», proveedor «Estancia Don Ramón».
// «Hamburguesas Gourmet Premium (Breaders, x4)» → proveedor «Breaders», detalle «x4».
// «Nuggets de Pollo Rebozados (540g)» → sin proveedor, detalle «540g». El nombre completo no cambia
// en ningún lado (bolsa, pedido, etiquetas accesibles): esto es sólo cómo se dibuja la etiqueta.
// Los del copy, más Coeco (el pollo del catálogo real, que no está en la franja de proveedores).
const PROVEEDORES_CONOCIDOS = ["Coeco", ...MAGRA.providers];

export function partesDelNombre(name: string): { nombre: string; proveedor: string | null; detalle: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name.trim());
  if (!m) return { nombre: name.trim(), proveedor: null, detalle: null };
  const partes = m[2].split(",").map((x) => x.trim()).filter(Boolean);
  const primero = partes[0] ?? "";
  const prov = PROVEEDORES_CONOCIDOS.find((p) => p.toLowerCase() === primero.toLowerCase()) ?? null;
  const resto = prov ? partes.slice(1) : partes;
  return { nombre: m[1].trim() || name.trim(), proveedor: prov, detalle: resto.length ? resto.join(", ") : null };
}

// ── De dónde sale cada corte (el despiece de marca) ──────────────────────────────
//
// Regla determinista por nombre, explicable. El ANIMAL lo decide `seccionMagra` (marcas.ts, la misma
// que usa la vidriera nueva); acá, la REGIÓN dentro del animal. Sin match → sin región: el corte se
// vende igual y aparece en «Ver todos». Los marcados `[A VALIDAR]` los confirma el dueño
// (fronts/magra/DISENO.md §13.6).

export type MagraAnimal = "vaca" | "cerdo" | "pollo";

export const REGION_DE_CORTE: Record<MagraAnimal, { match: RegExp; region: string }[]> = {
  vaca: [
    // «De varias partes»: no salen de un solo lugar del animal. Tomahawk, Rondelle y Churrasquito
    // Escondido `[A VALIDAR]` (el tomahawk sale del costillar alto).
    { match: /picada|hamburguesa|rondelle|churrasquito escondido|tomahawk/i, region: "varias" },
    { match: /cogote/i, region: "cogote" },
    { match: /rack de ojo|ojo de bife|bife ancho|aguja/i, region: "aguja" },
    { match: /bife de chorizo|t-?bone|lomo|bife angosto/i, region: "lomo" },
    { match: /asado|banderita|bife argentino|costilla/i, region: "costillar" },
    { match: /cuadril|picanha/i, region: "cuadril" },
    { match: /nalga|cuadrada|bola de lomo/i, region: "nalga" },
    { match: /vac[ií]o/i, region: "vacio" },
    { match: /matambre/i, region: "matambre" },
    { match: /entra[nñ]a/i, region: "entrana" },
    { match: /pecho|falda|osobuco/i, region: "pecho" },
  ],
  cerdo: [
    // Churrasquito de Cerdo `[A VALIDAR]`.
    { match: /pierna|jam[oó]n|churrasquito|lomito ahumado/i, region: "pierna" },
    { match: /bondiola|cogote/i, region: "bondiola" },
    { match: /carr[eé]|solomillo|lomito|lomo/i, region: "carre" },
    { match: /ribs|costilla|pechito/i, region: "costillar" },
    { match: /matambrito|panceta|panza/i, region: "panza" },
  ],
  pollo: [
    { match: /nugget|rebozad|hamburguesa|milanesa/i, region: "elaborados" },
    { match: /pechuga|suprema/i, region: "pechuga" },
    { match: /pata|muslo/i, region: "pata" },
  ],
};

export function regionDeCorte(animal: MagraAnimal, name: string): string | null {
  return REGION_DE_CORTE[animal].find((r) => r.match.test(name))?.region ?? null;
}

// ── Cómo se cocina (los chips «¿Cómo lo cocinás?») ─────────────────────────────
//
// Cada regla suma sus métodos; un corte puede ir a más de uno. Sin ninguna, el corte no se filtra
// fuera: se ve en «Ver todos». Reglas de la casa, provisional a confirmar con el dueño.

export const COCCIONES = ["parrilla", "horno", "plancha", "olla", "milanesas"] as const;
export type MagraCoccion = (typeof COCCIONES)[number];

export const COCCION_DE_CORTE: { match: RegExp; metodos: MagraCoccion[] }[] = [
  { match: /rack de ojo|ojo de bife|bife|t-?bone|tomahawk/i, metodos: ["parrilla", "plancha"] },
  { match: /asado|banderita|vac[ií]o|entra[nñ]a|matambre(?!.*arrollad)|picanha|ribs|hamburguesa/i, metodos: ["parrilla"] },
  { match: /colita|cuadril|lomo|lomito|solomillo|bondiola|rondelle|arrollad|pata|muslo|ribs|nugget|entero/i, metodos: ["horno"] },
  { match: /churrasquito|hamburguesa|suprema|pechuga|medall[oó]n|lomo sin cord|medio lomo/i, metodos: ["plancha"] },
  { match: /picada|cogote|osobuco|pecho|falda|rondelle/i, metodos: ["olla"] },
  { match: /nalga|cuadrada|milanesa|suprema/i, metodos: ["milanesas"] },
  { match: /bondiola|colita|matambrito|churrasquito de cuadril|pata/i, metodos: ["parrilla"] },
];

export function coccionesDe(name: string): MagraCoccion[] {
  const s = new Set<MagraCoccion>();
  for (const r of COCCION_DE_CORTE) if (r.match.test(name)) r.metodos.forEach((m) => s.add(m));
  return COCCIONES.filter((m) => s.has(m));
}

// ── «¿Para cuántos comen?» ──────────────────────────────────────────────────────
//
// Estimación de la casa: ~350 g por persona, redondeado al paso de la bolsa (0,25 kg). Se dice
// como estimación (se pesa al envasar). Provisional a confirmar con el dueño (DISENO.md §13.5).
export const GRAMOS_POR_PERSONA = 350;
export function porcionesAKilos(personas: number): number {
  const kg = (Math.max(0, personas) * GRAMOS_POR_PERSONA) / 1000;
  return Math.max(0.25, Math.round(kg / 0.25) * 0.25);
}


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

/**
 * Las propuestas de valor sin prometer un canal que el local no tiene. «Atención personalizada»
 * dice «¡escribinos por WhatsApp!» (textual del sitio): con el WhatsApp cargado queda igual;
 * sin él, la QA vio la promesa sin botón. Entonces: con Instagram, «¡escribinos por Instagram!»
 * (mismo tono, canal real); sin ninguno, se manda a la nota del pedido, que sí existe en la bolsa.
 */
export function propuestasSegunContacto<T extends { text: string }>(
  propuestas: readonly T[],
  local: Pick<MagraLocal, "whatsapp" | "instagramUrl">,
): T[] {
  if (local.whatsapp) return [...propuestas];
  return propuestas.map((v) => {
    if (!/por whatsapp/i.test(v.text)) return v;
    const text = local.instagramUrl
      ? v.text.replace(/por whatsapp/i, "por Instagram")
      : "Dudas o antojos: dejalos en la nota de tu pedido.";
    return { ...v, text };
  });
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
