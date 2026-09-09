/**
 * OFERTAS DE VIAJE — registro de proveedores.
 *
 * Resuelve, por clave, el `ProveedorOfertas` a usar. Punto de extensión: sumar un
 * proveedor = registrar su fábrica, sin tocar el core de presupuestos ni las
 * actions. No conoce ningún proveedor concreto (mismo molde que
 * `src/plugins/pagos/registry.ts`).
 */

import type { ProveedorOfertas } from "./port";

export type ClaveProveedorOfertas = string;

/**
 * Fábrica de un proveedor para un tenant. `config` es opaco (credenciales del
 * proveedor; el registro no las interpreta). Sin credenciales, un proveedor real
 * debe devolver `null` (no hay cómo operar) — nunca lanzar al construir.
 */
export type FabricaProveedorOfertas = (
  tenantId: string,
  config?: unknown,
) => ProveedorOfertas | null;

export class ProveedorOfertasDesconocidoError extends Error {
  constructor(readonly proveedor: ClaveProveedorOfertas, disponibles: ClaveProveedorOfertas[]) {
    super(
      `Proveedor de ofertas desconocido: "${proveedor}". ` +
        `Registrados: ${disponibles.length ? disponibles.join(", ") : "(ninguno)"}.`,
    );
    this.name = "ProveedorOfertasDesconocidoError";
  }
}

export class RegistroProveedoresOfertas {
  private readonly fabricas = new Map<ClaveProveedorOfertas, FabricaProveedorOfertas>();

  registrar(clave: ClaveProveedorOfertas, fabrica: FabricaProveedorOfertas): this {
    this.fabricas.set(clave, fabrica);
    return this;
  }

  tiene(clave: ClaveProveedorOfertas): boolean {
    return this.fabricas.has(clave);
  }

  proveedores(): ClaveProveedorOfertas[] {
    return [...this.fabricas.keys()];
  }

  /**
   * Resuelve el proveedor `clave` para el tenant. Lanza si la clave no está
   * registrada; devuelve `null` si el proveedor existe pero no puede operar
   * (sin credenciales) — el llamador decide el fallback (p.ej. el stub).
   */
  proveedorPara(
    clave: ClaveProveedorOfertas,
    tenantId: string,
    config?: unknown,
  ): ProveedorOfertas | null {
    const fabrica = this.fabricas.get(clave);
    if (!fabrica) throw new ProveedorOfertasDesconocidoError(clave, this.proveedores());
    return fabrica(tenantId, config);
  }
}
