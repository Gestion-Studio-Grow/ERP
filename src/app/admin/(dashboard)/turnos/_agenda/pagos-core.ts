// ============================================================================
// LOS PAGOS DEL TURNO — la lista y los totales de la sección «Pagos» del cajón (agenda interactiva).
// ============================================================================
//
// PURO (sin React, client-safe). Sólo lectura: arma, con lo que el servidor ya proyectó del turno
// (`TurnoDelDia.cobros`, agenda-core.ts), un renglón por pago hecho:
//   · cuándo (ISO), el medio en criollo, el monto, si fue seña o saldo, y quién cobró si se sabe;
//   · un cobro que tiene su anulación queda en la lista TACHADO con «Anulado» (la contrapartida no
//     es otro renglón); una baja de saldo no es un pago: no va a la lista, va a los totales.
//   · un turno viejo con un pago anterior a los cobros parciales (sin filas propias) muestra ese
//     pago como un renglón «Pago anterior», para que no diga «Todavía no pagó nada» con plata adentro.
// Los totales son los MISMOS números del turno (`cobrado`, `precio`, `saldo`, `condonado`): esto no
// recalcula plata, la ordena para leerla.

import { claseDeCobro, cobroAnuladoPor } from "@/lib/turnos/anulacion";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { ETIQUETA_DE_TARJETA } from "@/lib/turnos/cobro-con-producto";
import { MEDIO_VOUCHER } from "@/lib/comisiones/base";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { fmtMoneyARS } from "@/components/ui/format";
import type { TurnoDelDia } from "../agenda-core";

export type RenglonDePago = {
  clave: string;
  /** ISO de cuándo se registró, si se sabe. */
  cuando: string | null;
  medio: string;
  monto: number;
  tipo: "Seña" | "Saldo" | "Pago anterior";
  quien: string | null;
  anulado: boolean;
};

export type PagosDelTurno = {
  renglones: RenglonDePago[];
  totalPagado: number;
  precio: number;
  /** Lo que falta; 0 = «Pagado ✓». */
  falta: number;
  /** Saldo dado de baja (no es plata que entró). */
  deBaja: number;
  /** Lo pagado con voucher (no anulado): lo que falta se cobra APARTE del voucher. */
  voucher: number;
  vacio: boolean;
};

/** El medio en criollo: Efectivo, Transferencia, Mercado Pago, Débito, Crédito… */
export function etiquetaDelMedio(metodo: string): string {
  return METODO_LABEL[metodo as MetodoDePago] ?? ETIQUETA_DE_TARJETA[metodo] ?? metodo;
}

/** ¿Seña o saldo? Lo dice la nota con que se registró («Seña al reservar», «Llegó la seña…»). */
export function tipoDelPago(note: string | null | undefined): "Seña" | "Saldo" {
  return /se(ñ|n|ni)a/i.test(String(note ?? "")) ? "Seña" : "Saldo";
}

export function pagosDelTurno(t: Pick<TurnoDelDia, "cobros" | "cobrado" | "precio" | "saldo" | "condonado">): PagosDelTurno {
  const anulados = new Set<string>();
  for (const c of t.cobros) {
    const id = cobroAnuladoPor(c.note);
    if (id) anulados.add(id);
  }
  const renglones: RenglonDePago[] = t.cobros
    .filter((c) => claseDeCobro(c.note) === "cobro")
    .map((c, i) => ({
      clave: c.id ?? `cobro-${i}`,
      cuando: c.createdAt ?? null,
      medio: etiquetaDelMedio(c.method),
      monto: c.amount,
      tipo: tipoDelPago(c.note),
      quien: c.quien ?? null,
      anulado: !!c.id && anulados.has(c.id),
    }))
    .sort((a, b) => (a.cuando && b.cuando ? new Date(a.cuando).getTime() - new Date(b.cuando).getTime() : 0));
  if (t.cobros.length === 0 && t.cobrado > 0) {
    renglones.push({ clave: "pago-anterior", cuando: null, medio: "—", monto: t.cobrado, tipo: "Pago anterior", quien: null, anulado: false });
  }
  return {
    renglones,
    totalPagado: t.cobrado,
    precio: t.precio,
    falta: Math.max(0, t.saldo),
    deBaja: t.condonado,
    voucher: sumarVoucher(t.cobros, anulados),
    vacio: renglones.length === 0,
  };
}

function sumarVoucher(cobros: TurnoDelDia["cobros"], anulados: ReadonlySet<string>): number {
  return sumarAlCentavo(
    cobros
      .filter((c) => c.method === MEDIO_VOUCHER && claseDeCobro(c.note) === "cobro" && !(c.id && anulados.has(c.id)))
      .map((c) => c.amount),
  );
}

const pesos = (n: number) => fmtMoneyARS(n, Number.isInteger(n) ? 0 : 2);

/**
 * El renglón «Falta» de la sección Pagos. Con un voucher pagado, «Falta cobrar» a secas se leía
 * como si el voucher no hubiera entrado (CH-011): dice que es APARTE del voucher y cuánto cubrió.
 * PURA.
 */
export function rotuloDeLoQueFalta(p: Pick<PagosDelTurno, "falta" | "voucher">): { titulo: string; detalle?: string } {
  if (p.falta <= 0) return { titulo: "Pagado ✓" };
  if (p.voucher > 0) return { titulo: "Falta cobrar aparte del voucher", detalle: `El voucher cubre ${pesos(p.voucher)}; el resto, con otro medio.` };
  return { titulo: "Falta cobrar" };
}
