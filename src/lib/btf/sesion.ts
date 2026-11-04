// Sesión del fotógrafo de buscatufoto: cookie `btf_sesion` HttpOnly, SameSite=Lax, firmada con
// HMAC-SHA256 y `BTF_SECRET`. Valor: `<fotografoId>.<exp>.<firma>` (exp en segundos, 30 días).
// Las funciones de firma son PURAS (secreto y hora inyectados) y están en sesion.test.ts.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ErrorBtf } from "./http";

export const COOKIE_SESION = "btf_sesion";
export const DURACION_SESION_S = 30 * 24 * 60 * 60;

function firma(payload: string, secreto: string): string {
  return createHmac("sha256", secreto).update(payload, "utf8").digest("base64url");
}

export function firmarSesion(fotografoId: string, secreto: string, ahoraMs = Date.now()): string {
  const exp = Math.floor(ahoraMs / 1000) + DURACION_SESION_S;
  const payload = `${fotografoId}.${exp}`;
  return `${payload}.${firma(payload, secreto)}`;
}

/** fotografoId si la firma es válida y no venció; null si no. Comparación en tiempo constante. */
export function verificarSesion(valor: string | null | undefined, secreto: string, ahoraMs = Date.now()): string | null {
  if (!valor || !secreto) return null;
  const partes = valor.split(".");
  if (partes.length !== 3) return null;
  const [id, exp, f] = partes;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^\d{1,12}$/.test(exp)) return null;
  const bytes = new TextEncoder();
  const esperada = bytes.encode(firma(`${id}.${exp}`, secreto));
  const dada = bytes.encode(f);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  if (Number(exp) * 1000 <= ahoraMs) return null;
  return id;
}

function secreto(): string {
  const s = process.env.BTF_SECRET?.trim();
  if (!s || s.length < 16) throw new ErrorBtf("no-configurado", "buscatufoto no tiene BTF_SECRET configurado.");
  return s;
}

function leerCookie(request: Request, nombre: string): string | null {
  const h = request.headers.get("cookie");
  if (!h) return null;
  for (const parte of h.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return null;
}

function seguro(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "http" ? "" : "; Secure";
}

/** `Set-Cookie` que abre la sesión. */
export function cookieDeSesion(request: Request, fotografoId: string): string {
  return `${COOKIE_SESION}=${firmarSesion(fotografoId, secreto())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACION_SESION_S}${seguro(request)}`;
}

/** `Set-Cookie` que la borra. */
export function cookieBorrada(request: Request): string {
  return `${COOKIE_SESION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro(request)}`;
}

/** fotografoId de la sesión o null. */
export function fotografoDeSesion(request: Request): string | null {
  return verificarSesion(leerCookie(request, COOKIE_SESION), secreto());
}

/** fotografoId de la sesión; si no hay → ErrorBtf 401. */
export function exigirFotografo(request: Request): string {
  const id = fotografoDeSesion(request);
  if (!id) throw new ErrorBtf("no-autenticado", "Ingresá para seguir.");
  return id;
}
