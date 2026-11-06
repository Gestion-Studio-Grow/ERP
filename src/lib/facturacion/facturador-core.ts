// ============================================================================
// FACTURADOR GUIADO — la lógica pura de la emisión en tres pasos (a quién · qué · confirmar)
// ============================================================================
//
// La usa el componente común `FacturadorGuiado` (src/components/facturacion/), que montan el panel
// de cualquier negocio, la consola del contador y Factoque. Sin red ni base: arma el pedido que
// valida `validarEmision` (facturita-core) y contesta lo que la pantalla muestra ANTES de emitir
// (qué comprobante sale, el neto y el IVA) y DESPUÉS, si algo falla (qué pasó, en criollo, y qué
// tocar para resolverlo).
//
// La letra que se muestra es una VISTA PREVIA: la decide el servidor con `decidirComprobante`, la
// única decisión fiscal del Core. Acá se replica la regla general (RG 1415 / RG 5003) sólo para
// anticiparla; un test la contrasta con `decidirComprobante` para que no se separen.

import { cuitValido, normalizarCuit } from "@/lib/cuit";
import {
  ALICUOTA_ARCA,
  conceptoConFechasDeServicio,
  type AlicuotaFacturita,
  type ConceptoFacturita,
  type CondicionReceptorConCuit,
  type EmisionFacturita,
  type EstadoEmision,
  type EstadoLimite,
} from "@/lib/facturita-core";
import { montosFacturita } from "@/lib/facturita-montos";
import type { CondicionIva } from "@/lib/fiscal";

/** Lo que contesta el motor de emisión manual (src/lib/facturacion/emision-manual.server.ts). */
export type ResultadoEmisionManual =
  | {
      ok: true;
      invoiceId: string;
      /** El tope del plan, si el negocio lo tiene (Factoque); `null` = sin tope. */
      limite: EstadoLimite | null;
      estado: EstadoEmision;
      mensaje: string;
      repetida?: true;
    }
  | { ok: false; error: string; invoiceId?: string; estado?: EstadoEmision };

export type Paso = 1 | 2 | 3;

export const PASOS: readonly { paso: Paso; nombre: string }[] = [
  { paso: 1, nombre: "A quién" },
  { paso: 2, nombre: "Qué" },
  { paso: 3, nombre: "Confirmar" },
];

/** El comprador: consumidor final sin identificar (el caso de todos los días) o identificado. */
export type Comprador =
  | { tipo: "consumidor-final" }
  | {
      tipo: "identificado";
      docTipo: 80 | 86 | 96;
      docNro: string;
      nombre: string;
      /** Sólo con CUIT. */
      condicion: CondicionReceptorConCuit | "";
      domicilio: string;
    };

export interface Borrador {
  comprador: Comprador;
  concepto: ConceptoFacturita;
  descripcion: string;
  /** Como lo escribe la persona: «25.000,50». */
  total: string;
  alicuota: AlicuotaFacturita;
  /** AAAA-MM-DD; sólo con servicios. */
  desde: string;
  hasta: string;
  vencimiento: string;
}

export const CONSUMIDOR_FINAL: Comprador = { tipo: "consumidor-final" };

export function borradorVacio(): Borrador {
  return {
    comprador: CONSUMIDOR_FINAL,
    concepto: "productos",
    descripcion: "",
    total: "",
    alicuota: "21",
    // Vacías a propósito: un período precargado que nadie miró sería un dato falso en la factura.
    desde: "",
    hasta: "",
    vencimiento: "",
  };
}

/** «25.000,50» → 25000.5; «25000.5» también. Lo que no es un número → NaN. */
export function totalDelTexto(texto: string): number {
  const t = texto.trim().replace(/\s|\$/g, "");
  if (!t) return NaN;
  // Con coma: los puntos son de miles. Sin coma, un único punto con 1 o 2 decimales es el decimal.
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

const SIGLA_DOC: Record<80 | 86 | 96, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI" };

/** Lo que falta del paso «A quién», en criollo; `null` = listo para seguir. */
export function faltaEnComprador(c: Comprador, condicionEmisor: string | null): string | null {
  if (c.tipo === "consumidor-final") return null;
  const nro = c.docNro.trim();
  if (!nro) return `Escribí el ${SIGLA_DOC[c.docTipo]} del comprador.`;
  if (c.docTipo === 96) {
    if (!/^\d{7,8}$/.test(nro.replace(/\D/g, ""))) return "El DNI lleva 7 u 8 números.";
  } else if (!cuitValido(normalizarCuit(nro))) {
    return `El ${SIGLA_DOC[c.docTipo]} no es válido: revisá los 11 números.`;
  }
  if (c.nombre.trim().length < 2) return "Escribí el nombre o la razón social: va impreso en la factura.";
  if (c.docTipo === 80 && c.condicion === "") return "Elegí cómo está inscripto (figura en su constancia de ARCA).";
  if (pideDomicilio(c, condicionEmisor) && c.domicilio.trim().length < 5) {
    return "Escribí el domicilio: le corresponde Factura A, y la A lo lleva impreso.";
  }
  return null;
}

/** El inscripto que le factura a un inscripto o monotributista emite A, que lleva el domicilio. */
export function pideDomicilio(c: Comprador, condicionEmisor: string | null): boolean {
  return (
    c.tipo === "identificado" &&
    condicionEmisor === "RESPONSABLE_INSCRIPTO" &&
    c.docTipo === 80 &&
    (c.condicion === "RESPONSABLE_INSCRIPTO" || c.condicion === "MONOTRIBUTO")
  );
}

/** Lo que falta del paso «Qué»; `null` = listo para confirmar. */
export function faltaEnQue(b: Borrador): string | null {
  if (!b.descripcion.trim()) return "Contá qué vendiste: va como detalle en la factura.";
  const total = totalDelTexto(b.total);
  if (!(total > 0)) return "Escribí el total, en pesos.";
  if (conceptoConFechasDeServicio(b.concepto) && (!b.desde || !b.hasta || !b.vencimiento)) {
    return "Con servicios, ARCA pide las tres fechas: desde, hasta y hasta cuándo te lo pagan.";
  }
  if (b.desde && b.hasta && b.hasta < b.desde) return "El servicio no puede terminar antes de empezar.";
  return null;
}

/** El pedido que va al servidor (el mismo de siempre: `EmisionFacturita`). */
export function pedidoDelBorrador(b: Borrador, condicionEmisor: string | null): EmisionFacturita {
  const servicio = conceptoConFechasDeServicio(b.concepto);
  const c = b.comprador;
  return {
    descripcion: b.descripcion.trim(),
    total: totalDelTexto(b.total),
    concepto: b.concepto,
    ...(servicio ? { servicioDesde: b.desde, servicioHasta: b.hasta, vencimientoPago: b.vencimiento } : {}),
    ...(condicionEmisor === "RESPONSABLE_INSCRIPTO" ? { alicuota: b.alicuota } : {}),
    ...(c.tipo === "identificado"
      ? {
          docTipo: c.docTipo,
          docNro: c.docNro.trim(),
          nombreReceptor: c.nombre.trim(),
          ...(c.docTipo === 80 && c.condicion ? { condicionReceptor: c.condicion } : {}),
          ...(c.docTipo === 80 && c.domicilio.trim() ? { domicilioReceptor: c.domicilio.trim() } : {}),
        }
      : {}),
  };
}

/**
 * La letra que va a salir (VISTA PREVIA; decide el servidor). Emisor monotributista o exento → C;
 * inscripto → A al inscripto o monotributista, B a todos los demás. Sin perfil fiscal → `null`.
 */
export function letraPrevista(condicionEmisor: string | null, c: Comprador): "A" | "B" | "C" | null {
  if (condicionEmisor === "MONOTRIBUTO" || condicionEmisor === "EXENTO") return "C";
  if (condicionEmisor !== "RESPONSABLE_INSCRIPTO") return null;
  if (c.tipo === "identificado" && c.docTipo === 80 && (c.condicion === "RESPONSABLE_INSCRIPTO" || c.condicion === "MONOTRIBUTO")) {
    return "A";
  }
  return "B";
}

/** «Consumidor final» o «Kiosco Sur SRL · CUIT 30-71234567-1». */
export function nombreDelComprador(c: Comprador): string {
  if (c.tipo === "consumidor-final") return "Consumidor final";
  const nro = c.docTipo === 96 ? c.docNro.replace(/\D/g, "") : formatoCuit(c.docNro);
  return `${c.nombre.trim() || "Sin nombre"} · ${SIGLA_DOC[c.docTipo]} ${nro}`;
}

function formatoCuit(v: string): string {
  const d = normalizarCuit(v);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : v.trim();
}

export interface Previa {
  letra: "A" | "B" | "C" | null;
  neto: number;
  iva: number;
  total: number;
  /** El inscripto discrimina el IVA (A y B); la C no. */
  discrimina: boolean;
}

/** Neto, IVA y total que va a llevar el comprobante, con la MISMA cuenta que usa el servidor. */
export function previa(b: Borrador, condicionEmisor: string | null): Previa | null {
  const total = totalDelTexto(b.total);
  if (!(total > 0) || condicionEmisor === null) return null;
  const m = montosFacturita(condicionEmisor as CondicionIva, total, ALICUOTA_ARCA[b.alicuota]);
  if (!m.ok) return null;
  const iva = m.iva.reduce((s, x) => s + x.importe, 0);
  return {
    letra: letraPrevista(condicionEmisor, b.comprador),
    neto: m.neto,
    iva: Math.round(iva * 100) / 100,
    total: m.total,
    discrimina: condicionEmisor === "RESPONSABLE_INSCRIPTO",
  };
}

// ---------------------------------------------------------------------------
// Errores en criollo, con la acción que lo resuelve
// ---------------------------------------------------------------------------

export type AccionDeError =
  | { tipo: "paso"; paso: 1 | 2; etiqueta: string }
  | { tipo: "reintentar"; etiqueta: string }
  | { tipo: "enlace"; href: string; etiqueta: string };

export interface ErrorExplicado {
  texto: string;
  accion: AccionDeError | null;
}

/** Las rutas de cada pantalla para las salidas (el panel, la consola y Factoque tienen las suyas). */
export interface RutasDeAyuda {
  /** Donde se cargan el CUIT, el punto de venta y el certificado. */
  datosFiscales: string | null;
  /** Donde se ve la lista de comprobantes (para un pendiente o una rechazada). */
  comprobantes: string | null;
  /** Donde se cambia de plan (sólo Factoque). */
  plan?: string | null;
}

const A_QUIEN = (etiqueta = "Corregir el comprador"): AccionDeError => ({ tipo: "paso", paso: 1, etiqueta });
const QUE = (etiqueta = "Corregir el detalle"): AccionDeError => ({ tipo: "paso", paso: 2, etiqueta });

/**
 * Explica un error de la emisión (de la validación, del sistema o de ARCA) y dice qué tocar.
 * Lo que ARCA contesta viene como «código: mensaje»; se reconoce por palabras, no por una tabla de
 * códigos completa (PROVISIONAL A CONFIRMAR con las respuestas grabadas de homologación, ENG-021).
 */
export function explicarError(error: string, rutas: RutasDeAyuda): ErrorExplicado {
  const t = error.toLowerCase();
  const enlace = (href: string | null | undefined, etiqueta: string): AccionDeError | null =>
    href ? { tipo: "enlace", href, etiqueta } : null;

  if (/qué factura a te asignó/.test(t)) {
    return {
      texto: "Para emitir Factura A falta un dato que carga Soporte GSG: qué Factura A te asignó ARCA (A común, A con leyenda o M). La factura quedó rechazada; cuando esté cargado, emitila de nuevo.",
      accion: enlace(rutas.comprobantes, "Ver los comprobantes"),
    };
  }
  if (/datos fiscales del negocio|alta fiscal|perfil fiscal/.test(t)) {
    return { texto: error, accion: enlace(rutas.datosFiscales, "Cargar los datos fiscales") };
  }
  if (/certificad|token|credencial|autenticar/.test(t)) {
    return {
      texto: "ARCA no reconoció la conexión del negocio (el certificado venció o no está cargado). La factura queda guardada: sale cuando se arregle.",
      accion: enlace(rutas.datosFiscales, "Revisar la conexión con ARCA"),
    };
  }
  if (/tope|límite de facturas|comerciante/.test(t)) {
    return { texto: error, accion: enlace(rutas.plan, "Ver los planes") };
  }
  if (/identificar al comprador|cuit|cuil|dni|documento|domicilio|inscripto|condici[oó]n.*iva|receptor/.test(t)) {
    return { texto: error, accion: A_QUIEN() };
  }
  if (/fecha|vencimiento|servicio/.test(t)) {
    return { texto: error, accion: QUE("Corregir las fechas") };
  }
  if (/descripci|detalle|total|importe|alícuota|alicuota/.test(t)) {
    return { texto: error, accion: QUE() };
  }
  if (/probá de nuevo|recargá|no se pudo/.test(t)) {
    return { texto: error, accion: { tipo: "reintentar", etiqueta: "Probar de nuevo" } };
  }
  return { texto: error, accion: enlace(rutas.comprobantes, "Ver los comprobantes") };
}

// ---------------------------------------------------------------------------
// Los últimos compradores (se recuerdan en el dispositivo, nunca en el servidor)
// ---------------------------------------------------------------------------

export const MAX_RECIENTES = 5;

type Identificado = Extract<Comprador, { tipo: "identificado" }>;

/** Suma el comprador al frente de la lista, sin repetir el mismo documento. */
export function sumarReciente(lista: readonly Identificado[], c: Comprador): Identificado[] {
  if (c.tipo !== "identificado") return [...lista];
  const clave = (x: Identificado) => `${x.docTipo}:${x.docNro.replace(/\D/g, "")}`;
  const limpio: Identificado = { ...c, docNro: c.docNro.trim(), nombre: c.nombre.trim(), domicilio: c.domicilio.trim() };
  return [limpio, ...lista.filter((x) => clave(x) !== clave(limpio))].slice(0, MAX_RECIENTES);
}

/** Lee la lista guardada sin confiar en ella (la puede haber tocado cualquiera). */
export function leerRecientes(crudo: string | null): Identificado[] {
  if (!crudo) return [];
  try {
    const v = JSON.parse(crudo) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x): x is Identificado =>
          !!x &&
          typeof x === "object" &&
          (x as Identificado).tipo === "identificado" &&
          [80, 86, 96].includes((x as Identificado).docTipo) &&
          typeof (x as Identificado).docNro === "string" &&
          typeof (x as Identificado).nombre === "string",
      )
      .map((x) => ({
        tipo: "identificado" as const,
        docTipo: x.docTipo,
        docNro: x.docNro.slice(0, 20),
        nombre: x.nombre.slice(0, 120),
        condicion: (["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"] as const).find((c) => c === x.condicion) ?? ("" as const),
        domicilio: typeof x.domicilio === "string" ? x.domicilio.slice(0, 200) : "",
      }))
      .slice(0, MAX_RECIENTES);
  } catch {
    return [];
  }
}
