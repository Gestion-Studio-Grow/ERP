/**
 * FACTURITA — lógica pura del producto C (ADR-076): el emisor simple con tope
 * de 5 facturas por mes. Sin DB ni red: validación del receptor, reglas del
 * tope y armado del comprobante se testean solos; la persistencia vive en
 * `facturita-actions`.
 */

import { cuitValido, normalizarCuit } from "@/lib/cuit";

/** Tope del plan gratis: 5 facturas por mes (el gancho de upgrade a Comerciante). */
export const LIMITE_FACTURAS_FACTURITA = 5;

/** Aviso desde la 4ª factura ("te queda 1"). */
export const AVISO_DESDE = LIMITE_FACTURAS_FACTURITA - 1;

export interface EstadoLimite {
  usadas: number;
  limite: number;
  restantes: number;
  puedeEmitir: boolean;
  /** Mensaje de aviso/bloqueo en criollo (null si no corresponde mostrar nada). */
  mensaje: string | null;
}

/** Estado del tope mensual a partir de las facturas ya emitidas en el mes. */
export function estadoLimite(usadas: number): EstadoLimite {
  const restantes = Math.max(0, LIMITE_FACTURAS_FACTURITA - usadas);
  const puedeEmitir = usadas < LIMITE_FACTURAS_FACTURITA;
  let mensaje: string | null = null;
  if (!puedeEmitir) {
    mensaje =
      "Llegaste al tope de 5 facturas gratis de este mes. Para emitir más, pasate a Comerciante: mismo lugar, hasta 159 facturas por mes.";
  } else if (usadas >= AVISO_DESDE) {
    mensaje = `Te queda ${restantes === 1 ? "1 factura gratis" : `${restantes} facturas gratis`} este mes.`;
  }
  return { usadas, limite: LIMITE_FACTURAS_FACTURITA, restantes, puedeEmitir, mensaje };
}

// ---------------------------------------------------------------------------
// Qué se factura: concepto, alícuota (inscripto) y receptor
// ---------------------------------------------------------------------------

/** Concepto de la factura ante ARCA (WSFEv1 `Concepto`): 1 productos, 2 servicios, 3 ambos. */
export type ConceptoFacturita = "productos" | "servicios" | "ambos";

export const CONCEPTO_ARCA: Readonly<Record<ConceptoFacturita, 1 | 2 | 3>> = {
  productos: 1,
  servicios: 2,
  ambos: 3,
};

export const OPCIONES_CONCEPTO: readonly { id: ConceptoFacturita; nombre: string; ejemplo: string }[] = [
  { id: "productos", nombre: "Productos", ejemplo: "Ej.: 2 macetas de cerámica" },
  { id: "servicios", nombre: "Servicios", ejemplo: "Ej.: Clase de yoga de octubre" },
  { id: "ambos", nombre: "Productos y servicios", ejemplo: "Ej.: Instalación de cortinas con materiales" },
];

export function conceptoConFechasDeServicio(c: ConceptoFacturita): boolean {
  return c !== "productos";
}

/**
 * Alícuota de IVA que puede elegir un Responsable Inscripto (el monotributo y el exento emiten C, sin
 * IVA discriminado). El valor es el código de ARCA (`AlicIva.Id`): 5 = 21 %, 4 = 10,5 %, 6 = 27 %.
 */
export type AlicuotaFacturita = "21" | "10.5" | "27";

export const ALICUOTA_ARCA: Readonly<Record<AlicuotaFacturita, 4 | 5 | 6>> = { "21": 5, "10.5": 4, "27": 6 };

export const OPCIONES_ALICUOTA: readonly { id: AlicuotaFacturita; nombre: string }[] = [
  { id: "21", nombre: "21 % (la general)" },
  { id: "10.5", nombre: "10,5 %" },
  { id: "27", nombre: "27 %" },
];

export const ALICUOTA_POR_DEFECTO: AlicuotaFacturita = "21";

/**
 * Condición frente al IVA del comprador CON CUIT (RG 5616: se informa la real, nunca un 5 de
 * relleno). Sin CUIT (DNI, CUIL o sin identificar) el comprador es consumidor final.
 */
export type CondicionReceptorConCuit = "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO";

export const OPCIONES_CONDICION_RECEPTOR: readonly { id: CondicionReceptorConCuit; nombre: string }[] = [
  { id: "RESPONSABLE_INSCRIPTO", nombre: "Responsable inscripto" },
  { id: "MONOTRIBUTO", nombre: "Monotributista" },
  { id: "EXENTO", nombre: "Exento de IVA" },
];

const CONDICIONES_CON_CUIT = new Set<string>(OPCIONES_CONDICION_RECEPTOR.map((o) => o.id));

// ---------------------------------------------------------------------------
// Emisión manual
// ---------------------------------------------------------------------------

export interface EmisionFacturita {
  /** Descripción de lo vendido ("qué se vendió o qué servicio se prestó"). */
  descripcion: string;
  /** Total de la factura en pesos (IVA incluido si corresponde). */
  total: number;
  /** Default: productos. */
  concepto?: ConceptoFacturita;
  /** Con servicios: período del servicio y vencimiento del pago, en AAAA-MM-DD (input date). */
  servicioDesde?: string;
  servicioHasta?: string;
  vencimientoPago?: string;
  /** Sólo la usa el Responsable Inscripto. Default 21 %. */
  alicuota?: AlicuotaFacturita;
  /** Receptor: vacío = consumidor final. */
  docTipo?: 80 | 86 | 96; // CUIT | CUIL | DNI
  docNro?: string;
  /** Obligatoria con CUIT. */
  condicionReceptor?: CondicionReceptorConCuit;
}

export interface EmisionValidada {
  receptor: { docTipo: number; docNro: number; condicionIva: CondicionReceptorConCuit | "CONSUMIDOR_FINAL" };
  concepto: 1 | 2 | 3;
  /** AAAAMMDD; sólo con servicios. */
  servicio: { desde: string; hasta: string; vencimientoPago: string } | null;
  alicuotaId: 4 | 5 | 6;
  descripcion: string;
}

export type ValidacionEmision = ({ ok: true } & EmisionValidada) | { ok: false; error: string };

const DOC_CONSUMIDOR_FINAL = 99;

/** "2026-10-22" → "20261022"; cualquier otra cosa → null. */
export function fechaInputAFiscal(v: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v ?? "").trim());
  if (!m) return null;
  const [, a, mes, d] = m;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${a}${mes}${d}`;
}

/** "20261022" → "2026-10-22" (para el valor por defecto de un input date). */
export function fechaFiscalAInput(aaaammdd: string): string {
  return `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;
}

/**
 * "20261022" → "22/10/2026". Directo del texto, SIN pasar por `Date`: armar un Date local a la
 * medianoche y formatearlo en hora argentina corría la fecha un día para atrás con el servidor en UTC.
 */
export function fechaFiscalLegible(aaaammdd: string): string {
  if (!/^\d{8}$/.test(aaaammdd)) return aaaammdd;
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

/**
 * Valida la emisión manual. `hoy` es la fecha fiscal del comprobante (AAAAMMDD), que pone el
 * servidor. Receptor vacío → consumidor final (DocTipo 99). CUIT/CUIL con dígito verificador real;
 * DNI de 7 u 8 dígitos. Con CUIT, la condición frente al IVA es obligatoria.
 */
export function validarEmision(datos: EmisionFacturita, hoy?: string): ValidacionEmision {
  const descripcion = datos.descripcion?.trim() ?? "";
  if (!descripcion) {
    return { ok: false, error: "Contá qué vendiste: la descripción va en la factura." };
  }
  if (!(datos.total > 0)) {
    return { ok: false, error: "El total tiene que ser mayor a cero." };
  }

  const conceptoId: ConceptoFacturita = datos.concepto ?? "productos";
  if (!(conceptoId in CONCEPTO_ARCA)) return { ok: false, error: "Elegí si vendiste productos, servicios o las dos cosas." };
  const alicuota = datos.alicuota ?? ALICUOTA_POR_DEFECTO;
  if (!(alicuota in ALICUOTA_ARCA)) return { ok: false, error: "Elegí la alícuota de IVA: 21 %, 10,5 % o 27 %." };

  // Servicios: ARCA exige período del servicio y vencimiento del pago.
  let servicio: EmisionValidada["servicio"] = null;
  if (conceptoConFechasDeServicio(conceptoId)) {
    const desde = fechaInputAFiscal(datos.servicioDesde) ?? hoy ?? null;
    const hasta = fechaInputAFiscal(datos.servicioHasta) ?? desde;
    const vto = fechaInputAFiscal(datos.vencimientoPago) ?? hoy ?? null;
    if (!desde || !hasta || !vto) {
      return { ok: false, error: "Con servicios, ARCA pide las fechas del servicio y la del vencimiento del pago." };
    }
    if (hasta < desde) return { ok: false, error: "El servicio no puede terminar antes de empezar: revisá las fechas." };
    if (hoy && vto < hoy) {
      return { ok: false, error: "El vencimiento del pago no puede ser anterior a la fecha de la factura (hoy)." };
    }
    servicio = { desde, hasta, vencimientoPago: vto };
  }

  const base = { concepto: CONCEPTO_ARCA[conceptoId], servicio, alicuotaId: ALICUOTA_ARCA[alicuota], descripcion };

  // Sin documento → consumidor final.
  const docNroCrudo = datos.docNro?.trim() ?? "";
  if (!datos.docTipo || docNroCrudo === "") {
    return { ok: true, ...base, receptor: { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" } };
  }

  if (datos.docTipo === 96) {
    const soloDigitos = docNroCrudo.replace(/\D/g, "");
    if (!/^\d{7,8}$/.test(soloDigitos)) {
      return { ok: false, error: "El DNI lleva 7 u 8 dígitos." };
    }
    return { ok: true, ...base, receptor: { docTipo: 96, docNro: Number(soloDigitos), condicionIva: "CONSUMIDOR_FINAL" } };
  }

  const cuit = normalizarCuit(docNroCrudo);
  if (!cuitValido(cuit)) {
    return { ok: false, error: `El ${datos.docTipo === 86 ? "CUIL" : "CUIT"} no es válido: revisá los 11 números.` };
  }
  if (datos.docTipo === 86) {
    // El CUIL es de una persona sin inscripción: consumidor final.
    return { ok: true, ...base, receptor: { docTipo: 86, docNro: Number(cuit), condicionIva: "CONSUMIDOR_FINAL" } };
  }
  if (!datos.condicionReceptor || !CONDICIONES_CON_CUIT.has(datos.condicionReceptor)) {
    return {
      ok: false,
      error: "Elegí cómo está inscripto el comprador frente al IVA (figura en su constancia de ARCA): de eso depende la factura.",
    };
  }
  return { ok: true, ...base, receptor: { docTipo: 80, docNro: Number(cuit), condicionIva: datos.condicionReceptor } };
}

// ---------------------------------------------------------------------------
// Resultado de la emisión, en criollo y con el estado real
// ---------------------------------------------------------------------------

/**
 * ¿El rechazo lo dio ARCA o lo frenó el sistema antes de mandarlo? El despacho guarda
 * `código: mensaje` cuando contesta ARCA (`ArcaRechazoError`, códigos numéricos) y
 * `campo: mensaje` cuando no pasó la validación propia (`ComprobanteInvalidoError`).
 */
export function origenDelRechazo(motivo: string | null | undefined): "arca" | "sistema" {
  return /^\s*\d+\s*:/.test(motivo ?? "") ? "arca" : "sistema";
}

/** El motivo sin los rótulos técnicos («iva: », «receptor.condicionIva: »). */
export function motivoLegible(motivo: string | null | undefined): string {
  const limpio = (motivo ?? "")
    .split(";")
    .map((parte) => parte.replace(/^\s*[A-Za-z][\w.]*\s*:\s*/, "").trim())
    .filter(Boolean)
    .join(" · ");
  return limpio || "sin motivo informado";
}

/** ¿El CAE es de prueba? Con ARCA simulado (stub) o en homologación, nunca vale como factura. */
export function esDePrueba(modo: string, homologacion: boolean): boolean {
  return modo !== "real" || homologacion;
}

export type EstadoEmision =
  | { estado: "autorizada"; dePrueba: boolean; numero: string | null; cae: string | null }
  | { estado: "pendiente"; motivo: "apagada" | "esperando" }
  | { estado: "rechazada"; origen: "arca" | "sistema"; motivo: string };

/** Lo que se le dice a la persona después de emitir, según cómo quedó la factura. */
export function mensajeDeEmision(e: EstadoEmision): string {
  if (e.estado === "autorizada") {
    const nro = e.numero ? ` N.º ${e.numero}` : "";
    return e.dePrueba
      ? `Factura de prueba${nro} autorizada en el ambiente de prueba: no tiene validez fiscal.`
      : `Factura${nro} autorizada por ARCA${e.cae ? ` (CAE ${e.cae})` : ""}.`;
  }
  if (e.estado === "pendiente") {
    return e.motivo === "apagada"
      ? "La factura quedó guardada como pendiente: la conexión con ARCA todavía no está activa en tu cuenta. Sale apenas se active."
      : "La factura quedó pendiente: sale apenas ARCA responda. La ves en «Mis facturas».";
  }
  return e.origen === "arca"
    ? `ARCA rechazó la factura: ${motivoLegible(e.motivo)}`
    : `No la mandamos a ARCA porque le falta algo: ${motivoLegible(e.motivo)}`;
}

/** "0002-00000015" (punto de venta y número, como en el papel). */
export function numeroDeComprobante(puntoVenta: number, numero: number | null): string | null {
  if (numero == null) return null;
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}
