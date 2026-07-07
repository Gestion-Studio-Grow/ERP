/**
 * Glue de COBROS de Mercado Pago (Integration Engine, ADR-002/006/024/025).
 *
 * Resuelve la `PasarelaCobros` de un tenant y respeta el modo por env:
 *   - `MP_MODO` sin setear o != "real"  → STUB (sandbox, sin credenciales). DEFAULT.
 *   - `MP_MODO="real"` + `MP_ACCESS_TOKEN` presente → adapter HTTP real (Checkout Pro).
 *   - `MP_MODO="real"` SIN token → el adapter real igual se construye, pero al usarlo
 *     falla con "credencial requerida (acción humana)" — nunca inventa un token.
 *
 * "Encender, no construir" (ADR-025 §9): el enganche está completo; falta solo que
 * el dueño cargue `MP_ACCESS_TOKEN` en el entorno/secret store y prenda `MP_MODO=real`.
 * NUNCA hay secretos en el repo ni se piden por chat.
 *
 * NOTA multi-tenant: hoy el token se lee de `MP_ACCESS_TOKEN` a nivel entorno (el
 * despliegue es un sitio por tenant, Opción A / `FORCE_TENANT_SLUG`). Cuando haya
 * varios tenants por despliegue, el token por tenant sale de un secret store keyeado
 * por `tenantId` (o del `CredencialesPort` OAuth de MP) — el seam ya está listo; se
 * cambia solo la resolución del token, no el resto.
 */

import {
  HttpPasarelaCobros,
  StubPasarelaCobros,
  type PasarelaCobros,
} from "@/plugins/mercadopago/cobros";
import { tokenFijo } from "@/plugins/mercadopago/http";

export type ModoCobros = "stub" | "real";

/** Lee el modo de cobros del entorno. Default "stub" (sandbox, seguro). */
export function modoCobrosDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): ModoCobros {
  return env.MP_MODO?.trim().toLowerCase() === "real" ? "real" : "stub";
}

/**
 * Construye la `PasarelaCobros` de un tenant. En modo stub (default) devuelve el
 * sandbox; en modo real, el adapter HTTP con el token del entorno. `tenantId` se
 * recibe para la futura resolución por-tenant (ver nota de multi-tenant arriba).
 */
export function crearPasarelaCobrosPara(
  _tenantId: string,
  env: Record<string, string | undefined> = process.env,
): PasarelaCobros {
  if (modoCobrosDesdeEnv(env) === "real") {
    // Token del entorno/secret store. Si falta, `tokenFijo` lanzará al usarse
    // (credencial requerida) — nunca se inventa.
    const accessToken = env.MP_ACCESS_TOKEN?.trim() ?? "";
    return new HttpPasarelaCobros(tokenFijo({ accessToken }));
  }
  return new StubPasarelaCobros();
}
