// Superficie pública de la persistencia del vertical torneos (ADR-097, FASE 2).
export type { TorneoStore } from "./store";
export {
  TorneoNoEncontradoError,
  TablaTorneoNoMigradaError,
} from "./store";
export type { Mutacion, ResultadoPersistido } from "./aplicar";
export {
  aplicarMutacion,
  cargarResultado,
  borrarResultado,
  reprogramarPartido,
  marcarWO,
  crearYGuardar,
} from "./aplicar";
export { MemoriaTorneoStore } from "./memoria-store";
export { PrismaTorneoStore } from "./prisma-store";
export { torneosEnabled } from "./flag";
