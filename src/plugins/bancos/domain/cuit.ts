/**
 * Validación de CUIT/CUIL — RE-EXPORT desde el Core fiscal.
 *
 * La implementación se movió a `src/lib/fiscal/cuit.ts` (dominio fiscal del Core):
 * es una regla fiscal argentina que el Core necesita, no lógica de bancos. El plugin
 * la re-exporta desde el Core (dirección plugin→core, permitida por ADR-002) para no
 * romper a sus consumidores (`ColaRevision.tsx`, `index.ts`).
 */
export { cuitValido, normalizarCuit } from "@/lib/fiscal/cuit";
