/**
 * CORE PAGOS — registro de proveedores de gateway.
 *
 * Resuelve, por tenant y clave de proveedor, el `GatewayPagos` a usar. Es el
 * punto de extensión: sumar un proveedor = registrar su `FabricaGateway`, sin
 * tocar la ingesta ni el glue de cobros.
 *
 * NO conoce ningún proveedor concreto (no importa mercadopago): el glue de
 * cobros arma un registro y le registra los proveedores disponibles. Así la
 * abstracción no depende de sus implementaciones.
 */

import { GatewayPagos } from "./port";

/** Clave de proveedor (p.ej. "mercadopago"). */
export type ClaveProveedor = string;

/**
 * Fábrica de un gateway para un tenant. `config` es opaco (las credenciales son
 * específicas del proveedor; el registro no las interpreta). Un proveedor sin
 * credenciales suele devolver su stub (dev/test), nunca falla al construir.
 */
export type FabricaGateway = (tenantId: string, config?: unknown) => GatewayPagos;

/** No hay un proveedor registrado bajo esa clave. */
export class ProveedorPagoDesconocidoError extends Error {
  constructor(readonly proveedor: ClaveProveedor, disponibles: ClaveProveedor[]) {
    super(
      `Proveedor de pagos desconocido: "${proveedor}". ` +
        `Registrados: ${disponibles.length ? disponibles.join(", ") : "(ninguno)"}.`,
    );
    this.name = "ProveedorPagoDesconocidoError";
  }
}

/** Registro de proveedores de gateway (uno por proceso o por request, a gusto). */
export class RegistroGateways {
  private readonly fabricas = new Map<ClaveProveedor, FabricaGateway>();

  /** Registra (o pisa) la fábrica de un proveedor. Devuelve `this` (encadenable). */
  registrar(proveedor: ClaveProveedor, fabrica: FabricaGateway): this {
    this.fabricas.set(proveedor, fabrica);
    return this;
  }

  /** ¿Hay un proveedor registrado bajo esa clave? */
  tiene(proveedor: ClaveProveedor): boolean {
    return this.fabricas.has(proveedor);
  }

  /** Claves de los proveedores registrados (orden de inserción). */
  proveedores(): ClaveProveedor[] {
    return [...this.fabricas.keys()];
  }

  /**
   * Resuelve el gateway del `proveedor` para el `tenantId`. Lanza
   * `ProveedorPagoDesconocidoError` si la clave no está registrada.
   */
  gatewayPara(
    proveedor: ClaveProveedor,
    tenantId: string,
    config?: unknown,
  ): GatewayPagos {
    const fabrica = this.fabricas.get(proveedor);
    if (!fabrica) {
      throw new ProveedorPagoDesconocidoError(proveedor, this.proveedores());
    }
    return fabrica(tenantId, config);
  }
}
