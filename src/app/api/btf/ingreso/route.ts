// POST /api/btf/ingreso → Fotografo + cookie · DELETE → borra la cookie.
import { hashPassword, verifyPassword } from "@/lib/auth-password";
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, leerCuerpo, manejar } from "@/lib/btf/http";
import { fotografoRed } from "@/lib/btf/mapeo";
import { cookieBorrada, cookieDeSesion } from "@/lib/btf/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let hashFicticio: Promise<string> | null = null;

export function POST(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const c = await leerCuerpo(request);
    const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
    const contrasena = typeof c.contrasena === "string" ? c.contrasena.slice(0, 200) : "";
    const f = email ? await btfDb.btfFotografo.findUnique({ where: { email } }) : null;
    // Sin cuenta se verifica igual contra un hash ficticio: mismo tiempo, no revela qué emails existen.
    hashFicticio ??= hashPassword("buscatufoto-sin-cuenta");
    const ok = await verifyPassword(contrasena, f?.contrasena ?? (await hashFicticio));
    if (!f || !ok) throw new ErrorBtf("no-autenticado", "Email o contraseña incorrectos.");
    return json(fotografoRed(f), 200, { "set-cookie": cookieDeSesion(request, f.id) });
  });
}

export function DELETE(request: Request) {
  return manejar(async () => json({ ok: true }, 200, { "set-cookie": cookieBorrada(request) }));
}
