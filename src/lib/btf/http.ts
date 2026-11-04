// Respuestas y errores de /api/btf/* según el contrato (docs/API.md de la célula): JSON siempre,
// `{ error, mensaje }` con 401/403/404/409/422/503.

export type CodigoError =
  | "no-encontrado"
  | "duplicado"
  | "invalido"
  | "prohibido"
  | "cupon"
  | "precio"
  | "no-autenticado"
  | "no-configurado";

const STATUS: Record<CodigoError, number> = {
  "no-autenticado": 401,
  prohibido: 403,
  "no-encontrado": 404,
  duplicado: 409,
  invalido: 422,
  cupon: 422,
  precio: 422,
  "no-configurado": 503,
};

export class ErrorBtf extends Error {
  constructor(
    public codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorBtf";
  }
  get status(): number {
    return STATUS[this.codigo];
  }
}

export function json(cuerpo: unknown, status = 200, cabeceras?: HeadersInit): Response {
  const h = new Headers(cabeceras);
  h.set("content-type", "application/json; charset=utf-8");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify(cuerpo), { status, headers: h });
}

export function errorJson(codigo: CodigoError, mensaje: string): Response {
  return json({ error: codigo, mensaje }, STATUS[codigo]);
}

function codigoPrisma(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

/** Envuelve un manejador: ErrorBtf → su status; tabla ausente (P2021) → 503; único (P2002) → 409. */
export async function manejar(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorBtf) return errorJson(e.codigo, e.message);
    const c = codigoPrisma(e);
    if (c === "P2021") return errorJson("no-configurado", "buscatufoto todavía no está configurado en este servidor.");
    if (c === "P2002") return errorJson("duplicado", "Ya existe un registro con ese dato.");
    if (c === "P2025") return errorJson("no-encontrado", "No existe.");
    // Nunca se loguea el cuerpo del pedido (puede traer contraseñas o tokens).
    console.error("[btf] error inesperado:", e instanceof Error ? e.name : typeof e);
    return json({ error: "interno", mensaje: "Algo falló. Probá de nuevo." }, 500);
  }
}

/** Cuerpo JSON como objeto; si no lo es → 422. */
export async function leerCuerpo(request: Request): Promise<Record<string, unknown>> {
  let v: unknown;
  try {
    v = await request.json();
  } catch {
    throw new ErrorBtf("invalido", "El cuerpo tiene que ser JSON.");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ErrorBtf("invalido", "El cuerpo tiene que ser un objeto JSON.");
  return v as Record<string, unknown>;
}

export function texto(v: unknown, campo: string, { max = 500, vacio = false } = {}): string {
  if (typeof v !== "string") throw new ErrorBtf("invalido", `Falta ${campo}.`);
  const s = v.trim();
  if (!vacio && !s) throw new ErrorBtf("invalido", `Falta ${campo}.`);
  if (s.length > max) throw new ErrorBtf("invalido", `${campo} es demasiado largo.`);
  return s;
}

export function entero(v: unknown, campo: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new ErrorBtf("invalido", `Revisá ${campo}.`);
  return v;
}
