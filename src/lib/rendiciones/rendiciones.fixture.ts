// Datos de prueba del motor de rendiciones (sólo para los tests). Todo ficticio; los CUIT tienen
// dígito verificador válido salvo CUIT_INVALIDA. No depende del escenario de la demo: la
// dependencia va de la app al Core, nunca al revés.

import type {
  Anticipo,
  Comprobante,
  ContextoEvaluacion,
  DatosComprobante,
  Empresa,
  EstadoConstatacion,
  Evaluacion,
  Imputacion,
  Persona,
  Politica,
  Rendicion,
  TipoGasto,
} from "./tipos";

export const EMPRESA: Empresa = { cuit: "30715884301", razonSocial: "Empresa de Prueba S.A." };
export const CUIT_MAESTRO = "30709123455"; // está en el maestro de SAP
export const CUIT_FUERA = "30698882227"; // no está en el maestro
export const CUIT_OTRA_EMPRESA = "30500111220";
export const CUIT_INVALIDA = "30709123456"; // dígito verificador mal

export const POLITICA: Politica = {
  topeSinComprobante: 500000,
  topeEfectivoLey25345: 100000,
  plazoRendicionDias: 30,
  topeDerivacionCxP: 40000000,
  jurisdiccionesInscriptas: ["BA", "CABA"],
  toleranciaCentavos: 2,
};

function tipo(t: Partial<TipoGasto> & Pick<TipoGasto, "id" | "etiqueta" | "tratamientoBase">): TipoGasto {
  return {
    sinonimos: [],
    cuentaMayor: `CTA-${t.id}`,
    indicadorIvaComputable: t.tratamientoBase === "computable" ? "V1" : undefined,
    indicadorIvaNoComputable: "V0",
    exige: [],
    estado: "provisorio",
    fuente: `Fuente de ${t.id}`,
    ...t,
  };
}

export const TIPOS = {
  insumos: tipo({ id: "insumos", etiqueta: "Insumos", tratamientoBase: "computable" }),
  combustible: tipo({
    id: "combustible",
    etiqueta: "Combustible",
    tratamientoBase: "computable",
    exige: ["dominio", "tipoVehiculo"],
  }),
  repuestos: tipo({ id: "repuestos", etiqueta: "Repuestos", tratamientoBase: "computable", exige: ["dominio"] }),
  peajes: tipo({ id: "peajes", etiqueta: "Peajes", tratamientoBase: "computable", exige: ["origenDestino"] }),
  comida: tipo({
    id: "comida",
    etiqueta: "Comidas en viaje",
    tratamientoBase: "no_computable",
    cubiertoPorConvenioCamioneros: true,
  }),
  hotel: tipo({ id: "hotel", etiqueta: "Hotel", tratamientoBase: "no_computable", fuente: "Ley de IVA art. 12 (hotel)" }),
  representacion: tipo({
    id: "representacion",
    etiqueta: "Representación",
    tratamientoBase: "no_computable",
    esRepresentacion: true,
  }),
  estacionamiento: tipo({ id: "estacionamiento", etiqueta: "Estacionamiento", tratamientoBase: "no_computable" }),
  propinas: tipo({
    id: "propinas",
    etiqueta: "Propinas",
    tratamientoBase: "no_registrable",
    admiteSinComprobante: true,
  }),
} satisfies Record<string, TipoGasto>;

export const DICCIONARIO: TipoGasto[] = Object.values(TIPOS);

export const PERSONA: Persona = {
  legajo: "1001",
  nombre: "Persona de Prueba",
  puesto: "Vendedora",
  roles: ["rinde"],
  jefeLegajo: "2001",
  centroCosto: "CC-1",
  convenioCamioneros: false,
  vehiculos: [],
};

export const CHOFER: Persona = { ...PERSONA, legajo: "1002", nombre: "Chofer de Prueba", convenioCamioneros: true };

export function contexto(parcial: Partial<ContextoEvaluacion> = {}): ContextoEvaluacion {
  return {
    empresa: EMPRESA,
    politica: POLITICA,
    diccionario: DICCIONARIO,
    persona: PERSONA,
    viajes: [],
    otrosComprobantes: [],
    maestroProveedores: new Set([CUIT_MAESTRO]),
    periodo: "2026-09",
    reglaVersion: "reglas-prueba@1",
    ...parcial,
  };
}

export interface ParcialComprobante {
  id?: string;
  rendicionId?: string;
  legajo?: string;
  datos?: Partial<DatosComprobante>;
  imputacion?: Partial<Imputacion>;
  constatacion?: EstadoConstatacion;
  cuitApocrifa?: boolean | "sin_consultar";
  hashImagen?: string;
}

/**
 * Factura A limpia: insumos de un proveedor del maestro, a nombre de la empresa, con tarjeta
 * corporativa (no dispara R5), jurisdicción BA y dentro del período. El motor no avisa nada.
 */
export function comprobante(o: ParcialComprobante = {}): Comprobante {
  return {
    id: o.id ?? "C-1",
    rendicionId: o.rendicionId ?? "R-1",
    legajo: o.legajo ?? PERSONA.legajo,
    datos: {
      clase: "factura_a",
      leyendaA: "ninguna",
      fecha: "2026-09-10",
      cuitEmisor: CUIT_MAESTRO,
      razonSocialEmisor: "Proveedor del Maestro S.A.",
      puntoVenta: 1,
      numero: 101,
      cae: "70000000000001",
      cuitReceptor: EMPRESA.cuit,
      lineasIva: [{ alicuota: 21, neto: 1000000, iva: 210000 }],
      percepciones: [],
      noGravado: 0,
      exento: 0,
      impuestosInternos: 0,
      total: 1210000,
      moneda: "ARS",
      esControladorFiscal: false,
      ...o.datos,
    },
    origenCampos: {},
    imputacion: {
      tipoGastoId: "insumos",
      centroCosto: "CC-1",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      medioPago: { tipo: "tarjeta_corporativa", tarjetaId: "TJ-1" },
      ...o.imputacion,
    },
    constatacion: o.constatacion ?? "aprobada",
    cuitApocrifa: o.cuitApocrifa ?? false,
    ...(o.hashImagen ? { hashImagen: o.hashImagen } : {}),
  };
}

export function rendicion(parcial: Partial<Rendicion> = {}): Rendicion {
  return {
    id: "R-1",
    legajo: PERSONA.legajo,
    periodo: "2026-09",
    anticipoIds: [],
    comprobanteIds: [],
    devolucionDeclarada: 0,
    estado: "borrador",
    nivelActual: 0,
    historial: [],
    ...parcial,
  };
}

export function anticipo(parcial: Partial<Anticipo> = {}): Anticipo {
  return {
    id: "A-1",
    legajo: PERSONA.legajo,
    motivo: "Viaje",
    importe: 50000000,
    medio: "efectivo",
    origen: "Caja",
    fechaEntrega: "2026-09-01",
    vence: "2026-10-01",
    centroCosto: "CC-1",
    ...parcial,
  };
}

/** Códigos de validación, ordenados y sin repetir: para comparar conjuntos. */
export function codigos(e: Evaluacion): string[] {
  return [...new Set(e.validaciones.map((v) => v.codigo))].sort();
}

/** Congela en profundidad (para probar que las funciones no mutan lo que reciben). */
export function congelar<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) congelar(v);
  }
  return x;
}
