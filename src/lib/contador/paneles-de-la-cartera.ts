// A qué dirección entra la contadora para abrir el panel de cada cliente. Sólo servidor.
//
// Una sola regla para toda la consola y el panel del estudio: la dirección que el deploy SÍ rutea
// (direccionDelLocal: primero el subdominio del dominio propio APP_BASE_DOMAIN, y sin dominio propio,
// el mapa de hosts que rige: HOSTS_PUBLICADOS + TENANT_HOST_MAP). Antes /contador sólo miraba
// APP_BASE_DOMAIN: un cliente ruteado por el mapa figuraba «Sin dirección propia todavía» aunque su
// panel existía (hallazgo QA 26/09, pasos 4 y 8).
// Devuelve texto plano (subdominio → origen) para pasarlo a la pantalla: sin Map ni Prisma.
import { mapaDeHostsVigente } from "@/lib/tenant";
import { direccionDelLocal } from "@/lib/multilocal/multilocal-core";
import type { PanelesDeLaCartera } from "./direccion-del-panel";

export type { PanelesDeLaCartera } from "./direccion-del-panel";
export { direccionDelPanel } from "./direccion-del-panel";

export function panelesDeLaCartera(
  subdominios: readonly (string | null)[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): PanelesDeLaCartera {
  const ruteo = { mapaDeHosts: mapaDeHostsVigente({ ...env }), dominioPropio: env.APP_BASE_DOMAIN?.trim() || null };
  const paneles: Record<string, string> = {};
  for (const s of subdominios) {
    const sub = s?.trim().toLowerCase();
    if (!sub || sub in paneles) continue;
    const origen = direccionDelLocal(sub, ruteo, "");
    if (origen) paneles[sub] = origen;
  }
  return paneles;
}
