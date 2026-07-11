// Adaptador Black Forest Labs (BFL) — SCAFFOLD. BFL es el creador de FLUX; su API
// directa es la tercera opción de proveedor. Implementa el contrato ImageProvider
// (ver ../types.ts) para intercambiarse sin tocar a los consumidores. Falta solo
// completar la llamada HTTP concreta cuando se decida activarlo.
//
// Credencial: variable de entorno BFL_API_KEY. La clave llega por `req.apiKey` y
// NUNCA se loguea.

import { ProviderError, type ImageBytes, type ImageProvider, type ImageRequest } from "../types";

type FetchLike = typeof fetch;

export function crearBflProvider(_fetchImpl: FetchLike = fetch): ImageProvider {
  return {
    id: "bfl",
    envVar: "BFL_API_KEY",
    async generate(_req: ImageRequest): Promise<ImageBytes> {
      // TODO(activar BFL): POST https://api.bfl.ml/v1/flux-pro-1.1 con el prompt y
      // el tamaño, poll del resultado y descarga. Análogo al adaptador fal; se deja
      // sin implementar a propósito (default = fal, sin wiring muerto).
      throw new ProviderError(
        "bfl",
        "adaptador no implementado todavía (scaffold). Usá el proveedor default 'fal' o completá crearBflProvider()",
      );
    },
  };
}
