/**
 * Factory del cliente de ARCA: resuelve STUB vs adapter SOAP real (producción u
 * HOMOLOGACIÓN) según el entorno, sin que el llamador (el `clientePara` del
 * handler) tenga que saber de certificados ni endpoints.
 *
 * Contrato de encendido ("encender, no construir"):
 *   - `ARCA_MODO=real` + `ARCA_CERT_PEM` + `ARCA_KEY_PEM`          → SOAP real,
 *     endpoint según `EmisorConfig.homologacion` (lo decide el Tenant).
 *   - `ARCA_MODO=homologacion` + `ARCA_CERT_PEM` + `ARCA_KEY_PEM`  → SOAP real,
 *     pero SIEMPRE contra el ambiente de homologación (testing oficial de ARCA)
 *     — el banco de pruebas (`docs/lecciones-aprendidas` SEC-1) fuerza el
 *     endpoint de test sin importar qué diga el Tenant, así un certificado de
 *     PRUEBA nunca puede terminar facturando de verdad.
 *   - cualquier otro caso                                          → `StubAfipClient`.
 * Setear el modo y las credenciales (de prueba o de producción) es acción
 * humana; el código ya está.
 */

import { AfipClient, EmisorConfig } from './port';
import { SoapAfipClient } from './soap';
import { StubAfipClient } from './stub';
import { Pkcs7TraSigner, credencialDesdeEnv } from './signer';

export type ModoArca = 'stub' | 'homologacion' | 'real';

/** Modo de ARCA declarado por entorno. Default `stub` (seguro). */
export function modoDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): ModoArca {
  if (env.ARCA_MODO === 'real') return 'real';
  if (env.ARCA_MODO === 'homologacion') return 'homologacion';
  return 'stub';
}

/**
 * Config efectiva del emisor según el modo (PURA, testeable sin certificado).
 * En `homologacion` fuerza `homologacion: true` sin importar lo que traiga
 * `config` — así el banco de pruebas nunca puede apuntar a producción aunque el
 * Tenant tenga `arcaHomologacion` mal seteado.
 */
export function configParaModo(config: EmisorConfig, modo: ModoArca): EmisorConfig {
  return modo === 'homologacion' ? { ...config, homologacion: true } : config;
}

/**
 * Devuelve el `AfipClient` para un emisor. En modo real u homologación exige
 * credenciales: si faltan los PEM, lanza un error explícito de acción humana
 * (no cae silenciosamente al stub, que emitiría comprobantes falsos).
 */
export function crearAfipClient(
  config: EmisorConfig,
  env: Record<string, string | undefined> = process.env,
): AfipClient {
  const modo = modoDesdeEnv(env);
  if (modo === 'real' || modo === 'homologacion') {
    const cred = credencialDesdeEnv(env);
    if (!cred) {
      throw new Error(
        `ARCA_MODO=${modo} pero faltan ARCA_CERT_PEM / ARCA_KEY_PEM. ` +
          'Cargá el certificado y la clave del emisor (de PRUEBA para homologación, de producción para ' +
          'real) — acción humana — o dejá ARCA_MODO sin setear para usar el stub.',
      );
    }
    return new SoapAfipClient(configParaModo(config, modo), { signer: new Pkcs7TraSigner(cred) });
  }
  return new StubAfipClient(config);
}
