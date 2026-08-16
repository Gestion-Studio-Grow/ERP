import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { getOperatorCookieName, readOperatorToken } from "@/lib/operator-auth";
import { isDemoSandbox } from "@/lib/demo-flag";
import {
  GATE_PATH,
  extraPublicPaths,
  gateAplicaA,
  gatePassword,
  getGateCookieName,
  readGateToken,
} from "@/lib/site-gate";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Reenvía la ruta actual como header al server (upstream, no expuesto al cliente):
  // los layouts/páginas de /admin no reciben el pathname por props, y el gating por-URL
  // del producto Comerciante (layout del dashboard) lo necesita para mapear ruta → módulo.
  // Ver `NextResponse.next({ request: { headers } })` (proxy de Next 16).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  // --- PORTÓN DEL SITIO PÚBLICO (`SITE_GATE_PASSWORD`).
  // Mientras la vidriera no esté lista para que la vea cualquiera, pide una clave
  // compartida. Va PRIMERO y sólo sobre las rutas públicas: las superficies con su
  // propio login (/admin, /operador, /contador, /facturita) y las APIs quedan
  // exentas — ver `gateAplicaA`. Sin la variable de entorno no hace nada.
  const clave = gatePassword();
  if (clave && gateAplicaA(pathname, extraPublicPaths())) {
    const gateCookie = request.cookies.get(getGateCookieName())?.value;
    if (!(await readGateToken(gateCookie, clave))) {
      const gateUrl = new URL(GATE_PATH, request.url);
      // Se recuerda a dónde iba para devolverlo ahí después de la clave (con el
      // QR de una campaña eso es la diferencia entre entrar y perderse).
      if (pathname !== "/") gateUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(gateUrl);
    }
  }

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

  // A partir de acá vive el PORTÓN DE TENANT (/admin y /contador). Hasta que el
  // matcher cubrió sólo esas rutas, alcanzaba con dejarlo al final como fallthrough.
  // Ahora el matcher abarca TODO el sitio (para poder cerrar la vidriera con
  // `SITE_GATE_PASSWORD`), así que hay que decir explícitamente a qué se aplica: sin
  // esta línea, la home y la carta de precios redirigirían a /admin/login y el sitio
  // público dejaría de existir para cualquiera sin sesión.
  const esSuperficieDeTenant =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/contador" ||
    pathname.startsWith("/contador/");
  if (!esSuperficieDeTenant) return pass();

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
  // `/contador` es la superficie propia del producto CONTADOR (estudio contable,
  // módulo CARTERA) — vive FUERA de `/admin` pero es una superficie de TENANT, así
  // que va bajo el portón grueso de tenant (fallthrough → /admin/login). Antes NO
  // estaba en el matcher → el panel de cartera CROSS-TENANT respondía sin sesión en
  // prod (regresión de auditoría fiscal, cerrada acá). El chequeo fino (capability
  // `cartera:manage` + módulo `cartera` asignado) sigue en la página y las actions.
  //
  // El matcher se amplió a TODO el sitio para que el portón público
  // (`SITE_GATE_PASSWORD`) pueda cubrir la vidriera. Quedan afuera las cosas que
  // no son páginas: los assets de Next, los archivos estáticos y el favicon —
  // pasarlos por el middleware sólo agrega latencia a cada imagen. `/api` entra al
  // matcher pero el portón lo deja pasar (webhooks y cron no tienen navegador donde
  // tipear una clave); las rutas de tenant que ya tenían portón siguen igual.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff|woff2)$).*)",
  ],
};
