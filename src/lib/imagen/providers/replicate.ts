// Adaptador Replicate — SCAFFOLD. Implementa el contrato ImageProvider para poder
// cambiar de proveedor sin tocar a los consumidores (ver ../types.ts). El wiring
// del pipeline (índice → orquestador → guardado) ya funciona con este adaptador;
// falta solo completar la llamada HTTP concreta a la API de Replicate cuando se
// decida activarlo (modelo FLUX equivalente, p. ej. black-forest-labs/flux-1.1-pro).
//
// Credencial: variable de entorno REPLICATE_API_TOKEN. Igual que fal, la clave
// llega por `req.apiKey` y NUNCA se loguea.

import { ProviderError, type ImageBytes, type ImageProvider, type ImageRequest } from "../types";

type FetchLike = typeof fetch;

export function crearReplicateProvider(_fetchImpl: FetchLike = fetch): ImageProvider {
  return {
    id: "replicate",
    envVar: "REPLICATE_API_TOKEN",
    async generate(_req: ImageRequest): Promise<ImageBytes> {
      // TODO(activar Replicate): POST https://api.replicate.com/v1/predictions con
      // el modelo FLUX correspondiente, poll de la predicción y descarga del output.
      // La forma es análoga al adaptador fal; se deja sin implementar a propósito
      // porque el proveedor default es fal y no queremos wiring muerto que confunda.
      throw new ProviderError(
        "replicate",
        "adaptador no implementado todavía (scaffold). Usá el proveedor default 'fal' o completá crearReplicateProvider()",
      );
    },
  };
}
