/**
 * MIA T06 · presupuesto: líneas con sector y categoría, personal por puestos × horas × días, anticipo por línea (O12) y
 * adicionales (O09, O11). PURO: sin Prisma, testeable sin base. La plata de los adicionales va en centavos enteros.
 */
import type { CuotaPlaneada } from "./gestion-core";

const DIA = 86_400_000;

/** Los días del plan, leídos del catálogo (`plan.*`, R8). */
export interface DiasDelPlan {
  anticipoProveedorAntes: number;
  saldoProveedorDespues: number;
  saldoClienteAntes: number;
}

/** Lo que el sistema usaba fijo antes del catálogo: el valor por defecto si el negocio no cargó otro. */
export const DIAS_POR_DEFECTO: DiasDelPlan = { anticipoProveedorAntes: 30, saldoProveedorDespues: 12, saldoClienteAntes: 5 };

export interface Personal {
  puestos: number | null;
  horas: number | null;
  dias: number | null;
}

/** La línea de personal es puestos × horas × días; la de costo, su cantidad. Personal a medias (falta un dato) no cuenta como personal. */
export function cantidadDeLaLinea(cantidad: number, p: Personal): number {
  if (esPersonal(p)) return p.puestos! * p.horas! * p.dias!;
  return cantidad;
}

export const esPersonal = (p: Personal): boolean => [p.puestos, p.horas, p.dias].every((x) => typeof x === "number" && Number.isFinite(x) && x > 0);

/** Personal: los tres o ninguno, enteros positivos (horas admite medias: 7,5). */
export function errorDePersonal(p: Personal): string | null {
  const cargados = [p.puestos, p.horas, p.dias].filter((x) => x != null);
  if (cargados.length === 0) return null;
  if (cargados.length < 3) return "Para el personal cargá puestos, horas y días.";
  if (!Number.isInteger(p.puestos) || p.puestos! <= 0 || p.puestos! > 1000) return "Los puestos van de 1 a 1000.";
  if (!(p.horas! > 0) || p.horas! > 24) return "Las horas por día van de 0,5 a 24.";
  if (!Number.isInteger(p.dias) || p.dias! <= 0 || p.dias! > 366) return "Los días van de 1 a 366.";
  return null;
}

/** El sector y la categoría salen de las listas del negocio (`costos.sectores`, `costos.categorias`). */
export function errorDeListas(d: { sector: string; categoria: string }, listas: { sectores: readonly string[]; categorias: readonly string[] }): string | null {
  if (!listas.sectores.includes(d.sector)) return `El sector «${d.sector || "(vacío)"}» no está en la lista del negocio.`;
  if (!listas.categorias.includes(d.categoria)) return `La categoría «${d.categoria || "(vacía)"}» no está en la lista del negocio.`;
  return null;
}

/** Anticipo y saldo suman 100: se guarda el anticipo, entero de 0 a 100. */
export function errorDeAnticipo(pct: number): string | null {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return "El anticipo es un porcentaje entero de 0 a 100 (el saldo es el resto).";
  return null;
}

/** El % de la línea manda; si no tiene, el del proveedor; si no, 50. */
export const anticipoDeLaLinea = (deLaLinea: number | null | undefined, delProveedor: number | null | undefined): number =>
  Math.min(100, Math.max(0, deLaLinea ?? delProveedor ?? 50));

/** Partir un importe en centavos: anticipo redondeado, saldo = el resto (la suma da exacto). */
export function partir(totalCentavos: number, pct: number): { anticipo: number; saldo: number } {
  const anticipo = Math.round((totalCentavos * pct) / 100);
  return { anticipo, saldo: totalCentavos - anticipo };
}

export const aCentavos = (pesos: number): number => Math.round(pesos * 100);
export const aPesos = (centavos: number): number => centavos / 100;

// ── Adicionales ───────────────────────────────────────────────────────────────

export const ESTADOS_ADICIONAL = ["BORRADOR", "ENVIADO", "APROBADO", "RECHAZADO"] as const;
export type EstadoAdicional = (typeof ESTADOS_ADICIONAL)[number];
export const ESTADO_ADICIONAL_LABEL: Record<EstadoAdicional, string> = { BORRADOR: "Borrador", ENVIADO: "Enviado al cliente", APROBADO: "Aprobado por el cliente", RECHAZADO: "Rechazado" };

export interface LineaAdicional {
  id: string;
  sector: string;
  categoria: string;
  detalle: string;
  proveedor: string | null;
  supplierId: string | null;
  cantidad: number;
  puestos: number | null;
  horas: number | null;
  dias: number | null;
  costoCentavos: number;
  precioCentavos: number;
  anticipoPct: number | null;
}

export interface Adicional {
  id: string;
  numero: number;
  nombre: string;
  estado: string;
  ivaPct: number;
  /** Cuándo lo aprobó el cliente: de ahí vence su anticipo. */
  respondidoEl?: Date | null;
  lineas: readonly LineaAdicional[];
}

/** Subtotal de la línea en centavos: cantidad (o puestos × horas × días) × unitario. */
export const subtotalCentavos = (l: LineaAdicional, unitario: number): number => Math.round(cantidadDeLaLinea(l.cantidad, l) * unitario);

export function totalesDelAdicional(a: Pick<Adicional, "ivaPct" | "lineas">): { costo: number; precio: number; iva: number; precioConIva: number } {
  const costo = a.lineas.reduce((s, l) => s + subtotalCentavos(l, l.costoCentavos), 0);
  const precio = a.lineas.reduce((s, l) => s + subtotalCentavos(l, l.precioCentavos), 0);
  const iva = Math.round((precio * a.ivaPct) / 100);
  return { costo, precio, iva, precioConIva: precio + iva };
}

/** Lo que suma al tope de cobro: el precio con IVA de los adicionales aprobados por el cliente, en centavos. */
export const topeDeAdicionales = (adicionales: readonly Pick<Adicional, "estado" | "ivaPct" | "lineas">[]): number =>
  adicionales.filter((a) => a.estado === "APROBADO").reduce((s, a) => s + totalesDelAdicional(a).precioConIva, 0);

/**
 * Aprobación interna de un adicional (O09): sólo Dirección, y no alguien del equipo de ese proyecto (la decisión la toma
 * alguien de afuera). El dueño entra como Dirección.
 */
export function errorDeAprobador(d: { rol: string; enElEquipo: boolean }): string | null {
  if (d.rol !== "DIRECCION") return "Los adicionales los aprueba Dirección.";
  if (d.enElEquipo) return "Estás en el equipo de este proyecto: el adicional lo tiene que aprobar otra persona de Dirección.";
  return null;
}

/** Los dos estados de la previsión los marca sólo Administración (O12). */
export const errorDeMarcaPrevision = (rol: string): string | null => (rol === "ADMINISTRACION" ? null : "Los estados de la previsión los marca Administración.");

/**
 * Las cuotas de los adicionales aprobados (O11): cada uno, sus propias claves (`<proyecto>:adic:...`), así el plan del base
 * no cambia. Pago al proveedor por línea con proveedor (anticipo % de la línea, si no del proveedor, si no 50) y cobro al
 * cliente con IVA (anticipo del cliente del proyecto). En pesos: el adicional se cotiza en pesos (provisional a confirmar).
 */
export function cuotasDeAdicionales(
  adicionales: readonly Adicional[],
  d: { proyectoId: string; nombre: string; fechaEvento: Date | null; creado: Date; anticipoClientePct: number; dias: DiasDelPlan; anticipoProveedor: Readonly<Record<string, number>> },
): CuotaPlaneada[] {
  const evento = (d.fechaEvento ?? d.creado).getTime();
  const salida: CuotaPlaneada[] = [];
  for (const a of adicionales) {
    if (a.estado !== "APROBADO") continue;
    const rotulo = `Adicional ${a.numero} · ${a.nombre}`;
    for (const l of a.lineas) {
      if (!l.supplierId) continue;
      const total = subtotalCentavos(l, l.costoCentavos);
      if (!(total > 0)) continue;
      const { anticipo, saldo } = partir(total, anticipoDeLaLinea(l.anticipoPct, d.anticipoProveedor[l.supplierId]));
      if (anticipo > 0) salida.push({ clave: `${d.proyectoId}:adic:${l.id}:anticipo`, tipo: "PAGO", concepto: `${rotulo} · ${l.detalle} (anticipo)`, monto: aPesos(anticipo), moneda: "ARS", venceEl: new Date(evento - d.dias.anticipoProveedorAntes * DIA), supplierId: l.supplierId });
      if (saldo > 0) salida.push({ clave: `${d.proyectoId}:adic:${l.id}:saldo`, tipo: "PAGO", concepto: `${rotulo} · ${l.detalle} (saldo)`, monto: aPesos(saldo), moneda: "ARS", venceEl: new Date(evento + d.dias.saldoProveedorDespues * DIA), supplierId: l.supplierId });
    }
    const { precioConIva } = totalesDelAdicional(a);
    if (!(precioConIva > 0)) continue;
    const { anticipo, saldo } = partir(precioConIva, Math.min(100, Math.max(0, d.anticipoClientePct)));
    // Sin «:cliente:anticipo» al final: no es la seña del proyecto (`venceDeLaCuota` la fija al confirmar).
    if (anticipo > 0) salida.push({ clave: `${d.proyectoId}:adic:${a.id}:cobro-anticipo`, tipo: "COBRO", concepto: `${rotulo} — anticipo del cliente`, monto: aPesos(anticipo), moneda: "ARS", venceEl: a.respondidoEl ?? d.creado, supplierId: null });
    if (saldo > 0) salida.push({ clave: `${d.proyectoId}:adic:${a.id}:cobro-saldo`, tipo: "COBRO", concepto: `${rotulo} — saldo del cliente`, monto: aPesos(saldo), moneda: "ARS", venceEl: new Date(evento - d.dias.saldoClienteAntes * DIA), supplierId: null });
  }
  return salida;
}
