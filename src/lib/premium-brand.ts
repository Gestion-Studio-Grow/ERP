// TIER "Front Premium Animado" — configuración de marca por tenant.
//
// El landing premium es un TEMPLATE reutilizable (ver src/components/premium/).
// Todo lo variable —paleta, textos, cortes/servicios, features, stats— sale de
// esta config, así un tenant premium activa su front cambiando SOLO este objeto,
// sin tocar el componente. Autocontenido: no depende del core (ni DB ni RLS),
// para poder activarse/renderizarse de forma aislada.

export type PremiumPalette = {
  accent: string; // acento del tenant (ember/oxblood/petróleo…)
  accent2: string; // acento secundario para el glow
  glow3: string; // tercer glow (matiz cálido)
  bg: string; // fondo oscuro
  bg2: string; // superficie elevada
  ink: string; // texto principal
  muted: string; // texto secundario
  faint: string; // texto terciario
};

export type PremiumFeature = { n: string; title: string; body: string; icon: "cut" | "custom" | "clock" };
export type PremiumStat = { value: string; cap: string };

export type PremiumConfig = {
  monogram: string;
  name: string;
  tagline: string; // bajo el nombre en el nav
  eyebrow: string; // encima del titular
  // Titular partido en palabras; las marcadas `accent` van en color de acento e itálica.
  headline: { text: string; accent?: boolean }[];
  sub: string;
  ctaPrimary: string;
  ctaSecondary: string;
  marquee: string[]; // ítems de la marquesina
  featuresKicker: string;
  featuresTitle: string;
  features: PremiumFeature[];
  stats: PremiumStat[];
  ctaKicker: string;
  ctaTitle: string;
  ctaBandButton: string;
  footerLeft: string;
  palette: PremiumPalette;
};

// —— Tenant de ejemplo: MAGRA (carnicería premium), acento ember. ——
export const MAGRA_PREMIUM: PremiumConfig = {
  monogram: "M",
  name: "Magra",
  tagline: "Carnicería premium",
  eyebrow: "Carnicería de barrio · desde 1998",
  headline: [
    { text: "Carne" }, { text: "de" }, { text: "verdad," },
    { text: "cortada" }, { text: "como", accent: true }, { text: "se", accent: true }, { text: "debe.", accent: true },
  ],
  sub: "Selección diaria, maduración en su punto y el corte exacto que pedís. Encargá online y retiralo listo — sin colas, sin sorpresas.",
  ctaPrimary: "Encargar ahora",
  ctaSecondary: "Ver los cortes",
  marquee: ["Asado", "Vacío", "Ojo de bife", "Matambre", "Bondiola", "Pollo de campo", "Achuras", "Embutidos artesanales"],
  featuresKicker: "Por qué Magra",
  featuresTitle: "No es solo carne. Es el oficio de elegirla, madurarla y cortarla bien.",
  features: [
    { n: "01", title: "Maduración controlada", body: "Cámara a temperatura estable y tiempos justos. Terneza y sabor que se notan en el primer bocado.", icon: "cut" },
    { n: "02", title: "Cortes a pedido", body: "Grosor, limpieza y porción como los querés. Lo dejás anotado y lo preparamos a tu medida.", icon: "custom" },
    { n: "03", title: "Retiro en 30 minutos", body: "Encargás online, te avisamos cuando está. Pasás, retirás y listo — la carne fresca no espera.", icon: "clock" },
  ],
  stats: [
    { value: "27 años", cap: "de oficio en el barrio" },
    { value: "+40", cap: "cortes y preparados" },
    { value: "4.9★", cap: "promedio de 900+ reseñas" },
  ],
  ctaKicker: "Tu pedido, listo cuando llegás",
  ctaTitle: "Encargá hoy. Comé como se debe.",
  ctaBandButton: "Hacer un pedido",
  footerLeft: "Magra · Carnicería premium · La Plata",
  palette: {
    accent: "#e2683f", accent2: "#c9414b", glow3: "#8a5a2a",
    bg: "#12100e", bg2: "#181512", ink: "#f4ede2", muted: "#b3a696", faint: "#7c7264",
  },
};

// —— Tenant de ejemplo alternativo: CH ESTÉTICA (spa premium), acento petróleo. ——
export const CH_PREMIUM: PremiumConfig = {
  monogram: "CH",
  name: "CH Estética",
  tagline: "Estética & spa premium",
  eyebrow: "La Alameda · Canning",
  headline: [
    { text: "Tu" }, { text: "ritual," }, { text: "hecho" },
    { text: "con", accent: true }, { text: "tiempo", accent: true }, { text: "y", accent: true }, { text: "oficio.", accent: true },
  ],
  sub: "Protocolos serios, profesionales de verdad y turnos que no se pisan. Reservá online y llegá a relajarte, nada más.",
  ctaPrimary: "Reservar turno",
  ctaSecondary: "Ver tratamientos",
  marquee: ["Facial", "Masajes", "Depilación láser", "Manos & pies", "Corporales", "Cejas & pestañas", "Spa de novias"],
  featuresKicker: "Por qué CH",
  featuresTitle: "El resultado se nota. La experiencia, también.",
  features: [
    { n: "01", title: "Protocolos serios", body: "Aparatología certificada y pasos que se respetan. Resultados que se sostienen en el tiempo.", icon: "cut" },
    { n: "02", title: "Turnos que no se pisan", body: "Agenda real: cada profesional, su box y su tiempo. Llegás y te atienden cuando reservaste.", icon: "custom" },
    { n: "03", title: "Reserva en 1 minuto", body: "Elegís servicio, profesional y horario online. Te confirmamos al instante.", icon: "clock" },
  ],
  stats: [
    { value: "12 años", cap: "cuidando la piel del barrio" },
    { value: "+30", cap: "tratamientos y protocolos" },
    { value: "4.9★", cap: "promedio de 1.200+ reseñas" },
  ],
  ctaKicker: "Tu momento te espera",
  ctaTitle: "Reservá hoy. Cuidate como merecés.",
  ctaBandButton: "Reservar ahora",
  footerLeft: "CH Estética · La Alameda, Canning",
  palette: {
    accent: "#3aa7b5", accent2: "#2c6e77", glow3: "#6b7660",
    bg: "#0f1413", bg2: "#141a19", ink: "#eaf2f0", muted: "#93a5a1", faint: "#647471",
  },
};

export const PREMIUM_TENANTS: Record<string, PremiumConfig> = {
  magra: MAGRA_PREMIUM,
  "beauty-spa": CH_PREMIUM,
};
