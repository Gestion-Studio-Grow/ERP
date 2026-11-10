// ProfeTurnos — alta sola de un profe de pádel: lo PURO (validar el formulario, armar la dirección,
// límites de pedidos, la llave del flag). Sin base, sin red: lo prueba alta-core.test.ts.
// La escritura está en alta.server.ts; la pantalla, en src/app/profeturnos/alta/.

import { isValidArgentinePhone, isValidEmail } from "@/lib/contact-validation";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import { validatePasswordStrength } from "@/lib/password-policy";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import type { CampoDelAlta } from "./alta-campos";

/** El rubro y los módulos del negocio nuevo (src/blueprints/presets-meta.ts, `profe-padel`). */
export const BLUEPRINT_PROFE = "profe-padel";
export const MODULOS_PROFE = ["padel-clases", "clients"] as const;

export { CAMPO_TRAMPA, CAMPOS, type CampoDelAlta } from "./alta-campos";

export interface FormularioDelAlta {
  nombre: string;
  negocio: string;
  email: string;
  whatsapp: string;
  clave: string;
  /** Lo que manda el checkbox: "si" (o "on") cuando está tildado. */
  terminos: string;
  trampa: string;
}

export interface DatosDelAlta {
  nombre: string;
  negocio: string;
  /** En minúsculas. */
  email: string;
  /** 10 dígitos (área + número), la clave de src/lib/clientes/telefono.ts. */
  whatsapp: string;
  clave: string;
}

export type Validacion = { ok: true; datos: DatosDelAlta } | { ok: false; errores: Partial<Record<CampoDelAlta, string>> };

const limpio = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** ¿Cayó el robot? Cualquier cosa escrita en el campo trampa. */
export function cayoEnLaTrampa(trampa: string | null | undefined): boolean {
  return String(trampa ?? "").trim() !== "";
}

/** Valida todo y devuelve TODOS los errores juntos, uno por campo, en criollo. */
export function validarAlta(f: FormularioDelAlta): Validacion {
  const errores: Partial<Record<CampoDelAlta, string>> = {};
  const nombre = limpio(f.nombre, 80);
  const negocio = limpio(f.negocio, 60);
  const email = limpio(f.email, 254).toLowerCase();
  const whatsappCrudo = limpio(f.whatsapp, 30);
  const clave = String(f.clave ?? "");

  if (nombre.length < 2) errores.nombre = "Escribí tu nombre.";
  if (negocio.length < 2) errores.negocio = "Poné cómo se llaman tus clases (ej.: Clases de pádel Juan).";
  else if (!/[\p{L}\d]/u.test(negocio)) errores.negocio = "El nombre tiene que tener al menos una letra o un número.";
  if (!isValidEmail(email)) errores.email = "Revisá el mail: tiene que ser del estilo nombre@ejemplo.com.";
  const whatsapp = normalizarTelefono(whatsappCrudo);
  if (!isValidArgentinePhone(whatsappCrudo) || whatsapp.length !== 10) {
    errores.whatsapp = "Poné tu celular con código de área, sin 0 ni 15 (ej.: 11 2345-6789).";
  }
  if (clave.length > 200) errores.clave = "La contraseña es demasiado larga.";
  else {
    const c = validatePasswordStrength(clave);
    if (!c.ok) errores.clave = c.problems.join(" ");
  }
  const t = String(f.terminos ?? "").trim().toLowerCase();
  if (t !== "si" && t !== "on") errores.terminos = "Para seguir tenés que aceptar los términos.";

  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: { nombre, negocio, email, whatsapp, clave } };
}

// ── La dirección (slug = subdominio) ─────────────────────────────────────────────────────────

const LARGO_SLUG = 40;

/** Direcciones que no puede tomar un negocio (son de GSG o de la plataforma). */
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  "www", "app", "api", "admin", "operador", "contador", "mail", "smtp", "ftp", "static", "assets", "cdn",
  "gsg", "gsgapp", "soporte", "ayuda", "demo", "test", "staging", "preview",
  "profeturnos", "factoque", "facturita", "login", "alta", "blog",
]);

/**
 * La dirección sugerida a partir del nombre del negocio: minúsculas, sin acentos, guiones.
 * «Clases de Pádel Ñandú» → `clases-de-padel-nandu`. Nunca vacía: sin nada usable da `profe`.
 */
export function slugSugerido(negocio: string): string {
  let s = String(negocio ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > LARGO_SLUG) s = s.slice(0, LARGO_SLUG).replace(/-[^-]*$/, "") || s.slice(0, LARGO_SLUG);
  s = s.replace(/-+$/g, "");
  if (s.length < 3) s = s ? `profe-${s}` : "profe";
  if (SLUGS_RESERVADOS.has(s)) s = `${s}-profe`;
  return s;
}

/**
 * La primera dirección libre: la sugerida, o con sufijo `-2`, `-3`… si ya la usa otro negocio.
 * `ocupadas` son slugs y subdominios de los negocios existentes. Null si se agotan los intentos.
 */
export function slugLibre(base: string, ocupadas: Iterable<string>, maxIntentos = 200): string | null {
  const usadas = new Set([...ocupadas].map((x) => String(x).toLowerCase()));
  for (let i = 1; i <= maxIntentos; i++) {
    const c = i === 1 ? base : `${base}-${i}`;
    if (!usadas.has(c) && !SLUGS_RESERVADOS.has(c)) return c;
  }
  return null;
}

/** El panel del profe nuevo: `https://<slug>.<dominio>/admin` (login → bienvenida). */
export function urlDelPanel(slug: string, dominio: string): string {
  const d = String(dominio).trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${slug}.${d}/admin`;
}

// ── El flag ──────────────────────────────────────────────────────────────────────────────────

/** El alta sólo se abre con `PROFETURNOS_ALTA_ABIERTA=1` exacto, sin espacios (prod no se abre sin el OK del dueño). */
export function altaAbierta(env: Record<string, string | undefined> = process.env): boolean {
  return env.PROFETURNOS_ALTA_ABIERTA === "1";
}

// ── Límites de pedidos (en memoria, por instancia: misma limitación documentada en rate-limit.ts) ──

export interface Limites {
  /** true = pasa (y queda contado); false = frenado (no se cuenta). */
  pasa(claves: string[]): boolean;
}

const HORA = 60 * 60 * 1000;

/** 20 altas por hora por IP (un club con wifi compartido da de alta a varios profes); 3 por hora por mail. */
export const REGLAS_DEL_ALTA = {
  "alta-ip": { max: 20, windowMs: HORA },
  "alta-mail": { max: 3, windowMs: HORA },
} as const;

export function crearLimites(
  reglas: Record<string, { max: number; windowMs: number }> = REGLAS_DEL_ALTA,
  now: () => number = Date.now,
): Limites {
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
