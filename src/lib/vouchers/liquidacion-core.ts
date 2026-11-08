// ============================================================================
// VOUCHERS · LIQUIDACIÓN DEL LUNES y CUENTA DE LA ADMINISTRACIÓN — la regla, pura (sin base).
// ============================================================================
//
// Regla del dueño (08/11/2026, 00-ESTADO/VOUCHERS-CH-2026-11-08.md): el voucher del vecino de La
// Alameda lo paga la ADMINISTRACIÓN del country, no el vecino. Cada cobro con voucher queda como
// saldo a cobrar a la administración (nunca entra al cajón). Todos los lunes se liquida la semana
// anterior (lunes a domingo): el listado de vouchers usados con su total; la administradora paga
// y se concilia voucher por voucher contra ese pago. Lo pagado sale del saldo; lo que no cuadra
// queda marcado como diferencia.
//
// Cuenta corriente de la administración, que soporta pos-pago y pre-pago [provisional a confirmar]:
//   · DÉBITOS = los vouchers USADOS (cada cobro con voucher vivo, por su valor cubierto). Se derivan
//     de los vouchers, no se copian: anular el cobro devuelve el voucher y el débito desaparece solo.
//   · CRÉDITOS = los pagos de la administración (`VoucherPagoAdministracion`): el de cada
//     liquidación conciliada y los pagos a cuenta (pre-pago de un lote, o lo que pague después de
//     una diferencia).
//   · SALDO = débitos − créditos. > 0: la administración le debe a CH; < 0: pagó por adelantado.
// Toda la cuenta va en CENTAVOS enteros: nada de sumar floats.
// Persistencia: liquidacion-repo.ts · Server Actions: liquidacion-actions.ts.

import { centavosDe, textoAlCentavo, admiteCentavos } from "@/lib/dinero/redondeo";
import { celdaCsv } from "./voucher-core";

export type DiaClave = string; // YYYY-MM-DD

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

function aUtc(dia: DiaClave): Date | null {
  const m = RE_DIA.exec(dia);
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, me - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== me - 1 || f.getUTCDate() !== d) return null;
  return f;
}

function deUtc(f: Date): DiaClave {
  return f.toISOString().slice(0, 10);
}

/** ¿Es un día real «aaaa-mm-dd»? (30 de febrero no). */
export function esDiaReal(dia: string): boolean {
  return aUtc(dia) != null;
}

/** El día `n` días después (negativo: antes). Tira con un día que no existe. */
export function sumarDias(dia: DiaClave, n: number): DiaClave {
  const f = aUtc(dia);
  if (!f) throw new RangeError(`Día inválido: ${dia}`);
  f.setUTCDate(f.getUTCDate() + n);
  return deUtc(f);
}

/** 0 = domingo … 6 = sábado (calendario, sin zona: la clave ya es el día del negocio). */
export function diaDeLaSemana(dia: DiaClave): number {
  const f = aUtc(dia);
  if (!f) throw new RangeError(`Día inválido: ${dia}`);
  return f.getUTCDay();
}

export type Semana = { desde: DiaClave; hasta: DiaClave };

/**
 * La última semana CERRADA antes de `hoy`: de lunes a domingo, con el domingo estrictamente antes
 * de hoy. Un lunes da la semana que terminó ayer; un domingo, la anterior (la de hoy no cerró).
 */
export function ultimaSemanaCerrada(hoy: DiaClave): Semana {
  const dow = diaDeLaSemana(hoy);
  const atras = dow === 0 ? 7 : dow; // días hasta el domingo anterior
  const hasta = sumarDias(hoy, -atras);
  return { desde: sumarDias(hasta, -6), hasta };
}

export type MotivoSemanaInvalida = "fecha-invalida" | "no-es-domingo" | "semana-sin-cerrar";

/** ¿Se puede liquidar la semana que termina el domingo `hasta`? Tiene que haber terminado (hasta < hoy). */
export function validarSemana(hasta: string, hoy: DiaClave): { ok: true; semana: Semana } | { ok: false; motivo: MotivoSemanaInvalida } {
  if (!esDiaReal(hasta)) return { ok: false, motivo: "fecha-invalida" };
  if (diaDeLaSemana(hasta) !== 0) return { ok: false, motivo: "no-es-domingo" };
  if (!(hasta < hoy)) return { ok: false, motivo: "semana-sin-cerrar" };
  return { ok: true, semana: { desde: sumarDias(hasta, -6), hasta } };
}

export const MENSAJES_SEMANA: Record<MotivoSemanaInvalida, string> = {
  "fecha-invalida": "La fecha de la semana no es válida.",
  "no-es-domingo": "La liquidación va de lunes a domingo: elegí el domingo en que termina la semana.",
  "semana-sin-cerrar": "Esa semana todavía no terminó: se liquida a partir del lunes siguiente.",
};

// ── Conciliación de una liquidación contra el pago de la administración ─────

export type VoucherDeLiquidacion = { id: string; numero: string; valorCubierto: number };

export type PlanConciliacion = {
  /** Vouchers que la administración pagó (todos menos los rechazados). */
  pagados: VoucherDeLiquidacion[];
  /** Vouchers que la administración no reconoció o no pagó: siguen en el saldo a cobrar. */
  impagos: VoucherDeLiquidacion[];
  totalCentavos: number;
  aceptadoCentavos: number;
  pagadoCentavos: number;
  /** pagado − aceptado. 0 = cuadra; > 0 pagó de más; < 0 pagó de menos. */
  diferenciaCentavos: number;
};

export type MotivoConciliacionInvalida = "monto-invalido" | "voucher-ajeno";

/**
 * Arma la conciliación: `pagado` es lo que transfirió la administración; `rechazados`, los números
 * que la administración no pagó (voucher por voucher). Todo en centavos. PURA.
 */
export function planDeConciliacion(input: {
  vouchers: readonly VoucherDeLiquidacion[];
  pagado: number;
  rechazados: readonly string[];
}): { ok: true; plan: PlanConciliacion } | { ok: false; motivo: MotivoConciliacionInvalida; detalle?: string[] } {
  if (!admiteCentavos(input.pagado) || input.pagado < 0) return { ok: false, motivo: "monto-invalido" };
  const numeros = new Set(input.vouchers.map((v) => v.numero));
  const rechazados = new Set(input.rechazados.map((n) => n.replace(/\s+/g, "").toUpperCase()).filter(Boolean));
  const ajenos = [...rechazados].filter((n) => !numeros.has(n)).sort();
  if (ajenos.length) return { ok: false, motivo: "voucher-ajeno", detalle: ajenos };
  const pagados = input.vouchers.filter((v) => !rechazados.has(v.numero));
  const impagos = input.vouchers.filter((v) => rechazados.has(v.numero));
  const totalCentavos = sumaCentavos(input.vouchers.map((v) => v.valorCubierto));
  const aceptadoCentavos = sumaCentavos(pagados.map((v) => v.valorCubierto));
  const pagadoCentavos = centavosDe(input.pagado);
  return {
    ok: true,
    plan: { pagados, impagos, totalCentavos, aceptadoCentavos, pagadoCentavos, diferenciaCentavos: pagadoCentavos - aceptadoCentavos },
  };
}

export const MENSAJES_CONCILIACION: Record<MotivoConciliacionInvalida, string> = {
  "monto-invalido": "El monto pagado no se entiende: tiene que ser un importe de cero o más.",
  "voucher-ajeno": "Marcaste como no pagado un voucher que no está en esta liquidación",
};

export function sumaCentavos(importes: readonly number[]): number {
  let c = 0;
  for (const i of importes) c += centavosDe(i);
  return c;
}

export function pesosDeCentavos(c: number): number {
  return c / 100;
}

// ── Cuenta corriente de la administración ──────────────────────────────────

export type MovimientoDeCuenta = {
  /** YYYY-MM-DD (zona del negocio). */
  fecha: DiaClave;
  tipo: "DEBITO" | "CREDITO";
  concepto: string;
  centavos: number;
  /** Para desempatar en el mismo día y para enlazar. */
  ref: string;
};

export type MovimientoConSaldo = MovimientoDeCuenta & { saldoCentavos: number };

export type ResumenDeCuenta = {
  debitosCentavos: number;
  creditosCentavos: number;
  /** débitos − créditos: > 0 a cobrar a la administración; < 0 a favor de la administración. */
  saldoCentavos: number;
};

/** Ordena por fecha (débitos antes que créditos el mismo día) y arrastra el saldo. PURA. */
export function cuentaCorriente(movs: readonly MovimientoDeCuenta[]): { movimientos: MovimientoConSaldo[]; resumen: ResumenDeCuenta } {
  const orden = [...movs].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === b.tipo ? 0 : a.tipo === "DEBITO" ? -1 : 1) || a.ref.localeCompare(b.ref),
  );
  let saldo = 0;
  let deb = 0;
  let cred = 0;
  const movimientos = orden.map((m) => {
    if (m.tipo === "DEBITO") {
      saldo += m.centavos;
      deb += m.centavos;
    } else {
      saldo -= m.centavos;
      cred += m.centavos;
    }
    return { ...m, saldoCentavos: saldo };
  });
  return { movimientos, resumen: { debitosCentavos: deb, creditosCentavos: cred, saldoCentavos: saldo } };
}

// ── Reporte del lunes (lo que CH le manda a la administradora) ──────────────

export type RenglonDelReporte = {
  numero: string;
  vecino: string;
  /** Día de uso (YYYY-MM-DD, zona del negocio). */
  fecha: DiaClave | null;
  servicio: string | null;
  valor: number;
  /** null mientras la liquidación no se concilió. */
  resultado: "PAGADO" | "IMPAGO" | null;
};

export const COLUMNAS_REPORTE_LUNES = ["Número de voucher", "Vecino", "Fecha", "Servicio", "Importe", "Resultado"] as const;

export function fechaArgentina(dia: string | null): string {
  if (!dia) return "";
  const m = RE_DIA.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

function importeCsv(n: number): string {
  return admiteCentavos(n) ? textoAlCentavo(n).replace(".", ",") : "";
}

export const ETIQUETA_RESULTADO: Record<"PAGADO" | "IMPAGO", string> = { PAGADO: "Pagado", IMPAGO: "No pagado" };

/**
 * La planilla del lunes: CSV con BOM y `;` (Excel argentino), un renglón por voucher y el total al
 * pie; si ya se concilió, el pago y la diferencia. Celdas a prueba de fórmulas (`celdaCsv`).
 */
export function csvDelReporteDelLunes(input: {
  negocio: string;
  semana: Semana;
  renglones: readonly RenglonDelReporte[];
  pago?: { pagado: number; diferencia: number; fecha: string | null; referencia: string | null } | null;
}): string {
  const l: string[][] = [];
  l.push([`Liquidación de vouchers de La Alameda · ${input.negocio}`]);
  l.push([`Semana del ${fechaArgentina(input.semana.desde)} al ${fechaArgentina(input.semana.hasta)}`]);
  l.push([]);
  l.push([...COLUMNAS_REPORTE_LUNES]);
  for (const r of input.renglones) {
    l.push([r.numero, r.vecino, fechaArgentina(r.fecha), r.servicio ?? "", importeCsv(r.valor), r.resultado ? ETIQUETA_RESULTADO[r.resultado] : ""]);
  }
  const total = pesosDeCentavos(sumaCentavos(input.renglones.map((r) => r.valor)));
  l.push([]);
  l.push(["Cantidad de vouchers", String(input.renglones.length)]);
  l.push(["Total", importeCsv(total)]);
  if (input.pago) {
    l.push(["Pagado por la administración", importeCsv(input.pago.pagado)]);
    if (input.pago.fecha) l.push(["Fecha del pago", fechaArgentina(input.pago.fecha)]);
    if (input.pago.referencia) l.push(["Referencia", input.pago.referencia]);
    l.push(["Diferencia (pagado − aceptado)", importeCsv(input.pago.diferencia)]);
  }
  return `﻿${l.map((fila) => fila.map(celdaCsv).join(";")).join("\r\n")}\r\n`;
}

export const MEDIOS_DE_PAGO_ADMINISTRACION = ["TRANSFERENCIA", "EFECTIVO", "CHEQUE", "OTRO"] as const;
export type MedioPagoAdministracion = (typeof MEDIOS_DE_PAGO_ADMINISTRACION)[number];
export const ETIQUETA_MEDIO_ADMINISTRACION: Record<MedioPagoAdministracion, string> = {
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  CHEQUE: "Cheque",
  OTRO: "Otro",
};
export function esMedioAdministracion(v: unknown): v is MedioPagoAdministracion {
  return typeof v === "string" && (MEDIOS_DE_PAGO_ADMINISTRACION as readonly string[]).includes(v);
}
