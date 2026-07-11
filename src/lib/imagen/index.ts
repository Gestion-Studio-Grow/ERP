// Capacidad COMPARTIDA de generación de imágenes por IA — ORQUESTADOR.
// Punto de entrada único para toda la plataforma: `generarImagen(...)`. Todos los
// tenants (CH Estética, MAGRA, velas, pádel y futuros) la consumen igual; el
// proveedor concreto (fal / replicate / bfl) queda detrás de la interfaz
// ImageProvider, así que cambiarlo no toca a quien consume.
//
// Flujo: validar+sanitizar prompt → componer con el estilo del rubro → resolver
// proveedor → leer su clave del entorno (o FaltaKeyError claro) → generar → guardar.
//
// Seguridad: la clave se lee de variable de entorno, NUNCA se hardcodea ni se
// loguea. Sin la clave, esto lanza FaltaKeyError (error esperado) y no rompe build.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { componerPrompt } from "./presets";
import { crearFalProvider } from "./providers/fal";
import { crearReplicateProvider } from "./providers/replicate";
import { crearBflProvider } from "./providers/bfl";
import {
  ASPECT_RATIO_DEFAULT,
  FaltaKeyError,
  PROVIDER_DEFAULT,
  PromptInvalidoError,
  type GenerarImagenParams,
  type GenerarImagenResult,
  type ImageProvider,
  type ProviderId,
} from "./types";

export * from "./types";
export { componerPrompt, estiloParaRubro, ESTILOS } from "./presets";

// Límites de sanitización del prompt del usuario/caller.
const PROMPT_MIN = 3;
const PROMPT_MAX = 1500;

// Deja el prompt en una sola línea, sin caracteres de control, y valida largo.
// Devuelve el texto limpio o lanza PromptInvalidoError. Es la baranda de entrada:
// nada sucio llega al proveedor ni a los logs. Se filtra por CODEPOINT (sin
// literales de control en el fuente): tab/LF/CR → espacio; resto de controles C0
// y DEL (0x7F) → fuera; luego se colapsan espacios.
export function sanitizarPrompt(raw: unknown): string {
  if (typeof raw !== "string") throw new PromptInvalidoError("debe ser un string");
  const limpio = Array.from(raw)
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c === 0x09 || c === 0x0a || c === 0x0d) return " ";
      if (c < 0x20 || c === 0x7f) return "";
      return ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (limpio.length < PROMPT_MIN) throw new PromptInvalidoError(`muy corto (mínimo ${PROMPT_MIN} caracteres)`);
  if (limpio.length > PROMPT_MAX) throw new PromptInvalidoError(`muy largo (máximo ${PROMPT_MAX} caracteres)`);
  return limpio;
}

// Fábricas de proveedores por id. Registrar uno nuevo = una línea acá.
const FABRICAS: Record<ProviderId, () => ImageProvider> = {
  fal: () => crearFalProvider(),
  replicate: () => crearReplicateProvider(),
  bfl: () => crearBflProvider(),
};

export function resolverProvider(id: ProviderId = PROVIDER_DEFAULT): ImageProvider {
  const fabrica = FABRICAS[id];
  if (!fabrica) throw new Error(`Proveedor de imágenes desconocido: "${id}"`);
  return fabrica();
}

// Dependencias inyectables — para testear sin red ni disco. Los consumidores
// reales llaman `generarImagen(params)` sin segundo argumento (usa los defaults).
export interface GenerarImagenDeps {
  // Proveedor ya construido (para inyectar un mock en tests). Si se pasa, pisa a `params.provider`.
  provider?: ImageProvider;
  // Fuente de variables de entorno (default: process.env).
  env?: Record<string, string | undefined>;
  // Escritura a disco (default: node:fs/promises).
  writeFileImpl?: (path: string, data: Uint8Array) => Promise<void>;
  mkdirImpl?: (dir: string) => Promise<void>;
}

// Genera una imagen y la guarda en `outPath`. Devuelve metadatos del resultado.
// Lanza: PromptInvalidoError (prompt inválido), FaltaKeyError (falta la clave del
// proveedor), ProviderError (el proveedor falló). Ninguno filtra secretos.
export async function generarImagen(
  params: GenerarImagenParams,
  deps: GenerarImagenDeps = {},
): Promise<GenerarImagenResult> {
  const env = deps.env ?? process.env;
  const writeFileImpl = deps.writeFileImpl ?? ((p, d) => writeFile(p, d));
  const mkdirImpl = deps.mkdirImpl ?? ((d) => mkdir(d, { recursive: true }).then(() => undefined));

  // 1) Validar entrada dura.
  if (!params.outPath || typeof params.outPath !== "string") {
    throw new PromptInvalidoError("falta outPath (ruta de guardado)");
  }
  const promptLimpio = sanitizarPrompt(params.prompt);
  const aspectRatio = params.aspectRatio ?? ASPECT_RATIO_DEFAULT;

  // 2) Componer el prompt final con el estilo del rubro (o el override explícito).
  const promptFinal = componerPrompt({
    prompt: promptLimpio,
    rubro: params.rubro,
    aspectRatio,
    estiloOverride: params.estilo,
  });

  // 3) Resolver proveedor (mock inyectado > id de params > default fal).
  const provider = deps.provider ?? resolverProvider(params.provider);

  // 4) Leer la clave del entorno. Sin clave → error claro, NO rompe build/tests.
  const apiKey = env[provider.envVar];
  if (!apiKey || !apiKey.trim()) {
    throw new FaltaKeyError(provider.envVar, provider.id);
  }

  // 5) Generar (única parte que toca la red; solo corre con clave presente).
  const imagen = await provider.generate({ prompt: promptFinal, aspectRatio, apiKey });

  // 6) Guardar en disco, creando los directorios que falten.
  const dir = dirname(params.outPath);
  if (dir && dir !== ".") await mkdirImpl(dir);
  await writeFileImpl(params.outPath, imagen.data);

  return {
    outPath: params.outPath,
    provider: provider.id,
    promptFinal,
    contentType: imagen.contentType,
    bytes: imagen.data.byteLength,
  };
}
