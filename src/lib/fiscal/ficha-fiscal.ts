/**
 * FICHA FISCAL DEL CLIENTE (R1-F5): qué se guarda y con qué se decide su factura. PURO.
 *
 * La ficha lleva lo que la factura copia del comprador: documento (CUIT, CUIL o DNI), razón
 * social, condición frente al IVA y domicilio (columnas de `Client`, prisma/schema.prisma:650-655).
 * Se valida SIN INVENTAR: lo que no se cargó queda vacío y nunca se completa con otro dato (el
 * nombre de la ficha no es la razón social, un CUIT sin condición no es "consumidor final").
 * Cuando falta algo para facturar, lo dice la decisión única de la letra (`decidirComprobante`).
 *
 * La usan la acción que guarda la ficha (`guardarFichaFiscal`, src/lib/client-actions.ts) y
 * Ventas (`puedeFacturarVenta`, src/app/admin/(dashboard)/ventas/factura.ts). No importa Prisma
 * ni nada de servidor: la alcanza un componente de cliente.
 */

import { validarCuit } from "./cuit";
import {
  CONDICION_IVA_RECEPTOR_ID,
  DOC_TIPO,
  decidirComprobante,
  type Decision,
  type Leyenda,
  type ReceptorFiscal,
} from "./decidir-comprobante";

/** Lo que guarda la ficha, tal como va a las columnas de `Client`. */
export interface FichaFiscal {
  docTipo: number | null;
  docNro: string | null;
  razonSocial: string | null;
  condicionIva: string | null;
  domicilio: string | null;
}

/** Lo que llega del formulario, sin tocar. */
export interface FichaFiscalCargada {
  docTipo?: string | number | null;
  docNro?: string | number | null;
  razonSocial?: string | null;
  condicionIva?: string | null;
  domicilio?: string | null;
}

export type ResultadoFicha =
  | { ok: true; ficha: FichaFiscal }
  | { ok: false; campo: keyof FichaFiscal; error: string };

/** Documentos que se cargan en la ficha. Sin documento = consumidor final sin identificar. */
const DOCUMENTOS: Readonly<Record<number, "CUIT" | "CUIL" | "DNI">> = {
  [DOC_TIPO.CUIT]: "CUIT",
  [DOC_TIPO.CUIL]: "CUIL",
  [DOC_TIPO.DNI]: "DNI",
};

/** Condiciones de quien tiene que estar identificado con su CUIT (la A y la B a exento lo piden). */
const CONDICIONES_CON_CUIT: ReadonlySet<string> = new Set([
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "MONOTRIBUTO_SOCIAL",
  "MONOTRIBUTO_PROMOVIDO",
  "EXENTO",
]);

/**
 * Condiciones que reciben Factura A de un inscripto (RG 5616: receptores 1, 6, 13 y 16). La A
 * lleva impreso el domicilio del comprador (RG 1415, Anexo II), así que con estas se pide.
 */
const CONDICIONES_QUE_RECIBEN_A: ReadonlySet<string> = new Set([
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "MONOTRIBUTO_SOCIAL",
  "MONOTRIBUTO_PROMOVIDO",
]);

export const LARGO_MAXIMO_RAZON_SOCIAL = 120;
export const LARGO_MAXIMO_DOMICILIO = 200;

const texto = (v: string | number | null | undefined) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));

/**
 * Valida la ficha fiscal que se carga a mano. Devuelve lo que se guarda (normalizado: CUIT sin
 * guiones, DNI sin puntos) o el primer dato que hay que corregir, dicho en castellano llano.
 */
export function validarFichaFiscal(cargada: FichaFiscalCargada): ResultadoFicha {
  const tipoTexto = texto(cargada.docTipo);
  const nroTexto = texto(cargada.docNro);
  const razonSocial = texto(cargada.razonSocial);
  const condicion = texto(cargada.condicionIva);
  const domicilio = texto(cargada.domicilio);

  // Documento: "99" o vacío = sin identificar. Con número, el tipo se elige (no se adivina).
  let docTipo: number | null = null;
  let docNro: string | null = null;
  const tipo = tipoTexto === "" || tipoTexto === String(DOC_TIPO.SIN_IDENTIFICAR) ? null : Number(tipoTexto);
  if (tipo != null && !Object.prototype.hasOwnProperty.call(DOCUMENTOS, tipo)) {
    return { ok: false, campo: "docTipo", error: "Ese tipo de documento no se usa en la ficha: elegí CUIT, CUIL o DNI." };
  }
  if (tipo == null && nroTexto !== "") {
    return { ok: false, campo: "docTipo", error: "Elegí qué documento es ese número: CUIT, CUIL o DNI." };
  }
  if (tipo != null) {
    const nombre = DOCUMENTOS[tipo];
    if (nroTexto === "") return { ok: false, campo: "docNro", error: `Falta el número de ${nombre}.` };
    if (nombre === "DNI") {
      const dni = nroTexto.replace(/[.\s]/g, "");
      if (!/^\d{6,8}$/.test(dni) || Number(dni) === 0) {
        return { ok: false, campo: "docNro", error: "El DNI tiene que tener entre 6 y 8 números." };
      }
      docNro = String(Number(dni));
    } else {
      const r = validarCuit(nroTexto, nombre);
      if (!r.ok) return { ok: false, campo: "docNro", error: r.motivo };
      docNro = r.cuit;
    }
    docTipo = tipo;
  }

  // Condición frente al IVA: una de la tabla de ARCA (RG 5616) o vacía.
  if (condicion !== "" && !Object.prototype.hasOwnProperty.call(CONDICION_IVA_RECEPTOR_ID, condicion)) {
    return { ok: false, campo: "condicionIva", error: "Esa condición frente al IVA no existe: elegí una de la lista." };
  }
  if (docTipo === DOC_TIPO.CUIT && condicion === "") {
    return {
      ok: false,
      campo: "condicionIva",
      error: "Con CUIT hace falta la condición frente al IVA (responsable inscripto, monotributista, exento…): la letra de la factura depende de eso.",
    };
  }
  if (CONDICIONES_CON_CUIT.has(condicion) && docTipo !== DOC_TIPO.CUIT) {
    return { ok: false, campo: "docNro", error: "Con esa condición frente al IVA el cliente se identifica con su CUIT: cargalo." };
  }
  if (docTipo === DOC_TIPO.CUIT && razonSocial === "") {
    return { ok: false, campo: "razonSocial", error: "Falta la razón social: el nombre que figura en la constancia de CUIT." };
  }
  if (CONDICIONES_QUE_RECIBEN_A.has(condicion) && domicilio === "") {
    return {
      ok: false,
      campo: "domicilio",
      error: "Falta el domicilio: con esa condición frente al IVA su factura es A, y la Factura A lleva impreso el domicilio del cliente.",
    };
  }
  if (razonSocial.length > LARGO_MAXIMO_RAZON_SOCIAL) {
    return { ok: false, campo: "razonSocial", error: `La razón social no puede pasar de ${LARGO_MAXIMO_RAZON_SOCIAL} letras.` };
  }
  if (domicilio.length > LARGO_MAXIMO_DOMICILIO) {
    return { ok: false, campo: "domicilio", error: `El domicilio no puede pasar de ${LARGO_MAXIMO_DOMICILIO} letras.` };
  }

  return {
    ok: true,
    ficha: {
      docTipo,
      docNro,
      razonSocial: razonSocial || null,
      condicionIva: condicion || null,
      domicilio: domicilio || null,
    },
  };
}

/** Documentos que ofrece el formulario de la ficha: los que `validarFichaFiscal` acepta. */
export const OPCIONES_DOCUMENTO: readonly { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Sin documento (consumidor final sin identificar)" },
  { valor: String(DOC_TIPO.CUIT), etiqueta: "CUIT" },
  { valor: String(DOC_TIPO.CUIL), etiqueta: "CUIL" },
  { valor: String(DOC_TIPO.DNI), etiqueta: "DNI" },
];

const ETIQUETA_CONDICION: Readonly<Record<string, string>> = {
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTO: "Monotributista",
  MONOTRIBUTO_SOCIAL: "Monotributista social",
  MONOTRIBUTO_PROMOVIDO: "Monotributista promovido (trabajador independiente)",
  EXENTO: "Exento de IVA",
  CONSUMIDOR_FINAL: "Consumidor final",
  IVA_NO_ALCANZADO: "No alcanzado por el IVA",
  IVA_LIBERADO_LEY_19640: "Liberado de IVA (Tierra del Fuego, Ley 19.640)",
  NO_CATEGORIZADO: "Sin categorizar",
  PROVEEDOR_EXTERIOR: "Proveedor del exterior",
  CLIENTE_EXTERIOR: "Cliente del exterior",
};

/** Condiciones frente al IVA que ofrece el formulario: las de la tabla de ARCA (RG 5616), en castellano. */
export const OPCIONES_CONDICION_IVA: readonly { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Sin cargar" },
  ...Object.keys(CONDICION_IVA_RECEPTOR_ID).map((valor) => ({ valor, etiqueta: ETIQUETA_CONDICION[valor] ?? valor })),
];

/** Qué campos cambian entre la ficha guardada y la nueva, con su valor anterior (auditoría). */
export function cambiosDeFicha(
  antes: FichaFiscal,
  despues: FichaFiscal,
): Partial<Record<keyof FichaFiscal, { antes: unknown; despues: unknown }>> {
  const cambios: Partial<Record<keyof FichaFiscal, { antes: unknown; despues: unknown }>> = {};
  for (const campo of ["docTipo", "docNro", "razonSocial", "condicionIva", "domicilio"] as const) {
    if ((antes[campo] ?? null) !== (despues[campo] ?? null)) cambios[campo] = { antes: antes[campo], despues: despues[campo] };
  }
  return cambios;
}

/**
 * El comprador para la decisión, copiado de la ficha. Sin ficha (o sin documento): consumidor
 * final sin identificar, que es lo que ya decide `decidirComprobante` cuando no hay CUIT.
 */
export function receptorDeFicha(ficha: FichaFiscal | null | undefined): ReceptorFiscal {
  if (!ficha) return { condicionIva: null, docTipo: null, docNro: null };
  return { condicionIva: ficha.condicionIva, docTipo: ficha.docTipo, docNro: ficha.docNro };
}

/** El negocio que factura, con lo que pesa en la letra. */
export interface EmisorDeVenta {
  condicionIva: string | null | undefined;
  cuit?: string | number | null;
  /** Clase A que le asignó ARCA al inscripto (RG 1575). Sin dato, la A pasa por revisión. */
  regimenFacturaA?: string | null;
}

/**
 * La letra de la factura de una venta de mostrador, con la MISMA decisión y los mismos datos que
 * usa el despacho a ARCA (`decidirDelEvento`, src/plugins/arca/domain/comprobante.ts): concepto
 * productos, fecha del comprobante = día del envío, período de servicio exigido. Así lo que
 * Ventas promete es lo que ARCA recibe.
 */
export function decidirFacturaDeVenta(
  emisor: EmisorDeVenta,
  ficha: FichaFiscal | null | undefined,
  venta: { hoy: string; total: number },
): Decision {
  return decidirComprobante(
    { condicionIva: emisor.condicionIva, cuit: emisor.cuit ?? null, regimenFacturaA: emisor.regimenFacturaA ?? null },
    receptorDeFicha(ficha),
    { clase: "factura", fecha: venta.hoy, fechaDeEnvio: venta.hoy, importeTotal: venta.total, naturaleza: "productos" },
    { exigirPeriodoDeServicio: true },
  );
}

/** Lo que hay que hacer para que la decisión deje emitir, para mostrar tal cual. */
export function motivoDeLaDecision(d: Decision): string {
  const aResolver = d.motivos.filter((m) => m.gravedad !== "aviso").map((m) => m.mensaje);
  return aResolver.length > 0 ? aResolver.join(" ") : "La factura no se puede emitir con estos datos.";
}

/**
 * Leyendas que el comprobante impreso ya pone (src/lib/comprobante-pdf.ts:562-567: la de la
 * Ley 27.743 en los B). Una factura que exige otra no se promete: sale de ARCA sin el papel que
 * la ley pide. Cuando el impreso sume una leyenda, se agrega acá su código.
 */
export const LEYENDAS_QUE_LLEVA_EL_IMPRESO: ReadonlySet<Leyenda["codigo"]> = new Set<Leyenda["codigo"]>([
  "LEY27743_TRANSPARENCIA_FISCAL",
]);

/**
 * Lo que impide ENTREGAR la factura que la decisión dejó lista, dicho para la dueña; `null` si
 * se puede. Se pregunta antes de pedir el CAE: ARCA autoriza comprobantes que después el impreso
 * rechaza (src/lib/comprobante-pdf.ts:279-285), y un CAE sin papel no se le da al cliente.
 * - Una leyenda obligatoria que el impreso no trae (RG 5003/2021 en la A a un monotributista).
 * - La A sin el domicilio del comprador (RG 1415, Anexo II).
 * - La A con más de una alícuota: el comprobante no guarda la de cada renglón y no puede mostrar
 *   su precio sin IVA.
 * Una decisión que no quedó lista no se mira acá: su motivo es `motivoDeLaDecision`.
 */
export function queImpideEntregarLaFactura(
  d: Decision,
  ficha: FichaFiscal | null | undefined,
  gruposDeAlicuota: number,
): string | null {
  const c = d.estado === "lista" ? d.comprobante : null;
  if (!c) return null;
  const leyenda = c.leyendas.find((l) => !LEYENDAS_QUE_LLEVA_EL_IMPRESO.has(l.codigo));
  if (leyenda?.codigo === "RG5003_MONOTRIBUTISTA") {
    return "La Factura A a un monotributista lleva una leyenda obligatoria (RG 5003/2021, Ley 27.618) que el comprobante impreso del sistema todavía no trae. Por ahora emitila desde el sitio de ARCA.";
  }
  if (leyenda) {
    return `Este comprobante lleva una leyenda obligatoria (${leyenda.norma}) que el impreso del sistema todavía no trae. Por ahora emitilo desde el sitio de ARCA.`;
  }
  if (c.letra === "A") {
    if (texto(ficha?.domicilio) === "") {
      return "Falta el domicilio del cliente en su ficha fiscal: la Factura A lo lleva impreso. Cargalo y reintentá.";
    }
    if (gruposDeAlicuota > 1) {
      return "Esta venta tiene productos con distintas alícuotas de IVA, y la Factura A todavía no se puede imprimir así (tiene que mostrar el precio sin IVA de cada producto). Por ahora emitila desde el sitio de ARCA.";
    }
  }
  return null;
}

/** El comprador tal como lo lleva la factura (`CreateInvoiceInput.receptor`). */
export interface ReceptorDeComprobante {
  docTipo: number;
  docNro: number;
  condicionIva: string;
}

/**
 * El comprador que va en la factura, copiado de la decisión que se tomó con su ficha
 * (`decidirFacturaDeVenta`): el documento ya normalizado y la condición ya resuelta (sin
 * condición y sin CUIT, consumidor final; sin documento, 99 y 0). Es lo que el despacho vuelve a
 * decidir (`decidirDelEvento`), así que la letra que llega a ARCA es la que se prometió. `null` si
 * la decisión no quedó lista: no se factura, y el porqué lo da `motivoDeLaDecision`.
 */
export function receptorParaComprobante(d: Decision): ReceptorDeComprobante | null {
  if (d.estado !== "lista" || !d.comprobante) return null;
  const c = d.comprobante;
  return { docTipo: c.docTipo, docNro: c.docNro, condicionIva: c.condicionIvaReceptor };
}
