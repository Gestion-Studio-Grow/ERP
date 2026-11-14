// LA DIRECCIÓN QUE VE EL CLIENTE (GSG-MARCA-006, 10/11/2026). Un mail a CH salió con
// `chestetica-erp.vercel.app` cuando la dirección oficial es `https://chestetica.gsgapp.com.ar`.
// Los links que se arman con el host del pedido heredan el host por el que entró el dueño: si entró
// por el `.vercel.app` (sigue ruteando, tenant.ts), el link del WhatsApp, del QR o del mail salía con
// ese host. Regla: con dominio propio (`APP_BASE_DOMAIN`), un host `.vercel.app` que el mapa de ruteo
// resuelve a un negocio se reescribe a `https://<subdominio>.<dominio propio>`. Sin dominio propio, o
// si el host no se resuelve, queda como estaba (no se inventa una dirección). PURA.

import { mapaDeHostsVigente, normalizeHost } from "@/lib/tenant";

type Env = Readonly<Record<string, string | undefined>>;

const VERCEL_APP = /(^|\.)vercel\.app$/i;

export function esHostVercel(host: string | null | undefined): boolean {
  const h = normalizeHost(host);
  return !!h && VERCEL_APP.test(h);
}

function esLocal(host: string): boolean {
  return /(^|\.)localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);
}

/**
 * El origen público (`https://…`, sin barra final) para armar un link que sale al cliente, a partir
 * del host del pedido. `null` si no hay host. El protocolo del pedido sólo se respeta en local.
 */
export function origenPublico(hostCrudo: string | null | undefined, env: Env = process.env): string | null {
  const crudo = hostCrudo?.split(",")[0]?.trim().toLowerCase();
  if (!crudo) return null;
  if (esLocal(crudo)) return `http://${crudo}`;
  const host = normalizeHost(crudo)!;
  const dominio = env.APP_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (dominio && VERCEL_APP.test(host)) {
    const sub = mapaDeHostsVigente({ ...env }).get(host);
    if (sub) return `https://${sub}.${dominio}`;
  }
  return `https://${host}`;
}

const LINK_VERCEL = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app\b/i;

/**
 * Guarda para todo texto que sale al cliente (mail, WhatsApp, PDF, QR): con dominio propio, ningún
 * link `.vercel.app`. Devuelve el primer host ofensivo, o null si el texto está limpio. Sin dominio
 * propio no hay contra qué comparar: null.
 */
export function linkVercelEnTextoSaliente(texto: string, env: Env = process.env): string | null {
  if (!env.APP_BASE_DOMAIN?.trim()) return null;
  return texto.match(LINK_VERCEL)?.[0] ?? null;
}

/** El valor de `data-origen-publico` para la raíz del panel: sólo si difiere del host del pedido. PURA. */
export function origenPublicoSiDifiere(host: string | null | undefined, env: Env = process.env): string | undefined {
  const publico = origenPublico(host, env);
  if (!publico) return undefined;
  const h = normalizeHost(host);
  return h && new URL(publico).hostname !== h ? publico : undefined;
}
