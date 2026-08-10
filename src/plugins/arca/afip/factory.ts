/**
 * Factory del cliente de ARCA: resuelve STUB vs adapter SOAP real (producción u
 * HOMOLOGACIÓN) según el entorno, sin que el llamador (el `clientePara` del
 * handler) tenga que saber de endpoints.
 *
 * 🔒 CREDENCIAL POR TENANT (ADR-066): la credencial del emisor entra EXPLÍCITA
 * (`opts.credencial`), resuelta por `credencialParaTenant(tenantId)` (cifrada por
 * tenant, `src/lib/fiscal/tenant-cert.ts`). El factory YA NO lee el certificado de
 * un env único compartido: hacerlo firmaría las facturas de todos los tenants con
 * la misma clave (contaminación fiscal cruzada). En modo real/homologación la
 * credencial es OBLIGATORIA — sin ella no se emite (fail-closed).
 *
 * Contrato de encendido ("encender, no construir"):
 *   - `ARCA_MODO=real` + `opts.credencial` del tenant          → SOAP real, endpoint
 *     según `EmisorConfig.homologacion` (lo decide el Tenant). GUARD FAIL-CLOSED:
 *     el CUIT del subject del cert debe coincidir con `config.cuit`, o aborta.
 *   - `ARCA_MODO=homologacion` + `opts.credencial`             → SOAP real, pero
 *     SIEMPRE contra homologación (testing oficial de ARCA) — el endpoint de test se
 *     fuerza sin importar el Tenant, así un cert de PRUEBA nunca factura de verdad.
 *   - cualquier otro caso                                       → `StubAfipClient`.
 */

import { AfipClient, EmisorConfig } from './port';
import { SoapAfipClient, type TicketAcceso } from './soap';
import { StubAfipClient } from './stub';
import { Pkcs7TraSigner, type CredencialEmisor } from './signer';
import { assertCertCoincideConCuit } from './cert-inspect';

export type ModoArca = 'stub' | 'homologacion' | 'real';

/** Opciones del factory. `credencial` es OBLIGATORIA en real/homologación (por tenant). */
export interface CrearAfipClientOpts {
  /** Entorno del que se lee `ARCA_MODO`. Default `process.env`. */
  env?: Record<string, string | undefined>;
  /** Credencial del emisor del tenant (cifrada en reposo, resuelta por tenant). */
  credencial?: CredencialEmisor | null;
  /**
   * TA persistido del tenant (cacheado, cifrado) para REUSAR en vez de re-loguear
   * contra WSAA. Si sigue vigente, el cliente lo usa; si no, re-autentica. Clave en
   * serverless: sin esto, cada invocación re-loguea y falla con `alreadyAuthenticated`.
   */
  ticketInicial?: TicketAcceso;
  /** Callback para PERSISTIR el TA cuando el cliente lo renueva contra WSAA. */
  alRenovarTicket?: (ta: TicketAcceso) => void | Promise<void>;
}

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
 * Devuelve el `AfipClient` para un emisor. En modo real u homologación exige la
 * credencial del tenant EXPLÍCITA (`opts.credencial`): si falta, lanza un error de
 * acción humana (no cae al stub, que emitiría comprobantes falsos, ni a un env
 * compartido, que firmaría con el cert de otro tenant — ADR-066).
 *
 * GUARD FAIL-CLOSED (modo real): antes de construir el firmante, exige que el CUIT del
 * subject del cert coincida con `config.cuit` (el CUIT del tenant). Si no coincide,
 * ABORTA — nunca firma una factura real con el certificado de otro contribuyente. En
 * homologación el endpoint está forzado al ambiente de test (no hay registros fiscales
 * reales), así que el guard estricto no aplica: ahí se usa un cert de PRUEBA.
 */
export function crearAfipClient(
  config: EmisorConfig,
  opts: CrearAfipClientOpts = {},
): AfipClient {
  const env = opts.env ?? process.env;
  const modo = modoDesdeEnv(env);
  if (modo === 'real' || modo === 'homologacion') {
    const cred = opts.credencial ?? null;
    if (!cred) {
      throw new Error(
        `ARCA_MODO=${modo} pero no se pasó la credencial del emisor. La credencial sale de ` +
          '`credencialParaTenant(tenantId)` (cifrada por tenant) — NUNCA de un env compartido ' +
          '(ADR-066). Cargá el certificado del tenant desde el plano de operador, o dejá ' +
          'ARCA_MODO sin setear para usar el stub.',
      );
    }
    // Guard fail-closed: en modo real, el cert tiene que ser del CUIT del tenant.
    if (modo === 'real') {
      assertCertCoincideConCuit(cred.certPem, String(config.cuit));
    }
    return new SoapAfipClient(configParaModo(config, modo), {
      signer: new Pkcs7TraSigner(cred),
      ticketInicial: opts.ticketInicial,
      alRenovarTicket: opts.alRenovarTicket,
    });
  }
  return new StubAfipClient(config);
}
