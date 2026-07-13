// Hashing de contraseñas de usuario (ADR-017 §2.d). scrypt de la stdlib —
// memory-hard, cero dependencias, suficiente para un panel de staff. Reemplazable
// sin tocar el resto (el formato queda encapsulado acá).
//
// RUNTIME NODE: usa node:crypto. Solo se importa desde Server Actions / scripts
// (login, seed), nunca desde el edge (el proxy solo verifica firmas, no hashea).
// Formato almacenado: `scrypt$<saltHex>$<hashHex>`.

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

// Contraseña temporal fuerte y legible (base64url ~ 24 chars de 18 bytes = 144 bits de
// entropía). FUENTE ÚNICA — la reusan tanto el alta de tenant (bootstrap del OWNER,
// `provisionTenant`) como el reset de contraseña del operador. NUNCA se persiste en claro:
// se hashea con `hashPassword` y se muestra UNA vez al operador (revelado único). Al ser
// aleatoria de alta entropía, satisface `validatePasswordStrength` por construcción.
export function generateStrongPassword(): string {
  return randomBytes(18).toString("base64url");
}
