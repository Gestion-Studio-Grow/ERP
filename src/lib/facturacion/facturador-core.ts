// ============================================================================
// FACTURADOR GUIADO — la lógica pura de la emisión en tres pasos (a quién · qué · confirmar)
// ============================================================================
//
// La usa el componente común `EmitirComprobante` (src/components/facturacion/), que montan el panel
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
  validarEmision,
  type AlicuotaFacturita,
  type ConceptoFacturita,
  type CondicionReceptorConCuit,
  type EmisionFacturita,
  type EstadoEmision,
  type EstadoLimite,
} from "@/lib/facturita-core";
import { montosFacturita } from "@/lib/facturita-montos";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
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
    // Vacías en el borrador: se precargan (mes en curso, vencimiento a 10 días) cuando la persona
    // elige «Servicios», con las fechas a la vista para corregirlas (`fechasDeServicioPorDefecto`).
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

/**
 * Las fechas de un servicio por defecto: el mes en curso (del 1 al último día) y que te lo pagan
 * a 10 días. `hoy` en AAAAMMDD; devuelve AAAA-MM-DD (lo que usa el campo de fecha). PURA.
 */
export function fechasDeServicioPorDefecto(hoy: string): Pick<Borrador, "desde" | "hasta" | "vencimiento"> {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(4, 6));
  const dia = Number(hoy.slice(6, 8));
  const dd = (n: number) => String(n).padStart(2, "0");
  // Date.UTC sólo para la aritmética del calendario (sin zona horaria de por medio).
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const vto = new Date(Date.UTC(anio, mes - 1, dia + 10));
  return {
    desde: `${anio}-${dd(mes)}-01`,
    hasta: `${anio}-${dd(mes)}-${dd(ultimo)}`,
    vencimiento: `${vto.getUTCFullYear()}-${dd(vto.getUTCMonth() + 1)}-${dd(vto.getUTCDate())}`,
  };
}

/** Cada cosa que falta del paso «Qué», en criollo y por separado (van al lado del botón). */
export function faltantesEnQue(b: Borrador): string[] {
  const f: string[] = [];
  if (!b.descripcion.trim()) f.push("el detalle (qué vendiste)");
  if (!(totalDelTexto(b.total) > 0)) f.push("el total, en pesos");
  if (conceptoConFechasDeServicio(b.concepto)) {
    if (!b.desde) f.push("la fecha «Desde» del servicio");
    if (!b.hasta) f.push("la fecha «Hasta» del servicio");
    if (!b.vencimiento) f.push("hasta cuándo te lo pagan");
  }
  return f;
}

/** Lo que falta del paso «Qué», en una frase; `null` = listo para confirmar. */
export function faltaEnQue(b: Borrador): string | null {
  const f = faltantesEnQue(b);
  if (f.length > 0) return `Falta ${listaEnCriolloCorta(f)}.`;
  if (b.desde && b.hasta && b.hasta < b.desde) return "El servicio no puede terminar antes de empezar: revisá «Desde» y «Hasta».";
  return null;
}

/** «a», «a y b», «a, b y c». */
function listaEnCriolloCorta(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * Factura A de un inscripto sin la clase de Factura A cargada: el Core la manda a revisión y ARCA
 * la rechaza (decidir-comprobante.ts, REGIMEN_A_A_CONFIRMAR). Se avisa ANTES de emitir, con qué
 * hacer. `regimen` = lo cargado por Soporte GSG; `undefined` = la pantalla no lo sabe (no avisa).
 */
export function avisoDeFacturaA(
  letra: "A" | "B" | "C" | null | undefined,
  regimen: "A" | "A_CON_LEYENDA" | "M" | null | undefined,
): string | null {
  if (letra !== "A" || regimen === undefined || regimen === "A") return null;
  if (regimen === null) {
    return (
      "A este comprador le corresponde Factura A, y todavía no está cargado qué Factura A te asignó ARCA " +
      "(A común, A con leyenda o M). Si la emitís así, ARCA la rechaza. Fijate en ARCA o preguntale a tu contador " +
      "y pedile a Soporte GSG que lo cargue: es un minuto. Mientras tanto, a consumidor final podés facturar igual."
    );
  }
  return (
    "ARCA te asignó Factura A " + (regimen === "M" ? "M" : "con leyenda") + ", y el sistema todavía no la emite. " +
    "Emitila desde el sitio de ARCA; a consumidor final podés facturar acá igual."
  );
}

/** El texto para mandarle la factura al cliente por WhatsApp (el PDF se adjunta aparte). PURA. */
export function mensajeDeWhatsApp(x: {
  letra?: "A" | "B" | "C" | null;
  numero: string | null;
  total: number | null;
  cae: string | null;
  dePrueba: boolean;
  formatear: (n: number) => string;
}): string {
  const nombre = `Factura${x.letra ? ` ${x.letra}` : ""}${x.numero ? ` N.º ${x.numero}` : ""}`;
  const partes = [
    `Hola, te paso la ${nombre}${x.total != null ? ` por ${x.formatear(x.total)}` : ""}.`,
    x.cae ? `CAE ${x.cae}.` : null,
    x.dePrueba ? "(Es de prueba: no tiene validez fiscal.)" : null,
    "¡Gracias!",
  ];
  return partes.filter(Boolean).join(" ");
}

/** El enlace de WhatsApp con el texto ya escrito (la persona elige a quién). PURA. */
export function enlaceDeWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
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
  const iva = sumarAlCentavo(m.iva.map((x) => x.importe));
  return {
    letra: letraPrevista(condicionEmisor, b.comprador),
    neto: m.neto,
    iva,
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

// ---------------------------------------------------------------------------
// El lote de la consola del contador: varias facturas a consumidor final, una por línea
// ---------------------------------------------------------------------------

export const MAX_LINEAS_DEL_LOTE = 30;

export interface LineaDelLote {
  /** Número de línea (1, 2…), para decir dónde está el error. */
  n: number;
  descripcion: string;
  total: number | null;
  /** `null` = lista para emitir. */
  error: string | null;
  pedido: EmisionFacturita | null;
}

/**
 * «Detalle ; total» por línea (también con tabulador, lo que sale de pegar dos columnas de una
 * planilla). Cada línea pasa por la MISMA validación que el servidor. Mismo concepto y alícuota para
 * todo el lote. Las líneas vacías no cuentan; de más de `MAX_LINEAS_DEL_LOTE`, sólo error. PURA.
 */
export function lineasDelLote(
  texto: string,
  x: { hoy: string; condicionEmisor: string | null; concepto: ConceptoFacturita; alicuota: AlicuotaFacturita },
): LineaDelLote[] {
  const crudas = texto
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, l: l.trim() }))
    .filter((l) => l.l);
  const fechas = conceptoConFechasDeServicio(x.concepto) ? fechasDeServicioPorDefecto(x.hoy) : null;
  return crudas.map(({ n, l }, i) => {
    if (i >= MAX_LINEAS_DEL_LOTE) {
      return { n, descripcion: l, total: null, error: `Van hasta ${MAX_LINEAS_DEL_LOTE} por lote: emití estas en el próximo.`, pedido: null };
    }
    const partes = l.split(/\t|;/);
    const totalTexto = partes.length > 1 ? (partes.pop() ?? "") : "";
    const descripcion = partes.join(" ").trim();
    const total = totalDelTexto(totalTexto);
    if (!(total > 0)) return { n, descripcion, total: null, error: "Falta el total al final, después de un «;».", pedido: null };
    const b: Borrador = { ...borradorVacio(), concepto: x.concepto, alicuota: x.alicuota, descripcion, total: totalTexto, ...(fechas ?? {}) };
    const falta = faltaEnQue(b);
    if (falta) return { n, descripcion, total, error: falta, pedido: null };
    const pedido = pedidoDelBorrador(b, x.condicionEmisor);
    const v = validarEmision(pedido, x.hoy, { condicionEmisor: x.condicionEmisor });
    return v.ok ? { n, descripcion, total, error: null, pedido } : { n, descripcion, total, error: v.error, pedido: null };
  });
}
