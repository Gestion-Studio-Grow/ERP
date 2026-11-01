// GESTIÓN DE EVENTOS — reglas puras: la ficha genera cuotas, las cuotas arman el cashflow y de ahí salen la proyección,
// las alertas y la liquidación. Sin base ni React, para probarlas sin nada alrededor. Especificación funcional en
// docs/benchmark/heka-especificacion.md.

import { redondear } from "./core";

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

export function codigoProyecto(numero: number, creado: Date): string {
  return `${creado.getFullYear()}-${String(numero).padStart(3, "0")}`;
}

export function aPesos(monto: number, moneda: string, tiposDeCambio: Readonly<Record<string, number>>): number {
  if (moneda === "ARS") return monto;
  return redondear(monto * (tiposDeCambio[moneda] ?? 0));
}

export function plataEn(monto: number, moneda: string): string {
  const d = Number.isInteger(redondear(monto)) ? 0 : 2;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda === "USD" ? "USD" : "ARS", minimumFractionDigits: d, maximumFractionDigits: d }).format(monto);
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
}

export function totalesFicha(items: readonly ItemFicha[], tc: Readonly<Record<string, number>>, recargoGeneral: number): TotalesFicha {
  const venta = redondear(items.reduce((s, i) => s + ventaTotalItem(i, tc, recargoGeneral), 0));
  const costo = redondear(items.reduce((s, i) => s + costoTotalItem(i, tc), 0));
  const margen = redondear(venta - costo);
  return { items: items.length, venta, costo, margen, margenPct: venta > 0 ? redondear((margen / venta) * 100) : 0 };
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
  /** % de anticipo de cada proveedor; sin dato, 50. */
  anticipoProveedor: Readonly<Record<string, number>>;
}

/** Un proyecto genera plata cuando está confirmado: antes es una cotización. */
export const ETAPAS_CON_CUOTAS = ["APROBADO", "PRODUCCION", "ARMADO", "DESARME", "CIERRE"] as const;
export const generaCuotas = (etapa: string): boolean => (ETAPAS_CON_CUOTAS as readonly string[]).includes(etapa);

const DIAS_SALDO_CLIENTE_ANTES = 5;
const DIAS_SALDO_PROVEEDOR_DESPUES = 12;
const DIAS_ANTICIPO_PROVEEDOR_ANTES = 30;

/**
 * Anticipo y saldo de cada ítem con proveedor, y anticipo y saldo del cliente. La clave identifica el tramo: regenerar
 * actualiza lo pendiente sin duplicar. Un ítem pagado por completo al 100 % de anticipo no tiene saldo, y viceversa.
 */
export function planDeCuotas(items: readonly ItemFicha[], d: DatosPlan): CuotaPlaneada[] {
  if (!d.fechaEvento) return [];
  const evento = d.fechaEvento.getTime();
  const salida: CuotaPlaneada[] = [];
  for (const i of items) {
    if (!i.supplierId || !(i.costo > 0)) continue;
    const total = redondear(i.cantidad * i.costo);
    const pct = Math.min(100, Math.max(0, d.anticipoProveedor[i.supplierId] ?? 50));
    const anticipo = redondear((total * pct) / 100);
    const saldo = redondear(total - anticipo);
    const venceAnticipo = i.fechaLimite ?? new Date(evento - DIAS_ANTICIPO_PROVEEDOR_ANTES * DIA);
    if (anticipo > 0) salida.push({ clave: `${d.proyectoId}:${i.id}:anticipo`, tipo: "PAGO", concepto: `${i.descripcion} (anticipo)`, monto: anticipo, moneda: i.moneda, venceEl: venceAnticipo, supplierId: i.supplierId });
    if (saldo > 0) salida.push({ clave: `${d.proyectoId}:${i.id}:saldo`, tipo: "PAGO", concepto: `${i.descripcion} (saldo)`, monto: saldo, moneda: i.moneda, venceEl: new Date(evento + DIAS_SALDO_PROVEEDOR_DESPUES * DIA), supplierId: i.supplierId });
  }
  const { venta } = totalesFicha(items, d.tiposDeCambio, d.recargoGeneral);
  if (venta > 0) {
    const pct = Math.min(100, Math.max(0, d.anticipoClientePct));
    const conIva = redondear(venta * (1 + d.ivaPct / 100));
    const anticipo = redondear((conIva * pct) / 100);
    const saldo = redondear(conIva - anticipo);
    if (anticipo > 0) salida.push({ clave: `${d.proyectoId}:cliente:anticipo`, tipo: "COBRO", concepto: `${d.nombre} — anticipo del cliente`, monto: anticipo, moneda: "ARS", venceEl: d.creado, supplierId: null });
    if (saldo > 0) salida.push({ clave: `${d.proyectoId}:cliente:saldo`, tipo: "COBRO", concepto: `${d.nombre} — saldo del cliente`, monto: saldo, moneda: "ARS", venceEl: new Date(evento - DIAS_SALDO_CLIENTE_ANTES * DIA), supplierId: null });
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
  return c.venceEl.getTime() < hoy.getTime() ? "VENCIDA" : "PENDIENTE";
}

export function diasDeAtraso(venceEl: Date, hoy: Date = new Date()): number {
  return Math.max(0, Math.floor((hoy.getTime() - venceEl.getTime()) / DIA));
}

export interface LineaCashflow<T> {
  cuota: T;
  importe: number; // con signo, en pesos
  saldo: number;
}

/** Cada movimiento por fecha y el saldo que deja. El máximo a financiar es lo más abajo de cero que llega ese saldo. */
export function cashflowDelEvento<T extends CuotaLeida>(cuotas: readonly T[], tc: Readonly<Record<string, number>>): { lineas: LineaCashflow<T>[]; saldoFinal: number; maximoAFinanciar: number } {
  const orden = cuotas.filter((c) => !c.anuladoEl).slice().sort((a, b) => a.venceEl.getTime() - b.venceEl.getTime() || (a.tipo === "COBRO" ? -1 : 1));
  let saldo = 0;
  let minimo = 0;
  const lineas = orden.map((cuota) => {
    const pesos = aPesos(cuota.monto, cuota.moneda, tc);
    const importe = cuota.tipo === "COBRO" ? pesos : -pesos;
    saldo = redondear(saldo + importe);
    minimo = Math.min(minimo, saldo);
    return { cuota, importe, saldo };
  });
  return { lineas, saldoFinal: saldo, maximoAFinanciar: redondear(-minimo) };
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
    const vencida = c.venceEl.getTime() < hoy.getTime();
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

/** Caja de hoy + lo previsto mes a mes. Lo vencido sin pagar cae en el mes actual: sigue pendiente de salir o de entrar. */
export function proyeccionDeCaja(d: {
  cajaHoy: number;
  cuotas: readonly CuotaLeida[];
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
      const pesos = aPesos(c.monto, c.moneda, d.tiposDeCambio);
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

/** El plus se cobra el mes en que el evento terminó. */
export function extrasDelPeriodo(equipos: readonly { plus: number; proyecto: { id: string; nombre: string; fechaEvento: Date | null; fechaFin: Date | null } }[], periodo: string): ExtraLiquidacion[] {
  return equipos
    .filter((e) => {
      const f = e.proyecto.fechaFin ?? e.proyecto.fechaEvento;
      return e.plus > 0 && !!f && claveMes(f) === periodo;
    })
    .map((e) => ({ proyectoId: e.proyecto.id, nombre: e.proyecto.nombre, monto: e.plus }));
}

// ── Versiones ───────────────────────────────────────────────────────────────

export interface FotoItem {
  clave: string; // descripción normalizada: una versión copia los ítems, no conserva el id
  descripcion: string;
  rubro: string;
  importe: number;
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

/** Extracto en CSV: fecha;descripción;importe (o con comas). Devuelve lo legible y cuántas líneas no se entendieron. */
export function leerExtracto(csv: string): { lineas: LineaExtracto[]; ilegibles: number } {
  const lineas: LineaExtracto[] = [];
  let ilegibles = 0;
  for (const cruda of csv.split(/\r?\n/)) {
    const s = cruda.trim();
    if (!s) continue;
    const partes = s.includes(";") ? s.split(";") : s.split(",");
    if (partes.length < 3) {
      ilegibles++;
      continue;
    }
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(partes[0].trim()) ?? null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(partes[0].trim());
    const fecha = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12) : null;
    const textoImporte = partes[partes.length - 1].trim();
    const importe = Number(textoImporte.includes(",") ? textoImporte.replace(/\./g, "").replace(",", ".") : textoImporte);
    if (!fecha || !Number.isFinite(importe) || importe === 0) {
      ilegibles++;
      continue;
    }
    lineas.push({ fecha, descripcion: partes.slice(1, -1).join(" ").trim(), importe });
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

export const ROLES_GESTION = ["DIRECCION", "PRODUCCION", "DISENO", "ADMINISTRACION"] as const;
export type RolGestion = (typeof ROLES_GESTION)[number];
export const ROL_LABEL: Record<RolGestion, string> = { DIRECCION: "Dirección", PRODUCCION: "Producción", DISENO: "Diseño", ADMINISTRACION: "Administración" };

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
  PRODUCCION: { pipeline: E, ficha: E, costos: E, proveedores: E, cotizaciones: E, diseno: E, pagos: E, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: E },
  DISENO: { pipeline: V, ficha: V, costos: N, proveedores: N, cotizaciones: N, diseno: E, pagos: N, empresa: N, liquidaciones: N, direccion: N, equipo: N, ia: E },
  ADMINISTRACION: { pipeline: V, ficha: V, costos: V, proveedores: E, cotizaciones: V, diseno: N, pagos: E, empresa: E, liquidaciones: E, direccion: V, equipo: N, ia: V },
};

/** Qué módulo abre cada app de la barra: con uno alcanza. Las que no figuran las ve todo el equipo. */
const MODULOS_DE_LA_APP: Readonly<Record<string, readonly ModuloGestion[]>> = {
  proyectos: ["pipeline"],
  "gestion-diseno": ["diseno"],
  "gestion-proveedores": ["proveedores"],
  "gestion-administracion": ["empresa", "pagos", "liquidaciones"],
  "gestion-direccion": ["direccion"],
  "gestion-agentes": ["ia"],
  "gestion-propuesta-ia": ["ia"],
  "gestion-equipo": ["equipo"],
};

export function appDeGestionVisible(appId: string, rol: RolGestion, guardados: readonly { rol: string; modulo: string; ver: boolean; editar: boolean }[]): boolean {
  const modulos = MODULOS_DE_LA_APP[appId];
  return !modulos || modulos.some((m) => permisoDe(rol, m, guardados).ver);
}

/** Columnas de la ficha que un rol no ve de fábrica. */
export const COLUMNAS_OCULTAS_BASE: Record<Exclude<RolGestion, "DIRECCION">, readonly string[]> = {
  PRODUCCION: [],
  DISENO: ["costoUnit", "costoTotal", "recargo", "margen"],
  ADMINISTRACION: [],
};

export function permisoDe(rol: RolGestion, modulo: ModuloGestion, guardados: readonly { rol: string; modulo: string; ver: boolean; editar: boolean }[]): Permiso {
  if (rol === "DIRECCION") return E;
  const g = guardados.find((p) => p.rol === rol && p.modulo === modulo);
  return g ? { ver: g.ver, editar: g.editar } : PERMISOS_BASE[rol][modulo];
}

/** Dirección y Administración ven todos los proyectos; el resto, sólo aquellos donde está en el equipo. */
export const veTodosLosProyectos = (rol: RolGestion): boolean => rol === "DIRECCION" || rol === "ADMINISTRACION";

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
  { id: "aprobacion", label: "Aprobaciones de precios y propuestas" },
  { id: "pago", label: "Pagos a proveedores" },
  { id: "cobro", label: "Cobros recibidos" },
  { id: "liquidacion", label: "Mi liquidación publicada" },
  { id: "etapa", label: "Cambios de etapa de mis proyectos" },
] as const;

/** `@Ana` en un mensaje: los nombres mencionados que coinciden con alguien del equipo. */
export function mencionados(texto: string, personas: readonly { id: string; nombre: string }[]): string[] {
  const palabras = new Set((texto.match(/@([\p{L}]+)/gu) ?? []).map((m) => m.slice(1).toLowerCase()));
  return personas.filter((p) => palabras.has(p.nombre.split(" ")[0].toLowerCase())).map((p) => p.id);
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
