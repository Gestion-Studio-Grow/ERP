// ============================================================================
// GUARDIA SSRF — toda llamada a una dirección que da un cliente (E3 §6, H6).
// ============================================================================
//
// Un webhook saliente, la URL de una tienda WooCommerce o cualquier dirección que escribe un
// cliente puede apuntar adentro de nuestra red: a los metadatos de la nube (169.254.169.254),
// a la base, a un servicio en loopback. Esta guardia se interpone ANTES de conectar:
//
//   1. URL: sólo https (http sólo con la excepción de prueba), sin usuario:clave, puertos
//      443/8443, y fuera los nombres que no son de internet (localhost, *.local, *.internal,
//      nombres sin punto).
//   2. DNS: se resuelven TODAS las direcciones del nombre; si alguna no es pública, se
//      rechaza (un nombre con una IP pública y una privada no pasa).
//   3. IP FIJADA: se conecta a la IP ya validada con un `lookup` propio, así un segundo DNS
//      (DNS rebinding) no puede cambiarla entre la validación y la conexión. El certificado
//      TLS se valida igual contra el nombre (SNI).
//   4. Sin redirecciones: un 3xx es error, no se sigue.
//   5. Plazo total (5 s por defecto, DNS incluido) y tope de la respuesta (64 KB por
//      defecto). No se pide compresión: el tope es sobre los bytes que llegan.
//
// Qué IP es pública: IPv4 fuera de 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12,
// 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24,
// 224/4 y 240/4. IPv6: sólo unicast global (2000::/3) y, dentro de eso, fuera 2001::/23
// (Teredo y reservas), 2001:db8::/32, 2002::/16 (6to4) y 3fff::/20. Todo lo demás (::1, ::,
// fc00::/7, fe80::/10, ff00::/8, NAT64 64:ff9b::/96 y cualquier IPv4 MAPEADA ::ffff:a.b.c.d)
// se rechaza. Las direcciones con zona ("%eth0") no se aceptan.
//
// Las excepciones para tests (http, una IP de loopback, un puerto) se pasan POR PARÁMETRO,
// nunca por variable de entorno, y con NODE_ENV=production se rechazan: no pueden quedar
// prendidas en producción.
//
// Sólo servidor (node:dns, node:http, node:https).

import { promises as dnsPromises } from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import type { LookupFunction } from "node:net";
import type { CodigoError } from "./errores";
import type { RespuestaHttp, SolicitudHttp, TransporteHttp } from "./contrato";

// ── Errores ──────────────────────────────────────────────────────────────────

export type MotivoBloqueo =
  | "url-invalida"
  | "protocolo"
  | "credenciales-en-url"
  | "puerto"
  | "nombre-no-publico"
  | "ip-no-publica"
  | "dns-sin-respuesta"
  | "redireccion"
  | "respuesta-grande"
  | "tiempo-agotado"
  | "red";

const CODIGO_POR_MOTIVO: Readonly<Record<MotivoBloqueo, CodigoError>> = {
  "url-invalida": "direccion_invalida",
  protocolo: "direccion_invalida",
  "credenciales-en-url": "direccion_invalida",
  puerto: "direccion_invalida",
  "nombre-no-publico": "direccion_no_publica",
  "ip-no-publica": "direccion_no_publica",
  "dns-sin-respuesta": "direccion_invalida",
  redireccion: "direccion_invalida",
  "respuesta-grande": "respuesta_invalida",
  "tiempo-agotado": "proveedor_caido",
  red: "proveedor_caido",
};

/**
 * La salida no se hizo (o se cortó). El mensaje es técnico, para el operador: trae el host y
 * el motivo, nunca la ruta ni los parámetros (pueden llevar claves). El dueño ve `codigo`.
 */
export class SalidaBloqueadaError extends Error {
  readonly codigo: CodigoError;
  constructor(
    readonly motivo: MotivoBloqueo,
    detalle: string,
  ) {
    super(`Salida bloqueada (${motivo}): ${detalle}`);
    this.name = "SalidaBloqueadaError";
    this.codigo = CODIGO_POR_MOTIVO[motivo];
  }
}

// ── IPs ──────────────────────────────────────────────────────────────────────

/** IPv4 estricta: cuatro decimales 0-255 sin ceros a la izquierda. null si no es. */
export function parsearIpv4(s: string): number[] | null {
  const partes = s.split(".");
  if (partes.length !== 4) return null;
  const out: number[] = [];
  for (const p of partes) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** IPv6 → 8 grupos de 16 bits. Acepta "::" y una IPv4 al final. Sin zona. null si no es. */
export function parsearIpv6(s: string): number[] | null {
  if (!s || s.includes("%") || !s.includes(":")) return null;
  let texto = s;
  let colaV4: number[] | null = null;
  if (texto.includes(".")) {
    const corte = texto.lastIndexOf(":");
    colaV4 = parsearIpv4(texto.slice(corte + 1));
    if (!colaV4) return null;
    texto = `${texto.slice(0, corte + 1)}0:0`;
  }
  const mitades = texto.split("::");
  if (mitades.length > 2) return null;
  const grupos = (x: string) => (x === "" ? [] : x.split(":"));
  const izq = grupos(mitades[0]);
  const der = mitades.length === 2 ? grupos(mitades[1]) : [];
  const todos = [...izq, ...der];
  if (todos.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  let resultado: number[];
  if (mitades.length === 1) {
    if (izq.length !== 8) return null;
    resultado = izq.map((g) => parseInt(g, 16));
  } else {
    if (todos.length > 7) return null;
    const ceros = new Array<number>(8 - todos.length).fill(0);
    resultado = [...izq.map((g) => parseInt(g, 16)), ...ceros, ...der.map((g) => parseInt(g, 16))];
  }
  if (colaV4) {
    resultado[6] = colaV4[0] * 256 + colaV4[1];
    resultado[7] = colaV4[2] * 256 + colaV4[3];
  }
  return resultado;
}

export type ClasificacionIp = { publica: true; familia: 4 | 6 } | { publica: false; motivo: string };

const RANGOS_V4_NO_PUBLICOS: ReadonlyArray<readonly [number, number, number, number, number, string]> = [
  [0, 0, 0, 0, 8, "red 0 (no enrutable)"],
  [10, 0, 0, 0, 8, "privada"],
  [100, 64, 0, 0, 10, "CGNAT"],
  [127, 0, 0, 0, 8, "loopback"],
  [169, 254, 0, 0, 16, "link-local (metadatos de la nube)"],
  [172, 16, 0, 0, 12, "privada"],
  [192, 0, 0, 0, 24, "reservada"],
  [192, 0, 2, 0, 24, "de documentación"],
  [192, 88, 99, 0, 24, "relay 6to4"],
  [192, 168, 0, 0, 16, "privada"],
  [198, 18, 0, 0, 15, "de pruebas de red"],
  [198, 51, 100, 0, 24, "de documentación"],
  [203, 0, 113, 0, 24, "de documentación"],
  [224, 0, 0, 0, 4, "multicast"],
  [240, 0, 0, 0, 4, "reservada"],
];

const aEntero = (o: readonly number[]) => ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];

function clasificarV4(o: readonly number[]): ClasificacionIp {
  const n = aEntero(o);
  for (const [a, b, c, d, bits, motivo] of RANGOS_V4_NO_PUBLICOS) {
    const divisor = 2 ** (32 - bits);
    if (Math.floor(n / divisor) === Math.floor(aEntero([a, b, c, d]) / divisor)) {
      return { publica: false, motivo: `IPv4 ${motivo}` };
    }
  }
  return { publica: true, familia: 4 };
}

function clasificarV6(g: readonly number[]): ClasificacionIp {
  const cerosHasta = (i: number) => g.slice(0, i).every((x) => x === 0);
  if (cerosHasta(8)) return { publica: false, motivo: "IPv6 no especificada (::)" };
  if (cerosHasta(7) && g[7] === 1) return { publica: false, motivo: "IPv6 loopback (::1)" };
  if (cerosHasta(5) && g[5] === 0xffff) {
    const v4 = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
    const interna = clasificarV4(v4);
    return {
      publica: false,
      motivo: `IPv4 mapeada en IPv6 (${v4.join(".")}${interna.publica ? "" : `, ${interna.motivo}`})`,
    };
  }
  if (cerosHasta(6)) return { publica: false, motivo: "IPv4 compatible en IPv6 (obsoleta)" };
  if (g[0] === 0x64 && g[1] === 0xff9b) return { publica: false, motivo: "IPv6 NAT64 (lleva una IPv4 adentro)" };
  if ((g[0] & 0xe000) !== 0x2000) {
    if ((g[0] & 0xfe00) === 0xfc00) return { publica: false, motivo: "IPv6 privada (fc00::/7)" };
    if ((g[0] & 0xffc0) === 0xfe80) return { publica: false, motivo: "IPv6 link-local (fe80::/10)" };
    if ((g[0] & 0xffc0) === 0xfec0) return { publica: false, motivo: "IPv6 site-local (fec0::/10)" };
    if ((g[0] & 0xff00) === 0xff00) return { publica: false, motivo: "IPv6 multicast" };
    return { publica: false, motivo: "IPv6 fuera de unicast global" };
  }
  if (g[0] === 0x2001 && g[1] < 0x0200) return { publica: false, motivo: "IPv6 reservada (2001::/23, Teredo)" };
  if (g[0] === 0x2001 && g[1] === 0x0db8) return { publica: false, motivo: "IPv6 de documentación" };
  if (g[0] === 0x2002) return { publica: false, motivo: "IPv6 6to4 (lleva una IPv4 adentro)" };
  if (g[0] === 0x3fff && g[1] < 0x1000) return { publica: false, motivo: "IPv6 de documentación" };
  return { publica: true, familia: 6 };
}

/** ¿Se puede salir a esta IP? Lo que no se puede parsear como IP no es público. */
export function clasificarIp(ip: string): ClasificacionIp {
  const v4 = parsearIpv4(ip);
  if (v4) return clasificarV4(v4);
  const v6 = parsearIpv6(ip);
  if (v6) return clasificarV6(v6);
  return { publica: false, motivo: "no es una IP válida" };
}

// ── Excepciones de prueba ────────────────────────────────────────────────────

/** Sólo para tests y laboratorio. Se pasan por parámetro; en producción se rechazan. */
export interface ExcepcionesDePrueba {
  permitirHttp?: boolean;
  /** IPs exactas que se dejan pasar aunque no sean públicas (p.ej. "127.0.0.1"). */
  ips?: readonly string[];
  /** Puertos que se dejan pasar además de 443/8443. */
  puertos?: readonly number[];
}

export const PUERTOS_PERMITIDOS: readonly number[] = [443, 8443];

function exigirSinExcepcionesEnProduccion(exc: ExcepcionesDePrueba | undefined): void {
  if (!exc) return;
  const hay = exc.permitirHttp === true || (exc.ips?.length ?? 0) > 0 || (exc.puertos?.length ?? 0) > 0;
  if (hay && process.env.NODE_ENV === "production") {
    throw new Error("Las excepciones de prueba de la guardia SSRF no se aceptan con NODE_ENV=production.");
  }
}

function clasificarConExcepciones(ip: string, exc: ExcepcionesDePrueba | undefined): ClasificacionIp {
  const c = clasificarIp(ip);
  if (c.publica) return c;
  if (exc?.ips?.includes(ip)) {
    return { publica: true, familia: parsearIpv4(ip) ? 4 : 6 };
  }
  return c;
}

// ── URL ──────────────────────────────────────────────────────────────────────

const LARGO_MAXIMO_URL = 2048;
const SUFIJOS_NO_PUBLICOS = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan"];

export interface DestinoValidado {
  url: URL;
  /** Host sin corchetes (IPv6) y en minúsculas. */
  host: string;
  puerto: number;
  /** La IP si la URL trae una IP en vez de un nombre. */
  ipLiteral: string | null;
}

/** Valida la URL sin tocar la red. Lanza `SalidaBloqueadaError`. */
export function validarUrlSaliente(texto: string, excepciones?: ExcepcionesDePrueba): DestinoValidado {
  exigirSinExcepcionesEnProduccion(excepciones);
  if (typeof texto !== "string" || texto.length === 0 || texto.length > LARGO_MAXIMO_URL) {
    throw new SalidaBloqueadaError("url-invalida", "URL vacía o demasiado larga");
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new SalidaBloqueadaError("url-invalida", "no es una URL");
  }
  const esHttp = url.protocol === "http:";
  if (url.protocol !== "https:" && !(esHttp && excepciones?.permitirHttp === true)) {
    throw new SalidaBloqueadaError("protocolo", `protocolo ${url.protocol} (sólo https)`);
  }
  if (url.username || url.password) {
    throw new SalidaBloqueadaError("credenciales-en-url", "la URL trae usuario o clave");
  }
  const puerto = url.port ? Number(url.port) : esHttp ? 80 : 443;
  const permitidos = [...PUERTOS_PERMITIDOS, ...(excepciones?.puertos ?? [])];
  if (!permitidos.includes(puerto)) {
    throw new SalidaBloqueadaError("puerto", `puerto ${puerto}`);
  }

  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) throw new SalidaBloqueadaError("url-invalida", "sin host");

  const esIp = parsearIpv4(host) !== null || parsearIpv6(host) !== null;
  if (esIp) {
    const c = clasificarConExcepciones(host, excepciones);
    if (!c.publica) throw new SalidaBloqueadaError("ip-no-publica", `${host}: ${c.motivo}`);
    return { url, host, puerto, ipLiteral: host };
  }
  if (host.includes(":")) throw new SalidaBloqueadaError("url-invalida", "host con ':' que no es IPv6");

  const nombre = host.endsWith(".") ? host.slice(0, -1) : host;
  if (!nombre.includes(".")) {
    throw new SalidaBloqueadaError("nombre-no-publico", `${nombre}: nombre sin dominio`);
  }
  if (nombre === "localhost" || SUFIJOS_NO_PUBLICOS.some((s) => nombre.endsWith(s))) {
    throw new SalidaBloqueadaError("nombre-no-publico", `${nombre}: dominio de uso interno`);
  }
  return { url, host, puerto, ipLiteral: null };
}

// ── DNS ──────────────────────────────────────────────────────────────────────

export interface DireccionResuelta {
  address: string;
  family: number;
}

/** Resuelve un nombre a TODAS sus direcciones. Inyectable para tests. */
export type Resolvedor = (host: string) => Promise<readonly DireccionResuelta[]>;

export const resolvedorDelSistema: Resolvedor = async (host) => {
  try {
    return await dnsPromises.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    const codigo = (e as { code?: unknown })?.code;
    if (codigo === "ENOTFOUND" || codigo === "ENODATA") {
      throw new SalidaBloqueadaError("dns-sin-respuesta", `${host}: el nombre no existe`);
    }
    throw new SalidaBloqueadaError("red", `${host}: falló la resolución de nombres`);
  }
};

export interface DestinoFijado extends DestinoValidado {
  /** La IP validada a la que se va a conectar. */
  ip: string;
  familia: 4 | 6;
}

/**
 * Resuelve y valida TODAS las direcciones; devuelve la primera para fijarla. Si alguna no es
 * pública, rechaza entero.
 */
export async function resolverDestino(
  destino: DestinoValidado,
  opciones: { resolver?: Resolvedor; excepciones?: ExcepcionesDePrueba } = {},
): Promise<DestinoFijado> {
  exigirSinExcepcionesEnProduccion(opciones.excepciones);
  if (destino.ipLiteral) {
    const c = clasificarConExcepciones(destino.ipLiteral, opciones.excepciones);
    if (!c.publica) throw new SalidaBloqueadaError("ip-no-publica", `${destino.ipLiteral}: ${c.motivo}`);
    return { ...destino, ip: destino.ipLiteral, familia: c.familia };
  }
  const resolver = opciones.resolver ?? resolvedorDelSistema;
  let direcciones: readonly DireccionResuelta[];
  try {
    direcciones = await resolver(destino.host);
  } catch (e) {
    if (e instanceof SalidaBloqueadaError) throw e;
    throw new SalidaBloqueadaError("red", `${destino.host}: falló la resolución de nombres`);
  }
  if (!Array.isArray(direcciones) || direcciones.length === 0) {
    throw new SalidaBloqueadaError("dns-sin-respuesta", `${destino.host}: sin direcciones`);
  }
  let primera: { ip: string; familia: 4 | 6 } | null = null;
  for (const d of direcciones) {
    const ip = typeof d?.address === "string" ? d.address : "";
    const c = clasificarConExcepciones(ip, opciones.excepciones);
    if (!c.publica) {
      throw new SalidaBloqueadaError("ip-no-publica", `${destino.host} resuelve a ${ip || "(vacío)"}: ${c.motivo}`);
    }
    if (!primera) primera = { ip, familia: c.familia };
  }
  // `primera` no puede ser null acá (la lista no está vacía y todas pasaron).
  return { ...destino, ip: primera!.ip, familia: primera!.familia };
}

/**
 * El `lookup` que se le pasa a node:http(s): devuelve SIEMPRE la IP ya validada, sin volver
 * a consultar el DNS. Soporta las dos formas en que Node lo llama (una dirección o `all`).
 */
export function crearLookupFijado(ip: string, familia: 4 | 6): LookupFunction {
  return (_host, opciones, callback) => {
    const todas = typeof opciones === "object" && opciones !== null && (opciones as { all?: boolean }).all === true;
    if (todas) {
      (callback as unknown as (e: null, dirs: Array<{ address: string; family: number }>) => void)(null, [
        { address: ip, family: familia },
      ]);
    } else {
      callback(null, ip, familia);
    }
  };
}

// ── La salida ────────────────────────────────────────────────────────────────

export const PLAZO_POR_DEFECTO_MS = 5_000;
export const TOPE_POR_DEFECTO_BYTES = 64 * 1024;
const PLAZO_MAXIMO_MS = 30_000;
const TOPE_MAXIMO_BYTES = 16 * 1024 * 1024;

export interface OpcionesSalida {
  /** Plazo total, DNS incluido. Por defecto 5 s; máximo 30 s. */
  plazoMs?: number;
  /** Tope de la respuesta. Por defecto 64 KB; máximo 16 MB (bajada de un extracto). */
  topeBytes?: number;
  resolver?: Resolvedor;
  excepciones?: ExcepcionesDePrueba;
}

const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
/** Encabezados que no puede fijar quien llama: los arma la guardia. */
const ENCABEZADOS_RESERVADOS = new Set(["host", "content-length", "transfer-encoding", "connection", "accept-encoding"]);

function acotar(n: number | undefined, porDefecto: number, maximo: number): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.floor(n), maximo);
}

function aplanarEncabezados(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

function conPlazo<T>(p: Promise<T>, venceEn: number, host: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new SalidaBloqueadaError("tiempo-agotado", `${host}: se agotó el plazo`)),
      Math.max(0, venceEn - Date.now()),
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function conectarFijado(
  destino: DestinoFijado,
  solicitud: SolicitudHttp,
  venceEn: number,
  tope: number,
): Promise<RespuestaHttp> {
  return new Promise<RespuestaHttp>((resolve, reject) => {
    let terminado = false;
    const esHttps = destino.url.protocol === "https:";
    const encabezados: Record<string, string> = {};
    for (const [k, v] of Object.entries(solicitud.encabezados ?? {})) {
      if (!ENCABEZADOS_RESERVADOS.has(k.toLowerCase())) encabezados[k] = v;
    }
    const cuerpo =
      solicitud.cuerpo === undefined
        ? null
        : typeof solicitud.cuerpo === "string"
          ? Buffer.from(solicitud.cuerpo, "utf8")
          : Buffer.from(solicitud.cuerpo);
    if (cuerpo) encabezados["content-length"] = String(cuerpo.length);
    encabezados.connection = "close";

    const opciones: https.RequestOptions = {
      protocol: destino.url.protocol,
      hostname: destino.ipLiteral ?? destino.host,
      port: destino.puerto,
      path: `${destino.url.pathname}${destino.url.search}`,
      method: solicitud.metodo,
      headers: encabezados,
      agent: false,
      lookup: crearLookupFijado(destino.ip, destino.familia),
      ...(esHttps && !destino.ipLiteral ? { servername: destino.host } : {}),
    };

    const req = (esHttps ? https : http).request(opciones);
    // `fallar` sólo corre desde callbacks (asincrónicos): para entonces `timer` ya existe.
    const fallar = (e: SalidaBloqueadaError) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      req.destroy();
      reject(e);
    };
    const timer = setTimeout(
      () => fallar(new SalidaBloqueadaError("tiempo-agotado", `${destino.host}: se agotó el plazo`)),
      Math.max(0, venceEn - Date.now()),
    );

    req.on("response", (res) => {
      const estado = res.statusCode ?? 0;
      if (estado >= 300 && estado <= 399) {
        res.resume();
        fallar(new SalidaBloqueadaError("redireccion", `${destino.host} respondió ${estado}; no se siguen redirecciones`));
        return;
      }
      const declarado = Number(res.headers["content-length"]);
      if (Number.isFinite(declarado) && declarado > tope) {
        res.resume();
        fallar(new SalidaBloqueadaError("respuesta-grande", `${destino.host}: ${declarado} bytes (tope ${tope})`));
        return;
      }
      const partes: Buffer[] = [];
      let total = 0;
      res.on("data", (trozo: Buffer) => {
        if (terminado) return;
        total += trozo.length;
        if (total > tope) {
          fallar(new SalidaBloqueadaError("respuesta-grande", `${destino.host}: más de ${tope} bytes`));
          return;
        }
        partes.push(trozo);
      });
      res.on("end", () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timer);
        resolve({ estado, encabezados: aplanarEncabezados(res.headers), cuerpo: new Uint8Array(Buffer.concat(partes)) });
      });
      res.on("error", () => fallar(new SalidaBloqueadaError("red", `${destino.host}: se cortó la respuesta`)));
      // Después de "end" no hace nada (terminado); si se cierra antes, es un corte.
      res.on("close", () => fallar(new SalidaBloqueadaError("red", `${destino.host}: se cortó la respuesta`)));
    });
    req.on("error", (e) => {
      fallar(e instanceof SalidaBloqueadaError ? e : new SalidaBloqueadaError("red", `${destino.host}: no se pudo conectar`));
    });

    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

/**
 * Hace UNA llamada saliente con todas las guardias. Lanza `SalidaBloqueadaError` (con su
 * `codigo` del catálogo) si la dirección no pasa, si se agota el plazo, si la respuesta es
 * más grande que el tope o si es una redirección.
 */
export async function pedirSeguro(
  url: string,
  solicitud: SolicitudHttp,
  opciones: OpcionesSalida = {},
): Promise<RespuestaHttp> {
  exigirSinExcepcionesEnProduccion(opciones.excepciones);
  if (!solicitud || !METODOS.has(solicitud.metodo)) throw new Error(`Método no permitido: ${String(solicitud?.metodo)}`);
  const plazo = acotar(opciones.plazoMs, PLAZO_POR_DEFECTO_MS, PLAZO_MAXIMO_MS);
  const tope = acotar(opciones.topeBytes, TOPE_POR_DEFECTO_BYTES, TOPE_MAXIMO_BYTES);
  const venceEn = Date.now() + plazo;
  const destino = validarUrlSaliente(url, opciones.excepciones);
  const fijado = await conPlazo(
    resolverDestino(destino, { resolver: opciones.resolver, excepciones: opciones.excepciones }),
    venceEn,
    destino.host,
  );
  return conectarFijado(fijado, solicitud, venceEn, tope);
}

/** El transporte de producción de los conectores: `pedirSeguro` con opciones fijas. */
export function transporteSeguro(opciones: OpcionesSalida = {}): TransporteHttp {
  return (url, solicitud) => pedirSeguro(url, solicitud, opciones);
}
