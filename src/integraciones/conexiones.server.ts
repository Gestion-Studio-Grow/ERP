// ============================================================================
// CONEXIONES Y CREDENCIALES POR NEGOCIO (suite E3, Tanda P1).
// ============================================================================
//
// Una conexión = una cuenta externa (cuenta de Mercado Pago, número de WhatsApp, CUIT en ARCA)
// vinculada a UN negocio. Sus secretos se guardan sellados con `cerrarSecreto` (secretos.ts):
// DEK propia por fila, AAD "tenantId|conexionId|campo", KEK `INTEGRACIONES_MASTER_KEY`.
//
//   · crearConexion: valida y carga la KEK ANTES de escribir; conexión + credenciales selladas
//     en UNA transacción del negocio. Sin la KEK no se escribe nada. La misma cuenta externa en
//     el mismo negocio reconecta (reusa la fila); en otro negocio → "cuenta_en_uso".
//   · rotarCredencial: sella el valor nuevo con DEK nueva y reemplaza la fila; la vieja no
//     abre más (la DEK vieja se pierde con su sobre).
//   · conexionPorToken: modo "url-por-conexion". El token de la URL es
//     "<negocio en base64url>.<32 bytes al azar en base64url>". La parte del negocio es sólo
//     el SELECTOR (con RLS la app no puede buscar una conexión sin saber de qué negocio es);
//     la seguridad son los 256 bits al azar: en la base se guarda sólo sha256(token) en
//     `rutaHash` y se busca por igualdad DENTRO del negocio. Token mal formado, de otro
//     negocio o desconocido → null, sin distinguir.
//   · resolverConexionPorFirma: para los avisos que llegan sin token (webhooks viejos de S1).
//     Junta hasta TOPE_CONEXIONES_POR_FIRMA conexiones del conector y prueba la firma con el
//     secreto de cada una, TODAS y rellenando hasta el tope (tiempo constante). Gana sólo si
//     firma exactamente una.
//
// Nada de acá loguea secretos; los errores dicen qué falta, nunca el valor.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import {
  verificarFirmaFailClosed,
  type ConectorDescriptor,
  type EntradaCruda,
  type MotivoFirmaRechazada,
} from "./contrato";
import { seTapaEnLosLogs } from "./redaccion";
import { registro as registroDelProducto, type RegistroConectores } from "./registro";
import {
  abrirSecreto,
  cerrarSecreto,
  claveMaestraDesdeEntorno,
  ClaveMaestraError,
  ultimos4,
  type ClaveMaestra,
  type SobreSecreto,
} from "./secretos";

// ── Errores ──────────────────────────────────────────────────────────────────

export type MotivoConexion =
  | "sin_clave_maestra"
  | "conector_desconocido"
  | "datos_invalidos"
  | "cuenta_en_uso"
  | "credencial_inexistente";

export class ConexionError extends Error {
  constructor(
    readonly motivo: MotivoConexion,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ConexionError";
  }
}

// ── Validaciones puras ───────────────────────────────────────────────────────

const RE_CAMPO = /^[a-z][a-z0-9_]*$/;
/** Lo mismo que el CHECK de la base: ASCII imprimible sin espacios. */
const RE_CUENTA = /^[!-~]{1,255}$/;
const RE_TENANT = /^[A-Za-z0-9_-]{1,128}$/;
const LARGO_MAXIMO_SECRETO = 16_384;

function exigirTenant(tenantId: string): void {
  if (typeof tenantId !== "string" || !RE_TENANT.test(tenantId)) {
    throw new ConexionError("datos_invalidos", "Negocio inválido.");
  }
}

function validarCredenciales(conector: ConectorDescriptor, credenciales: unknown): Array<[string, string]> {
  if (!credenciales || typeof credenciales !== "object" || Array.isArray(credenciales)) {
    throw new ConexionError("datos_invalidos", "Las credenciales tienen que ser un objeto campo → valor.");
  }
  const pares = Object.entries(credenciales as Record<string, unknown>);
  if (pares.length === 0) throw new ConexionError("datos_invalidos", "Falta al menos una credencial.");
  const salida: Array<[string, string]> = [];
  for (const [campo, valor] of pares) {
    // El nombre tiene que taparse solo en los logs: si no, un log de la conexión lo mostraría.
    if (!RE_CAMPO.test(campo) || campo.length > 64 || !seTapaEnLosLogs(campo)) {
      throw new ConexionError("datos_invalidos", `Campo de credencial inválido: "${campo.slice(0, 64)}".`);
    }
    if (typeof valor !== "string" || valor.trim() === "" || valor.length > LARGO_MAXIMO_SECRETO) {
      throw new ConexionError("datos_invalidos", `La credencial "${campo}" está vacía o es demasiado larga.`);
    }
    salida.push([campo, valor]);
  }
  const s = conector.entrada?.secretoFirma;
  if (s?.origen === "conexion" && !salida.some(([c]) => c === s.campo)) {
    throw new ConexionError(
      "datos_invalidos",
      `El conector "${conector.id}" verifica la firma con "${s.campo}" de la conexión y no vino.`,
    );
  }
  return salida;
}

function claveMaestra(env: Record<string, string | undefined>): ClaveMaestra {
  try {
    return claveMaestraDesdeEntorno(env);
  } catch (e) {
    if (e instanceof ClaveMaestraError) {
      throw new ConexionError(
        "sin_clave_maestra",
        `No se puede guardar ni leer credenciales de integraciones: ${e.message}`,
      );
    }
    throw e;
  }
}

const esUnicaRepetida = (e: unknown) => !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2002";

// ── Token de la ruta ─────────────────────────────────────────────────────────

const RE_TOKEN = /^([A-Za-z0-9_-]{2,172})\.([A-Za-z0-9_-]{43})$/;

/** Token nuevo para la URL de una conexión del negocio (se muestra UNA vez). */
export function generarTokenDeRuta(tenantId: string): string {
  exigirTenant(tenantId);
  // tenantId es ASCII (RE_TENANT): btoa alcanza.
  const negocio = btoa(tenantId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${negocio}.${randomBytes(32).toString("base64url")}`;
}

/** El negocio que el token dice ser, o null si el token no tiene la forma. NO autentica nada. */
export function negocioDelToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const m = RE_TOKEN.exec(token);
  if (!m) return null;
  let tenantId: string;
  try {
    tenantId = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  return RE_TENANT.test(tenantId) ? tenantId : null;
}

/** Lo que se guarda en `rutaHash`: sha256 hex del token entero. */
export function hashDeRuta(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// ── Alta y rotación ──────────────────────────────────────────────────────────

export interface DatosConexion {
  cuentaExterna?: string | null;
  credenciales: Record<string, string>;
  etiqueta?: string | null;
  /** Quién la conectó (id de usuario o "cli"): va a `conectadaPor` y a `cargadaPor`. */
  conectadaPor?: string;
}

export interface DepsConexiones {
  env?: Record<string, string | undefined>;
  registro?: RegistroConectores;
}

export interface ConexionCreada {
  conexionId: string;
  tenantId: string;
  conector: string;
  /** Sólo en "url-por-conexion": el token de `/api/integraciones/c/{token}`. No se puede volver a leer. */
  token: string | null;
  /** true si la misma cuenta externa ya era de este negocio y se reusó su conexión. */
  reconectada: boolean;
  credenciales: Array<{ campo: string; ultimos4: string | null }>;
}

/**
 * Da de alta una conexión del negocio con sus credenciales selladas. Todo se valida ANTES de
 * abrir la transacción: sin `INTEGRACIONES_MASTER_KEY`, con un campo inválido o con un conector
 * desconocido, lanza `ConexionError` y no escribe nada. La misma cuenta externa conectada a OTRO
 * negocio choca con @@unique([conector, cuentaExterna]) → "cuenta_en_uso". La misma cuenta en
 * ESTE negocio es una reconexión: se reusa la conexión (reactivada, credenciales y token nuevos).
 * En "url-por-conexion" la conexión queda como la ÚNICA activa del negocio y conector.
 */
export async function crearConexion(
  tenantId: string,
  conectorId: string,
  datos: DatosConexion,
  deps: DepsConexiones = {},
): Promise<ConexionCreada> {
  exigirTenant(tenantId);
  const conector = (deps.registro ?? registroDelProducto()).obtener(conectorId);
  if (!conector) throw new ConexionError("conector_desconocido", `No existe el conector "${String(conectorId).slice(0, 64)}".`);
  const cuentaExterna = datos?.cuentaExterna ?? null;
  if (cuentaExterna !== null && (typeof cuentaExterna !== "string" || !RE_CUENTA.test(cuentaExterna))) {
    throw new ConexionError("datos_invalidos", "La cuenta externa tiene que ser texto sin espacios (hasta 255).");
  }
  if (conector.entrada?.modo === "url-de-app" && cuentaExterna === null) {
    throw new ConexionError("datos_invalidos", `El conector "${conector.id}" rutea por cuenta: falta la cuenta externa.`);
  }
  const credenciales = validarCredenciales(conector, datos?.credenciales);
  const clave = claveMaestra(deps.env ?? process.env);
  const quien = (datos.conectadaPor ?? "sistema").slice(0, 128) || "sistema";

  const token = conector.entrada?.modo === "url-por-conexion" ? generarTokenDeRuta(tenantId) : null;
  const sellar = (conexionId: string) =>
    credenciales.map(([campo, valor]) => ({
      campo,
      sobre: cerrarSecreto(valor, { tenantId, conexionId, campo }, clave),
      ultimos4: ultimos4(valor),
    }));

  // "url-por-conexion" (Mercado Pago): UNA conexión activa por negocio y conector. La nueva
  // reemplaza a la anterior en la misma transacción. El candado por (negocio, conector) hace que
  // dos altas a la vez (dos puestos, doble clic) no dejen dos activas con el mismo secreto ni
  // choquen al reconectar la misma cuenta.
  const unaPorNegocio = conector.entrada?.modo === "url-por-conexion";

  let conexionId = "";
  let reconectada = false;
  let sellados: ReturnType<typeof sellar> = [];
  try {
    await tenantTransaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`integracion-conexion:${tenantId}:${conector.id}`}))`;
        // Reconexión idempotente: la MISMA cuenta externa ya es de ESTE negocio → se reusa su fila
        // (credenciales y token nuevos; el token viejo deja de existir). Con RLS la búsqueda no ve
        // las filas de otro negocio: si la cuenta es de otro, se intenta el alta y la base la
        // rechaza por @@unique([conector, cuentaExterna]) → "cuenta_en_uso".
        const existente =
          cuentaExterna === null
            ? null
            : await tx.integracionConexion.findFirst({
                where: { tenantId, conector: conector.id, cuentaExterna },
                select: { id: true, tenantId: true },
              });
        reconectada = !!existente && existente.tenantId === tenantId;
        conexionId = reconectada ? existente!.id : randomUUID();
        // El AAD lleva el id de la conexión: se sella acá, ya sabido. La KEK se validó antes de
        // abrir la transacción (sin ella no se escribe nada); sellar es sólo memoria.
        sellados = sellar(conexionId);
        if (unaPorNegocio) {
          await tx.integracionConexion.updateMany({
            where: { tenantId, conector: conector.id, estado: { not: "desconectada" }, id: { not: conexionId } },
            data: { estado: "desconectada" },
          });
        }
        if (reconectada) {
          await tx.integracionConexion.updateMany({
            where: { id: conexionId, tenantId },
            data: {
              ...(datos.etiqueta !== undefined ? { etiqueta: datos.etiqueta?.slice(0, 200) ?? null } : {}),
              rutaHash: token ? hashDeRuta(token) : null,
              estado: "conectada",
              conectadaPor: quien,
              fallosSeguidos: 0,
              // Invalida un refresh OAuth en vuelo con las credenciales anteriores.
              tokenVersion: { increment: 1 },
            },
          });
          // Las credenciales anteriores se van con sus DEK: quedan sólo las de esta conexión.
          await tx.integracionCredencial.deleteMany({ where: { tenantId, conexionId } });
        } else {
          await tx.integracionConexion.create({
            data: {
              id: conexionId,
              tenantId,
              conector: conector.id,
              cuentaExterna,
              etiqueta: datos.etiqueta?.slice(0, 200) ?? null,
              rutaHash: token ? hashDeRuta(token) : null,
              estado: "conectada",
              conectadaPor: quien,
            },
          });
        }
        await tx.integracionCredencial.createMany({
          data: sellados.map((s) => ({
            tenantId,
            conexionId,
            campo: s.campo,
            ...s.sobre,
            ultimos4: s.ultimos4,
            cargadaPor: quien,
          })),
        });
      },
      { tenantId },
    );
  } catch (e) {
    if (esUnicaRepetida(e)) {
      throw new ConexionError("cuenta_en_uso", "Esa cuenta ya está conectada a un negocio.");
    }
    throw e;
  }
  return {
    conexionId,
    tenantId,
    conector: conector.id,
    token,
    reconectada,
    credenciales: sellados.map((s) => ({ campo: s.campo, ultimos4: s.ultimos4 })),
  };
}

/**
 * Cambia el valor de una credencial: DEK nueva, sobre nuevo y `ultimos4` nuevo, en la misma
 * fila. El valor anterior deja de existir en la base. Si la credencial no existe (o es de otro
 * negocio: RLS no la deja ver) → "credencial_inexistente".
 */
export async function rotarCredencial(
  tenantId: string,
  conexionId: string,
  campo: string,
  valor: string,
  opciones: { cargadaPor?: string } & DepsConexiones = {},
): Promise<{ ultimos4: string | null }> {
  exigirTenant(tenantId);
  if (typeof campo !== "string" || !RE_CAMPO.test(campo)) throw new ConexionError("datos_invalidos", "Campo inválido.");
  if (typeof valor !== "string" || valor.trim() === "" || valor.length > LARGO_MAXIMO_SECRETO) {
    throw new ConexionError("datos_invalidos", `La credencial "${campo}" está vacía o es demasiado larga.`);
  }
  if (typeof conexionId !== "string" || !RE_TENANT.test(conexionId)) throw new ConexionError("credencial_inexistente", "No existe esa credencial.");
  const clave = claveMaestra(opciones.env ?? process.env);
  const sobre = cerrarSecreto(valor, { tenantId, conexionId, campo }, clave);
  const u4 = ultimos4(valor);
  const cambiadas = await tenantTransaction(
    (tx) =>
      tx.integracionCredencial.updateMany({
        where: { tenantId, conexionId, campo },
        data: { ...sobre, ultimos4: u4, cargadaPor: (opciones.cargadaPor ?? "sistema").slice(0, 128) || "sistema" },
      }),
    { tenantId },
  );
  if (cambiadas.count !== 1) throw new ConexionError("credencial_inexistente", "No existe esa credencial.");
  return { ultimos4: u4 };
}

/**
 * El valor en claro de una credencial (sólo en memoria). null si la conexión no tiene ese campo.
 * Lanza `ConexionError("sin_clave_maestra")` sin la KEK y `SobreInvalidoError` si no abre.
 */
export async function leerCredencial(
  tenantId: string,
  conexionId: string,
  campo: string,
  deps: DepsConexiones = {},
): Promise<string | null> {
  exigirTenant(tenantId);
  const fila = await tenantTransaction(
    (tx) =>
      tx.integracionCredencial.findFirst({
        where: { tenantId, conexionId, campo },
        select: { kekId: true, wrappedDek: true, sealed: true },
      }),
    { tenantId },
  );
  if (!fila) return null;
  const sobre: SobreSecreto = { kekId: fila.kekId, wrappedDek: fila.wrappedDek, sealed: fila.sealed };
  return abrirSecreto(sobre, { tenantId, conexionId, campo }, claveMaestra(deps.env ?? process.env));
}

// ── Resolución ───────────────────────────────────────────────────────────────

export interface ConexionResuelta {
  tenantId: string;
  conexionId: string;
  conector: string;
  cuentaExterna: string | null;
}

/** Estados en los que una conexión recibe avisos. */
const ESTADOS_QUE_RECIBEN = ["conectada", "con_problemas", "requiere_reconectar"] as const;

/**
 * Token de la URL → conexión → negocio. null si el token no tiene la forma, si no existe en ese
 * negocio o si la conexión no recibe avisos (pausada, desconectada). Con forma válida SIEMPRE
 * hace la misma consulta: un negocio inexistente no se distingue de un token desconocido.
 */
export async function conexionPorToken(token: string): Promise<ConexionResuelta | null> {
  const tenantId = negocioDelToken(token);
  if (!tenantId) return null;
  const fila = await tenantTransaction(
    (tx) =>
      tx.integracionConexion.findFirst({
        where: { tenantId, rutaHash: hashDeRuta(token), estado: { in: [...ESTADOS_QUE_RECIBEN] } },
        select: { id: true, tenantId: true, conector: true, cuentaExterna: true },
      }),
    { tenantId },
  );
  if (!fila || fila.tenantId !== tenantId) return null;
  return { tenantId, conexionId: fila.id, conector: fila.conector, cuentaExterna: fila.cuentaExterna };
}

/**
 * La conexión activa de un conector en UN negocio (la más reciente si hubiera varias), o null.
 * La usa el dispatch de cobros para leer el `access_token` de Mercado Pago del negocio (P1-C4).
 * Negocio inválido → `ConexionError("datos_invalidos")`.
 */
export async function conexionDelNegocio(tenantId: string, conectorId: string): Promise<ConexionResuelta | null> {
  exigirTenant(tenantId);
  const fila = await tenantTransaction(
    (tx) =>
      tx.integracionConexion.findFirst({
        where: { tenantId, conector: conectorId, estado: { in: [...ESTADOS_QUE_RECIBEN] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, tenantId: true, conector: true, cuentaExterna: true },
      }),
    { tenantId },
  );
  if (!fila || fila.tenantId !== tenantId) return null;
  return { tenantId, conexionId: fila.id, conector: fila.conector, cuentaExterna: fila.cuentaExterna };
}

/** Tope de conexiones que se prueban por firma o por cuenta en un aviso (P1-C5). */
export const TOPE_CONEXIONES_POR_FIRMA = 20;

/** Negocios por página al recorrer los que tienen el módulo. */
const PAGINA_NEGOCIOS = 100;

/**
 * Las conexiones activas de un conector, de los negocios que lo tienen activo (Tenant.modules).
 * Con RLS la app no lee conexiones de varios negocios en una consulta: se recorre negocio por
 * negocio (Tenant no tiene RLS), paginando por id, TODOS los que tienen el módulo: el tope cuenta
 * CONEXIONES, no negocios (un negocio sin conexión no le quita lugar a uno con conexión). Devuelve
 * null si hay MÁS que `tope` conexiones (fail-closed: no se elige entre un montón). Dentro de cada
 * negocio, la más reciente primero (desempate de `elegirPorFirma`).
 * Deuda anotada: una transacción por negocio con el módulo; con cientos de negocios conviene una
 * vista de sólo-lectura sin RLS para el ruteo.
 */
export async function conexionesDelConector(
  conectorId: string,
  tope: number = TOPE_CONEXIONES_POR_FIRMA,
): Promise<ConexionResuelta[] | null> {
  const salida: ConexionResuelta[] = [];
  let despuesDe: string | null = null;
  for (;;) {
    const negocios: Array<{ id: string }> = await basePrisma.tenant.findMany({
      where: { modules: { has: conectorId }, ...(despuesDe ? { id: { gt: despuesDe } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGINA_NEGOCIOS,
    });
    for (const n of negocios) {
      const filas = await tenantTransaction(
        (tx) =>
          tx.integracionConexion.findMany({
            where: { tenantId: n.id, conector: conectorId, estado: { in: [...ESTADOS_QUE_RECIBEN] } },
            select: { id: true, cuentaExterna: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: tope + 1,
          }),
        { tenantId: n.id },
      );
      for (const f of filas) salida.push({ tenantId: n.id, conexionId: f.id, conector: conectorId, cuentaExterna: f.cuentaExterna });
      if (salida.length > tope) return null;
    }
    if (negocios.length < PAGINA_NEGOCIOS) return salida;
    despuesDe = negocios[negocios.length - 1].id;
  }
}

/** La conexión de una cuenta externa ("url-de-app"), entre las del conector. */
export async function conexionPorCuenta(conectorId: string, cuentaExterna: string): Promise<ConexionResuelta | null | "demasiadas"> {
  const todas = await conexionesDelConector(conectorId);
  if (todas === null) return "demasiadas";
  const deLaCuenta = todas.filter((c) => c.cuentaExterna === cuentaExterna);
  return deLaCuenta.length === 1 ? deLaCuenta[0] : null;
}

export interface CandidatoFirma {
  conexion: ConexionResuelta;
  /** El secreto de firma de la conexión ya abierto, o null si no lo tiene. */
  secreto: string | null;
}

export type ResultadoPorFirma =
  | { ok: true; conexion: ConexionResuelta }
  | { ok: false; motivo: MotivoFirmaRechazada | "demasiadas" | "ambigua" };

const SECRETO_DE_RELLENO = "relleno-de-tiempo-constante-sin-uso";

/**
 * Elige la conexión cuyo secreto valida la firma del aviso. PURA sobre los candidatos: se
 * verifican TODOS y se rellena hasta `tope` con un secreto de descarte, así el tiempo no dice
 * cuántos hay ni cuál firmó. Exactamente una → ok; ninguna → el motivo del rechazo; varias del
 * MISMO negocio (reconexión vieja que quedó activa) → la primera, que es la más reciente
 * (`conexionesDelConector` las da así); varias de negocios distintos → "ambigua" (no se adivina).
 */
export function elegirPorFirma(
  conector: Pick<ConectorDescriptor, "entrada">,
  req: EntradaCruda,
  candidatos: readonly CandidatoFirma[] | null,
  ahora: Date,
  tope: number = TOPE_CONEXIONES_POR_FIRMA,
): ResultadoPorFirma {
  if (candidatos === null || candidatos.length > tope) return { ok: false, motivo: "demasiadas" };
  const firmaron: ConexionResuelta[] = [];
  let algunSecreto = false;
  let motivo: MotivoFirmaRechazada = "firma_invalida";
  for (let i = 0; i < tope; i++) {
    const c = candidatos[i];
    const r = verificarFirmaFailClosed(conector, req, c ? c.secreto : SECRETO_DE_RELLENO, ahora);
    if (!c) continue;
    if (c.secreto) algunSecreto = true;
    if (r.ok) firmaron.push(c.conexion);
    else if (r.motivo !== "sin_secreto" && r.motivo !== "firma_invalida") motivo = r.motivo;
  }
  if (firmaron.length >= 1 && firmaron.every((c) => c.tenantId === firmaron[0].tenantId)) return { ok: true, conexion: firmaron[0] };
  if (firmaron.length > 1) return { ok: false, motivo: "ambigua" };
  return { ok: false, motivo: algunSecreto ? motivo : "sin_secreto" };
}

/**
 * Aviso sin token → la conexión que lo firmó (webhooks viejos de S1, P1-C5). Junta las
 * conexiones del conector (tope 20), abre el secreto de firma de cada una y elige con
 * `elegirPorFirma`. Sin la KEK, ningún secreto abre → "sin_secreto" (503 en la entrada).
 */
export async function resolverConexionPorFirma(
  conectorId: string,
  req: EntradaCruda,
  ahora: Date,
  deps: DepsConexiones = {},
): Promise<ResultadoPorFirma> {
  const conector = (deps.registro ?? registroDelProducto()).obtener(conectorId);
  const campo = conector?.entrada?.secretoFirma.origen === "conexion" ? conector.entrada.secretoFirma.campo : null;
  if (!conector || !campo) return { ok: false, motivo: "firma_invalida" };
  const conexiones = await conexionesDelConector(conectorId);
  if (conexiones === null) return { ok: false, motivo: "demasiadas" };
  const candidatos: CandidatoFirma[] = [];
  for (const conexion of conexiones) {
    let secreto: string | null = null;
    try {
      secreto = await leerCredencial(conexion.tenantId, conexion.conexionId, campo, deps);
    } catch {
      secreto = null; // sin KEK o sobre ilegible: esa conexión no puede firmar
    }
    candidatos.push({ conexion, secreto });
  }
  return elegirPorFirma(conector, req, candidatos, ahora);
}
