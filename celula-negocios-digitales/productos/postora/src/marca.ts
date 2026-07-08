// Postora — Kit de Marca de ejemplo + plantillas brandeadas.
// DATOS DEMO, sin negocio real, sin secretos. Sirve para la demo offline y los tests.

import type { KitDeMarca, Plantilla } from "./tipos.ts";

/** Comercio faro de la demo: una rotisería de barrio (rubro gastronomía). Todo inventado. */
export const KIT_LO_DE_ROLO: KitDeMarca = {
  negocio: "Lo de Rolo",
  rubro: "gastronomia",
  zona: "Villa Crespo",
  paleta: {
    primario: "#C64B2B", // terracota
    secundario: "#2E3A2E", // verde oscuro
    acento: "#E9B949", // mostaza
    fondo: "#F4F1EA", // crema
  },
  tipografia: { titulo: "Fraunces", cuerpo: "Inter" },
  tono: "cercano, criollo, de barrio; como el dueño hablándole a un vecino",
  hacer: [
    "hablar de vos y de la casa",
    "mencionar el barrio",
    "emojis con moderación (1–2)",
    "invitar a escribir por WhatsApp",
  ],
  evitar: [
    "signos de exclamación en cadena",
    "inglés innecesario",
    "promesas que no se cumplen",
    "jerga corporativa",
  ],
  hashtagsBase: ["#LoDeRolo", "#comerbien"],
  whatsapp: "5491122223333",
  ofertaVigente: "Combo milanesa + guarnición a precio de vecino todo el finde",
};

/** Plantillas visuales brandeadas: se rellenan con foto del comercio → COGS de imagen ~0. */
export const PLANTILLAS: Plantilla[] = [
  {
    id: "pl-promo",
    nombre: "Promo del finde",
    objetivo: "promo",
    layout: "franja de color primario arriba + foto del plato + precio grande + CTA WhatsApp",
  },
  {
    id: "pl-novedad",
    nombre: "Novedad",
    objetivo: "novedad",
    layout: "foto grande centrada + título en tipografía de marca + sello 'nuevo'",
  },
  {
    id: "pl-reserva",
    nombre: "Reservá",
    objetivo: "reserva",
    layout: "fondo crema + texto grande + botón WhatsApp + horarios",
  },
  {
    id: "pl-recordatorio",
    nombre: "Recordatorio",
    objetivo: "recordatorio",
    layout: "banner simple con horarios/ubicación y contacto",
  },
  {
    id: "pl-comunidad",
    nombre: "Comunidad",
    objetivo: "comunidad",
    layout: "foto del equipo/casa + texto tipo historia + firma de la marca",
  },
];
