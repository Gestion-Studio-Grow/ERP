// Ficha técnica de color (paquete Peluquerías, T4). Reglas puras, sin base.
// SÓLO datos técnicos: tono, fórmula, oxidante, tiempo de pose, profesional y notas técnicas.
// A propósito NO hay campos de salud ni alergias (condición del dueño vía ORQ-006).

/** Los rubros que ven la ficha de color. El resto (CH con blueprint null incluido) no ve nada. */
const RUBROS_CON_FICHA_DE_COLOR = new Set(["peluqueria", "barberia"]);

export function rubroConFichaDeColor(blueprintId: string | null | undefined): boolean {
  return !!blueprintId && RUBROS_CON_FICHA_DE_COLOR.has(blueprintId);
}

/** Volúmenes de oxidante permitidos (mismo CHECK que la migración 20261110120000_ficha_color). */
export const OXIDANTES = [10, 20, 30, 40] as const;
export const TOPES = { tono: 80, formula: 500, notas: 500, profesional: 80, tiempoMax: 240 } as const;

export type FichaColorDatos = {
  tono: string;
  formula: string;
  oxidante: number | null;
  tiempoPose: number | null;
  profesional: string | null;
  notas: string | null;
};

export type ResultadoValidacion = { ok: true; datos: FichaColorDatos } | { ok: false; error: string };

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function enteroOpcional(v: unknown): number | null | "invalido" {
  const t = texto(v);
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return "invalido";
  return Number(t);
}

export function validarFichaColor(input: Record<string, unknown>): ResultadoValidacion {
  const tono = texto(input.tono);
  const formula = texto(input.formula);
  const profesional = texto(input.profesional);
  const notas = texto(input.notas);
  if (!tono) return { ok: false, error: "Falta el tono." };
  if (tono.length > TOPES.tono) return { ok: false, error: `El tono no puede pasar de ${TOPES.tono} caracteres.` };
  if (!formula) return { ok: false, error: "Falta la fórmula." };
  if (formula.length > TOPES.formula) return { ok: false, error: `La fórmula no puede pasar de ${TOPES.formula} caracteres.` };
  if (notas.length > TOPES.notas) return { ok: false, error: `Las notas no pueden pasar de ${TOPES.notas} caracteres.` };
  if (profesional.length > TOPES.profesional) return { ok: false, error: "El nombre del profesional es demasiado largo." };

  const oxidante = enteroOpcional(input.oxidante);
  if (oxidante === "invalido" || (oxidante !== null && !(OXIDANTES as readonly number[]).includes(oxidante))) {
    return { ok: false, error: "El oxidante tiene que ser de 10, 20, 30 o 40 volúmenes." };
  }
  const tiempoPose = enteroOpcional(input.tiempoPose);
  if (tiempoPose === "invalido" || (tiempoPose !== null && (tiempoPose < 1 || tiempoPose > TOPES.tiempoMax))) {
    return { ok: false, error: `El tiempo de pose va de 1 a ${TOPES.tiempoMax} minutos.` };
  }
  return {
    ok: true,
    datos: { tono, formula, oxidante, tiempoPose, profesional: profesional || null, notas: notas || null },
  };
}

/** P2021 (tabla no existe), P2022 (columna) o 42P01 crudo: la migración todavía no se aplicó. */
export function esMigracionPendiente(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string } } | null;
  const code = err?.code;
  return code === "P2021" || code === "P2022" || code === "42P01" || err?.meta?.code === "42P01";
}
