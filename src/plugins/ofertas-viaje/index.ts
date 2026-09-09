/**
 * OFERTAS DE VIAJE — superficie pública del conector de vuelos y hoteles.
 *
 * El módulo "Presupuestos de viaje" (`src/lib/viajes`) importa SOLO de acá. Los
 * proveedores concretos (Amadeus, stub) se registran en `registroPorDefecto()`;
 * el resto del sistema habla con `ProveedorOfertas` y nunca sabe cuál respondió.
 */

export * from "./port";
export {
  RegistroProveedoresOfertas,
  ProveedorOfertasDesconocidoError,
  type ClaveProveedorOfertas,
  type FabricaProveedorOfertas,
} from "./registry";
export { StubProveedorOfertas, CLAVE_STUB } from "./stub";
export {
  claveBusqueda,
  diaDe,
  MemoriaCacheOfertas,
  MemoriaControlDeCuota,
  ProveedorConCache,
  CuotaAgotadaError,
  TTL_VUELOS_MS,
  TTL_HOTELES_MS,
  type CacheOfertas,
  type ControlDeCuota,
  type DecisionCuota,
  type TipoBusqueda,
} from "./cache";
export {
  AmadeusProveedorOfertas,
  CLAVE_AMADEUS,
  configAmadeusDesdeEnv,
  type ConfigAmadeus,
  type AmbienteAmadeus,
} from "./amadeus/adapter";

import { RegistroProveedoresOfertas } from "./registry";
import { StubProveedorOfertas, CLAVE_STUB } from "./stub";
import { AmadeusProveedorOfertas, CLAVE_AMADEUS, configAmadeusDesdeEnv, type ConfigAmadeus } from "./amadeus/adapter";

/**
 * Registro con los proveedores disponibles hoy:
 *  - "stub": siempre operable (sin red).
 *  - "amadeus": operable solo si hay credenciales (config explícita o env).
 */
export function registroPorDefecto(
  env: Record<string, string | undefined> = process.env,
): RegistroProveedoresOfertas {
  return new RegistroProveedoresOfertas()
    .registrar(CLAVE_STUB, () => new StubProveedorOfertas())
    .registrar(CLAVE_AMADEUS, (_tenantId, config) => {
      const cfg = (config as ConfigAmadeus | undefined) ?? configAmadeusDesdeEnv(env);
      return cfg ? new AmadeusProveedorOfertas(cfg) : null;
    });
}
