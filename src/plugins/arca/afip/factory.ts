/**
 * Factory del cliente de ARCA: resuelve STUB vs adapter SOAP real según el
 * entorno, sin que el llamador (el `clientePara` del handler) tenga que saber de
 * certificados ni endpoints.
 *
 * Contrato de encendido ("encender, no construir"):
 *   - `ARCA_MODO=real` + `ARCA_CERT_PEM` + `ARCA_KEY_PEM`  → adapter SOAP real.
 *   - cualquier otro caso                                   → `StubAfipClient`.
 * Setear el modo y las credenciales es acción humana; el código ya está.
 */

import { AfipClient, EmisorConfig } from './port';
import { SoapAfipClient } from './soap';
import { StubAfipClient } from './stub';
import { Pkcs7TraSigner, credencialDesdeEnv } from './signer';

export type ModoArca = 'stub' | 'real';

/** Modo de ARCA declarado por entorno. Default `stub` (seguro). */
export function modoDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): ModoArca {
  return env.ARCA_MODO === 'real' ? 'real' : 'stub';
}

/**
 * Devuelve el `AfipClient` para un emisor. En modo real exige credenciales: si
 * `ARCA_MODO=real` pero faltan los PEM, lanza un error explícito de acción
 * humana (no cae silenciosamente al stub, que emitiría comprobantes falsos).
 */
export function crearAfipClient(
  config: EmisorConfig,
  env: Record<string, string | undefined> = process.env,
): AfipClient {
  if (modoDesdeEnv(env) === 'real') {
    const cred = credencialDesdeEnv(env);
    if (!cred) {
      throw new Error(
        'ARCA_MODO=real pero faltan ARCA_CERT_PEM / ARCA_KEY_PEM. ' +
          'Cargá el certificado y la clave del emisor (acción humana) o dejá ARCA_MODO sin setear para usar el stub.',
      );
    }
    return new SoapAfipClient(config, { signer: new Pkcs7TraSigner(cred) });
  }
  return new StubAfipClient(config);
}
