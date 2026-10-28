// ============================================================================
// RECHAZOS DE ARCA, EN CRIOLLO — qué pasó, qué hacer y quién lo resuelve. PURO.
// ============================================================================
//
// ARCA devuelve el motivo con un código y un texto técnico («10016: El campo CbteFch no se
// encuentra en el rango…»). La contadora necesita tres cosas: qué quiere decir, qué hace ella (o
// a quién le pide) y si tiene sentido volver a intentar sin cambiar nada. El motivo original se
// muestra SIEMPRE al lado: esto lo explica, no lo reemplaza.
//
// Los códigos de 3 cifras (50x, 60x) sólo cuentan al principio del motivo, que es donde ARCA los
// pone: «$1.600» en el medio de un texto no es un error de autorización.
// Los códigos son los del manual de WSFEv1 (observaciones y errores más comunes) y los textos
// del propio motor (perfil fiscal incompleto, IVA por producto). Lo que no se reconoce cae en una
// explicación genérica honesta: nunca se inventa una causa.

export type QuienLoResuelve = "estudio" | "gsg" | "arca";

export interface RechazoExplicado {
  /** Qué pasó, en una línea. */
  queQuiereDecir: string;
  /** Qué hacer, en una línea. */
  queHacer: string;
  quien: QuienLoResuelve;
  /** `true` si volver a mandar lo MISMO puede andar (ARCA caído, plazo vencido que el lote corrige). */
  sirveReintentar: boolean;
}

interface Patron {
  test: RegExp;
  explicacion: RechazoExplicado;
}

const PATRONES: readonly Patron[] = [
  {
    // Pasajero: ARCA no respondió o falló de su lado.
    test: /^\s*50[0-9]\b|\b(ECONNRESET|ETIMEDOUT|timeout|no respondi[oó]|servicio no disponible|error interno)\b/i,
    explicacion: {
      queQuiereDecir: "ARCA no respondió o tuvo un error de su lado. El comprobante no tiene nada mal.",
      queHacer: "Volvé a mandarlo en unos minutos. Si sigue igual más de una hora, avisale a Soporte GSG.",
      quien: "arca",
      sirveReintentar: true,
    },
  },
  {
    test: /^\s*60[0-2]\b|\b(ValidacionDeToken|no autorizado|Computador no autorizado|CUIT representada|relaci[oó]n)\b/i,
    explicacion: {
      queQuiereDecir: "ARCA no deja facturar por este cliente: falta la autorización de factura electrónica a Gestión Studio Grow, o venció.",
      queHacer:
        "Pedile al cliente que entre a ARCA, Administrador de Relaciones, y autorice el servicio «Facturación electrónica» al CUIT de Gestión Studio Grow. Si ya lo hizo, avisale a Soporte GSG.",
      quien: "gsg",
      sirveReintentar: false,
    },
  },
  {
    test: /\b(10004|10005|10006)\b|punto de venta/i,
    explicacion: {
      queQuiereDecir: "El punto de venta no está habilitado para factura electrónica por sistema (web service).",
      queHacer:
        "En ARCA, «Administración de puntos de venta y domicilios», el punto tiene que ser del tipo «RECE para aplicativo y web services». Si el número cargado está mal, pedile a Soporte GSG que lo corrija.",
      quien: "estudio",
      sirveReintentar: false,
    },
  },
  {
    test: /\b(10016|10017|10036)\b|CbteFch|fecha.*(rango|plazo|ventana)/i,
    explicacion: {
      queQuiereDecir: "La fecha del comprobante quedó fuera del plazo que acepta ARCA (5 días en bienes, 10 en servicios).",
      queHacer: "Volvé a emitirlo con la fecha de hoy: en los abonos lo hace solo el lote del mes.",
      quien: "estudio",
      sirveReintentar: true,
    },
  },
  {
    test: /\b(10013|10015|10069)\b|DocNro|DocTipo|documento del receptor/i,
    explicacion: {
      queQuiereDecir: "El CUIT o DNI de a quién se le facturó no es válido para ARCA.",
      queHacer: "Corregí el documento del comprador (en el abono, editá la regla) y volvé a emitirlo.",
      quien: "estudio",
      sirveReintentar: false,
    },
  },
  {
    test: /\b(10242|10243|10246)\b|CondicionIVAReceptor|condici[oó]n.*(iva|frente al iva).*receptor/i,
    explicacion: {
      queQuiereDecir: "La condición frente al IVA del comprador no corresponde a este tipo de factura.",
      queHacer: "Revisá si el comprador es consumidor final, monotributista o inscripto, corregilo y volvé a emitirlo.",
      quien: "estudio",
      sirveReintentar: false,
    },
  },
  {
    test: /IVA_SIN_ALICUOTA|al[ií]cuota de cada producto|inscripto.*todav[ií]a/i,
    explicacion: {
      queQuiereDecir: "Es una factura de responsable inscripto y el sistema todavía no discrimina el IVA de este comprobante.",
      queHacer: "Por ahora emitila desde ARCA (Comprobantes en línea). Volver a mandarla da el mismo rechazo.",
      quien: "estudio",
      sirveReintentar: false,
    },
  },
  {
    test: /Perfil fiscal incompleto|PerfilFiscalIncompleto/i,
    explicacion: {
      queQuiereDecir: "Al cliente le faltan datos fiscales en el sistema (CUIT, punto de venta o condición frente al IVA).",
      queHacer: "Pedíselos a Soporte GSG desde la ficha del cliente: «Pedir a Soporte GSG».",
      quien: "gsg",
      sirveReintentar: false,
    },
  },
  {
    test: /\b(10048|10051|10061)\b|ImpTotal|importe/i,
    explicacion: {
      queQuiereDecir: "Los importes del comprobante no cierran para ARCA (total, neto o IVA).",
      queHacer: "Revisá el importe (en el abono, editá la regla) y volvé a emitirlo. Si el importe está bien, avisale a Soporte GSG.",
      quien: "estudio",
      sirveReintentar: false,
    },
  },
];

const GENERICO: RechazoExplicado = {
  queQuiereDecir: "ARCA lo rechazó con el motivo de abajo.",
  queHacer: "Corregí lo que marca el motivo y volvé a emitirlo. Si no se entiende qué corregir, pasáselo a Soporte GSG tal cual.",
  quien: "estudio",
  sirveReintentar: false,
};

/** Explica el motivo de un rechazo. Sin motivo, lo dice así. PURA. */
export function explicarRechazo(motivo: string | null | undefined): RechazoExplicado {
  const m = (motivo ?? "").trim();
  if (!m) return { ...GENERICO, queQuiereDecir: "ARCA lo rechazó sin mandar el motivo." };
  return PATRONES.find((p) => p.test.test(m))?.explicacion ?? GENERICO;
}

export const QUIEN_TEXTO: Readonly<Record<QuienLoResuelve, string>> = {
  estudio: "Lo resolvés vos",
  gsg: "Lo resuelve Soporte GSG",
  arca: "Es de ARCA",
};
