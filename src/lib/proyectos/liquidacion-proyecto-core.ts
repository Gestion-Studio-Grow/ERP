/**
 * Liquidación del proyecto (GSG-MIA-171 · T10, O19-O23). El mismo cálculo que la rendición de T04
 * (`rendicion-core.ts`), pero con las personas reales de la foto del precio (M3) en vez de cuatro casilleros fijos.
 *
 * PURA: no lee la base ni el reloj. Plata en centavos enteros.
 *   defensa      = CO + AD − costo real. Cada persona, su % de la foto sin el centavo partido; la empresa, el resto.
 *                  Negativa con «piso cero»: las personas en 0, la empresa absorbe.
 *   margen       = el del tablero; se reparte sólo si la foto tiene el concepto MARGEN_ERROR. Si no, a la empresa.
 *   comisión     = la de su función, sólo para quien la cobra en la foto. La de una función sin nadie, a la empresa.
 *   redondeo     = el bruto, 100 % a la empresa (contiene IIB y GA).
 *   rentabilidad = entera a la empresa.
 * Control: la suma de las líneas es Total venta − costo real, al centavo (Dis. § 2.6).
 */
import { aPuntosBasicos, type Centavos } from "./precio-core";
import type { ParticipanteFoto } from "./precio-proyecto-core";
import { pesos } from "./core";

export const DEFENSA = "DEFENSA";
export const MARGEN_ERROR = "MARGEN_ERROR";
export const CLAVE_EMPRESA = "EMPRESA";
export const CUANDO_AL_COBRAR_TODO = "AL_COBRAR_TODO";
export const CUANDO_AL_APROBAR = "AL_APROBAR";

export interface EntradaLiquidacion {
  totalVenta: Centavos;
  costoOriginal: Centavos;
  adicionales: Centavos;
  redondeoBruto: Centavos;
  rentabilidad: Centavos;
  margenError: Centavos;
  /** Por id de función, la comisión del tablero congelado. */
  comisiones: Record<string, Centavos>;
  participantes: readonly ParticipanteFoto[];
  costoReal: Centavos;
  /** Parámetro `reparto.defensaNegativa`. */
  defensaNegativa: string;
}

export interface LineaCalculada {
  clave: string;
  personaId: string | null;
  nombre: string;
  funcion: string;
  comision: Centavos;
  /** Defensa + margen repartidos. */
  reparto: Centavos;
  redondeo: Centavos;
  rentabilidad: Centavos;
  total: Centavos;
  detalle: { defensa: Centavos; margen: Centavos };
}

export interface LiquidacionCalculada {
  defensa: Centavos;
  esperado: Centavos;
  lineas: LineaCalculada[];
  cierra: boolean;
  avisos: string[];
}

function entero(nombre: string, n: number) {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${nombre}: tiene que ser un importe en centavos enteros (llegó ${String(n)}).`);
}

/** La parte de `monto` por `pb` puntos básicos, sin el centavo partido (hacia el cero), como `rendicion-core`. */
function parte(monto: Centavos, pb: number): Centavos {
  const n = Number((BigInt(monto) * BigInt(pb)) / BigInt(10_000));
  return n === 0 ? 0 : n;
}

export function calcularLiquidacion(e: EntradaLiquidacion): LiquidacionCalculada {
  for (const [k, v] of Object.entries({ totalVenta: e.totalVenta, costoOriginal: e.costoOriginal, adicionales: e.adicionales, redondeoBruto: e.redondeoBruto, rentabilidad: e.rentabilidad, margenError: e.margenError, costoReal: e.costoReal })) entero(k, v);
  if (e.costoReal < 0) throw new RangeError("Costo real: no puede ser negativo.");
  const personas = e.participantes.filter((p) => p.equipoId !== null);
  const empresa = e.participantes.find((p) => p.equipoId === null);
  if (!empresa) throw new RangeError("La foto del precio no tiene la fila de la empresa.");
  const avisos: string[] = [];

  const defensa = e.costoOriginal + e.adicionales - e.costoReal;
  const pisoCero = defensa < 0 && e.defensaNegativa === "PISO_CERO";
  if (defensa < 0) {
    avisos.push(
      pisoCero
        ? "Defensa negativa: el costo real pasó al aprobado. Las personas quedan en cero y la empresa absorbe la diferencia."
        : "Defensa negativa: el costo real pasó al aprobado y la diferencia se descuenta según el reparto (provisional a confirmar).",
    );
  }
  const reparteMargen = personas.some((p) => (p.reparto[MARGEN_ERROR] ?? 0) !== 0);
  const pb = (p: ParticipanteFoto, c: string) => aPuntosBasicos(p.reparto[c] ?? 0);
  const sumaPb = (c: string) => personas.reduce((s, p) => s + pb(p, c), 0);
  if (sumaPb(DEFENSA) > 10_000 || sumaPb(MARGEN_ERROR) > 10_000) throw new RangeError("Los porcentajes de las personas suman más de 100 %.");

  const cobradas = new Set<string>();
  const lineas: LineaCalculada[] = personas.map((p) => {
    const d = pisoCero ? 0 : parte(defensa, pb(p, DEFENSA));
    const m = reparteMargen ? parte(e.margenError, pb(p, MARGEN_ERROR)) : 0;
    const cobra = p.comisionPct > 0 && !!p.funcion && !cobradas.has(p.funcion);
    if (cobra) cobradas.add(p.funcion!);
    const comision = cobra ? (e.comisiones[p.funcion!] ?? 0) : 0;
    return { clave: p.equipoId!, personaId: p.personaId, nombre: p.nombre, funcion: p.funcion ?? "", comision, reparto: d + m, redondeo: 0, rentabilidad: 0, total: comision + d + m, detalle: { defensa: d, margen: m } };
  });

  const huerfanas = Object.entries(e.comisiones).filter(([f, c]) => c !== 0 && !cobradas.has(f));
  for (const [f] of huerfanas) avisos.push(`La comisión de la función ${f} no la cobra nadie del equipo: queda en la empresa.`);
  const comisionEmpresa = huerfanas.reduce((s, [, c]) => s + c, 0);
  const dEmpresa = defensa - lineas.reduce((s, l) => s + l.detalle.defensa, 0);
  const mEmpresa = e.margenError - lineas.reduce((s, l) => s + l.detalle.margen, 0);
  lineas.push({
    clave: CLAVE_EMPRESA,
    personaId: null,
    nombre: empresa.nombre,
    funcion: CLAVE_EMPRESA,
    comision: comisionEmpresa,
    reparto: dEmpresa + mEmpresa,
    redondeo: e.redondeoBruto,
    rentabilidad: e.rentabilidad,
    total: comisionEmpresa + dEmpresa + mEmpresa + e.redondeoBruto + e.rentabilidad,
    detalle: { defensa: dEmpresa, margen: mEmpresa },
  });

  const esperado = e.totalVenta - e.costoReal;
  return { defensa, esperado, lineas, cierra: cierraAlCentavo(lineas, esperado), avisos };
}

/**
 * El control de la aprobación (O22), sin creerle a ningún total guardado: cada línea suma sus partes y la suma de las
 * líneas es Total venta − costo real. Acepta BigInt (lo que devuelve la base) o number.
 */
export function cierraAlCentavo(lineas: readonly { comision: number | bigint; reparto: number | bigint; redondeo: number | bigint; rentabilidad: number | bigint; total: number | bigint }[], esperado: number | bigint): boolean {
  let suma = BigInt(0);
  for (const l of lineas) {
    const partes = BigInt(l.comision) + BigInt(l.reparto) + BigInt(l.redondeo) + BigInt(l.rentabilidad);
    if (partes !== BigInt(l.total)) return false;
    suma += BigInt(l.total);
  }
  return suma === BigInt(esperado);
}

// ── Revisión (O21) ──

export interface Comparacion {
  id: "COSTO" | "COBRO";
  titulo: string;
  izquierda: { etiqueta: string; monto: Centavos };
  derecha: { etiqueta: string; monto: Centavos };
  diferencia: Centavos;
}

export function comparacionesDeRevision(c: { costoReal: Centavos; comprobantes: Centavos; facturado: Centavos; cobrado: Centavos }): Comparacion[] {
  return [
    { id: "COSTO", titulo: "Costo real contra comprobantes", izquierda: { etiqueta: "Costo real", monto: c.costoReal }, derecha: { etiqueta: "Comprobantes", monto: c.comprobantes }, diferencia: c.costoReal - c.comprobantes },
    { id: "COBRO", titulo: "Facturado contra cobrado", izquierda: { etiqueta: "Facturado", monto: c.facturado }, derecha: { etiqueta: "Cobrado", monto: c.cobrado }, diferencia: c.facturado - c.cobrado },
  ];
}

/** null = se puede marcar revisada; si no, el motivo. Con diferencia hace falta una nota. */
export function rechazoDeRevision(comparaciones: readonly Comparacion[], nota: string): string | null {
  const conDiferencia = comparaciones.filter((c) => c.diferencia !== 0);
  if (conDiferencia.length > 0 && nota.trim().length < 3) {
    return `Hay diferencia en ${conDiferencia.map((c) => c.titulo.toLowerCase()).join(" y ")}: escribí una nota que la explique para marcarla revisada.`;
  }
  return null;
}

// ── A qué mes va (O23) ──

/** Si la liquidación aprobada ya puede entrar a la mensual, según «cuándo se paga». */
export function listaParaLaMensual(e: { estado: string; cuandoSePaga: string; porCobrar: Centavos }): { lista: true } | { lista: false; motivo: string } {
  if (e.estado !== "APROBADA") return { lista: false, motivo: "La liquidación del proyecto todavía no está aprobada." };
  if (e.cuandoSePaga === CUANDO_AL_APROBAR) return { lista: true };
  if (e.porCobrar > 0) return { lista: false, motivo: `Espera a que el cliente pague todo: faltan cobrar ${pesos(e.porCobrar / 100)}.` };
  return { lista: true };
}

/** El nombre de la línea en la liquidación mensual. */
export const nombreDeLineaMensual = (proyecto: string) => `Proyecto · ${proyecto}`;
