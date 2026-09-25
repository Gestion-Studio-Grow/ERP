/**
 * RENDÍ — lectura del QR de ARCA (Core, PURO).
 *
 * El QR del comprobante es una URL `https://www.afip.gob.ar/fe/qr/?p=<base64>` (o arca.gob.ar) cuyo
 * parámetro `p` es un JSON en base64 con 13 campos: ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe,
 * moneda, ctz, tipoDocRec, nroDocRec, tipoCodAut, codAut. No trae neto ni IVA (eso lo propone la IA).
 * Especificación: ver `LecturaQr` en tipos.ts; el emisor de la casa está en `src/plugins/arca/domain/qr-afip.ts`.
 *
 * Corre en node (tests) y en el navegador (demo): detecta `Buffer` y si no está usa `atob`/`btoa`.
 * El texto pasa siempre por UTF-8 (TextEncoder/TextDecoder), así un campo con tildes no rompe nada.
 * Zona estándar (ADR-046) en el parseo; zona humana en los errores, que se muestran tal cual.
 */

import { cuitValido, normalizarCuit } from "@/lib/cuit";
import { pesos } from "./dinero";
import { esFechaIso } from "./fechas";
import type { ClaseComprobante, LecturaQr, ResultadoLecturaQr } from "./tipos";

/** Base de la URL que arma `urlQrArca` (dominio nuevo de ARCA; el lector acepta los dos). */
export const URL_QR_ARCA = "https://www.arca.gob.ar/fe/qr/";

const DOMINIOS_QR = new Set(["afip.gob.ar", "www.afip.gob.ar", "arca.gob.ar", "www.arca.gob.ar"]);

const NO_ES_DE_ARCA = "Este QR no es de un comprobante de ARCA";

// ─────────────────────────────────────────────────────────────────────────────
// Base64 en los dos entornos
// ─────────────────────────────────────────────────────────────────────────────

/** Codifica/decodifica bytes ↔ base64 estándar (con relleno). */
export interface CodecBase64 {
  codificar(bytes: Uint8Array): string;
  decodificar(b64: string): Uint8Array;
}

/** Node: `Buffer`. */
export const codecNode: CodecBase64 = {
  codificar: (bytes) => Buffer.from(bytes).toString("base64"),
  decodificar: (b64) => new Uint8Array(Buffer.from(b64, "base64")),
};

/** Navegador: `btoa`/`atob` sobre una "cadena binaria" (un carácter por byte, siempre < 256). */
export const codecNavegador: CodecBase64 = {
  codificar: (bytes) => {
    let binaria = "";
    for (const b of bytes) binaria += String.fromCharCode(b);
    return btoa(binaria);
  },
  decodificar: (b64) => {
    const binaria = atob(b64);
    const bytes = new Uint8Array(binaria.length);
    for (let i = 0; i < binaria.length; i++) bytes[i] = binaria.charCodeAt(i);
    return bytes;
  },
};

function codecDelEntorno(): CodecBase64 {
  return typeof Buffer !== "undefined" ? codecNode : codecNavegador;
}

/**
 * Deja un base64 estándar con relleno a partir de cualquier variante: url-safe (`-` `_`), sin relleno,
 * con saltos de línea, o con espacios donde había `+` (pasa cuando alguien decodificó la URL como
 * formulario). Devuelve undefined si no es base64.
 */
function normalizarBase64(s: string): string | undefined {
  let t = s.replace(/[\r\n\t]/g, "").replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  t = t.replace(/=+$/, "");
  if (t.length === 0 || !/^[A-Za-z0-9+/]+$/.test(t) || t.length % 4 === 1) return undefined;
  while (t.length % 4 !== 0) t += "=";
  return t;
}

/** Texto → UTF-8 → base64 estándar. */
export function codificarBase64Utf8(texto: string, codec: CodecBase64 = codecDelEntorno()): string {
  return codec.codificar(new TextEncoder().encode(texto));
}

/** Base64 (cualquier variante) → UTF-8 → texto. undefined si no es base64. */
export function decodificarBase64Utf8(b64: string, codec: CodecBase64 = codecDelEntorno()): string | undefined {
  const normal = normalizarBase64(b64);
  if (normal === undefined) return undefined;
  try {
    return new TextDecoder("utf-8").decode(codec.decodificar(normal));
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/** Saca el parámetro `p` de la URL del QR, o toma el texto como base64 suelto. */
function extraerBase64(texto: string): string | undefined {
  const t = texto.trim();
  const esUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
  const esUrlSinProtocolo = /^(www\.)?(afip|arca)\.gob\.ar\//i.test(t);
  if (!esUrl && !esUrlSinProtocolo) return t;

  let url: URL;
  try {
    url = new URL(esUrl ? t : `https://${t}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (!DOMINIOS_QR.has(url.hostname.toLowerCase())) return undefined;
  if (!/^\/fe\/qr\/?$/i.test(url.pathname)) return undefined;

  // Se lee la query cruda: URLSearchParams convertiría los "+" del base64 en espacios.
  const crudo = url.search
    .replace(/^\?/, "")
    .split("&")
    .find((par) => par.startsWith("p="));
  if (crudo === undefined) return undefined;
  try {
    return decodeURIComponent(crudo.slice(2));
  } catch {
    return undefined;
  }
}

function enteroPositivo(v: unknown): number | undefined {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

function numeroNoNegativo(v: unknown): number | undefined {
  const n = typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function texto(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/**
 * Lee el QR de un comprobante de ARCA. Acepta la URL completa (afip.gob.ar o arca.gob.ar, con o sin
 * `www`, http o https) o el base64 solo (estándar o url-safe, con o sin relleno). Valida versión,
 * fecha, CUIT con dígito verificador, punto de venta, tipo y número (enteros positivos), importe (≥ 0),
 * tipo de autorización (E o A) y que haya código de autorización. El importe sale en centavos.
 */
export function leerQrArca(entrada: string): ResultadoLecturaQr {
  const b64 = extraerBase64(entrada);
  if (b64 === undefined) return { ok: false, error: NO_ES_DE_ARCA };
  const json = decodificarBase64Utf8(b64);
  if (json === undefined) return { ok: false, error: NO_ES_DE_ARCA };

  let p: unknown;
  try {
    p = JSON.parse(json);
  } catch {
    return { ok: false, error: NO_ES_DE_ARCA };
  }
  if (typeof p !== "object" || p === null || Array.isArray(p)) return { ok: false, error: NO_ES_DE_ARCA };
  const q = p as Record<string, unknown>;

  const version = enteroPositivo(q.ver);
  if (version === undefined) return { ok: false, error: "El QR tiene una versión que no reconocemos" };

  const fecha = typeof q.fecha === "string" ? q.fecha.trim() : "";
  if (!esFechaIso(fecha)) return { ok: false, error: "El QR tiene una fecha inválida" };

  const cuit = normalizarCuit(texto(q.cuit) ?? "");
  if (!cuitValido(cuit)) return { ok: false, error: "El QR tiene un CUIT inválido" };

  const puntoVenta = enteroPositivo(q.ptoVta);
  if (puntoVenta === undefined) return { ok: false, error: "El QR tiene un punto de venta inválido" };

  const tipoComprobanteArca = enteroPositivo(q.tipoCmp);
  if (tipoComprobanteArca === undefined) return { ok: false, error: "El QR tiene un tipo de comprobante inválido" };

  const numero = enteroPositivo(q.nroCmp);
  if (numero === undefined) return { ok: false, error: "El QR tiene un número de comprobante inválido" };

  const importe = numeroNoNegativo(q.importe);
  if (importe === undefined) return { ok: false, error: "El QR tiene un importe inválido" };

  const tipoCodAut = texto(q.tipoCodAut)?.toUpperCase();
  if (tipoCodAut !== "E" && tipoCodAut !== "A") {
    return { ok: false, error: "El QR tiene un tipo de autorización inválido (tiene que ser CAE o CAEA)" };
  }

  const codAut = texto(q.codAut) ?? "";
  if (codAut === "") return { ok: false, error: "El QR no trae el código de autorización (CAE)" };

  // Campos que la especificación trae siempre pero el contrato no pide validar: valores por defecto
  // prudentes. El receptor es opcional en la especificación (consumidor final sin identificar).
  const moneda = texto(q.moneda) || "PES";
  const cotizacion = numeroNoNegativo(q.ctz) || 1;
  const tipoDocReceptor = enteroPositivo(q.tipoDocRec) ?? 99;
  const nroDocReceptor = texto(q.nroDocRec) || "0";

  return {
    ok: true,
    lectura: {
      version,
      fecha,
      cuitEmisor: cuit,
      puntoVenta,
      tipoComprobanteArca,
      numero,
      importeTotal: pesos(importe),
      moneda,
      cotizacion,
      tipoDocReceptor,
      nroDocReceptor,
      tipoCodAut,
      codAut,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de comprobante ARCA ↔ clase del producto
// ─────────────────────────────────────────────────────────────────────────────

const CLASE_POR_TIPO: Record<number, ClaseComprobante> = {
  1: "factura_a",
  6: "factura_b",
  11: "factura_c",
  51: "factura_m",
  81: "tique_factura_a",
  82: "tique_consumidor_final", // tique factura B
  83: "tique_consumidor_final", // tique
};

/** Código ARCA → clase. 82 y 83 caen en `tique_consumidor_final`. Desconocido → undefined. */
export function claseDesdeTipoArca(tipo: number): ClaseComprobante | undefined {
  return CLASE_POR_TIPO[tipo];
}

const TIPO_POR_CLASE: Partial<Record<ClaseComprobante, number>> = {
  factura_a: 1,
  factura_b: 6,
  factura_c: 11,
  factura_m: 51,
  tique_factura_a: 81,
  tique_consumidor_final: 83, // la inversa no es única (82 u 83): se elige el tique genérico
};

/** Clase → código ARCA. `tique_peaje` y `sin_comprobante` no tienen código propio → undefined. */
export function tipoArcaDesdeClase(clase: ClaseComprobante): number | undefined {
  return TIPO_POR_CLASE[clase];
}

// ─────────────────────────────────────────────────────────────────────────────
// Armado (datos ficticios de la demo)
// ─────────────────────────────────────────────────────────────────────────────

/** Los números de hasta 15 dígitos van como número en el JSON (como el QR oficial); el resto, como texto. */
function numeroSiEntra(s: string): number | string {
  return /^\d{1,15}$/.test(s) ? Number(s) : s;
}

/**
 * Arma la URL del QR (arca.gob.ar) con el JSON de la especificación, en base64 estándar con relleno,
 * igual que el QR impreso. `leerQrArca(urlQrArca(l))` devuelve `l`.
 */
export function urlQrArca(l: LecturaQr): string {
  const payload = {
    ver: l.version,
    fecha: l.fecha,
    cuit: numeroSiEntra(l.cuitEmisor),
    ptoVta: l.puntoVenta,
    tipoCmp: l.tipoComprobanteArca,
    nroCmp: l.numero,
    importe: l.importeTotal / 100,
    moneda: l.moneda,
    ctz: l.cotizacion,
    tipoDocRec: l.tipoDocReceptor,
    nroDocRec: numeroSiEntra(l.nroDocReceptor),
    tipoCodAut: l.tipoCodAut,
    codAut: numeroSiEntra(l.codAut),
  };
  return `${URL_QR_ARCA}?p=${codificarBase64Utf8(JSON.stringify(payload))}`;
}
