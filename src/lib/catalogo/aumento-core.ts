// ============================================================================
// ACTUALIZAR PRECIOS — subir o bajar muchos precios a la vez, con redondeo y vista previa.
// ============================================================================
//
// POR QUÉ EXISTE. Con la inflación, cambiar precios es una tarea semanal. Hasta acá eran
// ocho pasos, dos de ellos en Excel: bajar la planilla, calcular el porcentaje en una
// columna, redondear a mano, copiar, guardar como CSV, subir, revisar, aplicar. Acá son
// cuatro: qué productos, cuánto, cómo se redondea, y la vista previa con el antes y el
// después antes de aplicar.
//
// REUSA LA PLANILLA. Un aumento es un plan de CAMBIOS de precio como el de la planilla
// (`PlanPlanilla` sin altas), así que se escribe con la misma pieza (`escribirPlan`: un solo
// UPDATE para todos) y se valida con la misma huella: si entre la vista previa y el
// "Aplicar" alguien cambió un precio, el plan de ahora da otra huella y no se escribe nada.
//
// EL REDONDEO VA SIEMPRE A FAVOR DEL SENTIDO DEL CAMBIO: en un aumento, para arriba (un
// aumento del 8 % nunca queda en 7,9 % por redondear); en una baja, para abajo (una baja
// nunca termina subiendo el precio). La cuenta se hace en CENTAVOS enteros: en punto flotante
// 12500 × 1,10 da 13750,000000000002, y redondear eso "para arriba" a $50 daba $13.800 en vez
// de $13.750 (medido en node; está en el test).
//
// PURO: sin base, sin React, sin Prisma de valor. Lo usan la pantalla (vista previa en vivo),
// la acción del servidor (que vuelve a armar el plan adentro de la transacción) y los tests.

import { effectiveCategoria, type CorteCategoria } from "@/lib/carniceria/cortes";
import { leerCantidad } from "@/lib/pos-peso";
import {
  MAX_FILAS,
  armarPlanDeCambios,
  normalizarNombre,
  type Cambio,
  type FormaDeVenta,
  type PlanPlanilla,
} from "./planilla-core";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Un producto del catálogo, con lo que hace falta para elegirlo y calcularle el precio. */
export type ProductoParaPrecios = {
  id: string;
  name: string;
  active: boolean;
  saleUnit: FormaDeVenta;
  price: number | null;
  pricePerKg: number | null;
  /** `Product.category` si la columna existe y está cargada; si no, la góndola sale del nombre. */
  category: string | null;
};

/** Qué productos toca el cambio. */
export type Alcance =
  | { tipo: "todos" }
  | { tipo: "gondola"; gondola: CorteCategoria }
  | { tipo: "texto"; texto: string }
  | { tipo: "tildados"; ids: readonly string[] };

export type Sentido = "subir" | "bajar";

/** Pasos de redondeo, en pesos. $1 = sin redondeo (al peso). */
export const PASOS_REDONDEO = [1, 10, 50, 100] as const;
export type PasoRedondeo = (typeof PASOS_REDONDEO)[number];

/** Lo que pide la persona. `porcentaje` llega como lo tipeó ("8", "8,5"). */
export type PedidoAumento = {
  alcance: Alcance;
  sentido: Sentido;
  porcentaje: string;
  redondeo: PasoRedondeo;
};

/** Pasado este porcentaje (en cualquiera de los dos sentidos) se pide una confirmación extra. */
export const UMBRAL_CONFIRMACION = 30;
/** Topes: un aumento de más del 500 % o una baja del 90 % o más son, casi seguro, un error de tipeo. */
export const MAX_AUMENTO = 500;
export const MAX_BAJA = 90;
/**
 * Una fila se marca cuando el redondeo la mueve más de esto (en puntos) respecto del
 * porcentaje pedido: $30 + 8 % redondeado a $50 queda en $50, un 67 %. Se muestra; no frena.
 */
export const DESVIO_POR_REDONDEO = 10;

export type FilaAumento = {
  productId: string;
  nombre: string;
  saleUnit: FormaDeVenta;
  pausado: boolean;
  antes: number;
  despues: number;
  /** Cambio real, en porcentaje con un decimal (el redondeo lo mueve respecto del pedido). */
  efectivo: number;
  /** El redondeo lo aleja del porcentaje pedido más de `DESVIO_POR_REDONDEO` puntos. */
  porRedondeo: boolean;
};

export type PlanAumento = {
  /** Qué impide aplicar (porcentaje ilegible, nada elegido, un precio que queda en $0). */
  error: string | null;
  porcentaje: number | null;
  sentido: Sentido;
  redondeo: PasoRedondeo;
  /** Cuántos productos eligió el alcance (con y sin precio). */
  elegidos: number;
  /** Los que cambian, en el orden del catálogo. */
  filas: FilaAumento[];
  /** Elegidos sin precio de venta: no hay nada que aumentar. No se tocan. */
  sinPrecio: { id: string; nombre: string }[];
  /** Elegidos cuyo precio no se mueve (el redondeo los deja igual). */
  sinCambios: number;
  /** El porcentaje pasa el umbral: la pantalla pide confirmar dos veces y el servidor lo exige. */
  pideConfirmacion: boolean;
  /** El plan en el formato de la planilla: lo que escribe `escribirPlan`, con su huella. */
  plan: PlanPlanilla;
};

// ── Porcentaje ───────────────────────────────────────────────────────────────

export type LecturaPorcentaje =
  | { estado: "vacio" }
  | { estado: "invalido"; mensaje: string }
  | { estado: "ok"; valor: number };

/**
 * Lee el porcentaje como lo tipea la persona: "8", "8,5", "12.5", con o sin "%". Sin signo:
 * el sentido (subir o bajar) se elige aparte, así un "-" perdido no convierte un aumento en
 * una baja. Hasta dos decimales.
 */
export function leerPorcentaje(raw: string, sentido: Sentido): LecturaPorcentaje {
  const limpio = String(raw ?? "").replace(/%/g, "").trim();
  if (limpio === "") return { estado: "vacio" };
  const l = leerCantidad(limpio);
  if (l.estado !== "ok") return { estado: "invalido", mensaje: `"${raw}" no es un porcentaje. Escribilo como 8 u 8,5.` };
  const valor = Math.round(l.valor * 100) / 100;
  if (Math.abs(valor - l.valor) > 1e-9) return { estado: "invalido", mensaje: "El porcentaje va con dos decimales como mucho." };
  if (!(valor > 0)) return { estado: "invalido", mensaje: "El porcentaje tiene que ser mayor que cero." };
  if (sentido === "subir" && valor > MAX_AUMENTO) {
    return { estado: "invalido", mensaje: `Un aumento de más del ${MAX_AUMENTO} % no se hace desde acá: revisá el número.` };
  }
  if (sentido === "bajar" && valor >= MAX_BAJA) {
    return { estado: "invalido", mensaje: `Una baja del ${MAX_BAJA} % o más deja los precios casi en cero: revisá el número.` };
  }
  return { estado: "ok", valor };
}

/** ¿Este porcentaje pide la confirmación extra? */
export function pideConfirmacionExtra(porcentaje: number): boolean {
  return porcentaje > UMBRAL_CONFIRMACION;
}

// ── Redondeo ─────────────────────────────────────────────────────────────────

/**
 * El precio con el porcentaje aplicado y redondeado al `paso`, en PESOS. En un aumento el
 * redondeo va siempre para arriba; en una baja, siempre para abajo. PURA.
 *
 * Toda la cuenta es en centavos enteros: el precio se lleva a centavos, se le aplica el
 * porcentaje en centésimos de punto (8,5 % = 850) con enteros, y recién ahí se redondea al
 * paso. Un precio que ya es múltiplo del paso y queda exacto no se mueve de más.
 */
export function precioConPorcentaje(precio: number, porcentaje: number, sentido: Sentido, paso: PasoRedondeo): number {
  const centavos = Math.round(precio * 100);
  const basis = Math.round(porcentaje * 100); // 8,5 % → 850 (centésimos de punto)
  const factor = sentido === "subir" ? 10000 + basis : 10000 - basis;
  // centavos × factor es entero y exacto mientras no pase 2^53: con el tope de +500 % (factor
  // 60.000) alcanza para precios de hasta $1.500 millones.
  const bruto = centavos * factor; // en centavos × 10000
  const pasoCentavos = paso * 100;
  const divisor = pasoCentavos * 10000;
  const pasos = sentido === "subir" ? Math.ceil(bruto / divisor) : Math.floor(bruto / divisor);
  return (pasos * pasoCentavos) / 100;
}

/**
 * Redondea un precio al paso, para arriba o para abajo, sin aplicar porcentaje. Es la misma
 * regla que `precioConPorcentaje` con 0 %: la exporta para que se pruebe sola.
 */
export function redondearPrecio(precio: number, paso: PasoRedondeo, sentido: Sentido): number {
  return precioConPorcentaje(precio, 0, sentido, paso);
}

// ── Elegir productos ─────────────────────────────────────────────────────────

/** El precio de venta de un producto según su forma de venta, o null si no tiene. */
export function precioDeVenta(p: Pick<ProductoParaPrecios, "saleUnit" | "price" | "pricePerKg">): number | null {
  const v = p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/** La góndola de un producto: la explícita si la hay, si no la que sale del nombre. */
export function gondolaDe(p: Pick<ProductoParaPrecios, "name" | "category">): CorteCategoria {
  return effectiveCategoria(p.name, p.category);
}

/**
 * Los productos que elige el alcance, en el orden del catálogo. PURA.
 * Los pausados entran: el día que se reactivan tienen que salir con el precio de hoy.
 */
export function elegirProductos(
  productos: readonly ProductoParaPrecios[],
  alcance: Alcance,
): ProductoParaPrecios[] {
  switch (alcance.tipo) {
    case "todos":
      return [...productos];
    case "gondola":
      return productos.filter((p) => gondolaDe(p) === alcance.gondola);
    case "texto": {
      const buscado = normalizarNombre(alcance.texto);
      if (!buscado) return [];
      return productos.filter((p) => normalizarNombre(p.name).includes(buscado));
    }
    case "tildados": {
      const ids = new Set(alcance.ids);
      return productos.filter((p) => ids.has(p.id));
    }
  }
}

// ── Planificar ───────────────────────────────────────────────────────────────

const conUnDecimal = (n: number) => Math.round(n * 10) / 10;

function planVacio(pedido: PedidoAumento, error: string, elegidos = 0): PlanAumento {
  return {
    error,
    porcentaje: null,
    sentido: pedido.sentido,
    redondeo: pedido.redondeo,
    elegidos,
    filas: [],
    sinPrecio: [],
    sinCambios: 0,
    pideConfirmacion: false,
    plan: armarPlanDeCambios([]),
  };
}

/** ¿El pedido trae un paso de redondeo conocido? Lo que llega del navegador no se asume. */
function pasoValido(v: unknown): v is PasoRedondeo {
  return (PASOS_REDONDEO as readonly unknown[]).includes(v);
}

/**
 * Arma el plan del aumento contra el catálogo. PURA: no escribe nada.
 *
 * Es la misma función para la vista previa (en la pantalla, en vivo) y para el "Aplicar"
 * (en el servidor, contra el catálogo leído adentro de la transacción que escribe).
 */
export function planificarAumento(productos: readonly ProductoParaPrecios[], pedido: PedidoAumento): PlanAumento {
  if (pedido.sentido !== "subir" && pedido.sentido !== "bajar") return planVacio(pedido, "Elegí si los precios suben o bajan.");
  if (!pasoValido(pedido.redondeo)) return planVacio(pedido, "Elegí cómo redondear: $1, $10, $50 o $100.");

  const lectura = leerPorcentaje(pedido.porcentaje, pedido.sentido);
  if (lectura.estado === "vacio") return planVacio(pedido, "Escribí el porcentaje.");
  if (lectura.estado === "invalido") return planVacio(pedido, lectura.mensaje);
  const porcentaje = lectura.valor;

  const elegidos = elegirProductos(productos, pedido.alcance);
  if (elegidos.length === 0) return { ...planVacio(pedido, "No hay productos elegidos."), porcentaje };
  if (elegidos.length > MAX_FILAS) {
    return { ...planVacio(pedido, `Son ${elegidos.length} productos; el máximo por vez es ${MAX_FILAS}.`, elegidos.length), porcentaje };
  }

  const filas: FilaAumento[] = [];
  const cambios: Cambio[] = [];
  const sinPrecio: { id: string; nombre: string }[] = [];
  const quedanEnCero: string[] = [];
  let sinCambios = 0;

  for (const p of elegidos) {
    const antes = precioDeVenta(p);
    if (antes === null) {
      sinPrecio.push({ id: p.id, nombre: p.name });
      continue;
    }
    const despues = precioConPorcentaje(antes, porcentaje, pedido.sentido, pedido.redondeo);
    if (!(despues > 0)) {
      quedanEnCero.push(p.name);
      continue;
    }
    if (Math.round(despues * 100) === Math.round(antes * 100)) {
      sinCambios++;
      continue;
    }
    const efectivo = conUnDecimal(((despues - antes) / antes) * 100);
    const pedidoConSigno = pedido.sentido === "subir" ? porcentaje : -porcentaje;
    filas.push({
      productId: p.id,
      nombre: p.name,
      saleUnit: p.saleUnit,
      pausado: !p.active,
      antes,
      despues,
      efectivo,
      porRedondeo: Math.abs(efectivo - pedidoConSigno) > DESVIO_POR_REDONDEO,
    });
    cambios.push({
      fila: filas.length,
      productId: p.id,
      nombre: p.name,
      saleUnit: p.saleUnit,
      inactivo: !p.active,
      precioAntes: antes,
      precioDespues: despues,
      controlAntes: false,
      controlDespues: null,
      data: p.saleUnit === "WEIGHT" ? { pricePerKg: despues } : { price: despues },
    });
  }

  const base = {
    porcentaje,
    sentido: pedido.sentido,
    redondeo: pedido.redondeo,
    elegidos: elegidos.length,
    filas,
    sinPrecio,
    sinCambios,
    pideConfirmacion: pideConfirmacionExtra(porcentaje),
    plan: armarPlanDeCambios(cambios),
  };

  if (quedanEnCero.length > 0) {
    const n = quedanEnCero.length;
    return {
      ...base,
      error:
        `${n === 1 ? `"${quedanEnCero[0]}" quedaría` : `${n} productos quedarían`} en $0 con el redondeo de $${pedido.redondeo}. ` +
        "Elegí un redondeo más chico o sacalos de la selección.",
    };
  }
  if (filas.length === 0) {
    return {
      ...base,
      error: sinPrecio.length === elegidos.length ? "Ninguno de los elegidos tiene precio de venta." : "Con este porcentaje y este redondeo no cambia ningún precio.",
    };
  }
  return { ...base, error: null };
}

/** ¿Se puede aplicar? Sin error y con algo para escribir. */
export function aumentoAplicable(p: PlanAumento): boolean {
  return p.error === null && p.plan.cambios.length > 0;
}

// ── Lo que llega del navegador ───────────────────────────────────────────────

const GONDOLAS: readonly CorteCategoria[] = ["vaca", "cerdo", "pollo", "achuras", "preparados", "gourmet", "otros"];

/**
 * El pedido tal como llegó a la acción del servidor, validado campo por campo. Una acción
 * es un endpoint: lo que manda el navegador puede traer cualquier cosa. Devuelve `null` si
 * la forma no es la de un pedido.
 */
export function pedidoDesdeAfuera(v: unknown): PedidoAumento | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const a = o.alcance as Record<string, unknown> | null | undefined;
  if (!a || typeof a !== "object") return null;
  let alcance: Alcance;
  if (a.tipo === "todos") alcance = { tipo: "todos" };
  else if (a.tipo === "gondola" && GONDOLAS.includes(a.gondola as CorteCategoria)) alcance = { tipo: "gondola", gondola: a.gondola as CorteCategoria };
  else if (a.tipo === "texto" && typeof a.texto === "string" && a.texto.length <= 120) alcance = { tipo: "texto", texto: a.texto };
  else if (
    a.tipo === "tildados" &&
    Array.isArray(a.ids) &&
    a.ids.length <= MAX_FILAS &&
    a.ids.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)
  ) {
    alcance = { tipo: "tildados", ids: a.ids as string[] };
  } else return null;
  if (o.sentido !== "subir" && o.sentido !== "bajar") return null;
  if (typeof o.porcentaje !== "string" || o.porcentaje.length > 20) return null;
  if (!pasoValido(o.redondeo)) return null;
  return { alcance, sentido: o.sentido, porcentaje: o.porcentaje, redondeo: o.redondeo };
}

/** Cómo se cuenta el aumento en palabras: "+8 %", "−5 %". */
export function textoDelPorcentaje(sentido: Sentido, porcentaje: number): string {
  const n = porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return `${sentido === "subir" ? "+" : "−"}${n} %`;
}
