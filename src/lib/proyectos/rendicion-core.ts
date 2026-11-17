/**
 * Motor de la rendición del proyecto (GSG-MIA-056 · T04): el premio por defender el costo («defensa») y el reparto de
 * Total venta − costo real entre MIA y las personas del proyecto. Replica el bloque «RENDICION FINAL» de la planilla
 * de MIA (Factory-GSG 00-ESTADO/MIA-PROYECTOS-ADMINISTRACION-DISENO-2026-11-16.md § 1.5) con las reglas de plata
 * del § 2.6. No es la rendición de gastos de campo (`rendiciones-core.ts`).
 *
 * PURA: no lee la base, ni el reloj, ni el azar. La matriz de reparto y el criterio de la defensa negativa llegan
 * como argumento. Plata en centavos enteros; los porcentajes, con hasta dos decimales (ver `precio-core.ts`).
 *
 * Conceptos (columnas) y quién los cobra:
 *   defensa       = CO + AD − costo real. Se reparte con la matriz; MIA recibe el resto.
 *   redondeo      = el redondeo bruto del tablero. Queda 100 % en MIA (Dis. § 1.4: contiene IIB y GA; pregunta 1).
 *   comisiones    = cada función cobra la suya, ya calculada en el tablero. No se reparten sobre 100.
 *   margenError   = el del tablero. Se reparte con la matriz; MIA recibe el resto.
 *   rentabilidad  = entera a MIA.
 * Control de cierre: la suma de todas las filas es Total venta − costo real, al centavo (Dis. § 2.6).
 */
import { aPuntosBasicos, type Centavos, type Precio } from "./precio-core";

export const PARTICIPANTES = ["mia", "productor1", "productor2", "comercial"] as const;
export type Participante = (typeof PARTICIPANTES)[number];
export const PERSONAS = ["productor1", "productor2", "comercial"] as const;
export type Persona = (typeof PERSONAS)[number];
/** Porcentaje de cada persona en un concepto, en puntos con hasta dos decimales. MIA recibe 100 − la suma. */
export type PorPersona = Record<Persona, number>;

export interface MatrizReparto {
  defensa: PorPersona;
  /** Tiene que ir en 0 para todas las personas hasta que MIA conteste la pregunta 1 (plan § 4.2). */
  redondeo: PorPersona;
  margenError: PorPersona;
}

export interface FilaRendicion {
  defensa: Centavos;
  redondeo: Centavos;
  comisiones: Centavos;
  margenError: Centavos;
  rentabilidad: Centavos;
  total: Centavos;
}

export interface EntradaRendicion {
  /** El tablero, con el total de venta escrito. */
  precio: Precio;
  costoReal: Centavos;
  matriz: MatrizReparto;
  /** Decisión 4 del Dis. § 7: «descuenta» (A, como la planilla, con aviso) o «pisoCero» (B: el exceso lo absorbe MIA). */
  defensaNegativa: "descuenta" | "pisoCero";
}

export interface Rendicion {
  defensa: Centavos;
  defensaNegativa: boolean;
  filas: Record<Participante, FilaRendicion>;
  totales: FilaRendicion;
  control: { suma: Centavos; esperado: Centavos; cierra: boolean };
  avisos: string[];
}

export interface Diferencia {
  id: string;
  planilla: string;
  motor: string;
  fuente: string;
}

/**
 * La matriz de la planilla base (Dis. § 1.5): defensa 75 % MIA y 25 % el productor; redondeo y margen de error, 100 %
 * MIA. PROVISIONAL A CONFIRMAR: la decisión 3 del Dis. § 7 (recomendada C) la deja repartible por proyecto.
 */
export const MATRIZ_PLANTILLA: Readonly<MatrizReparto & { provisional: true }> = Object.freeze({
  defensa: Object.freeze({ productor1: 25, productor2: 0, comercial: 0 }),
  redondeo: Object.freeze({ productor1: 0, productor2: 0, comercial: 0 }),
  margenError: Object.freeze({ productor1: 0, productor2: 0, comercial: 0 }),
  provisional: true,
});

/**
 * Las cuatro diferencias leídas en las fórmulas de la planilla base (Dis. § 1.5; DRIVE-INVENTARIO-2026-11-16.md:146-149).
 * El motor no las copia ni decide por MIA: se las muestra para que diga qué cuenta vale (preguntas 3 y 12).
 */
export const DIFERENCIAS_CON_PLANILLA: readonly Diferencia[] = Object.freeze([
  {
    id: "comision-productor-2",
    planilla: "La comisión del «Productor 2» entra en el total de comisiones y ninguna fila la cobra (en la base está en 0 %).",
    motor: "La cobra la fila del productor 2. La suma de las filas sigue siendo Total venta − costo real.",
    fuente: "DRIVE-INVENTARIO-2026-11-16.md:146",
  },
  {
    id: "totales-por-persona",
    planilla: "El total del productor no suma su parte de redondeo (L18) y el del comercial no suma su parte de defensa (L19).",
    motor: "El total de cada persona suma todas sus columnas. El redondeo de las personas es 0 hasta la pregunta 1.",
    fuente: "DRIVE-INVENTARIO-2026-11-16.md:147",
  },
  {
    id: "costo-real-duplicado",
    planilla: "El total de costos reales suma el total de «Costos Reales» y además su línea 30, que ese total ya incluye (duplica desde 26 líneas).",
    motor: "El costo real entra como un solo número, el de los gastos del proyecto. No se le suma ninguna línea.",
    fuente: "DRIVE-INVENTARIO-2026-11-16.md:148",
  },
  {
    id: "celdas-sin-efecto",
    planilla: "Las celdas de margen de error y rentabilidad del productor y del comercial apuntan a la fila de arriba o dividen por cero (no se suman).",
    motor: "Margen de error de las personas según la matriz (0 en la plantilla); la rentabilidad va entera a MIA.",
    fuente: "DRIVE-INVENTARIO-2026-11-16.md:149",
  },
]);

const CONCEPTOS = ["defensa", "redondeo", "comisiones", "margenError", "rentabilidad"] as const;

function puntosDe(nombre: string, porPersona: PorPersona): Record<Persona, number> {
  const pb = { productor1: aPuntosBasicos(porPersona.productor1), productor2: aPuntosBasicos(porPersona.productor2), comercial: aPuntosBasicos(porPersona.comercial) };
  if (pb.productor1 + pb.productor2 + pb.comercial > 10_000) throw new RangeError(`${nombre}: los porcentajes de las personas suman más de 100 %.`);
  return pb;
}

/**
 * La parte exacta de `monto` según `pb` puntos básicos, sin el centavo partido (hacia el cero): nadie recibe más
 * de lo exacto y el centavo que sobra queda en MIA (Dis. § 2.6). Con un monto negativo, igual: nadie pierde de más.
 */
function parteSinCentavoPartido(monto: Centavos, pb: number): Centavos {
  const n = Number((BigInt(monto) * BigInt(pb)) / 10_000n); // BigInt divide hacia el cero
  return n === 0 ? 0 : n;
}

/** Reparte un concepto: cada persona su parte; MIA, el resto. La suma es el concepto, al centavo. */
function repartir(monto: Centavos, pb: Record<Persona, number>): Record<Participante, Centavos> {
  const personas = { productor1: parteSinCentavoPartido(monto, pb.productor1), productor2: parteSinCentavoPartido(monto, pb.productor2), comercial: parteSinCentavoPartido(monto, pb.comercial) };
  return { mia: monto - personas.productor1 - personas.productor2 - personas.comercial, ...personas };
}

function fila(defensa: Centavos, redondeo: Centavos, comisiones: Centavos, margenError: Centavos, rentabilidad: Centavos): FilaRendicion {
  return { defensa, redondeo, comisiones, margenError, rentabilidad, total: defensa + redondeo + comisiones + margenError + rentabilidad };
}

export function calcularRendicion(e: EntradaRendicion): Rendicion {
  const { precio } = e;
  if (precio.totalVenta === null || precio.redondeoBruto === null) throw new RangeError("Sin total de venta no hay rendición: escribí el total.");
  if (!Number.isSafeInteger(e.costoReal) || e.costoReal < 0) throw new RangeError(`Costo real: tiene que ser un importe en centavos enteros, cero o más (llegó ${String(e.costoReal)}).`);
  const pbDefensa = puntosDe("Defensa", e.matriz.defensa);
  const pbRedondeo = puntosDe("Redondeo", e.matriz.redondeo);
  const pbMargen = puntosDe("Margen de error", e.matriz.margenError);
  if (pbRedondeo.productor1 + pbRedondeo.productor2 + pbRedondeo.comercial !== 0) {
    throw new RangeError("El redondeo queda 100 % en MIA: contiene IIB y GA y no se reparte a personas hasta que MIA conteste (pregunta 1).");
  }

  const defensa = precio.costoOriginal + precio.adicionales - e.costoReal;
  const negativa = defensa < 0;
  const reparteDefensa = negativa && e.defensaNegativa === "pisoCero" ? { mia: defensa, productor1: 0, productor2: 0, comercial: 0 } : repartir(defensa, pbDefensa);
  const reparteMargen = repartir(precio.margenError, pbMargen);
  const comisiones: Record<Participante, Centavos> = { mia: 0, ...precio.comisiones };

  const filas = {} as Record<Participante, FilaRendicion>;
  for (const p of PARTICIPANTES) {
    filas[p] = fila(reparteDefensa[p], p === "mia" ? precio.redondeoBruto : 0, comisiones[p], reparteMargen[p], p === "mia" ? precio.rentabilidad : 0);
  }
  const totales = sumarFilas(filas);
  const esperado = precio.totalVenta - e.costoReal;
  const avisos: string[] = [];
  if (negativa) {
    avisos.push(
      e.defensaNegativa === "pisoCero"
        ? "Defensa negativa: el costo real pasó al aprobado. Las personas quedan en cero y MIA absorbe la diferencia."
        : "Defensa negativa: el costo real pasó al aprobado y la diferencia se descuenta según el reparto (decisión 4 A, provisional).",
    );
  }
  return { defensa, defensaNegativa: negativa, filas, totales, control: { suma: totales.total, esperado, cierra: totales.total === esperado }, avisos };
}

function sumarFilas(filas: Record<Participante, FilaRendicion>): FilaRendicion {
  const t = { defensa: 0, redondeo: 0, comisiones: 0, margenError: 0, rentabilidad: 0, total: 0 };
  for (const p of PARTICIPANTES) for (const c of [...CONCEPTOS, "total"] as const) t[c] += filas[p][c];
  return t;
}

/**
 * Vuelve a hacer el control desde las filas, sin creerle a los totales guardados: cada fila suma sus columnas, cada
 * columna suma su total, y el total es Total venta − costo real. Lo usa la aprobación (T10, O22) antes de congelar.
 */
export function cierraAlCentavo(r: Rendicion): boolean {
  const suma = sumarFilas(r.filas);
  const filasCierran = PARTICIPANTES.every((p) => CONCEPTOS.reduce((s, c) => s + r.filas[p][c], 0) === r.filas[p].total);
  const columnasCierran = [...CONCEPTOS, "total"].every((c) => suma[c as keyof FilaRendicion] === r.totales[c as keyof FilaRendicion]);
  return filasCierran && columnasCierran && suma.total === r.control.esperado;
}

/** Lo que cambia para cada participante entre dos rendiciones (p. ej., un comprobante tardío, O24). */
export function ajusteEntre(antes: Rendicion, despues: Rendicion): Record<Participante, Centavos> & { total: Centavos } {
  const out = { total: 0 } as Record<Participante, Centavos> & { total: Centavos };
  for (const p of PARTICIPANTES) {
    out[p] = despues.filas[p].total - antes.filas[p].total;
    out.total += out[p];
  }
  return out;
}
