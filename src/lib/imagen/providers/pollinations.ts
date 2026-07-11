// Adaptador Pollinations.ai — GRATIS y SIN API key. Proveedor DEFAULT: permite
// generar imágenes ya, a costo cero, para arrancar. Usa Flux por detrás.
//
// API: un HTTP GET simple, sin auth:
//   https://image.pollinations.ai/prompt/<prompt-url-encoded>?width=&height=&model=flux&nologo=true&seed=
// La respuesta ES el binario de la imagen (JPEG), no un JSON — se guarda directo.
//
// Al no necesitar clave, `envVar` es undefined: index.ts no exige ninguna variable
// de entorno y este adaptador funciona aunque no haya secretos configurados.

import {
  ProviderError,
  dimsFor,
  type ImageBytes,
  type ImageProvider,
  type ImageRequest,
} from "../types";

const BASE = "https://image.pollinations.ai/prompt/";

type FetchLike = typeof fetch;

export function crearPollinationsProvider(fetchImpl: FetchLike = fetch): ImageProvider {
  return {
    id: "pollinations",
    // Sin envVar → no requiere clave.
    async generate(req: ImageRequest): Promise<ImageBytes> {
      const { width, height } = dimsFor(req.aspectRatio);
      const params = new URLSearchParams({
        width: String(width),
        height: String(height),
        model: "flux",
        nologo: "true",
      });
      if (typeof req.seed === "number" && Number.isFinite(req.seed)) {
        params.set("seed", String(req.seed));
      }
      // El prompt va en el PATH, url-encoded. encodeURIComponent respeta la barra
      // como texto (la codifica), evitando que un "/" del prompt parta la ruta.
      const url = `${BASE}${encodeURIComponent(req.prompt)}?${params.toString()}`;

      const r = await fetchImpl(url, { signal: req.signal });
      if (!r.ok) throw new ProviderError("pollinations", `HTTP ${r.status} al generar`);

      const contentType = r.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) {
        throw new ProviderError("pollinations", `la respuesta no es una imagen (content-type ${contentType})`);
      }
      const data = new Uint8Array(await r.arrayBuffer());
      if (data.byteLength === 0) throw new ProviderError("pollinations", "la imagen vino vacía");
      return { data, contentType, ext: extDe(contentType) };
    },
  };
}

function extDe(contentType: string): string {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "jpg";
}
