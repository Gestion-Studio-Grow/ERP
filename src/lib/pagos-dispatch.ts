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

/**
 * Config de cobros por defecto de un tenant.
 *
 * PROVISIONAL (a confirmar con PMO): hoy todo tenant cobra por Mercado Pago y sin
 * credenciales en config ⇒ la fábrica devuelve el STUB. Es seguro: en prod el
 * webhook está detrás del flag de facturación (OFF) y no hay pagos sembrados.
 *
 * La versión real leerá del tenant (columna `Tenant.proveedorCobros` + store de
 * config de plugin con las credenciales cifradas at-rest). Ese cambio de schema
 * es del PMO — acá queda el asiento (`ConfigCobrosPort`) para enchufarlo sin
 * tocar la ingesta ni el handler.
 */
export const configCobrosPorDefecto: ConfigCobrosPort = {
  configDe(_tenantId: string): ConfigCobros {
    return { proveedor: CLAVE_MERCADOPAGO };
  },
};

/**
 * Resuelve el `GatewayPagos` de un tenant vía el registro de proveedores. Lanza
 * `ProveedorPagoDesconocidoError` si el tenant apunta a un proveedor no registrado.
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
