// «Ver todo» / «Corregir en modo completo» / «Volver al modo simple» (src/lib/modo-simple.ts).
// Sólo prende o apaga una cookie de SESIÓN que esconde o muestra pantallas: no guarda nada en la base
// ni da permisos (cada pantalla sigue con su guarda). Vuelve a una ruta del panel (`destinoSeguro`).

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_VER_TODO, destinoSeguro } from "@/lib/modo-simple";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const destino = destinoSeguro(request.nextUrl.searchParams.get("volver"));
  const res = NextResponse.redirect(new URL(destino, request.nextUrl.origin), 303);
  if (request.nextUrl.searchParams.get("simple") === "1") {
    res.cookies.delete(COOKIE_VER_TODO);
  } else {
    // Sin `maxAge`/`expires`: dura lo que la sesión del navegador.
    res.cookies.set(COOKIE_VER_TODO, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  }
  return res;
}
