// CONSOLA DE LA CUADRILLA · lo común de las acciones del panel y de la consola GSG (sin servidor: testeable).
import { NoPermitido } from "./consola-core";

/** Lo que va a la URL de vuelta: el filtro que tenía la persona, más el resultado. */
export function volverA(base: string, fd: FormData, extra: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const k of ["negocio", "agente", "estado", "tipo", "hilo", "en"]) {
    const v = fd.get(`f_${k}`);
    if (typeof v === "string" && v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
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
