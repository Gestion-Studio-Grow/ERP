// Link para publicar un servicio en redes (docs/producto/link-servicio/PLAN.md).
// Todo puro: recibe la lista de profesionales que ya devuelve `getProfessionalsWithServices()`
// —con el scope del negocio del dominio— y nunca toca la base. Por eso un slug de otro negocio
// no resuelve: simplemente no está en la lista.

export type ServicioDelLink = { id: string; name: string; durationMin: number; price: number };
export type ProfesionalDelLink = { id: string; name: string; services: ServicioDelLink[] };

export type Utm = { source?: string; medium?: string; campaign?: string };

export type Preeleccion = {
  professionalId?: string;
  serviceId?: string;
  aviso?: string;
};

/** «Depilación Láser» → «depilacion-laser». */
export function slugDe(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** id → slug. Si dos del mismo negocio chocan, cada uno lleva los 4 últimos caracteres del id. */
export function slugUnico(items: { id: string; name: string }[]): Map<string, string> {
  const cuenta = new Map<string, number>();
  for (const it of items) cuenta.set(slugDe(it.name), (cuenta.get(slugDe(it.name)) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const it of items) {
    const base = slugDe(it.name) || "x";
    out.set(it.id, (cuenta.get(slugDe(it.name)) ?? 0) > 1 ? `${base}-${it.id.slice(-4).toLowerCase()}` : base);
  }
  return out;
}

/** Servicios únicos del negocio (un servicio lo pueden hacer varias personas). */
export function serviciosDe(lista: ProfesionalDelLink[]): ServicioDelLink[] {
  const m = new Map<string, ServicioDelLink>();
  for (const p of lista) for (const s of p.services) if (!m.has(s.id)) m.set(s.id, s);
  return [...m.values()];
}

function buscar<T extends { id: string; name: string }>(items: T[], q: string | undefined): T | undefined {
  if (!q) return undefined;
  const exacto = items.find((i) => i.id === q);
  if (exacto) return exacto;
  const slugs = slugUnico(items);
  return items.find((i) => slugs.get(i.id) === q.toLowerCase());
}

export const AVISO_SERVICIO = "Ese servicio ya no está disponible. Elegí otro de la lista.";
export const AVISO_PROFESIONAL = "Esa persona ya no atiende por acá. Elegí con quién reservar.";

export function resolverPreeleccion(
  lista: ProfesionalDelLink[],
  q: { servicio?: string; profesional?: string },
): Preeleccion {
  const servicio = buscar(serviciosDe(lista), q.servicio);
  const profesional = buscar(lista, q.profesional);
  if (q.servicio && !servicio) {
    return { professionalId: profesional?.id, aviso: AVISO_SERVICIO };
  }
  if (q.profesional && !profesional) {
    return { serviceId: servicio?.id, aviso: AVISO_PROFESIONAL };
  }
  if (servicio && profesional && !profesional.services.some((s) => s.id === servicio.id)) {
    return { serviceId: servicio.id, aviso: `${profesional.name} no hace ${servicio.name}. Te mostramos quiénes sí.` };
  }
  // Sólo servicio y una sola persona lo hace: queda elegida.
  if (servicio && !profesional) {
    const quienes = lista.filter((p) => p.services.some((s) => s.id === servicio.id));
    if (quienes.length === 1) return { serviceId: servicio.id, professionalId: quienes[0].id };
  }
  return { serviceId: servicio?.id, professionalId: profesional?.id };
}

export function armarLinkReserva(
  base: string,
  lista: ProfesionalDelLink[],
  p: { serviceId?: string; professionalId?: string; utm?: Utm },
): string {
  const url = new URL("/reserva", base);
  const sSlug = p.serviceId ? slugUnico(serviciosDe(lista)).get(p.serviceId) : undefined;
  const pSlug = p.professionalId ? slugUnico(lista).get(p.professionalId) : undefined;
  if (sSlug) url.searchParams.set("servicio", sSlug);
  if (pSlug) url.searchParams.set("profesional", pSlug);
  if (p.utm?.source) url.searchParams.set("utm_source", p.utm.source);
  if (p.utm?.medium) url.searchParams.set("utm_medium", p.utm.medium);
  if (p.utm?.campaign) url.searchParams.set("utm_campaign", p.utm.campaign);
  return url.toString();
}

const limpio = (v: string | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

/** «[via:instagram/bio/limpieza-facial]» o nada. Saneado: no entra HTML ni texto libre. */
export function marcaOrigen(utm: Utm): string | undefined {
  const partes = [limpio(utm.source), limpio(utm.medium), limpio(utm.campaign)];
  if (!partes[0]) return undefined;
  while (partes.length && !partes[partes.length - 1]) partes.pop();
  // 80 caracteres en total: «[via:» + 74 + «]».
  return `[via:${partes.join("/").slice(0, 74).replace(/[/-]+$/, "")}]`;
}

/** Lee la marca al principio de una nota: { origen: "instagram/bio/limpieza-facial", resto }. */
export function leerMarcaOrigen(notes: string | null | undefined): { origen?: string; resto: string } {
  const m = /^\[via:([a-z0-9/-]+)\]\s*/.exec(notes ?? "");
  if (!m) return { resto: notes ?? "" };
  return { origen: m[1], resto: (notes ?? "").slice(m[0].length) };
}
