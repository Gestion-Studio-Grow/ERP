// Ir a Google. Sólo en una productora y con el servicio configurado (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_GOOGLE, direccionDeGoogle, nextSeguro, nuevoEstadoGoogle } from "@/lib/proyectos/google-ingreso-core";
import { esProductora } from "@/lib/proyectos/segundo-factor.server";
import { getCurrentTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clienteId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clienteId || !process.env.GOOGLE_CLIENT_SECRET || !(await esProductora(await getCurrentTenantId()))) {
    return new NextResponse("No encontrado", { status: 404 });
  }
  const estado = nuevoEstadoGoogle(nextSeguro(request.nextUrl.searchParams.get("next")));
  (await cookies()).set(COOKIE_GOOGLE, JSON.stringify(estado), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin/login/google", maxAge: 600 });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocolo = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  redirect(direccionDeGoogle({ clienteId, vuelta: `${protocolo}://${host}/admin/login/google/vuelta`, estado }));
}
