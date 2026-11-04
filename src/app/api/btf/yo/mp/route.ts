// PUT /api/btf/yo/mp { accessToken } → se guarda cifrado (sealSecret) → { mpConfigurado: true }
// DELETE → lo borra. El token JAMÁS se devuelve ni se loguea (ni en errores).
import { masterKeyDesdeEnv, sealSecret, type MasterKey } from "@/lib/fiscal/cert-crypto";
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, leerCuerpo, manejar } from "@/lib/btf/http";
import { exigirFotografo } from "@/lib/btf/sesion";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function llave(): MasterKey {
  try {
    return masterKeyDesdeEnv();
  } catch {
    throw new ErrorBtf("no-configurado", "El cobro con Mercado Pago todavía no está habilitado en este servidor.");
  }
}

export function PUT(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const id = exigirFotografo(request);
    const c = await leerCuerpo(request);
    const token = typeof c.accessToken === "string" ? c.accessToken.trim() : "";
    if (!/^(APP_USR|TEST)-[A-Za-z0-9_-]{10,300}$/.test(token)) {
      throw new ErrorBtf("invalido", "Ese no parece un Access Token de Mercado Pago (empieza con APP_USR-).");
    }
    const sobre = sealSecret(token, llave());
    await btfDb.btfFotografo.update({ where: { id }, data: { mpCredencial: sobre as unknown as Prisma.InputJsonValue } });
    return json({ mpConfigurado: true });
  });
}

export function DELETE(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const id = exigirFotografo(request);
    await btfDb.btfFotografo.update({ where: { id }, data: { mpCredencial: Prisma.DbNull } });
    return json({ mpConfigurado: false });
  });
}
