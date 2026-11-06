// FACTOQUE · «Conectá tu Mercado Pago» — la parte PURA del ida y vuelta OAuth (sin base, sin red).
//
// Ida (/facturita/app/cuenta/mercadopago/conectar): se arma un `state` y un `code_verifier` al
// azar y se guardan en una cookie httpOnly, atada al negocio y a la persona de la sesión, que vive
// 10 minutos (lo mismo que el `code` de MP). Vuelta (/…/mercadopago/vuelta): el `state` de la URL
// tiene que ser el de la cookie (comparación en tiempo constante), la sesión la misma, y la cookie
// se borra siempre: un `state` sirve una sola vez.
//
// Nada de esto viaja en la URL salvo el `state` y el `code_challenge` (el verificador, nunca).

import { timingSafeEqual } from "node:crypto";

// design-lint: acá no hay animación; `Buffer.from(` dispara la regla de movimiento (reducedMotion N/A).

export const COOKIE_MP = "fx_mp_oauth";
export const RUTA_COOKIE_MP = "/facturita/app/cuenta/mercadopago";
export const RUTA_VUELTA_MP = "/facturita/app/cuenta/mercadopago/vuelta";
export const RUTA_CUENTA = "/facturita/app/cuenta";
export const VIDA_ESTADO_MS = 10 * 60 * 1000;

export interface EstadoOAuthMP {
  state: string;
  verificador: string;
  tenantId: string;
  userId: string;
  redirectUri: string;
  vence: number;
}

const RE_AZAR = /^[A-Za-z0-9_-]{43,128}$/;
const RE_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** Lo que MP manda como `code` (TG-…): acotado antes de mandarlo a ningún lado. */
const RE_CODE = /^[A-Za-z0-9_.:-]{8,256}$/;

export function serializarEstado(e: EstadoOAuthMP): string {
  return Buffer.from(JSON.stringify(e), "utf8").toString("base64url");
}

export function leerEstado(crudo: string | undefined | null): EstadoOAuthMP | null {
  if (!crudo || crudo.length > 2048) return null;
  try {
    const o = JSON.parse(Buffer.from(crudo, "base64url").toString("utf8")) as Partial<EstadoOAuthMP>;
    if (
      typeof o.state !== "string" || !RE_AZAR.test(o.state) ||
      typeof o.verificador !== "string" || !RE_AZAR.test(o.verificador) ||
      typeof o.tenantId !== "string" || !RE_ID.test(o.tenantId) ||
      typeof o.userId !== "string" || !RE_ID.test(o.userId) ||
      typeof o.redirectUri !== "string" || o.redirectUri.length > 512 ||
      typeof o.vence !== "number" || !Number.isFinite(o.vence)
    ) {
      return null;
    }
    return o as EstadoOAuthMP;
  } catch {
    return null;
  }
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Lo que la pantalla de la cuenta muestra al volver (`?mp=`). */
export type AvisoMP =
  | "conectado"
  | "cancelado"
  | "vencido"
  | "otra_sesion"
  | "cuenta_en_uso"
  | "no_disponible"
  | "fallo"
  | "desconectado";

export type ResultadoVuelta =
  | { ok: true; code: string; estado: EstadoOAuthMP }
  | { ok: false; aviso: AvisoMP };

/**
 * Decide la vuelta de MP sin tocar nada. `sesion` es la de ESTE pedido: si el `state` vino de la
 * sesión de otra persona u otro negocio, no se canjea (un link de vuelta reenviado no conecta la
 * cuenta de MP de nadie en el negocio de otro).
 */
export function decidirVuelta(
  q: { code: string | null; state: string | null; error: string | null },
  cookie: string | undefined | null,
  sesion: { tenantId: string; userId: string },
  ahoraMs: number,
): ResultadoVuelta {
  const estado = leerEstado(cookie);
  if (!estado) return { ok: false, aviso: "vencido" };
  if (!q.state || !iguales(q.state, estado.state)) return { ok: false, aviso: "vencido" };
  if (estado.vence < ahoraMs) return { ok: false, aviso: "vencido" };
  if (estado.tenantId !== sesion.tenantId || estado.userId !== sesion.userId) return { ok: false, aviso: "otra_sesion" };
  // La persona tocó «Cancelar» en MP (error=access_denied) o MP no mandó código.
  if (q.error || !q.code) return { ok: false, aviso: "cancelado" };
  if (!RE_CODE.test(q.code)) return { ok: false, aviso: "fallo" };
  return { ok: true, code: q.code, estado };
}

/** URL de vuelta: la fija del entorno o la del host del pedido (siempre la misma ruta). */
export function urlDeVuelta(fija: string | null, origen: string): string {
  return fija ?? `${origen}${RUTA_VUELTA_MP}`;
}

const AVISOS: Record<AvisoMP, { tono: "ok" | "error" | "info"; texto: string }> = {
  conectado: { tono: "ok", texto: "¡Listo! Tu Mercado Pago quedó conectado. Tus cobros quedan listos para facturarse." },
  desconectado: { tono: "info", texto: "Desconectaste Mercado Pago. Borramos el permiso que teníamos guardado." },
  cancelado: { tono: "info", texto: "No conectaste Mercado Pago. Cuando quieras, lo hacés desde acá." },
  vencido: { tono: "error", texto: "Se cortó la conexión con Mercado Pago (pasó mucho tiempo o se abrió en otra pestaña). Probá de nuevo." },
  otra_sesion: { tono: "error", texto: "Ese permiso se pidió desde otra cuenta. Entrá con tu usuario y probá de nuevo." },
  cuenta_en_uso: { tono: "error", texto: "Esa cuenta de Mercado Pago ya está conectada a otro negocio. Si es tuya, escribinos por WhatsApp y lo resolvemos." },
  no_disponible: { tono: "info", texto: "Conectar Mercado Pago todavía no está disponible. Te avisamos apenas lo habilitemos." },
  fallo: { tono: "error", texto: "Mercado Pago no nos respondió bien. Probá de nuevo en un rato; si sigue, escribinos por WhatsApp." },
};

export function avisoDe(crudo: string | undefined | null): { tono: "ok" | "error" | "info"; texto: string } | null {
  return crudo && Object.prototype.hasOwnProperty.call(AVISOS, crudo) ? AVISOS[crudo as AvisoMP] : null;
}
