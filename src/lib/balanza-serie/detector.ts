// ============================================================================
// EL DETECTOR — con qué velocidad, qué configuración y qué idioma habla la balanza.
// ============================================================================
//
// Nadie sabe de memoria cómo está configurada la salida serie de su balanza (la dejó así el
// técnico, o vino así de fábrica). Así que no se pregunta: se PRUEBA. El hook abre el puerto con
// cada velocidad (9600, 4800, 2400, 19200, 1200) y cada configuración (8N1: 8 bits sin paridad;
// 7E1: 7 bits con paridad par), escucha un rato y, si no llega nada que se entienda, prueba
// mandarle cada comando de las balanzas «a pedido». Cada uno de esos intentos es un `IntentoSerie`
// con lo que llegó; este módulo los puntúa y elige.
//
// CÓMO SE PUNTÚA un intento con un protocolo (`puntuarIntento`):
//   · cuántas lecturas buenas salieron (lo que más pesa: con la velocidad equivocada llega
//     basura y no sale ninguna);
//   · qué parte de lo recibido terminó en una lectura (con basura alrededor, baja);
//   · un poco a favor del protocolo más específico (Toledo > CAS > ASCII > a pedido): una trama
//     CAS también es «un número con su unidad», pero si se entiende como CAS, es CAS;
//   · un poco a favor de 8N1 (lo de fábrica en casi todas): si los dos se entienden igual, 8N1.
// Un intento continuo necesita al menos 2 lecturas buenas; uno a pedido, 1 (contesta una vez).
//
// CUÁNDO SE PUEDE TOMAR EL PESO (`estableParaTomar`): nunca en cero, negativo, pasado del máximo
// ni moviéndose. Si la balanza informa ella misma si está quieta (CAS, Toledo, y las ASCII que lo
// marcan), se le cree. Si no informa, se exigen varias lecturas seguidas iguales (±1 g).
//
// PURO: sin navegador, sin React.

import { leerTramas, type ComandoSerie, type LecturaSerie, type ProtocoloSerie } from "./protocolos";

export const VELOCIDADES_SERIE = [9600, 4800, 2400, 19200, 1200] as const;
export type ConfiguracionDeBits = "8N1" | "7E1";
export const CONFIGURACIONES_SERIE: readonly ConfiguracionDeBits[] = ["8N1", "7E1"];
export type ModoSerie = "continuo" | "a-pedido";

/** Lo que se recibió con una velocidad, una configuración y un modo. */
export type IntentoSerie = {
  velocidad: number;
  bits: ConfiguracionDeBits;
  modo: ModoSerie;
  /** Con modo "a-pedido": qué comando se mandó. */
  comando?: ComandoSerie;
  /** Lo recibido, un carácter por byte. */
  recibido: string;
};

/** Cómo habla la balanza: lo que se guarda en la PC para no volver a probar. */
export type ConfiguracionSerie = {
  velocidad: number;
  bits: ConfiguracionDeBits;
  modo: ModoSerie;
  comando?: ComandoSerie;
  protocolo: ProtocoloSerie;
};

export type PuntajeDeIntento = {
  intento: number;
  protocolo: ProtocoloSerie;
  puntaje: number;
  lecturas: number;
  descartadas: number;
};

export type EleccionSerie = {
  configuracion: ConfiguracionSerie;
  puntaje: number;
  /** La última lectura buena del intento elegido (lo que la persona ve en el asistente). */
  muestra: LecturaSerie;
  lecturas: number;
};

const PROTOCOLOS_CONTINUOS: readonly ProtocoloSerie[] = ["toledo", "cas", "ascii"];
const ESPECIFICIDAD: Record<ProtocoloSerie, number> = { toledo: 4, cas: 3, ascii: 2, "a-pedido": 1 };
/** Con más de esto, más lecturas no suman: un intento largo no le gana a uno limpio. */
const TOPE_DE_LECTURAS = 6;

/** Los parámetros para `port.open()` de cada configuración de bits. */
export function opcionesDeApertura(velocidad: number, bits: ConfiguracionDeBits) {
  return bits === "8N1"
    ? { baudRate: velocidad, dataBits: 8, stopBits: 1, parity: "none" as const }
    : { baudRate: velocidad, dataBits: 7, stopBits: 1, parity: "even" as const };
}

/** Cuánto convence un intento leído con un protocolo. 0 = no se entiende. */
export function puntuarIntento(intento: IntentoSerie, protocolo: ProtocoloSerie, indice = 0): PuntajeDeIntento {
  const r = leerTramas(protocolo, intento.recibido);
  const n = r.lecturas.length;
  const minimo = intento.modo === "a-pedido" ? 1 : 2;
  const base = { intento: indice, protocolo, lecturas: n, descartadas: r.descartadas };
  if (n < minimo) return { ...base, puntaje: 0 };
  const total = Math.max(1, intento.recibido.length);
  const limpieza = Math.min(1, r.aprovechados / total);
  const puntaje =
    Math.min(n, TOPE_DE_LECTURAS) * 10 + limpieza * 20 + ESPECIFICIDAD[protocolo] + (intento.bits === "8N1" ? 0.5 : 0);
  return { ...base, puntaje };
}

/** Todos los puntajes de todos los intentos (para el diagnóstico), del mejor al peor. */
export function puntuarIntentos(intentos: readonly IntentoSerie[]): PuntajeDeIntento[] {
  const todos: PuntajeDeIntento[] = [];
  intentos.forEach((it, i) => {
    const protocolos = it.modo === "a-pedido" ? (["a-pedido"] as const) : PROTOCOLOS_CONTINUOS;
    for (const p of protocolos) todos.push(puntuarIntento(it, p, i));
  });
  // A igual puntaje, el intento que se probó primero (el orden de prueba es el de preferencia).
  return todos.sort((x, y) => y.puntaje - x.puntaje || x.intento - y.intento);
}

/** El mejor intento con su protocolo, o null si ninguno se entendió. */
export function elegirConfiguracion(intentos: readonly IntentoSerie[]): EleccionSerie | null {
  const mejor = puntuarIntentos(intentos)[0];
  if (!mejor || mejor.puntaje <= 0) return null;
  const it = intentos[mejor.intento];
  const lecturas = leerTramas(mejor.protocolo, it.recibido).lecturas;
  const configuracion: ConfiguracionSerie = { velocidad: it.velocidad, bits: it.bits, modo: it.modo, protocolo: mejor.protocolo };
  if (it.modo === "a-pedido" && it.comando) configuracion.comando = it.comando;
  return { configuracion, puntaje: mejor.puntaje, muestra: lecturas[lecturas.length - 1], lecturas: lecturas.length };
}

/** ¿Lo que vino de afuera (localStorage) es una configuración que se puede usar? */
export function configuracionDesdeAfuera(x: unknown): ConfiguracionSerie | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!VELOCIDADES_SERIE.includes(o.velocidad as (typeof VELOCIDADES_SERIE)[number])) return null;
  if (o.bits !== "8N1" && o.bits !== "7E1") return null;
  if (o.modo !== "continuo" && o.modo !== "a-pedido") return null;
  if (!["ascii", "cas", "toledo", "a-pedido"].includes(o.protocolo as string)) return null;
  const c: ConfiguracionSerie = { velocidad: o.velocidad as number, bits: o.bits, modo: o.modo, protocolo: o.protocolo as ProtocoloSerie };
  if (o.modo === "a-pedido") {
    if (!["ENQ", "P", "W", "$"].includes(o.comando as string)) return null;
    c.comando = o.comando as ComandoSerie;
  }
  return c;
}

// ----------------------------------------------------------------------------
// ¿Se puede tomar el peso?
// ----------------------------------------------------------------------------

export type MotivoSinPeso = "sin-lecturas" | "cero" | "negativo" | "sobrecarga" | "inestable";
export type EstadoParaTomar = { ok: true; peso: number } | { ok: false; motivo: MotivoSinPeso };

/** Sin bandera de quietud: cuántas lecturas seguidas iguales hacen falta. */
export const LECTURAS_IGUALES_SIN_BANDERA = 3;
/** Cuánto pueden diferir para ser «iguales»: un gramo. */
const TOLERANCIA_KG = 0.001;

export function estableParaTomar(
  lecturas: readonly LecturaSerie[],
  opciones: { iguales?: number } = {},
): EstadoParaTomar {
  const ultima = lecturas[lecturas.length - 1];
  if (!ultima) return { ok: false, motivo: "sin-lecturas" };
  if (ultima.sobrecarga) return { ok: false, motivo: "sobrecarga" };
  if (ultima.negativo || ultima.peso < 0) return { ok: false, motivo: "negativo" };
  if (ultima.cero) return { ok: false, motivo: "cero" };
  if (ultima.bandera) return ultima.estable ? { ok: true, peso: ultima.peso } : { ok: false, motivo: "inestable" };
  const iguales = opciones.iguales ?? LECTURAS_IGUALES_SIN_BANDERA;
  const tramo = lecturas.slice(-iguales);
  if (tramo.length < iguales) return { ok: false, motivo: "inestable" };
  // Medio micro-kilo de margen por la coma flotante (1,251 − 1,250 da 0,00100000000000989).
  const quietas = tramo.every((l) => !l.sobrecarga && !l.cero && Math.abs(l.peso - ultima.peso) <= TOLERANCIA_KG + 1e-9);
  return quietas ? { ok: true, peso: ultima.peso } : { ok: false, motivo: "inestable" };
}
