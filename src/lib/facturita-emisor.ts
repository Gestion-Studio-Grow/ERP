/**
 * FACTURITA · «Datos para tus facturas» — lo que el PDF del comprobante exige del emisor y el alta
 * no junta: razón social, domicilio comercial, inicio de actividades e Ingresos Brutos.
 *
 * Se graban en los MISMOS campos del negocio que lee el PDF (`Tenant.arcaRazonSocial`,
 * `arcaDomicilioFiscal`, `arcaInicioActividades` AAAAMMDD, `arcaIibb`; ver
 * src/lib/comprobante-pdf-datos.ts) y que también usa la herencia de locales
 * (`FISCAL_DEL_CUIT`, src/lib/multilocal/multilocal-core.ts). Para IIBB, los valores especiales son
 * los del comentario del schema: «Exento» y «Convenio Multilateral».
 *
 * ARCA no exige estos datos para autorizar: sin ellos la factura sale igual, pero el PDF no.
 * PURO: valida y arma lo que se graba; la escritura vive en `facturita-actions`.
 */

import { fechaInputAFiscal, fechaFiscalAInput } from "@/lib/facturita-core";

export type TipoIibb = "numero" | "exento" | "cm";

export const IIBB_EXENTO = "Exento";
export const IIBB_CONVENIO = "Convenio Multilateral";

export interface DatosEmisorForm {
  razonSocial: string;
  domicilio: string;
  /** AAAA-MM-DD (input date). */
  inicioActividades: string;
  iibbTipo: TipoIibb;
  iibbNumero: string;
}

/** Lo que se graba en el negocio (los nombres de las columnas). */
export interface DatosEmisorGuardados {
  arcaRazonSocial: string | null;
  arcaDomicilioFiscal: string | null;
  arcaInicioActividades: string | null;
  arcaIibb: string | null;
}

export type CampoEmisor = "razonSocial" | "domicilio" | "inicioActividades" | "iibb";

export type ValidacionDatosEmisor =
  | { ok: true; datos: { arcaRazonSocial: string; arcaDomicilioFiscal: string; arcaInicioActividades: string; arcaIibb: string } }
  | { ok: false; errores: Partial<Record<CampoEmisor, string>> };

export function validarDatosEmisor(d: DatosEmisorForm, hoy?: string): ValidacionDatosEmisor {
  const errores: Partial<Record<CampoEmisor, string>> = {};
  const razonSocial = (d.razonSocial ?? "").trim();
  const domicilio = (d.domicilio ?? "").trim();
  if (razonSocial.length < 2) errores.razonSocial = "Escribí tu nombre y apellido o la razón social, tal como figura en ARCA.";
  else if (razonSocial.length > 120) errores.razonSocial = "Es muy largo: con 120 letras alcanza.";
  if (domicilio.length < 5) errores.domicilio = "Escribí el domicilio comercial: calle, número y localidad.";
  else if (domicilio.length > 200) errores.domicilio = "Es muy largo: con 200 letras alcanza.";
  const inicio = fechaInputAFiscal(d.inicioActividades);
  if (!inicio) errores.inicioActividades = "Elegí la fecha de inicio de actividades (figura en tu constancia de inscripción).";
  else if (hoy && inicio > hoy) errores.inicioActividades = "La fecha de inicio de actividades no puede ser posterior a hoy.";
  let iibb = "";
  if (d.iibbTipo === "exento") iibb = IIBB_EXENTO;
  else if (d.iibbTipo === "cm") iibb = IIBB_CONVENIO;
  else {
    iibb = (d.iibbNumero ?? "").trim();
    if (!/^[\d-]{5,20}$/.test(iibb)) errores.iibb = "Escribí el número de Ingresos Brutos (sólo números y guiones), o elegí exento o Convenio Multilateral.";
  }
  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: { arcaRazonSocial: razonSocial, arcaDomicilioFiscal: domicilio, arcaInicioActividades: inicio as string, arcaIibb: iibb },
  };
}

const lleno = (v: string | null | undefined): boolean => typeof v === "string" && v.trim() !== "";

/** Qué falta para que el PDF salga (mismas reglas que `faltantesDelComprobante` para el emisor). */
export function faltantesEmisor(g: DatosEmisorGuardados): string[] {
  const f: string[] = [];
  if (!lleno(g.arcaRazonSocial)) f.push("la razón social");
  if (!lleno(g.arcaDomicilioFiscal)) f.push("el domicilio comercial");
  if (!/^\d{8}$/.test(g.arcaInicioActividades ?? "")) f.push("el inicio de actividades");
  if (!lleno(g.arcaIibb)) f.push("Ingresos Brutos");
  return f;
}

/** «la razón social, el domicilio y Ingresos Brutos». */
export function listaEnCriollo(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Qué decir cuando el PDF no sale, en Facturita (sin pantallas del backoffice)
// ---------------------------------------------------------------------------

export const TEXTO_DATOS_PARA_FACTURAS =
  "Faltan tus datos para facturas (razón social, domicilio comercial, inicio de actividades e Ingresos Brutos). Completalos en «Mi cuenta» y volvé a descargarla: sirve también para las que ya emitiste.";

/**
 * Reescribe un faltante del generador de PDF para Facturita: los mensajes del backoffice mandan a
 * «la ficha del cliente» o a «Facturación», que acá no existen.
 */
export function faltantePdfEnFacturita(f: { campo: string; mensaje: string }): string {
  switch (f.campo) {
    case "emisor.razonSocial":
    case "emisor.domicilio":
    case "emisor.inicioActividades":
    case "emisor.iibb":
      return TEXTO_DATOS_PARA_FACTURAS;
    case "emisor.cuit":
    case "emisor.condicionIva":
      return "Hay un problema con tu CUIT o tu condición frente al IVA cargados. Escribinos y lo revisamos con vos.";
    case "estado":
      return "ARCA rechazó esta factura: no es válida y no se imprime. El motivo está en «Mis facturas».";
    case "receptor.nombre":
    case "receptor.condicionIva":
      return "Esta factura no tiene guardado el nombre o la condición del comprador (se emitió antes de que Facturita los pidiera). Descargá la copia desde «Mis Comprobantes» en el sitio de ARCA.";
    case "receptor.domicilio":
      return "Una Factura A lleva el domicilio del comprador y esta no lo tiene guardado. Descargá la copia desde «Mis Comprobantes» en el sitio de ARCA.";
    default:
      return f.mensaje;
  }
}

/** Lo guardado → el estado inicial del formulario. */
export function formDesdeGuardado(g: DatosEmisorGuardados): DatosEmisorForm {
  const iibb = (g.arcaIibb ?? "").trim();
  const iibbTipo: TipoIibb = iibb === IIBB_EXENTO ? "exento" : iibb === IIBB_CONVENIO ? "cm" : "numero";
  return {
    razonSocial: g.arcaRazonSocial ?? "",
    domicilio: g.arcaDomicilioFiscal ?? "",
    inicioActividades: /^\d{8}$/.test(g.arcaInicioActividades ?? "") ? fechaFiscalAInput(g.arcaInicioActividades as string) : "",
    iibbTipo,
    iibbNumero: iibbTipo === "numero" ? iibb : "",
  };
}
