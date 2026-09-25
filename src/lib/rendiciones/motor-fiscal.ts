/**
 * RENDÍ — motor fiscal: evalúa un comprobante contra el diccionario y la política (Core, PURO).
 *
 * Principio (plan §7): la herramienta NO adivina el tratamiento del IVA. Lo decide el tipo de gasto
 * (un dato que calibra el contador); el comprobante puede degradarlo, nunca mejorarlo.
 *
 * Orden (CONTRATO.md): 1 tipo de gasto · 2 leyenda o factura M · 3 tratamiento · 4 carril ·
 * 5 validaciones · 6 importes. Se juntan TODAS las validaciones; `bloqueado` = alguna bloquea.
 * Mensajes en criollo para quien rinde (zona humana, ADR-046); la norma va en `fuente`, para el contador.
 *
 * Decisiones donde el contrato no alcanza (ver README):
 * - "Clase A" = factura A, tique factura A y tique de peaje (las que pueden computar; misma letra que
 *   usa el lote). La factura M se trata como A para el aviso de receptor.
 * - V2 también bloquea si FALTA el CUIT en un comprobante que lo trae impreso (facturas y tiques A).
 * - V9 también exige número oficial al tique de peaje: va a SAP como factura y la referencia lo necesita.
 * - V8 corre siempre en las clases que discriminan IVA (una A sin líneas no suma el total), y en el resto
 *   sólo si hay líneas de IVA, como dice el contrato.
 * - V6: el primero que se cargó es el bueno. Si `otrosComprobantes` incluye al propio, sólo se miran
 *   los que están antes que él en la lista (orden de carga); si no lo incluye, se miran todos.
 * - R4_SIN_CONSTATACION_POSIBLE no se informa en `sin_comprobante`: no hay papel que constatar.
 * - Los topes se comparan en pesos (un comprobante en USD se convierte con su cotización), y en USD
 *   los tres importes de la evaluación salen en pesos, con costo = total − crédito − percepciones exacto.
 */

import { cuitValido, normalizarCuit } from "@/lib/cuit";
import { convertirAPesos, formatearPesosCorto, sumar } from "./dinero";
import { esFechaIso, estaEnPeriodo, formatearFecha, nombrePeriodo } from "./fechas";
import { nombreJurisdiccion } from "./textos";
import type {
  Carril,
  ClaseComprobante,
  CodigoJurisdiccion,
  Comprobante,
  ContextoEvaluacion,
  Evaluacion,
  Tratamiento,
  Validacion,
} from "./tipos";

/** Clases que pueden dar crédito fiscal (regla 2). Fuera de acá el tratamiento baja a no computable. */
export const CLASES_QUE_COMPUTAN: ReadonlySet<ClaseComprobante> = new Set([
  "factura_a",
  "tique_factura_a",
  "tique_peaje",
]);

/** Clases que discriminan IVA: su aritmética se controla siempre (V8). */
const CLASES_QUE_DISCRIMINAN: ReadonlySet<ClaseComprobante> = new Set([
  "factura_a",
  "factura_m",
  "tique_factura_a",
  "tique_peaje",
]);

/** Clases con número oficial y CUIT del emisor impresos (V9 y V2). */
const CLASES_CON_NUMERO_OFICIAL: ReadonlySet<ClaseComprobante> = new Set([
  "factura_a",
  "factura_b",
  "factura_c",
  "factura_m",
  "tique_factura_a",
  "tique_peaje",
]);

/** Electrónicos que ARCA puede constatar (WSCDC, con CAE o CAEA): facturas y tique factura A. */
const CLASES_CONSTATABLES: ReadonlySet<ClaseComprobante> = new Set([
  "factura_a",
  "factura_b",
  "factura_c",
  "factura_m",
  "tique_factura_a",
]);

/** Normas que se muestran al contador (plan §7). */
const FUENTE = {
  r1: "Ley de IVA art. 12, ptos. 1 y 3; D. 692/98 art. 52 (el tratamiento lo decide el tipo de gasto)",
  r2Receptor: "Ley de IVA arts. 37 y 41",
  r2Contenido: "RG 5614/2024 (IVA contenido a consumidor final); Ley de IVA arts. 37, 39 y 41",
  r2PediCuit: "RG 5866/2026 art. 1 inc. f) (el emisor identifica con CUIT al comprador que lo pide)",
  r3: "RG 1575 art. 21; RG 5762/2025 art. 5",
  r4Constatacion: "Constatación de comprobantes de ARCA (WSCDC); Ley de Ganancias art. 40",
  r4Apocrifa: "Consulta de CUIT apócrifas de ARCA (wsapoc); Ley de Ganancias art. 40",
  r4SinConstatacion: "La constatación de ARCA no cubre los controladores fiscales",
  r4Pendiente: "Constatación (WSCDC) y consulta de CUIT apócrifas (wsapoc) de ARCA; Ley de Ganancias art. 40",
  r5: "Ley 25.345; CSJN “Mera” (2014); Ley 11.683 art. 34",
  r7: "Diseño de registro de ARCA (percepciones separadas por régimen); SIRCIP para IIBB",
  r8: "RG 830; Ley 11.683 art. 8 inc. c)",
  r9: "Convenio Multilateral arts. 1, 3 y 4",
  r10: "Ley de Ganancias art. 92 inc. l)",
  r11Convenio: "CCT 40/89 ítem 4.2.11",
  r11SinComprobante: "LCT arts. 105-106; Ley 24.241 art. 6",
  v13: "Ganancias: gastos de representación, con tope del 1,5% de las remuneraciones",
} as const;

function lugar(j: CodigoJurisdiccion): string {
  return j === "CABA" ? "la Ciudad de Buenos Aires" : nombreJurisdiccion(j);
}

/** Los comprobantes contra los que se busca un duplicado: los cargados antes que `c`. */
function cargadosAntes(c: Comprobante, otros: Comprobante[]): Comprobante[] {
  const i = otros.findIndex((o) => o.id === c.id);
  return (i >= 0 ? otros.slice(0, i) : otros).filter((o) => o.id !== c.id);
}

/** Evalúa un comprobante. Puro: no muta nada y no lee el reloj. */
export function evaluarComprobante(c: Comprobante, ctx: ContextoEvaluacion): Evaluacion {
  const d = c.datos;
  const im = c.imputacion;
  const pol = ctx.politica;
  const validaciones: Validacion[] = [];
  const agregar = (v: Validacion) => {
    validaciones.push(v);
  };

  const tipo = ctx.diccionario.find((t) => t.id === im.tipoGastoId);
  const sinComprobante = d.clase === "sin_comprobante";
  const cuitEmisor = d.cuitEmisor && d.cuitEmisor.trim() !== "" ? normalizarCuit(d.cuitEmisor) : undefined;
  const totalEnPesos = convertirAPesos(d.total, d.moneda, d.cotizacion);

  let tratamiento: Tratamiento = tipo ? tipo.tratamientoBase : "no_computable";
  let carril: Carril | undefined;

  // ── 1. Tipo de gasto ───────────────────────────────────────────────────────
  if (!tipo) {
    agregar({
      codigo: "R1_TIPO_SIN_CLASIFICAR",
      severidad: "bloquea",
      mensaje: "La herramienta no adivina el tratamiento del IVA: elegí el tipo de gasto",
      fuente: FUENTE.r1,
      campo: "tipoGastoId",
    });
    carril = "ninguno";
  }

  // ── 2. Leyenda o factura M → cuentas a pagar ───────────────────────────────
  if (d.leyendaA !== "ninguna" || d.clase === "factura_m") {
    agregar({
      codigo: "R3_FACTURA_CON_LEYENDA",
      severidad: "bloquea",
      mensaje: "Esta factura exige retener o pagar a un CBU: no se paga por rendición. Va a Cuentas a Pagar",
      fuente: FUENTE.r3,
      campo: d.clase === "factura_m" ? "clase" : "leyendaA",
    });
    carril = "cuentas_a_pagar";
    tratamiento = "no_computable";
  }

  // ── 3. Tratamiento: el comprobante degrada, nunca mejora ───────────────────
  const claseComputa = CLASES_QUE_COMPUTAN.has(d.clase);
  if ((d.clase === "factura_b" || d.clase === "tique_consumidor_final") && (d.ivaContenido ?? 0) > 0) {
    agregar({
      codigo: "R2_IVA_CONTENIDO_A_CERO",
      severidad: "informa",
      mensaje: "El IVA que muestra este ticket no se recupera (es IVA contenido de consumidor final)",
      fuente: FUENTE.r2Contenido,
      campo: "ivaContenido",
    });
  }

  const receptorEsEmpresa =
    d.cuitReceptor !== undefined && normalizarCuit(d.cuitReceptor) === normalizarCuit(ctx.empresa.cuit);
  if (!receptorEsEmpresa && !sinComprobante) {
    if (claseComputa || d.clase === "factura_m") {
      agregar({
        codigo: "R2_RECEPTOR_NO_ES_LA_EMPRESA",
        severidad: "advierte",
        mensaje: "La factura no está a nombre de la empresa: no recupera IVA",
        fuente: FUENTE.r2Receptor,
        campo: "cuitReceptor",
      });
    } else {
      agregar({
        codigo: "R2_PEDI_LA_CUIT",
        severidad: "advierte",
        mensaje: "La próxima pedí que pongan la CUIT de la empresa en el ticket",
        fuente: FUENTE.r2PediCuit,
        campo: "cuitReceptor",
      });
    }
  }

  const degrada = !claseComputa || !receptorEsEmpresa || c.constatacion === "rechazada" || c.cuitApocrifa === true;
  if (degrada && tratamiento === "computable") tratamiento = "no_computable";

  if (tipo && tipo.tratamientoBase === "no_computable" && d.clase === "factura_a") {
    agregar({
      codigo: "R1_NO_COMPUTA_POR_LEY",
      severidad: "informa",
      mensaje: "Esta factura no recupera IVA por ley. No es un error tuyo",
      fuente: tipo.fuente,
      campo: "tipoGastoId",
    });
  }

  // ── 4. Carril (corte por defecto del frente SAP) ───────────────────────────
  if (carril === undefined) {
    carril = tratamiento === "computable" ? "factura" : tratamiento === "no_computable" ? "asiento" : "ninguno";
  }

  // ── 5. Validaciones ────────────────────────────────────────────────────────
  if (cuitEmisor !== undefined) {
    if (!cuitValido(cuitEmisor)) {
      agregar({
        codigo: "V2_CUIT_INVALIDA",
        severidad: "bloquea",
        mensaje: "El CUIT del comercio está mal: revisalo contra el papel (no cierra el dígito verificador)",
        campo: "cuitEmisor",
      });
    }
  } else if (CLASES_CON_NUMERO_OFICIAL.has(d.clase)) {
    agregar({
      codigo: "V2_CUIT_INVALIDA",
      severidad: "bloquea",
      mensaje: "Falta el CUIT de quien emitió el comprobante: está impreso arriba, cargalo",
      campo: "cuitEmisor",
    });
  }

  if (CLASES_CON_NUMERO_OFICIAL.has(d.clase) && (d.puntoVenta === undefined || d.numero === undefined)) {
    agregar({
      codigo: "V9_NUMERO_OFICIAL",
      severidad: "bloquea",
      mensaje: "Faltan el punto de venta o el número del comprobante: cargalos tal como están en el papel",
      campo: d.puntoVenta === undefined ? "puntoVenta" : "numero",
    });
  }

  if ((d.clase === "factura_b" || d.clase === "factura_c") && d.lineasIva.some((l) => l.iva > 0)) {
    agregar({
      codigo: "V4_B_O_C_CON_IVA_DISCRIMINADO",
      severidad: "bloquea",
      mensaje: "Una factura B o C no discrimina IVA: revisá la letra o cargá sólo el total",
      campo: "lineasIva",
    });
  }

  if (d.lineasIva.length > 0 || CLASES_QUE_DISCRIMINAN.has(d.clase)) {
    const netos = sumar(...d.lineasIva.map((l) => l.neto));
    const ivas = sumar(...d.lineasIva.map((l) => l.iva));
    const resto = sumar(...d.percepciones.map((p) => p.importe), d.noGravado, d.exento, d.impuestosInternos);
    if (Math.abs(netos + ivas + resto - d.total) > pol.toleranciaCentavos) {
      agregar({
        codigo: "V8_ARITMETICA",
        severidad: "bloquea",
        mensaje:
          `Los importes no suman el total (${formatearPesosCorto(netos + resto)} + ${formatearPesosCorto(ivas)}` +
          ` ≠ ${formatearPesosCorto(d.total)}). ¿Hay una percepción sin separar?`,
        campo: "total",
      });
    }
  }

  if (d.percepciones.some((p) => p.regimen === "iibb" && !p.jurisdiccion)) {
    agregar({
      codigo: "R7_PERCEPCION_SIN_JURISDICCION",
      severidad: "bloquea",
      mensaje: "Hay una percepción de Ingresos Brutos sin provincia: elegí de qué provincia es",
      fuente: FUENTE.r7,
      campo: "percepciones",
    });
  }

  if (c.constatacion === "rechazada") {
    agregar({
      codigo: "R4_CONSTATACION_RECHAZADA",
      severidad: "bloquea",
      mensaje: "ARCA no reconoce este comprobante: pedile al comercio uno válido",
      fuente: FUENTE.r4Constatacion,
    });
  }
  if (c.cuitApocrifa === true) {
    agregar({
      codigo: "R4_CUIT_APOCRIFA",
      severidad: "bloquea",
      mensaje: "ARCA tiene marcado este CUIT como emisor de facturas apócrifas",
      fuente: FUENTE.r4Apocrifa,
      campo: "cuitEmisor",
    });
  }
  if (c.constatacion === "sin_constatacion_posible" && !sinComprobante) {
    agregar({
      codigo: "R4_SIN_CONSTATACION_POSIBLE",
      severidad: "informa",
      mensaje: "Es un ticket de controlador fiscal: ARCA no tiene cómo constatarlo. Queda anotado así, no es un error",
      fuente: FUENTE.r4SinConstatacion,
    });
  }
  // Regla 4: sin constatación y sin control de CUIT apócrifa no se contabiliza. Aplica a lo que ARCA
  // puede constatar (electrónico con CAE/CAEA); avisa ya, y `aplicarAccion("contabilizar")` lo frena.
  if (
    CLASES_CONSTATABLES.has(d.clase) &&
    (d.cae ?? "").trim() !== "" &&
    (c.constatacion === "pendiente" || c.cuitApocrifa === "sin_consultar")
  ) {
    agregar({
      codigo: "R4_CONSTATACION_PENDIENTE",
      severidad: "advierte",
      mensaje: "Falta constatarlo en ARCA: no se contabiliza hasta tener la respuesta",
      fuente: FUENTE.r4Pendiente,
    });
  }

  const anteriores = cargadosAntes(c, ctx.otrosComprobantes);
  if (cuitEmisor !== undefined && d.puntoVenta !== undefined && d.numero !== undefined) {
    const duplicado = anteriores.find(
      (o) =>
        o.datos.clase === d.clase &&
        o.datos.puntoVenta === d.puntoVenta &&
        o.datos.numero === d.numero &&
        o.datos.cuitEmisor !== undefined &&
        normalizarCuit(o.datos.cuitEmisor) === cuitEmisor,
    );
    if (duplicado) {
      agregar({
        codigo: "V6_DUPLICADO",
        severidad: "bloquea",
        mensaje: `Este comprobante ya se rindió (lo cargó el legajo ${duplicado.legajo})`,
        campo: "numero",
      });
    }
  }
  if (c.hashImagen && c.hashImagen.trim() !== "") {
    if (anteriores.some((o) => o.hashImagen === c.hashImagen)) {
      agregar({
        codigo: "V6_MISMA_FOTO",
        severidad: "bloquea",
        mensaje: "Esta foto ya se subió en otro comprobante: no se puede rendir dos veces",
      });
    }
  }

  if (!sinComprobante && (!im.jurisdiccionActividad || !im.jurisdiccionComprobante)) {
    agregar({
      codigo: "R9_FALTA_JURISDICCION",
      severidad: "bloquea",
      mensaje: "Falta la provincia del gasto: indicá dónde se hizo y con qué provincia tiene que ver el trabajo",
      fuente: FUENTE.r9,
      campo: !im.jurisdiccionActividad ? "jurisdiccionActividad" : "jurisdiccionComprobante",
    });
  }
  if (tipo?.exige.includes("origenDestino") && (!im.origen || !im.destino)) {
    agregar({
      codigo: "R9_FALTA_JURISDICCION",
      severidad: "bloquea",
      mensaje: "Falta el origen o el destino del traslado: cargalos (el gasto se reparte entre las provincias)",
      fuente: FUENTE.r9,
      campo: !im.origen ? "origen" : "destino",
    });
  }
  if (im.jurisdiccionActividad && !pol.jurisdiccionesInscriptas.includes(im.jurisdiccionActividad)) {
    agregar({
      codigo: "R9_PROVINCIA_NO_INSCRIPTA",
      severidad: "advierte",
      mensaje: `Gasto en ${lugar(im.jurisdiccionActividad)}: ahí la empresa no está inscripta en Ingresos Brutos. Avisale a Administración`,
      fuente: FUENTE.r9,
      campo: "jurisdiccionActividad",
    });
  }

  if (tipo) {
    const exigeDominio = tipo.exige.includes("dominio");
    const exigeTipoVehiculo = tipo.exige.includes("tipoVehiculo");
    if (exigeDominio && !im.dominio?.trim()) {
      agregar({
        codigo: "R10_FALTA_VEHICULO",
        severidad: "bloquea",
        mensaje: `${tipo.etiqueta} sin patente: cargala, después no se puede reconstruir`,
        fuente: FUENTE.r10,
        campo: "dominio",
      });
    }
    if (exigeTipoVehiculo && !im.tipoVehiculo) {
      agregar({
        codigo: "R10_FALTA_VEHICULO",
        severidad: "bloquea",
        mensaje: "Falta el tipo de vehículo (auto, utilitario o camión): elegilo, después no se puede reconstruir",
        fuente: FUENTE.r10,
        campo: "tipoVehiculo",
      });
    }
    if ((exigeDominio || exigeTipoVehiculo) && im.tipoVehiculo === "automovil") {
      agregar({
        codigo: "R10_TOPE_AUTOMOVIL",
        severidad: "informa",
        mensaje: "Automóvil: aplica el tope de Ganancias por unidad",
        fuente: FUENTE.r10,
        campo: "tipoVehiculo",
      });
    }

    if ((tipo.esRepresentacion || tipo.exige.includes("asistentes")) && !im.asistentes?.trim()) {
      agregar({
        codigo: "V13_FALTA_ASISTENTES",
        severidad: "bloquea",
        mensaje: "Gasto con clientes: anotá con quién fue (el cliente y quiénes estuvieron)",
        fuente: FUENTE.v13,
        campo: "asistentes",
      });
    }

    if (tipo.cubiertoPorConvenioCamioneros && ctx.persona.convenioCamioneros) {
      const viajeCubierto = ctx.viajes.some(
        (v) => v.legajo === ctx.persona.legajo && v.cubiertoPorConvenio && v.desde <= d.fecha && d.fecha <= v.hasta,
      );
      if (viajeCubierto) {
        agregar({
          codigo: "R11_CUBIERTO_POR_CONVENIO",
          severidad: "bloquea",
          mensaje: "Este gasto ya lo paga el convenio en tu recibo de sueldo: no se puede reintegrar dos veces",
          fuente: FUENTE.r11Convenio,
          campo: "viajeId",
        });
      }
    }
  }

  if (sinComprobante) {
    if (tipo && !tipo.admiteSinComprobante) {
      agregar({
        codigo: "R11_SIN_COMPROBANTE",
        severidad: "bloquea",
        mensaje: "Este gasto necesita comprobante",
        fuente: FUENTE.r11SinComprobante,
        campo: "clase",
      });
    } else if (totalEnPesos > pol.topeSinComprobante) {
      agregar({
        codigo: "R11_SIN_COMPROBANTE_SOBRE_TOPE",
        severidad: "bloquea",
        mensaje: `Sin comprobante se aceptan hasta ${formatearPesosCorto(pol.topeSinComprobante)}: para más, hace falta el comprobante`,
        fuente: FUENTE.r11SinComprobante,
        campo: "total",
      });
    } else {
      agregar({
        codigo: "R11_SIN_COMPROBANTE",
        severidad: "informa",
        mensaje: "Va sin comprobante: se informa a Haberes como reintegro",
        fuente: FUENTE.r11SinComprobante,
      });
    }
  }

  if (im.medioPago.tipo === "efectivo_anticipo" && totalEnPesos > pol.topeEfectivoLey25345) {
    agregar({
      codigo: "R5_EFECTIVO_SOBRE_TOPE",
      severidad: "informa",
      mensaje: "Pago en efectivo: guardamos foto, aprobación y anticipo como prueba de la operación",
      fuente: FUENTE.r5,
      campo: "medioPago",
    });
  }

  if (carril === "factura" && cuitEmisor !== undefined && !ctx.maestroProveedores.has(cuitEmisor)) {
    agregar({
      codigo: "V3_PROVEEDOR_FUERA_DEL_MAESTRO",
      severidad: "advierte",
      mensaje: "Este proveedor no está dado de alta en SAP: Tesorería va a pedir el alta",
      campo: "cuitEmisor",
    });
  }

  if (
    cuitEmisor !== undefined &&
    ctx.maestroProveedores.has(cuitEmisor) &&
    tratamiento === "computable" &&
    totalEnPesos > pol.topeDerivacionCxP
  ) {
    agregar({
      codigo: "R8_DERIVAR_A_CXP",
      severidad: "advierte",
      mensaje: "Proveedor habitual con un importe alto: se paga por Cuentas a Pagar (puede corresponder retención)",
      fuente: FUENTE.r8,
      campo: "total",
    });
    carril = "cuentas_a_pagar";
  }

  if (!esFechaIso(d.fecha)) {
    agregar({
      codigo: "V12_FUERA_DE_PERIODO",
      severidad: "advierte",
      mensaje: "La fecha del comprobante no es válida: revisala",
      campo: "fecha",
    });
  } else if (!estaEnPeriodo(d.fecha, ctx.periodo)) {
    agregar({
      codigo: "V12_FUERA_DE_PERIODO",
      severidad: "advierte",
      mensaje: `El comprobante es del ${formatearFecha(d.fecha)} y la rendición es de ${nombrePeriodo(ctx.periodo)}: ¿va en otra rendición?`,
      campo: "fecha",
    });
  }

  if (d.moneda === "USD" && !(d.cotizacion !== undefined && d.cotizacion > 0)) {
    agregar({
      codigo: "V14_MONEDA_SIN_COTIZACION",
      severidad: "bloquea",
      mensaje: "El comprobante está en dólares: cargá la cotización del día",
      campo: "cotizacion",
    });
  }

  // ── 6. Importes ────────────────────────────────────────────────────────────
  const computa = tratamiento === "computable";
  const creditoFiscal = computa
    ? convertirAPesos(sumar(...d.lineasIva.map((l) => l.iva)), d.moneda, d.cotizacion)
    : 0;
  // Las percepciones de IVA e IIBB son pagos a cuenta de otro impuesto, no crédito de la operación:
  // se computan si el comprobante está a nombre de la empresa, aunque el IVA de la operación no compute
  // (restaurante, hotel). Si no está a su nombre, nadie se las puede tomar y van al costo.
  // [A VALIDAR con el contador del cliente — observación del Challenger, RFC-006].
  const aNombreDeLaEmpresa =
    d.cuitReceptor !== undefined && normalizarCuit(d.cuitReceptor) === normalizarCuit(ctx.empresa.cuit);
  const percepcionesComputables = aNombreDeLaEmpresa
    ? convertirAPesos(
        sumar(...d.percepciones.filter((p) => p.regimen === "iva" || p.regimen === "iibb").map((p) => p.importe)),
        d.moneda,
        d.cotizacion,
      )
    : 0;
  const indicadorIva = tipo ? (computa ? tipo.indicadorIvaComputable : tipo.indicadorIvaNoComputable) : undefined;

  return {
    comprobanteId: c.id,
    tratamiento,
    carril,
    ...(tipo ? { cuentaMayor: tipo.cuentaMayor, indicadorIvaNoComputable: tipo.indicadorIvaNoComputable } : {}),
    ...(indicadorIva !== undefined ? { indicadorIva } : {}),
    creditoFiscal,
    costo: totalEnPesos - creditoFiscal - percepcionesComputables,
    percepcionesComputables,
    validaciones,
    bloqueado: validaciones.some((v) => v.severidad === "bloquea"),
    reglaVersion: ctx.reglaVersion,
  };
}
