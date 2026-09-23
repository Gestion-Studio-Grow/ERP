// ============================================================================
// RECUENTO POR GÓNDOLA — lo que se decide sin base. PURO.
// ============================================================================
//
// La planilla del recuento agrupa los productos por góndola (en la carnicería, por animal: el
// encargado recorre la heladera de vaca, después la de cerdo), muestra cuándo se contó cada uno
// por última vez y, al guardar, cuánto dio la diferencia en cantidad y en pesos. La diferencia
// en sí la calcula el servidor contra el stock teórico a la hora del conteo
// (adjustment-core.ts, `stockTeorico`); acá están el armado de la planilla, el resumen del
// resultado y la regla de "sin contar hace más de 30 días" que usan la pantalla y su botón.
//
// Sin imports de servidor: lo usan el formulario (client component), el loader y los tests.

/** Un producto de la planilla. */
export interface ProductoARecontar {
  id: string;
  nombre: string;
  unidad: string;
  /** ¿Se cuenta en kilos? (se vende por peso). */
  kilo: boolean;
  /** Stock del sistema al armar la planilla. En el conteo ciego no se muestra. */
  stock: number;
  /** Costo vigente, o null (sin costo, o quien cuenta no ve costos). */
  costo: number | null;
  /** Último recuento (ISO), o null si nunca se contó. */
  ultimoRecuento: string | null;
}

export interface Gondola {
  id: string;
  nombre: string;
  productos: ProductoARecontar[];
}

/**
 * Agrupa por góndola en el orden del recorrido (`orden`); una góndola sin productos no
 * aparece, y una que no figura en el orden va al final. PURA.
 */
export function armarGondolas(
  productos: readonly ProductoARecontar[],
  gondolaDe: (p: ProductoARecontar) => { id: string; nombre: string },
  orden: readonly string[],
): Gondola[] {
  const porId = new Map<string, Gondola>();
  for (const p of productos) {
    const g = gondolaDe(p);
    const actual = porId.get(g.id) ?? { id: g.id, nombre: g.nombre, productos: [] };
    actual.productos.push(p);
    porId.set(g.id, actual);
  }
  const pos = (id: string) => {
    const i = orden.indexOf(id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return [...porId.values()].sort((a, b) => pos(a.id) - pos(b.id) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Días que se considera "contado hace poco". Pasado esto, el producto pide recuento. */
export const DIAS_SIN_CONTAR = 30;

/**
 * Cómo empieza el `reason` del AJUSTE que deja un recuento: es `motivoLabel("RECUENTO")` de
 * stock/adjustment-core.ts (lo fija recuento.test.ts). No hay columna para distinguir un
 * recuento: la planilla, el botón de Recuento y el paso de stock del Cierre del mes lo
 * reconocen por este prefijo. Escrito acá y no importado para no sumar el núcleo de ajustes a
 * la pantalla de Recuento (cliente).
 */
export const MOTIVO_RECUENTO = "Recuento";

/** El instante desde el cual un recuento todavía cuenta como reciente. PURA. */
export function desdeRecuentoReciente(ahora: Date, dias = DIAS_SIN_CONTAR): Date {
  return new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
}

/**
 * Productos que piden recuento: controlan stock, están activos y no tienen un AJUSTE de
 * recuento desde `desde`. Lo usan la planilla (para marcarlos) y el botón de Recuento (para
 * contarlos), así el número del botón es el de la pantalla. Objeto plano, sin Prisma.
 */
export function whereSinContarDesde(tenantId: string, desde: Date) {
  return {
    tenantId,
    deletedAt: null,
    active: true,
    trackStock: true,
    stockMovements: { none: { type: "AJUSTE" as const, reason: { startsWith: MOTIVO_RECUENTO }, createdAt: { gte: desde } } },
  };
}

/** ¿Este producto pide recuento? La misma regla que `whereSinContarDesde`, en memoria. PURA. */
export function pideRecuento(ultimoRecuento: string | null, desde: Date): boolean {
  if (!ultimoRecuento) return true;
  const t = Date.parse(ultimoRecuento);
  return !Number.isFinite(t) || t < desde.getTime();
}

/** Una línea del resultado de un recuento, como la devuelve el servidor. */
export interface LineaDeRecuento {
  nombre: string;
  unidad: string;
  /** Lo que el sistema tenía a la hora del conteo. */
  teorico: number;
  contado: number;
  /** contado − teórico: + sobró, − faltó. */
  diferencia: number;
  /** Diferencia a costo vigente; null si no hay costo o quien cuenta no ve costos. */
  pesos: number | null;
}

/** Totales del recuento: cuántos coincidieron, faltantes y sobrantes. PURA. */
export function resumirRecuento(lineas: readonly LineaDeRecuento[]): {
  contados: number;
  coinciden: number;
  conFaltante: number;
  conSobrante: number;
  /** Faltante y sobrante en pesos, de las líneas con costo. */
  pesosFaltante: number;
  pesosSobrante: number;
  sinCosto: number;
} {
  let coinciden = 0;
  let conFaltante = 0;
  let conSobrante = 0;
  let pesosFaltante = 0;
  let pesosSobrante = 0;
  let sinCosto = 0;
  for (const l of lineas) {
    if (l.diferencia === 0) coinciden++;
    else if (l.diferencia < 0) conFaltante++;
    else conSobrante++;
    if (l.diferencia === 0) continue;
    if (l.pesos === null) sinCosto++;
    else if (l.pesos < 0) pesosFaltante += -l.pesos;
    else pesosSobrante += l.pesos;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    contados: lineas.length,
    coinciden,
    conFaltante,
    conSobrante,
    pesosFaltante: r2(pesosFaltante),
    pesosSobrante: r2(pesosSobrante),
    sinCosto,
  };
}
