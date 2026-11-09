// Bloquear la sesión por inactividad REAL (certificación GSG-SEG-004). El vigía del panel (VigiaDeInactividad.tsx)
// llama acá cuando pasaron 15 min sin teclado, mouse ni toque, aunque los sondeos automáticos hayan renovado la
// cookie. Reemite el mismo token con la actividad vieja: desde ahí el proxy manda al PIN. Sin sesión válida no toca
// nada. Sólo POST (con SameSite=lax, otro sitio no manda la cookie). Vive bajo /admin/login/: el proxy lo deja pasar.

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookieName, tokenBloqueadoDe, VIDA_COOKIE_SESION_S } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const res = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  const nuevo = await tokenBloqueadoDe(request.cookies.get(getSessionCookieName())?.value);
  if (nuevo) {
    res.cookies.set(getSessionCookieName(), nuevo, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VIDA_COOKIE_SESION_S,
    });
  }
  return res;
}
