import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Portón grueso (ADR-017 §2.e): solo verifica que la cookie tenga una firma
  // válida. El chequeo de rol por acción vive en los Server Actions (Fase 2).
  const token = request.cookies.get(getSessionCookieName())?.value;
  if (!(await readSessionToken(token))) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
