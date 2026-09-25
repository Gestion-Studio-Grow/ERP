// Asistente de WhatsApp del estudio contable: máquina de estados PURA (E1 §3.3).
//
// Qué hace: dado (conversación guardada, evento, hora, puertos) decide qué contestar, a
// qué estado pasa la conversación y qué EFECTOS tiene que ejecutar el adaptador (leer el
// archivo, cargarlo en el negocio del cliente, avisar en la bandeja del estudio, registrar
// la baja). No toca la base, no manda mensajes, no lee la hora del sistema: todo entra por
// parámetro. Determinista y sin modelo de lenguaje (mismo criterio que `wa-intent.ts`).
// Molde: `src/lib/wa-dispatch.ts` (puertos inyectados). El adaptador real es R2-F1
// (`cola.ts` / `puertos.ts`) y el caño de WhatsApp es R1-F2 (evento `archivo.recibido`).
//
// Reglas de seguridad que esta máquina garantiza y sus tests ejecutan:
//  1. El remitente se trata como DESCONOCIDO salvo que el puerto devuelva al menos una
//     asociación VERIFICADA. Un desconocido nunca recibe nombres de clientes, estados ni
//     montos; nunca dispara lectura ni carga de archivos; a lo sumo
//     MAX_RESPUESTAS_DESCONOCIDO respuestas por ventana de 24 h.
//  2. Los puertos vienen atados por el adaptador a (estudio, teléfono): el bot no puede
//     pedir datos de otro número. `resumenDelMes` sólo se llama con clientes verificados
//     de este número.
//  3. Los botones llevan índices y una secuencia, nunca el id de un negocio. Lo que vuelve
//     de WhatsApp se valida contra lo que se ofreció y contra las asociaciones de HOY.
//  4. La baja silencia: con la conversación en `baja` (o una asociación con opt-out) no
//     sale ningún mensaje hasta que el remitente escriba "alta".
//  5. Los avisos del sistema (lectura, carga, facturas) sólo se mandan a un número que
//     tiene a ESE cliente verificado y dentro de la ventana de 24 h de WhatsApp (contada
//     desde que el remitente mandó su último mensaje, con el timestamp de Meta); si no, no
//     se escribe y el trabajo queda en la bandeja del estudio (efectos de respaldo). El
//     destinatario se decide en un solo lugar (`eventoDelSistema`) para los tres avisos.
//  6. Si el puerto de asociaciones falla, el error sube: sin saber quién es el remitente,
//     no se contesta nada (fail-closed).
//  7. Pura: no escribe en nada de lo que recibe (los tests congelan la entrada en cada paso).
//  8. El extracto cae en el negocio que ELIGIÓ el remitente: la elección se resuelve contra
//     la lista que se le MOSTRÓ (no contra el orden de hoy del puerto) y desde ahí el negocio
//     viaja en la conversación (`clienteTenantId`) hasta la lectura, la confirmación y la
//     carga. Nunca se toma "el primero de la lista". Un nombre que coincide con dos opciones
//     no elige: se vuelve a preguntar por número.
//  9. Privacidad: el primer texto del bot a un número conocido lleva el aviso adelante
//     (mensajes y avisos del sistema, en un solo lugar). Una plantilla no puede llevarlo,
//     así que sin el aviso dado no se manda plantilla (las facturas quedan sin enviar).

import { cuitValido } from "@/lib/cuit";
import { dateStrInBusinessTz } from "@/lib/datetime";
import * as T from "./mensajes";

// ---------------------------------------------------------------------------
// Tiempos y topes (provisionales a confirmar; ver E1 §3.3 y E3 §seguridad)
// ---------------------------------------------------------------------------

const HORA_MS = 60 * 60 * 1000;
/** Ventana de WhatsApp para mandar texto libre desde el último mensaje del cliente. */
export const VENTANA_WHATSAPP_MS = 24 * HORA_MS;
/** Cuánto espera el bot una elección o una confirmación antes de soltar el trámite. */
export const VENCE_TRAMITE_MS = 24 * HORA_MS;
/** Cuánto calla el bot después de "estudio" si el contador no lo libera antes. */
export const SILENCIO_CON_PERSONA_MS = 24 * HORA_MS;
/** Ventana de conteo de respuestas a un número desconocido. */
export const VENTANA_DESCONOCIDO_MS = 24 * HORA_MS;
/** Veces que se le repite a un desconocido "Necesito el CUIT…" por ventana. */
export const MAX_AYUDAS_CUIT = 2;
/** Tope duro de respuestas a un desconocido por ventana (saludo, ayudas, alta, baja). */
export const MAX_RESPUESTAS_DESCONOCIDO = 5;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const ESTADOS_BOT = [
  "desconocido",
  "pidiendo_alta",
  "inicio",
  "eligiendo_cliente",
  "leyendo",
  "esperando_confirmacion",
  "con_persona",
  "baja",
] as const;
export type EstadoBot = (typeof ESTADOS_BOT)[number];

/** Estados con un archivo en curso (vencen a las 24 h). */
const TRAMITE: ReadonlySet<EstadoBot> = new Set<EstadoBot>(["eligiendo_cliente", "leyendo", "esperando_confirmacion"]);

/** Una asociación del remitente con un cliente de la cartera del estudio (fila de `ContactoCartera`). */
export type ClienteDelRemitente = {
  clienteTenantId: string;
  /** Cómo se llama el negocio del cliente para el remitente ("Kiosco de Marta"). */
  alias: string;
  /** Nombre de la persona, si el estudio lo cargó. */
  nombreContacto: string | null;
  /** `verificadoEn` no nulo. Sin verificar, el bot trata al número como desconocido. */
  verificado: boolean;
  /** `optOutEn` no nulo. */
  optOut: boolean;
  /** `avisoPrivacidadEn` no nulo. */
  avisoPrivacidadDado: boolean;
  /** Banco habitual del cliente, si se sabe (sólo para la instrucción de la foto). */
  banco?: string | null;
};

export type ResumenDelMes = T.DatosEstado;

/**
 * Puertos que implementa el adaptador (R2-F1), ATADOS a (estudio, teléfono del remitente).
 * `clientesDelRemitente` lee `ContactoCartera` del estudio; `resumenDelMes` lee el negocio del
 * cliente con `tenantTransaction` después de `exigirClienteDeCartera`.
 */
export type PuertosBot = {
  clientesDelRemitente: () => Promise<ClienteDelRemitente[]>;
  /** `mes` = "AAAA-MM" en la zona del negocio. */
  resumenDelMes: (clienteTenantId: string, mes: string) => Promise<ResumenDelMes>;
};

/** Archivo que mandó el remitente. `ref` = id estable del mensaje o de la media (wamid). */
export type ArchivoEntrante = {
  ref: string;
  nombre: string | null;
  mime: string;
  sha256: string | null;
};

export type MensajeEntrante =
  | { tipo: "texto"; texto: string }
  | { tipo: "documento"; archivo: ArchivoEntrante }
  | { tipo: "imagen"; archivo: ArchivoEntrante }
  | { tipo: "boton"; id: string; titulo: string }
  | { tipo: "otro" };

export type ResultadoLectura =
  | ({ tipo: "ok" } & T.DatosExtracto)
  | { tipo: "duplicado"; recibidoEn: Date | string | null }
  | { tipo: "foto"; banco: string | null }
  | { tipo: "ilegible" };

export type ResultadoCarga = { ok: true; paraFacturar: number; necesitanDato: number } | { ok: false };

export type ComprobanteParaEnviar = { ref: string; nombreArchivo: string };

export type EventoBot =
  /**
   * Mensaje del remitente (ya firmado y deduplicado por el conector). `enviadoEn` = el
   * `timestamp` que manda Meta (`messages[].timestamp`, segundos → Date): la ventana de 24 h
   * de WhatsApp corre desde que el remitente lo MANDÓ, no desde que se procesa.
   */
  | { tipo: "mensaje"; mensaje: MensajeEntrante; enviadoEn: Date }
  /** Terminó la lectura del archivo `ref` que el bot pidió leer para `clienteTenantId`. */
  | { tipo: "lectura"; ref: string; clienteTenantId: string; resultado: ResultadoLectura }
  /** Terminó la carga confirmada del extracto `ref`. */
  | { tipo: "carga"; ref: string; clienteTenantId: string; nombreArchivo: string | null; resultado: ResultadoCarga }
  /** El estudio emitió facturas del cliente: avisarle al remitente. `mes` = "AAAA-MM". */
  | {
      tipo: "facturas_emitidas";
      clienteTenantId: string;
      cantidad: number;
      mes: string;
      total: number;
      comprobantes: ComprobanteParaEnviar[];
    }
  /** Barrido del cron: sólo aplica vencimientos. */
  | { tipo: "vencimiento" }
  /** El contador le devuelve la conversación al bot. */
  | { tipo: "liberar" };

/** Contexto JSON de la conversación (columna `ConversacionWhatsapp.contexto`). */
export type ContextoBot = {
  /** Último mensaje del remitente (ISO). Define la ventana de 24 h de WhatsApp. */
  ultimoEntranteEn: string | null;
  /** Ata los botones al pedido vigente: un botón viejo no confirma un pedido nuevo. */
  secuencia: number;
  /** Archivo en curso (eligiendo_cliente, leyendo, esperando_confirmacion). */
  archivo: ArchivoEntrante | null;
  /** Opciones ofrecidas en eligiendo_cliente, en el orden en que se mostraron. */
  opciones: { clienteTenantId: string; alias: string }[] | null;
  /** Conteo de respuestas a un número desconocido. */
  desconocido: VentanaDesconocido | null;
};

export type VentanaDesconocido = {
  desde: string;
  respuestas: number;
  ayudas: number;
  saludado: boolean;
  solicitudEn: string | null;
};

/** Conversación por (estudio, teléfono). Coincide con las columnas de `ConversacionWhatsapp`. */
export type Conversacion = {
  estado: EstadoBot;
  /** Cliente del trámite en curso. */
  clienteTenantId: string | null;
  vence: Date | null;
  silenciadoHasta: Date | null;
  contexto: ContextoBot;
};

export type Boton = { id: string; titulo: string };

export type Respuesta =
  | { tipo: "texto"; texto: string }
  | { tipo: "botones"; texto: string; botones: Boton[] }
  | { tipo: "documento"; ref: string; nombreArchivo: string }
  | { tipo: "plantilla"; nombre: string; parametros: string[] };

export type MotivoAviso = "ilegible" | "sin_confirmar" | "pide_persona" | "carga_fallida";

export type Efecto =
  /** Bajar/leer el archivo para ESTE cliente (verificado para el remitente). */
  | { tipo: "leer_archivo"; clienteTenantId: string; archivo: ArchivoEntrante }
  /** El remitente confirmó: cargar el extracto en el negocio del cliente. */
  | { tipo: "cargar_extracto"; clienteTenantId: string; ref: string }
  /** El remitente dijo que no. */
  | { tipo: "descartar_extracto"; clienteTenantId: string; ref: string }
  /** El bot suelta un archivo sin cliente asignado (desconocido, llegó a destiempo o venció la elección). */
  | { tipo: "descartar_archivo"; ref: string }
  /** Un desconocido pidió el alta con un CUIT válido. NO asocia: el estudio lo confirma. */
  | { tipo: "pedido_de_alta"; cuit: string }
  /**
   * Algo para el estudio. `sin_confirmar` significa "si ese extracto SIGUE leído y sin
   * confirmar, que lo vea el estudio": el adaptador lo aplica con claim (sólo si el
   * `ExtractoRecibido` está en `leido`), porque una lectura repetida o a destiempo puede
   * emitirlo después de un Sí o un No.
   * `pide_persona` con `ref` (y `clienteTenantId` null): el archivo que el remitente estaba
   * mandando cuando pidió una persona, todavía SIN negocio elegido. El adaptador no lo purga
   * ni lo asigna: lo deja a la vista del estudio para que la persona decida de quién es.
   */
  | { tipo: "aviso_bandeja"; motivo: MotivoAviso; clienteTenantId: string | null; ref: string | null }
  | { tipo: "registrar_baja" }
  | { tipo: "registrar_alta" }
  | { tipo: "aviso_privacidad_dado" }
  /** Facturas que no se pudieron mandar por WhatsApp (baja, persona, fuera de ventana). */
  | { tipo: "comprobantes_sin_enviar"; clienteTenantId: string; refs: string[] };

export type EntradaBot = {
  ahora: Date;
  /** Nombre del estudio dueño del número (para presentarse ante un desconocido). */
  estudio: { nombre: string | null };
  /** Fila guardada, o null si es la primera vez. Pasarla por `conversacionDesdeFila`. */
  conversacion: Conversacion | null;
  evento: EventoBot;
};

export type SalidaBot = {
  /** Estado a guardar (upsert por estudio y teléfono). */
  conversacion: Conversacion;
  /** Mensajes a mandar, en orden. Vacío = silencio. */
  respuestas: Respuesta[];
  /** Trabajo para el adaptador, en orden. */
  efectos: Efecto[];
};

// ---------------------------------------------------------------------------
// Conversación: alta y lectura defensiva de la fila
// ---------------------------------------------------------------------------

export function conversacionNueva(): Conversacion {
  return {
    estado: "desconocido",
    clienteTenantId: null,
    vence: null,
    silenciadoHasta: null,
    contexto: { ultimoEntranteEn: null, secuencia: 0, archivo: null, opciones: null, desconocido: null },
  };
}

function esTexto(v: unknown): v is string {
  return typeof v === "string";
}
function esIsoValido(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
function fechaValida(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (esIsoValido(v)) return new Date(v);
  return null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function leerArchivo(v: unknown): ArchivoEntrante | null {
  const o = obj(v);
  if (!o || !esTexto(o.ref) || !o.ref || !esTexto(o.mime)) return null;
  return {
    ref: o.ref,
    nombre: esTexto(o.nombre) ? o.nombre : null,
    mime: o.mime,
    sha256: esTexto(o.sha256) ? o.sha256 : null,
  };
}

function leerContexto(v: unknown): ContextoBot {
  const o = obj(v) ?? {};
  const opciones = Array.isArray(o.opciones)
    ? o.opciones
        .map((x) => obj(x))
        .filter((x): x is Record<string, unknown> => !!x && esTexto(x.clienteTenantId) && esTexto(x.alias))
        .map((x) => ({ clienteTenantId: x.clienteTenantId as string, alias: x.alias as string }))
    : null;
  const d = obj(o.desconocido);
  const desconocido: VentanaDesconocido | null =
    d && esIsoValido(d.desde)
      ? {
          desde: d.desde,
          respuestas: Number.isInteger(d.respuestas) ? (d.respuestas as number) : MAX_RESPUESTAS_DESCONOCIDO,
          ayudas: Number.isInteger(d.ayudas) ? (d.ayudas as number) : MAX_AYUDAS_CUIT,
          saludado: d.saludado === true,
          solicitudEn: esIsoValido(d.solicitudEn) ? d.solicitudEn : null,
        }
      : null;
  return {
    ultimoEntranteEn: esIsoValido(o.ultimoEntranteEn) ? o.ultimoEntranteEn : null,
    secuencia: Number.isInteger(o.secuencia) && (o.secuencia as number) >= 0 ? (o.secuencia as number) : 0,
    archivo: leerArchivo(o.archivo),
    opciones: opciones && opciones.length > 0 ? opciones : null,
    desconocido,
  };
}

/**
 * Lee una fila de `ConversacionWhatsapp` sin confiar en su forma. Estado desconocido o
 * contexto roto → conversación nueva (el bot vuelve a decidir quién es el remitente por el
 * puerto; nunca por lo que diga la fila).
 */
export function conversacionDesdeFila(
  fila: {
    estado: unknown;
    clienteTenantId?: unknown;
    vence?: unknown;
    silenciadoHasta?: unknown;
    contexto?: unknown;
  } | null,
): Conversacion | null {
  if (!fila || !esTexto(fila.estado) || !(ESTADOS_BOT as readonly string[]).includes(fila.estado)) return null;
  return {
    estado: fila.estado as EstadoBot,
    clienteTenantId: esTexto(fila.clienteTenantId) && fila.clienteTenantId ? fila.clienteTenantId : null,
    vence: fechaValida(fila.vence),
    silenciadoHasta: fechaValida(fila.silenciadoHasta),
    contexto: leerContexto(fila.contexto),
  };
}

// ---------------------------------------------------------------------------
// Lectura del mensaje
// ---------------------------------------------------------------------------

/** Minúsculas, sin tildes, sin signos ni formato de WhatsApp, espacios colapsados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[*_~`¡!¿?.,;:()[\]{}"'«»“”‘’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CMD_BAJA = new Set([
  "baja",
  "darme de baja",
  "dame de baja",
  "dar de baja",
  "quiero la baja",
  "quiero darme de baja",
  "stop",
  "no me escribas mas",
  "no me escriban mas",
]);
const CMD_ALTA = new Set(["alta", "darme de alta", "dame de alta", "quiero el alta", "quiero volver"]);
const CMD_ESTADO = new Set(["estado", "como va", "como va el mes", "estado del mes"]);
const CMD_PERSONA = new Set([
  "estudio",
  "humano",
  "hablar",
  "persona",
  "hablar con alguien",
  "hablar con una persona",
  "hablar con el estudio",
  "contador",
  "hablar con el contador",
]);
const RESP_SI = new Set(["si", "si cargarlo", "si cargalo", "cargalo", "cargarlo", "dale", "ok", "de una", "si dale"]);
const RESP_NO = new Set(["no", "no gracias", "descartalo", "no lo cargues", "no cargarlo"]);

type Comando = "baja" | "alta" | "estado" | "persona" | "si" | "no";

/** Comandos por coincidencia EXACTA del mensaje normalizado (no "contiene": evita falsos positivos). */
function comando(texto: string): Comando | null {
  const n = normalizarTexto(texto);
  if (CMD_BAJA.has(n)) return "baja";
  if (CMD_ALTA.has(n)) return "alta";
  if (CMD_ESTADO.has(n)) return "estado";
  if (CMD_PERSONA.has(n)) return "persona";
  if (RESP_SI.has(n)) return "si";
  if (RESP_NO.has(n)) return "no";
  return null;
}

type BotonLeido = { tipo: "cliente"; secuencia: number; n: number } | { tipo: "confirmar"; secuencia: number; si: boolean };

/** Ids de botón que arma este bot. Cualquier otra forma → null. */
function leerBoton(id: string): BotonLeido | null {
  const c = /^cliente:(\d{1,9}):(\d{1,2})$/.exec(id);
  if (c) return { tipo: "cliente", secuencia: Number(c[1]), n: Number(c[2]) };
  const k = /^confirmar:(\d{1,9}):(si|no)$/.exec(id);
  if (k) return { tipo: "confirmar", secuencia: Number(k[1]), si: k[2] === "si" };
  return null;
}

/**
 * Texto a interpretar de un mensaje. Un botón con id de este bot NO se lee como texto
 * (un "Sí, cargarlo" viejo no confirma un pedido nuevo); uno con id ajeno, por su título.
 */
function textoDe(m: MensajeEntrante): string | null {
  if (m.tipo === "texto") return m.texto;
  if (m.tipo === "boton" && !leerBoton(m.id)) return m.titulo;
  return null;
}

/** El mensaje trae un CUIT válido (sólo sus 11 dígitos, con cualquier separador). */
function cuitDelTexto(texto: string | null): string | null {
  if (texto === null) return null;
  const digitos = texto.replace(/\D/g, "");
  return digitos.length === 11 && cuitValido(digitos) ? digitos : null;
}

function esFoto(m: MensajeEntrante): boolean {
  return m.tipo === "imagen" || (m.tipo === "documento" && m.archivo.mime.toLowerCase().startsWith("image/"));
}

function archivoDe(m: MensajeEntrante): ArchivoEntrante | null {
  return m.tipo === "documento" || m.tipo === "imagen" ? m.archivo : null;
}

// ---------------------------------------------------------------------------
// Ayudantes de estado
// ---------------------------------------------------------------------------

function mas(ahora: Date, ms: number): Date {
  return new Date(ahora.getTime() + ms);
}

/** Deja la conversación en `estado`, sin trámite en curso. Conserva ventana de WhatsApp y secuencia. */
function limpiar(conv: Conversacion, estado: EstadoBot, conservarDesconocido = false): Conversacion {
  return {
    estado,
    clienteTenantId: null,
    vence: null,
    silenciadoHasta: null,
    contexto: {
      ultimoEntranteEn: conv.contexto.ultimoEntranteEn,
      secuencia: conv.contexto.secuencia,
      archivo: null,
      opciones: null,
      desconocido: conservarDesconocido ? conv.contexto.desconocido : null,
    },
  };
}

/** Qué queda pendiente al soltar un trámite, para que no se pierda nada. */
function abandonar(conv: Conversacion): Efecto[] {
  const a = conv.contexto.archivo;
  if (!a) return [];
  if (conv.estado === "esperando_confirmacion" && conv.clienteTenantId) {
    return [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: conv.clienteTenantId, ref: a.ref }];
  }
  if (conv.estado === "eligiendo_cliente") return [{ tipo: "descartar_archivo", ref: a.ref }];
  // leyendo: el resultado va a llegar después y cae en `respaldo`.
  return [];
}

/** Efectos para cuando un evento del sistema NO se le puede contar al remitente. */
function respaldo(evento: EventoBot): Efecto[] {
  switch (evento.tipo) {
    case "lectura":
      if (evento.resultado.tipo === "ok") {
        return [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: evento.clienteTenantId, ref: evento.ref }];
      }
      if (evento.resultado.tipo === "ilegible") {
        return [{ tipo: "aviso_bandeja", motivo: "ilegible", clienteTenantId: evento.clienteTenantId, ref: evento.ref }];
      }
      return [];
    case "carga":
      return evento.resultado.ok
        ? []
        : [{ tipo: "aviso_bandeja", motivo: "carga_fallida", clienteTenantId: evento.clienteTenantId, ref: evento.ref }];
    case "facturas_emitidas":
      return evento.cantidad > 0
        ? [{ tipo: "comprobantes_sin_enviar", clienteTenantId: evento.clienteTenantId, refs: evento.comprobantes.map((c) => c.ref) }]
        : [];
    default:
      return [];
  }
}

/** Aplica los vencimientos antes de mirar el evento. Un plazo ilegible cuenta como vencido. */
function vencer(conv: Conversacion, ahora: Date, efectos: Efecto[]): Conversacion {
  const t = ahora.getTime();
  if (conv.estado === "con_persona" && (!conv.silenciadoHasta || conv.silenciadoHasta.getTime() <= t)) {
    return limpiar(conv, "inicio");
  }
  if (TRAMITE.has(conv.estado) && (!conv.vence || conv.vence.getTime() <= t || !conv.contexto.archivo)) {
    efectos.push(...abandonar(conv));
    return limpiar(conv, "inicio");
  }
  if (conv.estado === "pidiendo_alta" && (!conv.vence || conv.vence.getTime() <= t)) {
    return limpiar(conv, "desconocido");
  }
  return conv;
}

/**
 * Nuevo "último mensaje del remitente" (ISO). Cuenta desde que lo MANDÓ (timestamp de Meta),
 * así un mensaje procesado tarde no estira la ventana más allá de lo que acepta Meta. Nunca en
 * el futuro (un reloj adelantado no la estira), nunca hacia atrás (un mensaje viejo procesado
 * después de uno nuevo no la achica) y un timestamp ilegible no la abre (fail-closed).
 */
function ultimoEntrante(previo: string | null, enviadoEn: unknown, ahora: Date): string | null {
  const t = enviadoEn instanceof Date ? enviadoEn.getTime() : Number.NaN;
  if (!Number.isFinite(t)) return previo;
  const nuevo = Math.min(t, ahora.getTime());
  const p = previo === null ? Number.NaN : Date.parse(previo);
  return Number.isFinite(p) && p >= nuevo ? previo : new Date(nuevo).toISOString();
}

function enVentanaWhatsapp(conv: Conversacion, ahora: Date): boolean {
  const u = conv.contexto.ultimoEntranteEn;
  if (!u) return false;
  const dt = ahora.getTime() - Date.parse(u);
  return dt >= 0 && dt < VENTANA_WHATSAPP_MS;
}

/**
 * Ventana de conteo vigente, como COPIA: es el único objeto del contexto que el bot incrementa,
 * y quien la recibe suma sobre la copia, nunca sobre la entrada. (La máquina no escribe en nada
 * de lo que recibe; los tests congelan la entrada en cada paso.)
 */
function ventanaVigente(v: VentanaDesconocido | null, ahora: Date): VentanaDesconocido | null {
  if (!v) return null;
  const dt = ahora.getTime() - Date.parse(v.desde);
  return dt >= 0 && dt < VENTANA_DESCONOCIDO_MS ? { ...v } : null;
}

function texto(t: string): Respuesta {
  return { tipo: "texto", texto: t };
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

export async function procesarEventoBot(entrada: EntradaBot, puertos: PuertosBot): Promise<SalidaBot> {
  const { ahora, evento } = entrada;
  const efectos: Efecto[] = [];

  // Quién es el remitente lo dice SÓLO el puerto, y sólo cuenta lo verificado. Si el
  // puerto falla, el error sube: sin saber quién escribe no se contesta nada.
  const clientes = (await puertos.clientesDelRemitente()).filter((c) => c.verificado === true);
  const conocido = clientes.length > 0;

  let conv = vencer(entrada.conversacion ?? conversacionNueva(), ahora, efectos);
  if (evento.tipo === "mensaje") {
    const ultimoEntranteEn = ultimoEntrante(conv.contexto.ultimoEntranteEn, evento.enviadoEn, ahora);
    conv = { ...conv, contexto: { ...conv.contexto, ultimoEntranteEn } };
  }

  const txt = evento.tipo === "mensaje" ? textoDe(evento.mensaje) : null;
  const cmd = txt === null ? null : comando(txt);

  // 1) Baja vigente: silencio total salvo "alta".
  if (conv.estado === "baja" || clientes.some((c) => c.optOut)) {
    if (evento.tipo === "mensaje" && cmd === "alta") {
      efectos.push({ tipo: "registrar_alta" });
      conv = limpiar(conv, conocido ? "inicio" : "desconocido", !conocido);
      // sigue abajo como un mensaje nuevo ("alta" es texto libre: saluda).
    } else {
      if (evento.tipo === "mensaje") {
        const a = archivoDe(evento.mensaje);
        if (a) efectos.push({ tipo: "descartar_archivo", ref: a.ref });
      }
      efectos.push(...respaldo(evento));
      if (conv.estado !== "baja") {
        efectos.push(...abandonar(conv));
        conv = limpiar(conv, "baja", !conocido);
      }
      return { conversacion: conv, respuestas: [], efectos };
    }
  }

  // 2) "baja" desde cualquier estado (también con una persona atendiendo).
  if (evento.tipo === "mensaje" && cmd === "baja") {
    efectos.push(...abandonar(conv), { tipo: "registrar_baja" });
    if (!conocido) {
      const v = ventanaVigente(conv.contexto.desconocido, ahora) ?? ventanaNueva(ahora);
      const respuestas: Respuesta[] = [];
      if (v.respuestas < MAX_RESPUESTAS_DESCONOCIDO) {
        respuestas.push(texto(T.bajaConfirmada()));
        v.respuestas += 1;
      }
      const c = limpiar(conv, "baja");
      c.contexto.desconocido = v;
      return { conversacion: c, respuestas, efectos };
    }
    return { conversacion: limpiar(conv, "baja"), respuestas: [texto(T.bajaConfirmada())], efectos };
  }

  // 3) Desconocido: ningún dato, ninguna lista, ningún archivo.
  if (!conocido) return flujoDesconocido(conv, evento, txt, entrada, efectos);

  // 4) Conocido.
  if (conv.estado === "desconocido" || conv.estado === "pidiendo_alta") conv = limpiar(conv, "inicio");
  conv = sanear(conv, clientes, efectos);

  if (evento.tipo === "vencimiento") return { conversacion: conv, respuestas: [], efectos };
  if (evento.tipo === "liberar") {
    return { conversacion: conv.estado === "con_persona" ? limpiar(conv, "inicio") : conv, respuestas: [], efectos };
  }
  if (conv.estado === "con_persona") {
    // Atiende una persona: el bot calla (el mensaje lo guarda el adaptador para el estudio).
    if (evento.tipo !== "mensaje") efectos.push(...respaldo(evento));
    return { conversacion: conv, respuestas: [], efectos };
  }

  // Privacidad (E1 §3.3, "primer contacto de cada número"): mientras alguna asociación no
  // tenga el aviso dado, todo texto del bot lo lleva adelante, y no sale ninguna plantilla.
  const avisoPendiente = clientes.some((c) => !c.avisoPrivacidadDado);
  const r =
    evento.tipo === "mensaje"
      ? await mensajeDeConocido(conv, evento.mensaje, txt, cmd, clientes, entrada, puertos, efectos)
      : eventoDelSistema(conv, evento, clientes, ahora, avisoPendiente, efectos);

  const respuestas = r.respuestas;
  if (respuestas.length > 0 && avisoPendiente) {
    respuestas.unshift(texto(T.avisoPrivacidad()));
    efectos.push({ tipo: "aviso_privacidad_dado" });
  }
  return { conversacion: r.conv, respuestas, efectos };
}

// ---------------------------------------------------------------------------
// Desconocido
// ---------------------------------------------------------------------------

function ventanaNueva(ahora: Date): VentanaDesconocido {
  return { desde: ahora.toISOString(), respuestas: 0, ayudas: 0, saludado: false, solicitudEn: null };
}

function flujoDesconocido(
  convEntrada: Conversacion,
  evento: EventoBot,
  txt: string | null,
  entrada: EntradaBot,
  efectos: Efecto[],
): SalidaBot {
  const { ahora } = entrada;
  // Si el número dejó de estar asociado a mitad de un trámite, se suelta sin contarle nada.
  let conv = convEntrada;
  if (conv.estado !== "desconocido" && conv.estado !== "pidiendo_alta") {
    efectos.push(...abandonar(conv));
    conv = limpiar(conv, "desconocido", true);
  }

  if (evento.tipo !== "mensaje") {
    efectos.push(...respaldo(evento));
    return { conversacion: conv, respuestas: [], efectos };
  }

  const a = archivoDe(evento.mensaje);
  if (a) efectos.push({ tipo: "descartar_archivo", ref: a.ref });

  const v = ventanaVigente(conv.contexto.desconocido, ahora) ?? ventanaNueva(ahora);
  const cuit = cuitDelTexto(txt);
  let respuesta: string | null = null;

  if (v.solicitudEn) {
    respuesta = null; // ya pidió el alta en esta ventana: silencio hasta que el estudio confirme
  } else if (cuit) {
    respuesta = T.altaPedida();
    v.solicitudEn = ahora.toISOString();
    v.saludado = true;
    efectos.push({ tipo: "pedido_de_alta", cuit });
  } else if (!v.saludado) {
    respuesta = T.saludoDesconocido(entrada.estudio.nombre);
    v.saludado = true;
  } else if (v.ayudas < MAX_AYUDAS_CUIT) {
    respuesta = T.pedirCuit();
    v.ayudas += 1;
  }

  if (respuesta !== null && v.respuestas >= MAX_RESPUESTAS_DESCONOCIDO) respuesta = null;
  if (respuesta !== null) v.respuestas += 1;

  const siguiente: Conversacion = {
    estado: "pidiendo_alta",
    clienteTenantId: null,
    vence: mas(new Date(Date.parse(v.desde)), VENTANA_DESCONOCIDO_MS),
    silenciadoHasta: null,
    contexto: { ...conv.contexto, archivo: null, opciones: null, desconocido: v },
  };
  return { conversacion: siguiente, respuestas: respuesta === null ? [] : [texto(respuesta)], efectos };
}

// ---------------------------------------------------------------------------
// Conocido: trámite vigente contra las asociaciones de hoy
// ---------------------------------------------------------------------------

/** Suelta el trámite si su cliente ya no está verificado para este número. */
function sanear(conv: Conversacion, clientes: ClienteDelRemitente[], efectos: Efecto[]): Conversacion {
  if (!TRAMITE.has(conv.estado)) return conv;
  const vigente =
    conv.contexto.archivo !== null &&
    (conv.estado === "eligiendo_cliente"
      ? conv.contexto.opciones !== null
      : conv.clienteTenantId !== null && clientes.some((c) => c.clienteTenantId === conv.clienteTenantId));
  if (vigente) return conv;
  efectos.push(...abandonar(conv));
  return limpiar(conv, "inicio");
}

function clientePorId(clientes: ClienteDelRemitente[], id: string | null): ClienteDelRemitente | null {
  return id ? (clientes.find((c) => c.clienteTenantId === id) ?? null) : null;
}

function botonesConfirmar(secuencia: number): Boton[] {
  return [
    { id: `confirmar:${secuencia}:si`, titulo: T.BOTON_SI_CARGAR },
    { id: `confirmar:${secuencia}:no`, titulo: T.BOTON_NO },
  ];
}

/**
 * Un botón por opción. El título lleva el número de la lista ("1 Kiosco de Marta"): así es
 * único dentro del mensaje y nunca vacío por construcción (WhatsApp rechaza títulos repetidos
 * o vacíos), aunque dos alias se recorten igual o un alias venga vacío.
 */
function botonesClientes(secuencia: number, opciones: { alias: string }[]): Boton[] {
  return opciones.map((o, i) => ({ id: `cliente:${secuencia}:${i + 1}`, titulo: T.tituloDeOpcion(i + 1, o.alias) }));
}

/** Pregunta "¿de cuál negocio es?" con las asociaciones de HOY. Botones si son hasta 3. */
function preguntarCliente(
  conv: Conversacion,
  clientes: ClienteDelRemitente[],
  archivo: ArchivoEntrante,
  ahora: Date,
  armarTexto: (nombre: string | null, aliases: string[]) => string,
): { conv: Conversacion; respuestas: Respuesta[] } {
  const opciones = clientes.map((c) => ({ clienteTenantId: c.clienteTenantId, alias: c.alias }));
  const previas = conv.estado === "eligiendo_cliente" ? conv.contexto.opciones : null;
  const mismas =
    !!previas &&
    previas.length === opciones.length &&
    previas.every((p, i) => p.clienteTenantId === opciones[i].clienteTenantId);
  const secuencia = mismas ? conv.contexto.secuencia : conv.contexto.secuencia + 1;
  const aliases = opciones.map((o) => o.alias);
  const t = armarTexto(archivo.nombre, aliases);
  const respuesta: Respuesta =
    opciones.length <= 3 ? { tipo: "botones", texto: t, botones: botonesClientes(secuencia, opciones) } : texto(t);
  return {
    conv: {
      estado: "eligiendo_cliente",
      clienteTenantId: null,
      vence: conv.estado === "eligiendo_cliente" && conv.vence ? conv.vence : mas(ahora, VENCE_TRAMITE_MS),
      silenciadoHasta: null,
      contexto: { ...conv.contexto, secuencia, archivo, opciones, desconocido: null },
    },
    respuestas: [respuesta],
  };
}

function empezarLectura(
  conv: Conversacion,
  cliente: ClienteDelRemitente,
  archivo: ArchivoEntrante,
  ahora: Date,
  aviso: string,
  efectos: Efecto[],
): { conv: Conversacion; respuestas: Respuesta[] } {
  efectos.push({ tipo: "leer_archivo", clienteTenantId: cliente.clienteTenantId, archivo });
  return {
    conv: {
      estado: "leyendo",
      clienteTenantId: cliente.clienteTenantId,
      vence: mas(ahora, VENCE_TRAMITE_MS),
      silenciadoHasta: null,
      contexto: { ...conv.contexto, archivo, opciones: null, desconocido: null },
    },
    respuestas: [texto(aviso)],
  };
}

type Eleccion = { tipo: "elegido"; cliente: ClienteDelRemitente } | { tipo: "ambigua" } | null;

/**
 * Elección de negocio: índice de lo que se MOSTRÓ (`opciones`, no el orden de hoy del puerto),
 * validado contra las asociaciones de hoy. Por botón (con la secuencia vigente), por número o
 * por el nombre exacto; un nombre que coincide con más de una opción no elige nada ("ambigua"),
 * y un texto que queda vacío al normalizarlo ("?", "...") no coincide con nada.
 */
function eleccion(conv: Conversacion, m: MensajeEntrante, txt: string | null, clientes: ClienteDelRemitente[]): Eleccion {
  const opciones = conv.contexto.opciones ?? [];
  let indice: number | null = null;
  if (m.tipo === "boton") {
    const b = leerBoton(m.id);
    if (b && b.tipo === "cliente" && b.secuencia === conv.contexto.secuencia) indice = b.n - 1;
  }
  if (indice === null && txt !== null) {
    const n = normalizarTexto(txt);
    const num = /^(?:el |la )?(\d{1,2})$/.exec(n);
    if (num) indice = Number(num[1]) - 1;
    else if (n) {
      const coinciden = opciones.flatMap((o, i) => (normalizarTexto(o.alias) === n ? [i] : []));
      if (coinciden.length > 1) return { tipo: "ambigua" };
      if (coinciden.length === 1) indice = coinciden[0];
    }
  }
  if (indice === null || indice < 0 || indice >= opciones.length) return null;
  const cliente = clientePorId(clientes, opciones[indice].clienteTenantId);
  return cliente ? { tipo: "elegido", cliente } : null;
}

async function responderEstado(
  clientes: ClienteDelRemitente[],
  ahora: Date,
  puertos: PuertosBot,
): Promise<Respuesta> {
  const mes = dateStrInBusinessTz(ahora).slice(0, 7);
  const nombreMes = T.nombreDeMes(mes) ?? mes;
  try {
    const lineas: string[] = [];
    for (const c of clientes) {
      const r = await puertos.resumenDelMes(c.clienteTenantId, mes);
      lineas.push(T.estadoDelMes(c.alias, nombreMes, r));
    }
    return texto(lineas.join("\n"));
  } catch {
    return texto(T.estadoNoDisponible());
  }
}

async function mensajeDeConocido(
  conv: Conversacion,
  m: MensajeEntrante,
  txt: string | null,
  cmd: Comando | null,
  clientes: ClienteDelRemitente[],
  entrada: EntradaBot,
  puertos: PuertosBot,
  efectos: Efecto[],
): Promise<{ conv: Conversacion; respuestas: Respuesta[] }> {
  const { ahora } = entrada;
  const archivoNuevo = archivoDe(m);

  // `vencer` y `sanear` (en `procesarEventoBot`, justo antes) ya soltaron todo trámite sin
  // archivo o con un cliente que dejó de estar verificado, con sus efectos de respaldo. Si
  // alguien saca o reordena `sanear`, los tests de "deja de estar verificado" se ponen en rojo;
  // y aunque pasara, `esperando_confirmacion` exige `clienteEnCurso` verificado HOY para cargar.
  const enCurso = conv.contexto.archivo;
  const clienteEnCurso = clientePorId(clientes, conv.clienteTenantId);

  // 1) Lo que espera el trámite va antes que los comandos: si un negocio se llama "Estudio",
  //    "Contador" u "Ok", nombrarlo mientras se elige lo ELIGE (no pasa a una persona ni
  //    suelta el archivo). Sólo "baja" gana siempre, y ya se resolvió antes de llegar acá.
  if (conv.estado === "eligiendo_cliente" && enCurso && !archivoNuevo) {
    const e = eleccion(conv, m, txt, clientes);
    if (e?.tipo === "elegido") {
      return empezarLectura(conv, e.cliente, enCurso, ahora, T.clienteElegido(e.cliente.alias), efectos);
    }
    if (e?.tipo === "ambigua") return preguntarCliente(conv, clientes, enCurso, ahora, T.elegirPorNumero);
  }

  // 2) Comandos que valen en cualquier estado.
  if (cmd === "estado") return { conv, respuestas: [await responderEstado(clientes, ahora, puertos)] };

  if (cmd === "persona") {
    // Nada se pierde: el archivo que todavía no tiene negocio elegido NO se descarta; va con el
    // aviso para que la persona lo vea y decida de quién es. Lo demás en curso sigue su camino
    // (el extracto que esperaba el Sí queda sin confirmar; una lectura pendiente cae en `respaldo`).
    const sinNegocio = conv.estado === "eligiendo_cliente" ? enCurso : null;
    if (sinNegocio) {
      efectos.push({ tipo: "aviso_bandeja", motivo: "pide_persona", clienteTenantId: null, ref: sinNegocio.ref });
    } else {
      const clienteTenantId = conv.clienteTenantId ?? (clientes.length === 1 ? clientes[0].clienteTenantId : null);
      efectos.push(...abandonar(conv), { tipo: "aviso_bandeja", motivo: "pide_persona", clienteTenantId, ref: null });
    }
    const c = limpiar(conv, "con_persona");
    c.silenciadoHasta = mas(ahora, SILENCIO_CON_PERSONA_MS);
    return { conv: c, respuestas: [texto(T.pasoAPersona())] };
  }

  // 3) Una foto, en CUALQUIER estado: el texto de E1 ("todavía no leo fotos"), no se lee ni se
  //    pregunta de quién es, y el trámite en curso sigue como estaba (sus botones siguen valiendo).
  if (archivoNuevo && esFoto(m)) {
    efectos.push({ tipo: "descartar_archivo", ref: archivoNuevo.ref });
    const delNumero = clienteEnCurso ?? (clientes.length === 1 ? clientes[0] : null);
    return { conv, respuestas: [texto(T.fotoNoSoportada(delNumero?.banco ?? null))] };
  }

  switch (conv.estado) {
    case "eligiendo_cliente": {
      if (!enCurso) break;
      if (archivoNuevo) {
        efectos.push({ tipo: "descartar_archivo", ref: archivoNuevo.ref });
        return preguntarCliente(conv, clientes, enCurso, ahora, T.antesElegirCliente);
      }
      // Una elección válida ya se resolvió en (1): esto no lo es.
      return preguntarCliente(conv, clientes, enCurso, ahora, T.elegirClienteDeNuevo);
    }

    case "leyendo": {
      if (archivoNuevo) {
        efectos.push({ tipo: "descartar_archivo", ref: archivoNuevo.ref });
        return { conv, respuestas: [texto(T.todaviaLeyendoOtroArchivo(enCurso?.nombre ?? null))] };
      }
      return { conv, respuestas: [texto(T.todaviaLeyendo(enCurso?.nombre ?? null))] };
    }

    case "esperando_confirmacion": {
      if (!enCurso || !clienteEnCurso) break;
      const cliente = clienteEnCurso;
      const ref = enCurso.ref;
      if (archivoNuevo) {
        efectos.push({ tipo: "descartar_archivo", ref: archivoNuevo.ref });
        return {
          conv,
          respuestas: [
            { tipo: "botones", texto: T.antesConfirmar(enCurso.nombre), botones: botonesConfirmar(conv.contexto.secuencia) },
          ],
        };
      }
      let decision: boolean | null = null;
      if (m.tipo === "boton") {
        const b = leerBoton(m.id);
        if (b && b.tipo === "confirmar" && b.secuencia === conv.contexto.secuencia) decision = b.si;
      }
      if (decision === null && cmd === "si") decision = true;
      if (decision === null && cmd === "no") decision = false;

      if (decision === true) {
        // "Cargado. …" sale cuando termina la carga (evento `carga`), con los números reales.
        efectos.push({ tipo: "cargar_extracto", clienteTenantId: cliente.clienteTenantId, ref });
        return { conv: limpiar(conv, "inicio"), respuestas: [] };
      }
      if (decision === false) {
        efectos.push({ tipo: "descartar_extracto", clienteTenantId: cliente.clienteTenantId, ref });
        return { conv: limpiar(conv, "inicio"), respuestas: [texto(T.extractoDescartado())] };
      }
      return {
        conv,
        respuestas: [
          {
            tipo: "botones",
            texto: T.repreguntarConfirmacion(cliente.alias),
            botones: botonesConfirmar(conv.contexto.secuencia),
          },
        ],
      };
    }

    default:
      break;
  }

  // inicio
  if (conv.estado !== "inicio") conv = limpiar(conv, "inicio");
  if (archivoNuevo) {
    if (clientes.length === 1) {
      return empezarLectura(conv, clientes[0], archivoNuevo, ahora, T.archivoRecibido(archivoNuevo.nombre), efectos);
    }
    return preguntarCliente(conv, clientes, archivoNuevo, ahora, T.elegirCliente);
  }
  if (m.tipo === "otro") return { conv, respuestas: [texto(T.tipoNoSoportado())] };
  const nombre = clientes.find((c) => c.nombreContacto)?.nombreContacto ?? null;
  return { conv, respuestas: [texto(T.saludoCliente(nombre, clientes.map((c) => c.alias)))] };
}

// ---------------------------------------------------------------------------
// Conocido: avisos del sistema (lectura, carga, facturas) — regla 5
// ---------------------------------------------------------------------------

type EventoDelSistema = Exclude<EventoBot, { tipo: "mensaje" } | { tipo: "vencimiento" } | { tipo: "liberar" }>;
type Paso = { conv: Conversacion; respuestas: Respuesta[] };

/**
 * Regla 5, en dos decisiones, cada una en UN solo lugar:
 *  a) Destinatario: el negocio del evento tiene que estar verificado para ESTE número. Si no,
 *     no se le escribe nada (ni texto, ni botones, ni plantilla, ni PDF) y lo que haya queda
 *     en la bandeja del estudio. Se decide acá, antes de mirar el tipo de evento.
 *  b) Ventana: texto libre sólo dentro de las 24 h desde el último mensaje del remitente.
 *     Fuera de la ventana, lectura y carga no escriben (queda la bandeja) y las facturas
 *     salen sólo por la plantilla aprobada. Una sola comprobación por tipo de evento.
 * El aviso de privacidad lo antepone `procesarEventoBot` (un solo lugar para mensajes y avisos).
 */
function eventoDelSistema(
  conv: Conversacion,
  evento: EventoDelSistema,
  clientes: ClienteDelRemitente[],
  ahora: Date,
  avisoPendiente: boolean,
  efectos: Efecto[],
): Paso {
  // a) Destinatario.
  const cliente = clientePorId(clientes, evento.clienteTenantId);
  if (!cliente) {
    efectos.push(...respaldo(evento));
    return { conv, respuestas: [] };
  }
  // b) Ventana.
  const enVentana = enVentanaWhatsapp(conv, ahora);

  switch (evento.tipo) {
    case "lectura":
      return lecturaTerminada(conv, evento, cliente, enVentana, ahora, efectos);
    case "carga":
      return cargaTerminada(conv, evento, enVentana, efectos);
    case "facturas_emitidas":
      return facturasDelCliente(conv, evento, cliente, enVentana, avisoPendiente, efectos);
  }
}

function lecturaTerminada(
  conv: Conversacion,
  evento: Extract<EventoBot, { tipo: "lectura" }>,
  cliente: ClienteDelRemitente,
  enVentana: boolean,
  ahora: Date,
  efectos: Efecto[],
): Paso {
  // El trámite es el PAR (archivo, negocio): el mismo archivo leído para otro negocio es otro trámite.
  const actual = conv.contexto.archivo;
  const delTramite = actual?.ref === evento.ref && conv.clienteTenantId === evento.clienteTenantId;
  if (!delTramite || conv.estado !== "leyendo") {
    // Repetida del trámite en curso (ya se contestó) → nada. Otra lectura (otro archivo, u otro
    // negocio con el mismo archivo, o a destiempo) → a la bandeja, sin escribirle al remitente.
    if (!delTramite) efectos.push(...respaldo(evento));
    return { conv, respuestas: [] };
  }
  const siguiente = limpiar(conv, "inicio");
  if (!enVentana) {
    // ok → sin confirmar; ilegible → a revisar; duplicado y foto no dejan nada pendiente.
    efectos.push(...respaldo(evento));
    return { conv: siguiente, respuestas: [] };
  }
  const r = evento.resultado;
  switch (r.tipo) {
    case "ilegible":
      efectos.push(...respaldo(evento));
      return { conv: siguiente, respuestas: [texto(T.extractoIlegible())] };
    case "duplicado": {
      const f = r.recibidoEn ? fechaValida(r.recibidoEn) : null;
      return { conv: siguiente, respuestas: [texto(T.extractoDuplicado(f ? dateStrInBusinessTz(f) : null))] };
    }
    case "foto":
      return { conv: siguiente, respuestas: [texto(T.fotoNoSoportada(r.banco ?? cliente.banco ?? null))] };
    case "ok": {
      // Pedir confirmación con botones atados a una secuencia nueva. El negocio sigue siendo
      // el del trámite (= el del evento, verificado hoy): es el que va a recibir la carga.
      const secuencia = conv.contexto.secuencia + 1;
      return {
        conv: {
          estado: "esperando_confirmacion",
          clienteTenantId: cliente.clienteTenantId,
          vence: mas(ahora, VENCE_TRAMITE_MS),
          silenciadoHasta: null,
          contexto: { ...conv.contexto, secuencia },
        },
        respuestas: [{ tipo: "botones", texto: T.extractoLeido(r, cliente.alias), botones: botonesConfirmar(secuencia) }],
      };
    }
  }
}

function cargaTerminada(
  conv: Conversacion,
  evento: Extract<EventoBot, { tipo: "carga" }>,
  enVentana: boolean,
  efectos: Efecto[],
): Paso {
  // Una carga fallida va a la bandeja SIEMPRE (se le pueda escribir o no).
  efectos.push(...respaldo(evento));
  if (!enVentana) return { conv, respuestas: [] };
  const r = evento.resultado;
  const t = r.ok ? T.extractoCargado(r.paraFacturar, r.necesitanDato) : T.cargaFallida(evento.nombreArchivo);
  return { conv, respuestas: [texto(t)] };
}

function facturasDelCliente(
  conv: Conversacion,
  evento: Extract<EventoBot, { tipo: "facturas_emitidas" }>,
  cliente: ClienteDelRemitente,
  enVentana: boolean,
  avisoPendiente: boolean,
  efectos: Efecto[],
): Paso {
  if (evento.cantidad <= 0) return { conv, respuestas: [] };
  const nombreMes = T.nombreDeMes(evento.mes);
  if (enVentana) {
    return {
      conv,
      respuestas: [
        texto(T.facturasEmitidas(evento.cantidad, nombreMes, cliente.alias, evento.total)),
        ...evento.comprobantes.map((c): Respuesta => ({ tipo: "documento", ref: c.ref, nombreArchivo: c.nombreArchivo })),
      ],
    };
  }
  // Fuera de la ventana de 24 h sólo se puede mandar una plantilla aprobada; los PDF quedan pendientes.
  efectos.push(...respaldo(evento));
  // La plantilla no puede llevar el aviso de privacidad, así que no puede ser el primer contacto
  // con un número: sin el aviso dado no sale (las facturas ya quedaron sin enviar, arriba).
  if (avisoPendiente) return { conv, respuestas: [] };
  return {
    conv,
    respuestas: [
      {
        tipo: "plantilla",
        nombre: T.PLANTILLA_COMPROBANTES_EMITIDOS,
        parametros: [
          String(evento.cantidad),
          nombreMes ?? "el período",
          T.unaLinea(cliente.alias),
          T.formatearPesos(evento.total),
        ],
      },
    ],
  };
}
