// Almacén de buscatufoto: S3-compatible (R2, S3, MinIO) con URLs prefirmadas SigV4 hechas a mano con
// node:crypto, sin dependencias. Estilo de ruta (`<endpoint>/<bucket>/<clave>`), que sirve para R2 y S3.
// Contrato: celula-negocios-digitales/buscatufoto/docs/API.md → «Almacén».
//
// `presignar` es PURA (recibe fecha y credenciales) y está probada contra el vector publicado por AWS
// (s3.test.ts). Las demás leen el entorno en cada llamada, nunca en top-level.

import { createHash, createHmac } from "node:crypto";

export interface Credenciales {
  key: string;
  secret: string;
  region: string;
}

export interface Prefirma {
  metodo: "GET" | "PUT" | "DELETE" | "HEAD";
  /** host sin esquema (con puerto si lo hay) */
  host: string;
  /** ruta absoluta sin codificar, ej. `/bucket/o/f1/a1/m1.jpg` */
  ruta: string;
  credenciales: Credenciales;
  fecha: Date;
  segundos: number;
  /** cabeceras extra que el cliente DEBE mandar tal cual (ej. content-type) */
  cabeceras?: Record<string, string>;
  esquema?: "https" | "http";
  /** parámetros extra de la query que entran a la firma (ej. response-content-disposition) */
  queryExtra?: Record<string, string>;
}

/** RFC 3986, como lo pide SigV4. */
function codificar(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s, "utf8").digest();

/** URL prefirmada (query string) SigV4 para S3. PURA. */
export function presignar(p: Prefirma): string {
  const iso = p.fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = iso.slice(0, 8);
  const alcance = `${dia}/${p.credenciales.region}/s3/aws4_request`;
  const cabeceras: Record<string, string> = { host: p.host };
  for (const [k, v] of Object.entries(p.cabeceras ?? {})) cabeceras[k.toLowerCase()] = v.trim();
  const nombres = Object.keys(cabeceras).sort();
  const firmadas = nombres.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${p.credenciales.key}/${alcance}`,
    "X-Amz-Date": iso,
    "X-Amz-Expires": String(p.segundos),
    "X-Amz-SignedHeaders": firmadas,
    ...(p.queryExtra ?? {}),
  };
  const queryCanonica = Object.keys(query)
    .sort()
    .map((k) => `${codificar(k)}=${codificar(query[k])}`)
    .join("&");
  const uri = p.ruta.split("/").map(codificar).join("/");
  const pedidoCanonico = [
    p.metodo,
    uri,
    queryCanonica,
    nombres.map((n) => `${n}:${cabeceras[n]}\n`).join(""),
    firmadas,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const aFirmar = ["AWS4-HMAC-SHA256", iso, alcance, sha256(pedidoCanonico)].join("\n");
  const kFecha = hmac(`AWS4${p.credenciales.secret}`, dia);
  const kFirma = hmac(hmac(hmac(kFecha, p.credenciales.region), "s3"), "aws4_request");
  const firma = createHmac("sha256", kFirma).update(aFirmar, "utf8").digest("hex");
  return `${p.esquema ?? "https"}://${p.host}${uri}?${queryCanonica}&X-Amz-Signature=${firma}`;
}

export interface ConfigS3 {
  endpoint: URL;
  credenciales: Credenciales;
  bucketOriginales: string;
  bucketPrevias: string;
  urlPublicaPrevias: string;
}

const REQUERIDAS = ["BTF_S3_ENDPOINT", "BTF_S3_KEY", "BTF_S3_SECRET", "BTF_S3_BUCKET_ORIGINALES", "BTF_S3_BUCKET_PREVIAS", "BTF_PREVIAS_URL_PUBLICA"];

/** Por qué el almacén no está listo (null si lo está). Buckets iguales = originales públicos: no se acepta. */
export function problemaS3(env: Record<string, string | undefined> = process.env): string | null {
  const v = (k: string) => env[k]?.trim() || "";
  const faltan = REQUERIDAS.filter((k) => !v(k));
  if (faltan.length) return `faltan ${faltan.join(", ")}`;
  try {
    new URL(v("BTF_S3_ENDPOINT"));
  } catch {
    return "BTF_S3_ENDPOINT no es una URL";
  }
  if (v("BTF_S3_BUCKET_ORIGINALES") === v("BTF_S3_BUCKET_PREVIAS")) {
    return "BTF_S3_BUCKET_ORIGINALES y BTF_S3_BUCKET_PREVIAS son el mismo bucket: los originales quedarían públicos";
  }
  return null;
}

/** Config del almacén desde el entorno; null si falta algo o los buckets coinciden (ver `problemaS3`). */
export function configS3(env: Record<string, string | undefined> = process.env): ConfigS3 | null {
  if (problemaS3(env)) return null;
  const v = (k: string) => env[k]?.trim() || "";
  const endpoint = new URL(v("BTF_S3_ENDPOINT"));
  return {
    endpoint,
    credenciales: { key: v("BTF_S3_KEY"), secret: v("BTF_S3_SECRET"), region: v("BTF_S3_REGION") || "auto" },
    bucketOriginales: v("BTF_S3_BUCKET_ORIGINALES"),
    bucketPrevias: v("BTF_S3_BUCKET_PREVIAS"),
    urlPublicaPrevias: v("BTF_PREVIAS_URL_PUBLICA").replace(/\/+$/, ""),
  };
}

function exigirConfig(): ConfigS3 {
  const c = configS3();
  if (!c) throw new Error(`buscatufoto: almacén S3 sin configurar (${problemaS3() ?? "BTF_S3_*"})`);
  return c;
}

function firmar(
  metodo: Prefirma["metodo"],
  bucket: string,
  clave: string,
  segundos: number,
  cabeceras?: Record<string, string>,
  queryExtra?: Record<string, string>,
): string {
  const c = exigirConfig();
  const base = c.endpoint.pathname.replace(/\/+$/, "");
  return presignar({
    metodo,
    host: c.endpoint.host,
    esquema: c.endpoint.protocol === "http:" ? "http" : "https",
    ruta: `${base}/${bucket}/${clave}`,
    credenciales: c.credenciales,
    fecha: new Date(),
    segundos,
    cabeceras,
    queryExtra,
  });
}

/** PUT prefirmado: el cliente tiene que mandar exactamente este `Content-Type`. */
export function urlFirmadaPut(bucket: string, clave: string, contentType: string, segundos: number): string {
  return firmar("PUT", bucket, clave, segundos, { "content-type": contentType });
}

export function urlFirmadaGet(bucket: string, clave: string, segundos: number): string {
  return firmar("GET", bucket, clave, segundos);
}

/**
 * GET prefirmado que fuerza la descarga con el nombre de archivo dado (`response-content-disposition`
 * va dentro de la query firmada, así el almacén lo respeta y nadie lo puede cambiar).
 */
export function urlFirmadaDescarga(bucket: string, clave: string, nombreArchivo: string, segundos: number): string {
  const limpio = nombreArchivo.replace(/[\r\n"\\]/g, "").slice(0, 150) || "foto";
  const ascii = limpio.normalize("NFD").replace(/[^\x20-\x7e]/g, "") || "foto";
  const disposicion = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpio).replace(/'/g, "%27")}`;
  return firmar("GET", bucket, clave, segundos, undefined, { "response-content-disposition": disposicion });
}

/** ¿Existe el objeto? HEAD prefirmado. true = 200; false = 404/403; tira si el almacén no responde. */
export async function existeObjeto(bucket: string, clave: string): Promise<boolean> {
  const r = await fetch(firmar("HEAD", bucket, clave, 60), { method: "HEAD" });
  if (r.ok) return true;
  if (r.status === 404 || r.status === 403) return false;
  throw new Error(`buscatufoto: el almacén respondió ${r.status} al HEAD`);
}

/** Borra un objeto. Best effort: devuelve false si falló, nunca tira. */
export async function borrarObjeto(bucket: string, clave: string): Promise<boolean> {
  try {
    const r = await fetch(firmar("DELETE", bucket, clave, 60), { method: "DELETE" });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}
