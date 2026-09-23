// ============================================================================
// Carnicería — DESPIECE / rendimiento: lógica pura. Entra una pieza (media res, cuarto,
// pieza al vacío) con su peso y su costo, salen cortes (peso c/u); se calcula RENDIMIENTO
// por corte, MERMA total y el COSTO de cada corte (donde se gana o se pierde plata en la
// carne). Sin DB → testeable. Persistencia (SQL crudo, tolerante a schema) en
// despiece-registro.ts (escritura) y despiece-loader.ts (lectura); tablas en la migración
// Gate 2 (ProcessingRun/Output).
// ============================================================================
//
// CÓMO SE COSTEA CADA CORTE (ola 3). Antes el costo de la pieza se repartía PAREJO POR KILO:
// el lomo y el osobuco salían al mismo costo por kilo, así que el margen del lomo parecía
// enorme y el del osobuco, negativo. Ninguno de los dos números era cierto: una media res
// se compra entera y lo que cada corte "carga" del costo es proporcional a lo que se vende.
// Ahora se reparte por VALOR RELATIVO DE VENTA:
//
//   costo del corte i = costo de la pieza × (kg_i × precio_i) / Σ (kg_j × precio_j)
//
// Hueso, grasa y todo lo que sale sin precio de venta vale $0 y no carga costo. Si NINGÚN
// corte tiene precio (una carga sin catálogo todavía), se vuelve al reparto parejo por kilo
// vendible y se dice en pantalla por qué. OJO, cambia números frente al cliente: sube el costo
// del lomo y baja el del osobuco; se le avisa a MAGRA antes de desplegarlo.

export interface DespieceOutput {
  name: string;
  weightKg: number;
  /** Precio de venta por kilo del corte (del catálogo). null/ausente = no se vende (hueso, grasa). */
  precioPorKg?: number | null;
}

export interface DespieceInput {
  inputWeightKg: number;
  inputCost: number;
  outputs: DespieceOutput[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const positivo = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

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
 * Costo PROMEDIO por kilo vendible = costoEntrada / kilosObtenidos. Es MAYOR que
 * costo/pesoEntrada porque la merma (grasa/hueso) no se vende pero se pagó. Sirve de resumen
 * de la corrida; el costo de CADA corte sale de `costearPorValorDeVenta`. null si no hay costo
 * o no hay kilos obtenidos.
 */
export function costPerSellableKg(input: DespieceInput): number | null {
  const out = totalOutputKg(input.outputs);
  if (!input.inputCost || input.inputCost <= 0) return null;
  if (out <= 0) return null;
  return round2(input.inputCost / out);
}

// ── Costo de cada corte por valor relativo de venta ─────────────────────────

/**
 * `valor-de-venta`: la regla (al menos un corte tiene precio).
 * `por-kilo`: ningún corte tiene precio → parejo por kilo vendible, como antes.
 * `sin-costo`: la pieza no tiene costo → ningún corte lo tiene.
 */
export type MetodoDeCosteo = "valor-de-venta" | "por-kilo" | "sin-costo";

export interface CorteCosteado {
  name: string;
  weightKg: number;
  /** kg × precio por kilo; 0 si no se vende. */
  valorDeVenta: number;
  /** Parte del costo de la pieza que carga este corte (null sin costo). */
  costoTotal: number | null;
  /** Costo por kilo del corte, el que viaja al stock (null sin costo). */
  costoPorKg: number | null;
}

/**
 * Reparte el costo de la pieza entre los cortes por su valor de venta. PURA.
 * Los centavos que se pierden al redondear cada corte se le suman al de mayor valor, así la
 * suma de los `costoTotal` da exactamente el costo de la pieza. OJO: al stock entra el costo
 * POR KILO de cada corte, redondeado a centavos, así que kilos × costo por kilo puede diferir
 * del costo de la pieza en uno o dos centavos (medido en QA: 450.000 → 450.000,01).
 */
export function costearPorValorDeVenta(
  inputCost: number,
  outputs: readonly DespieceOutput[],
): { metodo: MetodoDeCosteo; cortes: CorteCosteado[] } {
  const validos = outputs.map((o) => ({ ...o, weightKg: positivo(o.weightKg) ? o.weightKg : 0 }));
  const valores = validos.map((o) => (positivo(o.precioPorKg) && o.weightKg > 0 ? round2(o.weightKg * o.precioPorKg) : 0));
  const base = (o: DespieceOutput, i: number) => ({ name: o.name, weightKg: round3(o.weightKg), valorDeVenta: valores[i] });

  const costo = positivo(inputCost) ? round2(inputCost) : 0;
  const kilos = validos.reduce((s, o) => s + o.weightKg, 0);
  if (costo === 0 || kilos <= 0) {
    return { metodo: "sin-costo", cortes: validos.map((o, i) => ({ ...base(o, i), costoTotal: null, costoPorKg: null })) };
  }

  const sumaValor = valores.reduce((s, v) => s + v, 0);
  if (sumaValor <= 0) {
    // Nadie tiene precio: el reparto de antes, parejo por kilo vendible, pero declarado.
    const porKg = round2(costo / kilos);
    return {
      metodo: "por-kilo",
      cortes: validos.map((o, i) => ({
        ...base(o, i),
        costoTotal: o.weightKg > 0 ? round2(porKg * o.weightKg) : 0,
        costoPorKg: o.weightKg > 0 ? porKg : null,
      })),
    };
  }

  const totales = valores.map((v) => round2((costo * v) / sumaValor));
  const residuo = round2(costo - totales.reduce((s, t) => s + t, 0));
  if (residuo !== 0) {
    const mayor = valores.indexOf(Math.max(...valores));
    totales[mayor] = round2(totales[mayor] + residuo);
  }
  return {
    metodo: "valor-de-venta",
    cortes: validos.map((o, i) => ({
      ...base(o, i),
      costoTotal: totales[i],
      // Sin precio no carga costo: queda en $0 por decisión (hueso, grasa). El costo vigente
      // del stock ignora los ceros, así que ese corte figura "sin costo" y no "gratis".
      costoPorKg: o.weightKg > 0 ? round2(totales[i] / o.weightKg) : null,
    })),
  };
}

export interface OutputAnalysis {
  name: string;
  weightKg: number;
  yieldPct: number; // 0..1 sobre el peso de entrada
  sharePct: number; // 0..1 sobre los kilos obtenidos (participación del corte)
  costShare: number | null; // costo asignado a este corte (por valor relativo de venta)
  costPerKg: number | null; // costo por kilo de este corte
}

export interface DespieceAnalysis {
  inputWeightKg: number;
  inputCost: number;
  totalOutputKg: number;
  mermaKg: number;
  mermaPct: number;
  overDeclared: boolean; // Σcortes > entrada → carga inconsistente
  costPerSellableKg: number | null;
  metodoDeCosteo: MetodoDeCosteo;
  outputs: OutputAnalysis[];
}

/** Analiza un despiece completo: rendimiento, merma y costo de cada corte. Puro. */
export function analyzeDespiece(input: DespieceInput): DespieceAnalysis {
  const out = totalOutputKg(input.outputs);
  const merma = mermaKg(input);
  const costeo = costearPorValorDeVenta(input.inputCost, input.outputs);
  return {
    inputWeightKg: round3(input.inputWeightKg),
    inputCost: round2(input.inputCost),
    totalOutputKg: out,
    mermaKg: merma,
    mermaPct: mermaPct(input),
    overDeclared: merma < 0,
    costPerSellableKg: costPerSellableKg(input),
    metodoDeCosteo: costeo.metodo,
    outputs: input.outputs.map((o, i) => ({
      name: o.name,
      weightKg: round3(o.weightKg),
      yieldPct: yieldPct(o.weightKg, input.inputWeightKg),
      sharePct: out > 0 ? o.weightKg / out : 0,
      costShare: costeo.cortes[i].costoTotal,
      costPerKg: costeo.cortes[i].costoPorKg,
    })),
  };
}

// ── Los movimientos de stock de un despiece ─────────────────────────────────
//
// El despiece mueve stock dos veces, en la misma transacción: SALE la pieza de entrada (un
// AJUSTE negativo, porque el registro todavía no tiene un tipo "transformación": pide migración)
// y ENTRAN los cortes (REPOSICION con su costo). Los dos llevan el mismo `reason`, que empieza
// con "Despiece #N": así el tablero de merma puede no contar la pieza cortada como pérdida y el
// sugerido de compra la cuenta como demanda de esa pieza.

/** Cómo empieza el `reason` de todo movimiento de un despiece. */
export const MOTIVO_DESPIECE = "Despiece #";

/** El `reason` de los movimientos del despiece `code` de la pieza `pieza`. PURA. */
export function motivoDeDespiece(code: number, pieza: string): string {
  return `${MOTIVO_DESPIECE}${code} — ${pieza.trim()}`;
}

/** ¿Este movimiento lo escribió un despiece? PURA. */
export function esMovimientoDeDespiece(reason: string | null | undefined): boolean {
  return String(reason ?? "").startsWith(MOTIVO_DESPIECE);
}

/**
 * El costo de la pieza de entrada: el que se tipeó o, si quedó vacío, el costo vigente de la
 * pieza en el stock por los kilos que entran (lo que costó al comprarla). `null` si no hay
 * ninguno: el despiece se registra igual, con los cortes sin costo. PURA.
 */
export function costoDeLaPieza(tipeado: number | null, costoVigentePorKg: number | null, kilos: number): number | null {
  if (positivo(tipeado)) return round2(tipeado);
  if (positivo(costoVigentePorKg) && positivo(kilos)) return round2(costoVigentePorKg * kilos);
  return null;
}

/** ¿El producto se cuenta en kilos? Por la forma de venta, o porque su unidad ES el kilo. PURA. */
export function esDeKilo(p: { saleUnit?: string | null; unit?: string | null }): boolean {
  if (p.saleUnit === "WEIGHT") return true;
  return /^(kg|kgs|kilo|kilos|kilogramos?)$/i.test(String(p.unit ?? "").trim());
}

/**
 * Precio de venta por kilo de un producto, para costear el corte: el precio por kilo si se vende
 * por peso; el precio si la unidad del producto ES el kilo. Por unidad (una hamburguesa) no hay
 * forma de pasarlo a kilos: `null`. PURA.
 */
export function precioPorKiloDe(p: { saleUnit?: string | null; unit?: string | null; price?: number | null; pricePerKg?: number | null }): number | null {
  if (p.saleUnit === "WEIGHT") return positivo(p.pricePerKg) ? p.pricePerKg : null;
  return esDeKilo(p) && positivo(p.price) ? p.price : null;
}

// ── Rendimiento del período (el número de la pantalla) ──────────────────────

/** Rendimiento de varias corridas: Σ kg obtenidos / Σ kg de entrada (0..1), o null sin corridas. */
export function rendimientoDelPeriodo(corridas: readonly { inputWeightKg: number; totalOutputKg: number }[]): number | null {
  let entrada = 0;
  let salida = 0;
  for (const c of corridas) {
    if (!positivo(c.inputWeightKg)) continue;
    entrada += c.inputWeightKg;
    salida += positivo(c.totalOutputKg) ? c.totalOutputKg : 0;
  }
  return entrada > 0 ? salida / entrada : null;
}

// ── Costo fijado a mano que le gana al despiece (dato viejo) ────────────────
//
// Hasta la integración de la ola 2 el despiece ESCRIBÍA `Product.cost` con su costo por kilo
// vendible. Como el costo vigente (stock/costo.ts) le da prioridad a `Product.cost`, ese número
// viejo sigue mandando sobre todo despiece y toda compra posterior del corte, y no se corrige
// solo. No se borra de la base (puede haberlo puesto la dueña a propósito): se AVISA en la
// pantalla, y si coincide con el costo de un despiece viejo, cuál y de cuándo.

export type CostoFijado = {
  productId: string;
  nombre: string;
  costo: number;
  /** El despiece cuyo costo por kilo coincide con éste (el que lo escribió), si hay uno. */
  despiece: { code: number; fecha: Date } | null;
};

/**
 * Los cortes con costo fijado a mano (`Product.cost`) entre los que salen de despieces, con el
 * despiece que lo escribió cuando el número coincide. PURA.
 */
export function costosFijadosAMano(
  productos: readonly { id: string; nombre: string; costoFijado: number | null }[],
  corridas: readonly { code: number; createdAt: Date; costPerSellableKg: number | null; productIds: readonly string[] }[],
): CostoFijado[] {
  const out: CostoFijado[] = [];
  for (const p of productos) {
    if (!positivo(p.costoFijado)) continue;
    const fijado = round2(p.costoFijado);
    // Cada despiece viejo pisaba el número del anterior: si coinciden varios, el que quedó es
    // el del MÁS RECIENTE.
    const coincide = corridas
      .filter((c) => c.productIds.includes(p.id) && c.costPerSellableKg !== null && round2(c.costPerSellableKg) === fijado)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    out.push({
      productId: p.id,
      nombre: p.nombre,
      costo: fijado,
      despiece: coincide ? { code: coincide.code, fecha: coincide.createdAt } : null,
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ── El plan de un despiece: qué sale y qué entra al stock ───────────────────
//
// Lo arma el servidor dentro de la transacción (con el stock y los precios leídos ahí) y lo
// usa la pantalla para la vista previa: la misma regla en los dos lados. PURO.

/** Tolerancia de medio gramo, la misma del registro de stock (ledger.ts). */
const MEDIO_GRAMO = 0.0005;

export type PiezaDeEntrada = { productId: string; nombre: string; kilo: boolean; stock: number };

export type CorteDeSalida = {
  name: string;
  weightKg: number;
  /** El producto del stock al que suma, o null (hueso, grasa: se registran, no suman stock). */
  producto: { id: string; nombre: string; kilo: boolean; precioPorKg: number | null } | null;
};

export type MovimientoPlaneado = { productId: string; nombre: string; qty: number; unitCost: number | null };

export type PlanDelDespiece =
  | {
      ok: true;
      /** El costo de la pieza que se reparte (tipeado o de su compra), o null. */
      costoPieza: number | null;
      /** La pieza que SALE del stock: AJUSTE negativo, a su costo por kilo. */
      salida: MovimientoPlaneado;
      /** Los cortes que ENTRAN al stock: REPOSICION con su costo por kilo. */
      entradas: MovimientoPlaneado[];
      analisis: DespieceAnalysis;
    }
  | { ok: false; error: string };

const kg = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);

/**
 * Qué movimientos deja un despiece, o por qué no se puede registrar. PURA.
 *   · La pieza de entrada SALE del stock (antes sólo se sumaban los cortes y la media res
 *     quedaba en el stock para siempre). Tiene que ser un producto que se cuenta en kilos y
 *     tiene que haber: si el stock no alcanza, se dice cuánto hay y qué hacer.
 *   · Los cortes que van a un producto ENTRAN con su costo por valor relativo de venta.
 *   · Más kilos de cortes que de pieza es un error de carga: no se registra.
 */
export function planDelDespiece(input: {
  pieza: PiezaDeEntrada | null;
  kilos: number;
  costoTipeado: number | null;
  costoVigentePiezaPorKg: number | null;
  cortes: readonly CorteDeSalida[];
}): PlanDelDespiece {
  const { pieza, kilos } = input;
  if (!pieza) return { ok: false, error: "Elegí la pieza que entró al despiece (la media res, el cuarto o la pieza al vacío)." };
  if (!pieza.kilo) return { ok: false, error: `${pieza.nombre} no se cuenta en kilos: elegí la pieza que se compra por kilo.` };
  if (!positivo(kilos)) return { ok: false, error: "Cargá el peso de la pieza que entró." };
  const cortes = input.cortes.filter((c) => c.name.trim() && positivo(c.weightKg));
  if (cortes.length === 0) return { ok: false, error: "Cargá al menos un corte con su nombre y sus kilos." };
  for (const c of cortes) {
    if (c.producto && !c.producto.kilo) {
      return { ok: false, error: `${c.producto.nombre} se vende por unidad y el despiece suma kilos: dejá ese corte sin producto o elegí uno que se venda por kilo.` };
    }
    if (c.producto?.id === pieza.productId) return { ok: false, error: "Un corte no puede sumar a la misma pieza que se está cortando." };
  }
  const salen = totalOutputKg(cortes);
  if (salen > kilos + MEDIO_GRAMO) {
    return { ok: false, error: `Los cortes suman ${kg(salen)} kg y la pieza pesó ${kg(kilos)} kg. Revisá los pesos.` };
  }
  if (pieza.stock + MEDIO_GRAMO < kilos) {
    return {
      ok: false,
      error:
        `Hay ${kg(Math.max(0, pieza.stock))} kg de ${pieza.nombre} en el stock y el despiece usa ${kg(kilos)} kg. ` +
        "Si la pieza llegó y no se cargó, registrala en Recibir mercadería; si el stock está mal, recontala.",
    };
  }

  const costoPieza = costoDeLaPieza(input.costoTipeado, input.costoVigentePiezaPorKg, kilos);
  const analisis = analyzeDespiece({
    inputWeightKg: kilos,
    inputCost: costoPieza ?? 0,
    outputs: cortes.map((c) => ({ name: c.name.trim(), weightKg: c.weightKg, precioPorKg: c.producto?.precioPorKg ?? null })),
  });
  const entradas: MovimientoPlaneado[] = [];
  cortes.forEach((c, i) => {
    if (!c.producto) return;
    const porKg = analisis.outputs[i].costPerKg;
    entradas.push({ productId: c.producto.id, nombre: c.producto.nombre, qty: round3(c.weightKg), unitCost: positivo(porKg) ? porKg : null });
  });
  return {
    ok: true,
    costoPieza,
    salida: { productId: pieza.productId, nombre: pieza.nombre, qty: -round3(kilos), unitCost: costoPieza ? round2(costoPieza / kilos) : null },
    entradas,
    analisis,
  };
}
