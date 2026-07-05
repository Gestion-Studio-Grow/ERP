// Registry de réplicas de sitio por TENANT. Cuando un cliente ya tiene su web (hecha por
// una agencia), en vez de darle nuestra vidriera genérica replicamos su sitio como la
// vidriera de SU tenant, con nuestro backoffice detrás. La réplica se resuelve por slug
// (misma estrategia que el acento y el copy por tenant): es config por tenant dentro del
// multi-tenant, NO un clon standalone.
//
// Cuando exista contenido por tenant en DB, este mapa pasa a ser el fallback.

import { MAGRA_REPLICA, type SiteReplicaData } from "./magra-replica";

export type { SiteReplicaData };

const REGISTRY: Record<string, SiteReplicaData> = {
  magra: MAGRA_REPLICA,
};

/** Réplica de sitio del tenant, o null si el tenant usa la vidriera genérica. */
export function getSiteReplica(slug: string | null | undefined): SiteReplicaData | null {
  if (!slug) return null;
  return REGISTRY[slug] ?? null;
}
