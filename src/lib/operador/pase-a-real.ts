// ============================================================================
// PASE A FACTURACIÓN REAL (y la vuelta a pruebas) — núcleo PURO (R2-F5)
// ============================================================================
//
// Reemplaza la sentencia a mano de 30-LANZAMIENTO/implementacion/07 §3.4 (UPDATE "Tenant" SET
// "arcaHomologacion" = false ...). Pasar un negocio a real es una promesa fiscal: desde ese
// momento cada venta sale con CAE de verdad. Por eso este módulo decide, con la ficha fiscal
// leída de la base, si se puede y, si no, por qué, en castellano.
//
// Pasar a real exige, todo junto:
//   1. CUIT del negocio válido.            2. Punto de venta de ARCA (1 a 99999).
//   3. Certificado de PRODUCCIÓN del mismo CUIT. La delegación fiscal NO alcanza: la emisión firma
//      siempre con el certificado propio del negocio (`credencialParaTenant`) y ningún código de
//      emisión usa DelegacionFiscal; si la tiene, se muestra sólo como aviso.
//   4. Condición frente al IVA que emite (Responsable inscripto, Monotributo o Exento).
//   5. La plataforma en ARCA_MODO=real (si no, nada sale con validez fiscal).
//   6. Ningún comprobante de la etapa de pruebas en la tabla de facturas: ni esperando CAE (PENDING)
//      ni con su envío a ARCA abierto (el ambiente se decide AL DESPACHAR, con la marca de hoy del
//      negocio: src/lib/arca-dispatch.ts, `leerConfigFiscalPrisma`), ni ya autorizado en pruebas
//      (Invoice no guarda su ambiente: se mezclaría con los reales en la numeración, el impreso y
//      el libro IVA). Autorizado en pruebas = con CAE desde que empezó la etapa de pruebas de hoy:
//      la última vuelta a pruebas registrada, o desde siempre si nunca pasó a real por acá.
// Y además: escribir el nombre corto (slug) del negocio; CH sólo con el dueño de GSG; y que la
// ficha fiscal sea la misma que el operador vio (huella), si no, no se hace nada.
//
// Volver a pruebas NUNCA se bloquea por datos: es la salida de emergencia (07 §5 R1). Delante sólo
// tiene la guardia de sesión común a toda acción de la consola (CH: el dueño de GSG).
//
// Sin Prisma, sin React, sin env, sin Node: lo usan la ficha (para mostrar) y la acción (para
// decidir), así la pantalla y el servidor dicen lo mismo.

import { cuitValido, normalizarCuit } from "@/lib/cuit";
import { fmtCuit } from "@/components/ui/format";
import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import type { ModoArcaPlataforma } from "./checklist-apertura";

/** De qué entorno de ARCA es el certificado, según quién lo firmó. */
export type EntornoDelCertificado = "produccion" | "homologacion" | "desconocido";

/** El certificado del negocio, sin material sensible. */
export interface CredencialDelPase {
  /** CUIT del subject del certificado (`TenantFiscalCredential.certCuit`). */
  certCuit: string;
  entorno: EntornoDelCertificado;
  /** Quién lo firmó, dicho para el operador ("Computadores Test · AFIP"), o null si no se pudo abrir. */
  emisor: string | null;
  /** Por qué no se pudo abrir (sin secretos), o null. */
  error: string | null;
  /** `TenantFiscalCredential.updatedAt` en ISO: si lo rotan, la huella cambia. */
  actualizada: string;
}

export type EstadoDeDelegacion = "declarada" | "verificada" | "fallida" | "revocada";

/** La delegación fiscal (servicio wsfe) del negocio, si tiene. */
export interface DelegacionDelPase {
  estado: EstadoDeDelegacion;
  cuitRepresentado: string;
  /** ISO, o null si nunca se verificó. */
  verificadaEn: string | null;
}

/**
 * Los comprobantes que la etapa de pruebas dejó en la tabla de facturas, contados en la base
 * (pase-a-real.server.ts) y vueltos a contar bajo el bloqueo del pase.
 */
export interface ComprobantesDePrueba {
  /** Facturas PENDING: se pedirían en el ambiente del negocio al despacharlas. */
  esperandoCae: number;
  /** Envíos de factura a ARCA sin cerrar (OutboxEvent InvoiceCreated con processedAt nulo). */
  enviosAbiertos: number;
  /** Facturas con CAE autorizadas desde `desde` (o desde siempre): de pruebas. */
  autorizados: number;
  /** ISO de la última vuelta a pruebas registrada, o null si nunca volvió (todo lo autorizado es de pruebas). */
  desde: string | null;
}

/** La ficha fiscal del negocio tal como está en la base. */
export interface FichaFiscalDelPase {
  slug: string;
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
  /** true = pruebas (homologación); false = real. */
  arcaHomologacion: boolean;
  arcaCondicionIva: string | null;
  credencial: CredencialDelPase | null;
  delegacion: DelegacionDelPase | null;
  /** `ARCA_MODO` de la plataforma (modoDesdeEnv). */
  modoArca: ModoArcaPlataforma;
  comprobantesDePrueba: ComprobantesDePrueba;
}

export type IdPrecondicion = "cuit" | "puntoVenta" | "credencial" | "condicionIva" | "modoArca" | "comprobantesDePrueba";

export interface Precondicion {
  id: IdPrecondicion;
  titulo: string;
  ok: boolean;
  /** Si está bien, qué se ve; si no, qué falta y cómo seguir. */
  detalle: string;
}

export type AccionDePase = "pasar-a-real" | "volver-a-pruebas";

export interface PedidoDePase {
  accion: string;
  /** La huella de la ficha que el operador tenía en pantalla. */
  huellaVista: string;
  slugTipeado: string;
}

export interface OperadorDelPase {
  nombre: string;
  esDuenio: boolean;
}

export type DecisionDePase =
  | { tipo: "aplicar"; accion: AccionDePase; homologacion: boolean }
  | { tipo: "sin-cambios"; accion: AccionDePase; motivo: string }
  | { tipo: "rechazado"; motivo: string };

export const PUNTO_DE_VENTA_MAXIMO = 99_999;

/** Las condiciones frente al IVA que emiten comprobantes (igual que construirPerfilFiscal, src/lib/fiscal.ts). */
const CONDICIONES_QUE_EMITEN: Readonly<Record<string, string>> = {
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
};

const NOMBRE_DEL_MODO: Readonly<Record<ModoArcaPlataforma, string>> = {
  stub: "apagado (simulado)",
  homologacion: "pruebas (homologación)",
  real: "real",
};

export const FICHA_CAMBIO_MIENTRAS_MIRABAS =
  "La ficha fiscal del negocio cambió mientras la mirabas (CUIT, punto de venta, condición de IVA, certificado o " +
  "delegación). No se hizo nada: revisala y volvé a confirmar.";

/** Remite a la guía de salida en vivo (30-LANZAMIENTO/implementacion/07-salida-en-vivo.md, punto 1.5). */
const LIMPIAR_DATOS_DE_PRUEBA =
  "limpiar los datos de prueba (sólo movimientos, nunca productos, clientes ni servicios: guía de salida en vivo, punto 1.5)";

export const MOTIVO_CANDADO_CH =
  "Es un cliente vivo en producción: su facturación sólo la cambia el dueño de GSG. No se hizo nada.";

/**
 * El entorno del certificado según su emisor. ARCA firma los de homologación con la autoridad
 * «Computadores Test» y los de producción con «Computadores», ambas de la organización AFIP.
 * PROVISIONAL A CONFIRMAR contra un certificado productivo real: si ARCA firma con otro nombre,
 * esto contesta "desconocido" y el pase se niega diciendo el emisor (falla cerrada), nunca al revés.
 */
export function entornoDelEmisor(emisor: { cn: string | null; o: string | null }): EntornoDelCertificado {
  const cn = (emisor.cn ?? "").trim().toLowerCase();
  const o = (emisor.o ?? "").trim().toLowerCase();
  if (o !== "afip" && o !== "arca") return "desconocido";
  if (/\btest\b|homolog/.test(cn)) return "homologacion";
  if (cn === "computadores") return "produccion";
  return "desconocido";
}

function cuitDelNegocio(f: FichaFiscalDelPase): string | null {
  const c = normalizarCuit(f.arcaCuit ?? "");
  return c !== "" && cuitValido(c) ? c : null;
}

const FECHA_AR = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** dd/mm/aaaa en hora de Argentina (una vuelta a las 22 h no puede figurar como del día siguiente). */
function fecha(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : FECHA_AR.format(new Date(t));
}

function cuantos(n: number, uno: string, varios: string): string {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`;
}

/** La delegación, si hay, sólo se menciona: hoy la emisión no la usa (ver cabecera, condición 3). */
function avisoDeDelegacion(d: DelegacionDelPase | null): string {
  return d
    ? ` Hay una delegación cargada («${d.estado}»), pero hoy no sirve para facturar: la emisión firma con el certificado del negocio.`
    : "";
}

function precondicionDeCredencial(f: FichaFiscalDelPase, cuit: string | null): Precondicion {
  const titulo = "Certificado de producción de ARCA";
  const c = f.credencial;
  let problema: string;
  if (!c) {
    problema = "Falta el certificado de producción de ARCA del CUIT del negocio.";
  } else if (!cuit || normalizarCuit(c.certCuit) !== cuit) {
    problema = `El certificado es del CUIT ${fmtCuit(c.certCuit)}${cuit ? ` y el negocio es del CUIT ${fmtCuit(cuit)}` : ""}: tiene que ser del mismo CUIT.`;
  } else if (c.entorno === "produccion") {
    return {
      id: "credencial",
      titulo,
      ok: true,
      detalle: `Certificado de producción del CUIT ${fmtCuit(c.certCuit)}${c.emisor ? ` (lo firmó ${c.emisor})` : ""}.`,
    };
  } else if (c.entorno === "homologacion") {
    problema = `El certificado cargado es de pruebas${c.emisor ? ` (lo firmó ${c.emisor})` : ""}: cargá el de producción del mismo CUIT.`;
  } else if (c.error) {
    problema = `No se pudo abrir el certificado para ver quién lo firmó: ${c.error}`;
  } else {
    problema = `No se pudo confirmar que el certificado sea de producción de ARCA${c.emisor ? ` (lo firmó ${c.emisor})` : ""}.`;
  }
  return { id: "credencial", titulo, ok: false, detalle: problema + avisoDeDelegacion(f.delegacion) };
}

function precondicionDeComprobantes(c: ComprobantesDePrueba): Precondicion {
  const titulo = "Sin comprobantes de la etapa de pruebas";
  const partes: string[] = [];
  if (c.esperandoCae > 0) {
    const envios =
      c.enviosAbiertos > 0 ? ` (${cuantos(c.enviosAbiertos, "envío a ARCA sin cerrar", "envíos a ARCA sin cerrar")})` : "";
    partes.push(
      `Hay ${cuantos(c.esperandoCae, "comprobante", "comprobantes")} de la etapa de pruebas esperando CAE${envios}; ` +
        "si pasás a real saldrían con validez fiscal, con los datos cargados en pruebas.",
    );
  } else if (c.enviosAbiertos > 0) {
    partes.push(
      `Hay ${cuantos(c.enviosAbiertos, "envío a ARCA", "envíos a ARCA")} de la etapa de pruebas sin cerrar; ` +
        "si pasás a real se despacharían en producción.",
    );
  }
  if (c.autorizados > 0) {
    const desde = c.desde ? ` desde que volvió a pruebas el ${fecha(c.desde)}` : "";
    partes.push(
      `Hay ${cuantos(c.autorizados, "comprobante autorizado", "comprobantes autorizados")} en pruebas${desde}, con CAE ` +
        "de homologación: si pasa a real se mezclan con los reales (chocan con la numeración de ARCA, se reimprimen " +
        "y entran al libro IVA). Un comprobante con CAE no se borra ni se edita, así que " +
        `${LIMPIAR_DATOS_DE_PRUEBA} no los saca: hasta que cada comprobante guarde en qué ambiente se autorizó, ` +
        "este negocio no pasa a real desde acá. Avisale al dueño de GSG.",
    );
  } else if (partes.length > 0) {
    partes.push(`Sacalos al ${LIMPIAR_DATOS_DE_PRUEBA} y volvé a intentar.`);
  }
  return partes.length === 0
    ? { id: "comprobantesDePrueba", titulo, ok: true, detalle: "No quedan comprobantes de la etapa de pruebas." }
    : { id: "comprobantesDePrueba", titulo, ok: false, detalle: partes.join(" ") };
}

/** Las seis condiciones para pasar a real, en el orden en que se cargan en la ficha. */
export function precondicionesDelPase(f: FichaFiscalDelPase): Precondicion[] {
  const cuit = cuitDelNegocio(f);
  const cuitCargado = normalizarCuit(f.arcaCuit ?? "") !== "";
  const pv = f.arcaPuntoVenta;
  const pvOk = pv != null && Number.isInteger(pv) && pv >= 1 && pv <= PUNTO_DE_VENTA_MAXIMO;
  const iva = (f.arcaCondicionIva ?? "").trim();
  const ivaNombre = CONDICIONES_QUE_EMITEN[iva];
  return [
    {
      id: "cuit",
      titulo: "CUIT del negocio",
      ok: cuit !== null,
      detalle: cuit
        ? `CUIT ${fmtCuit(cuit)}.`
        : cuitCargado
          ? "El CUIT cargado no es válido (el dígito verificador no da): corregilo en la ficha."
          : "Falta el CUIT del negocio.",
    },
    {
      id: "puntoVenta",
      titulo: "Punto de venta de ARCA",
      ok: pvOk,
      detalle: pvOk
        ? `Punto de venta ${pv}.`
        : pv == null
          ? "Falta el punto de venta que ARCA habilitó para este CUIT."
          : `El punto de venta tiene que ser un número entero entre 1 y ${PUNTO_DE_VENTA_MAXIMO}.`,
    },
    precondicionDeCredencial(f, cuit),
    {
      id: "condicionIva",
      titulo: "Condición frente al IVA",
      ok: !!ivaNombre,
      detalle: ivaNombre
        ? `${ivaNombre}.`
        : iva === ""
          ? "Falta la condición del negocio frente al IVA."
          : iva === "CONSUMIDOR_FINAL"
            ? "Figura como consumidor final, que no emite facturas: tiene que ser Responsable inscripto, Monotributo o Exento."
            : `«${iva}» no es una condición frente al IVA conocida.`,
    },
    {
      id: "modoArca",
      titulo: "ARCA de la plataforma en real",
      ok: f.modoArca === "real",
      detalle:
        f.modoArca === "real"
          ? "La plataforma factura en real."
          : `La plataforma está en modo ${NOMBRE_DEL_MODO[f.modoArca]}: aunque el negocio pase, nada saldría con validez ` +
            "fiscal. Ese modo lo cambia sólo el dueño de GSG.",
    },
    precondicionDeComprobantes(f.comprobantesDePrueba),
  ];
}

/**
 * La huella de la ficha fiscal: si cualquiera de estos datos cambia entre que el operador mira y
 * confirma, el pase no se hace. Es el texto tal cual (no un resumen): comparar no puede fallar.
 */
export function huellaDeLaFicha(f: FichaFiscalDelPase): string {
  const c = f.credencial;
  const d = f.delegacion;
  return [
    "v1",
    normalizarCuit(f.arcaCuit ?? ""),
    f.arcaPuntoVenta ?? "",
    f.arcaHomologacion ? "pruebas" : "real",
    (f.arcaCondicionIva ?? "").trim(),
    c ? `${normalizarCuit(c.certCuit)}:${c.entorno}:${c.actualizada}` : "-",
    d ? `${d.estado}:${normalizarCuit(d.cuitRepresentado)}:${d.verificadaEn ?? ""}` : "-",
  ].join("|");
}

function mismoSlug(tipeado: string, slug: string): boolean {
  return tipeado.trim().toLowerCase() === slug.trim().toLowerCase() && slug.trim() !== "";
}

/** ¿Se hace, no hace falta, o se niega (y por qué)? */
export function decidirPase(f: FichaFiscalDelPase, pedido: PedidoDePase, operador: OperadorDelPase): DecisionDePase {
  if (pedido.accion === "volver-a-pruebas") {
    return f.arcaHomologacion
      ? { tipo: "sin-cambios", accion: "volver-a-pruebas", motivo: "Ya estaba facturando en pruebas: no había nada que cambiar." }
      : { tipo: "aplicar", accion: "volver-a-pruebas", homologacion: true };
  }
  if (pedido.accion !== "pasar-a-real") {
    return { tipo: "rechazado", motivo: "No se entendió qué había que hacer. No se hizo nada." };
  }
  if (!f.arcaHomologacion) {
    return { tipo: "sin-cambios", accion: "pasar-a-real", motivo: "Ya estaba facturando en real: no había nada que cambiar." };
  }
  if (requiereOkDelDuenio(f.slug) && !operador.esDuenio) return { tipo: "rechazado", motivo: MOTIVO_CANDADO_CH };
  if (!mismoSlug(pedido.slugTipeado, f.slug)) {
    return {
      tipo: "rechazado",
      motivo: `Para confirmar, escribí exactamente el nombre corto del negocio («${f.slug}»). No se hizo nada.`,
    };
  }
  const faltan = precondicionesDelPase(f).filter((p) => !p.ok);
  if (faltan.length > 0) {
    return {
      tipo: "rechazado",
      motivo: `No se puede pasar a facturación real. ${faltan.map((p) => p.detalle).join(" ")} No se hizo nada.`,
    };
  }
  if (pedido.huellaVista !== huellaDeLaFicha(f)) return { tipo: "rechazado", motivo: FICHA_CAMBIO_MIENTRAS_MIRABAS };
  return { tipo: "aplicar", accion: "pasar-a-real", homologacion: false };
}

/**
 * Lo que queda en AuditLog.changes: qué se cambió, con qué respaldo, en qué modo y cuántos
 * comprobantes de la etapa de pruebas había (el conteo con el que se decidió). Sin material del
 * certificado (sólo CUIT, entorno y quién lo firmó). `arcaHomologacion.despues` es el dato que usa
 * el impreso para saber desde cuándo vale el ambiente de hoy (src/lib/comprobante-pdf-datos.ts):
 * no cambiar su forma.
 */
export function cambiosParaAuditoria(
  f: FichaFiscalDelPase,
  d: Extract<DecisionDePase, { tipo: "aplicar" }>,
): Record<string, unknown> {
  const cuit = cuitDelNegocio(f);
  return {
    accion: d.accion,
    arcaHomologacion: { antes: f.arcaHomologacion, despues: d.homologacion },
    arcaCuit: cuit ?? f.arcaCuit,
    arcaPuntoVenta: f.arcaPuntoVenta,
    arcaCondicionIva: f.arcaCondicionIva,
    respaldo: f.credencial
      ? { tipo: "certificado", certCuit: f.credencial.certCuit, entorno: f.credencial.entorno, emisor: f.credencial.emisor }
      : null,
    comprobantesDePrueba: { ...f.comprobantesDePrueba },
    modoArca: f.modoArca,
    huella: huellaDeLaFicha(f),
  };
}
