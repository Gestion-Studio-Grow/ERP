// ─────────────────────────────────────────────────────────────────────────────
// DEMO INTERACTIVA DEL ERP — contenido, copy y datos de EJEMPLO (Célula 3).
//
// AISLAMIENTO (coordinación con Célula 2): este archivo y toda la ruta /demo
// NO importan nada de la DB/Prisma/branding/acciones. Todo es dato inventado y
// hardcodeado. Ningún dato de prod ni de clientes reales pasa por acá. La demo
// se puede renderizar/buildear sola (force-static), sin conexión ni credenciales.
//
// MENSAJE + CTA (coordinación con Célula 1 / GTM): el copy de venta y el destino
// del CTA viven acá, en un solo lugar, para que GTM los ajuste sin tocar la UI.
// El número de WhatsApp es PROVISIONAL — a confirmar por GTM antes de publicar.
// ─────────────────────────────────────────────────────────────────────────────

export type SceneId = "agenda" | "reserva" | "caja" | "factura" | "dueno" | "cierre";

export type Scene = {
  id: SceneId;
  /** Etiqueta corta para la barra de stories / caption. */
  kicker: string;
  /** Titular de venta que se lee debajo del teléfono. */
  title: string;
  /** Una línea de beneficio, lenguaje llano. */
  pitch: string;
  /** Segundos que dura la escena en autoplay antes de avanzar sola. */
  seconds: number;
};

export const SCENES: Scene[] = [
  {
    id: "agenda",
    kicker: "Agenda",
    title: "Turnos que no se pisan",
    pitch: "Tu día completo en una pantalla. Reservás, movés y confirmás sin doble-booking.",
    seconds: 6,
  },
  {
    id: "reserva",
    kicker: "Reservá online",
    title: "Tus clientes reservan solos",
    pitch: "Un link en tu Instagram y reservan 24/7, sin que tengas que contestar cada mensaje.",
    seconds: 6.5,
  },
  {
    id: "caja",
    kicker: "Caja / POS",
    title: "Cobrás y queda registrado",
    pitch: "Cada venta suma a la caja del día. Efectivo, tarjeta o transferencia, todo cuadrado.",
    seconds: 6.5,
  },
  {
    id: "factura",
    kicker: "Facturación",
    title: "Factura electrónica en un toque",
    pitch: "Emitís y llega el CAE de ARCA al instante. Sin planillas ni el sistema aparte de AFIP.",
    seconds: 6,
  },
  {
    id: "dueno",
    kicker: "Panel del Dueño",
    title: "Tu negocio te habla",
    pitch: "Lee tus números y te los cuenta en castellano. No otro gráfico: una decisión clara.",
    seconds: 7.5,
  },
  {
    id: "cierre",
    kicker: "Empezá hoy",
    title: "Esto puede ser tu negocio",
    pitch: "Agenda, cobro, facturación y control — en un solo lugar, desde el celular.",
    seconds: 8,
  },
];

// ── Marca de la demo (genérica, no es un tenant real) ────────────────────────
export const DEMO_BRAND = {
  productName: "Tu Negocio",
  studio: "Gestión Studio Grow",
  // Nombre del comercio ficticio que se ve dentro del teléfono.
  sampleBusiness: "Estudio Aura",
};

// ── CTA / GTM (Célula 1) ─────────────────────────────────────────────────────
// El número es un placeholder provisional. GTM debe reemplazarlo por el número
// real de captación antes de publicar la campaña (formato E.164 sin '+' ni signos).
export const DEMO_CTA = {
  whatsappNumber: "5491100000000", // PROVISIONAL — a confirmar (GTM)
  whatsappText: "¡Hola! Vi la demo del sistema y quiero esto para mi negocio.",
  email: "gestionstudiogrow@gmail.com",
  primaryLabel: "Quiero esto para mi negocio",
  replayLabel: "Ver de nuevo",
};

export function whatsappHref(): string {
  const text = encodeURIComponent(DEMO_CTA.whatsappText);
  return `https://wa.me/${DEMO_CTA.whatsappNumber}?text=${text}`;
}

export function mailtoHref(): string {
  const subject = encodeURIComponent("Quiero el sistema para mi negocio");
  const body = encodeURIComponent(DEMO_CTA.whatsappText);
  return `mailto:${DEMO_CTA.email}?subject=${subject}&body=${body}`;
}

// ── Datos de EJEMPLO por escena ──────────────────────────────────────────────

// Agenda: una jornada tipo. `fill` marca el turno que "entra" en vivo.
export type Appt = {
  time: string;
  client: string;
  service: string;
  pro: string;
  tone: "accent" | "success" | "warning";
};

export const AGENDA_DAY: Appt[] = [
  { time: "09:30", client: "Marina G.", service: "Limpieza facial", pro: "Caro", tone: "accent" },
  { time: "11:00", client: "Lucía P.", service: "Depilación láser", pro: "Sofi", tone: "accent" },
  { time: "12:30", client: "Ana R.", service: "Masaje descontracturante", pro: "Caro", tone: "success" },
  { time: "15:30", client: "Sofía M.", service: "Lifting de pestañas", pro: "Sofi", tone: "warning" },
  { time: "17:00", client: "Belén T.", service: "Manicura semi", pro: "Caro", tone: "accent" },
];

// El turno nuevo que aparece "reservado online" durante la animación.
export const AGENDA_INCOMING: Appt = {
  time: "16:15",
  client: "Vale D.",
  service: "Perfilado de cejas",
  pro: "Sofi",
  tone: "success",
};

// Reservá online: pasos del mini-flujo de la vidriera pública.
export const RESERVA_SERVICE = { name: "Limpieza facial profunda", price: "$18.000", mins: 60 };
export const RESERVA_SLOTS = ["10:00", "11:30", "15:30", "16:15", "18:00"];
export const RESERVA_PICK = "16:15";

// Caja / POS: ticket que se va armando.
export type Line = { qty: number; name: string; price: number };
export const CAJA_TICKET: Line[] = [
  { qty: 1, name: "Limpieza facial", price: 18000 },
  { qty: 1, name: "Sérum vitamina C", price: 9500 },
  { qty: 2, name: "Ampolla hidratante", price: 3200 },
];
export const CAJA_METHOD = "Transferencia";
export const CAJA_SESSION_BEFORE = 142300;

// Factura: comprobante emitido.
export const FACTURA = {
  tipo: "Factura B",
  cliente: "Consumidor Final",
  neto: 33900,
  iva: 7119,
  total: 41019,
  cae: "75123456789012",
  vto: "18/07/2026",
  pv: "0003",
  nro: "00000147",
};

// Panel del Dueño: insights en lenguaje llano + una tendencia.
export type Insight = { severity: "good" | "info" | "warn"; label: string; text: string; delta?: string };
export const DUENO_INSIGHTS: Insight[] = [
  {
    severity: "good",
    label: "Bien",
    text: "Facturaste $312.400 esta semana, tu mejor semana del mes.",
    delta: "+18%",
  },
  {
    severity: "info",
    label: "Dato",
    text: "Los jueves a la tarde son tu horario más pedido. Conviene sumar turnos ahí.",
  },
  {
    severity: "warn",
    label: "Atención",
    text: "12 clientas no vuelven hace más de 60 días. Un mensaje las puede recuperar.",
  },
];
export const DUENO_TREND = {
  metric: "Ingresos del mes",
  value: "$1.204.900",
  dir: "up" as const,
  delta: "+11%",
  spark: [42, 48, 45, 58, 61, 72, 69, 84], // altura relativa 0..100
};

// Formato de moneda AR sin dependencias (Intl es nativo).
export function ars(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
