import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { getOperatorCookieName, readOperatorToken } from "@/lib/operator-auth";
import { isDemoSandbox } from "@/lib/demo-flag";
import { vidrieraDelHost } from "@/lib/producto-host";
import { ARCHIVOS_DEL_CLUB_CRUDO, PREFIJO_CLUB_CRUDO } from "@/lib/club-crudo";
import {
  GATE_PATH,
  extraPublicPaths,
  gateAplicaA,
  gatePassword,
  getGateCookieName,
  readGateToken,
} from "@/lib/site-gate";

// Un preview compilado contra la base de PRODUCCIÓN no atiende nada (scripts/preview-base.mjs):
// ni el panel, ni la consola del operador, ni la vidriera. Sólo /api/health, que dice qué commit
// corre y no toca datos. 503 con una explicación, no una pantalla rota.
function previewBloqueado(pathname: string): NextResponse | null {
  if (process.env.GSG_PREVIEW_BLOQUEADO !== "1" || pathname === "/api/health") return null;
  return new NextResponse(
    "<!doctype html><meta charset=utf-8><title>Preview bloqueado</title>" +
      "<body style=\"font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem;line-height:1.5\">" +
      "<h1>Este preview está bloqueado</h1>" +
      "<p>Apunta a la base de datos de producción, con los datos reales de los clientes. " +
      "Para usarlo como ambiente de QA, cargá en Vercel <code>DATABASE_URL</code> y " +
      "<code>OPERATOR_DATABASE_URL</code> sólo para Preview, con la base de QA.</p></body>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/** ¿El host es el dominio base (`APP_BASE_DOMAIN`) o su `www.`? Sin dominio base configurado, nunca. PURA. */
export function esApexDelDominio(host: string | null | undefined, base = process.env.APP_BASE_DOMAIN): boolean {
  const b = base?.trim().toLowerCase();
  const h = (host ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
  return !!b && !!h && (h === b || h === `www.${b}`);
}

/**
 * Si la ruta es del club crudo de Break Point: el archivo de `ARCHIVOS_DEL_CLUB_CRUDO` que nombra, o `""` para
 * cualquier otra cosa dentro de la carpeta (la carpeta misma incluida); si no es del club, `null`. La detección se
 * normaliza (mayúsculas, %xx, barras dobles e invertidas, . y ..) para no esquivarla; lo devuelto es siempre una
 * clave de la lista blanca, nunca texto de la URL (con `%252e%252e` el resto decodificado una vez era `%2e%2e/...`
 * y `new URL` lo resolvía como `..`: certificación GSG-SEG-002, cert 2). PURA.
 */
export function rutaDelClubCrudo(pathname: string): string | null {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    // %xx roto: se mira la ruta tal cual llegó.
  }
  // Barras invertidas, dobles y segmentos . / .. resueltos: `/previews/breakpoint/turnero/..%2fclub/app.mjs` también cuenta.
  const plano = p.toLowerCase().replace(/\\/g, "/");
  // Lo que llega con el prefijo del club (antes de resolver `..`) es del club aunque «salga» al resolver: 404, no paso.
  const conPrefijo = /^\/+previews\/+breakpoint\/+club(\/|$)/.test(plano);
  const segs: string[] = [];
  for (const s of plano.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") segs.pop();
    else segs.push(s);
  }
  p = `/${segs.join("/")}`;
  // El motor puro (reglas de canchas y precios, sin pantalla ni datos) queda público: lo importa el turnero crudo
  // de los jugadores (public/previews/breakpoint/turnero/local.mjs) y ya viaja dentro de /turnero.
  if (p === "/previews/breakpoint/club/motor.mjs") return null;
  if (p === "/previews/breakpoint/club") return "";
  if (!p.startsWith("/previews/breakpoint/club/")) return conPrefijo ? "" : null;
  return archivoDeLaLista(p.slice("/previews/breakpoint/club/".length)) ?? "";
}

/** La clave de `ARCHIVOS_DEL_CLUB_CRUDO` igual a `nombre` (la de la lista, no el texto recibido), o `null`. PURA. */
function archivoDeLaLista(nombre: string): string | null {
  return Object.keys(ARCHIVOS_DEL_CLUB_CRUDO).find((k) => k === nombre) ?? null;
}

/**
 * El archivo del club crudo a servir para esta ruta, o `null` (→ 404). Sólo la forma canónica exacta,
 * `/previews/breakpoint/club/<archivo de la lista>`: cualquier %xx, barra invertida o doble, segmento vacío, `.`,
 * `..`, `;` o mayúscula queda afuera. PURA.
 */
export function archivoDelClubCrudo(pathname: string): string | null {
  const prefijo = "/previews/breakpoint/club/";
  if (!pathname.startsWith(prefijo)) return null;
  return archivoDeLaLista(pathname.slice(prefijo.length));
}

/** ¿La ruta es del club crudo de Break Point? Ver `rutaDelClubCrudo`. PURA. */
export function esClubCrudo(pathname: string): boolean {
  return rutaDelClubCrudo(pathname) !== null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const bloqueado = previewBloqueado(pathname);
  if (bloqueado) return bloqueado;

  // Reenvía la ruta actual como header al server (upstream, no expuesto al cliente):
  // los layouts/páginas de /admin no reciben el pathname por props, y el gating por-URL
  // del producto Comerciante (layout del dashboard) lo necesita para mapear ruta → módulo.
  // Ver `NextResponse.next({ request: { headers } })` (proxy de Next 16).
  // El `x-pathname` que mande el cliente se descarta siempre: lo único que llega al server es el de acá. Todo camino
  // que deja seguir la request usa `pass()` o reenvía `requestHeaders` (certificación GSG-SEG-002, cert 3).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-pathname");
  requestHeaders.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  // --- Host de PRODUCTO (ADR-076 §2): la raíz del link de venta abre la vidriera del producto.
  // Rewrite, no redirect; sólo la raíz. Va antes del portón del sitio: la vidriera de un producto
  // es pública como `/facturita` (ver `gateAplicaA`).
  if (pathname === "/") {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const vidriera = vidrieraDelHost(host);
    if (vidriera) return NextResponse.rewrite(new URL(vidriera, request.url), { request: { headers: requestHeaders } });
    // --- El apex del dominio (`gsgapp.com.ar`, `www.`) es la portada de GSG, no la de un negocio (E1, 29/10/2026):
    // antes caía a la landing de CH. Sin consulta: es el dominio base, no un negocio.
    if (esApexDelDominio(host)) return NextResponse.rewrite(new URL("/sin-negocio", request.url), { request: { headers: requestHeaders } });
  }

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

  // --- El club de Break Point de antes del ERP, en crudo (public/previews/breakpoint/club): es la misma app que
  // /club y se servía a cualquiera, en cualquier host (también en el de Break Point, donde comparte el guardado del
  // navegador con la jornada). Sin una sesión vigente del panel, 404 acá. Con sesión, NUNCA se sirve el archivo
  // público directo: se reescribe al manejador (src/app/club-crudo), que exige un usuario activo DEL NEGOCIO
  // breakpoint con el permiso del club, el mismo criterio que /club (src/lib/sitio-estatico.ts). Antes alcanzaba un
  // token válido de cualquier negocio (certificación GSG-SEG-002).
  const restoDelClub = rutaDelClubCrudo(pathname);
  if (restoDelClub !== null) {
    if (!(await readSessionToken(request.cookies.get(getSessionCookieName())?.value))) {
      return new NextResponse("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    // Lista blanca exacta sobre la ruta cruda: el destino es una constante de la lista, nunca la URL recibida.
    const archivo = archivoDelClubCrudo(pathname);
    if (archivo === null || archivo !== restoDelClub) {
      return new NextResponse("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    return NextResponse.rewrite(new URL(`${PREFIJO_CLUB_CRUDO}/${archivo}`, request.url), { request: { headers: requestHeaders } });
  }

  // --- Plano de OPERADOR (control-plane, ADR-021) — portón separado del de tenant.
  // Cookie propia y secreto propio; nunca comparte llavero con la sesión de un tenant.
  if (pathname.startsWith("/operador")) {
    // Públicas: el login, adonde postea su formulario (/operador/login/ingresar, la ruta que
    // verifica la clave: sin sesión todavía, por definición) y /operador/clave, que arma en el
    // navegador la línea de OPERADORES (no lee ni escribe nada del servidor: la clave no sale de la
    // pantalla). Por ruta exacta: nada debajo de ellas queda público.
    if (pathname === "/operador/login" || pathname === "/operador/login/ingresar" || pathname === "/operador/clave") {
      return pass();
    }
    const opToken = request.cookies.get(getOperatorCookieName())?.value;
    if (!(await readOperatorToken(opToken))) {
      const loginUrl = new URL("/operador/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return pass();
  }

  // --- Modo SANDBOX de preventa (docs/preventa/plan-acceso-sandbox-sin-password.md).
  // Solo existe si DEMO_MODE_ENABLED="true", flag exclusiva de un deploy aislado sin
  // DB real (nunca un tenant real la tiene seteada) — deja pasar /admin sin cookie.
  // NO toca /operador (consola super-admin, siempre gateada).
  if (pathname.startsWith("/admin") && isDemoSandbox()) {
    return pass();
  }

  // Lo que hay debajo (segundo paso, Google) pasa antes de que exista la sesión; cada ruta controla su propio pase.
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return pass();
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
    pathname.startsWith("/contador/") ||
    // La app de Facturita (Emitir / Mis facturas / Mi cuenta) es superficie de tenant. Sólo
    // `/facturita/app`: la vidriera, el alta, los planes, el manifiesto y el service worker
    // siguen públicos (el navegador baja manifiesto y SW sin cookies).
    pathname === "/facturita/app" ||
    pathname.startsWith("/facturita/app/");
  if (!esSuperficieDeTenant) return pass();

  // Portón grueso (ADR-017 §2.e): solo verifica que la cookie tenga una firma
  // válida. El chequeo de rol por acción vive en los Server Actions (Fase 2).
  const token = request.cookies.get(getSessionCookieName())?.value;
  if (!(await readSessionToken(token))) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    // Había cookie pero ya no vale (venció a las 8 h, o es del formato viejo pasada la transición):
    // el login lo dice, en vez de un «email o contraseña incorrectos» que nadie tipeó.
    if (token) loginUrl.searchParams.set("error", "vencida");
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
  //
  // Las superficies sensibles pasan SIEMPRE, aunque la ruta termine en una extensión de la lista (`/admin/x.txt` caía
  // en una página dinámica sin portón: certificación GSG-SEG-002, cert 3). Next corre el proxy si cualquier entrada
  // del matcher coincide.
  matcher: [
    "/admin/:path*",
    "/operador/:path*",
    "/contador/:path*",
    "/facturita/:path*",
    "/api/:path*",
    "/club-crudo/:path*",
    "/previews/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff|woff2)$).*)",
  ],
};
