// Registry de réplicas de sitio por TENANT. Cuando un cliente ya tiene su web (hecha por
// una agencia), en vez de darle nuestra vidriera genérica replicamos su sitio como la
// vidriera de SU tenant, con nuestro backoffice detrás. La réplica se resuelve por slug
// (misma estrategia que el acento y el copy por tenant): es config por tenant dentro del
// multi-tenant, NO un clon standalone.
//
// Cuando exista contenido por tenant en DB, este mapa pasa a ser el fallback.
//
// Hoy no hay ninguna: MAGRA tiene su front propio desde el 29/10 (src/app/tienda/magra) y el page.tsx lo sirve antes de
// llegar acá; su réplica y sus PNG se borraron el 31/10 (siguen en el historial de git). `SiteReplica.tsx` queda para el
// próximo cliente con web propia.

export interface Benefit { title: string; text: string }
export interface GourmetCat { name: string; img: string }
export interface VacioLine { name: string; text: string }
export interface Provider { name: string; logo: string }
export interface Review { name: string; rating: number; text: string; avatar: string }

// Datos de una réplica de sitio de un tenant (se sirve como su vidriera, resuelta por
// slug, abajo). Config por tenant, no un clon suelto.
export interface SiteReplicaData {
  logo: string;
  logoFooter: string;
  heroImg: string;
  heroKicker: string;
  heroTitle: string;
  heroText: string;
  ctaPrimary: string;
  ctaSecondary: string;
  benefits: Benefit[];
  gourmetTitle: string;
  gourmet: GourmetCat[];
  vacioTitle: string;
  vacio: VacioLine[];
  providersTitle: string;
  providers: Provider[];
  reviewsTitle: string;
  reviews: Review[];
  hoursLabel: string;
  facebookUrl: string;
  phone: string;
  aboutTitle: string;
  aboutText: string;
  socialNote: string;
  copyright: string;
  /** Subtítulo de la sección "Comprá online" (nuestro copy de plataforma, no del sitio
   * replicado) — opcional; sin él, SiteReplica cae a un texto neutro. QA (M-1, 2026-07-07)
   * marcó el default anterior ("Cae directo a la cocina/mostrador") como choque de marca
   * con el posicionamiento premium/boutique del cliente. */
  comprarSubtitle?: string;
}

const REGISTRY: Record<string, SiteReplicaData> = {};

/** Réplica de sitio del tenant, o null si el tenant usa la vidriera genérica. */
export function getSiteReplica(slug: string | null | undefined): SiteReplicaData | null {
  if (!slug) return null;
  return REGISTRY[slug] ?? null;
}
