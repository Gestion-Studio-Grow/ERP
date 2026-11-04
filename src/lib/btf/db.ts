// Acceso a datos de buscatufoto. Sus tablas NO son de un negocio (sin tenantId, en MODELOS_SIN_TENANT):
// se usa `basePrisma` a propósito. `prisma` de `@/lib/db` con RLS_ENFORCEMENT=on resuelve el negocio por
// el host ANTES de cada operación (src/lib/rls.ts) y en el host de buscatufoto no hay negocio: tiraría.
// El aislamiento acá es por `fotografoId`, validado en cada ruta (src/app/api/btf/).

import { basePrisma } from "@/lib/prisma-base";
import { configS3, problemaS3 } from "./s3";
import { ErrorBtf } from "./http";

export const btfDb = basePrisma;

function secretoListo(env: Record<string, string | undefined>): boolean {
  return (env.BTF_SECRET?.trim().length ?? 0) >= 16;
}

/** ¿Hay entorno (S3 + secreto)? No toca la base. */
export function entornoListo(env: Record<string, string | undefined> = process.env): boolean {
  return configS3(env) !== null && secretoListo(env);
}

/** 503 si falta el entorno. Las tablas ausentes (P2021) las traduce `manejar` a 503. */
export function exigirServidor(): void {
  if (entornoListo()) return;
  const s3 = problemaS3();
  // El motivo va al log del servidor (nombres de variables, nunca valores); al público, el mensaje genérico.
  if (s3) console.error(`[btf] almacén sin configurar: ${s3}`);
  throw new ErrorBtf("no-configurado", "buscatufoto todavía no está configurado en este servidor.");
}

function esTablaAusente(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2021";
}

/** Estado público: sin tablas (P2021) o sin entorno → `configurado: false`. */
export async function estaConfigurado(env: Record<string, string | undefined> = process.env): Promise<{ configurado: boolean; mp: boolean }> {
  if (!entornoListo(env)) return { configurado: false, mp: false };
  try {
    await btfDb.btfFotografo.findFirst({ select: { id: true } });
  } catch (e) {
    if (esTablaAusente(e)) return { configurado: false, mp: false };
    throw e;
  }
  return { configurado: true, mp: Boolean(env.FISCAL_MASTER_KEY?.trim()) };
}
