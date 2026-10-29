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
 * Multi-tenant (Tanda P1, P1-C4): el token sale de la CONEXIÓN de Mercado Pago del negocio
 * (`configCobrosPorDefecto` de pagos-dispatch, la misma que lee los pagos). `MP_ACCESS_TOKEN`
 * global sólo con `MP_MODO_LEGADO=1` y auditado; sin conexión ni flag, falla cerrada.
 */

import {
  HttpPasarelaCobros,
  StubPasarelaCobros,
  type PasarelaCobros,
} from "@/plugins/mercadopago/cobros";
import { tokenFijo } from "@/plugins/mercadopago/http";
import { logger } from "@/lib/logger";
import {
  configCobrosDesde,
  depsConfigCobrosDeLaBase,
  type ConfigCobros,
  type ConfigCobrosPort,
} from "@/lib/pagos-dispatch";

export { CobrosSinConexionError } from "@/lib/pagos-dispatch";

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

/** El `accessToken` de una config de cobros de MP, o "" si no lo trae (legado sin token). PURA. */
function tokenDeLaConfig(cfg: ConfigCobros): string {
  const c = cfg.config as { credenciales?: { accessToken?: unknown } } | undefined;
  const t = c?.credenciales?.accessToken;
  return typeof t === "string" ? t.trim() : "";
}

/**
 * Construye la `PasarelaCobros` de un tenant. En modo stub (default) devuelve el
 * sandbox en memoria (no cobra en ninguna cuenta); en modo test/real, el adapter HTTP con el
 * token de la CONEXIÓN de Mercado Pago del negocio (P1-C4, misma resolución que la lectura de
 * pagos: `configCobrosPorDefecto`). Sin conexión y sin `MP_MODO_LEGADO=1` → lanza
 * `CobrosSinConexionError` (falla cerrada: nunca un link que cobra en la cuenta de otro). Con el
 * flag y sin conexión → el token global del despliegue, auditado en el negocio.
 *
 * `configPort` es inyectable para tests; por defecto, la base + el `env` recibido.
 */
export async function crearPasarelaCobrosPara(
  tenantId: string,
  env: Record<string, string | undefined> = process.env,
  configPort: ConfigCobrosPort = configCobrosDesde({ ...depsConfigCobrosDeLaBase, env }),
): Promise<PasarelaCobros> {
  const modo = modoCobrosDesdeEnv(env);
  if (modo === "real" || modo === "test") {
    // Token de la conexión del negocio (o del legado auditado). Si falta, `tokenFijo` lanzará al
    // usarse (credencial requerida) — nunca se inventa.
    const accessToken = tokenDeLaConfig(await configPort.configDe(tenantId));
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
