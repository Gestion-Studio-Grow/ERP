// ============================================================================
// FIADO Y CUENTAS A PAGAR — la bandeja por prioridad (diseño nuevo «Renglón»). PURO.
// ============================================================================
//
// Quién te debe (o a quién le debés) no se lee por orden alfabético: se lee por QUÉ HAY QUE HACER
// PRIMERO. Las cuentas con saldo se agrupan así, y adentro de cada grupo la plata más grande arriba:
//
//   · Vencido           — la fecha ya pasó: cobralo / pagalo primero.
//   · Vence esta semana — de hoy a 7 días (el mismo umbral que «Por vencer» de aging.ts).
//   · Fiado viejo       — (sólo a cobrar) sin vencimiento y de hace más de 30 días (el mismo
//                         umbral que DIAS_FIADO_VIEJO del resumen de siempre).
//   · El resto          — vence más adelante, o sin vencimiento y reciente.
//
// No calcula saldos ni decide nada de la plata: recibe el saldo ya calculado por la lectura de
// siempre (`leerCuentasACobrar` / `leerCuentasAPagar`) y las fechas como días del negocio.

import { DIAS_FIADO_VIEJO } from "@/lib/debts/resumen-cuentas";

export type CuentaDeBandeja = {
  id: string;
  /** El cliente o el proveedor. */
  quien: string;
  concepto: string | null;
  total: number;
  saldo: number;
  /** Día del negocio en que nació la deuda (AAAA-MM-DD). */
  desde: string;
  /** Día del negocio en que vence, o null. */
  vence: string | null;
  /** Lo que la pantalla agrega a la segunda línea («2 cheques entregados»). */
  nota?: string | null;
};

export type ClaveDeGrupo = "vencido" | "semana" | "viejo" | "resto";

export type GrupoDeBandeja = { clave: ClaveDeGrupo; titulo: string; cuentas: CuentaDeBandeja[]; suma: number };

const DIA = 86_400_000;
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);

const TITULOS: Record<"cobrar" | "pagar", Record<ClaveDeGrupo, string>> = {
  cobrar: {
    vencido: "Vencido: cobralo primero",
    semana: "Vence esta semana",
    viejo: `Fiado de hace más de ${DIAS_FIADO_VIEJO} días`,
    resto: "Al día",
  },
  pagar: {
    vencido: "Vencido",
    semana: "Vence en los próximos 7 días",
    viejo: "Sin vencimiento",
    resto: "Más adelante",
  },
};

export function grupoDeLaCuenta(c: Pick<CuentaDeBandeja, "desde" | "vence">, hoy: string, tipo: "cobrar" | "pagar"): ClaveDeGrupo {
  if (c.vence) {
    const faltan = dias(hoy, c.vence);
    if (faltan < 0) return "vencido";
    if (faltan <= 7) return "semana";
    return "resto";
  }
  // Sin vencimiento: a cobrar, lo fiado hace más de 30 días pide atención; a pagar, va aparte.
  if (tipo === "pagar") return "viejo";
  return dias(c.desde, hoy) > DIAS_FIADO_VIEJO ? "viejo" : "resto";
}

/** Las cuentas CON SALDO, agrupadas por prioridad; vacíos afuera. */
export function agruparCuentas(cuentas: readonly CuentaDeBandeja[], hoy: string, tipo: "cobrar" | "pagar"): GrupoDeBandeja[] {
  const orden: ClaveDeGrupo[] = tipo === "cobrar" ? ["vencido", "semana", "viejo", "resto"] : ["vencido", "semana", "resto", "viejo"];
  const grupos = new Map<ClaveDeGrupo, CuentaDeBandeja[]>(orden.map((k) => [k, []]));
  for (const c of cuentas) {
    if (!(c.saldo > 0)) continue;
    grupos.get(grupoDeLaCuenta(c, hoy, tipo))!.push(c);
  }
  return orden
    .map((clave) => {
      const lista = grupos.get(clave)!;
      // Esta semana: por fecha (lo que vence antes, primero); lo demás, la plata más grande arriba.
      lista.sort((a, b) =>
        clave === "semana" ? (a.vence ?? "").localeCompare(b.vence ?? "") || b.saldo - a.saldo : b.saldo - a.saldo,
      );
      return { clave, titulo: TITULOS[tipo][clave], cuentas: lista, suma: Math.round(lista.reduce((s, c) => s + c.saldo, 0) * 100) / 100 };
    })
    .filter((g) => g.cuentas.length > 0);
}

/** El folio del renglón, dicho según el grupo: «venció hace 12 días», «vence mañana», «hace 45 días». */
export function folioDeLaCuenta(c: Pick<CuentaDeBandeja, "desde" | "vence">, hoy: string): string {
  if (c.vence) {
    const faltan = dias(hoy, c.vence);
    if (faltan < 0) return -faltan === 1 ? "venció ayer" : `venció hace ${-faltan} días`;
    if (faltan === 0) return "vence hoy";
    if (faltan === 1) return "vence mañana";
    const [, m, d] = c.vence.split("-");
    return `vence ${d}/${m}`;
  }
  const hace = dias(c.desde, hoy);
  return hace <= 0 ? "de hoy" : hace === 1 ? "de ayer" : `hace ${hace} días`;
}
