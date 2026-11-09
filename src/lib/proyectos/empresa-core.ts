// ADMINISTRACIÓN Y DIRECCIÓN — reglas puras que no están en gestion-core: desvíos, alertas, liquidaciones y conciliación.
// Sin base ni React, para probarlas sin nada alrededor.

import { centavosDe } from "@/lib/dinero/redondeo";
import { pesos, redondear } from "./core";
import { aPesos, cuotaParaMovimiento, estadoCuota, generaCuotas, type CuotaLeida, type LineaExtracto, type MesProyectado, type NivelCarga } from "./gestion-core";

// ── Meses ───────────────────────────────────────────────────────────────────

export const periodoValido = (p: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

export function etiquetaMes(periodo: string, corta = false): string {
  const [a, m] = periodo.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, 15));
  return new Intl.DateTimeFormat("es-AR", corta ? { month: "short", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }).format(f);
}

// ── Cuentas a cobrar y a pagar ──────────────────────────────────────────────

export const FILTROS_CUOTA = ["pendientes", "vencidos", "pagados", "todos"] as const;
export type FiltroCuota = (typeof FILTROS_CUOTA)[number];

/** «Pendientes» es todo lo que falta pagar, vencido o no: lo vencido es lo más urgente de lo pendiente. */
export function pasaFiltro(c: Pick<CuotaLeida, "venceEl" | "pagadoEl">, filtro: FiltroCuota, hoy: Date = new Date()): boolean {
  const estado = estadoCuota(c, hoy);
  if (filtro === "pendientes") return estado !== "PAGADA";
  if (filtro === "vencidos") return estado === "VENCIDA";
  if (filtro === "pagados") return estado === "PAGADA";
  return true;
}

// ── Lo que dejó el evento ───────────────────────────────────────────────────

export interface ItemParaDesvio {
  id: string;
  descripcion: string;
  rubro: string;
  cantidad: number;
  costo: number;
  moneda: string;
  /** Total real del ítem, en pesos. */
  costoReal: number | null;
  proveedor: string | null;
}

export interface LineaDesvio {
  clave: string;
  detalle: string;
  rubro: string;
  proveedor: string | null;
  presupuestado: number;
  /** Null: todavía no se cargó nada real; para el margen cuenta lo presupuestado. */
  real: number | null;
  desvio: number | null;
  desvioPct: number | null;
}

const claveRubro = (r: string) => r.trim().toLowerCase() || "general";

function linea(clave: string, detalle: string, rubro: string, proveedor: string | null, presupuestado: number, real: number | null): LineaDesvio {
  const p = redondear(presupuestado);
  const r = real == null ? null : redondear(real);
  const desvio = r == null ? null : redondear(r - p);
  return { clave, detalle, rubro, proveedor, presupuestado: p, real: r, desvio, desvioPct: desvio != null && p > 0 ? redondear((desvio / p) * 100) : null };
}

/**
 * Presupuestado contra real. Manda el `costoReal` del ítem; los gastos cargados en el proyecto valen para el resto de los
 * ítems de su rubro. Un ítem sin ningún dato cuenta lo presupuestado: que falte cargarlo no es una ganancia. Lo gastado en
 * un rubro sin ítems pendientes queda a la vista en su propia línea, sin repartirlo.
 */
export function desviosDelEvento(items: readonly ItemParaDesvio[], gastos: readonly { rubro: string; neto: number; anuladoEl?: Date | null }[], tc: Readonly<Record<string, number>>) {
  const gastado = new Map<string, { rubro: string; neto: number }>();
  for (const g of gastos) {
    if (g.anuladoEl) continue;
    const k = claveRubro(g.rubro);
    const previo = gastado.get(k);
    if (previo) previo.neto += g.neto;
    else gastado.set(k, { rubro: g.rubro.trim() || "General", neto: g.neto });
  }
  const costoItem = (i: ItemParaDesvio) => redondear(i.cantidad * aPesos(i.costo, i.moneda, tc));
  const lineas: LineaDesvio[] = [];
  const rubros = new Map<string, ItemParaDesvio[]>();
  for (const i of items) {
    const k = claveRubro(i.rubro);
    rubros.set(k, [...(rubros.get(k) ?? []), i]);
  }
  for (const [k, suyos] of rubros) {
    const sinDato = suyos.filter((i) => i.costoReal == null);
    for (const i of suyos) if (i.costoReal != null) lineas.push(linea(i.id, i.descripcion, i.rubro, i.proveedor, costoItem(i), i.costoReal));
    // Lo pagado por cuotas ya está en los gastos del rubro: lo que corresponde a ítems con real cargado no se cuenta dos veces.
    const cubierto = suyos.reduce((s, i) => s + (i.costoReal == null ? 0 : Math.min(i.costoReal, costoItem(i))), 0);
    const cargado = gastado.get(k);
    const g = cargado && cargado.neto - cubierto > 0 ? { ...cargado, neto: redondear(cargado.neto - cubierto) } : null;
    if (!g) gastado.delete(k);
    if (g) {
      const presupuestado = sinDato.reduce((s, i) => s + costoItem(i), 0);
      lineas.push(linea(`rubro:${k}`, sinDato.length > 0 ? `${g.rubro}: gastos cargados` : `${g.rubro}: gastos fuera de los ítems`, g.rubro, null, presupuestado, g.neto));
      gastado.delete(k);
    } else {
      for (const i of sinDato) lineas.push(linea(i.id, i.descripcion, i.rubro, i.proveedor, costoItem(i), null));
    }
  }
  for (const [k, g] of gastado) lineas.push(linea(`rubro:${k}`, `${g.rubro}: gastos sin ítem en la ficha`, g.rubro, null, 0, g.neto));
  const costoPresupuestado = redondear(lineas.reduce((s, l) => s + l.presupuestado, 0));
  const costoReal = redondear(lineas.reduce((s, l) => s + (l.real ?? l.presupuestado), 0));
  return { lineas, costoPresupuestado, costoReal, conDatos: lineas.some((l) => l.real != null) };
}

export const margenSobreVenta = (venta: number, costo: number): number => (venta > 0 ? redondear(((venta - costo) / venta) * 100) : 0);

// ── Alertas de Dirección ────────────────────────────────────────────────────

export interface Alerta {
  clave: string;
  texto: string;
  enlace: string;
}

/** Un importe que al mostrarse daría $ 0 no es una novedad para nadie. */
const seNota = (monto: number): boolean => Math.round(Math.abs(monto)) > 0;

export function alertasDeDireccion(d: {
  proyectos: readonly { id: string; nombre: string; vencido: number; conDatos: boolean; margenPct: number; margenRealPct: number | null; costo: number; costoReal: number }[];
  proyeccion: readonly MesProyectado[];
}): Alerta[] {
  const salida: Alerta[] = [];
  for (const p of d.proyectos) {
    if (p.vencido > 0 && seNota(p.vencido)) salida.push({ clave: `cobro:${p.id}`, texto: `${p.nombre}: cobro vencido por ${pesos(Math.round(p.vencido))}.`, enlace: "/admin/proyectos/administracion?tab=cobrar&estado=vencidos" });
  }
  const negativo = d.proyeccion.find((m) => Math.round(m.saldo) < 0);
  if (negativo) salida.push({ clave: `caja:${negativo.mes}`, texto: `La caja proyectada queda negativa en ${etiquetaMes(negativo.mes)}: ${pesos(Math.round(negativo.saldo))}.`, enlace: "/admin/proyectos/administracion?tab=cashflow" });
  for (const p of d.proyectos) {
    if (!p.conDatos || p.margenRealPct == null) continue;
    const puntos = redondear(p.margenPct - p.margenRealPct);
    if (puntos >= 0.1 && p.costoReal > p.costo && seNota(p.costoReal - p.costo)) {
      salida.push({ clave: `margen:${p.id}`, texto: `${p.nombre}: margen real de ${p.margenRealPct.toLocaleString("es-AR")} % contra ${p.margenPct.toLocaleString("es-AR")} % presupuestado.`, enlace: `/admin/proyectos/direccion?tab=eventos&proyecto=${p.id}` });
    }
  }
  return salida;
}

// ── Comerciales ─────────────────────────────────────────────────────────────

export const estaConfirmado = (p: { etapa: string; perdidoEl: Date | null }): boolean => !p.perdidoEl && generaCuotas(p.etapa);
export const estaAbierto = (p: { etapa: string; perdidoEl: Date | null }): boolean => !p.perdidoEl && !generaCuotas(p.etapa);
export const estaActivo = (p: { etapa: string; perdidoEl: Date | null }): boolean => estaConfirmado(p) && p.etapa !== "CIERRE";

/** Confirmados sobre decididos: lo que sigue abierto todavía no ganó ni perdió. */
export function tasaDeConversion(confirmados: number, perdidos: number): number {
  const decididos = confirmados + perdidos;
  return decididos > 0 ? redondear((confirmados / decididos) * 100) : 0;
}

export function sumarPor<T>(lista: readonly T[], clave: (x: T) => string, valor: (x: T) => number): { nombre: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const x of lista) m.set(clave(x), (m.get(clave(x)) ?? 0) + valor(x));
  return [...m].map(([nombre, v]) => ({ nombre, valor: redondear(v) })).sort((a, b) => b.valor - a.valor);
}

// ── Carga ───────────────────────────────────────────────────────────────────

/** El lunes siguiente: «esta semana» llega hasta el domingo. */
export function finDeSemana(hoy: Date = new Date()): Date {
  const dias = ((8 - hoy.getDay()) % 7) || 7;
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
}

export function respuestaDeCarga(filas: readonly { nivel: NivelCarga }[]): { respuesta: "SI" | "AJUSTADO" | "NO" | "SIN_EQUIPO"; texto: string } {
  if (filas.length === 0) return { respuesta: "SIN_EQUIPO", texto: "Todavía no hay personas cargadas en el equipo." };
  const altas = filas.filter((f) => f.nivel === "ALTA").length;
  if (altas === 0) return { respuesta: "SI", texto: "Sí: nadie del equipo está con carga alta." };
  if (altas * 2 >= filas.length) return { respuesta: "NO", texto: `Conviene no tomarlo: ${altas} de ${filas.length} personas están con carga alta.` };
  return { respuesta: "AJUSTADO", texto: `Se puede, repartiendo bien: ${altas} de ${filas.length} personas están con carga alta.` };
}

// ── Liquidaciones ───────────────────────────────────────────────────────────

export interface ExtraGuardado {
  proyectoId: string | null;
  nombre: string;
  monto: number;
  manual?: boolean;
  /** Rendí: reintegro de un gasto que la persona pagó de su bolsillo. El gasto queda reclamado por la liquidación. */
  gastoId?: string;
  reintegro?: true;
}

export function leerExtras(json: unknown): ExtraGuardado[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((e) => {
    const x = e as Partial<ExtraGuardado> | null;
    if (!x || typeof x.nombre !== "string" || typeof x.monto !== "number" || !Number.isFinite(x.monto)) return [];
    return [{
      proyectoId: typeof x.proyectoId === "string" ? x.proyectoId : null,
      nombre: x.nombre,
      monto: x.monto,
      ...(x.manual ? { manual: true } : {}),
      ...(x.reintegro && typeof x.gastoId === "string" ? { gastoId: x.gastoId, reintegro: true as const } : {}),
    }];
  });
}

export const totalDeExtras = (extras: readonly { monto: number }[]): number => redondear(extras.reduce((s, e) => s + e.monto, 0));
export const totalLiquidacion = (base: number, extras: readonly { monto: number }[]): number => redondear(base + totalDeExtras(extras));

/** Recalcular trae los plus de los eventos de nuevo y no pierde lo que alguien cargó a mano. */
export function extrasRecalculados(previos: readonly ExtraGuardado[], delPeriodo: readonly { proyectoId: string; nombre: string; monto: number }[]): ExtraGuardado[] {
  return [...delPeriodo.map((e) => ({ proyectoId: e.proyectoId, nombre: e.nombre, monto: e.monto })), ...previos.filter((e) => e.manual)];
}

/**
 * Rendí: los reintegros que reclamó la liquidación, como extras (uno por gasto, en pesos). Reemplazan a los que había:
 * la fuente es la rendición reclamada en la base, no el JSON guardado. PURA.
 */
export function conReintegros(extras: readonly ExtraGuardado[], reclamadas: readonly { gastoId: string; proyectoId: string; descripcion: string; montoCentavos: number }[]): ExtraGuardado[] {
  const unaVez = new Map(reclamadas.map((r) => [r.gastoId, r]));
  return [
    ...extras.filter((e) => !e.reintegro),
    ...[...unaVez.values()].map((r) => ({ proyectoId: r.proyectoId, nombre: `Reintegro · ${r.descripcion}`.slice(0, 120), monto: r.montoCentavos / 100, gastoId: r.gastoId, reintegro: true as const })),
  ];
}

/**
 * Rendí: al pagar, lo reclamado en la base (rendiciones con ese `liquidacionId`) tiene que ser exactamente lo que suma
 * el total: mismos gastos, misma plata. Si no cuadra, no se paga (se regenera el borrador). PURA.
 */
export function reintegrosCuadran(extras: readonly ExtraGuardado[], reclamadas: readonly { gastoId: string; montoCentavos: number }[]): boolean {
  const enExtras = extras.filter((e) => e.reintegro && e.gastoId);
  const ids = new Set(enExtras.map((e) => e.gastoId as string));
  if (ids.size !== enExtras.length || ids.size !== reclamadas.length) return false;
  if (reclamadas.some((r) => !ids.has(r.gastoId))) return false;
  const centavosExtras = enExtras.reduce((s, e) => s + centavosDe(e.monto), 0);
  return centavosExtras === reclamadas.reduce((s, r) => s + r.montoCentavos, 0);
}

// ── Bancos ──────────────────────────────────────────────────────────────────

const claveLinea = (l: { fecha: Date; descripcion: string; importe: number }) => `${l.fecha.getFullYear()}-${l.fecha.getMonth()}-${l.fecha.getDate()}|${l.descripcion.trim().toLowerCase()}|${redondear(l.importe)}`;

/** Volver a subir un extracto no duplica: dos líneas iguales dentro del archivo son dos, y sólo se saltean las que ya estaban. */
export function lineasNuevas<T extends { fecha: Date; descripcion: string; importe: number }>(lineas: readonly T[], existentes: readonly { fecha: Date; descripcion: string; importe: number }[]): T[] {
  const yaEstan = new Map<string, number>();
  for (const e of existentes) yaEstan.set(claveLinea(e), (yaEstan.get(claveLinea(e)) ?? 0) + 1);
  return lineas.filter((l) => {
    const n = yaEstan.get(claveLinea(l)) ?? 0;
    if (n === 0) return true;
    yaEstan.set(claveLinea(l), n - 1);
    return false;
  });
}

/** Una cuota por movimiento: dos movimientos iguales no se proponen contra la misma. */
export function propuestasDeConciliacion<T extends CuotaLeida & { id: string }>(movimientos: readonly (LineaExtracto & { id: string })[], cuotas: readonly T[], tc: Readonly<Record<string, number>>): Map<string, T> {
  const libres = [...cuotas];
  const salida = new Map<string, T>();
  for (const m of movimientos) {
    const c = cuotaParaMovimiento(m, libres, tc);
    if (!c) continue;
    salida.set(m.id, c);
    libres.splice(libres.indexOf(c), 1);
  }
  return salida;
}
