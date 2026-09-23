// ============================================================================
// FLUJO DE FONDOS — la plata de hoy, lo que va a entrar y lo que va a salir, semana por
// semana, a 30, 60 o 90 días. PURO.
// ============================================================================
//
// LA PREGUNTA de la dueña: "¿me alcanza para pagar el cheque del 15?". Los datos ya están en
// el sistema, repartidos en tres pantallas: el saldo del libro de caja, el fiado de los
// clientes y las deudas con proveedores con sus cheques. Acá se ponen en una fila por semana.
//
// LA REGLA, del lado prudente (lo que se usa para decidir un pago no puede ser optimista):
//   · ARRANCA con el saldo del libro de caja hoy (todos los medios juntos).
//   · ENTRA el fiado que vence dentro del horizonte, el día que vence. El fiado YA VENCIDO y
//     el que no tiene fecha no se proyectan: no se sabe cuándo (ni si) entran. Se muestran
//     aparte, con su monto, para que la dueña los tenga a la vista.
//   · SALE cada cheque sin debitar el día del cheque, y lo que queda de cada deuda sin
//     cheque el día que vence (`salidasDeCuenta`, la misma cuenta que la pantalla de cuentas
//     a pagar). Lo VENCIDO sale HOY: se debe ya. Una deuda sin vencimiento se muestra aparte.
//   · Las semanas arrancan HOY (semana 1 = hoy y los 6 días siguientes); la última se corta
//     en el horizonte. "A 30 días" = de hoy a 29 días más (30 días contando hoy).
//
// Sin Prisma: recibe filas ya leídas (flujo-lectura.ts).

import { round2 } from "@/lib/round";
import {
  diaDe,
  salidasDeCuenta,
  sumarDias,
  type CuentaAPagarLeida,
  type CuentaConSaldo,
} from "@/lib/debts/resumen-cuentas";

export const HORIZONTES = [30, 60, 90] as const;
export type Horizonte = (typeof HORIZONTES)[number];
export const HORIZONTE_POR_DEFECTO: Horizonte = 30;

/** El horizonte pedido por la URL, o el de por defecto. Nunca se confía en el texto. PURA. */
export function leerHorizonte(raw: unknown): Horizonte {
  const n = Number(raw);
  return (HORIZONTES as readonly number[]).includes(n) ? (n as Horizonte) : HORIZONTE_POR_DEFECTO;
}

export interface MovimientoDeFlujo {
  dia: string;
  tipo: "cobro" | "pago" | "cheque";
  monto: number;
  /** Cliente o proveedor. */
  quien: string;
  cuentaId: string;
  /** El día original, si era anterior a hoy (vencido) y se lo pasó a hoy. */
  vencidoDesde?: string;
}

export interface SemanaDeFlujo {
  numero: number;
  desde: string;
  hasta: string;
  entra: number;
  sale: number;
  /** Plata al final de la semana, contando todo lo anterior. */
  saldoAlCierre: number;
  movimientos: MovimientoDeFlujo[];
}

export interface FlujoDeFondos {
  hoy: string;
  horizonte: Horizonte;
  /** Último día que se proyecta. */
  hasta: string;
  saldoInicial: number;
  totalEntra: number;
  totalSale: number;
  saldoFinal: number;
  semanas: SemanaDeFlujo[];
  /** La semana que termina con menos plata, o `null` si no hay semanas. */
  semanaMasAjustada: SemanaDeFlujo | null;
  /** La primera semana que termina en negativo, o `null`. */
  primeraEnRojo: SemanaDeFlujo | null;
  /** Lo que no se proyecta, con su porqué en la pantalla. */
  fuera: {
    fiadoVencido: number;
    fiadoVencidoCuentas: number;
    fiadoSinFecha: number;
    fiadoSinFechaCuentas: number;
    deudasSinFecha: number;
    deudasSinFechaCuentas: number;
    /** Lo que vence después del horizonte (para cobrar y para pagar). */
    cobrosMasAdelante: number;
    pagosMasAdelante: number;
  };
}

export interface EntradaFlujo {
  hoy: string;
  horizonte: Horizonte;
  saldoLibro: number;
  aCobrar: readonly (CuentaConSaldo & { quien: string })[];
  aPagar: readonly (CuentaAPagarLeida & { saldo: number; quien: string })[];
}

/** El saldo del libro desde las sumas por tipo de movimiento (un `groupBy` por tipo). PURA. */
export function saldoDelLibro(grupos: readonly { type: string; total: number }[]): number {
  let s = 0;
  for (const g of grupos) {
    if (!Number.isFinite(g.total)) continue;
    if (g.type === "VENTA" || g.type === "INGRESO") s += g.total;
    else if (g.type === "EGRESO" || g.type === "RETIRO") s -= g.total;
  }
  return round2(s);
}

/** El flujo de fondos. PURA. */
export function calcularFlujo(e: EntradaFlujo): FlujoDeFondos {
  const hasta = sumarDias(e.hoy, e.horizonte - 1);
  const movimientos: MovimientoDeFlujo[] = [];
  const fuera: FlujoDeFondos["fuera"] = {
    fiadoVencido: 0,
    fiadoVencidoCuentas: 0,
    fiadoSinFecha: 0,
    fiadoSinFechaCuentas: 0,
    deudasSinFecha: 0,
    deudasSinFechaCuentas: 0,
    cobrosMasAdelante: 0,
    pagosMasAdelante: 0,
  };

  for (const c of e.aCobrar) {
    if (!(c.saldo > 0)) continue;
    const dia = diaDe(c.dueDate);
    if (dia === null) {
      fuera.fiadoSinFecha += c.saldo;
      fuera.fiadoSinFechaCuentas++;
    } else if (dia < e.hoy) {
      fuera.fiadoVencido += c.saldo;
      fuera.fiadoVencidoCuentas++;
    } else if (dia > hasta) {
      fuera.cobrosMasAdelante += c.saldo;
    } else {
      movimientos.push({ dia, tipo: "cobro", monto: round2(c.saldo), quien: c.quien, cuentaId: c.id });
    }
  }

  for (const c of e.aPagar) {
    let sinFecha = false;
    for (const s of salidasDeCuenta(c)) {
      if (s.dia === null) {
        fuera.deudasSinFecha += s.monto;
        sinFecha = true;
        continue;
      }
      if (s.dia > hasta) {
        fuera.pagosMasAdelante += s.monto;
        continue;
      }
      const vencido = s.dia < e.hoy;
      movimientos.push({
        dia: vencido ? e.hoy : s.dia,
        tipo: s.tipo === "cheque" ? "cheque" : "pago",
        monto: s.monto,
        quien: c.quien,
        cuentaId: c.id,
        ...(vencido ? { vencidoDesde: s.dia } : {}),
      });
    }
    if (sinFecha) fuera.deudasSinFechaCuentas++;
  }

  // Las semanas: la 1 arranca hoy. Cada movimiento cae en la suya por su día.
  const semanas: SemanaDeFlujo[] = [];
  let saldo = round2(e.saldoLibro);
  for (let i = 0; i < 20; i++) {
    const desde = sumarDias(e.hoy, 7 * i);
    if (desde > hasta) break;
    const fin = sumarDias(desde, 6);
    const hastaSemana = fin < hasta ? fin : hasta;
    const suyos = movimientos
      .filter((m) => m.dia >= desde && m.dia <= hastaSemana)
      .sort((a, b) => a.dia.localeCompare(b.dia) || a.tipo.localeCompare(b.tipo) || b.monto - a.monto);
    const entra = round2(suyos.filter((m) => m.tipo === "cobro").reduce((s, m) => s + m.monto, 0));
    const sale = round2(suyos.filter((m) => m.tipo !== "cobro").reduce((s, m) => s + m.monto, 0));
    saldo = round2(saldo + entra - sale);
    semanas.push({ numero: i + 1, desde, hasta: hastaSemana, entra, sale, saldoAlCierre: saldo, movimientos: suyos });
  }

  const totalEntra = round2(semanas.reduce((s, x) => s + x.entra, 0));
  const totalSale = round2(semanas.reduce((s, x) => s + x.sale, 0));
  let masAjustada: SemanaDeFlujo | null = null;
  for (const s of semanas) if (!masAjustada || s.saldoAlCierre < masAjustada.saldoAlCierre) masAjustada = s;

  for (const k of Object.keys(fuera) as (keyof typeof fuera)[]) {
    if (!k.endsWith("Cuentas")) fuera[k] = round2(fuera[k]);
  }

  return {
    hoy: e.hoy,
    horizonte: e.horizonte,
    hasta,
    saldoInicial: round2(e.saldoLibro),
    totalEntra,
    totalSale,
    saldoFinal: round2(e.saldoLibro + totalEntra - totalSale),
    semanas,
    semanaMasAjustada: masAjustada,
    primeraEnRojo: semanas.find((s) => s.saldoAlCierre < 0) ?? null,
    fuera,
  };
}
