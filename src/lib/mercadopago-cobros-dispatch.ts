/**
 * Glue de COBROS de Mercado Pago (Integration Engine, ADR-002/006/024/025).
 *
 * Resuelve la `PasarelaCobros` de un tenant y respeta el modo por env:
 *   - `MP_MODO` sin setear o != "test"/"real"  → STUB (sandbox, sin credenciales). DEFAULT.
 *   - `MP_MODO="test"` + `MP_ACCESS_TOKEN` de PRUEBA (prefijo `TEST-`) → adapter HTTP
 *     real contra Checkout Pro (banco de pruebas — MP usa la MISMA API para test y
 *     producción; la credencial es lo que distingue, ver `MP_API_BASE`).
 *   - `MP_MODO="real"` + `MP_ACCESS_TOKEN` productivo → adapter HTTP real, cobros de verdad.
 *   - `MP_MODO="test"`/`"real"` SIN token → el adapter real igual se construye, pero al
 *     usarlo falla con "credencial requerida (acción humana)" — nunca inventa un token.
 *
 * "Encender, no construir" (ADR-025 §9): el enganche está completo; falta solo que
 * el dueño cargue `MP_ACCESS_TOKEN` (de prueba o productivo) en el entorno/secret
 * store y prenda el modo correspondiente. NUNCA hay secretos en el repo ni se piden
 * por chat.
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
import { logger } from "@/lib/logger";

export type ModoCobros = "stub" | "test" | "real";

/** Lee el modo de cobros del entorno. Default "stub" (sandbox, seguro). */
export function modoCobrosDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): ModoCobros {
  const v = env.MP_MODO?.trim().toLowerCase();
  if (v === "real") return "real";
  if (v === "test") return "test";
  return "stub";
}

/**
 * Heurística (no valida contra la API): ¿el access token tiene el prefijo
 * `TEST-` que Mercado Pago usa para sus credenciales de PRUEBA? Sirve solo para
 * avisar si el modo y el token parecen no coincidir — nunca bloquea ni loguea
 * el token completo.
 */
export function pareceTokenDePrueba(accessToken: string): boolean {
  return accessToken.trim().toUpperCase().startsWith("TEST-");
}

/**
 * Construye la `PasarelaCobros` de un tenant. En modo stub (default) devuelve el
 * sandbox en memoria; en modo test/real, el adapter HTTP con el token del
 * entorno (misma API de MP para ambos — homologación es cuestión de credencial,
 * no de endpoint). `tenantId` se recibe para la futura resolución por-tenant
 * (ver nota de multi-tenant arriba).
 */
export function crearPasarelaCobrosPara(
  _tenantId: string,
  env: Record<string, string | undefined> = process.env,
): PasarelaCobros {
  const modo = modoCobrosDesdeEnv(env);
  if (modo === "real" || modo === "test") {
    // Token del entorno/secret store. Si falta, `tokenFijo` lanzará al usarse
    // (credencial requerida) — nunca se inventa.
    const accessToken = env.MP_ACCESS_TOKEN?.trim() ?? "";
    if (accessToken) {
      const esDePrueba = pareceTokenDePrueba(accessToken);
      if (modo === "test" && !esDePrueba) {
        logger.warn(
          "mercadopago.modo",
          "MP_MODO=test con un access token sin el prefijo TEST- de Mercado Pago; " +
            "verificá que sea una credencial de PRUEBA (Tus integraciones → Credenciales de prueba).",
        );
      }
      if (modo === "real" && esDePrueba) {
        logger.warn(
          "mercadopago.modo",
          "MP_MODO=real con un access token que parece de PRUEBA (prefijo TEST-); " +
            "revisá antes de cobrar de verdad.",
        );
      }
    }
    return new HttpPasarelaCobros(tokenFijo({ accessToken }));
  }
  return new StubPasarelaCobros();
}
