// POST /operador/login/ingresar — el ingreso a la consola, como formulario HTML común.
//
// POR QUÉ NO ES UNA SERVER ACTION (2026-09-27). El dueño abrió /operador/login, se publicó una
// versión nueva, apretó «Ingresar» y le salió «Se produjo un error inesperado». En el log:
// `POST /operador/login 404 Failed to find Server Action … older or newer deployment`. Una Server
// Action se llama por un id que cambia en cada build: la página vieja manda un id que la versión
// nueva no conoce. Esta ruta tiene una dirección fija, así que el formulario de una página de
// cualquier versión (anterior o posterior) llega igual, y funciona hasta sin JavaScript. No hay
// página vieja que explicar: entra.
//
// Lo que la Server Action hacía sola y acá se hace a mano:
//   · mismo origen (`vieneDeEstaPagina`): un sitio ajeno no puede hacer que tu navegador entre;
//   · el freno anti fuerza bruta, el mismo limitador y la misma clave por IP que antes;
//   · la cookie de sesión, con los mismos atributos, puesta en la respuesta.
// Es pública a propósito (src/proxy.ts la deja pasar, como a /operador/login).

import { NextResponse, type NextRequest } from "next/server";
import { createOperatorToken, getOperatorCookieName, VIGENCIA_SESION_MS, verificarOperador } from "@/lib/operator-auth";
import { clientIpFromRequest, loginKey, loginRateLimiter } from "@/lib/rate-limit";
import { direccionFrenada } from "../aviso-ingreso";

/** 303: el navegador sigue con un GET (no reenvía el formulario, ni la clave). Dirección relativa. */
function irA(destino: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: destino } });
}

/** A dónde vuelve después de entrar: sólo a la consola, y sin nada que pueda escapar del sitio. */
function destinoEnLaConsola(next: string): string {
  return /^\/operador(?:[/?#][^\s\\]*)?$/.test(next) ? next : "/operador";
}

/**
 * ¿El formulario salió de una página de este mismo sitio? Lo que una Server Action chequeaba sola:
 * el `Origin` del navegador contra el host del pedido. Sin `Origin` (curl, un script) no hay un
 * navegador ajeno que proteger; un `Origin` de otro sitio, o "null", se rechaza.
 */
function vieneDeEstaPagina(req: NextRequest): boolean {
  const origen = req.headers.get("origin");
  if (origen === null) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return host !== null && new URL(origen).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!vieneDeEstaPagina(req)) {
    return new NextResponse("Pedido rechazado: el ingreso tiene que salir de la página de la consola.", { status: 403 });
  }
  let datos: FormData;
  try {
    datos = await req.formData();
  } catch {
    return irA("/operador/login");
  }
  const nombre = String(datos.get("nombre") ?? "");
  const password = String(datos.get("password") ?? "");
  const next = String(datos.get("next") ?? "/operador");

  // Rate limiting anti fuerza bruta (Célula 2): 5 fallos / 15 min por IP, el mismo limitador que
  // /admin. La pantalla dice cuántos minutos faltan (`direccionFrenada`).
  const key = loginKey("operator", clientIpFromRequest(req));
  if (loginRateLimiter.blocked(key)) return irA(direccionFrenada(next, loginRateLimiter.retryAfterMs(key)));

  // Nombre y clave: el dueño con OPERATOR_PASSWORD (usuario vacío o su nombre) o un operador de
  // OPERADORES con su línea PBKDF2. El token lleva el nombre y la hora: vence a las 8 h en el servidor.
  const operador = await verificarOperador(nombre, password);
  if (!operador) {
    loginRateLimiter.fail(key);
    // El fallo que completa el cupo ya avisa del freno: si no, el próximo intento (aunque traiga la
    // clave buena) ni se mira y recién ahí la pantalla dice que hay que esperar.
    if (loginRateLimiter.blocked(key)) return irA(direccionFrenada(next, loginRateLimiter.retryAfterMs(key)));
    return irA(`/operador/login?error=1&next=${encodeURIComponent(next)}`);
  }
  loginRateLimiter.reset(key);
  const res = irA(destinoEnLaConsola(next));
  res.cookies.set(getOperatorCookieName(), await createOperatorToken(operador), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIGENCIA_SESION_MS / 1000,
  });
  return res;
}
