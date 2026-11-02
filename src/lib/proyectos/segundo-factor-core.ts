// VERIFICACIÓN EN DOS PASOS del panel de una productora: código de 6 dígitos de una app (TOTP, RFC 6238), códigos de
// respaldo y el pase de 10 minutos entre la clave y el código. Puro: sin base, sin cookies y sin pedido.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SEGUNDOS_POR_PASO = 30;

/** Quien ve plata no entra sólo con la clave. Provisional hasta confirmarlo con MIA. */
export const ROLES_CON_SEGUNDO_PASO: readonly string[] = ["DIRECCION", "ADMINISTRACION"];
export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 15 * 60_000;
export const VIGENCIA_PASE_MS = 10 * 60_000;

export function aBase32(datos: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
    valor &= (1 << bits) - 1;
  }
  if (bits > 0) salida += BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

export function deBase32(texto: string): Buffer {
  let bits = 0;
  let valor = 0;
  const salida: number[] = [];
  for (const letra of texto.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    valor = (valor << 5) | BASE32.indexOf(letra);
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
    valor &= (1 << bits) - 1;
  }
  return Buffer.from(salida);
}

export function codigoDelPaso(secreto: Buffer, paso: number, digitos = 6): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const firma = createHmac("sha1", secreto).update(contador).digest();
  const corte = firma[firma.length - 1] & 15;
  const numero = firma.readUInt32BE(corte) & 0x7fffffff;
  return String(numero % 10 ** digitos).padStart(digitos, "0");
}

export const pasoDe = (ahoraMs: number): number => Math.floor(ahoraMs / 1000 / SEGUNDOS_POR_PASO);

const iguales = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Devuelve el paso usado, o null si el código no sirve. Tolera un paso de diferencia con el reloj del teléfono, y nunca
 * acepta un paso igual o anterior al último usado: un código visto por alguien no se puede volver a usar.
 */
export function verificarCodigo(secreto: Buffer, codigo: string, ahoraMs: number, ultimoPaso: number | null): number | null {
  const limpio = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpio)) return null;
  const actual = pasoDe(ahoraMs);
  for (const paso of [actual - 1, actual, actual + 1]) {
    if (ultimoPaso !== null && paso <= ultimoPaso) continue;
    if (iguales(codigoDelPaso(secreto, paso), limpio)) return paso;
  }
  return null;
}

export function direccionParaLaApp(d: { emisor: string; cuenta: string; secreto: Buffer }): string {
  const emisor = encodeURIComponent(d.emisor);
  return `otpauth://totp/${emisor}:${encodeURIComponent(d.cuenta)}?secret=${aBase32(d.secreto)}&issuer=${emisor}&algorithm=SHA1&digits=6&period=${SEGUNDOS_POR_PASO}`;
}

const normalizarRespaldo = (codigo: string): string => codigo.toUpperCase().replace(/[^A-Z2-7]/g, "");

export const hashDeRespaldo = (codigo: string): string => createHash("sha256").update(normalizarRespaldo(codigo)).digest("hex");

/** Diez códigos de un solo uso. Sólo se guarda su hash: se muestran una vez. */
export function nuevosCodigosDeRespaldo(): { visibles: string[]; hashes: string[] } {
  const visibles = Array.from({ length: 10 }, () => {
    const c = aBase32(randomBytes(10)).slice(0, 16);
    return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12)}`;
  });
  return { visibles, hashes: visibles.map(hashDeRespaldo) };
}

export function cifrarSecreto(secreto: Buffer, clave: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave, iv);
  const cuerpo = Buffer.concat([c.update(secreto), c.final()]);
  return [iv, c.getAuthTag(), cuerpo].map((b) => b.toString("base64url")).join(".");
}

export function descifrarSecreto(guardado: string, clave: Buffer): Buffer {
  const [iv, tag, cuerpo] = guardado.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", clave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(cuerpo), d.final()]);
}

const firmar = (texto: string, clave: Buffer): string => createHmac("sha256", clave).update(texto).digest("hex");

/** El pase NO es una sesión: se firma con otra clave, así que el portón del panel lo rechaza. */
export const crearPase = (userId: string, ahoraMs: number, clave: Buffer): string => {
  const cuerpo = `${userId}.${ahoraMs + VIGENCIA_PASE_MS}`;
  return `${cuerpo}.${firmar(cuerpo, clave)}`;
};

export function leerPase(pase: string | undefined | null, ahoraMs: number, clave: Buffer): string | null {
  const [userId, vence, firma, ...resto] = (pase ?? "").split(".");
  if (!userId || !vence || !firma || resto.length > 0) return null;
  if (!iguales(firma, firmar(`${userId}.${vence}`, clave))) return null;
  return Number(vence) > ahoraMs ? userId : null;
}
