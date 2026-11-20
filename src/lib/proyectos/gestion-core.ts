// GESTIÓN DE EVENTOS — reglas puras: la ficha genera cuotas, las cuotas arman el cashflow y de ahí salen la proyección,
// las alertas y la liquidación. Sin base ni React, para probarlas sin nada alrededor. Especificación funcional en
// docs/benchmark/heka-especificacion.md.

import { anticipoDeLaLinea, DIAS_POR_DEFECTO, type DiasDelPlan } from "./presupuesto-core";
import { pesos, porcentaje, redondear, yaVencio } from "./core";
import { DECISIONES_DE_PUESTOS } from "./decisiones-puestos";

const DIA = 86_400_000;

export const MONEDAS = ["ARS", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

export const TIPOS_EVENTO = ["Convención", "Congreso", "Stand / Feria", "Lanzamiento", "Activación de marca", "Gala / Fiesta", "Incentivo", "Roadshow"] as const;

export const RUBROS = [
  "Audio, video e iluminación",
  "Catering",
  "Escenografía y stands",
  "Impresión y señalética",
  "Logística y transporte",
  "Mobiliario",
  "Pantallas LED",
  "Personal y staff",
  "Producción general",
  "Alojamiento",
  "Artísticos",
  "Tecnología",
  "Venue",
] as const;

export const ESTADOS_ITEM = ["PENDIENTE", "COTIZANDO", "APROBADO", "CONTRATADO", "ENTREGADO"] as const;
export const ESTADO_ITEM_LABEL: Record<string, string> = { PENDIENTE: "Pendiente", COTIZANDO: "Cotizando", APROBADO: "Aprobado", CONTRATADO: "Contratado", ENTREGADO: "Entregado" };

export const ESTADOS_TAREA = ["POR_HACER", "EN_CURSO", "REVISION", "APROBADA"] as const;
export const ESTADO_TAREA_LABEL: Record<string, string> = { POR_HACER: "Por hacer", EN_CURSO: "En curso", REVISION: "Revisión", APROBADA: "Aprobada" };

export const CANALES_CHAT = ["general", "logistica", "creatividad", "pagos"] as const;

/** Lo que se precarga en el seguimiento de un proyecto nuevo. `dias` es cuántos antes del evento vence. */
export const CHECKLIST_BASE = [
  { texto: "Contrato firmado por el cliente", categoria: "cliente", dias: 20 },
  { texto: "Anticipo del cliente recibido", categoria: "pagos", dias: 18 },
  { texto: "Seguro de responsabilidad civil", categoria: "logística", dias: 14 },
  { texto: "Acreditaciones del equipo", categoria: "logística", dias: 10 },
  { texto: "Plan de montaje aprobado por el predio", categoria: "logística", dias: 7 },
  { texto: "Confirmación final de proveedores", categoria: "proveedores", dias: 5 },
  { texto: "Reunión de equipo en el lugar", categoria: "equipo", dias: 2 },
] as const;

/** Lista fija para que Dirección pueda sumar por motivo. */
export const MOTIVOS_PERDIDA = ["Precio", "Eligió otra productora", "El cliente canceló el evento", "Sin presupuesto del cliente", "No llegamos con los tiempos", "Sin respuesta del cliente", "Otro"] as const;

/** El motivo se guarda como «Precio — detalle»: para sumar sólo cuenta lo de la lista. */
export const motivoBase = (motivo: string): string => motivo.split(" — ")[0].trim();

export function codigoProyecto(numero: number, creado: Date): string {
  return `${creado.getFullYear()}-${String(numero).padStart(3, "0")}`;
}

export function aPesos(monto: number, moneda: string, tiposDeCambio: Readonly<Record<string, number>>): number {
  if (moneda === "ARS") return monto;
  return redondear(monto * (tiposDeCambio[moneda] ?? 0));
}

/** Pesos por unidad de la moneda de venta. Enviada la versión queda fijo; antes, el de hoy. 0 si falta. PURA. */
export function cambioDeVenta(moneda: string, tcVenta: number | null | undefined, tc: Readonly<Record<string, number>>): number {
  if (moneda === "ARS") return 1;
  return tcVenta ?? tc[moneda] ?? 0;
}

/** Internamente todo se calcula en pesos: esto es lo que ve y paga el cliente. Sin cambio, se queda en pesos antes que inventar uno. PURA. */
export function enMonedaDeVenta(enPesos: number, cambio: number): number {
  return cambio > 0 ? redondear(enPesos / cambio) : enPesos;
}

export function ventaEn(enPesos: number, moneda: string, cambio: number): string {
  return moneda === "ARS" || !(cambio > 0) ? pesos(enPesos) : pesos(enMonedaDeVenta(enPesos, cambio), moneda);
}

// ── Ficha del evento ────────────────────────────────────────────────────────

export interface ItemFicha {
  id: string;
  descripcion: string;
  rubro: string;
  cantidad: number;
  costo: number; // unitario, en la moneda del ítem
  moneda: string;
  recargoPct: number | null;
  precio: number; // unitario en pesos, si alguien lo fijó a mano; 0 = sale del recargo
  fechaLimite: Date | null;
  supplierId: string | null;
}

export function costoTotalItem(i: Pick<ItemFicha, "cantidad" | "costo" | "moneda">, tc: Readonly<Record<string, number>>): number {
  return redondear(i.cantidad * aPesos(i.costo, i.moneda, tc));
}

export function ventaTotalItem(i: Pick<ItemFicha, "cantidad" | "costo" | "moneda" | "recargoPct" | "precio">, tc: Readonly<Record<string, number>>, recargoGeneral: number): number {
  if (i.precio > 0) return redondear(i.cantidad * i.precio);
  const recargo = i.recargoPct ?? recargoGeneral;
  return redondear(costoTotalItem(i, tc) * (1 + recargo / 100));
}

export interface TotalesFicha {
  items: number;
  venta: number;
  costo: number;
  margen: number;
  margenPct: number;
  /** ¿Algún ítem tiene costo? Sin costo, el margen sería la venta entera (100 %): no se muestra (MIA-194 · punto 2). */
  costoCargado: boolean;
}

/** La celda «Costo»: sin costo cargado no es $ 0, es que falta. PURA. */
export function costoParaMostrar(t: Pick<TotalesFicha, "costo" | "costoCargado">): string {
  return t.costoCargado ? pesos(t.costo) : "Sin cargar";
}

/** La celda «Margen» con el importe en la moneda que muestre la pantalla; sin costo cargado, no hay margen. PURA. */
export function margenParaMostrar(t: Pick<TotalesFicha, "margen" | "margenPct" | "costoCargado">, importe: (n: number) => string): string {
  return t.costoCargado ? `${importe(t.margen)} (${porcentaje(t.margenPct)})` : "Falta el costo";
}

/** Un enlace que acompaña a un error de la ficha: el lugar donde se arregla (MIA-194 · punto 3). */
export interface EnlaceDeArreglo {
  href: string;
  texto: string;
}

/**
 * Sin tipo de cambio de la moneda de venta no se puede escribir un precio. Quien abre Administración («Empresa · ver») recibe el
 * enlace a Monedas y gastos fijos; quien no, a quién pedírselo (un enlace que rebota no ayuda). PURA.
 */
export function faltaCambioDeVenta(moneda: string, abreAdministracion: boolean): { ok: false; error: string; enlace?: EnlaceDeArreglo } {
  return abreAdministracion
    ? { ok: false, error: `Falta el tipo de cambio de ${moneda}: cargalo en Monedas y gastos fijos.`, enlace: { href: "/admin/proyectos/administracion?tab=monedas", texto: "Ir a Monedas y gastos fijos" } }
    : { ok: false, error: `Falta el tipo de cambio de ${moneda}: pedile a Administración que lo cargue en Monedas y gastos fijos.` };
}

export function totalesFicha(items: readonly ItemFicha[], tc: Readonly<Record<string, number>>, recargoGeneral: number): TotalesFicha {
  const venta = redondear(items.reduce((s, i) => s + ventaTotalItem(i, tc, recargoGeneral), 0));
  const costo = redondear(items.reduce((s, i) => s + costoTotalItem(i, tc), 0));
  const margen = redondear(venta - costo);
  const costoCargado = items.some((i) => costoTotalItem(i, tc) > 0);
  return { items: items.length, venta, costo, margen, margenPct: venta > 0 ? redondear((margen / venta) * 100) : 0, costoCargado };
}

/** MIA-199 · P3-2: con el total vendido congelado (pesos sin IVA), la venta es ésa y el margen sale de ella. PURA. */
export function conVentaCongelada(t: TotalesFicha, congelado: number | null | undefined): TotalesFicha {
  if (congelado == null) return t;
  const venta = redondear(congelado);
  const margen = redondear(venta - t.costo);
  return { ...t, venta, margen, margenPct: venta > 0 ? redondear((margen / venta) * 100) : 0 };
}

// ── Cuotas: lo que la ficha genera sola ─────────────────────────────────────

export interface CuotaPlaneada {
  clave: string;
  tipo: "COBRO" | "PAGO";
  concepto: string;
  monto: number;
  moneda: string;
  venceEl: Date;
  supplierId: string | null;
}

export interface DatosPlan {
  proyectoId: string;
  nombre: string;
  fechaEvento: Date | null;
  creado: Date;
  anticipoClientePct: number;
  /** El cliente paga con IVA; el costo del proveedor se compara y se paga neto (provisional, a confirmar con MIA). */
  ivaPct: number;
  recargoGeneral: number;
  tiposDeCambio: Readonly<Record<string, number>>;
  /** En qué moneda paga el cliente y a qué cambio. Sin esto, en pesos. */
  monedaVenta?: string;
  cambioVenta?: number;
  /** % de anticipo de cada proveedor; sin dato, 50. */
  anticipoProveedor: Readonly<Record<string, number>>;
  /** MIA T06 · O12: % de anticipo de cada línea (por id de ítem); manda sobre el del proveedor. */
  anticipoLinea?: Readonly<Record<string, number>>;
  /** MIA T06 · R8: los días del plan leídos del catálogo (`plan.*`). Sin esto, los de siempre. */
  dias?: DiasDelPlan;
  /** MIA T07 · O16: el total de venta congelado en la foto de la aprobación, en pesos sin IVA. Manda sobre los ítems. */
  ventaCongelada?: number | null;
}

/** Un proyecto genera plata cuando está confirmado: antes es una cotización. */
export const ETAPAS_CON_CUOTAS = ["APROBADO", "PRODUCCION", "ARMADO", "DESARME", "CIERRE"] as const;
export const generaCuotas = (etapa: string): boolean => (ETAPAS_CON_CUOTAS as readonly string[]).includes(etapa);

/** Sin confirmar o sin fecha, la cuota es una previsión: todavía no es plata de nadie. PURA. */
export const cuotaPrevista = (etapa: string, fechaEvento: Date | null): boolean => !generaCuotas(etapa) || !fechaEvento;

/**
 * Si la cuota es previsión. Una cuota que ya fue firme no vuelve a serlo: un retroceso de etapa o una fecha borrada no le
 * cambia el vencimiento ni la saca de «Cobros vencidos», y al volver a confirmar no nace otra vez (MIA-089 · V1;
 * provisional a confirmar por el dueño). PURA.
 */
export const previstaDeLaCuota = (prevista: boolean, previa?: { prevista: boolean }): boolean => prevista && (!previa || previa.prevista);

/**
 * De cuándo es la cuota. Una fecha corregida a mano no se pisa. El anticipo del cliente vence el día que se confirma, no el
 * día que entró el lead (naceria vencido), y después queda fijo. `prevista` es lo que pide el PLAN: una cuota que ya fue
 * firme y que el plan vuelve a pedir como previsión (el proyecto volvió a Lead o se quedó sin fecha) conserva su
 * vencimiento (MIA-089 · V1, tomado del WIP de MIA-089 por MIA-094; provisional a confirmar por el dueño). PURA.
 */
export function venceDeLaCuota(d: { clave: string; plan: Date; prevista: boolean; hoy: Date; previa?: { venceEl: Date; venceManual: boolean; prevista: boolean } }): Date {
  if (d.previa?.venceManual) return d.previa.venceEl;
  const firme = !!d.previa && !d.previa.prevista;
  const sena = d.clave.endsWith(":cliente:anticipo");
  if (firme && (d.prevista || sena)) return d.previa!.venceEl;
  if (!sena || d.prevista) return d.plan;
  return d.hoy;
}

/**
 * Lo que el cashflow no ve: un ítem con costo y sin proveedor no genera pago, y el saldo queda mejor de lo real. En pesos.
 * MIA-211 · H3: `imputado` (en pesos) es el costo de los comprobantes imputados al proyecto de proveedores que ningún
 * ítem tiene: ese ya está en el cashflow (H2) y se descuenta. Cubierto todo, no hay cartel (`cuantos` 0). PURA.
 */
export function costoSinProveedor(items: readonly { costo: number; cantidad: number; moneda: string; supplierId: string | null }[], tc: Record<string, number>, imputado = 0): { cuantos: number; monto: number } {
  const sueltos = items.filter((i) => !i.supplierId && i.costo > 0 && i.cantidad > 0);
  const monto = redondear(Math.max(0, sueltos.reduce((s, i) => s + aPesos(i.cantidad * i.costo, i.moneda, tc), 0) - imputado));
  return { cuantos: monto > 0 ? sueltos.length : 0, monto };
}


/**
 * Anticipo y saldo de cada ítem con proveedor, y anticipo y saldo del cliente. La clave identifica el tramo: regenerar
 * actualiza lo pendiente sin duplicar. Un ítem pagado por completo al 100 % de anticipo no tiene saldo, y viceversa.
 */
export function planDeCuotas(items: readonly ItemFicha[], d: DatosPlan): CuotaPlaneada[] {
  // Sin fecha salen igual, como previsión: el vencimiento que llevan no se muestra (ver `cuotaPrevista`).
  const evento = (d.fechaEvento ?? d.creado).getTime();
  const dias = d.dias ?? DIAS_POR_DEFECTO;
  const salida: CuotaPlaneada[] = [];
  for (const i of items) {
    if (!i.supplierId || !(i.costo > 0)) continue;
    const total = redondear(i.cantidad * i.costo);
    const pct = anticipoDeLaLinea(d.anticipoLinea?.[i.id], d.anticipoProveedor[i.supplierId]);
    const anticipo = redondear((total * pct) / 100);
    const saldo = redondear(total - anticipo);
    const venceAnticipo = i.fechaLimite ?? new Date(evento - dias.anticipoProveedorAntes * DIA);
    if (anticipo > 0) salida.push({ clave: `${d.proyectoId}:${i.id}:anticipo`, tipo: "PAGO", concepto: `${i.descripcion} (anticipo)`, monto: anticipo, moneda: i.moneda, venceEl: venceAnticipo, supplierId: i.supplierId });
    if (saldo > 0) salida.push({ clave: `${d.proyectoId}:${i.id}:saldo`, tipo: "PAGO", concepto: `${i.descripcion} (saldo)`, monto: saldo, moneda: i.moneda, venceEl: new Date(evento + dias.saldoProveedorDespues * DIA), supplierId: i.supplierId });
  }
  const venta = d.ventaCongelada ?? totalesFicha(items, d.tiposDeCambio, d.recargoGeneral).venta;
  if (venta > 0) {
    const pct = Math.min(100, Math.max(0, d.anticipoClientePct));
    const monedaCliente = d.monedaVenta && d.monedaVenta !== "ARS" && (d.cambioVenta ?? 0) > 0 ? d.monedaVenta : "ARS";
    const conIva = enMonedaDeVenta(redondear(venta * (1 + d.ivaPct / 100)), monedaCliente === "ARS" ? 1 : d.cambioVenta!);
    const anticipo = redondear((conIva * pct) / 100);
    const saldo = redondear(conIva - anticipo);
    if (anticipo > 0) salida.push({ clave: `${d.proyectoId}:cliente:anticipo`, tipo: "COBRO", concepto: `${d.nombre} — anticipo del cliente`, monto: anticipo, moneda: monedaCliente, venceEl: d.creado, supplierId: null });
    if (saldo > 0) salida.push({ clave: `${d.proyectoId}:cliente:saldo`, tipo: "COBRO", concepto: `${d.nombre} — saldo del cliente`, monto: saldo, moneda: monedaCliente, venceEl: new Date(evento - dias.saldoClienteAntes * DIA), supplierId: null });
  }
  return salida;
}

export interface CuotaLeida {
  id?: string;
  clave?: string | null;
  tipo: string;
  monto: number;
  moneda: string;
  venceEl: Date;
  pagadoEl: Date | null;
  anuladoEl?: Date | null;
  concepto?: string;
}

export type EstadoCuota = "PAGADA" | "VENCIDA" | "PENDIENTE";

export function estadoCuota(c: Pick<CuotaLeida, "venceEl" | "pagadoEl">, hoy: Date = new Date()): EstadoCuota {
  if (c.pagadoEl) return "PAGADA";
  return yaVencio(c.venceEl, hoy) ? "VENCIDA" : "PENDIENTE";
}

export function diasDeAtraso(venceEl: Date, hoy: Date = new Date()): number {
  return Math.max(0, Math.floor((hoy.getTime() - venceEl.getTime()) / DIA));
}

export interface LineaCashflow<T> {
  cuota: T;
  importe: number; // con signo, en pesos
  saldo: number;
}

/**
 * Cada movimiento por fecha y el saldo que deja. El máximo a financiar es lo más abajo de cero que llega ese saldo.
 * `montoDe` (en la moneda de la cuota): lo que cuenta cada cuota; sin él, su monto. Una cuota de cobro ya cobrada debe
 * contar lo que entró por ella, no su monto (ver `repartoDeCobros`).
 */
export function cashflowDelEvento<T extends CuotaLeida>(cuotas: readonly T[], tc: Readonly<Record<string, number>>, montoDe: (c: T) => number = (c) => c.monto, inicial = 0): { lineas: LineaCashflow<T>[]; inicial: number; saldoFinal: number; maximoAFinanciar: number } {
  const orden = cuotas.filter((c) => !c.anuladoEl).slice().sort((a, b) => a.venceEl.getTime() - b.venceEl.getTime() || (a.tipo === "COBRO" ? -1 : 1));
  // `inicial`: lo cobrado que no está en ninguna cuota viva (`RepartoDeCobros.suelto`). Entró igual: el saldo arranca con
  // eso (un perdido con un cobro hecho termina en lo cobrado, no en cero; MIA-089 · V2).
  inicial = redondear(Math.max(0, inicial));
  let saldo = inicial;
  let minimo = 0;
  const lineas = orden.map((cuota) => {
    const pesos = aPesos(montoDe(cuota), cuota.moneda, tc);
    const importe = cuota.tipo === "COBRO" ? pesos : -pesos;
    saldo = redondear(saldo + importe);
    minimo = Math.min(minimo, saldo);
    return { cuota, importe, saldo };
  });
  return { lineas, inicial, saldoFinal: saldo, maximoAFinanciar: redondear(-minimo) };
}

export interface ResumenCuotas {
  aCobrar: number;
  aCobrar7: number;
  cobrosVencidos: number;
  cantCobrosVencidos: number;
  aPagar: number;
  aPagar7: number;
  pagosVencidos: number;
  cantPagosVencidos: number;
  cobrado: number;
  pagado: number;
}

export function resumenCuotas(cuotas: readonly CuotaLeida[], tc: Readonly<Record<string, number>>, hoy: Date = new Date()): ResumenCuotas {
  const r: ResumenCuotas = { aCobrar: 0, aCobrar7: 0, cobrosVencidos: 0, cantCobrosVencidos: 0, aPagar: 0, aPagar7: 0, pagosVencidos: 0, cantPagosVencidos: 0, cobrado: 0, pagado: 0 };
  const en7 = hoy.getTime() + 7 * DIA;
  for (const c of cuotas) {
    if (c.anuladoEl) continue;
    const pesos = aPesos(c.monto, c.moneda, tc);
    const esCobro = c.tipo === "COBRO";
    if (c.pagadoEl) {
      if (esCobro) r.cobrado += pesos;
      else r.pagado += pesos;
      continue;
    }
    const vencida = yaVencio(c.venceEl, hoy);
    const pronto = !vencida && c.venceEl.getTime() <= en7;
    if (esCobro) {
      r.aCobrar += pesos;
      if (pronto) r.aCobrar7 += pesos;
      if (vencida) {
        r.cobrosVencidos += pesos;
        r.cantCobrosVencidos++;
      }
    } else {
      r.aPagar += pesos;
      if (pronto) r.aPagar7 += pesos;
      if (vencida) {
        r.pagosVencidos += pesos;
        r.cantPagosVencidos++;
      }
    }
  }
  for (const k of ["aCobrar", "aCobrar7", "cobrosVencidos", "aPagar", "aPagar7", "pagosVencidos", "cobrado", "pagado"] as const) r[k] = redondear(r[k]);
  return r;
}

// ── Empresa ─────────────────────────────────────────────────────────────────

export interface GastoFijoLeido {
  tipo: string;
  frecuencia: string;
  monto: number;
  moneda: string;
  fecha: Date | null;
  activo: boolean;
}

export interface MesProyectado {
  mes: string; // AAAA-MM
  cobros: number;
  proveedores: number;
  sueldos: number;
  fijos: number;
  impuestos: number;
  neto: number;
  saldo: number;
}

export const claveMes = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Caja de hoy + lo previsto mes a mes. Lo vencido sin pagar cae en el mes actual: sigue pendiente de salir o de entrar.
 * Una cuota de cobro con `pendiente` (lo que le falta, del reparto de la cobranza: `repartoDelNegocio`) entra por eso y no
 * por su monto: un cobro registrado a mano por fuera ya está en la caja y no se cuenta dos veces.
 */
export function proyeccionDeCaja(d: {
  cajaHoy: number;
  cuotas: readonly (CuotaLeida & { pendiente?: number })[];
  sueldosMes: number;
  fijos: readonly GastoFijoLeido[];
  tiposDeCambio: Readonly<Record<string, number>>;
  meses: number;
  hoy?: Date;
}): MesProyectado[] {
  const hoy = d.hoy ?? new Date();
  const salida: MesProyectado[] = [];
  let saldo = d.cajaHoy;
  for (let n = 0; n < d.meses; n++) {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + n, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + n + 1, 1);
    const mes = claveMes(inicio);
    let cobros = 0;
    let proveedores = 0;
    for (const c of d.cuotas) {
      if (c.pagadoEl || c.anuladoEl) continue;
      const t = c.venceEl.getTime();
      if (!(t < fin.getTime() && (n === 0 || t >= inicio.getTime()))) continue;
      const pesos = aPesos(c.pendiente != null ? c.pendiente : c.monto, c.moneda, d.tiposDeCambio);
      if (c.tipo === "COBRO") cobros += pesos;
      else proveedores += pesos;
    }
    let fijos = 0;
    let impuestos = 0;
    for (const g of d.fijos) {
      if (!g.activo) continue;
      const toca = g.frecuencia === "MENSUAL" || (g.fecha != null && (g.frecuencia === "ANUAL" ? g.fecha.getMonth() === inicio.getMonth() : claveMes(g.fecha) === mes));
      if (!toca) continue;
      const pesos = aPesos(g.monto, g.moneda, d.tiposDeCambio);
      if (g.tipo === "IMPUESTO") impuestos += pesos;
      else fijos += pesos;
    }
    const neto = redondear(cobros - proveedores - d.sueldosMes - fijos - impuestos);
    saldo = redondear(saldo + neto);
    salida.push({ mes, cobros: redondear(cobros), proveedores: redondear(proveedores), sueldos: d.sueldosMes, fijos: redondear(fijos), impuestos: redondear(impuestos), neto, saldo });
  }
  return salida;
}

/** Lo que pesa un proyecto en el pipeline: su venta y, sin ítems todavía, lo estimado. Una sola regla para el tablero y Dirección. PURA. */
export const ventaOEstimado = (venta: number, estimado: number | null, moneda: string, tc: Readonly<Record<string, number>>): number =>
  venta > 0 ? venta : estimado ? aPesos(estimado, moneda, tc) : 0;

export const PROBABILIDAD_PROPUESTA = 0.4;

/** Las propuestas enviadas pesan 40 %. Es un escenario: no suma al saldo. */
export function pipelinePonderado(proyectos: readonly { etapa: string; venta: number; perdidoEl?: Date | null }[]): number {
  return redondear(proyectos.filter((p) => p.etapa === "PROPUESTA" && !p.perdidoEl).reduce((s, p) => s + p.venta * PROBABILIDAD_PROPUESTA, 0));
}

// ── Equipo ──────────────────────────────────────────────────────────────────

export type NivelCarga = "ALTA" | "MEDIA" | "BAJA";
export const NIVEL_LABEL: Record<NivelCarga, string> = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };

export function nivelDeCarga(tareasAbiertas: number): NivelCarga {
  if (tareasAbiertas >= 10) return "ALTA";
  if (tareasAbiertas >= 5) return "MEDIA";
  return "BAJA";
}

export function periodoAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return claveMes(new Date(a, m - 2, 1));
}

export interface ExtraLiquidacion {
  proyectoId: string;
  nombre: string;
  monto: number;
}

/**
 * El plus se cobra el mes en que el evento terminó. T12 (O25, «no se paga dos veces»): `conReparto` son los proyectos
 * que se liquidan por el reparto (negocio con el reparto prendido y precio aprobado con su foto); ahí el plus no entra.
 */
export function extrasDelPeriodo(equipos: readonly { plus: number; proyecto: { id: string; nombre: string; fechaEvento: Date | null; fechaFin: Date | null } }[], periodo: string, conReparto: ReadonlySet<string> = new Set()): ExtraLiquidacion[] {
  return equipos
    .filter((e) => {
      const f = e.proyecto.fechaFin ?? e.proyecto.fechaEvento;
      return e.plus > 0 && !!f && claveMes(f) === periodo && !conReparto.has(e.proyecto.id);
    })
    .map((e) => ({ proyectoId: e.proyecto.id, nombre: e.proyecto.nombre, monto: e.plus }));
}

// ── Versiones ───────────────────────────────────────────────────────────────

export interface FotoItem {
  clave: string; // descripción normalizada: una versión copia los ítems, no conserva el id
  descripcion: string;
  rubro: string;
  importe: number;
  costo?: number; // en pesos, al enviar: el margen de lo enviado no se mueve con el dólar de hoy
}

export interface CambioVersion {
  tipo: "modificado" | "agregado" | "quitado";
  descripcion: string;
  rubro: string;
  antes: number | null;
  despues: number | null;
}

export const claveFoto = (descripcion: string): string => descripcion.trim().toLowerCase();

export function cambiosEntreVersiones(anterior: readonly FotoItem[], nueva: readonly FotoItem[]): { totalAnterior: number; totalNuevo: number; diferencia: number; cambios: CambioVersion[] } {
  const previos = new Map(anterior.map((i) => [i.clave, i]));
  const cambios: CambioVersion[] = [];
  for (const i of nueva) {
    const p = previos.get(i.clave);
    if (!p) cambios.push({ tipo: "agregado", descripcion: i.descripcion, rubro: i.rubro, antes: null, despues: i.importe });
    else if (p.importe !== i.importe) cambios.push({ tipo: "modificado", descripcion: i.descripcion, rubro: i.rubro, antes: p.importe, despues: i.importe });
    previos.delete(i.clave);
  }
  for (const p of previos.values()) cambios.push({ tipo: "quitado", descripcion: p.descripcion, rubro: p.rubro, antes: p.importe, despues: null });
  const totalAnterior = redondear(anterior.reduce((s, i) => s + i.importe, 0));
  const totalNuevo = redondear(nueva.reduce((s, i) => s + i.importe, 0));
  return { totalAnterior, totalNuevo, diferencia: redondear(totalNuevo - totalAnterior), cambios };
}

// ── Bancos ──────────────────────────────────────────────────────────────────

export interface LineaExtracto {
  fecha: Date;
  descripcion: string;
  importe: number;
}

/** Una fila de CSV: respeta comillas, porque un importe con coma decimal suele venir entre ellas. */
function celdas(linea: string, sep: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let entre = false;
  for (const ch of linea) {
    if (ch === '"') entre = !entre;
    else if (ch === sep && !entre) {
      salida.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  salida.push(actual.trim());
  return salida;
}

/** 1.500,50 · 1,500.50 · 1.500 · -200 · $ 300 · (300). Lo que no es un número da null. PURA. */
export function leerImporte(crudo: string): number | null {
  let s = crudo.replace(/[$\s]|ARS|USD/g, "");
  if (!s) return null;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith("-") || s.endsWith("-");
  s = s.replace(/[()\-+]/g, "");
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (coma >= 0) s = /,\d{3}$/.test(s) && s.length > 4 && s.indexOf(",") !== coma ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return (negativo ? -1 : 1) * Number(s);
}

function leerFecha(crudo: string): Date | null {
  const s = crudo.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (!m || Number(m[2]) > 12 || Number(m[1]) > 31) return null;
  return new Date(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
}

const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Si la primera fila son títulos, dice en qué columna está cada cosa. */
function columnasDelTitulo(fila: readonly string[]) {
  const buscar = (re: RegExp) => fila.findIndex((c) => re.test(sinAcentos(c)));
  const fecha = buscar(/^fecha/);
  const importe = buscar(/importe|monto/);
  const debito = buscar(/debito|^debe|egreso/);
  const credito = buscar(/credito|^haber|ingreso/);
  if (fecha < 0 || (importe < 0 && debito < 0 && credito < 0)) return null;
  return { fecha, importe, debito, credito, descripcion: buscar(/descripcion|concepto|detalle|referencia|movimiento/) };
}

/**
 * Extracto en CSV de cualquier banco. Con títulos, se guía por ellos: ignora el saldo y entiende débito y crédito en
 * columnas separadas. Sin títulos, entiende fecha;descripción;importe y, si las dos últimas son números, la última es el saldo.
 */
export function leerExtracto(csv: string): { lineas: LineaExtracto[]; ilegibles: number } {
  const lineas: LineaExtracto[] = [];
  let ilegibles = 0;
  const filas = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
  const sep = filas.some((f) => f.includes(";")) ? ";" : filas.some((f) => f.includes("\t")) ? "\t" : ",";
  let titulos: ReturnType<typeof columnasDelTitulo> = null;
  for (const fila of filas) {
    const partes = celdas(fila, sep);
    if (!titulos && lineas.length === 0) {
      titulos = columnasDelTitulo(partes);
      if (titulos) continue;
    }
    if (partes.length < 3) {
      ilegibles++;
      continue;
    }
    let fecha: Date | null;
    let importe: number | null;
    let descripcion: string;
    if (titulos) {
      fecha = leerFecha(partes[titulos.fecha] ?? "");
      descripcion = titulos.descripcion >= 0 ? (partes[titulos.descripcion] ?? "") : "";
      if (titulos.importe >= 0) importe = leerImporte(partes[titulos.importe] ?? "");
      else {
        const debe = titulos.debito >= 0 ? leerImporte(partes[titulos.debito] ?? "") : null;
        const haber = titulos.credito >= 0 ? leerImporte(partes[titulos.credito] ?? "") : null;
        importe = debe === null && haber === null ? null : (haber ?? 0) - Math.abs(debe ?? 0);
      }
    } else {
      fecha = leerFecha(partes[0]);
      const ultima = leerImporte(partes[partes.length - 1]);
      const penultima = partes.length > 3 ? leerImporte(partes[partes.length - 2]) : null;
      const conSaldo = ultima !== null && penultima !== null;
      importe = conSaldo ? penultima : (ultima ?? penultima);
      descripcion = partes.slice(1, conSaldo || ultima === null ? -2 : -1).join(" ").trim();
    }
    if (!fecha || importe === null || importe === 0) {
      ilegibles++;
      continue;
    }
    lineas.push({ fecha, descripcion, importe });
  }
  return { lineas, ilegibles };
}

/** Propone la cuota por importe y signo; entre varias iguales, la de fecha más cercana. No concilia sola: sólo propone. */
export function cuotaParaMovimiento<T extends CuotaLeida>(mov: LineaExtracto, cuotas: readonly T[], tc: Readonly<Record<string, number>>): T | null {
  const candidatas = cuotas.filter((c) => !c.anuladoEl && (c.tipo === "COBRO") === mov.importe > 0 && Math.abs(aPesos(c.monto, c.moneda, tc) - Math.abs(mov.importe)) < 0.01);
  if (candidatas.length === 0) return null;
  return candidatas.slice().sort((a, b) => Math.abs(a.venceEl.getTime() - mov.fecha.getTime()) - Math.abs(b.venceEl.getTime() - mov.fecha.getTime()))[0];
}

// ── Permisos ────────────────────────────────────────────────────────────────

/**
 * Lo ya pagado no se regenera, así que el resto del plan absorbe la diferencia: si la venta sube después del anticipo, el saldo
 * cubre lo que falta, y si ya estaba todo pagado sale una cuota de ajuste. Si baja, no se pide de más. PURA.
 */
export function ajustarAPagado<T extends { clave: string; concepto: string; monto: number }>(plan: readonly T[], pagadas: readonly { clave: string; monto: number }[]): T[] {
  const base = (clave: string) => clave.slice(0, clave.lastIndexOf(":"));
  const yaPagadas = new Set(pagadas.map((p) => p.clave));
  const salida: T[] = [];
  for (const b of new Set(plan.map((c) => base(c.clave)))) {
    const grupo = plan.filter((c) => base(c.clave) === b);
    const total = grupo.reduce((s, c) => s + c.monto, 0);
    const pagado = pagadas.filter((p) => base(p.clave) === b).reduce((s, p) => s + p.monto, 0);
    salida.push(...grupo.filter((c) => yaPagadas.has(c.clave)));
    const pendientes = grupo.filter((c) => !yaPagadas.has(c.clave));
    let resto = redondear(total - pagado);
    if (pendientes.length === 0) {
      if (resto > 0) salida.push({ ...grupo[grupo.length - 1], clave: `${b}:ajuste`, concepto: `${grupo[grupo.length - 1].concepto} (ajuste)`, monto: resto });
      continue;
    }
    pendientes.forEach((c, i) => {
      const monto = redondear(Math.max(0, i === pendientes.length - 1 ? resto : Math.min(c.monto, resto)));
      resto = redondear(resto - monto);
      if (monto > 0) salida.push({ ...c, monto });
    });
  }
  return salida;
}

/** Cuánto mueve una cuota el saldo de la cuenta elegida. `null` si la cuenta es de otra moneda y no se puede expresar sin inventar un cambio. PURA. */
export function movimientoDeCuenta(d: { tipo: string; monto: number; moneda: string; importeEnPesos: number; monedaCuenta: string }): number | null {
  const valor = d.moneda === d.monedaCuenta ? d.monto : d.monedaCuenta === "ARS" ? d.importeEnPesos : null;
  return valor === null ? null : redondear(d.tipo === "COBRO" ? valor : -valor);
}

/**
 * MIA-50 T11 (O47): «Producción de campo» (`PRODUCCION_CAMPO`) ve agenda, tareas, lista de control y sus gastos, y no recibe
 * precios, márgenes ni costos ajenos. Es texto en `ProyectoPersona.rol`: sin migración.
 */
export const ROLES_GESTION = ["DIRECCION", "ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION", "PRODUCCION_CAMPO"] as const;
/** `SIN_FICHA` no se asigna: es quien entra sin estar cargado en el equipo, y no abre nada más que Inicio. */
export type RolGestion = (typeof ROLES_GESTION)[number] | "SIN_FICHA";
export const ROL_LABEL: Record<RolGestion, string> = { DIRECCION: "Dirección", ADMINISTRACION: "Administración", COMERCIAL: "Productor comercial", DISENO: "Diseño", PRODUCCION: "Producción", PRODUCCION_CAMPO: "Productor de campo", SIN_FICHA: "Sin ficha" };

/** Sólo el dueño entra como Dirección sin ficha: tiene que poder armar el equipo. Cualquier otro espera a que lo carguen. */
export function rolDelActor(rolDeLaFicha: string | null | undefined, rolDelErp: string, rolDeLaFichaDeBaja?: string | null): RolGestion {
  if ((ROLES_GESTION as readonly string[]).includes(rolDeLaFicha ?? "")) return rolDeLaFicha as RolGestion;
  if (rolDelErp !== "OWNER") return "SIN_FICHA";
  // MIA-238: la Dueña (puesto «Dueño/a» del alta) es la OWNER sin ficha. Una OWNER cuya ficha de otro puesto está de baja
  // no es la Dueña: no hereda Dirección. Con una ficha de Dirección de baja, sigue Dirección (no gana nada que no tenía).
  return rolDeLaFichaDeBaja && rolDeLaFichaDeBaja !== "DIRECCION" ? "SIN_FICHA" : "DIRECCION";
}

export const MODULOS = [
  { id: "pipeline", label: "Proyectos y leads" },
  { id: "ficha", label: "Ficha del evento" },
  { id: "costos", label: "Costos y márgenes" },
  { id: "proveedores", label: "Proveedores" },
  { id: "cotizaciones", label: "Cotizaciones y planilla de venta" },
  { id: "diseno", label: "Diseño: tareas, versiones, ideas" },
  { id: "pagos", label: "Pagos y cobros del evento" },
  { id: "empresa", label: "Cuentas, cashflow y bancos" },
  { id: "liquidaciones", label: "Liquidaciones del equipo" },
  { id: "direccion", label: "Tablero y reportes de Dirección" },
  { id: "equipo", label: "Equipo, roles y permisos" },
  { id: "ia", label: "Estudio IA y agentes" },
  { id: "rendiciones", label: "Rendiciones de gastos" },
] as const;
export type ModuloGestion = (typeof MODULOS)[number]["id"];

export const COLUMNAS_FICHA = [
  { id: "costoUnit", label: "Costo unitario" },
  { id: "costoTotal", label: "Costo total" },
  { id: "recargo", label: "Recargo %" },
  { id: "margen", label: "Margen" },
] as const;

type Permiso = { ver: boolean; editar: boolean };
const V: Permiso = { ver: true, editar: false };
const E: Permiso = { ver: true, editar: true };
const N: Permiso = { ver: false, editar: false };

export const PERMISOS_BASE: Record<Exclude<RolGestion, "DIRECCION">, Record<ModuloGestion, Permiso>> = {
  // MIA-229 · «Producción no» (orden del dueño, 20/11): no paga órdenes ni ve plata. `pagos` a N; igual lo traba `permisoDe`.
  PRODUCCION: { pipeline: E, ficha: E, costos: E, proveedores: E, cotizaciones: E, diseno: E, pagos: N, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: E, rendiciones: V },
  DISENO: { pipeline: V, ficha: V, costos: N, proveedores: N, cotizaciones: V, diseno: E, pagos: N, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: E, rendiciones: N },
  ADMINISTRACION: { pipeline: V, ficha: V, costos: V, proveedores: E, cotizaciones: V, diseno: N, pagos: E, empresa: E, liquidaciones: E, direccion: N, equipo: N, ia: N, rendiciones: E },
  // MIA-237 · productor comercial (dueño, 20/11: «es B, ve costos tmb»): costos en «ver», fijo (`FIJOS_DEL_PUESTO`).
  COMERCIAL: { pipeline: E, ficha: V, costos: V, proveedores: N, cotizaciones: E, diseno: E, pagos: N, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: E, rendiciones: V },
  // O47: la ficha y el proyecto en «ver» (tareas, lista de control, agenda); «rendiciones» en ver = rinde lo propio. Nada de
  // costos, cotizaciones, pagos, empresa ni liquidaciones: no le llegan precios, márgenes ni costos ajenos.
  PRODUCCION_CAMPO: { pipeline: V, ficha: V, costos: N, proveedores: N, cotizaciones: N, diseno: N, pagos: N, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: N, rendiciones: V },
  SIN_FICHA: { pipeline: N, ficha: N, costos: N, proveedores: N, cotizaciones: N, diseno: N, pagos: N, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: N, rendiciones: N },
};

/**
 * Rendí (plan MIA §2). El permiso `rendiciones` del módulo es el piso de lo que se ve: `V` = sólo lo propio,
 * `E` = todo y aprobar/reintegrar. Las acciones finas no dependen de `pagos`: van por estas funciones puras.
 * DISENO no rinde (provisional a confirmar).
 */
const ROLES_QUE_RINDEN: readonly RolGestion[] = ["DIRECCION", "ADMINISTRACION", "COMERCIAL", "PRODUCCION", "PRODUCCION_CAMPO"];
const ROLES_QUE_APRUEBAN_RENDICIONES: readonly RolGestion[] = ["DIRECCION", "ADMINISTRACION"];

/** MIA-223 · el rol de gestión que ve y mueve la plata de Proyectos (lo usa `veLaPlata`, datos.server.ts). PURA. */
export const rolVeLaPlata = (rol: RolGestion): boolean => ROLES_QUE_APRUEBAN_RENDICIONES.includes(rol);

/**
 * MIA-237 · lo que cada puesto ve de la plata de un proyecto (dueño, 20/11 13:05Z, confirmado 13:25Z):
 *  · Dirección y Administración: toda (`rolVeLaPlata`).
 *  · Productor comercial: lo cobrado y lo que falta cobrar, y los costos; no los pagos ni las deudas con proveedores.
 *  · Producción: los costos para presupuestar (P3), sin cobros ni pagos. Diseño, como estaba.
 *  · Productor de campo y quien no tiene ficha: ningún importe, ni la venta. Rinde lo suyo igual.
 * PURAS: las usan la vista de la ficha (`vistaDe`, ficha.server.ts) y sus lecturas.
 */
export const veLosCobros = (rol: RolGestion): boolean => rolVeLaPlata(rol) || rol === "COMERCIAL";
/**
 * MIA-238 · «ve sólo lo cobrado y lo que falta cobrar de sus proyectos» (dueño, 20/11 13:05Z, opción B). Sus proyectos: los
 * de su equipo (`ProyectoEquipo`; quien crea el proyecto entra como «Responsable»). En los demás sigue viendo el lead, sin
 * cobros ni costos. MIA-244 · un puesto sin importes (`veImportes`: productor de campo, sin ficha) no ve la plata de ningún
 * proyecto, tampoco de los de su equipo («El de campo no ve plata», dueño 20/11). El resto, como estaba (su permiso). PURA.
 */
export const veLaPlataDelProyecto = (rol: RolGestion, estaEnEquipo: boolean): boolean => veImportes(rol) && (rol !== "COMERCIAL" || estaEnEquipo);
/**
 * MIA-239 · en un proyecto ajeno (`veLaPlataDelProyecto` en falso) no se ve ningún importe, tampoco la venta (lectura de
 * ORQ-007 de la opción B, a confirmar por el dueño): se cierran costos, cotizaciones y pagos, y editar la ficha (que cambia
 * precios). El resto (pipeline, diseño, ver la ficha sin importes) sigue con su permiso. PURA.
 */
const PLATA_DEL_PROYECTO: readonly ModuloGestion[] = ["costos", "cotizaciones", "pagos"];
export const cerradoEnProyectoAjeno = (modulo: ModuloGestion, accion: "ver" | "editar"): boolean =>
  PLATA_DEL_PROYECTO.includes(modulo) || (modulo === "ficha" && accion === "editar");
export const veImportes = (rol: RolGestion): boolean => rol !== "PRODUCCION_CAMPO" && rol !== "SIN_FICHA";
/**
 * MIA-246 · «Producción: solo los costos» (dueño, 20/11 15:25Z): Producción ve los costos de sus proyectos, nunca la venta ni el
 * margen (ficha, Pipeline, papel y exportes). Un puesto sin importes tampoco. PURAS: las usan `vistaDe` y `tableroPipeline`
 * (ficha.server.ts), `filtroDeProyectosConVenta` (gestion.server.ts) y el precio por total.
 */
export const veLaVenta = (rol: RolGestion): boolean => veImportes(rol) && rol !== "PRODUCCION";
/** MIA-256 (dueño, 20/11 17:36Z): mandar la versión, registrar la respuesta del cliente y cambiar el IVA son de quien ve la venta. */
export const SOLO_LA_VENTA = "Enviar al cliente, registrar su respuesta y el IVA son la venta: tu puesto ve sólo los costos.";
/**
 * MIA-266 · PROD-DISENO A (dueño, 20/11 ~20:50Z): Producción no le manda al cliente la pieza de diseño (la sube y queda en
 * borrador) ni escribe los textos que lee el cliente. Diseño, Comercial y Dirección sí; los puestos sin ficha, tampoco. PURA.
 */
export const hablaConElCliente = (rol: RolGestion): boolean => veImportes(rol) && rol !== "PRODUCCION";
export const SOLO_DISENO_AL_CLIENTE = "Mandarle la pieza al cliente le toca a Diseño, Comercial o Dirección: tu puesto la deja en borrador.";
export const NOTA_DEL_CLIENTE = "La nota la lee el cliente: la escriben Diseño, Comercial o Dirección. Subí la versión sin nota.";
export const TEXTOS_DEL_CLIENTE = "La presentación y las condiciones las lee el cliente: las escribe quien ve la venta.";
/** MIA-256 · el plus de cada integrante es sueldo: lo ven Dirección y Administración, no Comercial (que ve costos). PURA. */
export const veElPlus = (rol: RolGestion): boolean => rol === "DIRECCION" || rol === "ADMINISTRACION";
export const veLaVentaDelProyecto = (rol: RolGestion, estaEnEquipo: boolean): boolean => veLaPlataDelProyecto(rol, estaEnEquipo) && veLaVenta(rol);
/** Columnas de la ficha que se cierran a quien no ve la venta, ni de fábrica ni guardadas por Dirección: el recargo es el margen en %. */
const COLUMNAS_DE_VENTA: readonly string[] = ["venta", "margen", "recargo"];
export const columnasSinVenta = (rol: RolGestion): readonly string[] => (veLaVenta(rol) ? [] : COLUMNAS_DE_VENTA);

/** Rendir lo mío: un rol que rinde y que está en el `ProyectoEquipo` del proyecto (ver todos no alcanza). PURA. */
export function puedeRendir(rol: RolGestion, estaEnEquipo: boolean): boolean {
  return estaEnEquipo && ROLES_QUE_RINDEN.includes(rol);
}

/** Aprobar, devolver o rechazar una rendición: Dirección o Administración, nunca la propia. PURA. */
export function puedeAprobarRendicion(rol: RolGestion, actorId: string, rindeId: string): boolean {
  return ROLES_QUE_APRUEBAN_RENDICIONES.includes(rol) && actorId !== rindeId;
}

/** Pagar o reintegrar: los mismos que aprueban (Administración por caja y liquidación), nunca lo propio. PURA. */
export const puedeReintegrarRendicion = puedeAprobarRendicion;

/** Qué módulo abre cada app de eventos: con uno alcanza. */
const MODULOS_DE_LA_APP: Readonly<Record<string, readonly ModuloGestion[]>> = {
  proyectos: ["pipeline"],
  "gestion-diseno": ["diseno"],
  "gestion-proveedores": ["proveedores"],
  "gestion-administracion": ["empresa", "pagos", "liquidaciones"],
  "gestion-direccion": ["direccion"],
  "gestion-agentes": ["ia"],
  "gestion-propuesta-ia": ["ia"],
  "gestion-equipo": ["equipo"],
  // MIA-50 T11 · Adenda 2 (decisión del dueño del 19/11, «A»): las cuentas generales y el flujo se abren con «Empresa · ver»,
  // la misma regla que Administración de Proyectos. En el servidor lo aplica `puerta-de-gestion.server.ts` (página y acción).
  "cuentas-a-cobrar": ["empresa"],
  "cuentas-a-pagar": ["empresa"],
  "flujo-de-fondos": ["empresa"],
};

export function appDeGestionVisible(appId: string, rol: RolGestion, guardados: readonly { rol: string; modulo: string; ver: boolean; editar: boolean }[]): boolean {
  if (appId === "gestion-inicio") return true;
  // CRM comercial (GSG-CRM-011): sólo llega con su interruptor prendido; quién entra lo decide la membresía del
  // CRM (E16), no el rol del panel: un usuario de puesto del equipo de agentes no tiene ficha y entra igual.
  if (appId === "crm-comercial") return true;
  if (rol === "SIN_FICHA") return false;
  const modulos = MODULOS_DE_LA_APP[appId];
  if (modulos) return modulos.some((m) => permisoDe(rol, m, guardados).ver);
  if (APPS_DE_TODO_EL_EQUIPO.includes(appId)) return true;
  return rol === "DIRECCION" || (APPS_DEL_ERP[rol] ?? []).includes(appId);
}

const APPS_DE_TODO_EL_EQUIPO: readonly string[] = ["gestion-calendario", "gestion-mi-liquidacion"];

/** Las apps de GSG son del mismo rol: Caja, Clientes y Facturación no se duplican, se abren a quien le toca. El rol del ERP sigue siendo el techo. */
const APPS_DEL_ERP: Partial<Record<RolGestion, readonly string[]>> = {
  ADMINISTRACION: ["caja-del-dia", "libro-de-caja", "cierre-del-dia", "facturacion"],
  // Eventos y sponsors (GSG-CRM-009): sólo con su interruptor prendido llega acá (el layout la suma aparte).
  COMERCIAL: ["clientes", "eventos-sponsors"],
};

/** Lo que cada rol tiene a la vista. Dirección puede abrir el resto; los demás, lo que permiten sus módulos. */
const BARRA_DEL_ROL: Record<RolGestion, readonly string[]> = {
  // Caja a la vista de Dirección (QA MIA #6): el rol del ERP sigue siendo el techo (`appsVisibles` pide orders:read).
  DIRECCION: ["gestion-inicio", "gestion-direccion", "gestion-administracion", "proyectos", "gestion-calendario", "gestion-equipo", "cuentas-a-cobrar", "cuentas-a-pagar", "flujo-de-fondos", "caja-del-dia", "reportes", "eventos-sponsors", "crm-comercial"],
  // MIA-237: «ve toda la adm y los proyectos tmb».
  ADMINISTRACION: ["gestion-inicio", "gestion-administracion", "proyectos", "cuentas-a-cobrar", "cuentas-a-pagar", "flujo-de-fondos", "gestion-proveedores", "caja-del-dia", "libro-de-caja", "cierre-del-dia", "facturacion", "gestion-mi-liquidacion"],
  COMERCIAL: ["gestion-inicio", "proyectos", "clientes", "eventos-sponsors", "crm-comercial", "gestion-propuesta-ia", "gestion-agentes", "gestion-calendario", "gestion-mi-liquidacion"],
  DISENO: ["gestion-inicio", "gestion-diseno", "proyectos", "gestion-propuesta-ia", "gestion-agentes", "gestion-calendario", "gestion-mi-liquidacion"],
  PRODUCCION: ["gestion-inicio", "proyectos", "gestion-proveedores", "gestion-calendario", "gestion-agentes", "gestion-mi-liquidacion"],
  PRODUCCION_CAMPO: ["gestion-inicio", "proyectos", "gestion-calendario", "gestion-mi-liquidacion"],
  SIN_FICHA: ["gestion-inicio", "crm-comercial"],
};

export const appEnLaBarra = (appId: string, rol: RolGestion): boolean => BARRA_DEL_ROL[rol].includes(appId);

/** Columnas de la ficha que un rol no ve de fábrica. */
export const COLUMNAS_OCULTAS_BASE: Record<Exclude<RolGestion, "DIRECCION">, readonly string[]> = {
  PRODUCCION: [],
  DISENO: ["costoUnit", "costoTotal", "recargo", "margen"],
  ADMINISTRACION: [],
  COMERCIAL: [],
  PRODUCCION_CAMPO: ["costoUnit", "costoTotal", "recargo", "margen"],
  SIN_FICHA: ["costoUnit", "costoTotal", "recargo", "margen"],
};

/**
 * MIA-229 · los módulos que son la plata del negocio. Sólo los abre el rol que la ve (`rolVeLaPlata`: Dirección y
 * Administración), ni de fábrica ni guardado por Dirección: así las lecturas (proveedores, Finanzas de la ficha, calendario)
 * y las acciones (`exigirEditar("empresa" | "liquidaciones")`) que no pasan por `veLaPlata` frenan igual. Los costos de la
 * ficha no entran mientras `costosSonPlata` sea false (P3, `decisiones-puestos.ts`). PURA.
 */
export const MODULOS_DE_PLATA: readonly ModuloGestion[] = ["pagos", "empresa", "liquidaciones", ...(DECISIONES_DE_PUESTOS.costosSonPlata ? (["costos"] as const) : [])];

/**
 * MIA-237 · casillas que el puesto fija, ni de fábrica ni guardadas por Dirección: el productor comercial ve los costos y no
 * los cambia; el productor de campo no abre ningún módulo con importes; Administración no carga personas ni roles
 * (Equipo: «no administra usuarios ni permisos»). PURA.
 */
const FIJOS_DEL_PUESTO: Partial<Record<RolGestion, Partial<Record<ModuloGestion, Permiso>>>> = {
  COMERCIAL: { costos: V },
  PRODUCCION_CAMPO: { costos: N, cotizaciones: N, proveedores: N, direccion: N },
  ADMINISTRACION: { equipo: N },
};

/** La casilla rol × módulo no se puede cambiar: Dirección ve todo, la plata no se le da a quien no la ve y el puesto fija lo suyo. PURA. */
export const permisoFijo = (rol: RolGestion, modulo: ModuloGestion): boolean =>
  rol === "DIRECCION" || (!rolVeLaPlata(rol) && MODULOS_DE_PLATA.includes(modulo)) || FIJOS_DEL_PUESTO[rol]?.[modulo] !== undefined;

export function permisoDe(rol: RolGestion, modulo: ModuloGestion, guardados: readonly { rol: string; modulo: string; ver: boolean; editar: boolean }[]): Permiso {
  if (rol === "DIRECCION") return E;
  const fijo = FIJOS_DEL_PUESTO[rol]?.[modulo];
  if (fijo) return fijo;
  if (permisoFijo(rol, modulo)) return N;
  const g = guardados.find((p) => p.rol === rol && p.modulo === modulo);
  return g ? { ver: g.ver, editar: g.editar } : PERMISOS_BASE[rol][modulo];
}

/**
 * PRY-100: la matriz de permisos la cambia sólo Dirección (la dueña sin ficha entra como Dirección). Quien tiene «Equipo»
 * carga y edita personas, no permisos: si no, se da a sí misma (o en dos pasos, a través de otro rol) lo que quiera.
 * Provisional a confirmar por el dueño (plan GSG-MIA-088, pregunta 1, opción A). PURA.
 */
export const cambiaLosPermisos = (rol: RolGestion): boolean => rol === "DIRECCION";

/**
 * ADM-134: el permiso `rendiciones` de la matriz es el piso, en el servidor. «Ver» alcanza para rendir lo propio;
 * revisar, reintegrar y mover anticipos piden «editar» y, además, la regla del rol (`motivoNoMuevePlata` y la del motor).
 * PURA.
 */
export function motivoSinRendiciones(p: Permiso, accion: "rendir" | "revisar"): string | null {
  if (accion === "rendir") return p.ver ? null : "No tenés acceso a Rendiciones: pedíselo a Dirección.";
  return p.editar ? null : "Revisar rendiciones y mover anticipos pide Rendiciones en «editar»: pedíselo a Dirección.";
}

/** Ve las rendiciones de otros y los anticipos del proyecto: el rol que aprueba y Rendiciones en «editar». PURA. */
export const revisaRendiciones = (rol: RolGestion, p: Permiso): boolean => ROLES_QUE_APRUEBAN_RENDICIONES.includes(rol) && p.editar;

/** ADM-135: «Pagar liquidación» se ofrece con la misma regla que aplica `pagarLiquidacion`: el rol que mueve plata y `liquidaciones` en «editar». PURA. */
export const pagaLiquidaciones = (rol: RolGestion, p: Permiso): boolean => ROLES_QUE_APRUEBAN_RENDICIONES.includes(rol) && p.editar;

/**
 * A1 (DIR-007, GSG-MIA-091) · LA matriz, escrita una vez: rol × módulo con lo que ve y edita cada uno (lo guardado por
 * Dirección encima de lo de fábrica), las columnas de costo que no ve y quién puede cambiar esa fila (pregunta 1-A,
 * confirmada por el dueño el 18/11). Dirección es la misma fila para una persona y para un agente. La fija
 * `gestion-core-matriz.test.ts`; `docs/qa/mia-088/tabla-de-permisos.md` es su copia legible. PURA.
 */
export function matrizDePermisos(guardados: readonly { rol: string; modulo: string; ver: boolean; editar: boolean; columnasOcultas?: unknown }[]) {
  const nivel = (p: Permiso) => (p.editar ? "editar" : p.ver ? "ver" : "sin acceso");
  return [...ROLES_GESTION, "SIN_FICHA" as const].map((rol) => {
    const ficha = guardados.find((g) => g.rol === rol && g.modulo === "ficha")?.columnasOcultas;
    return {
      rol,
      modulos: Object.fromEntries(MODULOS.map((m) => [m.id, nivel(permisoDe(rol, m.id, guardados))])) as Record<ModuloGestion, "editar" | "ver" | "sin acceso">,
      columnasOcultas: rol === "DIRECCION" ? [] : Array.isArray(ficha) ? (ficha as string[]) : [...COLUMNAS_OCULTAS_BASE[rol]],
      laCambia: cambiaLosPermisos(rol) || rol === "SIN_FICHA" ? "nadie (fija)" : "Dirección",
    };
  });
}

/** Dirección, Administración y Comercial ven todos los proyectos: un lead todavía no tiene equipo. El resto, sólo aquellos donde está. */
export const veTodosLosProyectos = (rol: RolGestion): boolean => rol === "DIRECCION" || rol === "ADMINISTRACION" || rol === "COMERCIAL";

// ── Avisos ──────────────────────────────────────────────────────────────────

/** El mail de un aviso: texto plano, con el link completo sólo si es de este sistema. */
export function mailDeAviso(d: { tipo: string; texto: string; enlace?: string | null; origen?: string | null }): { asunto: string; cuerpo: string } {
  const label = TIPOS_AVISO.find((t) => t.id === d.tipo)?.label ?? "Novedad";
  const link = d.origen && d.enlace?.startsWith("/") && !d.enlace.startsWith("//") ? `${d.origen}${d.enlace}` : null;
  return {
    asunto: `Aviso: ${label}`.replace(/\s+/g, " ").slice(0, 120),
    cuerpo: [d.texto, ...(link ? ["", link] : []), "", "Podés cambiar estos avisos en Configuración."].join("\n"),
  };
}

export const TIPOS_AVISO = [
  { id: "mencion", label: "Me mencionan en un chat" },
  { id: "tarea", label: "Me asignan una tarea" },
  { id: "deadline", label: "Fechas límite próximas" },
  { id: "vencimiento", label: "Cobros y pagos por vencer" },
  { id: "aprobacion", label: "Aprobaciones de precios y propuestas" },
  { id: "pago", label: "Pagos a proveedores" },
  { id: "cobro", label: "Cobros recibidos" },
  { id: "liquidacion", label: "Mi liquidación publicada" },
  { id: "etapa", label: "Cambios de etapa de mis proyectos" },
  { id: "consulta", label: "Llegan consultas de potenciales clientes" },
  { id: "rendicion", label: "Rendiciones de gastos para revisar o revisadas" },
] as const;

/** `@Ana` en un mensaje: los nombres mencionados que coinciden con alguien del equipo. */
export function mencionados(texto: string, personas: readonly { id: string; nombre: string }[]): string[] {
  const palabras = new Set((texto.match(/@([\p{L}]+)/gu) ?? []).map((m) => m.slice(1).toLowerCase()));
  const alias = aliasDeMencion(personas);
  return personas.filter((p) => palabras.has((alias.get(p.id) ?? "").toLowerCase())).map((p) => p.id);
}

/** Cómo se menciona a cada uno: el nombre de pila o, si hay dos Ana, el nombre completo junto (@AnaPérez), para no avisarles a las dos. */
export function aliasDeMencion(personas: readonly { id: string; nombre: string }[]): Map<string, string> {
  const pila = (n: string) => n.trim().split(/\s+/)[0];
  const veces = new Map<string, number>();
  for (const p of personas) veces.set(pila(p.nombre).toLowerCase(), (veces.get(pila(p.nombre).toLowerCase()) ?? 0) + 1);
  return new Map(personas.map((p) => [p.id, (veces.get(pila(p.nombre).toLowerCase()) ?? 0) > 1 ? p.nombre.replace(/\s+/g, "") : pila(p.nombre)]));
}

// ── Agenda de inicio y calendario ───────────────────────────────────────────

export const TIPOS_CALENDARIO = [
  { id: "REUNION", label: "Reunión" },
  { id: "DEADLINE", label: "Fecha límite de ítem" },
  { id: "PAGO", label: "Pago a proveedor" },
  { id: "COBRO", label: "Cobro al cliente" },
  { id: "EVENTO", label: "Evento" },
  { id: "MONTAJE", label: "Armado y desarme" },
  { id: "TAREA", label: "Tarea" },
  { id: "CONFIRMACION", label: "Confirmación" },
  { id: "EVENTO_TENTATIVO", label: "Evento tentativo" },
  { id: "ETAPA_PREVISTA", label: "Etapa prevista" },
  { id: "OBLIGACION", label: "Obligación" },
] as const;

export function cuandoEs(fecha: Date, hoy: Date = new Date()): string {
  const a = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const b = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
  const dias = Math.round((b - a) / DIA);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias > 1) return `En ${dias} días`;
  return dias === -1 ? "Ayer" : `Hace ${-dias} días`;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const fechaIcs = (d: Date) => `${d.getUTCFullYear()}${dosDigitos(d.getUTCMonth() + 1)}${dosDigitos(d.getUTCDate())}T${dosDigitos(d.getUTCHours())}${dosDigitos(d.getUTCMinutes())}00Z`;
const textoIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** El calendario para suscribirse desde Google Calendar o el teléfono. */
export function calendarioIcs(nombre: string, entradas: readonly { id: string; titulo: string; fecha: Date }[], ahora: Date = new Date()): string {
  const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GSG//Gestion de eventos//ES", `X-WR-CALNAME:${textoIcs(nombre)}`];
  for (const e of entradas) {
    lineas.push("BEGIN:VEVENT", `UID:${e.id}@gestion-eventos`, `DTSTAMP:${fechaIcs(ahora)}`, `DTSTART:${fechaIcs(e.fecha)}`, `SUMMARY:${textoIcs(e.titulo)}`, "END:VEVENT");
  }
  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n") + "\r\n";
}
