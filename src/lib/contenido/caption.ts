// Contenido — captions de Instagram y WhatsApp con la marca del negocio (PURO).
// Generaliza `armarCaption` del club (club/studio-core.ts:170): marca y CTA parametrizados.
import { ctaPara } from "./detectar";
import type { CamposDeLaPieza, Extraccion, MarcaDeLaPlaca, TipoDeContenido } from "./tipos";

const EMOJI: Readonly<Record<TipoDeContenido, string>> = Object.freeze({
  promo: "🔥",
  horario: "🕒",
  evento: "🏆",
  novedad: "📣",
  servicio: "✨",
});

const HASHTAG_TIPO: Readonly<Record<TipoDeContenido, string[]>> = Object.freeze({
  promo: ["#Promo", "#Oferta"],
  horario: ["#Horarios"],
  evento: ["#Evento", "#Inscripciones"],
  novedad: ["#Novedades"],
  servicio: ["#NuevoServicio"],
});

export interface DatosDelCaption {
  tipo: TipoDeContenido;
  campos: CamposDeLaPieza;
  marca: MarcaDeLaPlaca;
  detalles?: Pick<Extraccion, "fecha" | "hora" | "precio">;
}

/** «5491122334455» → «+54 9 11 2233-4455» (si no reconoce el formato, lo deja con «+»). */
export function telefonoLegible(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  const caba = d.match(/^54911(\d{4})(\d{4})$/);
  return caba ? `+54 9 11 ${caba[1]}-${caba[2]}` : `+${d}`;
}

/** wa.me del negocio. */
export const enlaceWhatsApp = (digitos: string) => `https://wa.me/${digitos.replace(/\D/g, "")}`;

/** Hashtag con el nombre del negocio, sin espacios ni tildes. */
export function hashtagDeMarca(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return limpio ? `#${limpio}` : "";
}

const unir = (bloques: (string | false | undefined | null)[][]) =>
  bloques
    .map((b) => b.filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");

function lineasDeDetalle(d: DatosDelCaption["detalles"], campos: CamposDeLaPieza): string[] {
  if (!d) return [];
  const yaDicho = `${campos.titulo} ${campos.bajada}`;
  return [
    d.precio && !yaDicho.includes(d.precio) && `👉 ${d.precio}`,
    d.fecha && !yaDicho.includes(d.fecha) && `📅 ${d.fecha}`,
    d.hora && !yaDicho.includes(d.hora) && `🕒 ${d.hora}`,
  ].filter((x): x is string => Boolean(x));
}

export function armarCaptionInstagram({ tipo, campos, marca, detalles }: DatosDelCaption): string {
  const cta = campos.cta || ctaPara(tipo, "instagram");
  const contacto = marca.whatsapp ? `${cta}: escribinos por WhatsApp al ${telefonoLegible(marca.whatsapp)}.` : `${cta}: escribinos por mensaje directo.`;
  const tags = [hashtagDeMarca(marca.nombre), ...HASHTAG_TIPO[tipo]].filter(Boolean).slice(0, 4).join(" ");
  return unir([
    [`${EMOJI[tipo]} ${campos.titulo}`],
    [campos.bajada],
    lineasDeDetalle(detalles, campos),
    [contacto, marca.instagram && `Seguinos en @${marca.instagram}`],
    [tags],
  ]);
}

/** Sin hashtags (en WhatsApp no sirven) y con el wa.me del negocio si lo tiene. */
export function armarCaptionWhatsApp({ tipo, campos, marca, detalles }: DatosDelCaption): string {
  const sinTags = (s: string) => s.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/\s{2,}/g, " ").trim();
  return unir([
    [`${EMOJI[tipo]} *${sinTags(campos.titulo)}*`],
    [sinTags(campos.bajada)],
    lineasDeDetalle(detalles, campos),
    [`${ctaPara(tipo, "whatsapp")}.`, marca.whatsapp && `👉 ${enlaceWhatsApp(marca.whatsapp)}`],
    [`— ${marca.nombre}`],
  ]);
}
