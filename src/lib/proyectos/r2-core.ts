// ARCHIVOS EN CLOUDFLARE R2 — firma de links con vencimiento (AWS Signature V4, la que R2 acepta) y reglas de lo que se puede subir.
// Sin dependencias ni acceso a red: lo que habla con R2 está en r2.server.ts.

import { createHash, createHmac } from "node:crypto";

export interface ConfigR2 {
  endpoint: string; // https://<cuenta>.r2.cloudflarestorage.com
  bucket: string;
  accessKey: string;
  secret: string;
  region: string; // R2 usa "auto"
}

export const TOPE_ARCHIVO = 200 * 1024 * 1024;
export const MINUTOS_SUBIDA = 15;
export const MINUTOS_BAJADA = 5;

// Lo que se ejecuta al abrirlo no entra: el archivo después lo baja otra persona del equipo o del cliente.
const PROHIBIDAS = new Set(["exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar", "hta", "html", "htm", "svg", "lnk", "reg"]);

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

const extension = (nombre: string): string => /\.([a-z0-9]{1,8})$/i.exec(nombre.trim())?.[1].toLowerCase() ?? "";

export function archivoAdmitido(nombre: string, tamano: number): string | null {
  if (!(tamano > 0)) return "El archivo está vacío.";
  if (tamano > TOPE_ARCHIVO) return "El archivo pesa más de 200 MB. Pegá el link de tu nube.";
  if (PROHIBIDAS.has(extension(nombre))) return "Ese tipo de archivo no se puede subir, porque se ejecuta al abrirlo. Mandalo comprimido en un .zip.";
  return null;
}

/** El tipo sale de la extensión, nunca de lo que diga el navegador. Sólo lo que el navegador muestra sin ejecutar se abre: el resto se baja. */
export function comoSeEntrega(nombre: string): { tipo: string; disposicion: "inline" | "attachment" } {
  const tipo = TIPOS[extension(nombre)];
  return tipo ? { tipo, disposicion: "inline" } : { tipo: "application/octet-stream", disposicion: "attachment" };
}

export function cabeceraDeArchivo(nombre: string, disposicion: "inline" | "attachment"): string {
  const ascii = nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "archivo";
  return `${disposicion}; filename="${ascii}"; filename*=UTF-8''${codificar(nombre)}`;
}

/** La carpeta de cada proyecto, con su negocio adelante. */
const carpetaDelProyecto = (tenantId: string, proyectoId: string): string => `proyectos/${tenantId}/${proyectoId}/`;

/** Confirmar una subida sólo acepta archivos directos de esa carpeta: nada de otro negocio ni de otro proyecto. */
export function claveEsDelProyecto(clave: string, tenantId: string, proyectoId: string): boolean {
  const carpeta = carpetaDelProyecto(tenantId, proyectoId);
  const resto = clave.startsWith(carpeta) ? clave.slice(carpeta.length) : "";
  return resto !== "" && !resto.includes("/");
}

export function claveDeArchivo(tenantId: string, proyectoId: string, aleatorio: string, nombre: string): string {
  const limpio = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "archivo";
  return `${carpetaDelProyecto(tenantId, proyectoId)}${aleatorio}-${limpio}`;
}

const codificar = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (clave: string | Buffer, texto: string): Buffer => createHmac("sha256", clave).update(texto, "utf8").digest();

/** Un link firmado: quien lo tiene puede hacer ESA operación sobre ESE archivo hasta que venza, sin clave. PURA. */
export function urlFirmada(c: ConfigR2, d: { metodo: "GET" | "PUT" | "HEAD" | "DELETE"; clave: string; ahora: Date; segundos: number; consulta?: Readonly<Record<string, string>> }): string {
  const base = new URL(c.endpoint);
  const ruta = `${base.pathname.replace(/\/$/, "")}${c.bucket ? `/${c.bucket}` : ""}/${d.clave}`.split("/").map(codificar).join("/");
  const fecha = d.ahora.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const dia = fecha.slice(0, 8);
  const alcance = `${dia}/${c.region}/s3/aws4_request`;
  const parametros: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.accessKey}/${alcance}`,
    "X-Amz-Date": fecha,
    "X-Amz-Expires": String(d.segundos),
    "X-Amz-SignedHeaders": "host",
    ...d.consulta,
  };
  const consulta = Object.keys(parametros)
    .map((k) => [codificar(k), codificar(parametros[k])])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const pedido = [d.metodo, ruta, consulta, `host:${base.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const aFirmar = ["AWS4-HMAC-SHA256", fecha, alcance, createHash("sha256").update(pedido, "utf8").digest("hex")].join("\n");
  const clave = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, dia), c.region), "s3"), "aws4_request");
  return `${base.origin}${ruta}?${consulta}&X-Amz-Signature=${createHmac("sha256", clave).update(aFirmar, "utf8").digest("hex")}`;
}
