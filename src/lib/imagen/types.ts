// Capacidad COMPARTIDA de generación de imágenes por IA — tipos y contrato del
// proveedor. Vive en `src/lib/imagen/` para toda la plataforma (todos los tenants:
// CH Estética, MAGRA, velas, pádel y futuros), integrable vía API a demanda.
//
// El punto clave es la ABSTRACCIÓN: los consumidores hablan con `generarImagen()`
// (index.ts) y nunca con un proveedor concreto. Cambiar de fal.ai a Replicate o
// Black Forest Labs (BFL) es cambiar un adaptador, sin reescribir a quien consume.
//
// Este archivo NO toca la red ni lee secretos: es solo el contrato (tipos puros).

// --- Proveedores -------------------------------------------------------------

// Proveedores soportados. Default operativo: "fal" (fal.ai + FLUX1.1 [pro]).
export type ProviderId = "fal" | "replicate" | "bfl";

export const PROVIDER_DEFAULT: ProviderId = "fal";

// Relación de aspecto canónica del pedido. El adaptador la traduce a lo que su
// API entiende (fal usa un enum `image_size`; otros toman width/height).
export type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export const ASPECT_RATIOS: readonly AspectRatio[] = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;

export const ASPECT_RATIO_DEFAULT: AspectRatio = "1:1";

// --- Contrato del proveedor --------------------------------------------------

// Pedido ya normalizado que recibe un adaptador. El prompt llega COMPUESTO y
// SANITIZADO (index.ts ya aplicó el preset de rubro y validó el texto): el
// adaptador solo traduce y pega a su API.
export interface ImageRequest {
  // Prompt final (estilo de rubro + pedido específico), ya validado.
  prompt: string;
  aspectRatio: AspectRatio;
  // Credencial del proveedor. La resuelve index.ts desde variable de entorno y
  // la pasa acá; el adaptador NUNCA lee `process.env` ni loguea esta clave.
  apiKey: string;
  // Aborto cooperativo (timeouts / cancelación del caller). Opcional.
  signal?: AbortSignal;
}

// Bytes de la imagen generada + metadatos mínimos para guardarla en disco.
export interface ImageBytes {
  data: Uint8Array;
  // MIME real devuelto por el proveedor (p. ej. "image/png", "image/webp").
  contentType: string;
  // Extensión sugerida SIN punto (p. ej. "png", "webp"), derivada del contentType.
  ext: string;
}

// Contrato que implementa cada adaptador (fal / replicate / bfl). Es lo único
// que el orquestador conoce del proveedor: id + cómo generar.
export interface ImageProvider {
  readonly id: ProviderId;
  // Nombre de la variable de entorno de la que sale su credencial (p. ej.
  // "FAL_KEY"). index.ts la usa para el mensaje de error cuando falta la clave.
  readonly envVar: string;
  generate(req: ImageRequest): Promise<ImageBytes>;
}

// --- API pública del orquestador ---------------------------------------------

// Parámetros de `generarImagen()` — la función que consume toda la plataforma.
export interface GenerarImagenParams {
  // Pedido específico ("hero de spa con toallas y velas, luz de mañana").
  prompt: string;
  // Dónde guardar el archivo resultante (se crean los directorios que falten).
  outPath: string;
  // Relación de aspecto. Default "1:1".
  aspectRatio?: AspectRatio;
  // Rubro del tenant (p. ej. "estetica", "carniceria", "velas", "padel"): elige
  // el ESTILO BASE que envuelve al prompt. Si falta, cae al estilo genérico.
  rubro?: string;
  // Slug del tenant, solo como metadato/trazabilidad (no dispara red). Opcional.
  tenant?: string;
  // Proveedor a usar. Default "fal".
  provider?: ProviderId;
  // Estilo explícito que PISA al preset de rubro (escape hatch para casos puntuales).
  estilo?: string;
}

// Resultado de una generación exitosa.
export interface GenerarImagenResult {
  outPath: string;
  provider: ProviderId;
  // Prompt final compuesto (útil para logs/depuración; sin secretos).
  promptFinal: string;
  contentType: string;
  bytes: number;
}

// --- Errores tipados ---------------------------------------------------------

// Falta la credencial del proveedor en el entorno. Es un error ESPERADO (no un
// bug): el mensaje dice qué variable setear y NO rompe el build. Nunca incluye
// el valor de ninguna clave.
export class FaltaKeyError extends Error {
  constructor(public readonly envVar: string, public readonly provider: ProviderId) {
    super(
      `Falta la variable de entorno ${envVar} para el proveedor de imágenes "${provider}". ` +
        `Seteala en .env.local (local) y en Vercel (deploy). Ver docs/imagen-ia.md. ` +
        `Sin la clave, la generación de imágenes queda inerte (no rompe build ni tests).`,
    );
    this.name = "FaltaKeyError";
  }
}

// El prompt es inválido (vacío, no-string o fuera de límites) tras sanitizar.
export class PromptInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Prompt inválido para generar imagen: ${motivo}.`);
    this.name = "PromptInvalidoError";
  }
}

// El proveedor respondió mal (HTTP != 2xx, sin imagen, etc.). Nunca lleva la clave.
export class ProviderError extends Error {
  constructor(public readonly provider: ProviderId, motivo: string) {
    super(`El proveedor de imágenes "${provider}" falló: ${motivo}.`);
    this.name = "ProviderError";
  }
}
