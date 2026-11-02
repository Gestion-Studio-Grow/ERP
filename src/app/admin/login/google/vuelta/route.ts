// Vuelta de Google. Google sólo reemplaza a la clave: si la cuenta exige el segundo paso, también lo pide.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { abrirSesion, destinoTrasIngreso } from "@/lib/ingreso.server";
import { prisma } from "@/lib/prisma";
import { COOKIE_GOOGLE, mailDelToken, type EstadoGoogle } from "@/lib/proyectos/google-ingreso-core";
import { darPase, esProductora, exigeSegundoPaso } from "@/lib/proyectos/segundo-factor.server";
import { getCurrentTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLO = "/admin/login?error=google";

async function canjearCodigo(codigo: string, vuelta: string, verificador: string, clienteId: string, secreto: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: codigo, client_id: clienteId, client_secret: secreto, redirect_uri: vuelta, grant_type: "authorization_code", code_verifier: verificador }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { id_token?: string }).id_token ?? null;
}

export async function GET(request: NextRequest) {
  const clienteId = process.env.GOOGLE_CLIENT_ID?.trim();
  const secreto = process.env.GOOGLE_CLIENT_SECRET;
  const tenantId = await getCurrentTenantId();
  if (!clienteId || !secreto || !(await esProductora(tenantId))) return new NextResponse("No encontrado", { status: 404 });

  const almacen = await cookies();
  const crudo = almacen.get(COOKIE_GOOGLE)?.value;
  almacen.set(COOKIE_GOOGLE, "", { path: "/admin/login/google", maxAge: 0 });
  let estado: EstadoGoogle | null = null;
  try {
    estado = crudo ? (JSON.parse(crudo) as EstadoGoogle) : null;
  } catch {
    estado = null;
  }
  const q = request.nextUrl.searchParams;
  const codigo = q.get("code");
  if (!estado || !codigo || q.get("state") !== estado.estado) redirect(FALLO);

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocolo = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const idToken = await canjearCodigo(codigo, `${protocolo}://${host}/admin/login/google/vuelta`, estado.verificador, clienteId, secreto).catch(() => null);
  const email = idToken ? mailDelToken(idToken, { clienteId, nonce: estado.nonce, ahoraMs: Date.now() }) : null;
  if (!email) redirect(FALLO);

  const user = await prisma.user.findFirst({ where: { tenantId, email, active: true, deletedAt: null }, select: { id: true, tenantId: true, email: true, role: true } });
  if (!user) redirect(FALLO);

  if (await exigeSegundoPaso(user)) {
    await darPase(user.id);
    redirect(`/admin/login/segundo-paso?next=${encodeURIComponent(estado.next)}`);
  }
  await abrirSesion(user.id);
  redirect(await destinoTrasIngreso(user, estado.next));
}
