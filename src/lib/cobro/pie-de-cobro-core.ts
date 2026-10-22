// ============================================================================
// EL PIE DE COBRO — las cuentas de la pieza que cobra, en un solo lugar (Magra, tanda 1 · 1A).
// ============================================================================
//
// `PieDeCobro` (src/components/cobro/PieDeCobro.tsx) es UNA pieza que vive en Vender, en la
// entrega de un pedido, en la rendición del cadete y en la devolución. Todo lo que decide con
// plata vive acá, PURO y en centavos enteros, para que la pantalla y el servidor usen la misma
// cuenta (`repartirPagos`, supermercado/pago-mixto.ts) y el test la ejecute sin React:
//
//   · `billetesSugeridos`: los chips de efectivo («$40.000 · $50.000 · $100.000» para $36.608).
//   · `estadoDelEfectivo`: con lo que entregó el cliente, ¿es justo, hay vuelto o falta?
//   · `resultadoDeLaDivision`: el modo Dividir, con el renglón vacío que se completa solo.
//   · `camposDelPie`: lo que el pie escribe en el formulario que lo contiene. Lo lee el servidor
//     con `leerPagos` (src/lib/cobro/leer-pagos.ts), que NO confía en lo que calculó la pantalla.
//
// Sin Prisma, sin React, sin valores de `@/generated/prisma`: se importa desde un client
// component (mismo criterio que caja/medio-cobro.ts).

import { centavosDe } from "@/lib/dinero/redondeo";
import { leerImporte } from "@/lib/dinero/leer";
import { fmtMoneyARS } from "@/components/ui/format";
import { MEDIOS_DE_COBRO, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { repartirPagos, medioPrincipal, MAX_PAGOS, type PagoIngresado } from "@/lib/supermercado/pago-mixto";

// ── El contrato (magra-DISENO.md §4.0) ───────────────────────────────────────

export type PagoDelPie = { medio: MedioDeCobro; monto: number };

/**
 * Lo que el pie entrega al cobrar.
 *   · simple: un medio por el total. `recibido` = «Pagó con» (sólo efectivo, no se guarda).
 *   · dividido: dos o más medios, YA repartidos con `repartirPagos` (lo que entra al libro por
 *     cada uno, sumando exacto el total). `recibido` = el efectivo que entregó el cliente, si
 *     hubo vuelto (opcional, agregado al contrato sin romperlo: no se guarda).
 */
export type ResultadoDelPie =
  | { modo: "simple"; medio: MedioDeCobro; recibido?: number }
  | { modo: "dividido"; pagos: PagoDelPie[]; recibido?: number };

/** Los nombres de los campos que el pie escribe en el formulario (los lee `leerPagos`). */
export const CAMPOS_DEL_PIE = {
  medio: "paymentMethod",
  pagado: "pagado",
  /** El `paid` de los formularios de siempre: lo siguen leyendo el reintento y la bandeja. */
  paid: "paid",
  pagoMedio: "pago.medio",
  pagoMonto: "pago.monto",
  recibido: "recibido",
} as const;

export { MAX_PAGOS };

// ── Plata en pantalla ────────────────────────────────────────────────────────

/** «$36.608» si es redondo, «$4.959,18» si tiene centavos. El redondeo es el de fmtMoneyARS. */
export function textoPlata(n: number): string {
  return fmtMoneyARS(n, centavosDe(n) % 100 === 0 ? 0 : 2);
}

/** El importe como viaja en el formulario: punto decimal, dos cifras («16608.00»). */
export function importeCanonico(n: number): string {
  return (centavosDe(n) / 100).toFixed(2);
}

// ── Billetes sugeridos ───────────────────────────────────────────────────────
//
// Con qué suele pagar el cliente un total: el total redondeado hacia arriba a escalones que se
// arman con los billetes que circulan ($1.000, $2.000, $10.000, $20.000). Sólo los escalones del
// tamaño del total (≥ un décimo): para $36.608, redondear a $1.000 da $37.000, que nadie entrega;
// a $5.000 / $10.000 / $20.000 da $40.000, y después $50.000 y $100.000. Nunca un chip igual o
// menor al total: el «Justo» es otro chip.

const ESCALONES = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000] as const;

export const MAX_BILLETES = 3;

export function billetesSugeridos(total: number, max: number = MAX_BILLETES): number[] {
  const totalC = centavosDe(total);
  if (!Number.isFinite(totalC) || totalC <= 0 || max <= 0) return [];
  const sugeridos = new Set<number>();
  for (const escalon of ESCALONES) {
    const c = escalon * 100;
    if (c * 10 < totalC) continue; // escalón chico para este total
    const arriba = Math.ceil(totalC / c) * c;
    if (arriba > totalC) sugeridos.add(arriba);
  }
  return [...sugeridos]
    .sort((a, b) => a - b)
    .slice(0, max)
    .map((c) => c / 100);
}

// ── El efectivo: justo, vuelto o falta ───────────────────────────────────────

export type EstadoDelEfectivo =
  | { estado: "sin-dato" }
  | { estado: "invalido" }
  | { estado: "justo" }
  | { estado: "vuelto"; vuelto: number }
  | { estado: "falta"; falta: number };

/** Con lo que entregó el cliente (número o lo que se tipeó), al centavo. */
export function estadoDelEfectivo(total: number, recibido: number | string | null | undefined): EstadoDelEfectivo {
  let valor: number;
  if (typeof recibido === "number") valor = recibido;
  else {
    const l = leerImporte(recibido);
    if (l.estado === "vacio") return { estado: "sin-dato" };
    if (l.estado === "invalida") return { estado: "invalido" };
    valor = l.valor;
  }
  if (!Number.isFinite(valor) || valor < 0) return { estado: "invalido" };
  const dif = centavosDe(valor) - centavosDe(total);
  if (dif === 0) return { estado: "justo" };
  return dif > 0 ? { estado: "vuelto", vuelto: dif / 100 } : { estado: "falta", falta: -dif / 100 };
}

// ── Por qué no se puede cobrar ───────────────────────────────────────────────

export const MOTIVO_SIN_TOTAL = "Cargá algo para cobrar.";

/** El motivo que deshabilita los medios, o null. El del llamador manda; sin total, siempre. */
export function motivoParaNoCobrar(total: number, deshabilitado?: { motivo: string } | null): string | null {
  if (deshabilitado?.motivo) return deshabilitado.motivo;
  return centavosDe(total) > 0 ? null : MOTIVO_SIN_TOTAL;
}

// ── Dividir ──────────────────────────────────────────────────────────────────

export type RenglonDeDivision = { medio: MedioDeCobro | null; montoTexto: string };

export type DivisionLeida = {
  /** Lo que se cobra por cada renglón con medio; el único vacío paga LO QUE FALTA. */
  ingresados: PagoIngresado[];
  /** El índice del renglón que se completó solo, y con cuánto (para mostrarlo). */
  completado: { indice: number; monto: number } | null;
  /** Algún monto tipeado no se entiende. */
  invalido: boolean;
};

/**
 * Los pagos que se ingresaron en Dividir. Un renglón con medio y SIN monto paga lo que falta si
 * es el único vacío (MG-001: Efectivo $20.000 y Mercado Pago → MP completa $16.608). Con más de
 * uno vacío, ninguno se completa hasta que se escriba. Un renglón sin medio no cuenta.
 */
export function leerDivision(total: number, renglones: readonly RenglonDeDivision[]): DivisionLeida {
  const conMedio = renglones
    .map((r, indice) => ({ ...r, indice }))
    .filter((r): r is RenglonDeDivision & { medio: MedioDeCobro; indice: number } => r.medio !== null);
  let invalido = false;
  const leidos = conMedio.map((r) => {
    const l = leerImporte(r.montoTexto);
    if (l.estado === "invalida") invalido = true;
    return l.estado === "ok" ? l.valor : null;
  });
  const vacios = leidos.filter((x) => x === null).length;
  const faltaC = centavosDe(total) - leidos.reduce<number>((s, x) => s + centavosDe(x ?? 0), 0);
  const falta = Math.max(0, faltaC) / 100;
  let completado: DivisionLeida["completado"] = null;
  const ingresados: PagoIngresado[] = [];
  conMedio.forEach((r, i) => {
    let monto = leidos[i];
    if (monto === null && vacios === 1 && falta > 0) {
      monto = falta;
      completado = { indice: r.indice, monto: falta };
    }
    if (monto !== null && monto > 0) ingresados.push({ medio: r.medio, monto });
  });
  return { ingresados, completado, invalido };
}

export type DivisionDecidida =
  | { ok: true; resultado: ResultadoDelPie; vuelto: number }
  | { ok: false; error: string; falta?: number };

/**
 * ¿Se puede cobrar lo que está en Dividir? La regla es `repartirPagos` (lo que no es efectivo va
 * exacto; el efectivo paga lo que falta y puede dar vuelto). Si al final queda un solo medio, es
 * un cobro simple: no se inventa un pago mixto de un medio.
 */
export function resultadoDeLaDivision(total: number, renglones: readonly RenglonDeDivision[]): DivisionDecidida {
  const leida = leerDivision(total, renglones);
  if (leida.invalido) return { ok: false, error: "Hay un importe que no se entiende: escribilo de nuevo." };
  const reparto = repartirPagos(total, leida.ingresados);
  if (!reparto.ok) return { ok: false, error: reparto.error, ...(reparto.falta ? { falta: reparto.falta } : {}) };
  const efectivoEntregado = leida.ingresados.filter((p) => p.medio === "EFECTIVO").reduce((s, p) => s + centavosDe(p.monto), 0) / 100;
  const recibido = reparto.vuelto > 0 ? { recibido: efectivoEntregado } : {};
  if (!reparto.mixto) {
    return { ok: true, vuelto: reparto.vuelto, resultado: { modo: "simple", medio: reparto.asientos[0].medio, ...recibido } };
  }
  return {
    ok: true,
    vuelto: reparto.vuelto,
    resultado: { modo: "dividido", pagos: reparto.asientos.map((a) => ({ medio: a.medio, monto: a.monto })), ...recibido },
  };
}

/** Los medios que todavía no se usaron en la división (un medio va una sola vez). */
export function mediosLibres(renglones: readonly RenglonDeDivision[], propio: MedioDeCobro | null = null): MedioDeCobro[] {
  const usados = new Set(renglones.map((r) => r.medio).filter((m): m is MedioDeCobro => m !== null && m !== propio));
  return MEDIOS_DE_COBRO.map((m) => m.valor).filter((m) => !usados.has(m));
}

// ── Lo que el pie escribe en el formulario ───────────────────────────────────

/**
 * Los campos, en orden: `paymentMethod` (el medio principal), `pagado=1` (y `paid=on`, que es
 * lo que leen el reintento de la venta y los formularios de siempre), y en Dividir los
 * pares `pago.medio`/`pago.monto` repetidos; `recibido` sólo si el efectivo entregado cubre lo
 * que va en efectivo (si falta y se confirmó «Cobrar igual», no viaja: no hay vuelto).
 */
export function camposDelPie(total: number, r: ResultadoDelPie): [string, string][] {
  const campos: [string, string][] = [];
  if (r.modo === "simple") {
    campos.push([CAMPOS_DEL_PIE.medio, r.medio], [CAMPOS_DEL_PIE.pagado, "1"], [CAMPOS_DEL_PIE.paid, "on"]);
    if (r.medio === "EFECTIVO" && r.recibido !== undefined && centavosDe(r.recibido) >= centavosDe(total)) {
      campos.push([CAMPOS_DEL_PIE.recibido, importeCanonico(r.recibido)]);
    }
    return campos;
  }
  campos.push([CAMPOS_DEL_PIE.medio, medioPrincipal(r.pagos) ?? ""], [CAMPOS_DEL_PIE.pagado, "1"], [CAMPOS_DEL_PIE.paid, "on"]);
  for (const p of r.pagos) campos.push([CAMPOS_DEL_PIE.pagoMedio, p.medio], [CAMPOS_DEL_PIE.pagoMonto, importeCanonico(p.monto)]);
  const efectivo = r.pagos.find((p) => p.medio === "EFECTIVO");
  if (efectivo && r.recibido !== undefined && centavosDe(r.recibido) >= centavosDe(efectivo.monto)) {
    campos.push([CAMPOS_DEL_PIE.recibido, importeCanonico(r.recibido)]);
  }
  return campos;
}

/** El vuelto que corresponde a un resultado (0 si no hay). */
export function vueltoDelResultado(total: number, r: ResultadoDelPie): number {
  if (r.recibido === undefined) return 0;
  const efectivo =
    r.modo === "simple" ? (r.medio === "EFECTIVO" ? total : 0) : (r.pagos.find((p) => p.medio === "EFECTIVO")?.monto ?? 0);
  if (!(efectivo > 0)) return 0;
  return Math.max(0, centavosDe(r.recibido) - centavosDe(efectivo)) / 100;
}
