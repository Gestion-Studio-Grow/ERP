/**
 * RENDÍ — contrato del dominio de rendición de gastos (Core, PURO).
 *
 * Este archivo es el CONTRATO: tipos y firmas que comparten el motor (src/lib/rendiciones)
 * y las pantallas (src/app/demo/rendiciones). No se cambia sin avisar a los dos lados.
 *
 * Reglas de la casa que aplican acá:
 * - PURO: sin Prisma, sin red, sin React, sin Date.now() escondido (la fecha "hoy" entra por parámetro).
 * - PLATA EN CENTAVOS ENTEROS (`Centavos`). Nunca float de pesos en el dominio. El único redondeo
 *   es `Math.round` sobre centavos, con la misma regla "medio hacia arriba" de `@/lib/round` (ADR-057).
 * - Zona de-sesgo ESTÁNDAR (ADR-046) en reglas y códigos; zona HUMANA (criollo) en `Validacion.mensaje`.
 * - El Core NO importa plugins (ADR-002). La salida contable (`LoteContable`) la consume el plugin SAP
 *   por tipado estructural, sin que este módulo lo importe.
 *
 * Diseño y fuentes normativas: Factory-GSG/rendiciones/01-plan-y-diseno.md (§6 circuitos, §7 reglas).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Básicos
// ─────────────────────────────────────────────────────────────────────────────

/** Plata en centavos enteros. $1.234,56 = 123456. */
export type Centavos = number;

/** Fecha ISO `AAAA-MM-DD`. El dominio no usa objetos Date. */
export type FechaISO = string;

/** Período `AAAA-MM`. */
export type Periodo = string;

/** Jurisdicción (provincia) — códigos cortos propios del producto. */
export type CodigoJurisdiccion =
  | "CABA" | "BA" | "CA" | "CB" | "CR" | "CH" | "CT" | "ER" | "FO" | "JU" | "LP" | "LR"
  | "MZ" | "MI" | "NQ" | "RN" | "SA" | "SJ" | "SL" | "SC" | "SF" | "SE" | "TF" | "TU";

export type Moneda = "ARS" | "USD";

// ─────────────────────────────────────────────────────────────────────────────
// Lectura del QR de ARCA (RG 4892/2020 — especificación oficial, versión 1)
// El QR trae 13 campos y NO trae neto ni IVA. Dominios aceptados: afip.gob.ar y arca.gob.ar.
// ─────────────────────────────────────────────────────────────────────────────

export interface LecturaQr {
  version: number;
  fecha: FechaISO;
  cuitEmisor: string;              // 11 dígitos, sin guiones
  puntoVenta: number;
  tipoComprobanteArca: number;     // código ARCA: 1 FA, 6 FB, 11 FC, 51 FM, 81 tique factura A, 82 tique factura B, 83 tique
  numero: number;
  importeTotal: Centavos;          // total en la moneda de emisión
  moneda: string;                  // código ARCA: "PES", "DOL", …
  cotizacion: number;
  tipoDocReceptor: number;         // 80 = CUIT, 96 = DNI, 99 = consumidor final sin identificar
  nroDocReceptor: string;          // "0" si no hay
  tipoCodAut: "E" | "A";           // E = CAE, A = CAEA
  codAut: string;
}

export type ResultadoLecturaQr =
  | { ok: true; lectura: LecturaQr }
  | { ok: false; error: string };  // error en criollo, para mostrar

// ─────────────────────────────────────────────────────────────────────────────
// Comprobante
// ─────────────────────────────────────────────────────────────────────────────

export type ClaseComprobante =
  | "factura_a"
  | "factura_b"
  | "factura_c"
  | "factura_m"
  | "tique_factura_a"          // controlador fiscal, discrimina IVA
  | "tique_peaje"              // tique de peaje con IVA indicado a responsable inscripto (computa por coeficiente)
  | "tique_consumidor_final"   // controlador fiscal sin identificar al comprador
  | "sin_comprobante";         // propina, estacionamiento en la calle, etc.

/** RG 1575 art. 21 / RG 5762/2025: la A con leyenda nunca se paga por rendición. */
export type LeyendaFacturaA = "ninguna" | "operacion_sujeta_a_retencion" | "pago_en_cbu_informada";

export type Alicuota = 0 | 2.5 | 5 | 10.5 | 21 | 27;

export interface LineaIva {
  alicuota: Alicuota;
  neto: Centavos;
  iva: Centavos;
}

export type RegimenPercepcion = "iva" | "iibb" | "municipal" | "otra";

export interface Percepcion {
  regimen: RegimenPercepcion;
  jurisdiccion?: CodigoJurisdiccion;  // obligatoria para IIBB
  importe: Centavos;
}

/** Lo que dice el papel. Viene del QR, de la IA o de la persona (ver `OrigenDato`). */
export interface DatosComprobante {
  clase: ClaseComprobante;
  leyendaA: LeyendaFacturaA;
  fecha: FechaISO;
  cuitEmisor?: string;
  razonSocialEmisor?: string;
  puntoVenta?: number;
  numero?: number;
  cae?: string;
  /** CUIT del comprador según el comprobante (del QR). undefined = consumidor final sin identificar. */
  cuitReceptor?: string;
  lineasIva: LineaIva[];          // vacío en B, C y tiques que no discriminan
  /** RG 5614/2024: "IVA contenido" que se informa en comprobantes a consumidor final. Es informativo. */
  ivaContenido?: Centavos;
  percepciones: Percepcion[];
  noGravado: Centavos;
  exento: Centavos;
  impuestosInternos: Centavos;    // incluye impuestos a los combustibles: son costo, no percepción
  total: Centavos;
  moneda: Moneda;
  cotizacion?: number;            // obligatoria si moneda = USD
  esControladorFiscal: boolean;
}

export type OrigenDato = "qr" | "ia" | "persona";

export type TipoVehiculo = "automovil" | "utilitario" | "camion";

export type MedioPago =
  | { tipo: "efectivo_anticipo"; anticipoId: string }
  | { tipo: "tarjeta_corporativa"; tarjetaId: string }
  | { tipo: "recargable"; tarjetaId: string }
  | { tipo: "propio_a_reintegrar" };

/** Lo que completa quien rinde. */
export interface Imputacion {
  tipoGastoId: string;
  centroCosto: string;
  /** Convenio Multilateral: la jurisdicción con la que el gasto tiene relación directa. */
  jurisdiccionActividad?: CodigoJurisdiccion;
  /** Jurisdicción del comprobante (domicilio del emisor / lugar del gasto). */
  jurisdiccionComprobante?: CodigoJurisdiccion;
  /** Traslados: origen y destino (el transporte se reparte por partes iguales entre jurisdicciones). */
  origen?: CodigoJurisdiccion;
  destino?: CodigoJurisdiccion;
  dominio?: string;               // patente, para combustible y reparaciones
  tipoVehiculo?: TipoVehiculo;
  viajeId?: string;
  asistentes?: string;            // representación: cliente y asistentes
  medioPago: MedioPago;
  comentario?: string;
}

export type EstadoConstatacion =
  | "aprobada"                    // WSCDC respondió aprobado
  | "rechazada"                   // WSCDC respondió rechazado
  | "sin_constatacion_posible"    // controlador fiscal o sin CAE/CAI: no hay servicio que lo constate
  | "pendiente";                  // todavía no se consultó

export interface Comprobante {
  id: string;
  rendicionId: string;
  legajo: string;                 // quien rinde
  datos: DatosComprobante;
  /** Qué dato salió de dónde (para mostrar y para auditar). */
  origenCampos: Partial<Record<keyof DatosComprobante, OrigenDato>>;
  /** Confianza de la IA por campo, 0 a 1. Sólo para campos con origen "ia". */
  confianzaIa?: Partial<Record<keyof DatosComprobante, number>>;
  imputacion: Imputacion;
  /** Huella de la imagen (detecta la misma foto subida dos veces). */
  hashImagen?: string;
  constatacion: EstadoConstatacion;
  /** Resultado de wsapoc: la CUIT emisora figura como apócrifa. */
  cuitApocrifa: boolean | "sin_consultar";
  /** Lo que la persona rindió; la etiqueta del sobre físico usa el id. */
  originalRecibido?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diccionario de tipos de gasto y políticas (DATOS que calibra el contador del cliente)
// ─────────────────────────────────────────────────────────────────────────────

export type Tratamiento = "computable" | "no_computable" | "no_registrable";

export type CampoExigido = "dominio" | "tipoVehiculo" | "viaje" | "asistentes" | "origenDestino";

export interface TipoGasto {
  id: string;
  etiqueta: string;               // lo que ve quien rinde ("Combustible")
  sinonimos: string[];            // para mapear planillas viejas
  /** Lo máximo que permite la ley para este gasto si el comprobante acompaña. El comprobante puede DEGRADAR, nunca mejorar. */
  tratamientoBase: Tratamiento;
  cuentaMayor: string;            // placeholder hasta que el cliente dé su plan
  indicadorIvaComputable?: string;
  indicadorIvaNoComputable: string;
  exige: CampoExigido[];
  /** CCT 40/89: comida y pernocte de un viaje que el convenio ya paga en el recibo. */
  cubiertoPorConvenioCamioneros?: boolean;
  esRepresentacion?: boolean;
  /** Admite rendirse sin comprobante (hasta el tope de política). */
  admiteSinComprobante?: boolean;
  estado: "validado_contador" | "provisorio";
  /** Norma que sostiene el tratamiento, para mostrarle al contador. */
  fuente: string;
}

export interface Politica {
  topeSinComprobante: Centavos;
  /** Ley 25.345: pagos en efectivo por encima de $ 1.000 exigen probar la veracidad (fallo "Mera"). */
  topeEfectivoLey25345: Centavos;
  plazoRendicionDias: number;
  /** Regla 8 v1: comprobante de un proveedor habitual del maestro por encima de este tope → cuentas a pagar. */
  topeDerivacionCxP: Centavos;
  jurisdiccionesInscriptas: CodigoJurisdiccion[];
  /** Tolerancia de redondeo para la aritmética del comprobante. */
  toleranciaCentavos: Centavos;
}

export interface Empresa {
  cuit: string;
  razonSocial: string;
}

export type RolRendi = "rinde" | "aprueba" | "tesoreria" | "contador";

export interface Vehiculo {
  dominio: string;
  tipo: TipoVehiculo;
  titularidad: "propio" | "leasing" | "alquilado" | "del_empleado";
}

export interface Persona {
  legajo: string;
  nombre: string;
  puesto: string;
  roles: RolRendi[];
  jefeLegajo?: string;
  centroCosto: string;
  convenioCamioneros: boolean;
  vehiculos: Vehiculo[];
}

export interface Tarjeta {
  id: string;
  tipo: "corporativa" | "recargable";
  titularLegajo: string;
  ultimos4: string;
  moneda: Moneda;
}

export interface Anticipo {
  id: string;
  legajo: string;
  motivo: string;
  importe: Centavos;
  medio: "efectivo" | "recargable" | "transferencia";
  /** Caja o cuenta desde donde salió (en el producto real: documento SAP que lo registra). */
  origen: string;
  fechaEntrega: FechaISO;
  vence: FechaISO;
  centroCosto: string;
}

export interface Viaje {
  id: string;
  legajo: string;
  desde: FechaISO;
  hasta: FechaISO;
  origen: CodigoJurisdiccion;
  destino: CodigoJurisdiccion;
  km: number;
  pernoctes: number;
  /** El recibo de sueldo ya paga comida y pernocte por convenio (CCT 40/89, ítem 4.2.11). */
  cubiertoPorConvenio: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación fiscal de un comprobante
// ─────────────────────────────────────────────────────────────────────────────

export type Carril = "factura" | "asiento" | "cuentas_a_pagar" | "ninguno";
export type Severidad = "bloquea" | "advierte" | "informa";

/** Códigos de validación. R* = reglas de la §7 del plan; V* = validaciones del diseño previo. */
export type CodigoValidacion =
  | "R1_TIPO_SIN_CLASIFICAR"          // bloquea: la herramienta no adivina el IVA
  | "R1_NO_COMPUTA_POR_LEY"           // informa: restaurante/hotel/cochera con factura A — "no es un error tuyo"
  | "R2_RECEPTOR_NO_ES_LA_EMPRESA"    // advierte: factura A a otra CUIT o sin identificar → no computa
  | "R2_IVA_CONTENIDO_A_CERO"         // informa: B a consumidor final con IVA contenido (RG 5614)
  | "R2_PEDI_LA_CUIT"                 // advierte: ticket sin la CUIT de la empresa (pedirla siempre)
  | "R3_FACTURA_CON_LEYENDA"          // bloquea y deriva a cuentas a pagar (A con leyenda o M)
  | "R4_CONSTATACION_RECHAZADA"       // bloquea
  | "R4_CUIT_APOCRIFA"                // bloquea
  | "R4_SIN_CONSTATACION_POSIBLE"     // informa: controlador fiscal
  | "R4_CONSTATACION_PENDIENTE"       // advierte: electrónico con CAE/CAEA sin respuesta de ARCA todavía (no se contabiliza)
  | "R5_EFECTIVO_SOBRE_TOPE"          // informa: se arma la prueba de veracidad (foto + aprobación + anticipo)
  | "R7_PERCEPCION_SIN_JURISDICCION"  // bloquea: IIBB sin jurisdicción
  | "R8_DERIVAR_A_CXP"                // advierte: proveedor habitual sobre el tope → cuentas a pagar
  | "R9_FALTA_JURISDICCION"           // bloquea
  | "R9_PROVINCIA_NO_INSCRIPTA"       // advierte: sustento territorial
  | "R10_FALTA_VEHICULO"              // bloquea: dominio y tipo de vehículo
  | "R10_TOPE_AUTOMOVIL"              // informa: el tope de Ganancias aplica a automóviles
  | "R11_CUBIERTO_POR_CONVENIO"       // bloquea: comida/pernocte ya pagados por el recibo (CCT 40/89)
  | "R11_SIN_COMPROBANTE_SOBRE_TOPE"  // bloquea
  | "R11_SIN_COMPROBANTE"             // informa: va a Haberes como reintegro sin comprobante
  | "V2_CUIT_INVALIDA"                // bloquea: dígito verificador
  | "V3_PROVEEDOR_FUERA_DEL_MAESTRO"  // advierte: computable pero el proveedor no está en SAP → propuesta de alta
  | "V4_B_O_C_CON_IVA_DISCRIMINADO"   // bloquea: B o C que discrimina IVA (no es IVA contenido)
  | "V6_DUPLICADO"                    // bloquea: misma clave fiscal ya rendida en la empresa
  | "V6_MISMA_FOTO"                   // bloquea: mismo hash de imagen
  | "V8_ARITMETICA"                   // bloquea: neto + IVA + percepciones + … ≠ total
  | "V9_NUMERO_OFICIAL"               // bloquea: falta punto de venta o número en un comprobante que los tiene
  | "V12_FUERA_DE_PERIODO"            // advierte
  | "V13_FALTA_ASISTENTES"            // bloquea: representación sin asistentes
  | "V14_MONEDA_SIN_COTIZACION";      // bloquea

export interface Validacion {
  codigo: CodigoValidacion;
  severidad: Severidad;
  /** Criollo, para quien rinde. Ej.: "Esta factura no recupera IVA por ley. No es un error tuyo." */
  mensaje: string;
  /** Norma o artículo, para el contador. */
  fuente?: string;
  campo?: keyof DatosComprobante | keyof Imputacion;
}

export interface Evaluacion {
  comprobanteId: string;
  tratamiento: Tratamiento;
  carril: Carril;
  cuentaMayor?: string;
  indicadorIva?: string;
  /**
   * Indicador no computable del tipo de gasto, aunque el comprobante compute. Lo usa el lote contable
   * para el no gravado, el exento, los impuestos internos y las percepciones que no computan de una
   * factura del carril 1 (el lote no recibe el diccionario). Agregado opcional del ingeniero de dominio.
   */
  indicadorIvaNoComputable?: string;
  /** IVA que se computa como crédito fiscal. */
  creditoFiscal: Centavos;
  /** Lo que va a gasto: total − crédito fiscal − percepciones computables. */
  costo: Centavos;
  /** Percepciones que se computan (IVA e IIBB) — van a sus cuentas, no al gasto. */
  percepcionesComputables: Centavos;
  validaciones: Validacion[];
  /** true si alguna validación bloquea. */
  bloqueado: boolean;
  /** Versión del diccionario y de las reglas aplicadas (auditoría: qué regla se usó). */
  reglaVersion: string;
}

export interface ContextoEvaluacion {
  empresa: Empresa;
  politica: Politica;
  diccionario: TipoGasto[];
  persona: Persona;
  viajes: Viaje[];
  /** Todos los comprobantes ya cargados en la empresa (para duplicados). Puede incluir al propio. */
  otrosComprobantes: Comprobante[];
  /** CUITs de proveedores que existen en el maestro de SAP (espejo). */
  maestroProveedores: ReadonlySet<string>;
  /** Período de la rendición (para V12). */
  periodo: Periodo;
  reglaVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendición, cuadratura y estados
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoRendicion =
  | "borrador"
  | "en_aprobacion"
  | "devuelta"
  | "rechazada"
  | "aprobada"
  | "en_control"
  | "contabilizada"
  | "cerrada";

export type AccionRendicion =
  | "enviar"         // borrador|devuelta → en_aprobacion (exige cuadratura y ningún bloqueo)
  | "aprobar"        // en_aprobacion → en_aprobacion (siguiente nivel) | aprobada (último nivel)
  | "devolver"       // en_aprobacion|en_control → devuelta (con líneas y comentario)
  | "rechazar"       // en_aprobacion → rechazada (con comentario)
  | "tomar_control"  // aprobada → en_control (Tesorería)
  | "contabilizar"   // en_control → contabilizada
  | "cerrar";        // contabilizada → cerrada (saldo del empleado en cero)

export interface EventoRendicion {
  fecha: FechaISO;
  actorLegajo: string;
  accion: AccionRendicion;
  comentario?: string;
  /** Comprobantes señalados (al devolver). */
  comprobanteIds?: string[];
  nivel?: number;
}

export interface Rendicion {
  id: string;
  legajo: string;
  periodo: Periodo;
  anticipoIds: string[];
  comprobanteIds: string[];
  /** Lo que la persona declara devolver en efectivo. */
  devolucionDeclarada: Centavos;
  estado: EstadoRendicion;
  /** Índice del nivel de aprobación en curso (0 = primero). */
  nivelActual: number;
  /** Sólo se agrega (bitácora). */
  historial: EventoRendicion[];
}

export interface Cuadratura {
  anticipado: Centavos;      // suma de anticipos vinculados
  rendido: Centavos;         // suma de totales de comprobantes pagados con el anticipo (efectivo/recargable)
  devuelto: Centavos;        // devolución declarada
  /** anticipado − rendido − devuelto. > 0: falta justificar; < 0: rindió de más. */
  diferencia: Centavos;
  /** Lo que la empresa le debe a la persona (gastó de más, o pagó con plata propia). */
  aReintegrar: Centavos;
  cuadra: boolean;           // diferencia dentro de la tolerancia (o negativa → a reintegrar)
  /** Ej.: "Recibiste $500.000, rendiste $447.300 y declaraste devolver $40.000. Faltan justificar $12.700." */
  mensaje: string;
}

export type ResultadoTransicion =
  | { ok: true; rendicion: Rendicion }
  | { ok: false; motivo: string };   // criollo

export interface ContextoTransicion {
  fecha: FechaISO;
  actorLegajo: string;
  cuadratura: Cuadratura;
  /** Evaluaciones de los comprobantes de la rendición. */
  evaluaciones: Evaluacion[];
  /** Niveles de aprobación resueltos para esta rendición (ver `nivelesDeAprobacion`). */
  niveles: string[][];
  comentario?: string;
  comprobanteIds?: string[];
  /** Roles de quien actúa. Si viene y no incluye "tesoreria", no puede pasar a control, contabilizar ni cerrar. */
  rolesActor?: RolRendi[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Aprobación por legajo
// ─────────────────────────────────────────────────────────────────────────────

export interface ReglaAprobacion {
  id: string;
  /** Rango de importe total de la rendición (desde inclusive, hasta exclusive). */
  desde: Centavos;
  hasta?: Centavos;
  centroCosto?: string;           // si falta, aplica a todos
  /** "jefe" = el jefe directo de quien rinde; o una lista de legajos (cualquiera de ellos aprueba). */
  niveles: Array<"jefe" | string[]>;
}

export interface Suplencia {
  titularLegajo: string;
  suplenteLegajo: string;
  desde: FechaISO;
  hasta: FechaISO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Salida contable (la consume el plugin SAP por tipado estructural)
// ─────────────────────────────────────────────────────────────────────────────

export interface ParametrosSap {
  sociedad: string;
  claseDocFactura: string;
  claseDocAsiento: string;
  lugarComercial: string;
  cuentaPuenteAnticipos: string;
  cuentaTarjetaAPagar: string;
  cuentaReintegrosAPagar: string;
  cuentaPercepcionIva: string;
  cuentaPercepcionIibb: string;
  /** CUIT → número de interlocutor (proveedor) en SAP. */
  maestroProveedores: Record<string, string>;
}

export interface PosicionFacturaSap {
  cuentaMayor: string;
  importe: Centavos;               // neto de la línea (o percepción)
  indicadorIva: string;
  centroCosto: string;
  numeroPersonal: string;
  asignacion: string;
  texto: string;
}

export interface FacturaProveedorSap {
  idFactura: string;               // clave que une cabecera y posiciones en la planilla
  comprobanteId: string;
  sociedad: string;
  claseDocumento: string;
  fechaDocumento: FechaISO;
  fechaContabilizacion: FechaISO;
  emisor: string;                  // número de interlocutor SAP
  /** Número oficial: punto de venta (4 o 5) + letra + número (8). Ej.: 0001A00000101. */
  referencia: string;
  lugarComercial: string;
  importeBruto: Centavos;
  moneda: Moneda;
  asignacion: string;              // LEGAJO-PERIODO-MEDIO
  posiciones: PosicionFacturaSap[];
}

export interface PosicionAsientoSap {
  cuentaMayor: string;
  debe: Centavos;
  haber: Centavos;
  indicadorIva?: string;
  centroCosto?: string;
  asignacion: string;
  texto: string;
}

export interface AsientoSap {
  idAsiento: string;
  rendicionId: string;
  sociedad: string;
  claseDocumento: string;
  fechaDocumento: FechaISO;
  fechaContabilizacion: FechaISO;
  moneda: Moneda;
  referencia: string;
  texto: string;
  posiciones: PosicionAsientoSap[];
}

/**
 * Cancelación de una factura del carril 1 contra la cuenta puente (o la de tarjeta).
 * La carga masiva de asientos trabaja sólo con cuentas de mayor, así que en modo Archivo esto NO es
 * una planilla: es la instrucción para Tesorería (compensación manual en SAP). En modo API va por
 * Journal Entry – Post con línea de acreedor + compensación.
 */
export interface CancelacionFacturaSap {
  idFactura: string;
  comprobanteId: string;
  emisor: string;
  referencia: string;
  importe: Centavos;
  cuentaContrapartida: string;     // cuenta puente de anticipos, tarjeta a pagar o reintegros a pagar
  asignacion: string;
}

export interface LoteContable {
  facturas: FacturaProveedorSap[];
  asientos: AsientoSap[];
  cancelaciones: CancelacionFacturaSap[];
  /** Comprobantes computables de proveedores que no están en el maestro: propuesta de alta. */
  altasPendientes: Array<{ cuit: string; razonSocial: string; comprobanteId: string }>;
  /** Comprobantes que van a cuentas a pagar (regla 3 u 8). */
  derivadosCxP: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Conciliación contra la precarga de IVA Simple (RG 5705/2025)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineaPrecarga {
  cuitEmisor: string;
  razonSocialEmisor: string;
  tipoComprobanteArca: number;
  puntoVenta: number;
  numero: number;
  fecha: FechaISO;
  total: Centavos;
}

export interface ResultadoConciliacion {
  coinciden: Array<{ comprobanteId: string; precarga: LineaPrecarga }>;
  /** Rendido y no está en la precarga: ticket no electrónico (normal) o comprobante dudoso. */
  rendidoNoEnPrecarga: Array<{ comprobanteId: string; motivo: "no_electronico" | "no_encontrado" | "no_es_de_la_empresa" }>;
  /** Está en la precarga a nombre de la empresa y nadie lo rindió. */
  precargaNoRendida: LineaPrecarga[];
  diferenciasImporte: Array<{ comprobanteId: string; precarga: LineaPrecarga; diferencia: Centavos }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archivo para Haberes (LCT arts. 105-106; CCT 40/89)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineaHaberes {
  legajo: string;
  nombre: string;
  periodo: Periodo;
  anticipado: Centavos;
  rendidoConComprobante: Centavos;
  /** Reintegros sin comprobante: son remuneración. */
  reintegrosSinComprobante: Centavos;
  saldoNoRendido: Centavos;
  /** Días desde la entrega del anticipo más viejo con saldo. */
  antiguedadDias: number;
  viajes: Array<{ id: string; desde: FechaISO; hasta: FechaISO; km: number; pernoctes: number; cubiertoPorConvenio: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escenario de la demo (datos ficticios)
// ─────────────────────────────────────────────────────────────────────────────

export interface EscenarioDemo {
  empresa: Empresa;
  hoy: FechaISO;
  periodo: Periodo;
  politica: Politica;
  diccionario: TipoGasto[];
  personas: Persona[];
  tarjetas: Tarjeta[];
  anticipos: Anticipo[];
  viajes: Viaje[];
  rendiciones: Rendicion[];
  comprobantes: Comprobante[];
  reglasAprobacion: ReglaAprobacion[];
  suplencias: Suplencia[];
  parametrosSap: ParametrosSap;
  precargaIvaSimple: LineaPrecarga[];
  /** URL de QR de ARCA por comprobante (para "leer el QR" en la demo). */
  qrPorComprobante: Record<string, string>;
  reglaVersion: string;
}
