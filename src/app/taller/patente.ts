// La patente mientras se escribe (sin base, sin React: la prueban los tests). Las reglas de verdad son las del
// módulo (src/lib/taller/core.ts: normalizarPatente / formatoPatente / mostrarPatente); acá sólo el «en vivo».
import { formatoPatente, normalizarPatente } from "@/lib/taller/core";

// Las cuatro chapas argentinas (core.ts:18-24): L = letra, D = dígito.
const MOLDES = ["LLLDDD", "LLDDDLL", "DDDLLL", "LDDDLLL"] as const;

/** «ab123c» → «AB 123 C»: un espacio en cada cambio letra↔número, como se lee en la chapa. Máx. 7 caracteres. */
export function patenteEnVivo(raw: string | null | undefined): string {
  return normalizarPatente(raw).slice(0, 7).replace(/([A-Z])(?=\d)|(\d)(?=[A-Z])/g, "$1$2 ");
}

/** ¿Lo escrito todavía puede terminar siendo una patente? «AB1» sí; «HOLA» no. */
export function puedeSerPatente(raw: string | null | undefined): boolean {
  const p = normalizarPatente(raw);
  if (!p) return true;
  return MOLDES.some(
    (m) => p.length <= m.length && [...p].every((c, i) => (m[i] === "L" ? /[A-Z]/.test(c) : /\d/.test(c))),
  );
}

/** Aviso (nunca bloqueo) cuando lo escrito no es ni puede llegar a ser una patente argentina. */
export function avisoPatente(raw: string | null | undefined): string | null {
  const p = normalizarPatente(raw);
  if (!p || formatoPatente(p)) return null;
  return puedeSerPatente(p) ? null : "No parece una patente argentina; igual podés seguir.";
}

// ── La nota del turno: la patente y el modelo viajan en `Appointment.notes` ───────────────────────────
// Un solo formato para escribirla (TurnoForm) y leerla (Tu turno). Al leer se toman SÓLO estos dos datos:
// el panel puede sumarle a la nota algo interno y eso no se muestra en la página pública del turno.

/** «Patente: AB 123 CD · Auto: VW Gol Trend 2015» (lo que falte, no va). */
export function notaDelAuto(patente: string, modelo: string): string {
  return [patente.trim() && `Patente: ${patente.trim()}`, modelo.trim() && `Auto: ${modelo.trim()}`].filter(Boolean).join(" · ");
}

/** Lo que la página pública muestra de la nota: la patente y el modelo, nada más. */
export function autoDeLaNota(nota: string | null | undefined): { patente: string | null; auto: string | null } {
  let patente: string | null = null;
  let auto: string | null = null;
  for (const parte of (nota ?? "").split(" · ")) {
    const m = /^(Patente|Auto): (.+)$/.exec(parte.trim());
    if (!m) continue;
    if (m[1] === "Patente" && !patente) patente = m[2].trim().slice(0, 12);
    if (m[1] === "Auto" && !auto) auto = m[2].trim().slice(0, 80);
  }
  return { patente, auto };
}
