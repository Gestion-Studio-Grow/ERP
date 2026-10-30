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
