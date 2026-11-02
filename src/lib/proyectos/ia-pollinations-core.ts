// Imágenes por Pollinations, el mismo servicio que usa Azimut. No lleva clave: el pedido viaja en la dirección. Puro, para probarlo sin red.

const URL_BASE = "https://image.pollinations.ai/prompt/";
const MAX_PEDIDO = 900;
const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
type TipoImagen = (typeof TIPOS)[number];

export function urlPollinations(pedido: string, semilla: number): string {
  const texto = pedido.replace(/\s+/g, " ").trim().slice(0, MAX_PEDIDO);
  return `${URL_BASE}${encodeURIComponent(texto)}?width=1024&height=576&nologo=true&seed=${semilla}`;
}

/** Sólo imágenes que no pueden llevar código: nada de SVG ni HTML. */
export function tipoDeImagen(contentType: string | null): TipoImagen | null {
  const t = contentType?.split(";")[0]?.trim().toLowerCase();
  return TIPOS.find((x) => x === t) ?? null;
}

export const aDataUri = (tipo: TipoImagen, bytes: Uint8Array): string => `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
