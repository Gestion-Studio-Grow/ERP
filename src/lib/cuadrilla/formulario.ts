// CONSOLA DE LA CUADRILLA · lo común de las acciones del panel y de la consola GSG (sin servidor: testeable).
import { createHmac, timingSafeEqual } from "node:crypto";
import { NoPermitido } from "./consola-core";

// El resultado de una acción vuelve en la URL (los formularios andan sin JS). Para que nadie pueda armar un
// link con un «aviso» falso de la consola (`?error=Tu cuenta se suspende: escribí al …`), el texto va firmado
// con el secreto del servidor y la página sólo muestra el que trae su firma. Sin secreto, no se muestra nada.
const claveDeAvisos = () => process.env.AUTH_SECRET || process.env.OPERATOR_SECRET || "";

export function firmaDelAviso(ok: string, error: string, clave = claveDeAvisos()): string {
  if (!clave) return "";
  return createHmac("sha256", clave).update(`cuadrilla-aviso|ok=${ok}|error=${error}`).digest("base64url").slice(0, 32);
}

/** El aviso de la URL, sólo si la firma coincide; si no, ninguno. */
export function avisoDeLaUrl(
  sp: { ok?: string; error?: string; f?: string },
  clave = claveDeAvisos(),
): { ok?: string; error?: string } {
  const ok = sp.ok ?? "";
  const error = sp.error ?? "";
  if (!ok && !error) return {};
  const esperada = firmaDelAviso(ok, error, clave);
  const llega = sp.f ?? "";
  if (!esperada || llega.length !== esperada.length || !timingSafeEqual(Buffer.from(llega), Buffer.from(esperada))) return {};
  return { ok: ok || undefined, error: error || undefined };
}

/** Las secciones que se abren al volver: el celular baja directo ahí en vez de quedar arriba de todo. */
export const ANCLAS = ["decision", "hilo", "pedidos", "bandeja"] as const;

/** El ancla que pidió el formulario (campo oculto `ancla`), sólo si es una de las conocidas. */
function anclaDel(fd: FormData): string | undefined {
  const v = fd.get("ancla");
  return typeof v === "string" && (ANCLAS as readonly string[]).includes(v) ? v : undefined;
}

/** Lo que va a la URL de vuelta: el filtro que tenía la persona, más el resultado (firmado). */
export function volverA(base: string, fd: FormData, extra: Record<string, string | undefined>, ancla?: string): string {
  const q = new URLSearchParams();
  for (const k of ["negocio", "agente", "estado", "tipo", "hilo", "en", "pedidos"]) {
    const v = fd.get(`f_${k}`);
    if (typeof v === "string" && v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const ok = q.get("ok") ?? "";
  const error = q.get("error") ?? "";
  if (ok || error) {
    const f = firmaDelAviso(ok, error);
    if (f) q.set("f", f);
    else {
      q.delete("ok");
      q.delete("error");
    }
  }
  const s = q.toString();
  const destino = ancla ?? anclaDel(fd);
  const hash = destino ? `#${destino}` : "";
  return (s ? `${base}?${s}` : base) + hash;
}

/** "tenantId:id" de las casillas del lote → { tenantId: [ids] }. Las que no tienen forma se ignoran. */
export function elegidasPorNegocio(valores: FormDataEntryValue[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const i = v.indexOf(":");
    if (i <= 0 || i === v.length - 1) continue;
    const t = v.slice(0, i);
    out.set(t, [...(out.get(t) ?? []), v.slice(i + 1)]);
  }
  return out;
}

/** El error que se le muestra a la persona: el motivo si es de permisos, un texto fijo si es de la base. */
export function motivoDelError(e: unknown): string {
  if (e instanceof NoPermitido) return e.message;
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022") return "Falta un paso de base de datos para la consola de la cuadrilla (migración pendiente).";
  console.error("[cuadrilla]", e);
  return "No se pudo hacer. Probá de nuevo en un rato.";
}

export function texto(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}
