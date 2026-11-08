// Alta WEB autoservicio de Factoque — la parte PURA (sin base, sin red, sin disco, sin reloj propio).
//
// Orden del dueño 08/11/2026 (Factory-GSG, «Alta de negocios automatizada»): un monotributista o un
// comercio se da de alta solo desde /facturita/alta, sin que nadie de GSG intervenga. La escritura es
// la misma del script (`altaNegocioFactoque`, alta-negocio.server.ts); acá vive lo que se prueba sin
// Postgres: validar el formulario, armar el slug, sellar y abrir los enlaces de un solo uso, y los
// textos de los mails. El flujo: alta-web.server.ts. Runbook: docs/runbooks/factoque/ALTA-WEB.md.
//
// SIN MIGRACIÓN: el alta pendiente no se guarda en ninguna tabla. Viaja CIFRADA (AES-256-GCM, clave
// derivada de AUTH_SECRET) dentro del enlace que va al mail; mientras nadie lo abre no existe nada en
// la base. Es de un solo uso porque al confirmar el CUIT queda tomado (un CUIT, un negocio) y vence a
// las 24 h. El enlace para elegir la clave va atado al hash de contraseña vigente del titular: apenas
// la elige, el hash cambia y el enlace deja de servir (un solo uso, sin tabla de tokens).

// design-lint: el `.from(` de acá es Buffer.from, no una animación (no hay reducedMotion que aplicar).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isValidHost, isValidSlug, suggestSlug } from "@/lib/provisioning/slug";
import { validarEmail } from "./alta-web-form";

export { CAMPO_TRAMPA, RESPUESTA_DEL_PEDIDO, cayoEnLaTrampa, validarEmail } from "./alta-web-form";
import { validarCuitEmisor, validarNombre, validarPuntoVenta, esCondicionIva, type CondicionIva } from "@/lib/facturita-onboarding";
import type { CondicionDelEmisor } from "@/lib/fiscal/condicion-iva-emisor";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

export const VENCE_CONFIRMACION_MS = 24 * 60 * 60 * 1000;
export const VENCE_CLAVE_MS = 2 * 60 * 60 * 1000;

/** Lo que manda el formulario. Todo string: viene de un FormData. */
export interface PedidoDeAlta {
  nombre: string;
  cuit: string;
  condicion: string;
  puntoVenta: string;
  email: string;
  trampa: string;
}

/** El alta ya validada, tal cual viaja (cifrada) en el enlace del mail. */
export interface AltaPendiente {
  nombre: string;
  cuit: string;
  condicionIva: CondicionDelEmisor;
  puntoVenta: number;
  email: string;
}

export type CampoDelPedido = "nombre" | "cuit" | "condicion" | "puntoVenta" | "email";

const A_EMISOR: Record<CondicionIva, CondicionDelEmisor> = {
  monotributo: "MONOTRIBUTO",
  responsable_inscripto: "RESPONSABLE_INSCRIPTO",
  exento: "EXENTO",
};

/** Las mismas validaciones del asistente (facturita-onboarding.ts) más el mail. Junta todos los errores. */
export function validarPedido(p: PedidoDeAlta): { ok: true; alta: AltaPendiente } | { ok: false; errores: Partial<Record<CampoDelPedido, string>> } {
  const errores: Partial<Record<CampoDelPedido, string>> = {};
  const nombre = (p.nombre ?? "").trim().replace(/\s+/g, " ");
  const n = validarNombre(nombre);
  if (n) errores.nombre = n;
  const cuit = validarCuitEmisor(p.cuit ?? "");
  if (!cuit.ok) errores.cuit = cuit.error;
  if (!esCondicionIva(p.condicion)) errores.condicion = "Elegí cómo estás inscripto en ARCA.";
  const pv = validarPuntoVenta(p.puntoVenta ?? "");
  if (!pv.ok) errores.puntoVenta = pv.error;
  const email = (p.email ?? "").trim().toLowerCase();
  const e = validarEmail(email);
  if (e) errores.email = e;
  if (Object.keys(errores).length || !cuit.ok || !pv.ok || !esCondicionIva(p.condicion)) return { ok: false, errores };
  return { ok: true, alta: { nombre, cuit: cuit.cuit, condicionIva: A_EMISOR[p.condicion], puntoVenta: pv.numero, email } };
}


/**
 * Slug del negocio nuevo: el nombre en minúsculas y con guiones, recortado, más 4 caracteres al azar
 * (así dos «Kiosco Pepe» no chocan, y nadie elige el slug de otro para «completarlo»).
 */
export function slugParaElAlta(nombre: string, azar: string): string {
  const base = suggestSlug(nombre).slice(0, 40).replace(/-+$/g, "") || "negocio";
  const cola = azar.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4).padEnd(4, "0");
  const slug = `${base}-${cola}`;
  return isValidSlug(slug) && isValidHost(slug) ? slug : `negocio-${cola}`;
}

export const azarDelSlug = (): string => randomBytes(4).toString("hex").slice(0, 4);

// ── Sellos (enlaces de un solo uso) ───────────────────────────────────────────────────────────
//
// AES-256-GCM: el contenido no se lee (el CUIT y el mail no quedan a la vista en el historial ni
// en los registros de un proxy) y no se puede tocar (cualquier cambio rompe la etiqueta). Cada uso
// tiene su propia clave derivada (HMAC del secreto con el propósito), así un sello de «confirmar»
// nunca sirve como uno de «clave» y viceversa.

export type Proposito = "factoque-alta-confirmar:v1" | "factoque-alta-clave:v1";

function claveDe(secreto: string, proposito: Proposito): Buffer {
  return createHmac("sha256", secreto).update(proposito).digest();
}

export function sellar(datos: object, secreto: string, proposito: Proposito): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", claveDe(secreto, proposito), iv);
  const cuerpo = Buffer.concat([c.update(JSON.stringify(datos), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cuerpo]).toString("base64url");
}

/** null si el sello está roto, fue tocado o es de otro propósito. Nunca tira. */
export function abrir<T>(sello: string, secreto: string, proposito: Proposito): T | null {
  try {
    if (typeof sello !== "string" || sello.length < 40 || sello.length > 2000) return null;
    const b = Buffer.from(sello, "base64url");
    if (b.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", claveDe(secreto, proposito), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    const plano = Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
    return JSON.parse(plano) as T;
  } catch {
    return null;
  }
}

interface SelloConfirmar extends AltaPendiente {
  vence: number;
}

export function selloDeConfirmacion(a: AltaPendiente, ahora: number, secreto: string): string {
  return sellar({ ...a, vence: ahora + VENCE_CONFIRMACION_MS } satisfies SelloConfirmar, secreto, "factoque-alta-confirmar:v1");
}

/** El alta pendiente del enlace, o null si no sirve (roto, tocado o vencido). Revalida los datos. */
export function abrirConfirmacion(sello: string, ahora: number, secreto: string): AltaPendiente | null {
  const s = abrir<SelloConfirmar>(sello, secreto, "factoque-alta-confirmar:v1");
  if (!s || typeof s.vence !== "number" || s.vence <= ahora) return null;
  const v = validarPedido({
    nombre: s.nombre,
    cuit: s.cuit,
    condicion: Object.entries(A_EMISOR).find(([, e]) => e === s.condicionIva)?.[0] ?? "",
    puntoVenta: String(s.puntoVenta),
    email: s.email,
    trampa: "",
  });
  return v.ok ? v.alta : null;
}

interface SelloClave {
  usuario: string;
  negocio: string;
  /** Huella del hash de contraseña vigente: cuando cambia, el enlace muere. */
  huella: string;
  vence: number;
}

/** Huella corta del hash guardado. No sirve para nada fuera de comparar. */
export const huellaDelHash = (passwordHash: string): string => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 22);

export function selloDeClave(p: { usuario: string; negocio: string; passwordHash: string }, ahora: number, secreto: string): string {
  return sellar(
    { usuario: p.usuario, negocio: p.negocio, huella: huellaDelHash(p.passwordHash), vence: ahora + VENCE_CLAVE_MS } satisfies SelloClave,
    secreto,
    "factoque-alta-clave:v1",
  );
}

export function abrirClave(sello: string, ahora: number, secreto: string): { usuario: string; negocio: string; huella: string } | null {
  const s = abrir<SelloClave>(sello, secreto, "factoque-alta-clave:v1");
  if (!s || typeof s.vence !== "number" || s.vence <= ahora) return null;
  if (typeof s.usuario !== "string" || typeof s.negocio !== "string" || typeof s.huella !== "string") return null;
  return { usuario: s.usuario, negocio: s.negocio, huella: s.huella };
}

/** Compara huellas sin filtrar por tiempo cuánto coinciden. */
export function mismaHuella(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── Límites de pedidos ────────────────────────────────────────────────────────────────────────
//
// Mismo limitador en memoria que el login (rate-limit.ts; por instancia, limitación documentada
// ahí). Cada pedido CUENTA, salga bien o mal: acá no hay «login bueno» que limpie.

export interface Limites {
  /** true = pasa (y queda contado); false = frenado. */
  pasa(claves: string[]): boolean;
}

export function crearLimites(reglas: Record<string, { max: number; windowMs: number }>, now: () => number = Date.now): Limites {
  const porPrefijo = new Map<string, RateLimiter>(Object.entries(reglas).map(([k, r]) => [k, createRateLimiter(r, now)]));
  return {
    pasa(claves) {
      const pares = claves.map((c) => {
        const l = porPrefijo.get(c.split(":")[0]);
        if (!l) throw new Error(`límite sin regla: ${c.split(":")[0]}`);
        return [l, c] as const;
      });
      if (pares.some(([l, c]) => l.blocked(c))) return false;
      for (const [l, c] of pares) l.fail(c);
      return true;
    },
  };
}

const HORA = 60 * 60 * 1000;
/**
 * Pedir el alta: 20 por hora por IP (la oficina de un contador o un 4G compartido dan de alta a
 * varios), 3 por hora por mail y 3 por hora por CUIT (el freno fino contra el abuso).
 */
export const REGLAS_DEL_ALTA = {
  "alta-ip": { max: 20, windowMs: HORA },
  "alta-mail": { max: 3, windowMs: HORA },
  "alta-cuit": { max: 3, windowMs: HORA },
  /** Confirmar y elegir la clave: 20 por hora por IP (abrir el enlace dos veces no es abuso). */
  "enlace-ip": { max: 20, windowMs: HORA },
} as const;

// ── Textos ────────────────────────────────────────────────────────────────────────────────────


export function mailDeConfirmacion(d: { nombre: string; enlace: string }): { asunto: string; cuerpo: string } {
  return {
    asunto: "Confirmá tu alta en Factoque",
    cuerpo: [
      "¡Hola!",
      "",
      `Pediste dar de alta «${d.nombre}» en Factoque. Para confirmarlo, abrí este enlace:`,
      "",
      d.enlace,
      "",
      "Sirve una sola vez y vence en 24 horas. Después de confirmar elegís tu contraseña.",
      "Si no fuiste vos, ignorá este mail: sin confirmar no se crea nada.",
      "",
      "Gestión Studio Grow",
    ].join("\n"),
  };
}

/**
 * El mail cuando el alta no se puede hacer con esos datos (por ejemplo, el CUIT ya tiene cuenta).
 * Va SÓLO a la casilla que lo pidió y no dice el motivo: la pantalla responde igual en los dos casos.
 */
export function mailSinAlta(): { asunto: string; cuerpo: string } {
  return {
    asunto: "Tu pedido de alta en Factoque",
    cuerpo: [
      "¡Hola!",
      "",
      "Recibimos un pedido de alta en Factoque con este mail, pero no lo pudimos hacer con esos datos.",
      "Si ya tenés una cuenta, entrá desde la dirección de tu negocio. Si el CUIT es tuyo y vos no lo diste",
      "de alta, respondé este mail o escribinos por WhatsApp: lo revisamos con tu constancia de inscripción.",
      "",
      "Si no fuiste vos, ignorá este mail.",
      "",
      "Gestión Studio Grow",
    ].join("\n"),
  };
}

/** Dirección pública del negocio nuevo (el host donde vive su sesión). */
export function hostDelNegocio(subdominio: string, dominio: string): string {
  return `${subdominio}.${dominio}`;
}

// ── CUIT sin verificar (aprobado por el dueño, 08/11/2026: «Está ok la validación de la alta web») ──
//
// Nada en el alta web prueba que quien la pide sea el titular del CUIT. La prueba llega después: el
// certificado de ARCA sólo lo saca el titular con SU clave fiscal. Por eso:
//  - un negocio está VERIFICADO cuando tiene cargado un certificado de ARCA de su mismo CUIT;
//  - un alta web sin verificar NO bloquea al titular real: puede reclamar el CUIT dando de alta el suyo,
//    y gana el primero que conecte ARCA (src/lib/fiscal/tenant-cert.ts se niega a cargarle el
//    certificado a un alta web si otro negocio ya verificó ese CUIT);
//  - un alta web sin verificar VENCE a los 15 días (provisional a confirmar) y deja de ocupar el CUIT.
//    No se borra nada: vencer es dejar de contar.
// Un negocio dado de alta por GSG (consola o script) siempre ocupa su CUIT: lo revisó una persona.

/** Plazo para conectar ARCA antes de que el alta web deje de ocupar el CUIT. Provisional a confirmar. */
export const VENCE_ALTA_SIN_VERIFICAR_MS = 15 * 24 * 60 * 60 * 1000;

/** Un negocio que ya tiene ese CUIT cargado. */
export interface TenedorDelCuit {
  tenantId: string;
  subdomain: string | null;
  creado: Date;
  /** Tiene certificado de ARCA de ese CUIT. */
  verificado: boolean;
  /** Vino del alta web (auditoría `factoque.alta` con actor `web:`). */
  web: boolean;
  titulares: { id: string; email: string; lastLoginAt: Date | null }[];
}

export type SituacionDelCuit =
  /** Nadie lo ocupa (o sólo altas web vencidas). */
  | { tipo: "libre" }
  /** Sólo lo ocupan altas web sin verificar y vigentes: el titular real puede reclamarlo. */
  | { tipo: "reclamable" }
  /** Este mismo mail ya tiene un negocio con ese CUIT: no se crea otro (se retoma el suyo). */
  | { tipo: "propio"; tenedor: TenedorDelCuit }
  /** Lo ocupa un negocio verificado o dado de alta por GSG. */
  | { tipo: "bloqueado" };

export const ocupaElCuit = (t: TenedorDelCuit, ahora: number): boolean =>
  t.verificado || !t.web || t.creado.getTime() + VENCE_ALTA_SIN_VERIFICAR_MS > ahora;

export function situacionDelCuit(tenedores: readonly TenedorDelCuit[], ahora: number, email: string): SituacionDelCuit {
  const propio = tenedores.find((t) => t.web && ocupaElCuit(t, ahora) && t.titulares.some((u) => u.email === email));
  if (propio) return { tipo: "propio", tenedor: propio };
  if (tenedores.some((t) => t.verificado || !t.web)) return { tipo: "bloqueado" };
  return tenedores.some((t) => ocupaElCuit(t, ahora)) ? { tipo: "reclamable" } : { tipo: "libre" };
}

/** El mail al titular que encuentra su CUIT ocupado por un alta sin verificar. Lleva enlace para reclamarlo. */
export function mailDeReclamo(d: { nombre: string; enlace: string }): { asunto: string; cuerpo: string } {
  return {
    asunto: "Confirmá tu alta en Factoque",
    cuerpo: [
      "¡Hola!",
      "",
      `Pediste dar de alta «${d.nombre}» en Factoque. Ese CUIT figura en otra alta que todavía no conectó ARCA`,
      "(nadie comprobó todavía que sea del titular). Podés reclamarlo: confirmá con este enlace y conectá ARCA",
      "con tu clave fiscal desde Mi cuenta. Se queda con el CUIT el primero que lo conecte.",
      "",
      d.enlace,
      "",
      "Sirve una sola vez y vence en 24 horas. Si no fuiste vos, ignorá este mail: sin confirmar no se crea nada.",
      "",
      "Gestión Studio Grow",
    ].join("\n"),
  };
}
