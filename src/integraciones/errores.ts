// ============================================================================
// CATÁLOGO DE ERRORES ACCIONABLES de la suite de integraciones (E3 §3.3).
// ============================================================================
//
// Cada cosa que puede salir mal en una conexión tiene UN código estable, y cada código dice
// tres cosas en castellano llano: qué pasó, qué hacer y con qué botón. El dueño del negocio
// nunca ve un error técnico crudo: ve una de estas frases. El detalle técnico (estado HTTP,
// mensaje del proveedor) va a `EventoIntegracion.detalleError`, que sólo mira el operador.
//
// Además de la frase, cada código fija tres decisiones que el trabajador de salida y la
// entrada de eventos (R1-F1) tienen que respetar:
//   - `reintentaSolo`: si el sistema lo vuelve a intentar sin que nadie toque nada.
//   - `efectoEnConexion`: si la conexión pasa a "requiere reconectar" o "con problemas"
//     (y con eso se pausan sus salidas).
//   - `avisaOperador`: si además del dueño tiene que enterarse GSG.
//
// Reglas de los textos (las ejecuta errores.test.ts): sin "webhook", "token", "API",
// "OAuth", "HTTP" ni otra jerga; nunca "undefined" ni "null" aunque falte un dato; los datos
// que vienen de afuera (el nombre de un producto de la tienda) se limpian y se acortan.
//
// DATO PURO: sin Prisma, sin red, sin React. Lo pueden importar el servidor, el cliente y
// los tests.

export const CODIGOS_ERROR = [
  "credencial_vencida",
  "permiso_revocado",
  "credencial_ilegible",
  "producto_sin_mapear",
  "stock_insuficiente",
  "firma_invalida_repetida",
  "proveedor_caido",
  "datos_rechazados",
  "respuesta_invalida",
  "limite_del_plan",
  "archivo_no_legible",
  "cert_por_vencer",
  "evento_muerto",
  "direccion_no_publica",
  "direccion_invalida",
  "error_interno",
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** El botón que acompaña al error en la app Integraciones. */
export type AccionError =
  | "reconectar"
  | "reintentar"
  | "ir-a-corregir"
  | "ver-pedido"
  | "contactar-gsg"
  | "quiero-mas"
  | "pedir-de-nuevo"
  | "como-renovar"
  | "ninguna";

/**
 * Qué le pasa a la conexión cuando aparece el error. Son valores del enum `EstadoConexion`
 * de la migración (E3 §5), escritos como texto para no importar Prisma acá.
 */
export type EfectoEnConexion = "requiere_reconectar" | "con_problemas" | null;

/** Datos opcionales para armar la frase. Si falta alguno, la frase se arma sin él. */
export interface DatosError {
  /** Nombre legible del conector: "Mercado Pago", "Tiendanube". */
  conector?: string;
  /** Nombre del producto tal como llegó de afuera. */
  producto?: string;
  /** Número o referencia del pedido. */
  pedido?: string;
  pedidas?: number;
  disponibles?: number;
  /** Hora del próximo intento ya formateada ("14:30"). */
  proximoIntento?: string;
  limite?: number;
  /** Fecha ya formateada ("12/11"). */
  fecha?: string;
  intentos?: number;
}

/** El error listo para mostrar y para decidir. */
export interface ErrorAccionable {
  codigo: CodigoError;
  /** Qué pasó. */
  mensaje: string;
  /** Qué hacer. */
  queHacer: string;
  accion: AccionError;
  /** Texto del botón, o null si no hay botón. */
  etiquetaAccion: string | null;
  reintentaSolo: boolean;
  avisaOperador: boolean;
  efectoEnConexion: EfectoEnConexion;
}

export const ETIQUETA_ACCION: Readonly<Record<AccionError, string | null>> = {
  reconectar: "Reconectar",
  reintentar: "Reintentar",
  "ir-a-corregir": "Ir a corregir",
  "ver-pedido": "Ver pedido",
  "contactar-gsg": "Escribirle a GSG",
  "quiero-mas": "Quiero más",
  "pedir-de-nuevo": "Pedir de nuevo",
  "como-renovar": "Cómo renovarlo",
  ninguna: null,
};

// ── Limpieza de lo que viene de afuera ───────────────────────────────────────

const LARGO_MAXIMO_DATO = 80;

/** Saca caracteres de control, colapsa espacios y acorta. Vacío → null. */
function limpio(valor: string | undefined): string | null {
  if (typeof valor !== "string") return null;
  const sinControl = valor.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");
  const colapsado = sinControl.replace(/\s+/g, " ").trim();
  if (!colapsado) return null;
  return colapsado.length > LARGO_MAXIMO_DATO
    ? `${colapsado.slice(0, LARGO_MAXIMO_DATO - 1)}…`
    : colapsado;
}

/** Entero no negativo con separador de miles argentino, o null. */
function numero(valor: number | undefined): string | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  const entero = Math.floor(valor);
  return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface DatosLimpios {
  conector: string | null;
  producto: string | null;
  pedido: string | null;
  pedidas: string | null;
  disponibles: string | null;
  proximoIntento: string | null;
  limite: string | null;
  fecha: string | null;
  intentos: string | null;
}

function limpiar(d: DatosError): DatosLimpios {
  return {
    conector: limpio(d.conector),
    producto: limpio(d.producto),
    pedido: limpio(d.pedido)?.replace(/^#+/, "") ?? null,
    pedidas: numero(d.pedidas),
    disponibles: numero(d.disponibles),
    proximoIntento: limpio(d.proximoIntento),
    limite: numero(d.limite),
    fecha: limpio(d.fecha),
    intentos: numero(d.intentos),
  };
}

// ── El catálogo ──────────────────────────────────────────────────────────────

interface DefinicionError {
  accion: AccionError;
  reintentaSolo: boolean;
  avisaOperador: boolean;
  efectoEnConexion: EfectoEnConexion;
  mensaje(d: DatosLimpios): string;
  queHacer(d: DatosLimpios): string;
}

/** "Mercado Pago" o, si no se sabe cuál, una forma neutra. */
const quien = (d: DatosLimpios) => d.conector ?? "El servicio conectado";
const aQuien = (d: DatosLimpios) => d.conector ?? "el servicio conectado";

const CATALOGO: Readonly<Record<CodigoError, DefinicionError>> = {
  credencial_vencida: {
    accion: "reconectar",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: "requiere_reconectar",
    mensaje: (d) => `${quien(d)} nos pidió que vuelvas a autorizar la conexión.`,
    queHacer: () =>
      "Tocá Reconectar y seguí los pasos. Hasta entonces no entra ni sale nada por esta conexión.",
  },
  permiso_revocado: {
    accion: "reconectar",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: "requiere_reconectar",
    mensaje: (d) =>
      `Se quitó el permiso de GSG desde ${aQuien(d)}. No entra ni sale nada por esta conexión.`,
    queHacer: () => "Si fue sin querer, tocá Reconectar.",
  },
  credencial_ilegible: {
    accion: "reconectar",
    reintentaSolo: false,
    avisaOperador: true,
    efectoEnConexion: "requiere_reconectar",
    mensaje: () => "No pudimos leer los datos guardados de esta conexión.",
    queHacer: () => "Por seguridad hay que volver a conectarla. GSG también recibe el aviso.",
  },
  producto_sin_mapear: {
    accion: "ir-a-corregir",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: (d) =>
      d.producto
        ? `Llegó un pedido con «${d.producto}», que no está en tu catálogo.`
        : "Llegó un pedido con un producto que no está en tu catálogo.",
    queHacer: () => "Vinculalo con un producto tuyo o crealo, y después tocá Reintentar.",
  },
  stock_insuficiente: {
    accion: "ver-pedido",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: (d) =>
      d.pedido && d.pedidas && d.disponibles
        ? `El pedido #${d.pedido} pide ${d.pedidas} y tenés ${d.disponibles}.`
        : "Llegó un pedido con más unidades de las que tenés en stock.",
    queHacer: () => "Revisá el pedido y el stock antes de prepararlo.",
  },
  firma_invalida_repetida: {
    accion: "contactar-gsg",
    reintentaSolo: false,
    avisaOperador: true,
    efectoEnConexion: "con_problemas",
    mensaje: () =>
      "Recibimos avisos que no pudimos verificar. Por seguridad pausamos esta conexión.",
    queHacer: () => "Escribinos y lo revisamos con vos. GSG también recibe el aviso.",
  },
  proveedor_caido: {
    accion: "ninguna",
    reintentaSolo: true,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: (d) =>
      d.proximoIntento
        ? `${quien(d)} no responde. Reintentamos solos; el próximo intento es a las ${d.proximoIntento}.`
        : `${quien(d)} no responde. Reintentamos solos en unos minutos.`,
    queHacer: () => "No tenés que hacer nada.",
  },
  datos_rechazados: {
    accion: "reintentar",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: (d) => `${quien(d)} no aceptó lo que le mandamos.`,
    queHacer: () => "Revisá los datos y tocá Reintentar. Si vuelve a pasar, escribinos.",
  },
  respuesta_invalida: {
    accion: "contactar-gsg",
    reintentaSolo: false,
    avisaOperador: true,
    efectoEnConexion: null,
    mensaje: (d) => `${quien(d)} contestó algo que no esperábamos.`,
    queHacer: () => "GSG recibe el aviso para revisarlo. Si te urge, escribinos.",
  },
  limite_del_plan: {
    accion: "quiero-mas",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: (d) =>
      d.limite
        ? `Este mes llegaste a ${d.limite} movimientos, el tope de tu plan.`
        : "Este mes llegaste al tope de tu plan.",
    queHacer: () => "Lo que entra se sigue procesando. Si necesitás más, tocá Quiero más.",
  },
  archivo_no_legible: {
    accion: "pedir-de-nuevo",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: () =>
      "El archivo que mandaron no se puede leer. Necesitamos el PDF o el Excel que da el banco.",
    queHacer: () => "Tocá Pedir de nuevo para que lo manden otra vez.",
  },
  cert_por_vencer: {
    accion: "como-renovar",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: (d) =>
      d.fecha
        ? `Tu certificado de ARCA vence el ${d.fecha}.`
        : "Tu certificado de ARCA está por vencer.",
    queHacer: () => "Renovalo antes de esa fecha para no quedarte sin facturar.",
  },
  evento_muerto: {
    accion: "reintentar",
    reintentaSolo: false,
    avisaOperador: true,
    efectoEnConexion: null,
    mensaje: (d) => {
      const que = d.pedido ? `el pedido #${d.pedido}` : "un aviso";
      const veces = d.intentos ? ` después de ${d.intentos} intentos` : " después de varios intentos";
      return `No pudimos entregarle ${que} a ${aQuien(d)}${veces}.`;
    },
    queHacer: () => "Revisá que del otro lado esté andando y tocá Reintentar.",
  },
  direccion_no_publica: {
    accion: "ir-a-corregir",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: () => "La dirección no es pública.",
    queHacer: () =>
      "Tiene que ser una dirección de internet que empiece con https://. Corregila y volvé a probar.",
  },
  direccion_invalida: {
    accion: "ir-a-corregir",
    reintentaSolo: false,
    avisaOperador: false,
    efectoEnConexion: null,
    mensaje: () => "La dirección no es válida o nos manda a otra.",
    queHacer: () =>
      "Revisá que sea la dirección exacta, que empiece con https://, y volvé a probar.",
  },
  error_interno: {
    accion: "ninguna",
    reintentaSolo: true,
    avisaOperador: true,
    efectoEnConexion: null,
    mensaje: () => "Algo falló de nuestro lado.",
    queHacer: () => "GSG recibe el aviso y lo reintentamos solos.",
  },
};

/** ¿Es un código del catálogo? (para lo que llega sin tipo: columnas, JSON, casts). */
export function esCodigoError(x: unknown): x is CodigoError {
  return typeof x === "string" && (CODIGOS_ERROR as readonly string[]).includes(x);
}

/**
 * Arma el error para mostrar. Un código desconocido (una columna vieja, un cast) cae en
 * `error_interno`: nunca se muestra un código crudo.
 */
export function errorAccionable(codigo: CodigoError, datos: DatosError = {}): ErrorAccionable {
  const cod: CodigoError = esCodigoError(codigo) ? codigo : "error_interno";
  const def = CATALOGO[cod];
  const d = limpiar(datos ?? {});
  return {
    codigo: cod,
    mensaje: def.mensaje(d),
    queHacer: def.queHacer(d),
    accion: def.accion,
    etiquetaAccion: ETIQUETA_ACCION[def.accion],
    reintentaSolo: def.reintentaSolo,
    avisaOperador: def.avisaOperador,
    efectoEnConexion: def.efectoEnConexion,
  };
}

/**
 * Qué código corresponde a la respuesta de un proveedor (E3 §2.5). Es la clasificación; la
 * espera entre intentos y el tope los decide el trabajador de salida.
 *   2xx → null (salió bien) · 3xx → no seguimos redirecciones · 401/403 → reconectar ·
 *   408/425/429 y 5xx → reintento · el resto de 4xx → rechazo definitivo · lo demás →
 *   respuesta que no esperábamos.
 */
export function codigoPorEstadoHttp(estado: number): CodigoError | null {
  if (!Number.isInteger(estado)) return "respuesta_invalida";
  if (estado >= 200 && estado <= 299) return null;
  if (estado >= 300 && estado <= 399) return "direccion_invalida";
  if (estado === 401 || estado === 403) return "credencial_vencida";
  if (estado === 408 || estado === 425 || estado === 429) return "proveedor_caido";
  if (estado >= 400 && estado <= 499) return "datos_rechazados";
  if (estado >= 500 && estado <= 599) return "proveedor_caido";
  return "respuesta_invalida";
}
