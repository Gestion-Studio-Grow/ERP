// Capacidad COMPARTIDA de generación de imágenes por IA — tipos y contrato del
// proveedor. Vive en `src/lib/imagen/` para toda la plataforma (todos los tenants:
// CH Estética, MAGRA, velas, pádel y futuros), integrable vía API a demanda.
//
// El punto clave es la ABSTRACCIÓN: los consumidores hablan con `generarImagen()`
// (index.ts) y nunca con un proveedor concreto. Cambiar de Pollinations a Gemini,
// fal, Replicate o BFL es cambiar un adaptador, sin reescribir a quien consume.
//
// Este archivo NO toca la red ni lee secretos: es solo el contrato (tipos puros).

// --- Proveedores -------------------------------------------------------------

// Proveedores soportados:
//   pollinations — GRATIS, SIN key (Flux por detrás). Default para arrancar ya.
//   gemini       — free tier CON key (GEMINI_API_KEY / Google AI Studio), más control.
//   fal          — pago, FLUX1.1 [pro] (key FAL_KEY), calidad tope.
//   replicate/bfl— opcionales (scaffold).
export type ProviderId = "pollinations" | "gemini" | "fal" | "replicate" | "bfl";

// Default operativo: pollinations (gratis y sin key → se puede generar sin costo).
export const PROVIDER_DEFAULT: ProviderId = "pollinations";

// Relación de aspecto canónica del pedido. El adaptador la traduce a lo que su
// API entiende (fal usa un enum `image_size`; pollinations/gemini toman px).
export type AspectRatio = "1:1" | "4:3" | "3:4" | "4:5" | "5:4" | "16:9" | "9:16";

export const ASPECT_RATIOS: readonly AspectRatio[] = ["1:1", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"] as const;

export const ASPECT_RATIO_DEFAULT: AspectRatio = "1:1";

// Dimensiones en píxeles por relación de aspecto (lado largo ~1280, múltiplos de 8
// para los modelos difusión). Providers que piden width/height (pollinations,
// gemini) las usan; fal las ignora y usa su enum.
export const ASPECT_DIMS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:3": { width: 1280, height: 960 },
  "3:4": { width: 960, height: 1280 },
  "4:5": { width: 1024, height: 1280 },
  "5:4": { width: 1280, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
};

export function dimsFor(aspectRatio: AspectRatio): { width: number; height: number } {
  return ASPECT_DIMS[aspectRatio] ?? ASPECT_DIMS["1:1"];
}

// --- Contrato del proveedor --------------------------------------------------

// Pedido ya normalizado que recibe un adaptador. El prompt llega COMPUESTO y
// SANITIZADO (index.ts ya aplicó el preset de rubro y validó el texto): el
// adaptador solo traduce y pega a su API.
export interface ImageRequest {
  // Prompt final (estilo de rubro + pedido específico), ya validado.
  prompt: string;
  aspectRatio: AspectRatio;
  // Credencial del proveedor. La resuelve index.ts desde variable de entorno y la
  // pasa acá; el adaptador NUNCA la loguea. Undefined para proveedores sin key
  // (pollinations).
  apiKey?: string;
  // Semilla opcional para reproducibilidad/variación (proveedores que la soporten).
  seed?: number;
  // Aborto cooperativo (timeouts / cancelación del caller). Opcional.
  signal?: AbortSignal;
}

// Bytes de la imagen generada + metadatos mínimos para guardarla en disco.
export interface ImageBytes {
  data: Uint8Array;
  // MIME real devuelto por el proveedor (p. ej. "image/png", "image/jpeg", "image/webp").
  contentType: string;
  // Extensión sugerida SIN punto (p. ej. "png", "jpg", "webp"), derivada del contentType.
  ext: string;
}

// Contrato que implementa cada adaptador (pollinations / gemini / fal / …). Es lo
// único que el orquestador conoce del proveedor: id + si necesita clave + generar.
export interface ImageProvider {
  readonly id: ProviderId;
  // Nombre de la variable de entorno de la que sale su credencial (p. ej. "FAL_KEY").
  // UNDEFINED = el proveedor NO necesita clave (pollinations). index.ts usa esto
  // para decidir si exige la key y para el mensaje de error cuando falta.
  readonly envVar?: string;
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
  // Proveedor a usar. Default "pollinations" (gratis, sin key).
  provider?: ProviderId;
  // Estilo explícito que PISA al preset de rubro (escape hatch para casos puntuales).
  estilo?: string;
  // Semilla opcional (reproducibilidad).
  seed?: number;
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
// el valor de ninguna clave. (No aplica a pollinations, que no usa clave.)
export class FaltaKeyError extends Error {
  constructor(public readonly envVar: string, public readonly provider: ProviderId) {
    super(
      `Falta la variable de entorno ${envVar} para el proveedor de imágenes "${provider}". ` +
        `Seteala en .env.local (local) y en Vercel (deploy). Ver docs/imagen-ia.md. ` +
        `Tip: el proveedor "pollinations" es gratis y NO necesita clave (es el default).`,
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
