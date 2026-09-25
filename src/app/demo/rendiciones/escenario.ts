/**
 * RENDÍ — escenario de la demo. TODO ES FICTICIO: empresa, personas, CUITs (con dígito verificador
 * válido), CAEs, cuentas y números de proveedor. Los parámetros SAP son placeholders "provisional a
 * confirmar". Especificación: src/lib/rendiciones/CONTRATO.md (§ Escenario de la demo).
 *
 * Cómo se usa con el motor:
 * - Contexto de evaluación: `otrosComprobantes` = `escenarioDemo.comprobantes` (en orden de carga: el
 *   primero que se cargó es el bueno) y `maestroProveedores` = las claves de
 *   `escenarioDemo.parametrosSap.maestroProveedores` (CUIT → número de proveedor en SAP).
 * - Tolerancia de cuadratura y de conciliación: `politica.toleranciaCentavos`.
 * - El tipo de gasto "sin_clasificar" NO está en el diccionario a propósito: sirve para mostrar R1.
 *
 * ── R-1042-2609 · Rubén Gómez · borrador ─────────────────────────────────────────────────────────
 * Anticipo $ 500.000 en efectivo; declara devolver $ 40.000. Pagado con el efectivo del anticipo:
 *     combustible 212.000 + peaje 10.000 + repuesto 145.200 + propina 3.000
 *   + ferretería 14.520 + maxikiosco 62.580                                   = $ 447.300 exactos
 *   500.000 − 447.300 − 40.000 = $ 12.700 sin justificar → NO cuadra.
 * Con plata propia (no toca la cuadratura): la comida (18.000), el taller con leyenda (544.500) y el
 * repuesto cargado dos veces (145.200). Así, al resolver esos tres bloqueos el faltante sigue siendo
 * $ 12.700 (lo que cierra la factura de la gomería "del bolsillo" en la demo). El maxikiosco es la
 * línea libre que se ajustó para llegar a los $ 447.300.
 * Códigos que da el motor (los de la especificación más los que la política agrega sola: R5 en todo
 * pago en efectivo de más de $ 1.000, R4 informativo en los tickets de controlador fiscal y R2 en lo
 * que no trae la CUIT de la empresa):
 *   01 combustible (A, NQ)          R9_PROVINCIA_NO_INSCRIPTA · R5_EFECTIVO_SOBRE_TOPE        → factura
 *   02 peaje (tique de peaje)       R4_SIN_CONSTATACION_POSIBLE · R5_EFECTIVO_SOBRE_TOPE      → factura
 *   03 comida en ruta (B)           R11_CUBIERTO_POR_CONVENIO (bloquea) · R2_IVA_CONTENIDO_A_CERO · R2_PEDI_LA_CUIT
 *   04 repuesto (A)                 R5_EFECTIVO_SOBRE_TOPE                                     → factura
 *   05 taller (A con leyenda)       R3_FACTURA_CON_LEYENDA (bloquea)                           → cuentas a pagar
 *   06 propina sin comprobante      R11_SIN_COMPROBANTE · R5_EFECTIVO_SOBRE_TOPE               → no se contabiliza
 *   07 repuesto repetido            V6_DUPLICADO (bloquea)
 *   08 ferretería (A)               V3_PROVEEDOR_FUERA_DEL_MAESTRO · R5_EFECTIVO_SOBRE_TOPE   → factura (alta pendiente)
 *   09 maxikiosco (tique)           R2_PEDI_LA_CUIT · R4_SIN_CONSTATACION_POSIBLE · R5_EFECTIVO_SOBRE_TOPE → asiento
 *
 * ── R-1107-2609 · Laura Benítez · en aprobación, nivel 0 ─────────────────────────────────────────
 * Anticipo $ 300.000 por recargable: hotel 121.000 + restaurante 54.450 + combustible 115.550 +
 * estacionamiento 9.000 = $ 300.000 → cuadra exacto. Nivel único "jefe" = 2002 (Paz), con 2001 (Ruiz)
 * como suplente del 20 al 30/09.
 *   01 hotel (A)                    R1_NO_COMPUTA_POR_LEY                                      → asiento
 *   02 representación (A)           R1_NO_COMPUTA_POR_LEY                                      → asiento
 *   03 combustible, automóvil (A)   R10_TOPE_AUTOMOVIL                                         → factura
 *   04 estacionamiento (tique B)    R2_IVA_CONTENIDO_A_CERO · R2_PEDI_LA_CUIT · R4_SIN_CONSTATACION_POSIBLE → asiento
 *
 * ── R-1150-2609 · Martín Sosa · en control ───────────────────────────────────────────────────────
 * Anticipo $ 150.000 en efectivo: insumos 73.800 + factura C 7.800 + factura apócrifa 48.400 = 130.000;
 * declara devolver $ 20.000 → cuadra. La apócrifa se detectó en el control de Tesorería (al enviarse la
 * CUIT todavía no estaba consultada): el evento `tomar_control` la deja señalada como devuelta y el lote
 * contable la saca por estar bloqueada.
 *   01 insumos (A, percepción IIBB) R5_EFECTIVO_SOBRE_TOPE                                     → factura
 *   02 kiosco (factura C)           R5_EFECTIVO_SOBRE_TOPE                                     → asiento
 *   03 apócrifa (A)                 R4_CUIT_APOCRIFA (bloquea) · R5_EFECTIVO_SOBRE_TOPE
 *
 * ── Precarga de IVA Simple ───────────────────────────────────────────────────────────────────────
 * Las facturas electrónicas con QR de las tres rendiciones (A y B, como pide el contrato, más la C del
 * kiosco, que está a nombre de la empresa: sin ella la demo mostraría un falso "no encontrado"). El
 * hotel figura con $ 1.500 más que lo rendido. Suma una factura A de Lubricentro Oeste que nadie rindió.
 */

import {
  tipoArcaDesdeClase,
  urlQrArca,
  type Comprobante,
  type DatosComprobante,
  type EscenarioDemo,
  type LecturaQr,
  type LineaPrecarga,
  type MedioPago,
  type TipoGasto,
} from "@/lib/rendiciones";

const EMPRESA_CUIT = "30715884301";
const PERIODO = "2026-09";

// ─────────────────────────────────────────────────────────────────────────────
// Diccionario (todo provisorio: lo valida el contador del cliente)
// ─────────────────────────────────────────────────────────────────────────────

const IVA_COMPUTABLE = "V1"; // provisional a confirmar
const IVA_NO_COMPUTABLE = "V0"; // provisional a confirmar
const FUENTE_COMPUTA = "Ley de IVA art. 12 (crédito fiscal de compras vinculadas a la actividad gravada)";

const diccionario: TipoGasto[] = [
  {
    id: "combustible",
    etiqueta: "Combustible",
    sinonimos: ["nafta", "gasoil", "gnc", "diesel", "carga de combustible"],
    tratamientoBase: "computable",
    cuentaMayor: "52101001",
    indicadorIvaComputable: IVA_COMPUTABLE,
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: ["dominio", "tipoVehiculo"],
    estado: "provisorio",
    fuente: `${FUENTE_COMPUTA}; Ley de Ganancias art. 92 inc. l) (tope por automóvil)`,
  },
  {
    id: "repuestos",
    etiqueta: "Repuestos y reparaciones",
    sinonimos: ["repuesto", "reparación", "taller", "gomería", "mecánico", "lubricantes"],
    tratamientoBase: "computable",
    cuentaMayor: "52101002",
    indicadorIvaComputable: IVA_COMPUTABLE,
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: ["dominio"],
    estado: "provisorio",
    fuente: FUENTE_COMPUTA,
  },
  {
    id: "peajes",
    etiqueta: "Peajes",
    sinonimos: ["peaje", "autopista", "telepeaje"],
    tratamientoBase: "computable",
    cuentaMayor: "52101003",
    indicadorIvaComputable: IVA_COMPUTABLE,
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: ["origenDestino"],
    estado: "provisorio",
    fuente: `${FUENTE_COMPUTA}; tique de peaje con IVA indicado a responsable inscripto`,
  },
  {
    id: "insumos",
    etiqueta: "Insumos y ferretería",
    sinonimos: ["ferretería", "materiales", "herramientas", "insumos de trabajo"],
    tratamientoBase: "computable",
    cuentaMayor: "52101004",
    indicadorIvaComputable: IVA_COMPUTABLE,
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: [],
    estado: "provisorio",
    fuente: FUENTE_COMPUTA,
  },
  {
    id: "comidas_viaje",
    etiqueta: "Comidas en viaje",
    sinonimos: ["comida", "almuerzo", "cena", "desayuno", "vianda"],
    tratamientoBase: "no_computable",
    cuentaMayor: "52102001",
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: [],
    cubiertoPorConvenioCamioneros: true,
    estado: "provisorio",
    fuente: "Ley de IVA art. 12, inc. a, pto. 3 (restaurante); D. 692/98 art. 52; CCT 40/89 ítem 4.2.11",
  },
  {
    id: "hotel",
    etiqueta: "Hotel y alojamiento",
    sinonimos: ["alojamiento", "hospedaje", "pernocte", "hostería"],
    tratamientoBase: "no_computable",
    cuentaMayor: "52102002",
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: [],
    cubiertoPorConvenioCamioneros: true,
    estado: "provisorio",
    fuente: "Ley de IVA art. 12, inc. a, pto. 3 (hotel); D. 692/98 art. 52; CCT 40/89 ítem 4.2.11 (pernocte)",
  },
  {
    id: "representacion",
    etiqueta: "Representación con clientes",
    sinonimos: ["atención a clientes", "gastos de representación", "invitación a clientes"],
    tratamientoBase: "no_computable",
    cuentaMayor: "52103001",
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: ["asistentes"],
    esRepresentacion: true,
    estado: "provisorio",
    fuente: "Ley de IVA art. 12, inc. a, pto. 3 (restaurante); D. 692/98 art. 52",
  },
  {
    id: "estacionamiento",
    etiqueta: "Estacionamiento y cochera",
    sinonimos: ["cochera", "playa de estacionamiento", "parking"],
    tratamientoBase: "no_computable",
    cuentaMayor: "52102003",
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: [],
    estado: "provisorio",
    fuente: "Ley de IVA art. 12, inc. a, pto. 3 (cochera); D. 692/98 art. 52",
  },
  {
    id: "taxi",
    etiqueta: "Taxi y remís",
    sinonimos: ["remis", "remís", "uber", "cabify"],
    tratamientoBase: "no_computable",
    cuentaMayor: "52102004",
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: ["origenDestino"],
    estado: "provisorio",
    fuente: "Ley de IVA art. 7, inc. h, pto. 12 (taxi hasta 100 km, exento)",
  },
  {
    id: "propinas",
    etiqueta: "Propinas",
    sinonimos: ["propina", "gratificación"],
    tratamientoBase: "no_registrable",
    cuentaMayor: "52102005",
    indicadorIvaNoComputable: IVA_NO_COMPUTABLE,
    exige: [],
    admiteSinComprobante: true,
    estado: "provisorio",
    fuente: "LCT arts. 105-106; Ley 24.241 art. 6 (sin comprobante: se informa a Haberes)",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Comprobantes
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que trae el QR de ARCA es exacto (el QR no trae neto ni IVA). */
const DEL_QR: Comprobante["origenCampos"] = {
  clase: "qr",
  fecha: "qr",
  cuitEmisor: "qr",
  puntoVenta: "qr",
  numero: "qr",
  total: "qr",
  moneda: "qr",
  cuitReceptor: "qr",
  cae: "qr",
};

function datos(d: Partial<DatosComprobante> & Pick<DatosComprobante, "clase" | "fecha" | "total">): DatosComprobante {
  return {
    leyendaA: "ninguna",
    lineasIva: [],
    percepciones: [],
    noGravado: 0,
    exento: 0,
    impuestosInternos: 0,
    moneda: "ARS",
    esControladorFiscal: false,
    ...d,
  };
}

const EF_GOMEZ: MedioPago = { tipo: "efectivo_anticipo", anticipoId: "ANT-1042-2609" };
const EF_SOSA: MedioPago = { tipo: "efectivo_anticipo", anticipoId: "ANT-1150-2609" };
const RC_BENITEZ: MedioPago = { tipo: "recargable", tarjetaId: "TJ-REC-4821" };
const PROPIO: MedioPago = { tipo: "propio_a_reintegrar" };

/** Datos del repuesto: el comprobante 04 y su copia 07 son el mismo papel. */
const REPUESTO_NORTE = datos({
  clase: "factura_a",
  fecha: "2026-09-04",
  cuitEmisor: "30684551201",
  razonSocialEmisor: "Repuestos Norte S.R.L.",
  puntoVenta: 5,
  numero: 2231,
  cae: "76381245902345",
  cuitReceptor: EMPRESA_CUIT,
  lineasIva: [{ alicuota: 21, neto: 12000000, iva: 2520000 }],
  total: 14520000,
});

const comprobantes: Comprobante[] = [
  // ── R-1042-2609 · Rubén Gómez ──────────────────────────────────────────────
  {
    id: "C-1042-01",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-10",
      cuitEmisor: "30709123455",
      razonSocialEmisor: "Estación de Servicio Ruta 5 S.R.L.",
      puntoVenta: 12,
      numero: 45871,
      cae: "76381245901234",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 16000000, iva: 3360000 }],
      impuestosInternos: 1840000,
      total: 21200000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", impuestosInternos: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.98, lineasIva: 0.95, impuestosInternos: 0.91, leyendaA: 0.97 },
    imputacion: {
      tipoGastoId: "combustible",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "NQ",
      jurisdiccionComprobante: "NQ",
      dominio: "AB123CD",
      tipoVehiculo: "camion",
      viajeId: "VJ-1042-2609",
      medioPago: EF_GOMEZ,
    },
    hashImagen: "demo-foto-c1042-01",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-02",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    // Neto e IVA tal como los imprime el tique ($ 8.264 + $ 1.736 = $ 10.000): el IVA sale del total
    // redondo, no del neto por la alícuota. La aritmética controla el total, y cierra.
    datos: datos({
      clase: "tique_peaje",
      fecha: "2026-09-08",
      cuitEmisor: "30500111220",
      razonSocialEmisor: "Autopistas del Oeste S.A.",
      puntoVenta: 31,
      numero: 1184502,
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 826400, iva: 173600 }],
      total: 1000000,
      esControladorFiscal: true,
    }),
    origenCampos: {
      clase: "ia",
      fecha: "ia",
      cuitEmisor: "ia",
      razonSocialEmisor: "ia",
      puntoVenta: "ia",
      numero: "ia",
      cuitReceptor: "ia",
      lineasIva: "ia",
      total: "ia",
    },
    confianzaIa: {
      clase: 0.97,
      fecha: 0.99,
      cuitEmisor: 0.96,
      razonSocialEmisor: 0.98,
      puntoVenta: 0.93,
      numero: 0.9,
      cuitReceptor: 0.92,
      lineasIva: 0.94,
      total: 0.99,
    },
    imputacion: {
      tipoGastoId: "peajes",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      origen: "BA",
      destino: "NQ",
      viajeId: "VJ-1042-2609",
      medioPago: EF_GOMEZ,
    },
    hashImagen: "demo-foto-c1042-02",
    constatacion: "sin_constatacion_posible",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-03",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    // IVA contenido que informa la B (RG 5614/2024): 21/121 de $ 18.000 = $ 3.123,97 ≈ $ 3.124.
    datos: datos({
      clase: "factura_b",
      fecha: "2026-09-09",
      cuitEmisor: "30712340017",
      razonSocialEmisor: "Parador El Cruce",
      puntoVenta: 3,
      numero: 10233,
      cae: "76381245904567",
      ivaContenido: 312400,
      total: 1800000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", ivaContenido: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.95, ivaContenido: 0.93, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "comidas_viaje",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "LP",
      jurisdiccionComprobante: "LP",
      viajeId: "VJ-1042-2609",
      medioPago: PROPIO,
      comentario: "Almuerzo en ruta camino a Neuquén",
    },
    hashImagen: "demo-foto-c1042-03",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-04",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    datos: REPUESTO_NORTE,
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.99, lineasIva: 0.96, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "repuestos",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      dominio: "AB123CD",
      medioPago: EF_GOMEZ,
      comentario: "Filtros y correa para el camión",
    },
    hashImagen: "demo-foto-c1042-04",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-05",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    datos: datos({
      clase: "factura_a",
      leyendaA: "operacion_sujeta_a_retencion",
      fecha: "2026-09-05",
      cuitEmisor: "30710223331",
      razonSocialEmisor: "Taller Mecánico Sur S.A.",
      puntoVenta: 2,
      numero: 815,
      cae: "76381245903456",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 45000000, iva: 9450000 }],
      total: 54450000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.99, lineasIva: 0.97, leyendaA: 0.96 },
    imputacion: {
      tipoGastoId: "repuestos",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      dominio: "AB123CD",
      medioPago: PROPIO,
      comentario: "Reparación de la caja de cambios",
    },
    hashImagen: "demo-foto-c1042-05",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-06",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    datos: datos({ clase: "sin_comprobante", fecha: "2026-09-10", total: 300000 }),
    origenCampos: { clase: "persona", fecha: "persona", total: "persona" },
    imputacion: {
      tipoGastoId: "propinas",
      centroCosto: "LOG-01",
      viajeId: "VJ-1042-2609",
      medioPago: EF_GOMEZ,
      comentario: "Propina al peón que ayudó a descargar en Neuquén",
    },
    constatacion: "sin_constatacion_posible",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-07",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    // El mismo papel que el 04, fotografiado de nuevo (otra huella) y cargado como pagado de su
    // bolsillo: justo lo que el control de duplicados tiene que parar.
    datos: REPUESTO_NORTE,
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.99, lineasIva: 0.96, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "repuestos",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      dominio: "AB123CD",
      medioPago: PROPIO,
    },
    hashImagen: "demo-foto-c1042-07",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-08",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-15",
      cuitEmisor: "30698882227",
      razonSocialEmisor: "Ferretería Industrial Lanús S.A.",
      puntoVenta: 4,
      numero: 9921,
      cae: "76381245905678",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 1200000, iva: 252000 }],
      total: 1452000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.97, lineasIva: 0.95, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "insumos",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      medioPago: EF_GOMEZ,
      comentario: "Eslingas y precintos para asegurar la carga",
    },
    hashImagen: "demo-foto-c1042-08",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1042-09",
    rendicionId: "R-1042-2609",
    legajo: "1042",
    // Service de ruta monotributista con controlador fiscal: tique a consumidor final, sin IVA
    // contenido. Es una reparación del camión (por eso "Repuestos y reparaciones", con la patente).
    datos: datos({
      clase: "tique_consumidor_final",
      fecha: "2026-09-11",
      cuitEmisor: "27315558889",
      razonSocialEmisor: "Service de Camiones El Descanso",
      puntoVenta: 2,
      numero: 30418,
      total: 6258000,
      esControladorFiscal: true,
    }),
    origenCampos: {
      clase: "ia",
      fecha: "ia",
      cuitEmisor: "ia",
      razonSocialEmisor: "ia",
      puntoVenta: "ia",
      numero: "ia",
      total: "ia",
    },
    confianzaIa: {
      clase: 0.95,
      fecha: 0.97,
      cuitEmisor: 0.9,
      razonSocialEmisor: 0.94,
      puntoVenta: 0.88,
      numero: 0.86,
      total: 0.98,
    },
    imputacion: {
      tipoGastoId: "repuestos",
      centroCosto: "LOG-01",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      dominio: "AB123CD",
      medioPago: EF_GOMEZ,
      comentario: "Aceite 4 l y refrigerante para el camión, a la vuelta del viaje",
    },
    hashImagen: "demo-foto-c1042-09",
    constatacion: "sin_constatacion_posible",
    cuitApocrifa: false,
  },

  // ── R-1107-2609 · Laura Benítez ────────────────────────────────────────────
  {
    id: "C-1107-01",
    rendicionId: "R-1107-2609",
    legajo: "1107",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-17",
      cuitEmisor: "30705558880",
      razonSocialEmisor: "Hotel Llanura S.A.",
      puntoVenta: 1,
      numero: 3310,
      cae: "76381245906789",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 10000000, iva: 2100000 }],
      total: 12100000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.99, lineasIva: 0.97, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "hotel",
      centroCosto: "COM-02",
      jurisdiccionActividad: "LP",
      jurisdiccionComprobante: "LP",
      viajeId: "VJ-1107-2609",
      medioPago: RC_BENITEZ,
      comentario: "Dos noches en Santa Rosa",
    },
    hashImagen: "demo-foto-c1107-01",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1107-02",
    rendicionId: "R-1107-2609",
    legajo: "1107",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-16",
      cuitEmisor: "33707771114",
      razonSocialEmisor: "Restaurante La Posta",
      puntoVenta: 2,
      numero: 1877,
      cae: "76381245907890",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 4500000, iva: 945000 }],
      total: 5445000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.96, lineasIva: 0.94, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "representacion",
      centroCosto: "COM-02",
      jurisdiccionActividad: "LP",
      jurisdiccionComprobante: "LP",
      viajeId: "VJ-1107-2609",
      asistentes: "Agroservicios del Sur S.A.: Julián Ortiz (compras) y Marta Gil (técnica); por la empresa, Laura Benítez",
      medioPago: RC_BENITEZ,
    },
    hashImagen: "demo-foto-c1107-02",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1107-03",
    rendicionId: "R-1107-2609",
    legajo: "1107",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-15",
      cuitEmisor: "30709123455",
      razonSocialEmisor: "Estación de Servicio Ruta 5 S.R.L.",
      puntoVenta: 12,
      numero: 46102,
      cae: "76381245908901",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 8600000, iva: 1806000 }],
      impuestosInternos: 1149000,
      total: 11555000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", impuestosInternos: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.98, lineasIva: 0.95, impuestosInternos: 0.9, leyendaA: 0.97 },
    imputacion: {
      tipoGastoId: "combustible",
      centroCosto: "COM-02",
      jurisdiccionActividad: "LP",
      jurisdiccionComprobante: "LP",
      dominio: "AE456FG",
      tipoVehiculo: "automovil",
      viajeId: "VJ-1107-2609",
      medioPago: RC_BENITEZ,
    },
    hashImagen: "demo-foto-c1107-03",
    constatacion: "aprobada",
    cuitApocrifa: false,
  },
  {
    id: "C-1107-04",
    rendicionId: "R-1107-2609",
    legajo: "1107",
    // Tique factura B (código 82): IVA contenido de $ 9.000 = 21/121 = $ 1.561,98.
    datos: datos({
      clase: "tique_consumidor_final",
      fecha: "2026-09-16",
      cuitEmisor: "30712022244",
      razonSocialEmisor: "Playa de Estacionamiento Centro S.R.L.",
      puntoVenta: 1,
      numero: 7719,
      ivaContenido: 156198,
      total: 900000,
      esControladorFiscal: true,
    }),
    origenCampos: {
      clase: "ia",
      fecha: "ia",
      cuitEmisor: "ia",
      razonSocialEmisor: "ia",
      puntoVenta: "ia",
      numero: "ia",
      ivaContenido: "ia",
      total: "ia",
    },
    confianzaIa: {
      clase: 0.93,
      fecha: 0.98,
      cuitEmisor: 0.92,
      razonSocialEmisor: 0.95,
      puntoVenta: 0.9,
      numero: 0.89,
      ivaContenido: 0.91,
      total: 0.99,
    },
    imputacion: {
      tipoGastoId: "estacionamiento",
      centroCosto: "COM-02",
      jurisdiccionActividad: "LP",
      jurisdiccionComprobante: "LP",
      medioPago: RC_BENITEZ,
    },
    hashImagen: "demo-foto-c1107-04",
    constatacion: "sin_constatacion_posible",
    cuitApocrifa: false,
  },

  // ── R-1150-2609 · Martín Sosa ──────────────────────────────────────────────
  {
    id: "C-1150-01",
    rendicionId: "R-1150-2609",
    legajo: "1150",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-08",
      cuitEmisor: "30684551201",
      razonSocialEmisor: "Repuestos Norte S.R.L.",
      puntoVenta: 5,
      numero: 2298,
      cae: "76381245909012",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 6000000, iva: 1260000 }],
      percepciones: [{ regimen: "iibb", jurisdiccion: "BA", importe: 120000 }],
      total: 7380000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", percepciones: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.99, lineasIva: 0.96, percepciones: 0.92, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "insumos",
      centroCosto: "OPS-03",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      medioPago: EF_SOSA,
      comentario: "Cable, borneras y tornillería para la instalación de Quilmes",
    },
    hashImagen: "demo-foto-c1150-01",
    constatacion: "aprobada",
    cuitApocrifa: false,
    originalRecibido: true,
  },
  {
    id: "C-1150-02",
    rendicionId: "R-1150-2609",
    legajo: "1150",
    datos: datos({
      clase: "factura_c",
      fecha: "2026-09-09",
      cuitEmisor: "20284445555",
      razonSocialEmisor: "Jorge Medina (Kiosco Las Tres Marías)",
      puntoVenta: 1,
      numero: 321,
      cae: "76381245900123",
      cuitReceptor: EMPRESA_CUIT,
      total: 780000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia" },
    confianzaIa: { razonSocialEmisor: 0.9 },
    imputacion: {
      tipoGastoId: "insumos",
      centroCosto: "OPS-03",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      medioPago: EF_SOSA,
      comentario: "Precintos y cinta aisladora",
    },
    hashImagen: "demo-foto-c1150-02",
    constatacion: "aprobada",
    cuitApocrifa: false,
    originalRecibido: true,
  },
  {
    id: "C-1150-03",
    rendicionId: "R-1150-2609",
    legajo: "1150",
    datos: datos({
      clase: "factura_a",
      fecha: "2026-09-10",
      cuitEmisor: "30719990017",
      razonSocialEmisor: "Distribuidora Tapiales S.R.L.",
      puntoVenta: 3,
      numero: 1045,
      cae: "76381245901357",
      cuitReceptor: EMPRESA_CUIT,
      lineasIva: [{ alicuota: 21, neto: 4000000, iva: 840000 }],
      total: 4840000,
    }),
    origenCampos: { ...DEL_QR, razonSocialEmisor: "ia", lineasIva: "ia", leyendaA: "ia" },
    confianzaIa: { razonSocialEmisor: 0.97, lineasIva: 0.95, leyendaA: 0.98 },
    imputacion: {
      tipoGastoId: "insumos",
      centroCosto: "OPS-03",
      jurisdiccionActividad: "BA",
      jurisdiccionComprobante: "BA",
      medioPago: EF_SOSA,
      comentario: "Caños y cajas de paso",
    },
    hashImagen: "demo-foto-c1150-03",
    // El comprobante existe en ARCA (la constatación aprueba); lo que está marcado es la CUIT.
    constatacion: "aprobada",
    cuitApocrifa: true,
    originalRecibido: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// QR y precarga, derivados de los mismos datos (así no pueden desincronizarse)
// ─────────────────────────────────────────────────────────────────────────────

function lecturaQr(c: Comprobante): LecturaQr | undefined {
  const d = c.datos;
  const tipo = tipoArcaDesdeClase(d.clase);
  if (!d.cae || !d.cuitEmisor || d.puntoVenta === undefined || d.numero === undefined || tipo === undefined) {
    return undefined;
  }
  return {
    version: 1,
    fecha: d.fecha,
    cuitEmisor: d.cuitEmisor,
    puntoVenta: d.puntoVenta,
    tipoComprobanteArca: tipo,
    numero: d.numero,
    importeTotal: d.total,
    moneda: d.moneda === "USD" ? "DOL" : "PES",
    cotizacion: d.cotizacion ?? 1,
    tipoDocReceptor: d.cuitReceptor ? 80 : 99,
    nroDocReceptor: d.cuitReceptor ?? "0",
    tipoCodAut: "E",
    codAut: d.cae,
  };
}

const qrPorComprobante: Record<string, string> = {};
for (const c of comprobantes) {
  const lectura = lecturaQr(c);
  if (lectura) qrPorComprobante[c.id] = urlQrArca(lectura);
}

function lineaPrecarga(id: string, ajuste = 0): LineaPrecarga {
  const c = comprobantes.find((x) => x.id === id);
  const lectura = c ? lecturaQr(c) : undefined;
  return {
    cuitEmisor: lectura?.cuitEmisor ?? "",
    razonSocialEmisor: c?.datos.razonSocialEmisor ?? "",
    tipoComprobanteArca: lectura?.tipoComprobanteArca ?? 0,
    puntoVenta: lectura?.puntoVenta ?? 0,
    numero: lectura?.numero ?? 0,
    fecha: lectura?.fecha ?? "",
    total: (lectura?.importeTotal ?? 0) + ajuste,
  };
}

const precargaIvaSimple: LineaPrecarga[] = [
  lineaPrecarga("C-1042-04"),
  lineaPrecarga("C-1042-05"),
  lineaPrecarga("C-1150-01"),
  lineaPrecarga("C-1150-02"),
  lineaPrecarga("C-1042-01"),
  lineaPrecarga("C-1150-03"),
  {
    cuitEmisor: "30708889993",
    razonSocialEmisor: "Lubricentro Oeste S.A.",
    tipoComprobanteArca: 1,
    puntoVenta: 3,
    numero: 5567,
    fecha: "2026-09-12",
    total: 8630000,
  },
  lineaPrecarga("C-1042-08"),
  lineaPrecarga("C-1107-03"),
  lineaPrecarga("C-1107-02"),
  lineaPrecarga("C-1107-01", 150000), // ARCA tiene $ 1.500 más que lo rendido
];

// ─────────────────────────────────────────────────────────────────────────────
// El escenario
// ─────────────────────────────────────────────────────────────────────────────

export const escenarioDemo: EscenarioDemo = {
  empresa: { cuit: EMPRESA_CUIT, razonSocial: "Distribuidora Pampa Industrial S.A." },
  hoy: "2026-09-24",
  periodo: PERIODO,
  politica: {
    topeSinComprobante: 500000,
    topeEfectivoLey25345: 100000,
    plazoRendicionDias: 30,
    topeDerivacionCxP: 40000000,
    jurisdiccionesInscriptas: ["BA", "CABA", "LP"],
    toleranciaCentavos: 2,
  },
  diccionario,
  personas: [
    {
      legajo: "1042",
      nombre: "Rubén Gómez",
      puesto: "Chofer",
      roles: ["rinde"],
      jefeLegajo: "2001",
      centroCosto: "LOG-01",
      convenioCamioneros: true,
      vehiculos: [{ dominio: "AB123CD", tipo: "camion", titularidad: "propio" }],
    },
    {
      legajo: "1107",
      nombre: "Laura Benítez",
      puesto: "Vendedora de gira",
      roles: ["rinde"],
      jefeLegajo: "2002",
      centroCosto: "COM-02",
      convenioCamioneros: false,
      vehiculos: [{ dominio: "AE456FG", tipo: "automovil", titularidad: "propio" }],
    },
    {
      legajo: "1150",
      nombre: "Martín Sosa",
      puesto: "Instalador",
      roles: ["rinde"],
      jefeLegajo: "2001",
      centroCosto: "OPS-03",
      convenioCamioneros: false,
      vehiculos: [{ dominio: "AF789HJ", tipo: "utilitario", titularidad: "propio" }],
    },
    {
      legajo: "2001",
      nombre: "Carla Ruiz",
      puesto: "Jefa de logística",
      roles: ["aprueba"],
      jefeLegajo: "3001",
      centroCosto: "LOG-01",
      convenioCamioneros: false,
      vehiculos: [],
    },
    {
      legajo: "2002",
      nombre: "Diego Paz",
      puesto: "Gerente comercial",
      roles: ["aprueba"],
      jefeLegajo: "3001",
      centroCosto: "COM-02",
      convenioCamioneros: false,
      vehiculos: [],
    },
    {
      legajo: "3001",
      nombre: "Ana Ferreyra",
      puesto: "Dirección",
      roles: ["aprueba"],
      centroCosto: "DIR-01",
      convenioCamioneros: false,
      vehiculos: [],
    },
    {
      legajo: "4001",
      nombre: "Paula Díaz",
      puesto: "Tesorería",
      roles: ["tesoreria"],
      jefeLegajo: "3001",
      centroCosto: "ADM-01",
      convenioCamioneros: false,
      vehiculos: [],
    },
    {
      legajo: "5001",
      nombre: "Silvia Luna",
      puesto: "Contadora",
      roles: ["contador"],
      jefeLegajo: "3001",
      centroCosto: "ADM-01",
      convenioCamioneros: false,
      vehiculos: [],
    },
  ],
  tarjetas: [
    { id: "TJ-REC-4821", tipo: "recargable", titularLegajo: "1107", ultimos4: "4821", moneda: "ARS" },
    { id: "TJ-CORP-7310", tipo: "corporativa", titularLegajo: "2002", ultimos4: "7310", moneda: "ARS" },
  ],
  anticipos: [
    {
      id: "ANT-1042-2609",
      legajo: "1042",
      motivo: "Viaje de entrega a Neuquén",
      importe: 50000000,
      medio: "efectivo",
      origen: "Caja Tesorería",
      fechaEntrega: "2026-09-01",
      vence: "2026-10-01",
      centroCosto: "LOG-01",
    },
    {
      id: "ANT-1107-2609",
      legajo: "1107",
      motivo: "Gira comercial por La Pampa",
      importe: 30000000,
      medio: "recargable",
      origen: "Tarjeta recargable …4821",
      fechaEntrega: "2026-09-02",
      vence: "2026-10-02",
      centroCosto: "COM-02",
    },
    {
      id: "ANT-1150-2609",
      legajo: "1150",
      motivo: "Materiales para las instalaciones de septiembre",
      importe: 15000000,
      medio: "efectivo",
      origen: "Caja Tesorería",
      fechaEntrega: "2026-09-05",
      vence: "2026-10-05",
      centroCosto: "OPS-03",
    },
  ],
  viajes: [
    {
      id: "VJ-1042-2609",
      legajo: "1042",
      desde: "2026-09-08",
      hasta: "2026-09-11",
      origen: "BA",
      destino: "NQ",
      km: 1150,
      pernoctes: 3,
      cubiertoPorConvenio: true,
    },
    {
      id: "VJ-1107-2609",
      legajo: "1107",
      desde: "2026-09-15",
      hasta: "2026-09-17",
      origen: "BA",
      destino: "LP",
      km: 620,
      pernoctes: 2,
      cubiertoPorConvenio: false,
    },
  ],
  rendiciones: [
    {
      id: "R-1042-2609",
      legajo: "1042",
      periodo: PERIODO,
      anticipoIds: ["ANT-1042-2609"],
      comprobanteIds: [
        "C-1042-01",
        "C-1042-02",
        "C-1042-03",
        "C-1042-04",
        "C-1042-05",
        "C-1042-06",
        "C-1042-07",
        "C-1042-08",
        "C-1042-09",
      ],
      devolucionDeclarada: 4000000,
      estado: "borrador",
      nivelActual: 0,
      historial: [],
    },
    {
      id: "R-1107-2609",
      legajo: "1107",
      periodo: PERIODO,
      anticipoIds: ["ANT-1107-2609"],
      comprobanteIds: ["C-1107-01", "C-1107-02", "C-1107-03", "C-1107-04"],
      devolucionDeclarada: 0,
      estado: "en_aprobacion",
      nivelActual: 0,
      historial: [{ fecha: "2026-09-21", actorLegajo: "1107", accion: "enviar" }],
    },
    {
      id: "R-1150-2609",
      legajo: "1150",
      periodo: PERIODO,
      anticipoIds: ["ANT-1150-2609"],
      comprobanteIds: ["C-1150-01", "C-1150-02", "C-1150-03"],
      devolucionDeclarada: 2000000,
      estado: "en_control",
      nivelActual: 0,
      historial: [
        { fecha: "2026-09-14", actorLegajo: "1150", accion: "enviar" },
        { fecha: "2026-09-15", actorLegajo: "2001", accion: "aprobar", nivel: 0 },
        {
          fecha: "2026-09-22",
          actorLegajo: "4001",
          accion: "tomar_control",
          comentario:
            "ARCA marca como apócrifa la CUIT 30-71999001-7 (Distribuidora Tapiales): esa línea queda devuelta y no se contabiliza. El resto está en orden.",
          comprobanteIds: ["C-1150-03"],
        },
      ],
    },
  ],
  comprobantes,
  reglasAprobacion: [
    { id: "RA-HASTA-800K", desde: 0, hasta: 80000000, niveles: ["jefe"] },
    { id: "RA-DESDE-800K", desde: 80000000, niveles: ["jefe", ["3001"]] },
  ],
  suplencias: [{ titularLegajo: "2002", suplenteLegajo: "2001", desde: "2026-09-20", hasta: "2026-09-30" }],
  parametrosSap: {
    sociedad: "DEMO",
    claseDocFactura: "KR",
    claseDocAsiento: "SA",
    lugarComercial: "0001",
    cuentaPuenteAnticipos: "11409001",
    cuentaTarjetaAPagar: "21101007",
    cuentaReintegrosAPagar: "21109001",
    cuentaPercepcionIva: "11406001",
    cuentaPercepcionIibb: "11406002",
    maestroProveedores: {
      "30709123455": "10000101", // Estación de Servicio Ruta 5
      "30684551201": "10000102", // Repuestos Norte
      "30710223331": "10000103", // Taller Mecánico Sur
      "30500111220": "10000104", // Autopistas del Oeste
    },
  },
  precargaIvaSimple,
  qrPorComprobante,
  reglaVersion: "diccionario-demo@2026-09-24",
};
