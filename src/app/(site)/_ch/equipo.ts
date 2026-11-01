// Lo que comparten la home, la carta y la ficha del diseño nuevo de CH: las fotos propias del equipo y los
// formatos de texto. Sin directiva: lo importan componentes de servidor y la agenda viva (cliente) recibe ya
// resueltas las rutas de las fotos.

// Fotos propias del equipo (public/team), recortadas a 320×320 y en WebP; la de Romina ya va derecha en el
// archivo (antes se enderezaba por CSS). Mapeadas por nombre porque el modelo Professional no tiene foto: sin
// coincidencia, iniciales. Nunca avatares generados.
const FOTOS: Record<string, string> = {
  "Carolina Haponiuk": "/team/carolina.webp",
  "Macarena Arias": "/team/macarena.webp",
  "Romina Delpardo": "/team/romina.webp",
};

export function fotoDe(nombre: string): string | null {
  return FOTOS[nombre] ?? null;
}

/** La misma foto en 192 px (≈ 5 KB): para la agenda viva y las caritas del hero, que se ven a 96 px o menos. */
export function fotoChicaDe(nombre: string): string | null {
  return FOTOS[nombre]?.replace(/\.webp$/, "-192.webp") ?? null;
}

export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/** "Carla, Laura y Marina". */
export function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

// Ilustración de marca por familia (public/tenants/ch, 1200×900): placeholder de la ficha y su og:image hasta
// que haya fotos propias. Misma regla que la vitrina de siempre (FeaturedTreatments).
const ILUSTRACIONES: { patron: RegExp; src: string }[] = [
  { patron: /depilaci/i, src: "/tenants/ch/tratamiento-depilacion.svg" },
  { patron: /facial|cejas|pesta/i, src: "/tenants/ch/tratamiento-facial.svg" },
  { patron: /corporal|masaje|spa|pies|manos/i, src: "/tenants/ch/tratamiento-exosomas.svg" },
];

export function ilustracionDeFamilia(familia: string): string {
  return ILUSTRACIONES.find((i) => i.patron.test(familia))?.src ?? "/tenants/ch/tratamiento-facial.svg";
}

type ProParaHueco = { id: string; name: string; serviceIds: string[] };
type GrupoParaHueco = { services: { id: string; name: string }[] };

/**
 * Las fichas de la agenda viva: una por profesional que hace algo. El servicio que se consulta es el más
 * reservado que ESA profesional hace (`preferidos`, de getMostBookedServiceIds) o, sin historial, el primero
 * suyo. Con `soloServicio` (la ficha de un tratamiento) sólo quienes lo hacen, con ese servicio.
 */
export function fichasDeHueco(
  professionals: ProParaHueco[],
  groups: GrupoParaHueco[],
  preferidos: string[],
  soloServicio?: string,
): { proId: string; nombre: string; foto: string | null; iniciales: string; svcId: string; svcNombre: string }[] {
  const nombres = new Map<string, string>();
  for (const g of groups) for (const s of g.services) nombres.set(s.id, s.name);
  const fichas = [];
  for (const p of professionals) {
    const propios = p.serviceIds.filter((id) => nombres.has(id));
    const svcId = soloServicio
      ? propios.includes(soloServicio)
        ? soloServicio
        : undefined
      : (preferidos.find((id) => propios.includes(id)) ?? propios[0]);
    if (!svcId) continue;
    fichas.push({ proId: p.id, nombre: p.name, foto: fotoChicaDe(p.name), iniciales: iniciales(p.name), svcId, svcNombre: nombres.get(svcId)! });
  }
  return fichas;
}
