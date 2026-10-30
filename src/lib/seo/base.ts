// SEO de base (ronda 2, P0): la dirección pública de cada pedido. La app es multi-tenant y resuelve el negocio por HOST,
// así que el `metadataBase`, el canonical, el sitemap y el robots salen del host del pedido, nunca de una constante.
import { headers } from "next/headers";

/** Host del pedido tal como se publica: primer valor, sin puerto, en minúscula y sólo con caracteres de dominio. PURA. */
export function hostPublico(host: string | null | undefined): string | null {
  const h = (host ?? "").split(",")[0].trim().toLowerCase();
  const [nombre, puerto] = h.split(":");
  if (!/^[a-z0-9.-]{1,253}$/.test(nombre ?? "")) return null;
  // El puerto sólo importa en local (a.localhost:3200); en producción el host público no lo lleva.
  return esLocal(nombre) && puerto && /^\d{2,5}$/.test(puerto) ? `${nombre}:${puerto}` : nombre;
}

function esLocal(nombre: string): boolean {
  return nombre === "localhost" || nombre.endsWith(".localhost") || nombre === "127.0.0.1";
}

/** Origen público (`https://negocio.gsgapp.com.ar`) a partir del host y el protocolo reenviado. PURA. */
export function origenDelHost(host: string | null | undefined, proto?: string | null): string | null {
  const h = hostPublico(host);
  if (!h) return null;
  const local = esLocal(h.split(":")[0]);
  const p = (proto ?? "").split(",")[0].trim().toLowerCase();
  return `${local && p !== "https" ? "http" : "https"}://${h}`;
}

/** Canonical: origen + ruta, sin query ni hash, sin barra final (salvo la raíz). PURA. */
export function canonicalDe(origen: string, ruta: string | null | undefined): string {
  const limpia = (ruta ?? "/").split(/[?#]/)[0] || "/";
  const sinBarra = limpia.length > 1 ? limpia.replace(/\/+$/, "") : "/";
  return `${origen}${sinBarra.startsWith("/") ? sinBarra : `/${sinBarra}`}`;
}

/** Lo que el SEO necesita del pedido: origen público y ruta (la pone el proxy en `x-pathname`). */
export async function pedidoPublico(): Promise<{ origen: string | null; ruta: string }> {
  const h = await headers();
  const origen = origenDelHost(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  return { origen, ruta: h.get("x-pathname") ?? "/" };
}
