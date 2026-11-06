/**
 * Verificar el certificado de un negocio contra ARCA, sin tocar sus libros (prueba con cliente nuevo).
 *
 * Por qué existe: el banco de pruebas de /admin/facturacion firma con el certificado de PRUEBA de la
 * plataforma (`ARCA_CERT_PEM`), no con el del cliente; y emitir facturas de homologación por el
 * circuito normal deja comprobantes con CAE de prueba en el negocio, que después BLOQUEAN el pase a
 * real (`precondicionDeComprobantes`, src/lib/operador/pase-a-real.ts:217). Esto prueba el
 * certificado del cliente en el ambiente de ARCA que lo emitió, y no guarda ninguna factura.
 *
 * Pasos: (1) ticket de WSAA con el certificado del negocio; (2) último comprobante autorizado del
 * punto de venta (lectura, sin efecto fiscal: prueba que el certificado está asociado a `wsfe` y que
 * el punto de venta existe para ese CUIT); (3) SÓLO en homologación, un comprobante de prueba de
 * $100 a consumidor final para ver salir un CAE. En producción nunca se emite desde acá.
 *
 * PURO: recibe el cliente de ARCA ya armado; la lectura del certificado y la base vive en
 * src/lib/operador/verificar-arca.server.ts.
 */

import {
  AlicuotaIvaId,
  ArcaRechazoError,
  Concepto,
  CondicionIvaReceptorId,
  TipoComprobante,
  TipoDocumento,
  fechaDePrueba,
  type AfipClient,
  type ComprobanteArca,
} from "@/plugins/arca";
import type { EntornoDelCertificado } from "@/lib/operador/pase-a-real";

export type PasoVerificacion = "certificado" | "conexion" | "emision";

export type ResultadoVerificacion =
  | {
      ok: true;
      entorno: "homologacion" | "produccion";
      puntoVenta: number;
      tipo: TipoComprobante;
      ultimoAutorizado: number;
      prueba: { cae: string; numero: number; caeVencimiento: string } | null;
    }
  | { ok: false; paso: PasoVerificacion; mensaje: string };

/** Letra de la factura de prueba según la condición del emisor: C monotributo/exento, B inscripto. */
export function tipoDeVerificacion(condicionIva: string | null | undefined): TipoComprobante | null {
  if (condicionIva === "MONOTRIBUTO" || condicionIva === "EXENTO") return TipoComprobante.FacturaC;
  if (condicionIva === "RESPONSABLE_INSCRIPTO") return TipoComprobante.FacturaB;
  return null;
}

/** Comprobante de prueba de $100 a consumidor final (la B lleva $21 de IVA al 21 %). */
export function comprobanteDeVerificacion(tipo: TipoComprobante, puntoVenta: number, ahora: Date): ComprobanteArca {
  const fecha = fechaDePrueba(ahora);
  const conIva = tipo === TipoComprobante.FacturaB;
  return {
    puntoVenta,
    tipo,
    concepto: Concepto.Productos,
    docTipo: TipoDocumento.ConsumidorFinal,
    docNro: 0,
    condicionIvaReceptorId: CondicionIvaReceptorId.ConsumidorFinal,
    fecha,
    neto: 100,
    iva: conIva
      ? [{ id: AlicuotaIvaId.VeintiUno, baseImponible: 100, importe: 21 }]
      : [{ id: AlicuotaIvaId.Cero, baseImponible: 100, importe: 0 }],
    total: conIva ? 121 : 100,
    invoiceId: `VERIFICACION-${fecha}`,
    tenantId: "verificacion-arca",
  };
}

/** El texto crudo de un error de ARCA (códigos incluidos), sin material del certificado. */
export function textoDelError(e: unknown): string {
  if (e instanceof ArcaRechazoError && e.observaciones.length > 0) {
    return e.observaciones.map((o) => `${o.codigo}: ${o.mensaje}`).join(" · ");
  }
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[pem]").slice(0, 400);
}

/**
 * Qué hacer ante los rechazos que más aparecen en el alta de un cliente. Los textos de ARCA son los de
 * su manual y sus respuestas conocidas; los que no reconoce se muestran crudos (provisional a
 * confirmar con los rechazos reales de la prueba).
 */
export function queHacer(textoArca: string): string {
  const t = textoArca.toLowerCase();
  if (t.includes("cert.untrusted") || t.includes("no emitido por ac de confianza")) {
    return "ARCA no reconoce el certificado en este ambiente: un certificado de homologación no sirve en producción ni al revés. Generá el del ambiente correcto.";
  }
  if (t.includes("cert.expired") || t.includes("expirado") || t.includes("vencido")) {
    return "El certificado está vencido: hay que generar uno nuevo y rotarlo acá.";
  }
  if (t.includes("notauthorized") || t.includes("no autorizado a acceder")) {
    return "El certificado no está asociado al servicio de facturación: en ARCA, Administrador de Relaciones de Clave Fiscal → Nueva relación → «Facturación electrónica» (wsfe) → elegir el certificado (computador fiscal).";
  }
  if (t.includes("alreadyauthenticated") || t.includes("ya posee un ta valido")) {
    return "ARCA ya entregó un ticket para este certificado hace menos de 10 minutos y no lo tenemos guardado: esperá 10 minutos y volvé a verificar.";
  }
  if (t.includes("punto de venta") || t.includes("ptovta")) {
    return "El punto de venta no está habilitado para web services: en ARCA, Administración de puntos de venta y domicilios → Agregar → sistema «Factura electrónica - Monotributo / RECE para aplicativo y web services».";
  }
  if (t.includes("cuit") && (t.includes("represent") || t.includes("no se encuentra"))) {
    return "El CUIT del negocio no coincide con el del certificado o no está activo en ARCA: revisá el CUIT de la ficha.";
  }
  return "ARCA devolvió un error que no está en la lista: copiá el texto tal cual y mirá la tabla de rechazos del runbook (docs/runbooks/arca/PRUEBA-CLIENTE-NUEVO.md).";
}

export interface DatosVerificacion {
  entorno: EntornoDelCertificado;
  puntoVenta: number | null;
  condicionIva: string | null;
  cliente: AfipClient;
  ahora?: Date;
}

export async function verificarConArca(d: DatosVerificacion): Promise<ResultadoVerificacion> {
  if (d.entorno === "desconocido") {
    return {
      ok: false,
      paso: "certificado",
      mensaje: "No sabemos de qué ambiente de ARCA es el certificado (el emisor no es el de homologación ni el de producción). No se verifica a ciegas.",
    };
  }
  const pv = d.puntoVenta;
  if (pv == null || !Number.isInteger(pv) || pv < 1 || pv > 99_999) {
    return { ok: false, paso: "conexion", mensaje: "Falta el punto de venta del negocio (paso 2 de la ficha)." };
  }
  const tipo = tipoDeVerificacion(d.condicionIva);
  if (tipo === null) {
    return { ok: false, paso: "conexion", mensaje: "Falta la condición del negocio frente al IVA: sin ella no sabemos qué letra probar." };
  }

  let ultimo: number;
  try {
    ultimo = await d.cliente.ultimoAutorizado(pv, tipo);
  } catch (e) {
    const crudo = textoDelError(e);
    return { ok: false, paso: "conexion", mensaje: `${queHacer(crudo)} (ARCA: ${crudo})` };
  }

  if (d.entorno === "produccion") {
    return { ok: true, entorno: "produccion", puntoVenta: pv, tipo, ultimoAutorizado: ultimo, prueba: null };
  }

  try {
    const r = await d.cliente.solicitarCae(comprobanteDeVerificacion(tipo, pv, d.ahora ?? new Date()));
    return {
      ok: true,
      entorno: "homologacion",
      puntoVenta: pv,
      tipo,
      ultimoAutorizado: ultimo,
      prueba: { cae: r.cae, numero: r.numero, caeVencimiento: r.caeVencimiento },
    };
  } catch (e) {
    const crudo = textoDelError(e);
    return { ok: false, paso: "emision", mensaje: `${queHacer(crudo)} (ARCA: ${crudo})` };
  }
}

const LETRA: Partial<Record<TipoComprobante, string>> = {
  [TipoComprobante.FacturaB]: "B",
  [TipoComprobante.FacturaC]: "C",
};

/** La línea que ve el operador en la ficha. */
export function mensajeDeVerificacion(r: ResultadoVerificacion): string {
  if (!r.ok) {
    const donde = { certificado: "el certificado", conexion: "la conexión", emision: "la factura de prueba" }[r.paso];
    return `Falló ${donde}: ${r.mensaje}`;
  }
  const letra = LETRA[r.tipo] ?? String(r.tipo);
  const base = `ARCA (${r.entorno === "produccion" ? "producción" : "homologación"}) reconoce el certificado y el punto de venta ${r.puntoVenta}; último Factura ${letra} autorizada: ${r.ultimoAutorizado}.`;
  if (!r.prueba) return `${base} En producción no se emite nada desde acá.`;
  return `${base} Factura ${letra} de prueba n.º ${r.prueba.numero} con CAE ${r.prueba.cae} (vence ${r.prueba.caeVencimiento}). No quedó guardada en el negocio.`;
}
