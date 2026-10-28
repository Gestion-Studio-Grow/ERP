/**
 * CORE PAGOS — dispatch del gateway de cobros POR TENANT (ADR-024, fase 3).
 *
 * Es el GLUE del borde de cobros: el ÚNICO módulo del Core que conoce a los dos
 * lados —el registro provider-agnóstico (`@/plugins/pagos`) y las fábricas de los
 * proveedores concretos (hoy Mercado Pago)— y los ata. Así la abstracción sigue
 * sin importar a sus implementaciones: la dependencia va glue→(registro+proveedor),
 * nunca registro→proveedor. Mismo patrón que `arca-dispatch` para ARCA.
 *
 * Resuelve, dado un `tenantId`, el `GatewayPagos` que le corresponde:
 *   tenant → (proveedor + credenciales) → `registro.gatewayPara(...)` → adapter.
 *
 * Tanda P1 (P1-C4): el `access_token` de Mercado Pago sale de la CONEXIÓN del negocio
 * (IntegracionConexion + IntegracionCredencial `access_token`, sellada con la KEK). Si el negocio
 * no tiene conexión:
 *   · con `MP_MODO_LEGADO=1` → el token global `MP_ACCESS_TOKEN` del despliegue (o el stub si no
 *     está), y queda AUDITADO en el negocio (AuditLog `mp-modo-legado`) y avisado al monitor;
 *   · sin el flag → `CobrosSinConexionError` (falla cerrada: nunca se cobra ni se lee un pago con
 *     la cuenta de otro).
 *
 * Sumar un proveedor mañana (MODO / Stripe) = registrarlo acá + que el tenant lo
 * elija en su config. La ingesta y el handler del webhook no cambian: hablan
 * `GatewayPagos`, no un proveedor concreto.
 */

import {
  RegistroGateways,
  type ClaveProveedor,
  type GatewayPagos,
} from "@/plugins/pagos";
import { CLAVE_MERCADOPAGO, fabricaGatewayMP } from "@/plugins/mercadopago";
import { logger } from "@/lib/logger";

/**
 * Config de cobros de un tenant: qué proveedor usa y con qué credenciales. El
 * `config` es OPACO para el registro y para el Core (cada proveedor lo interpreta
 * en su fábrica; p.ej. MP espera `{ credenciales: { accessToken } }`).
 */
export interface ConfigCobros {
  /** Clave del proveedor de cobros del tenant (p.ej. "mercadopago"). */
  proveedor: ClaveProveedor;
  /** Credenciales/ajustes específicos del proveedor. Ausente ⇒ el proveedor usa su stub. */
  config?: unknown;
}

/** Provee la config de cobros de un tenant (asiento para respaldarla en DB). */
export interface ConfigCobrosPort {
  configDe(tenantId: string): ConfigCobros | Promise<ConfigCobros>;
}

/**
 * Registro compartido con TODOS los proveedores de cobros disponibles. Se arma
 * una sola vez y se reusa: registrar una fábrica no abre red ni lee credenciales
 * (eso pasa recién al resolver un gateway para un tenant concreto).
 */
export function construirRegistroCobros(): RegistroGateways {
  return new RegistroGateways().registrar(CLAVE_MERCADOPAGO, fabricaGatewayMP);
}

/** Registro por defecto del proceso (los proveedores son stateless al registrar). */
const registroPorDefecto = construirRegistroCobros();

// ── Token por conexión (P1-C4) ───────────────────────────────────────────────

/** Campo de la credencial con el token de MP (= CAMPO_TOKEN_MP del conector). */
export const CAMPO_TOKEN_CONEXION_MP = "access_token";
/** `MP_MODO_LEGADO=1`: el negocio sin conexión usa el token global del despliegue (auditado). */
export const VARIABLE_MODO_LEGADO_MP = "MP_MODO_LEGADO";

export type MotivoSinCobros = "sin_conexion" | "sin_token";

/** El negocio no tiene con qué cobrar en Mercado Pago. El mensaje dice qué hacer, nunca un secreto. */
export class CobrosSinConexionError extends Error {
  constructor(
    readonly motivo: MotivoSinCobros,
    readonly tenantId: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "CobrosSinConexionError";
  }
}

/** ¿Está prendido el modo legado (token global para negocios sin conexión)? Sólo "1" exacto. PURA. */
export function modoLegadoMP(env: Record<string, string | undefined>): boolean {
  return env[VARIABLE_MODO_LEGADO_MP]?.trim() === "1";
}

/** La config del token global del despliegue (camino legado): token → adapter real; sin token → stub. PURA. */
export function configLegadoDesdeEntorno(env: Record<string, string | undefined>): ConfigCobros {
  const accessToken = env.MP_ACCESS_TOKEN?.trim();
  return accessToken
    ? { proveedor: CLAVE_MERCADOPAGO, config: { credenciales: { accessToken } } }
    : { proveedor: CLAVE_MERCADOPAGO };
}

export interface DepsConfigCobros {
  env: Record<string, string | undefined>;
  /** La conexión de Mercado Pago activa del negocio, o null. */
  conexionMP(tenantId: string): Promise<{ conexionId: string } | null>;
  /** El `access_token` en claro (sólo en memoria) de esa conexión, o null si no lo tiene. */
  tokenDe(tenantId: string, conexionId: string): Promise<string | null>;
  /** Deja constancia de que el negocio cobró con el token global (modo legado). */
  auditarLegado(tenantId: string, detalle: { conToken: boolean }): Promise<void>;
}

/** Config con el token de UNA conexión del negocio. Sin token → falla cerrada. */
async function configDeConexion(deps: DepsConfigCobros, tenantId: string, conexionId: string): Promise<ConfigCobros> {
  const accessToken = await deps.tokenDe(tenantId, conexionId);
  if (!accessToken) {
    throw new CobrosSinConexionError(
      "sin_token",
      tenantId,
      "La conexión de Mercado Pago del negocio no tiene access_token: hay que volver a conectarla.",
    );
  }
  return { proveedor: CLAVE_MERCADOPAGO, config: { credenciales: { accessToken } } };
}

/**
 * El puerto de config de cobros con el token POR NEGOCIO. Testeable sin base: las lecturas
 * entran por `deps`.
 */
export function configCobrosDesde(deps: DepsConfigCobros): ConfigCobrosPort {
  return {
    async configDe(tenantId: string): Promise<ConfigCobros> {
      const conexion = await deps.conexionMP(tenantId);
      if (conexion) return configDeConexion(deps, tenantId, conexion.conexionId);
      if (!modoLegadoMP(deps.env)) {
        throw new CobrosSinConexionError(
          "sin_conexion",
          tenantId,
          "El negocio no tiene Mercado Pago conectado: conectalo en Integraciones (o, en la transición, MP_MODO_LEGADO=1).",
        );
      }
      const cfg = configLegadoDesdeEntorno(deps.env);
      await deps.auditarLegado(tenantId, { conToken: cfg.config !== undefined });
      return cfg;
    },
  };
}

/** Auditoría del modo legado en el negocio (AuditLog con su tenantId) + aviso al monitor. */
async function auditarLegadoEnBase(tenantId: string, detalle: { conToken: boolean }): Promise<void> {
  logger.warn("monitor", "Mercado Pago en modo legado: el negocio no tiene conexión y usa el token global", {
    aviso: "mp-modo-legado",
    tenantId,
    conToken: detalle.conToken,
  });
  try {
    const { tenantTransaction } = await import("@/lib/rls");
    await tenantTransaction(
      (tx) =>
        tx.auditLog.create({
          data: {
            tenantId,
            actor: "sistema",
            action: "mp-modo-legado",
            entity: "ConfigCobros",
            entityId: null,
            changes: { variable: VARIABLE_MODO_LEGADO_MP, conToken: detalle.conToken },
            channel: "sistema",
          },
        }),
      { tenantId },
    );
  } catch (err) {
    logger.error("monitor", "no se pudo auditar el modo legado de Mercado Pago", err, { tenantId });
  }
}

/** Las dependencias reales (base + KEK). Import diferido: los tests puros no cargan Prisma. */
export const depsConfigCobrosDeLaBase: DepsConfigCobros = {
  get env() {
    return process.env;
  },
  async conexionMP(tenantId) {
    const { conexionDelNegocio } = await import("@/integraciones/conexiones.server");
    return conexionDelNegocio(tenantId, CLAVE_MERCADOPAGO);
  },
  async tokenDe(tenantId, conexionId) {
    const { leerCredencial } = await import("@/integraciones/conexiones.server");
    return leerCredencial(tenantId, conexionId, CAMPO_TOKEN_CONEXION_MP);
  },
  auditarLegado: auditarLegadoEnBase,
};

/** Config de cobros por defecto: token de la conexión del negocio; legado sólo con el flag. */
export const configCobrosPorDefecto: ConfigCobrosPort = configCobrosDesde(depsConfigCobrosDeLaBase);

/**
 * Resuelve el `GatewayPagos` de un tenant vía el registro de proveedores. Lanza
 * `ProveedorPagoDesconocidoError` si el tenant apunta a un proveedor no registrado y
 * `CobrosSinConexionError` si el negocio no tiene Mercado Pago conectado (y no hay legado).
 *
 * Inyectable (`registro`/`configPort`) para tests; en prod usa los defaults.
 */
export async function gatewayCobrosPara(
  tenantId: string,
  registro: RegistroGateways = registroPorDefecto,
  configPort: ConfigCobrosPort = configCobrosPorDefecto,
): Promise<GatewayPagos> {
  const { proveedor, config } = await configPort.configDe(tenantId);
  return registro.gatewayPara(proveedor, tenantId, config);
}

/**
 * El gateway de UNA conexión concreta (la que firmó el aviso): lee el pago con la cuenta de esa
 * conexión y no con «la del negocio» en general. Sin token → `CobrosSinConexionError`.
 */
export async function gatewayCobrosDeConexion(
  tenantId: string,
  conexionId: string,
  registro: RegistroGateways = registroPorDefecto,
  deps: DepsConfigCobros = depsConfigCobrosDeLaBase,
): Promise<GatewayPagos> {
  const { proveedor, config } = await configDeConexion(deps, tenantId, conexionId);
  return registro.gatewayPara(proveedor, tenantId, config);
}

/**
 * SÓLO para el camino legado del webhook viejo (con `MP_MODO_LEGADO=1`): la cuenta de MP del
 * despliegue, que todavía no sabe de qué negocio es el pago. El llamador verifica el flag.
 */
export function gatewayLegadoDelDespliegue(
  env: Record<string, string | undefined> = process.env,
  registro: RegistroGateways = registroPorDefecto,
): GatewayPagos {
  const { proveedor, config } = configLegadoDesdeEntorno(env);
  return registro.gatewayPara(proveedor, "mp-webhook:cuenta-del-despliegue", config);
}
