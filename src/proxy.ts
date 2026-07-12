import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { getOperatorCookieName, readOperatorToken } from "@/lib/operator-auth";
import { isDemoSandbox } from "@/lib/demo-flag";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Reenvía la ruta actual como header al server (upstream, no expuesto al cliente):
  // los layouts/páginas de /admin no reciben el pathname por props, y el gating por-URL
  // del producto Comerciante (layout del dashboard) lo necesita para mapear ruta → módulo.
  // Ver `NextResponse.next({ request: { headers } })` (proxy de Next 16).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

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
    return pass();
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

  return pass();
}

export const config = {
  matcher: ["/admin/:path*", "/operador/:path*"],
};
