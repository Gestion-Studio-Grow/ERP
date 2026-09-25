// ============================================================================
// CONTRATO DE CONECTOR — la forma única de una integración (E3 §2.2).
// ============================================================================
//
// Un conector ES un módulo plugin: `ConectorDescriptor` extiende el `ModuleDescriptor` del
// catálogo (src/modules/contract.ts, ADR-054/055), así que no hay un catálogo paralelo. Su id
// es el del módulo ("whatsapp", "mercadopago", "arca") y la asignación por negocio sigue
// siendo `Tenant.modules`. Lo que agrega el contrato:
//
//   - `entrada`: cómo llega lo que manda el proveedor. Firma sobre los bytes crudos, de
//     dónde sale el secreto con que se verifica, y la normalización a EVENTOS CANÓNICOS.
//     Cada evento trae su CUENTA EXTERNA (phone_number_id, user_id, store_id) y su CLAVE DE
//     DEDUPLICACIÓN (`idExterno`, p.ej. el wamid).
//   - `salida`: qué acciones sabe hacer hacia el proveedor.
//   - `errores`: los códigos del catálogo (errores.ts) que puede producir.
//   - `simulador`: OBLIGATORIO. Sin simulador no entra al registro (registro.ts lo verifica
//     y registro.test.ts lo ejecuta: firma con el mismo algoritmo que verifica).
//
// Decisiones de seguridad que viven acá, puras y testeadas (contrato.test.ts):
//   1. `verificarFirmaFailClosed`: sin secreto → 503; firma mala, conector que tira o que
//      devuelve algo raro → 401. Sólo `{ ok: true }` literal deja pasar.
//   2. `agruparPorCuenta`: el negocio sale de la cuenta externa de CADA evento, nunca del
//      primero del lote ni del cuerpo en general. Un lote que mezcla dos cuentas se parte en
//      dos; un evento sin cuenta en modo "url-de-app" se descarta.
//   3. El `tenantId` NO es parte del evento canónico: lo pone la entrada con la conexión
//      resuelta. Un conector no puede declarar de qué negocio es algo.
//   4. `validarEventoCanonico`: lo que devuelve `normalizar` no se cree a ciegas.
//   5. `normalizarFailClosed` + `loFirmado`: a `normalizar` le llega SÓLO lo que cubre la
//      firma. Si la firma no cubre el cuerpo (Mercado Pago), el cuerpo no llega; los
//      encabezados y parámetros de la URL llegan sólo si el conector los declara firmados
//      (`encabezadosFirmados`, `consultaFirmada`), y registro.ts comprueba que la firma de
//      verdad los cubre. Así la cuenta externa (qué negocio) y la clave de deduplicación no
//      pueden salir de bytes sin firma: con una firma capturada y el resto cambiado, el
//      evento es el mismo.
//   6. `responderDesafioFailClosed`: el GET de verificación (Meta) sin token esperado → 503,
//      sin llamar al conector; el eco sólo con letras, dígitos, "_" y "-".
//   7. `validarConector`: cada campo de credencial tiene que salir tapado por el logger
//      GENERAL de la suite (`seTapaEnLosLogs`, que ejecuta esa redacción); declararlo en
//      `redaccion.secretas` no alcanza porque ese logger no conoce las listas del conector.
//   8. Los ids (`idExterno`, `cuentaExterna`) no traen espacios en los bordes ni invisibles:
//      " pago-1" sería otra clave de deduplicación del mismo pago.
//
// DATO PURO + validación pura: sin Prisma, sin red, sin node:crypto. Lo pueden importar el
// servidor, el cliente y los tests (como src/apps/contract.ts).

import { validarDescriptor, type ModuleDescriptor, type ProblemaCatalogo } from "@/modules/contract";
import { esCodigoError, type CodigoError } from "./errores";
import { seTapaEnLosLogs, type ClavesARedactar } from "./redaccion";

// ── Categorías y autenticación ───────────────────────────────────────────────

export const CATEGORIAS_CONECTOR = [
  "cobros",
  "fiscal",
  "bancos",
  "ventas-online",
  "mensajeria",
  "planillas",
  "avanzado",
] as const;
export type CategoriaConector = (typeof CATEGORIAS_CONECTOR)[number];

/** Cómo se autoriza el conector ante el proveedor. */
export type AuthConector =
  | { tipo: "oauth"; scopes: readonly string[] }
  | { tipo: "clave"; campos: readonly string[] }
  | { tipo: "certificado" }
  | { tipo: "token-sistema" }
  | { tipo: "ninguna" };

// ── Entrada cruda y firma ────────────────────────────────────────────────────

/** La request tal como llegó, antes de parsear nada. */
export interface EntradaCruda {
  metodo: "GET" | "POST";
  /**
   * Encabezados con el nombre en MINÚSCULAS (como los da `Headers`). Es obligatorio: con dos
   * nombres que difieren sólo en mayúsculas, el verificador y `normalizar` podrían leer uno
   * distinto cada uno. `verificarFirmaFailClosed` y `normalizarFailClosed` rechazan otra forma.
   */
  encabezados: Readonly<Record<string, string>>;
  /** Parámetros de la URL. */
  consulta: Readonly<Record<string, string>>;
  /** Bytes crudos del cuerpo: la firma se calcula sobre esto, antes de parsear el JSON. */
  cuerpo: Uint8Array;
}

/** Lee un encabezado sin importar mayúsculas. null si no está. */
export function encabezado(req: EntradaCruda, nombre: string): string | null {
  const buscado = nombre.toLowerCase();
  for (const [k, v] of Object.entries(req.encabezados)) {
    if (k.toLowerCase() === buscado) return v;
  }
  return null;
}

/** ¿Todos los nombres de encabezado vienen en minúsculas? (la forma que exige el contrato) */
export function encabezadosCanonicos(req: EntradaCruda): boolean {
  if (!req || typeof req !== "object" || !req.encabezados || typeof req.encabezados !== "object") return false;
  return Object.keys(req.encabezados).every((k) => k === k.toLowerCase());
}

/** El cuerpo como JSON. Vacío → null. Si no es JSON válido, lanza (la entrada responde 400). */
export function parsearCuerpoJson(req: EntradaCruda): unknown {
  if (req.cuerpo.byteLength === 0) return null;
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(req.cuerpo);
  return JSON.parse(texto);
}

export const MOTIVOS_FIRMA_RECHAZADA = [
  "sin_secreto",
  "sin_firma",
  "firma_invalida",
  "fuera_de_ventana",
] as const;
export type MotivoFirmaRechazada = (typeof MOTIVOS_FIRMA_RECHAZADA)[number];

export type ResultadoFirma = { ok: true } | { ok: false; motivo: MotivoFirmaRechazada };

/**
 * De dónde sale el secreto con que se verifica la firma:
 *  - "entorno": un secreto de la APLICACIÓN de GSG en el proveedor (uno para todos los
 *    negocios; p.ej. WHATSAPP_APP_SECRET). Va con el modo "url-de-app".
 *  - "conexion": un secreto propio de cada conexión, guardado cifrado en
 *    IntegracionCredencial (p.ej. "webhook_secret" de WooCommerce). Va con "url-por-conexion".
 */
export type SecretoDeFirma =
  | { origen: "entorno"; variable: string }
  | { origen: "conexion"; campo: string };

/**
 * Cómo llega el aviso del proveedor (E3 §2.4):
 *  - "url-de-app": una URL para toda la aplicación; el negocio sale de la cuenta externa de
 *    cada evento → IntegracionConexion @@unique([conector, cuentaExterna]).
 *  - "url-por-conexion": una URL con un token opaco por conexión; el negocio sale de la ruta.
 */
export type ModoEntrada = "url-de-app" | "url-por-conexion";

/** Respuesta al GET de verificación que piden algunos proveedores (Meta: hub.challenge). */
export interface RespuestaDesafio {
  estado: number;
  cuerpo: string;
}

// ── Eventos canónicos ────────────────────────────────────────────────────────

/**
 * El vocabulario interno de la suite. Los handlers del Core se suscriben a esto, no al
 * payload de cada proveedor.
 */
export const TIPOS_EVENTO_CANONICO = [
  "pedido.creado",
  "pedido.pagado",
  "stock.pedido",
  "pago.acreditado",
  "mensaje.recibido",
  "mensaje.estado",
  "archivo.recibido",
  "conexion.revocada",
] as const;
export type TipoEventoCanonico = (typeof TIPOS_EVENTO_CANONICO)[number];

/** Detalle libre del proveedor para los eventos que refinan los conectores de tienda y cobro. */
export type DetalleProveedor = Readonly<Record<string, unknown>>;

export interface DatosEventoCanonico {
  "pedido.creado": { pedidoExterno: string; detalle: DetalleProveedor };
  "pedido.pagado": { pedidoExterno: string; detalle: DetalleProveedor };
  "stock.pedido": { productoExterno: string | null; detalle: DetalleProveedor };
  "pago.acreditado": { pagoExterno: string; detalle: DetalleProveedor };
  /**
   * Un mensaje entrante (WhatsApp y similares). Si trae un archivo, acá va sólo la REFERENCIA
   * que declara el proveedor: el archivo se baja después y, verificado, sale como
   * `archivo.recibido`.
   */
  "mensaje.recibido": {
    remitente: string;
    idMensaje: string;
    clase: "texto" | "documento" | "imagen" | "interactivo" | "otro";
    texto: string | null;
    /** Id de la opción elegida en un mensaje interactivo. */
    opcion: string | null;
    adjunto: {
      mediaId: string;
      mimeDeclarado: string | null;
      nombre: string | null;
      sha256Declarado: string | null;
    } | null;
  };
  /** Estado de entrega de un mensaje que mandamos. */
  "mensaje.estado": {
    idMensaje: string;
    estado: "enviado" | "entregado" | "leido" | "fallido";
    destinatario: string | null;
    codigoProveedor: string | null;
  };
  /**
   * Un archivo ya bajado y verificado (E3 §4.1): tamaño, sha256 calculado sobre los bytes y
   * tipo detectado por bytes mágicos, no por lo que dice el remitente. El CONTENIDO no viaja
   * en el evento (el evento se guarda redactado en EventoIntegracion): la entrada se lo pasa
   * al handler aparte.
   */
  "archivo.recibido": {
    remitente: string;
    idMensaje: string;
    nombre: string | null;
    mime: string;
    tamanio: number;
    sha256: string;
  };
  "conexion.revocada": { motivo: string | null };
}

export interface EventoCanonico<T extends TipoEventoCanonico = TipoEventoCanonico> {
  tipo: T;
  /** Clave de deduplicación dentro de la conexión (wamid, id de pedido + acción…). */
  idExterno: string;
  /**
   * Cuenta del proveedor a la que pertenece el evento (phone_number_id, user_id, store_id).
   * Obligatoria en "url-de-app"; en "url-por-conexion" puede ser null (manda la ruta).
   */
  cuentaExterna: string | null;
  /** Cuándo ocurrió según el proveedor (ISO 8601), si lo informa. */
  ocurridoEn: string | null;
  datos: DatosEventoCanonico[T];
}

/** Campos obligatorios de `datos` por tipo (lo que se chequea en runtime). */
const REQUERIDOS: Readonly<Record<TipoEventoCanonico, readonly string[]>> = {
  "pedido.creado": ["pedidoExterno"],
  "pedido.pagado": ["pedidoExterno"],
  "stock.pedido": [],
  "pago.acreditado": ["pagoExterno"],
  "mensaje.recibido": ["remitente", "idMensaje", "clase"],
  "mensaje.estado": ["idMensaje", "estado"],
  "archivo.recibido": ["remitente", "idMensaje", "mime", "tamanio", "sha256"],
  "conexion.revocada": [],
};

const LARGO_MAXIMO_ID = 255;

/**
 * Caracteres de control e invisibles (guion blando, espacios de ancho cero, marcas de
 * dirección, BOM): dos ids que se ven iguales no pueden ser dos claves distintas.
 */
const RE_CARACTER_INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;

/**
 * Texto de id: no vacío, acotado, sin espacios en los bordes y sin caracteres de control ni
 * invisibles. " pago-1" y "pago-1" serían dos claves de deduplicación del mismo pago.
 */
function esIdValido(x: unknown): x is string {
  return (
    typeof x === "string" &&
    x.length > 0 &&
    x.length <= LARGO_MAXIMO_ID &&
    x.trim() === x &&
    !RE_CARACTER_INVISIBLE.test(x)
  );
}

export function esTipoEventoCanonico(x: unknown): x is TipoEventoCanonico {
  return typeof x === "string" && (TIPOS_EVENTO_CANONICO as readonly string[]).includes(x);
}

/**
 * Valida en runtime un evento que devolvió un conector. Devuelve la lista de problemas
 * (vacía = válido). Lo que no pasa no se guarda ni se procesa.
 */
export function validarEventoCanonico(e: unknown): string[] {
  const p: string[] = [];
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["el evento no es un objeto"];
  const ev = e as Record<string, unknown>;
  if (!esTipoEventoCanonico(ev.tipo)) p.push(`tipo desconocido: ${String(ev.tipo)}`);
  if (!esIdValido(ev.idExterno)) {
    p.push("idExterno vacío, demasiado largo, con espacios en los bordes o con caracteres de control o invisibles");
  }
  if (ev.cuentaExterna !== null && !esIdValido(ev.cuentaExterna)) {
    p.push("cuentaExterna tiene que ser null o un id válido");
  }
  if (ev.ocurridoEn !== null && (typeof ev.ocurridoEn !== "string" || Number.isNaN(Date.parse(ev.ocurridoEn)))) {
    p.push("ocurridoEn tiene que ser null o una fecha ISO");
  }
  const datos = ev.datos;
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    p.push("datos tiene que ser un objeto");
    return p;
  }
  if (esTipoEventoCanonico(ev.tipo)) {
    const d = datos as Record<string, unknown>;
    for (const campo of REQUERIDOS[ev.tipo]) {
      if (d[campo] === undefined || d[campo] === null || d[campo] === "") {
        p.push(`${ev.tipo}: falta datos.${campo}`);
      }
    }
    if (ev.tipo === "archivo.recibido") {
      if (typeof d.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(d.sha256)) {
        p.push("archivo.recibido: sha256 tiene que ser hex de 64 caracteres en minúsculas");
      }
      if (typeof d.tamanio !== "number" || !Number.isInteger(d.tamanio) || d.tamanio < 0) {
        p.push("archivo.recibido: tamanio tiene que ser un entero no negativo");
      }
    }
  }
  return p;
}

/**
 * Parte un lote por cuenta externa ("url-de-app"). Cada grupo se resuelve a SU conexión y se
 * procesa en el contexto de SU negocio. Los eventos sin cuenta van a `sinCuenta` y no se
 * procesan: en este modo, sin cuenta no hay negocio.
 */
export function agruparPorCuenta(eventos: readonly EventoCanonico[]): {
  porCuenta: Map<string, EventoCanonico[]>;
  sinCuenta: EventoCanonico[];
} {
  const porCuenta = new Map<string, EventoCanonico[]>();
  const sinCuenta: EventoCanonico[] = [];
  for (const e of eventos) {
    if (!esIdValido(e.cuentaExterna)) {
      sinCuenta.push(e);
      continue;
    }
    const grupo = porCuenta.get(e.cuentaExterna);
    if (grupo) grupo.push(e);
    else porCuenta.set(e.cuentaExterna, [e]);
  }
  return { porCuenta, sinCuenta };
}

// ── Anti-replay ──────────────────────────────────────────────────────────────

/** Ventana contra el replay cuando el proveedor firma un instante (E3 §2.4, paso 4). */
export const VENTANA_ANTI_REPLAY_MS = 5 * 60_000;

/** ¿El instante firmado (en ms) está a no más de `ventanaMs` de ahora, para atrás o adelante? */
export function dentroDeVentana(
  instanteFirmadoMs: number,
  ahora: Date,
  ventanaMs: number = VENTANA_ANTI_REPLAY_MS,
): boolean {
  if (!Number.isFinite(instanteFirmadoMs) || !Number.isFinite(ventanaMs) || ventanaMs < 0) return false;
  const t = ahora.getTime();
  if (!Number.isFinite(t)) return false;
  return Math.abs(t - instanteFirmadoMs) <= ventanaMs;
}

// ── Salida, transporte y prueba de conexión ──────────────────────────────────

export interface AccionSalida {
  /** kebab-case: "enviar-mensaje", "publicar-stock", "notificar-webhook". */
  id: string;
  descripcion: string;
}

export interface SalidaConector {
  acciones: readonly AccionSalida[];
}

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SolicitudHttp {
  metodo: MetodoHttp;
  encabezados?: Readonly<Record<string, string>>;
  cuerpo?: Uint8Array | string;
}

export interface RespuestaHttp {
  estado: number;
  /** Nombres en minúsculas. */
  encabezados: Readonly<Record<string, string>>;
  cuerpo: Uint8Array;
}

/**
 * Cómo un conector habla hacia afuera. En producción es la guardia SSRF
 * (`transporteSeguro`, ssrf.ts); en los tests y en el laboratorio, el del simulador.
 */
export type TransporteHttp = (url: string, solicitud: SolicitudHttp) => Promise<RespuestaHttp>;

export interface CtxPrueba {
  /** Credenciales de la conexión ya abiertas (sólo en memoria, nunca a un log). */
  credenciales: Readonly<Record<string, string>>;
  transporte: TransporteHttp;
  ahora: Date;
}

/** Resultado del botón "Probar conexión": no escribe nada en ningún lado. */
export type ResultadoPrueba = { ok: true; detalle: string } | { ok: false; codigo: CodigoError };

export interface LimitesConector {
  /** Tope de llamadas por minuto hacia el proveedor, por conexión. */
  porMinuto: number;
  /**
   * Eventos por mes según el plan (id del catálogo de planes). null = sin tope. Un plan que no
   * figura no tiene el conector. Provisional a confirmar (E2/E3 §2.7).
   */
  eventosMesPorPlan: Readonly<Record<string, number | null>>;
}

// ── Simulador ────────────────────────────────────────────────────────────────

/** Un caso del simulador: la request exacta que mandaría el proveedor, firmada. */
export interface EscenarioEntrada {
  id: string;
  descripcion: string;
  /** Arma la request cruda firmada con `secreto`, con el mismo algoritmo que verifica la entrada. */
  armar(secreto: string, ahora: Date): EntradaCruda;
  esperado: {
    /** Tipos de evento que tiene que producir `normalizar`, en orden. */
    tipos: readonly TipoEventoCanonico[];
    /** Cuenta externa de esos eventos (null sólo en "url-por-conexion"). */
    cuentaExterna: string | null;
  };
  /**
   * Copias adulteradas de la request que la entrada TIENE que rechazar, además de las que
   * arma solo registro.ts (cada encabezado y parámetro firmado cambiado o sacado). Sirven para
   * lo que una alteración genérica no toca: el instante adentro de la firma, por ejemplo.
   * Obligatorias si la firma no cubre el cuerpo.
   */
  alteraciones?(req: EntradaCruda): EntradaCruda[];
}

export interface SimuladorConector {
  /** De dónde salió la forma del payload (URL de la documentación). "A verificar contra tráfico real". */
  fuente: string;
  escenarios: readonly EscenarioEntrada[];
  /** Transporte falso para la salida y para `probarConexion`. Obligatorio si hay `salida`. */
  transporte?: TransporteHttp;
  /** El GET de verificación que manda el proveedor con `tokenEsperado`. Obligatorio si hay `entrada.desafio`. */
  desafio?(tokenEsperado: string): EntradaCruda;
}

// ── El conector ──────────────────────────────────────────────────────────────

export interface EntradaConector {
  modo: ModoEntrada;
  secretoFirma: SecretoDeFirma;
  /**
   * Por defecto la firma cubre los bytes crudos del cuerpo (Meta, WooCommerce, Tiendanube) y
   * el simulador se prueba alterando el cuerpo. `false` si el proveedor firma otra cosa: Mercado
   * Pago firma "id;request-id;ts" y no el cuerpo (src/plugins/mercadopago/signature.ts:6-9).
   * Entonces el cuerpo NO LLEGA a `normalizar` (`loFirmado`): el evento sale sólo de los
   * encabezados y parámetros firmados, y el handler vuelve a pedir el recurso con la credencial
   * del negocio. Hace falta declarar qué se firma (`encabezadosFirmados` / `consultaFirmada`) y
   * el simulador tiene que traer `alteraciones`.
   *
   * Consecuencia a propósito: en modo "url-de-app" la cuenta externa tiene que estar firmada.
   * Un proveedor que no firma la cuenta (el user_id de Mercado Pago va en el cuerpo) no puede
   * rutear por cuenta hasta que se diseñe la verificación volviendo a pedir el recurso (R5).
   */
  firmaCubreCuerpo?: boolean;
  /**
   * Encabezados que la firma cubre, en minúsculas. SÓLO estos llegan a `normalizar`; el resto
   * no. registro.ts comprueba que cambiar o sacar cada uno haga fallar la firma.
   */
  encabezadosFirmados?: readonly string[];
  /** Parámetros de la URL que la firma cubre (Mercado Pago: "data.id"). Misma regla. */
  consultaFirmada?: readonly string[];
  /**
   * La firma incluye un instante (Mercado Pago: ts). Entonces `verificarFirma` tiene que
   * rechazar lo que cae fuera de `VENTANA_ANTI_REPLAY_MS` (con `dentroDeVentana`), y
   * registro.ts lo prueba armando el escenario 6 minutos antes y 6 después.
   */
  firmaIncluyeInstante?: boolean;
  /** PURA y en tiempo constante. No lanza (si lanza, cuenta como firma inválida). */
  verificarFirma(req: EntradaCruda, secreto: string, ahora: Date): ResultadoFirma;
  /**
   * Lo firmado ya parseado → eventos canónicos. PURA. Se llama SÓLO por `normalizarFailClosed`:
   * `payload` es el cuerpo (null si la firma no lo cubre) y `req` trae sólo lo firmado.
   */
  normalizar(payload: unknown, req: EntradaCruda): EventoCanonico[];
  /**
   * GET de verificación (Meta). La variable de entorno guarda el token esperado. Se llama SÓLO
   * por `responderDesafioFailClosed`. Compara en tiempo constante; null = rechazo.
   */
  desafio?: {
    variable: string;
    responder(req: EntradaCruda, tokenEsperado: string): RespuestaDesafio | null;
  };
}

export interface ConectorDescriptor extends ModuleDescriptor {
  /** Un conector es siempre una integración externa (ADR-002). */
  kind: "plugin";
  categoria: CategoriaConector;
  auth: AuthConector;
  entrada?: EntradaConector;
  salida?: SalidaConector;
  probarConexion(ctx: CtxPrueba): Promise<ResultadoPrueba>;
  limites: LimitesConector;
  /** Códigos del catálogo (errores.ts) que puede producir. */
  errores: readonly CodigoError[];
  /** OBLIGATORIO: sin simulador no entra al registro. */
  simulador: () => SimuladorConector;
  /**
   * Campos propios del payload de este proveedor que hay que redactar: rige para el payload
   * guardado y para `logDelConector` (log.ts), NO para `logIntegraciones`. Por eso un campo de
   * credencial no se "arregla" declarándolo acá: su nombre tiene que taparse solo.
   */
  redaccion?: ClavesARedactar;
}

// ── Decisiones puras de la entrada ───────────────────────────────────────────

/**
 * Verifica la firma de un aviso, cerrado ante cualquier duda:
 *  - sin `entrada` → firma_invalida (ese conector no recibe avisos);
 *  - secreto ausente o vacío → sin_secreto, SIN llamar al conector;
 *  - encabezados que no vienen en minúsculas → firma_invalida, sin llamar al conector;
 *  - el conector lanza → firma_invalida;
 *  - sólo `{ ok: true }` (true booleano) pasa; cualquier otra cosa es rechazo.
 */
export function verificarFirmaFailClosed(
  conector: Pick<ConectorDescriptor, "entrada">,
  req: EntradaCruda,
  secreto: string | null | undefined,
  ahora: Date,
): ResultadoFirma {
  const entrada = conector.entrada;
  if (!entrada || typeof entrada.verificarFirma !== "function") return { ok: false, motivo: "firma_invalida" };
  if (typeof secreto !== "string" || secreto.trim() === "") return { ok: false, motivo: "sin_secreto" };
  if (!encabezadosCanonicos(req)) return { ok: false, motivo: "firma_invalida" };
  let r: unknown;
  try {
    r = entrada.verificarFirma(req, secreto, ahora);
  } catch {
    return { ok: false, motivo: "firma_invalida" };
  }
  if (r && typeof r === "object" && (r as { ok?: unknown }).ok === true) return { ok: true };
  const motivo = r && typeof r === "object" ? (r as { motivo?: unknown }).motivo : undefined;
  if (typeof motivo === "string" && (MOTIVOS_FIRMA_RECHAZADA as readonly string[]).includes(motivo)) {
    return { ok: false, motivo: motivo as MotivoFirmaRechazada };
  }
  return { ok: false, motivo: "firma_invalida" };
}

/** Estado HTTP para un rechazo de firma: sin secreto 503, el resto 401. null = siga. */
export function estadoHttpPorFirma(r: ResultadoFirma): 401 | 503 | null {
  if (r.ok === true) return null;
  return r.motivo === "sin_secreto" ? 503 : 401;
}

/**
 * La request reducida a lo que cubre la firma: el cuerpo sólo si la firma lo cubre, y sólo
 * los encabezados y parámetros declarados firmados. Es lo único que ve `normalizar`.
 * `Object.fromEntries` crea propiedades propias: un parámetro "__proto__" no toca prototipos.
 */
export function loFirmado(
  entrada: Pick<EntradaConector, "firmaCubreCuerpo" | "encabezadosFirmados" | "consultaFirmada">,
  req: EntradaCruda,
): EntradaCruda {
  const encabezados = new Set(entrada.encabezadosFirmados ?? []);
  const consulta = new Set(entrada.consultaFirmada ?? []);
  const propias = (o: Readonly<Record<string, string>>, permitidas: ReadonlySet<string>) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => permitidas.has(k)));
  return {
    metodo: req.metodo,
    encabezados: propias(req.encabezados, encabezados),
    consulta: propias(req.consulta ?? {}, consulta),
    cuerpo: entrada.firmaCubreCuerpo === false ? new Uint8Array(0) : req.cuerpo,
  };
}

export type ResultadoNormalizacion =
  | {
      ok: true;
      /** Los eventos válidos, en orden. */
      eventos: EventoCanonico[];
      /** Los que `validarEventoCanonico` rechazó: no se guardan ni se procesan. */
      descartados: Array<{ indice: number; problemas: string[] }>;
    }
  | {
      ok: false;
      /** sin_entrada → 404; cuerpo_invalido → 400; normalizar_fallo → 500 (error_interno). */
      motivo: "sin_entrada" | "cuerpo_invalido" | "normalizar_fallo";
      /** Para el log redactado (logIntegraciones), nunca para el cliente. */
      detalle: string;
    };

/**
 * La ÚNICA forma de pasar de una request (con la firma ya verificada) a eventos canónicos.
 * `normalizar` recibe `loFirmado(req)`: lo que no cubre la firma no llega. Si el conector
 * lanza o devuelve algo que no es una lista, es falla; cada evento se valida y el que no pasa
 * queda en `descartados`.
 */
export function normalizarFailClosed(
  conector: Pick<ConectorDescriptor, "entrada">,
  req: EntradaCruda,
): ResultadoNormalizacion {
  const entrada = conector.entrada;
  if (!entrada || typeof entrada.normalizar !== "function") {
    return { ok: false, motivo: "sin_entrada", detalle: "el conector no recibe avisos" };
  }
  if (!encabezadosCanonicos(req)) {
    return { ok: false, motivo: "cuerpo_invalido", detalle: "encabezados con mayúsculas: la entrada los pasa en minúsculas" };
  }
  const firmado = loFirmado(entrada, req);
  let payload: unknown;
  try {
    payload = parsearCuerpoJson(firmado);
  } catch {
    return { ok: false, motivo: "cuerpo_invalido", detalle: "el cuerpo no es JSON UTF-8 válido" };
  }
  let r: unknown;
  try {
    r = entrada.normalizar(payload, firmado);
  } catch (e) {
    return { ok: false, motivo: "normalizar_fallo", detalle: `normalizar lanzó: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(r)) return { ok: false, motivo: "normalizar_fallo", detalle: "normalizar no devolvió una lista" };
  const eventos: EventoCanonico[] = [];
  const descartados: Array<{ indice: number; problemas: string[] }> = [];
  r.forEach((ev: unknown, indice) => {
    const problemas = validarEventoCanonico(ev);
    if (problemas.length === 0) eventos.push(ev as EventoCanonico);
    else descartados.push({ indice, problemas });
  });
  return { ok: true, eventos, descartados };
}

/**
 * El eco del desafío: Meta manda un número. Sólo letras, dígitos, "_" y "-", hasta 256: el
 * eco sale del proveedor y vuelve tal cual, así que no puede traer marcado ni saltos de
 * línea. La entrada (R1-F1) lo responde como text/plain.
 */
const RE_ECO_DESAFIO = /^[0-9A-Za-z_-]{1,256}$/;

/**
 * Responde el GET de verificación, cerrado ante cualquier duda:
 *  - el conector no tiene desafío → 404;
 *  - token esperado ausente o vacío → 503, SIN llamar al conector (con la variable vacía, un
 *    responder ingenuo aceptaría un token vacío);
 *  - el conector lanza, devuelve null o algo que no sea { estado: 200, cuerpo: eco } → 403, con
 *    eco de 1 a 256 letras, dígitos, "_" o "-" (se responde como text/plain).
 */
export function responderDesafioFailClosed(
  conector: Pick<ConectorDescriptor, "entrada">,
  req: EntradaCruda,
  tokenEsperado: string | null | undefined,
): RespuestaDesafio {
  const desafio = conector.entrada?.desafio;
  if (!desafio || typeof desafio.responder !== "function") return { estado: 404, cuerpo: "" };
  if (typeof tokenEsperado !== "string" || tokenEsperado.trim() === "") return { estado: 503, cuerpo: "" };
  let r: unknown;
  try {
    r = desafio.responder(req, tokenEsperado);
  } catch {
    return { estado: 403, cuerpo: "" };
  }
  const { estado, cuerpo } = (r && typeof r === "object" ? r : {}) as { estado?: unknown; cuerpo?: unknown };
  if (estado !== 200 || typeof cuerpo !== "string" || !RE_ECO_DESAFIO.test(cuerpo)) {
    return { estado: 403, cuerpo: "" };
  }
  return { estado: 200, cuerpo };
}

// ── Validación del descriptor ────────────────────────────────────────────────

const RE_KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const RE_VARIABLE_ENTORNO = /^[A-Z][A-Z0-9_]*$/;
const RE_CAMPO = /^[a-z][a-z0-9_]*$/;
/** Nombre de encabezado en minúsculas (token de RFC 9110 acotado). */
const RE_ENCABEZADO = /^[a-z0-9][a-z0-9-]*$/;
/** Nombre de parámetro de URL: letras, dígitos, "_", "-", "." y corchetes ("data.id", "a[b]"). */
const RE_PARAMETRO = /^[A-Za-z0-9][A-Za-z0-9_.\-[\]]*$/;

/** Lista opcional de nombres: array de textos válidos y sin repetir. */
function validarListaDeNombres(
  lista: unknown,
  re: RegExp,
  que: string,
  err: (m: string) => void,
): string[] {
  if (lista === undefined) return [];
  if (!Array.isArray(lista)) {
    err(`${que} tiene que ser una lista.`);
    return [];
  }
  const vistos = new Set<string>();
  for (const n of lista as unknown[]) {
    if (typeof n !== "string" || !re.test(n)) err(`${que}: nombre inválido "${String(n)}".`);
    else if (vistos.has(n)) err(`${que}: "${n}" repetido.`);
    else vistos.add(n);
  }
  return [...vistos];
}

const esFuncion = (x: unknown): boolean => typeof x === "function";
const esEnteroNoNegativo = (x: unknown): boolean => typeof x === "number" && Number.isInteger(x) && x >= 0;

/**
 * Valida la forma de UN conector: primero como módulo (`validarDescriptor`) y después lo
 * propio del conector. Se escribe contra `unknown` porque lo que llega puede venir de un cast.
 * Los chequeos que miran el registro entero (ids repetidos, catálogo) los hace registro.ts.
 */
export function validarConector(entrada: unknown): ProblemaCatalogo[] {
  if (!entrada || typeof entrada !== "object") {
    return [{ moduloId: "(sin id)", severidad: "error", mensaje: "el conector no es un objeto" }];
  }
  const c = entrada as Partial<ConectorDescriptor> & Record<string, unknown>;
  const id = typeof c.id === "string" && c.id ? c.id : "(sin id)";
  const problemas: ProblemaCatalogo[] = validarDescriptor(c as ModuleDescriptor);
  const err = (mensaje: string) => problemas.push({ moduloId: id, severidad: "error", mensaje });

  if (c.kind !== "plugin") err(`un conector es un módulo "plugin"; vino kind "${String(c.kind)}".`);
  if (!(CATEGORIAS_CONECTOR as readonly unknown[]).includes(c.categoria)) {
    err(`categoria inválida: "${String(c.categoria)}".`);
  }

  // Todo campo de credencial (se guarda cifrado en IntegracionCredencial) tiene que salir
  // tapado por el logger GENERAL de la suite (logIntegraciones), que no conoce las listas de
  // ningún conector: `seTapaEnLosLogs` ejecuta esa misma redacción sin listas extra. Sumarlo a
  // `redaccion.secretas` NO alcanza (eso tapa el payload guardado y el logger del conector,
  // no logIntegraciones): el nombre tiene que ser de secreto (clave_…, token, secret, llave…).
  const exigirRedactable = (campo: string, donde: string) => {
    if (!seTapaEnLosLogs(campo)) {
      err(
        `${donde}: el campo de credencial "${campo}" sale en claro por el logger de la suite; usá un nombre de secreto (clave_…, …_token, …_secret, llave_…). redaccion.secretas no alcanza: el logger general no la conoce.`,
      );
    }
  };

  // Autenticación.
  const auth = c.auth as AuthConector | undefined;
  if (!auth || typeof auth !== "object") err("falta auth.");
  else if (auth.tipo === "oauth") {
    if (!Array.isArray(auth.scopes)) err("auth oauth sin lista de scopes.");
  } else if (auth.tipo === "clave") {
    if (!Array.isArray(auth.campos) || auth.campos.length === 0) err("auth clave sin campos.");
    else {
      for (const campo of auth.campos) {
        if (typeof campo !== "string" || !RE_CAMPO.test(campo)) err(`auth: campo inválido "${String(campo)}".`);
        else exigirRedactable(campo, "auth");
      }
    }
  } else if (!["certificado", "token-sistema", "ninguna"].includes((auth as { tipo?: string }).tipo ?? "")) {
    err(`auth.tipo inválido: "${String((auth as { tipo?: unknown }).tipo)}".`);
  }

  // Entrada.
  const en = c.entrada as EntradaConector | undefined;
  if (en !== undefined) {
    if (!en || typeof en !== "object") err("entrada tiene que ser un objeto.");
    else {
      if (en.modo !== "url-de-app" && en.modo !== "url-por-conexion") err(`entrada.modo inválido: "${String(en.modo)}".`);
      if (!esFuncion(en.verificarFirma)) err("entrada sin verificarFirma: toda entrada verifica firma.");
      if (!esFuncion(en.normalizar)) err("entrada sin normalizar.");
      if (en.firmaCubreCuerpo !== undefined && typeof en.firmaCubreCuerpo !== "boolean") {
        err("entrada.firmaCubreCuerpo tiene que ser true o false.");
      }
      if (en.firmaIncluyeInstante !== undefined && typeof en.firmaIncluyeInstante !== "boolean") {
        err("entrada.firmaIncluyeInstante tiene que ser true o false.");
      }
      const encabezadosFirmados = validarListaDeNombres(
        en.encabezadosFirmados,
        RE_ENCABEZADO,
        "entrada.encabezadosFirmados (en minúsculas)",
        err,
      );
      const consultaFirmada = validarListaDeNombres(en.consultaFirmada, RE_PARAMETRO, "entrada.consultaFirmada", err);
      if (en.firmaCubreCuerpo === false && encabezadosFirmados.length === 0 && consultaFirmada.length === 0) {
        err(
          "la firma no cubre el cuerpo y no se declara ningún encabezado ni parámetro firmado: normalizar no tendría de dónde sacar el evento.",
        );
      }
      const s = en.secretoFirma as SecretoDeFirma | undefined;
      if (!s || typeof s !== "object") err("entrada sin secretoFirma.");
      else if (s.origen === "entorno") {
        if (!RE_VARIABLE_ENTORNO.test(s.variable ?? "")) err(`secretoFirma.variable inválida: "${String(s.variable)}".`);
        if (en.modo !== "url-de-app") err('un secreto de entorno (de la aplicación) va con modo "url-de-app".');
      } else if (s.origen === "conexion") {
        if (!RE_CAMPO.test(s.campo ?? "")) err(`secretoFirma.campo inválido: "${String(s.campo)}".`);
        else exigirRedactable(s.campo, "secretoFirma");
        if (en.modo !== "url-por-conexion") err('un secreto por conexión va con modo "url-por-conexion".');
      } else err(`secretoFirma.origen inválido: "${String((s as { origen?: unknown }).origen)}".`);
      if (en.desafio !== undefined) {
        if (!en.desafio || !RE_VARIABLE_ENTORNO.test(en.desafio.variable ?? "")) err("desafio.variable inválida.");
        if (!en.desafio || !esFuncion(en.desafio.responder)) err("desafio sin responder.");
      }
    }
  }

  // Salida.
  const sa = c.salida as SalidaConector | undefined;
  if (sa !== undefined) {
    if (!sa || !Array.isArray(sa.acciones) || sa.acciones.length === 0) err("salida sin acciones.");
    else {
      const vistas = new Set<string>();
      for (const a of sa.acciones) {
        if (!a || !RE_KEBAB.test(a.id ?? "")) err(`acción de salida con id inválido: "${String(a?.id)}".`);
        else if (vistas.has(a.id)) err(`acción de salida repetida: "${a.id}".`);
        else vistas.add(a.id);
        if (!a?.descripcion?.trim()) err(`acción "${String(a?.id)}" sin descripción.`);
      }
    }
  }

  if (!esFuncion(c.probarConexion)) err("falta probarConexion.");

  // Límites.
  const lim = c.limites as LimitesConector | undefined;
  if (!lim || typeof lim !== "object") err("faltan limites.");
  else {
    if (typeof lim.porMinuto !== "number" || !Number.isInteger(lim.porMinuto) || lim.porMinuto <= 0) {
      err("limites.porMinuto tiene que ser un entero positivo.");
    }
    if (!lim.eventosMesPorPlan || typeof lim.eventosMesPorPlan !== "object") err("faltan limites.eventosMesPorPlan.");
    else {
      for (const [plan, tope] of Object.entries(lim.eventosMesPorPlan)) {
        if (tope !== null && !esEnteroNoNegativo(tope)) err(`limites.eventosMesPorPlan.${plan} inválido.`);
      }
    }
  }

  // Errores declarados: cada uno tiene que existir en el catálogo (su texto y su acción).
  if (!Array.isArray(c.errores)) err("falta la lista de errores.");
  else {
    const vistos = new Set<string>();
    for (const codigo of c.errores as unknown[]) {
      if (!esCodigoError(codigo)) err(`error "${String(codigo)}" no está en el catálogo de errores.`);
      else if (vistos.has(codigo)) err(`error "${codigo}" declarado dos veces.`);
      else vistos.add(codigo);
    }
  }

  // Simulador: obligatorio (E3 §7).
  if (!esFuncion(c.simulador)) {
    err("sin simulador no entra al registro: hace falta simulador() con escenarios firmados.");
  }

  return problemas;
}
