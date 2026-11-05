/**
 * Motor de asientos contables (Contabilidad, ola 1 — docs/producto/contabilidad/PLAN.md §5).
 *
 * PURO: sin Prisma ni framework. Valida un asiento antes de que toque la base y arma el
 * contra-asiento de uno confirmado (un asiento CONFIRMADO no se edita ni se borra: se
 * contra-asienta, y el nuevo apunta al original con `anulaAsientoId`).
 *
 * Montos en CENTAVOS `bigint` (nunca Float/Decimal): la suma no pierde precisión con inflación.
 * La base vuelve a controlar lo mismo (CHECK por línea y trigger diferido de cuadre, migración
 * 20261104122000_contabilidad_ola1): el motor da el error en criollo, la base es la red.
 */

export type TipoCuenta = "ACTIVO" | "PASIVO" | "PATRIMONIO_NETO" | "RESULTADO_POSITIVO" | "RESULTADO_NEGATIVO";
/** DEUDORA: saldo normal al debe. ACREEDORA: al haber. Las regularizadoras invierten la de su rubro. */
export type Naturaleza = "DEUDORA" | "ACREEDORA";
export type OrigenAsiento = "MANUAL" | "FACTURA" | "COBRO" | "PAGO" | "APERTURA" | "CIERRE" | "REFUNDICION" | "AJUSTE";
export type EstadoEjercicio = "ABIERTO" | "CERRADO";

/** Naturaleza habitual del tipo (la de una cuenta regularizadora es la opuesta). */
export function naturalezaPorTipo(tipo: TipoCuenta): Naturaleza {
  return tipo === "ACTIVO" || tipo === "RESULTADO_NEGATIVO" ? "DEUDORA" : "ACREEDORA";
}

export interface EjercicioParaValidar {
  fechaInicio: Date;
  fechaCierre: Date;
  estado: EstadoEjercicio;
}
export type EstadoAsiento = "BORRADOR" | "CONFIRMADO";

/** Lo mínimo de una cuenta que el motor necesita para validar una imputación. */
export interface CuentaParaValidar {
  id: string;
  tenantId: string;
  codigo: string;
  nombre: string;
  imputable: boolean;
  activa: boolean;
}

export interface LineaAsiento {
  cuentaId: string;
  /** Centavos. Una línea es SÓLO debe o SÓLO haber. */
  debe: bigint;
  haber: bigint;
  detalle?: string | null;
}

export type CodigoErrorAsiento =
  | "POCAS_LINEAS"
  | "DESCUADRADO"
  | "TOTAL_EN_CERO"
  | "MONTO_NEGATIVO"
  | "LINEA_DEBE_Y_HABER"
  | "LINEA_EN_CERO"
  | "MONTO_EXCEDIDO"
  | "CUENTA_INEXISTENTE"
  | "CUENTA_NO_IMPUTABLE"
  | "CUENTA_INACTIVA"
  | "CUENTA_DE_OTRO_NEGOCIO"
  | "FECHA_INVALIDA"
  | "SIN_EJERCICIO"
  | "EJERCICIO_CERRADO"
  | "FECHA_FUERA_DEL_EJERCICIO";

export interface ErrorAsiento {
  codigo: CodigoErrorAsiento;
  /** Texto para mostrar tal cual: qué pasa y cómo seguir. */
  mensaje: string;
  /** Índice (base 0) de la línea con problema, si el error es de una línea. */
  linea?: number;
}

export type ResultadoValidacion =
  | { ok: true; totalDebe: bigint; totalHaber: bigint }
  | { ok: false; errores: ErrorAsiento[] };

export interface OpcionesValidacion {
  /** Negocio dueño del asiento: toda cuenta imputada tiene que ser de él. */
  tenantId?: string;
  fecha?: Date;
  /**
   * Ejercicio al que se imputa. Si se pasa `fecha`, tiene que venir el ejercicio (`null` = no hay
   * ninguno que la contenga) y estar ABIERTO con la fecha adentro.
   */
  ejercicio?: EjercicioParaValidar | null;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

const CERO = BigInt(0);
/** Máximo de BIGINT en Postgres (2^63 − 1): más que eso la base no lo guarda. */
export const MAXIMO_CENTAVOS = BigInt("9223372036854775807");

/** Formatea centavos como pesos para los mensajes: 123456n → "$ 1.234,56". */
export function formatearCentavos(centavos: bigint): string {
  const negativo = centavos < CERO;
  const abs = negativo ? -centavos : centavos;
  const pesos = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cent = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}$ ${pesos},${cent}`;
}

/**
 * Valida un asiento. Devuelve TODOS los errores encontrados (no sólo el primero), para que la
 * pantalla marque cada línea mal de una vez.
 *
 * Reglas: ≥ 2 líneas · cada línea sólo debe o sólo haber, > 0 · cuenta existente, imputable y
 * activa · todas las cuentas del mismo negocio · Σ debe === Σ haber · total ≠ 0 · fecha válida y
 * dentro de un ejercicio ABIERTO.
 */
export function validarAsiento(
  lineas: readonly LineaAsiento[],
  cuentas: readonly CuentaParaValidar[],
  opts: OpcionesValidacion = {},
): ResultadoValidacion {
  const errores: ErrorAsiento[] = [];

  if (opts.fecha !== undefined && Number.isNaN(opts.fecha.getTime())) {
    errores.push({ codigo: "FECHA_INVALIDA", mensaje: "La fecha del asiento no es válida. Elegí una fecha del calendario." });
  } else if (opts.fecha !== undefined && opts.ejercicio !== undefined) {
    const ej = opts.ejercicio;
    if (ej === null) {
      errores.push({ codigo: "SIN_EJERCICIO", mensaje: "No hay un ejercicio abierto que contenga esa fecha. Abrí el ejercicio o cambiá la fecha." });
    } else if (ej.estado !== "ABIERTO") {
      errores.push({ codigo: "EJERCICIO_CERRADO", mensaje: "El ejercicio de esa fecha está cerrado: no admite asientos nuevos." });
    } else if (dia(opts.fecha) < dia(ej.fechaInicio) || dia(opts.fecha) > dia(ej.fechaCierre)) {
      errores.push({
        codigo: "FECHA_FUERA_DEL_EJERCICIO",
        mensaje: `La fecha queda fuera del ejercicio (${dia(ej.fechaInicio)} al ${dia(ej.fechaCierre)}).`,
      });
    }
  }

  if (lineas.length < 2) {
    errores.push({
      codigo: "POCAS_LINEAS",
      mensaje: "Un asiento necesita al menos dos líneas: una al debe y otra al haber.",
    });
  }

  const porId = new Map(cuentas.map((c) => [c.id, c]));
  // El negocio de referencia: el explícito o, si no vino, el de la primera cuenta encontrada.
  let negocio = opts.tenantId;
  let totalDebe = CERO;
  let totalHaber = CERO;

  lineas.forEach((l, i) => {
    const n = i + 1;
    if (l.debe < CERO || l.haber < CERO) {
      errores.push({ codigo: "MONTO_NEGATIVO", linea: i, mensaje: `Línea ${n}: los importes no pueden ser negativos. Para revertir, cargá el importe del otro lado.` });
    } else if (l.debe > CERO && l.haber > CERO) {
      errores.push({ codigo: "LINEA_DEBE_Y_HABER", linea: i, mensaje: `Línea ${n}: tiene importe al debe y al haber. Cada línea va de un solo lado; separala en dos.` });
    } else if (l.debe === CERO && l.haber === CERO) {
      errores.push({ codigo: "LINEA_EN_CERO", linea: i, mensaje: `Línea ${n}: no tiene importe. Cargá un monto al debe o al haber, o borrala.` });
    }
    if (l.debe > MAXIMO_CENTAVOS || l.haber > MAXIMO_CENTAVOS) {
      errores.push({ codigo: "MONTO_EXCEDIDO", linea: i, mensaje: `Línea ${n}: el importe es demasiado grande. Revisá que no sobren dígitos.` });
    }
    totalDebe += l.debe;
    totalHaber += l.haber;

    const cuenta = porId.get(l.cuentaId);
    if (!cuenta) {
      errores.push({ codigo: "CUENTA_INEXISTENTE", linea: i, mensaje: `Línea ${n}: la cuenta elegida no existe en el plan de cuentas de este negocio.` });
      return;
    }
    if (negocio === undefined) negocio = cuenta.tenantId;
    if (cuenta.tenantId !== negocio) {
      errores.push({ codigo: "CUENTA_DE_OTRO_NEGOCIO", linea: i, mensaje: `Línea ${n}: la cuenta ${cuenta.codigo} no es de este negocio.` });
      return;
    }
    if (!cuenta.imputable) {
      errores.push({
        codigo: "CUENTA_NO_IMPUTABLE",
        linea: i,
        mensaje: `Línea ${n}: «${cuenta.codigo} ${cuenta.nombre}» agrupa otras cuentas y no recibe movimientos. Elegí una cuenta de detalle.`,
      });
    }
    if (!cuenta.activa) {
      errores.push({ codigo: "CUENTA_INACTIVA", linea: i, mensaje: `Línea ${n}: «${cuenta.codigo} ${cuenta.nombre}» está dada de baja. Reactivala o elegí otra.` });
    }
  });

  if (lineas.length >= 2 && totalDebe !== totalHaber) {
    const dif = totalDebe > totalHaber ? totalDebe - totalHaber : totalHaber - totalDebe;
    errores.push({
      codigo: "DESCUADRADO",
      mensaje: `El asiento no cuadra: el debe suma ${formatearCentavos(totalDebe)} y el haber ${formatearCentavos(totalHaber)} (diferencia ${formatearCentavos(dif)}).`,
    });
  }
  if (lineas.length >= 2 && totalDebe === CERO && totalHaber === CERO) {
    errores.push({ codigo: "TOTAL_EN_CERO", mensaje: "El asiento suma cero. Cargá los importes antes de guardarlo." });
  }

  return errores.length ? { ok: false, errores } : { ok: true, totalDebe, totalHaber };
}

export interface AsientoParaContraasentar {
  numero?: number;
  fecha: Date;
  descripcion: string;
  lineas: readonly LineaAsiento[];
}

/**
 * Contra-asiento: mismas cuentas, debe y haber invertidos. Es la ÚNICA forma de corregir un
 * asiento CONFIRMADO (no se edita). La fecha la decide quien llama (por defecto, la del original).
 */
export function contraAsiento(
  asiento: AsientoParaContraasentar,
  fecha: Date = asiento.fecha,
): { fecha: Date; descripcion: string; lineas: LineaAsiento[] } {
  const ref = asiento.numero !== undefined ? `N° ${asiento.numero}` : `«${asiento.descripcion}»`;
  return {
    fecha,
    descripcion: `Contra-asiento del asiento ${ref}: ${asiento.descripcion}`,
    lineas: asiento.lineas.map((l) => ({
      cuentaId: l.cuentaId,
      debe: l.haber,
      haber: l.debe,
      ...(l.detalle != null ? { detalle: l.detalle } : {}),
    })),
  };
}
