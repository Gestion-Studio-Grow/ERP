// ============================================================================
// ESTADOS EN CRIOLLO — qué le pasó a la factura, dicho para quien factura, con qué tocar
// ============================================================================
//
// La tabla del diseño (docs/facturacion/ux-v2-diseno.md §3) en una función PURA: recibe lo que
// contestó el motor (`ResultadoEmisionManual`) o lo que frenó la validación ANTES de emitir y
// devuelve {tono, titulo, texto, acciones[]}. El motor y sus mensajes NO se tocan: acá sólo se
// traducen y se les saca la jerga interna («RG …», «homologación», «Soporte GSG», «WSFE»).
//
// Las acciones son ids estables: la pantalla decide cómo se ejecuta cada una (un enlace, ir al
// campo del comprador, volver a emitir). Las que son enlaces traen su `href` ya armado.

import type { EstadoEmision } from "@/lib/facturita-core";
import { enlaceDeWhatsApp, type ResultadoEmisionManual, type RutasDeAyuda } from "@/lib/facturacion/facturador-core";

export type IdAccionUx =
  | "whatsapp"
  | "pdf"
  | "detalle"
  | "reintentar"
  | "corregir-comprador"
  | "corregir-detalle"
  | "puesta-a-punto"
  | "planes"
  | "comprobantes"
  | "factura-b"
  | "avisar-contador"
  | "pasar-a-real";

export interface AccionUx {
  id: IdAccionUx;
  etiqueta: string;
  /** Con `href`, es un enlace; sin él, la pantalla lo resuelve (reintentar, corregir, Factura B). */
  href?: string;
  /** El botón principal del estado (uno solo como mucho). */
  principal?: boolean;
}

export type TonoUx = "ok" | "prueba" | "atencion" | "error";

export type ClaveEstadoUx =
  | "emitido"
  | "modo-de-prueba"
  | "pendiente"
  | "falta-configurar"
  | "sin-regimen-a"
  | "tope-mensual"
  | "arca-no-responde"
  | "rechazo"
  | "falta-un-dato";

export interface EstadoUx {
  clave: ClaveEstadoUx;
  tono: TonoUx;
  titulo: string;
  texto: string;
  acciones: AccionUx[];
}

/** Lo que la pantalla sabe para armar las salidas. */
export interface ContextoUx {
  rutas: RutasDeAyuda;
  /** El total que se facturó (para el título y el WhatsApp). */
  total?: number | null;
  formatear?: (n: number) => string;
  /** Enlaces del comprobante emitido, si la pantalla los tiene. */
  pdfHref?: string | null;
  detalleHref?: string | null;
  whatsappHref?: string | null;
}

/** Lo que se traduce: lo que contestó el motor, o un error de la validación previa. */
export type EntradaUx =
  | { tipo: "resultado"; r: ResultadoEmisionManual }
  | { tipo: "error"; error: string }
  | { tipo: "sin-regimen-a" }
  | { tipo: "sin-configurar" };

/** El texto para avisarle al contador que falta el régimen de Factura A (sin datos sensibles). */
export const TEXTO_AVISO_AL_CONTADOR =
  "Hola, para hacer Factura A desde el sistema necesito saber qué Factura A me asignó ARCA (A común, A con leyenda o M). ¿Me lo confirmás?";

/**
 * Saca la jerga interna de un texto visible. PURA. «(RG 5700)» y «RG 1415» desaparecen; «homologación»
 * pasa a «modo de prueba»; «Soporte GSG» a «nuestro equipo»; «WSFE»/«tenant» no se muestran.
 */
export function sinJerga(texto: string): string {
  return texto
    .replace(/\s*\((?:RG|R\.G\.)\s*[\d./]+[^)]*\)/gi, "")
    .replace(/\s*(?:según\s+(?:la\s+)?)?\bRG\s*\d[\d./]*/gi, "")
    .replace(/\bambiente de homologaci[oó]n\b/gi, "modo de prueba")
    .replace(/\(homologaci[oó]n\)/gi, "(modo de prueba)")
    .replace(/\ben homologaci[oó]n\b/gi, "en modo de prueba")
    .replace(/\bhomologaci[oó]n\b/gi, "modo de prueba")
    .replace(/\bSoporte (?:de )?GSG\b/g, "nuestro equipo")
    .replace(/\bsoporte (?:de )?GSG\b/g, "nuestro equipo")
    .replace(/\bWSFE(?:v1)?\b\s*/g, "")
    .replace(/\btenants?\b/gi, "negocio")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,:;])/g, "$1")
    .trim();
}

const enlace = (id: IdAccionUx, etiqueta: string, href: string | null | undefined, principal = false): AccionUx[] =>
  href ? [{ id, etiqueta, href, ...(principal ? { principal } : {}) }] : [];

function accionesDelComprobante(c: ContextoUx): AccionUx[] {
  return [
    ...enlace("whatsapp", "Mandar por WhatsApp", c.whatsappHref, true),
    ...enlace("pdf", "Descargar PDF", c.pdfHref),
    ...enlace("detalle", "Ver detalle", c.detalleHref),
  ];
}

function nombreDeLaFactura(e: Extract<EstadoEmision, { estado: "autorizada" }>): string {
  return `Factura${e.letra ? ` ${e.letra}` : ""}${e.numero ? ` ${e.numero}` : ""}`;
}

function sinRegimenA(c: ContextoUx, yaRechazada: boolean): EstadoUx {
  return {
    clave: "sin-regimen-a",
    tono: "atencion",
    titulo: "Falta un dato para la Factura A",
    texto:
      "Para hacer Factura A falta saber qué te asignó ARCA (A común, A con leyenda o M)." +
      (yaRechazada ? " Esta no salió; cuando esté el dato, emitila de nuevo." : " Mientras tanto podés hacer Factura B a consumidor final."),
    acciones: [
      { id: "avisar-contador", etiqueta: "Avisar a mi contador", href: enlaceDeWhatsApp(TEXTO_AVISO_AL_CONTADOR) },
      { id: "factura-b", etiqueta: "Hacer Factura B", principal: true },
      ...(yaRechazada ? enlace("comprobantes", "Ver comprobantes", c.rutas.comprobantes) : []),
    ],
  };
}

function faltaConfigurar(c: ContextoUx, texto?: string): EstadoUx {
  return {
    clave: "falta-configurar",
    tono: "atencion",
    titulo: "Falta terminar la puesta a punto",
    texto: texto ?? "Antes de facturar hay que terminar la puesta a punto.",
    acciones: enlace("puesta-a-punto", "Completar ahora", c.rutas.datosFiscales, true),
  };
}

function tope(c: ContextoUx, texto: string): EstadoUx {
  return {
    clave: "tope-mensual",
    tono: "atencion",
    titulo: "Llegaste al tope del mes",
    texto: texto || "Este mes ya facturaste el máximo de tu plan.",
    acciones: [...enlace("planes", "Ver planes", c.rutas.plan, true), ...enlace("comprobantes", "Ver comprobantes", c.rutas.comprobantes)],
  };
}

function arcaNoResponde(): EstadoUx {
  return {
    clave: "arca-no-responde",
    tono: "error",
    titulo: "ARCA no responde",
    texto: "ARCA está lento; probá de nuevo en unos minutos.",
    acciones: [{ id: "reintentar", etiqueta: "Probar de nuevo", principal: true }],
  };
}

/** Un error en texto (de la validación o del motor) → el estado que le toca. PURA. */
export function estadoDelError(error: string, c: ContextoUx): EstadoUx {
  const t = error.toLowerCase();
  const limpio = sinJerga(error);
  if (/qué factura a te asignó|r[eé]gimen de factura a/.test(t)) return sinRegimenA(c, true);
  if (/facturación electrónica asignada|datos fiscales del negocio|alta fiscal|perfil fiscal/.test(t)) {
    return faltaConfigurar(c, `Antes de facturar hay que terminar la puesta a punto: ${limpio.charAt(0).toLowerCase()}${limpio.slice(1)}`);
  }
  if (/certificad|token|credencial|autenticar/.test(t)) {
    return faltaConfigurar(c, "ARCA no reconoció la conexión del negocio. La factura queda guardada: sale cuando se arregle la conexión.");
  }
  if (/tope|límite de facturas|limite de facturas/.test(t)) return tope(c, limpio);
  if (/no se pudo|probá de nuevo|proba de nuevo|no respond|timeout|tiempo de espera/.test(t)) return arcaNoResponde();
  const comprador = /identificar al comprador|cuit|cuil|dni|documento|domicilio|inscripto|condici[oó]n.*iva|receptor|nombre/.test(t);
  if (/^arca rechazó/.test(t)) {
    return {
      clave: "rechazo",
      tono: "error",
      titulo: "ARCA no la aceptó",
      texto: limpio.replace(/^ARCA rechazó la factura:\s*/i, "ARCA no la aceptó: "),
      acciones: [
        { id: comprador ? "corregir-comprador" : "corregir-detalle", etiqueta: "Corregir", principal: true },
        { id: "reintentar", etiqueta: "Probar de nuevo" },
      ],
    };
  }
  return {
    clave: "falta-un-dato",
    tono: "error",
    titulo: comprador ? "Falta un dato del comprador" : "Falta un dato",
    texto: limpio,
    acciones: [{ id: comprador ? "corregir-comprador" : "corregir-detalle", etiqueta: "Corregir", principal: true }],
  };
}

/** Lo que contestó el motor o la validación → el estado en criollo, con sus acciones. PURA. */
export function estadoUx(entrada: EntradaUx, c: ContextoUx): EstadoUx {
  if (entrada.tipo === "sin-regimen-a") return sinRegimenA(c, false);
  if (entrada.tipo === "sin-configurar") return faltaConfigurar(c);
  if (entrada.tipo === "error") return estadoDelError(entrada.error, c);
  const r = entrada.r;
  if (!r.ok) {
    if (r.estado?.estado === "rechazada") return estadoDeRechazo(r.estado, c);
    return estadoDelError(r.error, c);
  }
  const e = r.estado;
  const monto = c.total != null && c.formatear ? ` · ${c.formatear(c.total)}` : "";
  if (e.estado === "autorizada") {
    if (e.dePrueba) {
      return {
        clave: "modo-de-prueba",
        tono: "prueba",
        titulo: `${nombreDeLaFactura(e)}${monto}`,
        texto: "Factura de prueba, sin validez fiscal.",
        acciones: [
          ...accionesDelComprobante(c),
          ...enlace("pasar-a-real", "Pasar a facturar en serio", c.rutas.datosFiscales),
        ],
      };
    }
    return {
      clave: "emitido",
      tono: "ok",
      titulo: `${nombreDeLaFactura(e)}${monto}`,
      texto: `Listo: ${nombreDeLaFactura(e)} autorizada.`,
      acciones: accionesDelComprobante(c),
    };
  }
  if (e.estado === "pendiente") {
    if (e.motivo === "apagada") {
      return faltaConfigurar(c, "La factura quedó guardada: sale cuando termines la conexión con ARCA en la puesta a punto.");
    }
    return {
      clave: "pendiente",
      tono: "atencion",
      titulo: "Quedó guardada, esperando a ARCA",
      texto: `ARCA está lento: la factura sale apenas responda. Si en ${e.ventanaDias} días no salió, hay que volver a emitirla.`,
      acciones: [...enlace("comprobantes", "Ver comprobantes", c.rutas.comprobantes, true), ...enlace("detalle", "Ver detalle", c.detalleHref)],
    };
  }
  return estadoDeRechazo(e, c);
}

function estadoDeRechazo(e: Extract<EstadoEmision, { estado: "rechazada" }>, c: ContextoUx): EstadoUx {
  if (/qué factura a te asignó|r[eé]gimen/i.test(e.motivo)) return sinRegimenA(c, true);
  const comprador = /cuit|cuil|dni|documento|domicilio|receptor|condici[oó]n/i.test(e.motivo);
  const motivo = sinJerga(e.motivo);
  return {
    clave: "rechazo",
    tono: "error",
    titulo: e.origen === "arca" ? "ARCA no la aceptó" : "No la mandamos a ARCA",
    texto: e.origen === "arca" ? `ARCA no la aceptó: ${motivo}` : `Le falta algo antes de mandarla: ${motivo}`,
    acciones: [
      { id: comprador ? "corregir-comprador" : "corregir-detalle", etiqueta: "Corregir", principal: true },
      { id: "reintentar", etiqueta: "Probar de nuevo" },
      ...enlace("detalle", "Ver detalle", c.detalleHref),
    ],
  };
}
