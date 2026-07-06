import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { getOperatorCookieName, readOperatorToken } from "@/lib/operator-auth";
import { isDemoSandbox } from "@/lib/demo-flag";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Plano de OPERADOR (control-plane, ADR-021) — portón separado del de tenant.
  // Cookie propia y secreto propio; nunca comparte llavero con la sesión de un tenant.
  if (pathname.startsWith("/operador")) {
    if (pathname === "/operador/login") return NextResponse.next();
    const opToken = request.cookies.get(getOperatorCookieName())?.value;
    if (!(await readOperatorToken(opToken))) {
      const loginUrl = new URL("/operador/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // --- Modo SANDBOX de preventa (docs/preventa/plan-acceso-sandbox-sin-password.md).
  // Solo existe si DEMO_MODE_ENABLED="true", flag exclusiva de un deploy aislado sin
  // DB real (nunca un tenant real la tiene seteada) — deja pasar /admin sin cookie.
  // NO toca /operador (consola super-admin, siempre gateada).
  if (pathname.startsWith("/admin") && isDemoSandbox()) {
    return NextResponse.next();
  }

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
  matcher: ["/admin/:path*", "/operador/:path*"],
};
