// Alta automatizada de un negocio Factoque — la parte PURA (sin base, sin red, sin disco).
//
// Orden del dueño 08/11/2026 (Factory-GSG, «Alta de negocios automatizada»): el alta de un negocio
// Factoque deja de hacerse a mano en /operador. Acá vive lo que se puede probar sin Postgres:
// leer los flags, decidir qué pasa con la contraseña provisoria, el texto del mail al titular y lo
// que imprime el script. La escritura está en `alta-negocio.server.ts`; el CLI, en
// `scripts/factoque/alta-negocio.mts`. Runbook: docs/runbooks/factoque/ALTA-AUTOMATIZADA.md.
//
// REGLA DE LA CONTRASEÑA: nunca se imprime, nunca va a un log ni a la auditoría. Viaja sólo en el
// mail al titular (aparte) o queda en un archivo local 0600 hasta que se confirma el envío.

import { interpretarCuitInput } from "@/lib/fiscal/cuit-input";
import { CONDICIONES_DEL_EMISOR, type CondicionDelEmisor } from "@/lib/fiscal/condicion-iva-emisor";
import { isValidEmail, isValidHost, isValidSlug } from "@/lib/provisioning/slug";

export const BLUEPRINT_FACTOQUE = "facturita";
/** Lo mínimo que tiene que tener prendido un negocio Factoque: facturación ARCA + receptores. */
export const MODULOS_FACTOQUE = ["arca", "clients"] as const;
export const DOMINIO_POR_DEFECTO = "gsgapp.com.ar";
export const RUTA_DE_LA_APP = "/facturita/app";

export interface DatosDelAlta {
  nombre: string;
  slug: string;
  /** 11 dígitos, sin guiones. */
  cuit: string;
  condicionIva: CondicionDelEmisor;
  puntoVenta: number;
  /** Email del titular (OWNER), en minúsculas. */
  email: string;
  /** Nombre del titular; si no viene, el del negocio. */
  titular: string;
  /** Quién corre el alta, para la auditoría. */
  operador: string;
}

export type ArgsDelAlta =
  | { ok: true; modo: "alta"; datos: DatosDelAlta }
  | { ok: true; modo: "confirmar-envio"; slug: string }
  | { ok: false; errores: string[] };

const ALIAS_IVA: Record<string, CondicionDelEmisor> = {
  ri: "RESPONSABLE_INSCRIPTO",
  "responsable-inscripto": "RESPONSABLE_INSCRIPTO",
  responsable_inscripto: "RESPONSABLE_INSCRIPTO",
  mono: "MONOTRIBUTO",
  monotributo: "MONOTRIBUTO",
  monotributista: "MONOTRIBUTO",
  exento: "EXENTO",
};

/** RI / monotributo / exento (también la clave larga de `CONDICIONES_DEL_EMISOR`), o null. */
export function leerCondicionIva(raw: string | undefined): CondicionDelEmisor | null {
  const v = (raw ?? "").trim();
  if (Object.hasOwn(CONDICIONES_DEL_EMISOR, v)) return v as CondicionDelEmisor;
  return ALIAS_IVA[v.toLowerCase()] ?? null;
}

/** `--clave valor` y `--clave=valor`. Un flag sin valor queda en "true". */
export function leerFlags(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else {
      out[a.slice(2)] = "true";
    }
  }
  return out;
}

export const USO =
  "Uso: node --import tsx scripts/factoque/alta-negocio.mts --nombre \"Nombre\" --slug nombre-corto " +
  "--cuit 20304050607 --condicion-iva monotributo|ri|exento --punto-venta 3 --email titular@dominio.com " +
  "[--titular \"Nombre y apellido\"] [--operador quien]\n" +
  "       node --import tsx scripts/factoque/alta-negocio.mts --confirmar-envio --slug nombre-corto";

/** Valida los flags del CLI. Junta TODOS los errores para que se corrijan de una vez. */
export function interpretarArgs(argv: readonly string[]): ArgsDelAlta {
  const f = leerFlags(argv);
  const errores: string[] = [];
  const slug = (f.slug ?? "").trim();
  if (!isValidSlug(slug) || !isValidHost(slug) || slug.length > 63) {
    errores.push(`--slug "${slug}" no sirve: minúsculas, números y guiones (ej. "almacen-don-pepe"), sin empezar ni terminar en guión, hasta 63.`);
  }
  if (f["confirmar-envio"] === "true") {
    return errores.length ? { ok: false, errores } : { ok: true, modo: "confirmar-envio", slug };
  }

  const nombre = (f.nombre ?? "").trim();
  if (!nombre) errores.push("Falta --nombre (el nombre del negocio).");

  let cuit = "";
  const c = interpretarCuitInput(f.cuit ?? "");
  if (c.accion === "set") cuit = c.cuit;
  else errores.push(c.accion === "error" ? c.motivo : "Falta --cuit (11 números, tal cual figura en ARCA).");

  const condicionIva = leerCondicionIva(f["condicion-iva"]);
  if (!condicionIva) errores.push("--condicion-iva tiene que ser monotributo, ri (responsable inscripto) o exento.");

  const pvRaw = (f["punto-venta"] ?? "").trim();
  const puntoVenta = /^\d{1,5}$/.test(pvRaw) ? Number(pvRaw) : 0;
  if (puntoVenta <= 0) errores.push("--punto-venta va un número entero de 1 a 99999 (el que ARCA habilitó para ese CUIT).");

  const email = (f.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) errores.push("--email del titular no es una dirección válida.");

  if (errores.length) return { ok: false, errores };
  return {
    ok: true,
    modo: "alta",
    datos: {
      nombre,
      slug,
      cuit,
      condicionIva: condicionIva!,
      puntoVenta,
      email,
      titular: (f.titular ?? "").trim() || nombre,
      operador: (f.operador ?? "").trim() || "script-alta-factoque",
    },
  };
}

export function urlDelNegocio(subdominio: string, dominio: string = DOMINIO_POR_DEFECTO): string {
  return `https://${subdominio}.${dominio}${RUTA_DE_LA_APP}`;
}

/**
 * ¿Hay una contraseña provisoria que entregar en esta corrida?
 *  - "nueva": el titular se creó ahora con la clave generada.
 *  - "pendiente": el titular ya existía, pero quedó una clave sin entregar de una corrida anterior
 *    (el archivo local sigue ahí): se reintenta el envío.
 *  - "ninguna": el titular ya existía y no hay nada pendiente; su contraseña no se toca.
 */
export function claveAEntregar(p: { titularCreado: boolean; habiaArchivo: boolean }): "nueva" | "pendiente" | "ninguna" {
  if (p.titularCreado) return "nueva";
  return p.habiaArchivo ? "pendiente" : "ninguna";
}

export type EstadoDeLaClave =
  | { tipo: "enviada" }
  | { tipo: "pendiente"; motivo: string; archivo: string }
  | { tipo: "sin-cambios" };

/** El mail aparte al titular. Es lo ÚNICO que lleva la contraseña. */
export function mailAlTitular(d: { negocio: string; titular: string; url: string; email: string; clave: string }): {
  asunto: string;
  cuerpo: string;
} {
  return {
    asunto: `Tu acceso a Factoque — ${d.negocio}`,
    cuerpo: [
      `Hola, ${d.titular}:`,
      "",
      `Ya está listo el lugar de ${d.negocio} para facturar con Factoque.`,
      "",
      `Entrá acá: ${d.url}`,
      `Usuario: ${d.email}`,
      `Contraseña provisoria: ${d.clave}`,
      "",
      "Al entrar por primera vez te vamos a pedir que elijas una contraseña tuya: la provisoria deja de",
      "servir apenas la cambiás. No la reenvíes ni la compartas.",
      "",
      "Para emitir facturas de verdad falta un paso que hacés vos con tu clave fiscal en ARCA",
      "(habilitar el punto de venta y el certificado). Te acompañamos por WhatsApp cuando quieras.",
      "",
      "Gestión Studio Grow",
    ].join("\n"),
  };
}

export interface ResultadoDelAlta {
  slug: string;
  url: string;
  usuario: string;
  negocioCreado: boolean;
  /** Lo que se completó en esta corrida (vacío si ya estaba todo). */
  completado: string[];
  clave: EstadoDeLaClave;
}

/** Lo único que imprime el script. Nunca la contraseña. */
export function lineasDeSalida(r: ResultadoDelAlta): string[] {
  const que = r.negocioCreado ? "creado" : r.completado.length ? `completado (${r.completado.join(", ")})` : "ya estaba completo";
  const clave =
    r.clave.tipo === "enviada"
      ? "enviada"
      : r.clave.tipo === "pendiente"
        ? `pendiente de envío — ${r.clave.motivo}. Queda en ${r.clave.archivo} (0600); al mandarla: --confirmar-envio --slug ${r.slug}`
        : "sin cambios (el titular ya existía; no se tocó su contraseña)";
  return [`slug: ${r.slug} · ${que}`, `url: ${r.url}`, `usuario: ${r.usuario}`, `contraseña: ${clave}`];
}
