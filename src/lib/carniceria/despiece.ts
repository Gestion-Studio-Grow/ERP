// ============================================================================
// Carnicería — DESPIECE / rendimiento: lógica pura. Entra una media res (peso +
// costo), salen cortes (peso c/u); se calcula RENDIMIENTO por corte, MERMA total y
// el COSTO REAL por kilo vendible (donde se gana o se pierde plata en la carne).
// Sin DB → testeable. Persistencia (SQL crudo, tolerante a schema) en
// despiece-actions.ts; tablas en la migración Gate 2 (ProcessingRun/Output).
// ============================================================================

export interface DespieceOutput {
  name: string;
  weightKg: number;
}

export interface DespieceInput {
  inputWeightKg: number;
  inputCost: number;
  outputs: DespieceOutput[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Kilos totales obtenidos (suma de los cortes). Puro. */
export function totalOutputKg(outputs: DespieceOutput[]): number {
  return round3(outputs.reduce((s, o) => s + (o.weightKg > 0 ? o.weightKg : 0), 0));
}

/** Rendimiento de un corte = pesoCorte / pesoEntrada (0..1). 0 si la entrada es 0. */
export function yieldPct(outputWeightKg: number, inputWeightKg: number): number {
  if (!inputWeightKg || inputWeightKg <= 0) return 0;
  return outputWeightKg / inputWeightKg;
}

/** Merma (kg) = pesoEntrada − Σ pesosCortes (grasa/hueso/pérdida). Puede ser NEGATIVA
 *  si se declararon más kilos de los que entraron (error de carga → la UI lo marca). */
export function mermaKg(input: DespieceInput): number {
  return round3(input.inputWeightKg - totalOutputKg(input.outputs));
}

/** Merma como fracción de la entrada (0..1). 0 si la entrada es 0. */
export function mermaPct(input: DespieceInput): number {
  if (!input.inputWeightKg || input.inputWeightKg <= 0) return 0;
  return mermaKg(input) / input.inputWeightKg;
}

/**
 * Costo real por kilo VENDIBLE = costoEntrada / kilosObtenidos. Es MAYOR que costo/pesoEntrada
 * porque la merma (grasa/hueso) no se vende pero se pagó: su costo se reparte entre los cortes
 * que sí se venden. null si no hay costo o no hay kilos obtenidos. Es el costo honesto por corte.
 */
export function costPerSellableKg(input: DespieceInput): number | null {
  const out = totalOutputKg(input.outputs);
  if (!input.inputCost || input.inputCost <= 0) return null;
  if (out <= 0) return null;
  return round2(input.inputCost / out);
}

export interface OutputAnalysis {
  name: string;
  weightKg: number;
  yieldPct: number; // 0..1 sobre el peso de entrada
  sharePct: number; // 0..1 sobre los kilos obtenidos (participación del corte)
  costShare: number | null; // costo asignado a este corte (prorrateo por kilo vendible)
}

export interface DespieceAnalysis {
  inputWeightKg: number;
  inputCost: number;
  totalOutputKg: number;
  mermaKg: number;
  mermaPct: number;
  overDeclared: boolean; // Σcortes > entrada → carga inconsistente
  costPerSellableKg: number | null;
  outputs: OutputAnalysis[];
}

/** Analiza un despiece completo: rendimiento y costo real por corte + merma total. Puro. */
export function analyzeDespiece(input: DespieceInput): DespieceAnalysis {
  const out = totalOutputKg(input.outputs);
  const cpk = costPerSellableKg(input);
  const merma = mermaKg(input);
  return {
    inputWeightKg: round3(input.inputWeightKg),
    inputCost: round2(input.inputCost),
    totalOutputKg: out,
    mermaKg: merma,
    mermaPct: mermaPct(input),
    overDeclared: merma < 0,
    costPerSellableKg: cpk,
    outputs: input.outputs.map((o) => ({
      name: o.name,
      weightKg: round3(o.weightKg),
      yieldPct: yieldPct(o.weightKg, input.inputWeightKg),
      sharePct: out > 0 ? o.weightKg / out : 0,
      costShare: cpk == null ? null : round2(cpk * o.weightKg),
    })),
  };
}
