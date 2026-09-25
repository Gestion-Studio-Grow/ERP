/**
 * DECISIÓN FISCAL PURA (R0-F4): qué comprobante corresponde a una operación.
 *
 *   decidirComprobante(emisor, receptor, operación) →
 *     letra y tipo (A/B/C; factura, nota de débito o nota de crédito asociada),
 *     CondicionIVAReceptorId (RG 5616), DocTipo/DocNro, concepto 1/2/3 con
 *     FchServDesde/FchServHasta/FchVtoPago, identificación obligatoria del
 *     consumidor final (RG 5700/2025) y alerta de Factura de Crédito Electrónica.
 *
 * Es la ÚNICA decisión de letra del Core: la consumen Ventas, la facturación
 * automática del extracto y la bandeja del contador. No emite, no lee la base,
 * no mira el reloj: todo entra por parámetro, también el día en que se pide el
 * CAE. Los montos que fija una norma salen de `./vigencias` según la fecha del
 * comprobante; acá no hay montos escritos (hay un test que lo controla).
 *
 * Tres estados, en orden de gravedad:
 *   - "bloqueada": con estos datos ARCA lo rechaza o hay un dato mal cargado
 *     (CUIT inválido, emisor sin condición de IVA, fecha fuera de la ventana,
 *     nota de crédito sin la factura que corrige…). Hay que corregir el dato.
 *   - "revision": una persona tiene que confirmar o completar algo (identificar
 *     al comprador, su condición de IVA, si corresponde FCE…), o lo que
 *     corresponde es un comprobante que el sistema no emite (FCE obligatoria,
 *     Factura M, A con leyenda) y hay que hacerlo desde ARCA. Nunca en lote.
 *   - "lista": se puede emitir sin que nadie mire.
 *
 * La propuesta (`comprobante`):
 *   - Con "bloqueada" nunca viene.
 *   - Con "revision" viene sólo si alguna respuesta a lo que se pregunta la
 *     vuelve correcta TAL COMO ESTÁ (ej. "¿el comprador es gran empresa?": si no
 *     lo es, la factura común es la que va). No viene en dos casos, marcados en
 *     el motivo:
 *       · `fueraDelSistema`: ya se sabe que corresponde OTRO comprobante, que se
 *         emite desde ARCA (FCE obligatoria, Factura M, A con leyenda);
 *       · `pideDato`: falta un dato que va DENTRO del comprobante (el documento
 *         del comprador, el período del servicio, la condición de IVA): la
 *         propuesta sin él sería un comprobante que ARCA rechaza o que dice algo
 *         falso, y ninguna respuesta de sí o no la arregla.
 *     Es una regla del armado (paso 12), no de cada caso: ningún motivo con una
 *     de esas dos marcas convive con una propuesta.
 *   - Confirmar en la bandeja es cargar el dato y VOLVER A DECIDIR; nunca emitir
 *     la propuesta que se mostró antes de confirmar.
 *
 * El importe se compara en centavos, redondeado como viaja a ARCA (`toFixed(2)`,
 * el formato de WSFEv1 en src/plugins/arca/afip/soap.ts): el umbral se decide
 * sobre el mismo número que recibe ARCA, no sobre decimales que nunca llegan.
 *
 * Reglas (la norma va en cada motivo):
 *   - Emisor Monotributo o Exento → siempre C (RG 1415).
 *   - Emisor Responsable Inscripto → A si el receptor es Responsable Inscripto o
 *     monotributista (RG 5003/2021, con su leyenda); B a exento, consumidor
 *     final, no categorizado, no alcanzado o liberado (Ley 19.640, a revisión).
 *   - La A depende del régimen que ARCA le asignó al inscripto (RG 1575): A
 *     común sale; A con leyenda o M, desde ARCA; sin el dato, a revisión.
 *   - CondicionIVAReceptorId por la tabla de FEParamGetCondicionIvaReceptor:
 *     clase A admite 1, 6, 13, 16; clase B 4, 5, 7, 8, 9, 10, 15; clase C todas.
 *   - Nota de crédito/débito: la letra de lo que corrige, con el comprobante
 *     asociado (CbtesAsoc) O el período (PeriodoAsoc), nunca los dos; el
 *     período no puede terminar después de la nota; al mismo cliente.
 *   - Servicios (2) o productos y servicios (3): FchServDesde ≤ FchServHasta y
 *     FchVtoPago ≥ fecha del comprobante (manual del desarrollador de WSFEv1).
 *   - Fecha del comprobante contra el día del envío (manual de WSFEv1): hasta 5
 *     días antes o después y sin pasar al mes siguiente (concepto 1); hasta 10
 *     días (conceptos 2 y 3).
 *   - Consumidor final desde el umbral de la RG 5700/2025: CUIT, CUIL, CDI o
 *     DNI. Apellido, nombre y domicilio se informan o van con "NR" (según
 *     fuentes secundarias): alcanza el documento, y el impreso se entera por
 *     `consumidorFinalSobreUmbral`.
 */

import { validarCuit } from "./cuit";
import {
  MONTO_MINIMO_FCE_MIPYME,
  UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL,
  diasEntre,
  normalizarFecha,
  tablaSana,
  vigenteEn,
  type TablaVigencias,
  type Vigencia,
} from "./vigencias";

// ─── Catálogos de ARCA (códigos de WSFEv1) ──────────────────────────────────────
// El Core no importa el plugin (ADR-002); el test cruza estos códigos con los
// enums de `src/plugins/arca/domain/catalogos.ts` para que no se separen.

export type Letra = "A" | "B" | "C";
export type Clase = "factura" | "nota_debito" | "nota_credito";

/** `CbteTipo` por letra y clase. */
export const CBTE_TIPO: Readonly<Record<Letra, Readonly<Record<Clase, number>>>> = {
  A: { factura: 1, nota_debito: 2, nota_credito: 3 },
  B: { factura: 6, nota_debito: 7, nota_credito: 8 },
  C: { factura: 11, nota_debito: 12, nota_credito: 13 },
};

/** `CbteTipo` de la Factura de Crédito Electrónica MiPyME (sólo para sugerirla). */
export const CBTE_TIPO_FCE: Readonly<Record<Letra, Readonly<Record<Clase, number>>>> = {
  A: { factura: 201, nota_debito: 202, nota_credito: 203 },
  B: { factura: 206, nota_debito: 207, nota_credito: 208 },
  C: { factura: 211, nota_debito: 212, nota_credito: 213 },
};

/** `CbteTipo` de la Factura M (RG 1575): el sistema no la emite, sólo la sugiere. */
export const CBTE_TIPO_M: Readonly<Record<Clase, number>> = {
  factura: 51,
  nota_debito: 52,
  nota_credito: 53,
};
const TIPOS_M: ReadonlySet<number> = new Set(Object.values(CBTE_TIPO_M));

/** `DocTipo` del receptor. */
export const DOC_TIPO = { CUIT: 80, CUIL: 86, CDI: 87, DNI: 96, SIN_IDENTIFICAR: 99 } as const;
export type DocTipo = (typeof DOC_TIPO)[keyof typeof DOC_TIPO];
const DOC_TIPOS: readonly number[] = Object.values(DOC_TIPO);
const NOMBRE_DOC_CLAVE = { [DOC_TIPO.CUIT]: "CUIT", [DOC_TIPO.CUIL]: "CUIL", [DOC_TIPO.CDI]: "CDI" } as const;

export type Concepto = 1 | 2 | 3;

/** Condición del EMISOR frente al IVA (mismos textos que `Tenant.arcaCondicionIva`). */
export type CondicionIvaEmisor = "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO";

/**
 * Qué clase A le asignó ARCA al Responsable Inscripto (RG 1575): A común, A con
 * leyenda (ej. "Operación sujeta a retención") o M. Sólo "A" se emite desde el
 * sistema; las otras dos se derivan a ARCA.
 */
export type RegimenFacturaA = "A" | "A_CON_LEYENDA" | "M";
const REGIMENES_A: readonly string[] = ["A", "A_CON_LEYENDA", "M"];

/** Condición del RECEPTOR frente al IVA (superconjunto de la del Core). */
export type CondicionIvaReceptor =
  | "RESPONSABLE_INSCRIPTO"
  | "MONOTRIBUTO"
  | "MONOTRIBUTO_SOCIAL"
  | "MONOTRIBUTO_PROMOVIDO"
  | "EXENTO"
  | "CONSUMIDOR_FINAL"
  | "NO_CATEGORIZADO"
  | "IVA_NO_ALCANZADO"
  | "IVA_LIBERADO_LEY_19640"
  | "CLIENTE_EXTERIOR"
  | "PROVEEDOR_EXTERIOR";

/** `CondicionIVAReceptorId` (RG 5616), códigos de `FEParamGetCondicionIvaReceptor`. */
export const CONDICION_IVA_RECEPTOR_ID: Readonly<Record<CondicionIvaReceptor, number>> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  NO_CATEGORIZADO: 7,
  PROVEEDOR_EXTERIOR: 8,
  CLIENTE_EXTERIOR: 9,
  IVA_LIBERADO_LEY_19640: 10,
  MONOTRIBUTO_SOCIAL: 13,
  IVA_NO_ALCANZADO: 15,
  MONOTRIBUTO_PROMOVIDO: 16,
};

/** Qué `CondicionIVAReceptorId` admite cada clase de comprobante. */
export const RECEPTORES_ADMITIDOS: Readonly<Record<Letra, ReadonlySet<number>>> = {
  A: new Set([1, 6, 13, 16]),
  B: new Set([4, 5, 7, 8, 9, 10, 15]),
  C: new Set([1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]),
};

const CONDICIONES_EMISOR: readonly string[] = ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"];
const CONDICIONES_RECEPTOR = Object.keys(CONDICION_IVA_RECEPTOR_ID) as CondicionIvaReceptor[];

/** Receptores del Régimen Simplificado: con emisor RI llevan A (RG 5003/2021). */
const MONOTRIBUTISTAS: ReadonlySet<CondicionIvaReceptor> = new Set([
  "MONOTRIBUTO",
  "MONOTRIBUTO_SOCIAL",
  "MONOTRIBUTO_PROMOVIDO",
]);

/** Del exterior: puede corresponder Factura E (otro web service); no se decide acá. */
const DEL_EXTERIOR: ReadonlySet<CondicionIvaReceptor> = new Set([
  "CLIENTE_EXTERIOR",
  "PROVEEDOR_EXTERIOR",
]);

/**
 * Receptores que pueden ser "gran empresa" para la FCE. Quedan afuera el
 * consumidor final, los monotributistas y los del exterior.
 */
const PUEDE_SER_GRAN_EMPRESA: ReadonlySet<CondicionIvaReceptor> = new Set([
  "RESPONSABLE_INSCRIPTO",
  "EXENTO",
  "NO_CATEGORIZADO",
  "IVA_NO_ALCANZADO",
  "IVA_LIBERADO_LEY_19640",
]);

/** Días que ARCA acepta entre la fecha del comprobante y el día del envío. */
const VENTANA_DIAS: Readonly<Record<Concepto, number>> = { 1: 5, 2: 10, 3: 10 };
/** Sin concepto se controla con la ventana más amplia: si ni esa alcanza, seguro que no. */
const VENTANA_MAXIMA = Math.max(...Object.values(VENTANA_DIAS));

const NOMBRE_CONDICION: Readonly<Record<CondicionIvaReceptor, string>> = {
  RESPONSABLE_INSCRIPTO: "responsable inscripto",
  MONOTRIBUTO: "monotributista",
  MONOTRIBUTO_SOCIAL: "monotributista social",
  MONOTRIBUTO_PROMOVIDO: "monotributista promovido",
  EXENTO: "exento en IVA",
  CONSUMIDOR_FINAL: "consumidor final",
  NO_CATEGORIZADO: "no categorizado",
  IVA_NO_ALCANZADO: "no alcanzado por IVA",
  IVA_LIBERADO_LEY_19640: "liberado de IVA (Ley 19.640)",
  CLIENTE_EXTERIOR: "cliente del exterior",
  PROVEEDOR_EXTERIOR: "proveedor del exterior",
};

const NOMBRE_CLASE: Readonly<Record<Clase, string>> = {
  factura: "factura",
  nota_debito: "nota de débito",
  nota_credito: "nota de crédito",
};

// ─── Entrada ───────────────────────────────────────────────────────────────────

export interface EmisorFiscal {
  /** `Tenant.arcaCondicionIva`. Sin dato no se decide nada (no se asume). */
  condicionIva: string | null | undefined;
  /** Para no facturarse a sí mismo. Si viene, tiene que ser un CUIT válido. */
  cuit?: string | number | null;
  /** `Tenant.fceMiPyme`: tiene certificado MiPyME. `null` = no se sabe. */
  esMiPyme?: boolean | null;
  /**
   * Sólo Responsable Inscripto: la clase A que le asignó ARCA (RG 1575).
   * `null` = no se sabe: toda A pasa por revisión hasta que se cargue.
   */
  regimenFacturaA?: RegimenFacturaA | string | null;
  /** `Tenant.arcaConceptoDefault` (1/2/3), si la operación no dice qué vendió. */
  conceptoDefault?: number | null;
}

export interface ReceptorFiscal {
  /** Condición frente al IVA. Sin dato: consumidor final si no hay CUIT. */
  condicionIva?: string | null;
  /** 80 CUIT, 86 CUIL, 87 CDI, 96 DNI, 99 sin identificar. Sin dato se deduce del número. */
  docTipo?: number | null;
  docNro?: string | number | null;
  /** Figura como gran empresa obligada a recibir FCE. `null` = no se sabe. */
  esGranEmpresa?: boolean | null;
}

export type Naturaleza = "productos" | "servicios" | "productos_y_servicios";

export interface ComprobanteOriginal {
  cbteTipo: number;
  puntoVenta: number;
  numero: number;
  /** AAAAMMDD o AAAA-MM-DD. */
  fecha: string;
  /** Si viene, la nota de crédito no puede superar lo que queda por anular. */
  importeTotal?: number | null;
  /** Suma de las notas de crédito ya emitidas contra esta factura. */
  importeYaAcreditado?: number | null;
  /** Documento del receptor de la factura: si viene, la nota va al mismo. */
  docNro?: string | number | null;
}

export interface OperacionFiscal {
  /** Default: factura. */
  clase?: Clase;
  /** Fecha del comprobante (CbteFch). AAAAMMDD o AAAA-MM-DD. */
  fecha: string;
  /**
   * Día en que se pide el CAE (hoy, para quien llama). Obligatorio: sin él no
   * se puede saber si ARCA acepta la fecha, y el comprobante no sale "lista".
   */
  fechaDeEnvio: string;
  /** Importe total en pesos, IVA incluido. */
  importeTotal: number;
  /** Qué se vendió. Si falta, se usa el concepto por defecto del emisor. */
  naturaleza?: Naturaleza | null;
  /** Período del servicio. Lo que falte se completa y se avisa. */
  servicio?: {
    desde?: string | null;
    hasta?: string | null;
    vencimientoPago?: string | null;
  } | null;
  /** Nota de crédito o débito: la factura que corrige (CbtesAsoc). */
  asociado?: ComprobanteOriginal | null;
  /**
   * Nota de crédito o débito por período (PeriodoAsoc), en vez de una factura.
   * `letra`: la de lo facturado en ese período (sin ella, a revisión).
   */
  periodoAsociado?: { desde: string; hasta: string; letra?: Letra | "M" | null } | null;
}

export interface OpcionesDecision {
  /**
   * Regla propia del negocio, más estricta que la ley (ej. la de la facturación
   * automática del extracto). Si es menor que el umbral legal, manda.
   */
  umbralIdentificacionDelNegocio?: number | null;
  /**
   * Emisión sin una persona mirando (facturación automática del extracto): si
   * falta el período del servicio, no se completa con la fecha de la factura
   * (sería un período falso): va a revisión.
   */
  exigirPeriodoDeServicio?: boolean;
  /** Para tests: reemplaza las tablas de vigencias. */
  tablas?: {
    umbralIdentificacion?: TablaVigencias;
    minimoFce?: TablaVigencias;
  };
}

// ─── Salida ────────────────────────────────────────────────────────────────────

export type Gravedad = "bloquea" | "revisar" | "aviso";

export type CodigoMotivo =
  | "CLASE_DESCONOCIDA"
  | "FECHA_INVALIDA"
  | "TABLA_DE_VIGENCIAS_INVALIDA"
  | "IMPORTE_INVALIDO"
  | "EMISOR_SIN_CONDICION"
  | "EMISOR_NO_FACTURA"
  | "EMISOR_CONDICION_DESCONOCIDA"
  | "EMISOR_CUIT_INVALIDO"
  | "EMISOR_REGIMEN_DESCONOCIDO"
  | "REGIMEN_A_A_CONFIRMAR"
  | "FACTURA_M"
  | "FACTURA_A_CON_LEYENDA"
  | "DOC_TIPO_DESCONOCIDO"
  | "RECEPTOR_CUIT_INVALIDO"
  | "RECEPTOR_DOCUMENTO_INVALIDO"
  | "DNI_A_CONFIRMAR"
  | "RECEPTOR_SIN_IDENTIFICAR_CON_NUMERO"
  | "FACTURA_A_SI_MISMO"
  | "RECEPTOR_CONDICION_DESCONOCIDA"
  | "RECEPTOR_SIN_CONDICION"
  | "RECEPTOR_SIN_CUIT"
  | "RECEPTOR_DEL_EXTERIOR"
  | "EMPRESA_COMO_CONSUMIDOR_FINAL"
  | "LIBERADO_LEY_19640"
  | "FALTA_COMPROBANTE_ASOCIADO"
  | "ASOCIADO_Y_PERIODO"
  | "ASOCIADO_INVALIDO"
  | "ASOCIADO_NO_SOPORTADO"
  | "ASOCIADO_CLASE_INCOMPATIBLE"
  | "ASOCIADO_POSTERIOR"
  | "ASOCIADO_OTRO_CLIENTE"
  | "NOTA_CREDITO_SUPERA_ORIGINAL"
  | "LETRA_DISTINTA_A_LA_ORIGINAL"
  | "PERIODO_ASOCIADO_INVALIDO"
  | "PERIODO_POSTERIOR"
  | "PERIODO_SIN_LETRA"
  | "FALTA_CONCEPTO"
  | "CONCEPTO_POR_DEFECTO"
  | "FECHAS_SERVICIO_INVALIDAS"
  | "FECHAS_SERVICIO_POR_DEFECTO"
  | "FALTA_PERIODO_SERVICIO"
  | "FECHA_FUERA_DE_VENTANA"
  | "SIN_UMBRAL_VIGENTE"
  | "IDENTIFICACION_OBLIGATORIA"
  | "IDENTIFICACION_REGLA_DEL_NEGOCIO"
  | "FCE_SIN_MINIMO_VIGENTE"
  | "FCE_OBLIGATORIA"
  | "FCE_A_CONFIRMAR"
  | "CONDICION_INCOMPATIBLE_CON_LETRA";

export interface Motivo {
  codigo: CodigoMotivo;
  gravedad: Gravedad;
  /** En castellano llano y diciendo cómo seguir: se puede mostrar tal cual. */
  mensaje: string;
  /** Dato que hay que mirar o corregir. */
  campo?: string;
  /** Norma que respalda la regla. */
  norma?: string;
  /**
   * El comprobante que corresponde NO lo emite el sistema: se hace desde ARCA.
   * `cbteTipo` es el que habría que emitir (`null` si no hay un tipo propio).
   * Con uno de estos, la decisión nunca trae propuesta.
   */
  fueraDelSistema?: { cbteTipo: number | null };
  /**
   * Falta un dato que va DENTRO del comprobante (el que dice `campo`): sin él no
   * hay propuesta que sirva. Se carga el dato y se vuelve a decidir. Con uno de
   * estos, la decisión nunca trae propuesta.
   */
  pideDato?: true;
}

export interface Leyenda {
  codigo: "RG5003_MONOTRIBUTISTA" | "LEY27743_TRANSPARENCIA_FISCAL";
  /** Texto fijo, o `null` si depende de importes que arma el comprobante impreso. */
  texto: string | null;
  norma: string;
}

export interface ComprobanteDecidido {
  clase: Clase;
  letra: Letra;
  cbteTipo: number;
  concepto: Concepto;
  /** AAAAMMDD. */
  cbteFch: string;
  /** Sólo con concepto 2 o 3. AAAAMMDD. */
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
  docTipo: DocTipo;
  /** 0 si el consumidor final no está identificado. */
  docNro: number;
  condicionIvaReceptor: CondicionIvaReceptor;
  condicionIvaReceptorId: number;
  /** El impreso muestra el IVA discriminado (sólo A). */
  discriminaIva: boolean;
  /**
   * La letra lleva IVA en WSFEv1 (A y B): ImpIVA y el bloque `<Iva>` van cuando
   * hay importe gravado. Lo exento o no gravado va en ImpOpEx / ImpTotConc, sin
   * `<Iva>`. NO quiere decir "mandar siempre `<Iva>`"; la C nunca lo lleva.
   */
  admiteIva: boolean;
  /**
   * Venta a consumidor final desde el umbral de la RG 5700/2025 (con documento).
   * El impreso lleva su CUIT, CUIL, CDI o DNI; apellido, nombre y domicilio se
   * informan o se completan con "NR" (No Requerido).
   */
  consumidorFinalSobreUmbral: boolean;
  /** CbtesAsoc de la nota de crédito o débito. */
  asociado?: { cbteTipo: number; puntoVenta: number; numero: number; cbteFch: string };
  /** PeriodoAsoc de la nota de crédito o débito. AAAAMMDD. */
  periodoAsociado?: { desde: string; hasta: string };
  leyendas: Leyenda[];
}

export interface Decision {
  estado: "lista" | "revision" | "bloqueada";
  comprobante: ComprobanteDecidido | null;
  motivos: Motivo[];
  /**
   * Alerta de Factura de Crédito Electrónica (va aunque no haya propuesta):
   * el tipo que habría que emitir y si ya se sabe que es obligatoria.
   */
  fce: { tipoSugerido: number | null; obligatoria: true | null } | null;
  /** Qué montos con vigencia se usaron (auditoría y explicación en pantalla). */
  vigencias: { umbralIdentificacion: Vigencia | null; minimoFce: Vigencia | null };
}

// ─── Ayudas ────────────────────────────────────────────────────────────────────

const pesos = (n: number) =>
  `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Centavos de un importe, redondeado como viaja a ARCA: WSFEv1 lleva los montos
 * con 2 decimales y el plugin los arma con `toFixed(2)`
 * (src/plugins/arca/afip/soap.ts, `fmt`). Así 5.549.861,995 cuenta como
 * 5.549.862,00, que es lo que ARCA recibe.
 */
const aCentavos = (n: number) => Math.round(Number(n.toFixed(2)) * 100);

/** Un motivo que no deja armar propuesta (ver el contrato del encabezado). */
const sinPropuesta = (m: Motivo) => m.fueraDelSistema != null || m.pideDato === true;

function fechaLegible(aaaammdd: string): string {
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

/** Letra y clase de un CbteTipo normal (1-3, 6-8, 11-13); `null` si no lo es. */
function letraYClaseDe(cbteTipo: number): { letra: Letra; clase: Clase } | null {
  for (const letra of ["A", "B", "C"] as const) {
    for (const clase of ["factura", "nota_debito", "nota_credito"] as const) {
      if (CBTE_TIPO[letra][clase] === cbteTipo) return { letra, clase };
    }
  }
  return null;
}

function esTipoFce(cbteTipo: number): boolean {
  return Object.values(CBTE_TIPO_FCE).some((porClase) =>
    Object.values(porClase).includes(cbteTipo),
  );
}

/** `clave in objeto` sin caer en el prototipo ("constructor", "toString"…). */
function tieneClave<T extends object>(objeto: T, clave: unknown): clave is keyof T {
  return typeof clave === "string" && Object.prototype.hasOwnProperty.call(objeto, clave);
}

const dado = (v: unknown) => v != null && String(v).trim() !== "";

function estadoDe(motivos: Motivo[]): Decision["estado"] {
  if (motivos.some((m) => m.gravedad === "bloquea")) return "bloqueada";
  if (motivos.some((m) => m.gravedad === "revisar")) return "revision";
  return "lista";
}

// ─── Decisión ──────────────────────────────────────────────────────────────────

export function decidirComprobante(
  emisor: EmisorFiscal,
  receptor: ReceptorFiscal,
  operacion: OperacionFiscal,
  opciones: OpcionesDecision = {},
): Decision {
  const motivos: Motivo[] = [];
  const agregar = (m: Motivo) => motivos.push(m);
  const tablaUmbral = opciones.tablas?.umbralIdentificacion ?? UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL;
  const tablaFce = opciones.tablas?.minimoFce ?? MONTO_MINIMO_FCE_MIPYME;
  const vigencias: Decision["vigencias"] = { umbralIdentificacion: null, minimoFce: null };
  let fce: Decision["fce"] = null;
  const cortar = (): Decision => ({ estado: estadoDe(motivos), comprobante: null, motivos, fce, vigencias });

  // Un monto con vigencia sólo sale de una tabla sana. Rota: se bloquea (no se
  // emite en vez de emitir mal) y se dice que es un problema del sistema.
  const tablasRotas = new Set<TablaVigencias>();
  const consultar = (tabla: TablaVigencias, fecha: string): Vigencia | null => {
    if (!tablaSana(tabla)) {
      if (!tablasRotas.has(tabla)) {
        tablasRotas.add(tabla);
        agregar({
          codigo: "TABLA_DE_VIGENCIAS_INVALIDA",
          gravedad: "bloquea",
          mensaje:
            `El sistema tiene mal cargada la tabla "${String(tabla.nombre)}" y no puede decidir este comprobante. ` +
            "No es un error tuyo: avisale a soporte de Gestión Studio Grow.",
        });
      }
      return null;
    }
    return vigenteEn(tabla, fecha);
  };

  // 1. Clase, fecha del comprobante y día del envío.
  const clase: Clase = operacion.clase ?? "factura";
  if (!tieneClave(NOMBRE_CLASE, clase)) {
    agregar({
      codigo: "CLASE_DESCONOCIDA",
      gravedad: "bloquea",
      campo: "clase",
      mensaje: `"${String(clase)}" no es un comprobante que el sistema emita. Elegí factura, nota de débito o nota de crédito.`,
    });
    return cortar();
  }
  const cbteFch = normalizarFecha(operacion.fecha);
  if (!cbteFch) {
    agregar({
      codigo: "FECHA_INVALIDA",
      gravedad: "bloquea",
      campo: "fecha",
      mensaje: `La fecha del comprobante ("${String(operacion.fecha)}") no es una fecha que exista. Corregila con día, mes y año.`,
    });
    return cortar();
  }
  const envio = normalizarFecha(operacion.fechaDeEnvio);
  if (!envio) {
    agregar({
      codigo: "FECHA_INVALIDA",
      gravedad: "bloquea",
      campo: "fechaDeEnvio",
      mensaje:
        (dado(operacion.fechaDeEnvio)
          ? "El día de envío a ARCA no es una fecha que exista"
          : "Falta el día de envío a ARCA") +
        ", y sin él no se puede controlar si ARCA acepta la fecha del comprobante. Volvé a intentarlo; si sigue, avisale a soporte.",
    });
  }

  // 2. Importe, en centavos como lo recibe ARCA (0,004 viaja como 0,00: no vale).
  const importe = operacion.importeTotal;
  const importeValido =
    typeof importe === "number" && Number.isFinite(importe) && importe > 0 && aCentavos(importe) > 0;
  const importeCent = importeValido ? aCentavos(importe) : 0;
  if (!importeValido) {
    agregar({
      codigo: "IMPORTE_INVALIDO",
      gravedad: "bloquea",
      campo: "importeTotal",
      mensaje: "El importe del comprobante tiene que ser mayor a cero. Revisá el total de la operación.",
    });
  }

  // 3. Emisor: su condición decide la letra. No se asume.
  const condEmisor = String(emisor.condicionIva ?? "").trim();
  let letraBase: "C" | "AB" | null = null;
  if (condEmisor === "") {
    agregar({
      codigo: "EMISOR_SIN_CONDICION",
      gravedad: "bloquea",
      campo: "emisor.condicionIva",
      mensaje:
        "Falta tu condición frente al IVA (responsable inscripto, monotributo o exento). " +
        "Cargala en tus datos fiscales, tal como figura en tu constancia de ARCA.",
    });
  } else if (condEmisor === "CONSUMIDOR_FINAL") {
    agregar({
      codigo: "EMISOR_NO_FACTURA",
      gravedad: "bloquea",
      campo: "emisor.condicionIva",
      mensaje:
        "Un consumidor final no emite facturas. Revisá tu condición frente al IVA en tus datos fiscales.",
    });
  } else if (!CONDICIONES_EMISOR.includes(condEmisor)) {
    agregar({
      codigo: "EMISOR_CONDICION_DESCONOCIDA",
      gravedad: "bloquea",
      campo: "emisor.condicionIva",
      mensaje: `"${condEmisor}" no es una condición de IVA que el sistema conozca. Elegí responsable inscripto, monotributo o exento.`,
    });
  } else {
    letraBase = condEmisor === "RESPONSABLE_INSCRIPTO" ? "AB" : "C";
  }
  let regimenA: RegimenFacturaA | null = null;
  if (letraBase === "AB" && dado(emisor.regimenFacturaA)) {
    const r = String(emisor.regimenFacturaA).trim();
    if (REGIMENES_A.includes(r)) regimenA = r as RegimenFacturaA;
    else {
      agregar({
        codigo: "EMISOR_REGIMEN_DESCONOCIDO",
        gravedad: "bloquea",
        campo: "emisor.regimenFacturaA",
        mensaje: `"${r}" no es una clase de factura A que el sistema conozca. Elegí A, A con leyenda o M, como te la asignó ARCA.`,
      });
    }
  }
  let cuitEmisor: string | null = null;
  if (dado(emisor.cuit)) {
    const v = validarCuit(emisor.cuit, "CUIT");
    if (v.ok) cuitEmisor = v.cuit;
    else {
      agregar({
        codigo: "EMISOR_CUIT_INVALIDO",
        gravedad: "bloquea",
        campo: "emisor.cuit",
        mensaje: `Tu CUIT no es válido. ${v.motivo}`,
      });
    }
  }

  // 4. Documento del receptor.
  const nroCrudo = receptor.docNro == null ? "" : String(receptor.docNro).trim();
  const nroDigitos = nroCrudo.replace(/[\s.\-/]/g, "");
  const sinNumero = nroDigitos === "" || /^0+$/.test(nroDigitos);
  let docTipo: DocTipo | null = null;
  let docNro = 0;
  let personaReceptor: "humana" | "juridica" | null = null;

  if (receptor.docTipo != null && !DOC_TIPOS.includes(receptor.docTipo)) {
    agregar({
      codigo: "DOC_TIPO_DESCONOCIDO",
      gravedad: "bloquea",
      campo: "receptor.docTipo",
      mensaje:
        `El sistema todavía no factura con ese tipo de documento (código ${receptor.docTipo}). ` +
        "Usá el CUIT, CUIL, CDI o DNI del comprador, o dejalo sin identificar si la venta no lo exige.",
    });
  } else {
    // Sin tipo, se deduce del número: nada, sin identificar; 11 caracteres, CUIT;
    // cualquier otro largo se valida como DNI.
    const tipo =
      receptor.docTipo ??
      (sinNumero
        ? DOC_TIPO.SIN_IDENTIFICAR
        : nroDigitos.length === 11
          ? DOC_TIPO.CUIT
          : DOC_TIPO.DNI);
    if (tipo === DOC_TIPO.SIN_IDENTIFICAR) {
      if (!sinNumero) {
        agregar({
          codigo: "RECEPTOR_SIN_IDENTIFICAR_CON_NUMERO",
          gravedad: "bloquea",
          campo: "receptor.docTipo",
          mensaje:
            "El comprador figura sin identificar pero tiene un número de documento. Elegí si es CUIT, CUIL, CDI o DNI, o borrá el número.",
        });
      } else {
        docTipo = DOC_TIPO.SIN_IDENTIFICAR;
      }
    } else if (tipo === DOC_TIPO.CUIT || tipo === DOC_TIPO.CUIL || tipo === DOC_TIPO.CDI) {
      const v = validarCuit(nroCrudo, NOMBRE_DOC_CLAVE[tipo]);
      if (v.ok) {
        docTipo = tipo;
        docNro = Number(v.cuit);
        personaReceptor = v.persona;
        if (cuitEmisor && v.cuit === cuitEmisor) {
          agregar({
            codigo: "FACTURA_A_SI_MISMO",
            gravedad: "bloquea",
            campo: "receptor.docNro",
            mensaje: "El comprador tiene tu mismo CUIT: no te podés facturar a vos mismo. Revisá los datos del cliente.",
          });
        }
      } else {
        agregar({
          codigo: "RECEPTOR_CUIT_INVALIDO",
          gravedad: "bloquea",
          campo: "receptor.docNro",
          mensaje: `El documento del comprador no es válido. ${v.motivo}`,
        });
      }
    } else {
      // DNI. ARCA recibe el DocNro como NÚMERO: se valida ese número, no el
      // texto. Los ceros de adelante no cuentan ("01234567" es el 1.234.567) y
      // un DNI en ceros no es un documento: con DocNro 0 el comprobante saldría
      // sin identificar aunque diga DNI, y esquivaría la RG 5700.
      const soloNumeros = /^\d{1,8}$/.test(nroDigitos);
      const significativo = nroDigitos.replace(/^0+/, "");
      if (soloNumeros && /^\d{7,8}$/.test(significativo)) {
        docTipo = DOC_TIPO.DNI;
        docNro = Number(significativo);
      } else if (soloNumeros && /^\d{6}$/.test(significativo)) {
        // Existen DNI de 6 números (documentos muy viejos), pero lo común es que
        // falte uno. Se propone, y una persona lo confirma con el documento.
        docTipo = DOC_TIPO.DNI;
        docNro = Number(significativo);
        agregar({
          codigo: "DNI_A_CONFIRMAR",
          gravedad: "revisar",
          campo: "receptor.docNro",
          mensaje:
            "El DNI del comprador tiene 6 números. Algunos documentos muy viejos son así; si no es el caso, falta un número. Confirmalo con el documento a la vista.",
        });
      } else {
        agregar({
          codigo: "RECEPTOR_DOCUMENTO_INVALIDO",
          gravedad: "bloquea",
          campo: "receptor.docNro",
          mensaje:
            nroDigitos === ""
              ? "Falta el número de DNI del comprador. Cargalo, o dejalo sin identificar si la venta no lo exige."
              : sinNumero
                ? "El DNI del comprador está en ceros, y eso no es un documento. Cargá el número real, o dejalo sin identificar si la venta no lo exige."
                : receptor.docTipo == null
                  ? `El documento del comprador tiene ${nroDigitos.length} caracteres: un DNI tiene 7 u 8 números y un CUIT, CUIL o CDI, 11. Revisalo en su documento o en su constancia de ARCA.`
                  : "El DNI del comprador tiene que tener 7 u 8 números, sin letras. Revisalo en su documento.",
        });
      }
    }
  }

  // 5. Condición del receptor frente al IVA.
  const condCruda = String(receptor.condicionIva ?? "").trim();
  let condReceptor: CondicionIvaReceptor | null = null;
  if (condCruda !== "") {
    if ((CONDICIONES_RECEPTOR as readonly string[]).includes(condCruda)) {
      condReceptor = condCruda as CondicionIvaReceptor;
    } else {
      agregar({
        codigo: "RECEPTOR_CONDICION_DESCONOCIDA",
        gravedad: "bloquea",
        campo: "receptor.condicionIva",
        mensaje: `"${condCruda}" no es una condición de IVA que el sistema conozca. Elegila de la lista, como figura en la constancia del cliente.`,
      });
    }
  } else if (docTipo === DOC_TIPO.CUIT) {
    agregar({
      codigo: "RECEPTOR_SIN_CONDICION",
      gravedad: "revisar",
      pideDato: true,
      campo: "receptor.condicionIva",
      norma: "RG 5616/2024",
      mensaje:
        "El comprador tiene CUIT pero falta su condición frente al IVA, y de eso depende la letra. " +
        "Buscala en su constancia de inscripción de ARCA y cargala en su ficha.",
    });
  } else if (docTipo !== null) {
    // Sin CUIT (DNI, CUIL, CDI o sin identificar) y sin condición: consumidor final.
    condReceptor = "CONSUMIDOR_FINAL";
  }

  if (condReceptor && DEL_EXTERIOR.has(condReceptor)) {
    agregar({
      codigo: "RECEPTOR_DEL_EXTERIOR",
      gravedad: "revisar",
      campo: "receptor.condicionIva",
      mensaje:
        "El comprador es del exterior. Si la venta es una exportación, le corresponde Factura E, que el sistema todavía no emite: hacela desde ARCA. " +
        "Si no lo es (por ejemplo, un servicio que se usa en el país), consultá con tu contador qué comprobante va.",
    });
    condReceptor = null;
  }
  if (condReceptor && condReceptor !== "CONSUMIDOR_FINAL" && docTipo !== null && docTipo !== DOC_TIPO.CUIT) {
    agregar({
      codigo: "RECEPTOR_SIN_CUIT",
      gravedad: "revisar",
      pideDato: true,
      campo: "receptor.docNro",
      mensaje: `El comprador es ${NOMBRE_CONDICION[condReceptor]} y para facturarle hace falta su CUIT. Pedíselo o copialo de su constancia de ARCA.`,
    });
    condReceptor = null;
  }
  if (condReceptor === "CONSUMIDOR_FINAL" && personaReceptor === "juridica") {
    agregar({
      codigo: "EMPRESA_COMO_CONSUMIDOR_FINAL",
      gravedad: "revisar",
      campo: "receptor.condicionIva",
      mensaje:
        "El CUIT es de una empresa y figura como consumidor final. Confirmá su condición frente al IVA en su constancia de ARCA: si es responsable inscripta le corresponde otra letra.",
    });
  }

  // 6. Letra.
  let letra: Letra | null = null;
  if (letraBase === "C") letra = "C";
  else if (letraBase === "AB" && condReceptor) {
    letra = condReceptor === "RESPONSABLE_INSCRIPTO" || MONOTRIBUTISTAS.has(condReceptor) ? "A" : "B";
  }
  // La clase A que le asignó ARCA al inscripto (RG 1575). Sólo en facturas: una
  // nota lleva la letra de lo que corrige, aunque el régimen haya cambiado.
  if (clase === "factura" && letra === "A") {
    if (regimenA === "M") {
      agregar({
        codigo: "FACTURA_M",
        gravedad: "revisar",
        campo: "emisor.regimenFacturaA",
        norma: "RG 1575",
        fueraDelSistema: { cbteTipo: CBTE_TIPO_M.factura },
        mensaje:
          "ARCA te asignó Factura M, así que a este comprador le corresponde una M y el sistema todavía no la emite. Emitila desde el sitio de ARCA.",
      });
      letra = null; // No es una A: tampoco se sugiere FCE A.
    } else if (regimenA === "A_CON_LEYENDA") {
      agregar({
        codigo: "FACTURA_A_CON_LEYENDA",
        gravedad: "revisar",
        campo: "emisor.regimenFacturaA",
        norma: "RG 1575",
        fueraDelSistema: { cbteTipo: null },
        mensaje:
          "ARCA te asignó la Factura A con leyenda, y el sistema todavía no la emite. Emitila desde el sitio de ARCA, con la leyenda que te indicaron.",
      });
    } else if (regimenA === null && !motivos.some((m) => m.codigo === "EMISOR_REGIMEN_DESCONOCIDO")) {
      agregar({
        codigo: "REGIMEN_A_A_CONFIRMAR",
        gravedad: "revisar",
        campo: "emisor.regimenFacturaA",
        norma: "RG 1575",
        mensaje:
          "Falta cargar qué Factura A te asignó ARCA (A común, A con leyenda o M). Consultalo en ARCA o con tu contador y cargalo en tus datos fiscales; " +
          "hasta entonces, cada Factura A pasa por revisión.",
      });
    }
  }
  if (clase === "factura" && letra === "B" && condReceptor === "IVA_LIBERADO_LEY_19640") {
    agregar({
      codigo: "LIBERADO_LEY_19640",
      gravedad: "revisar",
      campo: "receptor.condicionIva",
      norma: "Ley 19.640",
      mensaje:
        "El comprador está en el régimen de la Ley 19.640 (Tierra del Fuego). Si la venta lleva IVA o no depende de dónde estás vos y dónde se entrega: " +
        "confirmalo con tu contador antes de emitir.",
    });
  }

  // 7. Nota de crédito o débito: la letra y el vínculo con lo que corrige.
  let asociado: ComprobanteDecidido["asociado"];
  let periodoAsociado: ComprobanteDecidido["periodoAsociado"];
  if (clase !== "factura") {
    const orig = operacion.asociado ?? null;
    const periodo = operacion.periodoAsociado ?? null;
    if (!orig && !periodo) {
      agregar({
        codigo: "FALTA_COMPROBANTE_ASOCIADO",
        gravedad: "bloquea",
        campo: "asociado",
        norma: "WSFEv1 (CbtesAsoc / PeriodoAsoc)",
        mensaje: `La ${NOMBRE_CLASE[clase]} tiene que decir qué factura corrige. Elegí la factura original.`,
      });
    }
    if (orig && periodo) {
      agregar({
        codigo: "ASOCIADO_Y_PERIODO",
        gravedad: "bloquea",
        campo: "asociado",
        norma: "WSFEv1 (CbtesAsoc / PeriodoAsoc)",
        mensaje: `La ${NOMBRE_CLASE[clase]} corrige una factura o un período, no las dos cosas. Elegí una de las dos.`,
      });
    }
    if (orig) {
      const origFch = normalizarFecha(orig.fecha);
      const yaAcreditado = orig.importeYaAcreditado;
      const ok =
        Number.isInteger(orig.puntoVenta) && orig.puntoVenta > 0 &&
        Number.isInteger(orig.numero) && orig.numero > 0 && origFch !== null &&
        (yaAcreditado == null || (Number.isFinite(yaAcreditado) && yaAcreditado >= 0));
      const tipoOrig = letraYClaseDe(orig.cbteTipo);
      if (!ok) {
        agregar({
          codigo: "ASOCIADO_INVALIDO",
          gravedad: "bloquea",
          campo: "asociado",
          mensaje:
            "Los datos de la factura original están incompletos (punto de venta, número, fecha o lo ya anulado). Elegila de la lista de facturas emitidas.",
        });
      } else if (esTipoFce(orig.cbteTipo) || TIPOS_M.has(orig.cbteTipo)) {
        agregar({
          codigo: "ASOCIADO_NO_SOPORTADO",
          gravedad: "bloquea",
          campo: "asociado.cbteTipo",
          mensaje:
            "La factura original es de crédito electrónica o M, y su nota de crédito o débito todavía no se emite desde el sistema. Hacela desde ARCA.",
        });
      } else if (!tipoOrig) {
        agregar({
          codigo: "ASOCIADO_INVALIDO",
          gravedad: "bloquea",
          campo: "asociado.cbteTipo",
          mensaje: `El tipo ${orig.cbteTipo} no es una factura ni una nota A, B o C. Elegí la factura original de la lista.`,
        });
      } else {
        const claseValida =
          clase === "nota_credito"
            ? tipoOrig.clase === "factura" || tipoOrig.clase === "nota_debito"
            : tipoOrig.clase === "factura" || tipoOrig.clase === "nota_credito";
        if (!claseValida) {
          agregar({
            codigo: "ASOCIADO_CLASE_INCOMPATIBLE",
            gravedad: "bloquea",
            campo: "asociado.cbteTipo",
            mensaje: `Una ${NOMBRE_CLASE[clase]} no puede corregir otra ${NOMBRE_CLASE[tipoOrig.clase]}. Elegí la factura original.`,
          });
        }
        if (origFch! > cbteFch) {
          agregar({
            codigo: "ASOCIADO_POSTERIOR",
            gravedad: "bloquea",
            campo: "fecha",
            mensaje: `La ${NOMBRE_CLASE[clase]} no puede tener fecha anterior a la factura que corrige (${fechaLegible(origFch!)}).`,
          });
        }
        if (dado(orig.docNro) && docTipo !== null) {
          const nroOriginal = Number(String(orig.docNro).replace(/\D/g, "") || "0");
          const nroActual = docTipo === DOC_TIPO.SIN_IDENTIFICAR ? 0 : docNro;
          if (nroOriginal !== nroActual) {
            agregar({
              codigo: "ASOCIADO_OTRO_CLIENTE",
              gravedad: "bloquea",
              campo: "receptor.docNro",
              mensaje: `La ${NOMBRE_CLASE[clase]} tiene que ir al mismo cliente que la factura que corrige, y el documento no coincide. Elegí el cliente de la factura original.`,
            });
          }
        }
        if (
          clase === "nota_credito" && importeValido &&
          typeof orig.importeTotal === "number" && Number.isFinite(orig.importeTotal)
        ) {
          const ya = yaAcreditado ?? 0;
          const saldo = aCentavos(orig.importeTotal) - aCentavos(ya);
          if (importeCent > saldo) {
            agregar({
              codigo: "NOTA_CREDITO_SUPERA_ORIGINAL",
              gravedad: "bloquea",
              campo: "importeTotal",
              mensaje:
                ya > 0
                  ? `La nota de crédito (${pesos(importeCent / 100)}) supera lo que queda por anular de la factura: ${pesos(saldo / 100)} ` +
                    `(${pesos(orig.importeTotal)} menos ${pesos(ya)} de notas anteriores).`
                  : `La nota de crédito (${pesos(importeCent / 100)}) no puede ser mayor que la factura que anula (${pesos(orig.importeTotal)}).`,
            });
          }
        }
        if (letra && letra !== tipoOrig.letra) {
          agregar({
            codigo: "LETRA_DISTINTA_A_LA_ORIGINAL",
            gravedad: "revisar",
            campo: "asociado.cbteTipo",
            mensaje:
              `La factura original es ${tipoOrig.letra} y con los datos de hoy correspondería ${letra}: ` +
              `cambió la condición de IVA tuya o del cliente. La ${NOMBRE_CLASE[clase]} tiene que salir con la letra ` +
              `de la original; revisalo con tu contador antes de emitirla.`,
          });
          letra = null;
        }
        asociado = {
          cbteTipo: orig.cbteTipo,
          puntoVenta: orig.puntoVenta,
          numero: orig.numero,
          cbteFch: origFch!,
        };
      }
    }
    if (periodo) {
      const d = normalizarFecha(periodo.desde);
      const h = normalizarFecha(periodo.hasta);
      const letraPeriodo = periodo.letra ?? null;
      if (!d || !h || d > h) {
        agregar({
          codigo: "PERIODO_ASOCIADO_INVALIDO",
          gravedad: "bloquea",
          campo: "periodoAsociado",
          mensaje: "El período que corrige la nota tiene que tener fecha desde y hasta, y la de inicio no puede ser posterior.",
        });
      } else if (h > cbteFch) {
        agregar({
          codigo: "PERIODO_POSTERIOR",
          gravedad: "bloquea",
          campo: "periodoAsociado",
          norma: "WSFEv1 (PeriodoAsoc)",
          mensaje: `El período que corrige la ${NOMBRE_CLASE[clase]} no puede terminar después de su fecha (${fechaLegible(cbteFch)}). Corregí el período o la fecha.`,
        });
      } else {
        periodoAsociado = { desde: d, hasta: h };
      }
      if (letraPeriodo === "M") {
        agregar({
          codigo: "ASOCIADO_NO_SOPORTADO",
          gravedad: "bloquea",
          campo: "periodoAsociado.letra",
          mensaje: "Lo facturado en ese período es M, y su nota de crédito o débito todavía no se emite desde el sistema. Hacela desde ARCA.",
        });
      } else if (letraPeriodo !== null && !tieneClave(CBTE_TIPO, letraPeriodo)) {
        agregar({
          codigo: "PERIODO_ASOCIADO_INVALIDO",
          gravedad: "bloquea",
          campo: "periodoAsociado.letra",
          mensaje: `"${String(letraPeriodo)}" no es una letra de factura. Decí si en ese período le facturaste A, B o C.`,
        });
      } else if (letraPeriodo === null) {
        agregar({
          codigo: "PERIODO_SIN_LETRA",
          gravedad: "revisar",
          campo: "periodoAsociado.letra",
          mensaje: `Decí con qué letra le facturaste a este cliente en ese período: la ${NOMBRE_CLASE[clase]} tiene que salir con esa misma letra.`,
        });
      } else if (letra && letra !== letraPeriodo) {
        agregar({
          codigo: "LETRA_DISTINTA_A_LA_ORIGINAL",
          gravedad: "revisar",
          campo: "periodoAsociado.letra",
          mensaje:
            `En ese período le facturaste ${letraPeriodo} y con los datos de hoy correspondería ${letra}: ` +
            `cambió la condición de IVA tuya o del cliente. La ${NOMBRE_CLASE[clase]} tiene que salir con la letra ` +
            `de lo facturado; revisalo con tu contador antes de emitirla.`,
        });
        letra = null;
      }
    }
  }

  // 8. Concepto y fechas del servicio.
  const porNaturaleza: Record<Naturaleza, Concepto> = {
    productos: 1,
    servicios: 2,
    productos_y_servicios: 3,
  };
  let concepto: Concepto | null = null;
  if (operacion.naturaleza != null && tieneClave(porNaturaleza, operacion.naturaleza)) {
    concepto = porNaturaleza[operacion.naturaleza];
  } else if (emisor.conceptoDefault === 1 || emisor.conceptoDefault === 2 || emisor.conceptoDefault === 3) {
    concepto = emisor.conceptoDefault;
    agregar({
      codigo: "CONCEPTO_POR_DEFECTO",
      gravedad: "aviso",
      campo: "naturaleza",
      mensaje: "Se usó lo que vendés habitualmente (según tus datos fiscales) porque la operación no decía si fueron productos o servicios.",
    });
  } else {
    agregar({
      codigo: "FALTA_CONCEPTO",
      gravedad: "revisar",
      pideDato: true,
      campo: "naturaleza",
      mensaje: "Falta decir si vendiste productos, servicios o las dos cosas. Elegilo en la operación o cargá lo habitual en tus datos fiscales.",
    });
  }

  let fchServDesde: string | undefined;
  let fchServHasta: string | undefined;
  let fchVtoPago: string | undefined;
  if (concepto === 2 || concepto === 3) {
    const s = operacion.servicio ?? {};
    const hayDesde = dado(s.desde);
    const hayHasta = dado(s.hasta);
    const hayVto = dado(s.vencimientoPago);
    const desde = hayDesde ? normalizarFecha(s.desde) : hayHasta ? normalizarFecha(s.hasta) : cbteFch;
    const hasta = hayHasta ? normalizarFecha(s.hasta) : hayDesde ? normalizarFecha(s.desde) : cbteFch;
    const vto = hayVto ? normalizarFecha(s.vencimientoPago) : cbteFch;
    const problemas: string[] = [];
    if (!desde || !hasta || !vto) problemas.push("alguna de las fechas del servicio no existe");
    if (desde && hasta && desde > hasta) problemas.push("el servicio no puede terminar antes de empezar");
    if (vto && vto < cbteFch) problemas.push("el vencimiento del pago no puede ser anterior a la fecha de la factura");
    if (problemas.length > 0) {
      agregar({
        codigo: "FECHAS_SERVICIO_INVALIDAS",
        gravedad: "bloquea",
        campo: "servicio",
        norma: "WSFEv1 (FchServDesde, FchServHasta, FchVtoPago)",
        mensaje: `Revisá las fechas del servicio: ${problemas.join("; ")}.`,
      });
    } else {
      fchServDesde = desde!;
      fchServHasta = hasta!;
      fchVtoPago = vto!;
      // Lo que se completó se dice, campo por campo.
      const completado: string[] = [];
      if (!hayDesde && !hayHasta) completado.push(`el período del servicio con la fecha de la factura (${fechaLegible(cbteFch)})`);
      else if (!hayDesde) completado.push(`el inicio del servicio igual al fin (${fechaLegible(fchServHasta)})`);
      else if (!hayHasta) completado.push(`el fin del servicio igual al inicio (${fechaLegible(fchServDesde)})`);
      if (!hayVto) completado.push(`el vencimiento del pago con la fecha de la factura (${fechaLegible(cbteFch)})`);
      const faltaPeriodo = !hayDesde || !hayHasta;
      if (faltaPeriodo && opciones.exigirPeriodoDeServicio) {
        agregar({
          codigo: "FALTA_PERIODO_SERVICIO",
          gravedad: "revisar",
          pideDato: true,
          campo: "servicio",
          mensaje:
            `En la facturación automática el período del servicio tiene que ser el real, y no vino completo (se tomó ${completado.join(" y ")}). ` +
            "Cargá desde y hasta antes de emitir.",
        });
      } else if (completado.length > 0) {
        agregar({
          codigo: "FECHAS_SERVICIO_POR_DEFECTO",
          gravedad: "aviso",
          campo: "servicio",
          mensaje: `Faltaban fechas del servicio: se tomó ${completado.join(" y ")}.`,
        });
      }
    }
  }

  // 9. Ventana de fechas que acepta ARCA (manual de WSFEv1, CbteFch).
  if (envio) {
    const ventana = concepto ? VENTANA_DIAS[concepto] : VENTANA_MAXIMA;
    const cierre = concepto === 2 || concepto === 3 ? " y dejá el período del servicio con las fechas reales." : ".";
    if (Math.abs(diasEntre(envio, cbteFch)) > ventana) {
      agregar({
        codigo: "FECHA_FUERA_DE_VENTANA",
        gravedad: "bloquea",
        campo: "fecha",
        norma: "WSFEv1 (CbteFch)",
        mensaje:
          `ARCA acepta comprobantes con fecha de hasta ${ventana} días antes o después del día en que se envían, ` +
          `y este es del ${fechaLegible(cbteFch)}. Emitilo con la fecha de hoy${cierre}`,
      });
    } else if (concepto === 1 && cbteFch.slice(0, 6) > envio.slice(0, 6)) {
      agregar({
        codigo: "FECHA_FUERA_DE_VENTANA",
        gravedad: "bloquea",
        campo: "fecha",
        norma: "WSFEv1 (CbteFch)",
        mensaje:
          `Para productos, ARCA no acepta una fecha del mes siguiente al del envío, y este comprobante es del ${fechaLegible(cbteFch)}. ` +
          "Emitilo con la fecha de hoy.",
      });
    }
  }

  // 10. Identificación del consumidor final (RG 5700/2025).
  let consumidorFinalSobreUmbral = false;
  if (condReceptor === "CONSUMIDOR_FINAL" && importeValido) {
    const vig = consultar(tablaUmbral, cbteFch);
    vigencias.umbralIdentificacion = vig;
    consumidorFinalSobreUmbral = vig !== null && importeCent >= aCentavos(vig.valor);
    const delNegocio = opciones.umbralIdentificacionDelNegocio;
    if (docTipo === DOC_TIPO.SIN_IDENTIFICAR && !tablasRotas.has(tablaUmbral)) {
      if (!vig) {
        agregar({
          codigo: "SIN_UMBRAL_VIGENTE",
          gravedad: "revisar",
          pideDato: true,
          campo: "receptor.docNro",
          mensaje: `No hay cargado un importe de identificación vigente al ${fechaLegible(cbteFch)}. Identificá al comprador con CUIT, CUIL, CDI o DNI.`,
        });
      } else if (consumidorFinalSobreUmbral) {
        agregar({
          codigo: "IDENTIFICACION_OBLIGATORIA",
          gravedad: "revisar",
          pideDato: true,
          campo: "receptor.docNro",
          norma: vig.norma,
          mensaje:
            `La venta es de ${pesos(importeCent / 100)} y desde ${pesos(vig.valor)} ARCA exige identificar al consumidor final. ` +
            "Pedile al comprador su CUIT, CUIL, CDI o DNI.",
        });
      } else if (
        typeof delNegocio === "number" && Number.isFinite(delNegocio) && delNegocio > 0 &&
        importeCent >= aCentavos(delNegocio)
      ) {
        agregar({
          codigo: "IDENTIFICACION_REGLA_DEL_NEGOCIO",
          gravedad: "revisar",
          pideDato: true,
          campo: "receptor.docNro",
          mensaje:
            `La venta es de ${pesos(importeCent / 100)} y tu negocio pide identificar al comprador desde ${pesos(delNegocio)}. ` +
            "Cargá su CUIT, CUIL, CDI o DNI.",
        });
      }
    }
  }

  // 11. Factura de Crédito Electrónica MiPyME (Ley 27.440): sólo facturas.
  const candidatoFce =
    clase === "factura" &&
    importeValido &&
    docTipo === DOC_TIPO.CUIT &&
    condReceptor !== null &&
    PUEDE_SER_GRAN_EMPRESA.has(condReceptor) &&
    emisor.esMiPyme !== false &&
    receptor.esGranEmpresa !== false;
  if (candidatoFce) {
    const vig = consultar(tablaFce, cbteFch);
    vigencias.minimoFce = vig;
    const tipoSugerido = letra ? CBTE_TIPO_FCE[letra].factura : null;
    if (tablasRotas.has(tablaFce)) {
      // Ya bloqueado por la tabla.
    } else if (!vig) {
      agregar({
        codigo: "FCE_SIN_MINIMO_VIGENTE",
        gravedad: "revisar",
        campo: "fce",
        norma: "Ley 27.440",
        mensaje: `No hay cargado un monto mínimo de Factura de Crédito Electrónica vigente al ${fechaLegible(cbteFch)}. Confirmá con tu contador si corresponde.`,
      });
      fce = { tipoSugerido, obligatoria: null };
    } else if (importeCent >= aCentavos(vig.valor)) {
      const obligatoria = emisor.esMiPyme === true && receptor.esGranEmpresa === true;
      if (obligatoria) {
        // La ley obliga a emitir FCE: una factura común sería el comprobante
        // equivocado, así que no hay propuesta (lo corta el armado).
        agregar({
          codigo: "FCE_OBLIGATORIA",
          gravedad: "revisar",
          campo: "fce",
          norma: `Ley 27.440 · ${vig.norma}`,
          fueraDelSistema: { cbteTipo: tipoSugerido },
          mensaje:
            `La venta es de ${pesos(importeCent / 100)} a una gran empresa y desde ${pesos(vig.valor)} corresponde ` +
            `Factura de Crédito Electrónica${letra ? ` ${letra}` : ""}, que el sistema todavía no emite. ` +
            "No emitas una factura común: hacela desde el sitio de ARCA.",
        });
        fce = { tipoSugerido, obligatoria: true };
      } else {
        const faltan: string[] = [];
        if (emisor.esMiPyme == null) faltan.push("si tu negocio tiene certificado MiPyME");
        if (receptor.esGranEmpresa == null) faltan.push("si el comprador figura como gran empresa en ARCA");
        agregar({
          codigo: "FCE_A_CONFIRMAR",
          gravedad: "revisar",
          campo: "fce",
          norma: `Ley 27.440 · ${vig.norma}`,
          mensaje:
            `La venta es de ${pesos(importeCent / 100)} y desde ${pesos(vig.valor)} puede corresponder Factura de Crédito Electrónica. ` +
            `Falta confirmar ${faltan.join(" y ")}. Si corresponde, no emitas la factura común: hacela desde ARCA.`,
        });
        fce = { tipoSugerido, obligatoria: null };
      }
    }
  }

  // 12. Armado. Sin letra, sin condición o sin concepto no hay propuesta; si
  // algo bloquea, tampoco (una propuesta "casi lista" invita a emitirla igual);
  // si lo que corresponde es otro comprobante (`fueraDelSistema`) o falta un
  // dato que va adentro (`pideDato`), tampoco: sería el comprobante equivocado.
  if (
    !letra || !condReceptor || docTipo === null || concepto === null ||
    estadoDe(motivos) === "bloqueada" ||
    motivos.some(sinPropuesta)
  ) {
    return cortar();
  }
  const condicionIvaReceptorId = CONDICION_IVA_RECEPTOR_ID[condReceptor];
  if (!RECEPTORES_ADMITIDOS[letra].has(condicionIvaReceptorId)) {
    // Defensa: con las reglas de arriba no pasa (hay un test que recorre todas
    // las combinaciones), pero si alguien las toca, ARCA no lo tiene que ver.
    agregar({
      codigo: "CONDICION_INCOMPATIBLE_CON_LETRA",
      gravedad: "bloquea",
      campo: "receptor.condicionIva",
      norma: "RG 5616/2024",
      mensaje: `Un comprador ${NOMBRE_CONDICION[condReceptor]} no puede recibir un comprobante ${letra}. Revisá su condición frente al IVA.`,
    });
    return cortar();
  }

  const leyendas: Leyenda[] = [];
  if (letra === "A" && MONOTRIBUTISTAS.has(condReceptor)) {
    leyendas.push({
      codigo: "RG5003_MONOTRIBUTISTA",
      texto:
        "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del " +
        "Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618",
      norma: "RG 5003/2021",
    });
  }
  if (letra === "B" && condReceptor === "CONSUMIDOR_FINAL") {
    leyendas.push({
      codigo: "LEY27743_TRANSPARENCIA_FISCAL",
      texto: null,
      norma: "Ley 27.743 · RG 5614/2024",
    });
  }

  const comprobante: ComprobanteDecidido = {
    clase,
    letra,
    cbteTipo: CBTE_TIPO[letra][clase],
    concepto,
    cbteFch,
    ...(fchServDesde ? { fchServDesde, fchServHasta, fchVtoPago } : {}),
    docTipo,
    docNro: docTipo === DOC_TIPO.SIN_IDENTIFICAR ? 0 : docNro,
    condicionIvaReceptor: condReceptor,
    condicionIvaReceptorId,
    discriminaIva: letra === "A",
    admiteIva: letra === "A" || letra === "B",
    consumidorFinalSobreUmbral,
    ...(asociado ? { asociado } : {}),
    ...(periodoAsociado ? { periodoAsociado } : {}),
    leyendas,
  };
  return { estado: estadoDe(motivos), comprobante, motivos, fce, vigencias };
}
