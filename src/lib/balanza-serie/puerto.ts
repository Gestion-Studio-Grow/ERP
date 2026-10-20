// ============================================================================
// EL PUERTO SERIE DEL NAVEGADOR — abrir, escuchar, probar configuraciones y recordar el puerto.
// ============================================================================
//
// Web Serial (Chrome y Edge de computadora) da `navigator.serial`: `requestPort()` abre la
// ventanita donde la persona elige el puerto (sólo con un toque, nunca solo), `getPorts()`
// devuelve los que ya autorizó en esa PC. TypeScript no trae sus tipos: abajo van los mínimos
// que se usan (`PuertoSerie`, `SerieDelNavegador`).
//
// Tres trabajos, sin React (el hook usar-balanza-serie.ts los engancha a la pantalla):
//   · `detectarEnPuerto`: abre el puerto con cada velocidad y configuración, escucha un rato
//     (y, si no llega nada que se entienda, le manda los comandos de las balanzas «a pedido»), y
//     le pasa todo a `elegirConfiguracion` (detector.ts). Tiempos cortos: si la balanza habla
//     sola, la encuentra en uno o dos segundos.
//   · `escucharPuerto`: con la configuración ya sabida, lee sin parar y avisa cada lectura (y
//     en las «a pedido», le pregunta el peso cada tanto).
//   · recordar el puerto EN ESA PC (`localStorage`, clave por negocio): el fabricante y modelo del
//     adaptador USB y la configuración detectada, para reconectar sola al volver.
//
// LOS ERRORES en castellano (`mensajeDeError`): puerto ocupado por otro programa, balanza
// desconectada, permiso negado, ningún puerto elegido.

import {
  bytesATexto,
  bytesDelComando,
  COMANDOS_SERIE,
  leerTramas,
  type LecturaSerie,
} from "./protocolos";
import {
  CONFIGURACIONES_SERIE,
  configuracionDesdeAfuera,
  elegirConfiguracion,
  opcionesDeApertura,
  VELOCIDADES_SERIE,
  type ConfiguracionSerie,
  type EleccionSerie,
  type IntentoSerie,
} from "./detector";

// ----------------------------------------------------------------------------
// Tipos mínimos de Web Serial
// ----------------------------------------------------------------------------

export type OpcionesDeAperturaSerie = {
  baudRate: number;
  dataBits?: 7 | 8 | number;
  stopBits?: 1 | 2 | number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
};

export interface PuertoSerie {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(opciones: OpcionesDeAperturaSerie): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerieDelNavegador extends EventTarget {
  requestPort(opciones?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<PuertoSerie>;
  getPorts(): Promise<PuertoSerie[]>;
}

/** `navigator.serial`, o null si este navegador no tiene Web Serial (Safari, Firefox, celulares). */
export function serieDelNavegador(): SerieDelNavegador | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { serial?: SerieDelNavegador }).serial ?? null;
}

// ----------------------------------------------------------------------------
// Errores en castellano
// ----------------------------------------------------------------------------

export class ErrorDeBalanza extends Error {
  constructor(
    message: string,
    readonly tipo: "sin-puerto" | "permiso" | "ocupado" | "desconectada" | "no-habla" | "no-se-entiende" | "otro",
  ) {
    super(message);
  }
}

export const MENSAJES_DE_BALANZA = {
  "sin-puerto":
    "No elegiste ningún puerto. Tocá «Conectar balanza» de nuevo y elegí el de la balanza. Si la balanza no aparece en la lista, su salida USB no es de tipo puerto serie (pasa con algunas Toledo): pedile al técnico que la pase a salida serie o usá un adaptador USB-serie.",
  permiso: "El navegador no dio permiso para usar el puerto. Revisá los permisos del sitio y volvé a intentar.",
  ocupado: "El puerto está ocupado: cerrá el otro programa o la otra pestaña que esté usando la balanza y volvé a intentar.",
  desconectada: "Se desconectó la balanza. Revisá el cable: cuando vuelva, se conecta sola.",
  "no-habla":
    "No llega nada de la balanza. Revisá que esté prendida, que el cable esté bien enchufado y que la salida por cable esté activada en la balanza.",
  "no-se-entiende":
    "Llegan datos de la balanza pero no se pueden leer. Revisá en la configuración de la balanza que la salida por cable mande el peso.",
  otro: "No se pudo conectar con la balanza. Desenchufá el cable, volvé a enchufarlo y volvé a intentar.",
} as const;

function nombreDelError(e: unknown): string {
  return e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
}

/** De un error del navegador (o nuestro) a un `ErrorDeBalanza` con el mensaje para la persona. */
export function aErrorDeBalanza(e: unknown, momento: "elegir" | "abrir" | "leer"): ErrorDeBalanza {
  if (e instanceof ErrorDeBalanza) return e;
  const nombre = nombreDelError(e);
  let tipo: ErrorDeBalanza["tipo"] = "otro";
  if (momento === "elegir" && nombre === "NotFoundError") tipo = "sin-puerto";
  else if (nombre === "SecurityError" || nombre === "NotAllowedError") tipo = "permiso";
  // `open()` en un puerto abierto por otro: InvalidStateError (esta misma página) o NetworkError
  // («Failed to open serial port»: otro programa o pestaña).
  else if (momento === "abrir" && (nombre === "InvalidStateError" || nombre === "NetworkError")) tipo = "ocupado";
  else if (momento === "leer" && (nombre === "NetworkError" || nombre === "NotFoundError")) tipo = "desconectada";
  return new ErrorDeBalanza(MENSAJES_DE_BALANZA[tipo], tipo);
}

// ----------------------------------------------------------------------------
// Leer y escribir
// ----------------------------------------------------------------------------

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function escribir(puerto: PuertoSerie, bytes: Uint8Array): Promise<void> {
  if (!puerto.writable) return;
  const w = puerto.writable.getWriter();
  try {
    await w.write(bytes);
  } finally {
    w.releaseLock();
  }
}

/**
 * Lee lo que llegue durante `ms` (un carácter por byte). Un error de trama o de paridad corta la
 * lectura y devuelve lo que había: es lo que pasa con la velocidad equivocada. Un puerto perdido
 * (NetworkError) sí se propaga.
 */
async function leerDurante(puerto: PuertoSerie, ms: number): Promise<string> {
  if (!puerto.readable) return "";
  const lector = puerto.readable.getReader();
  const reloj = setTimeout(() => void lector.cancel().catch(() => {}), ms);
  let texto = "";
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      if (value) texto += bytesATexto(value);
    }
  } catch (e) {
    if (nombreDelError(e) === "NetworkError") throw aErrorDeBalanza(e, "leer");
    // FramingError, ParityError, BreakError, BufferOverrunError: velocidad o bits equivocados.
  } finally {
    clearTimeout(reloj);
    lector.releaseLock();
  }
  return texto;
}

async function cerrarSinRuido(puerto: PuertoSerie): Promise<void> {
  try {
    await puerto.close();
  } catch {
    // ya estaba cerrado o se desenchufó: no hay nada que cerrar
  }
}

// ----------------------------------------------------------------------------
// Detectar
// ----------------------------------------------------------------------------

export type TiemposDeBalanza = {
  /** Cuánto se escucha cada configuración esperando que la balanza hable sola. */
  continuoMs: number;
  /** Cuánto se espera la respuesta a cada comando. */
  aPedidoMs: number;
  /** Cada cuánto se le pregunta el peso a una balanza «a pedido» ya conectada. */
  sondeoMs: number;
};

export const TIEMPOS_DE_BALANZA: TiemposDeBalanza = { continuoMs: 800, aPedidoMs: 300, sondeoMs: 250 };

/** Lo que se probó y lo que se encontró, para el asistente y para quien da soporte. */
export type DiagnosticoSerie = {
  intentos: { velocidad: number; bits: IntentoSerie["bits"]; modo: IntentoSerie["modo"]; comando?: IntentoSerie["comando"]; bytes: number }[];
  eleccion: EleccionSerie | null;
};

/** Con 3 lecturas buenas en un intento continuo, no hace falta seguir buscando. */
const LECTURAS_PARA_CORTAR = 3;

export async function detectarEnPuerto(
  puerto: PuertoSerie,
  tiempos: TiemposDeBalanza = TIEMPOS_DE_BALANZA,
  alProbar?: (d: DiagnosticoSerie) => void,
): Promise<{ eleccion: EleccionSerie; diagnostico: DiagnosticoSerie }> {
  const intentos: IntentoSerie[] = [];
  const diagnostico = (eleccion: EleccionSerie | null): DiagnosticoSerie => ({
    intentos: intentos.map(({ velocidad, bits, modo, comando, recibido }) => ({ velocidad, bits, modo, comando, bytes: recibido.length })),
    eleccion,
  });
  const abrir = async (velocidad: number, bits: IntentoSerie["bits"]) => {
    try {
      await puerto.open(opcionesDeApertura(velocidad, bits));
    } catch (e) {
      throw aErrorDeBalanza(e, "abrir");
    }
  };

  // 1) ¿Habla sola?
  for (const velocidad of VELOCIDADES_SERIE) {
    for (const bits of CONFIGURACIONES_SERIE) {
      await abrir(velocidad, bits);
      try {
        const recibido = await leerDurante(puerto, tiempos.continuoMs);
        intentos.push({ velocidad, bits, modo: "continuo", recibido });
      } finally {
        await cerrarSinRuido(puerto);
      }
      alProbar?.(diagnostico(null));
      const sola = elegirConfiguracion([intentos[intentos.length - 1]]);
      if (sola && sola.lecturas >= LECTURAS_PARA_CORTAR) return { eleccion: sola, diagnostico: diagnostico(sola) };
    }
  }
  const continua = elegirConfiguracion(intentos);
  if (continua) return { eleccion: continua, diagnostico: diagnostico(continua) };

  // 2) ¿Contesta a un comando?
  for (const velocidad of VELOCIDADES_SERIE) {
    for (const bits of CONFIGURACIONES_SERIE) {
      await abrir(velocidad, bits);
      try {
        for (const comando of COMANDOS_SERIE) {
          // Se empieza a leer antes de mandar: la respuesta puede llegar enseguida.
          const lectura = leerDurante(puerto, tiempos.aPedidoMs);
          await esperar(10);
          await escribir(puerto, bytesDelComando(comando)).catch(() => {});
          const recibido = await lectura;
          intentos.push({ velocidad, bits, modo: "a-pedido", comando, recibido });
          const contesto = elegirConfiguracion([intentos[intentos.length - 1]]);
          if (contesto) return { eleccion: contesto, diagnostico: diagnostico(contesto) };
        }
      } finally {
        await cerrarSinRuido(puerto);
      }
      alProbar?.(diagnostico(null));
    }
  }
  const algo = intentos.some((i) => i.recibido.length > 0);
  const tipo = algo ? "no-se-entiende" : "no-habla";
  const error = new ErrorDeBalanza(MENSAJES_DE_BALANZA[tipo], tipo);
  (error as ErrorDeBalanza & { diagnostico?: DiagnosticoSerie }).diagnostico = diagnostico(null);
  throw error;
}

// ----------------------------------------------------------------------------
// Escuchar
// ----------------------------------------------------------------------------

export type Escucha = { detener: () => Promise<void> };

/**
 * Abre el puerto con la configuración sabida y lee sin parar. `alLeer` recibe cada lectura;
 * `alRecibir`, lo crudo que llegó (para el diagnóstico); `alCaer`, el error si el puerto se pierde.
 */
export async function escucharPuerto(
  puerto: PuertoSerie,
  configuracion: ConfiguracionSerie,
  avisos: { alLeer: (l: LecturaSerie) => void; alRecibir?: (crudo: string) => void; alCaer: (e: ErrorDeBalanza) => void },
  tiempos: TiemposDeBalanza = TIEMPOS_DE_BALANZA,
): Promise<Escucha> {
  try {
    await puerto.open(opcionesDeApertura(configuracion.velocidad, configuracion.bits));
  } catch (e) {
    throw aErrorDeBalanza(e, "abrir");
  }
  let activo = true;
  let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const sondeo =
    configuracion.modo === "a-pedido" && configuracion.comando
      ? setInterval(() => void escribir(puerto, bytesDelComando(configuracion.comando!)).catch(() => {}), tiempos.sondeoMs)
      : null;

  const bucle = (async () => {
    let resto = "";
    // Después de un error de trama o paridad, el navegador da un `readable` nuevo: se sigue.
    while (activo && puerto.readable) {
      lector = puerto.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          if (!value) continue;
          const texto = bytesATexto(value);
          avisos.alRecibir?.(texto);
          const r = leerTramas(configuracion.protocolo, resto + texto);
          resto = r.resto;
          for (const l of r.lecturas) avisos.alLeer(l);
        }
      } catch (e) {
        if (activo && nombreDelError(e) === "NetworkError") {
          activo = false;
          avisos.alCaer(aErrorDeBalanza(e, "leer"));
        }
      } finally {
        lector.releaseLock();
        lector = null;
      }
    }
    if (activo) {
      // El `readable` desapareció sin que nadie lo pidiera: el puerto se perdió.
      activo = false;
      avisos.alCaer(new ErrorDeBalanza(MENSAJES_DE_BALANZA.desconectada, "desconectada"));
    }
  })();

  return {
    detener: async () => {
      activo = false;
      if (sondeo) clearInterval(sondeo);
      await (lector as ReadableStreamDefaultReader<Uint8Array> | null)?.cancel().catch(() => {});
      await bucle;
      await cerrarSinRuido(puerto);
    },
  };
}

// ----------------------------------------------------------------------------
// Recordar el puerto en esta PC
// ----------------------------------------------------------------------------
//
// En `localStorage`, con el negocio en la clave (el mismo origen puede servir a dos negocios,
// como el perfil de terminal: perfil-core.ts). Sin la persona: la balanza es de la computadora,
// no de quien la usa. No decide plata: lo peor que logra quien lo edita a mano es que la balanza
// no conecte sola.

export type BalanzaRecordada = ConfiguracionSerie & { usbVendorId?: number; usbProductId?: number };

export function claveDeLaBalanza(negocio: string): string {
  return `gsg-balanza-serie:${negocio}:v1`;
}

export function balanzaRecordadaDesdeAfuera(x: unknown): BalanzaRecordada | null {
  const c = configuracionDesdeAfuera(x);
  if (!c) return null;
  const o = x as Record<string, unknown>;
  const r: BalanzaRecordada = { ...c };
  if (Number.isInteger(o.usbVendorId)) r.usbVendorId = o.usbVendorId as number;
  if (Number.isInteger(o.usbProductId)) r.usbProductId = o.usbProductId as number;
  return r;
}

export function leerBalanzaRecordada(negocio: string): BalanzaRecordada | null {
  try {
    const crudo = localStorage.getItem(claveDeLaBalanza(negocio));
    return crudo ? balanzaRecordadaDesdeAfuera(JSON.parse(crudo)) : null;
  } catch {
    return null;
  }
}

export function guardarBalanzaRecordada(negocio: string, puerto: PuertoSerie, configuracion: ConfiguracionSerie): void {
  const info = puerto.getInfo();
  const r: BalanzaRecordada = { ...configuracion, usbVendorId: info.usbVendorId, usbProductId: info.usbProductId };
  try {
    localStorage.setItem(claveDeLaBalanza(negocio), JSON.stringify(r));
  } catch {
    // sin almacenamiento (modo incógnito estricto): se conecta igual, sólo que no se recuerda
  }
}

export function olvidarBalanzaRecordada(negocio: string): void {
  try {
    localStorage.removeItem(claveDeLaBalanza(negocio));
  } catch {
    // nada que olvidar
  }
}

/**
 * Entre los puertos ya autorizados, el de la balanza recordada: el mismo fabricante y modelo de
 * adaptador USB. Un puerto serie de placa (sin USB) no trae esos datos: si hay uno solo
 * autorizado, es ese.
 */
export function puertoRecordado(puertos: readonly PuertoSerie[], r: BalanzaRecordada): PuertoSerie | null {
  if (r.usbVendorId !== undefined) {
    return (
      puertos.find((p) => {
        const i = p.getInfo();
        return i.usbVendorId === r.usbVendorId && (r.usbProductId === undefined || i.usbProductId === r.usbProductId);
      }) ?? null
    );
  }
  return puertos.length === 1 ? puertos[0] : null;
}
