// Lógica pura del panel «Compartir» del catálogo (docs/producto/link-servicio/PLAN.md, punto 6).
// Sin base ni navegador: recibe la lista activa profesional → servicios (la misma forma que
// `getProfessionalsWithServices()`) y arma links con utm, el mensaje de WhatsApp y la vista previa.

import {
  armarLinkReserva,
  leerMarcaOrigen,
  serviciosDe,
  slugUnico,
  type ProfesionalDelLink,
  type Utm,
} from "@/lib/link-reserva";

export type DatosCompartir = {
  /** Origen público del negocio, p. ej. «https://spa.ejemplo.com». */
  base: string;
  /** Nombre del negocio (título de la vista previa). */
  negocio: string;
  /** Profesionales activos con sus servicios activos. */
  lista: ProfesionalDelLink[];
};

export type Seleccion = { serviceId?: string; professionalId?: string };
export type Canal = "directo" | "whatsapp" | "instagram";

type ProfesionalDelCatalogo = {
  id: string;
  name: string;
  active: boolean;
  deletedAt?: Date | null;
  services: { id: string; name: string; durationMin: number; price: number; active: boolean; deletedAt?: Date | null }[];
};

/** Misma regla que `getProfessionalsWithServices()`: activos y no borrados, con sus servicios activos. */
export function listaActiva(profesionales: ProfesionalDelCatalogo[]): ProfesionalDelLink[] {
  return profesionales
    .filter((p) => p.active && !p.deletedAt)
    .map((p) => ({
      id: p.id,
      name: p.name,
      services: p.services
        .filter((s) => s.active && !s.deletedAt)
        .map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, price: s.price })),
    }));
}

const UTM_CANAL: Record<Canal, Omit<Utm, "campaign"> | undefined> = {
  directo: undefined,
  whatsapp: { source: "whatsapp", medium: "mensaje" },
  instagram: { source: "instagram", medium: "bio" },
};

/** utm_campaign = slug del servicio (o del profesional si no hay servicio). */
export function campana(lista: ProfesionalDelLink[], sel: Seleccion): string | undefined {
  if (sel.serviceId) return slugUnico(serviciosDe(lista)).get(sel.serviceId);
  if (sel.professionalId) return slugUnico(lista).get(sel.professionalId);
  return undefined;
}

export function linkPara(datos: DatosCompartir, sel: Seleccion, canal: Canal): string {
  const utm = UTM_CANAL[canal];
  return armarLinkReserva(datos.base, datos.lista, {
    ...sel,
    utm: utm ? { ...utm, campaign: campana(datos.lista, sel) } : undefined,
  });
}

function nombres(lista: ProfesionalDelLink[], sel: Seleccion) {
  const servicio = sel.serviceId ? serviciosDe(lista).find((s) => s.id === sel.serviceId) : undefined;
  const profesional = sel.professionalId ? lista.find((p) => p.id === sel.professionalId) : undefined;
  return { servicio, profesional };
}

/** «Reservá tu {servicio} con {profesional} acá: {link}» (o la parte que haya). */
export function mensajeWhatsApp(datos: DatosCompartir, sel: Seleccion): string {
  const { servicio, profesional } = nombres(datos.lista, sel);
  const link = linkPara(datos, sel, "whatsapp");
  if (servicio && profesional) return `Reservá tu ${servicio.name} con ${profesional.name} acá: ${link}`;
  if (servicio) return `Reservá tu ${servicio.name} acá: ${link}`;
  if (profesional) return `Reservá con ${profesional.name} acá: ${link}`;
  return `Reservá acá: ${link}`;
}

export function urlWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** 18000 → «$ 18.000». Sin depender del ICU del entorno. */
export function pesos(n: number): string {
  const entero = Math.round(n);
  const signo = entero < 0 ? "-" : "";
  return `${signo}$ ${String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export type VistaPrevia = { titulo: string; descripcion: string; imagen: string };

/** Lo que muestra la tarjeta al pegar el link en una red (la ruta OG la arma otra tarea). */
export function vistaPrevia(datos: DatosCompartir, sel: Seleccion): VistaPrevia {
  const { servicio, profesional } = nombres(datos.lista, sel);
  const quien = [servicio?.name, profesional?.name].filter(Boolean).join(" con ");
  const titulo = quien ? `${quien} — ${datos.negocio}` : datos.negocio;
  let descripcion = "Reservá tu turno online";
  if (servicio) descripcion = `${servicio.durationMin} min · ${pesos(servicio.price)}`;
  else if (profesional) {
    const n = profesional.services.length;
    descripcion = n > 0 ? `${n} servicio${n === 1 ? "" : "s"} para reservar` : "Reservá tu turno online";
  }
  const q = new URLSearchParams();
  const sSlug = sel.serviceId ? slugUnico(serviciosDe(datos.lista)).get(sel.serviceId) : undefined;
  const pSlug = sel.professionalId ? slugUnico(datos.lista).get(sel.professionalId) : undefined;
  if (sSlug) q.set("servicio", sSlug);
  if (pSlug) q.set("profesional", pSlug);
  const qs = q.toString();
  return { titulo, descripcion, imagen: `/reserva/og${qs ? `?${qs}` : ""}` };
}

/** Por qué no se puede compartir (o undefined si se puede). */
export function motivoServicio(lista: ProfesionalDelLink[], s: { id: string; active: boolean }): string | undefined {
  if (!s.active) return "El servicio está inactivo: activalo para compartirlo.";
  if (!serviciosDe(lista).some((x) => x.id === s.id)) return "Nadie lo hace todavía: asignale un profesional activo.";
  return undefined;
}

export function motivoProfesional(lista: ProfesionalDelLink[], p: { id: string; active: boolean }): string | undefined {
  if (!p.active) return "Está inactivo: activalo para compartir su link.";
  if (!lista.some((x) => x.id === p.id)) return "No aparece en la reserva online.";
  return undefined;
}

export type OrigenContado = { origen: string; red: string; detalle: string; cantidad: number };

const RED: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
const MEDIO: Record<string, string> = { bio: "bio", mensaje: "mensaje", historia: "historia", post: "publicación" };

/** Cuenta las reservas por `leerMarcaOrigen(notes).origen`, de mayor a menor. */
export function agruparOrigenes(notas: (string | null | undefined)[]): OrigenContado[] {
  const cuenta = new Map<string, number>();
  for (const n of notas) {
    const { origen } = leerMarcaOrigen(n);
    if (origen) cuenta.set(origen, (cuenta.get(origen) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([origen, cantidad]) => {
      const [fuente = "", medio, camp] = origen.split("/");
      const red = RED[fuente] ?? (fuente.charAt(0).toUpperCase() + fuente.slice(1));
      const detalle = [medio ? (MEDIO[medio] ?? medio) : undefined, camp?.replace(/-/g, " ")].filter(Boolean).join(" · ");
      return { origen, red, detalle, cantidad };
    })
    .sort((a, b) => b.cantidad - a.cantidad || a.origen.localeCompare(b.origen));
}
