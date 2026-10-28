// ============================================================================
// ENTRADA GENÉRICA DE AVISOS (suite E3 §2.4, Tanda P1).
// ============================================================================
//
// Las dos rutas de src/app/api/integraciones llaman acá:
//
//   POST /api/integraciones/c/{token}   (modo "url-por-conexion": Mercado Pago)
//     token → conexión → negocio · firma con el secreto DE ESA CONEXIÓN (fail-closed: sin
//     secreto 503, firma mala 401) · normalizar · EventoIntegracion deduplicado · handler en
//     runInTenantContext(negocio). Token desconocido → 404 vacío, igual que uno mal formado.
//
//   GET|POST /api/integraciones/{conector}   (modo "url-de-app": WhatsApp)
//     desafío y firma con el secreto de la APLICACIÓN (entorno) · normalizar · cada evento a la
//     conexión de SU cuenta externa · mismo registro y handler.
//
// Deduplicación: @@unique([tenantId, conexionId, direccion, idExterno]). El primero inserta y
// corre el handler. Un reenvío choca y RECLAMA la fila (→ "recibido", uno solo gana) si:
//   · quedó "fallido";
//   · quedó "recibido" porque no había handler (marca MARCA_SIN_MANEJADOR) y ahora sí lo hay;
//   · quedó "recibido" hace más de LEASE_RECIBIDO_MS (la función se cortó entre el insert y el
//     handler: timeout serverless). El último reclamo se anota en `procesadoEn` mientras la fila
//     está "recibido", así un reclamo en curso no se vuelve a reclamar antes del lease.
// Si no, es "duplicado" y no corre nada. El reclamo es exclusivo: el updateMany cambia lo mismo
// que filtra (estado, marca y procesadoEn), así que dos reenvíos a la vez → count 1 para uno solo.
// Sin handler para el conector, el evento queda "recibido" con la marca (lo levanta el próximo
// reenvío que sí tenga handler).

import { createHash } from "node:crypto";
import { runInTenantContext } from "@/lib/tenant-context";
import { tenantTransaction } from "@/lib/rls";
import { clientIpFromRequest, createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import {
  agruparPorCuenta,
  estadoHttpPorFirma,
  normalizarFailClosed,
  responderDesafioFailClosed,
  verificarFirmaFailClosed,
  type ConectorDescriptor,
  type EntradaCruda,
  type EventoCanonico,
} from "./contrato";
import { conexionPorCuenta, conexionPorToken, leerCredencial, type ConexionResuelta } from "./conexiones.server";
import { logIntegraciones } from "./log";
import { CLAVES_EVENTO_CANONICO, redactar } from "./redaccion";
import { registro as registroDelProducto, type RegistroConectores } from "./registro";

/** Tope del cuerpo de un aviso (los de MP y Meta pesan unos pocos KB). */
export const TOPE_CUERPO_BYTES = 256 * 1024;

// ── Request → EntradaCruda ───────────────────────────────────────────────────

/** La request como la ve el contrato: encabezados en minúsculas, consulta y bytes crudos. */
export async function entradaDeRequest(request: Request, tope: number = TOPE_CUERPO_BYTES): Promise<EntradaCruda | null> {
  const metodo = request.method === "GET" ? "GET" : request.method === "POST" ? "POST" : null;
  if (!metodo) return null;
  const largo = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(largo) && largo > tope) return null;
  const cuerpo = metodo === "POST" ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array(0);
  if (cuerpo.byteLength > tope) return null;
  const encabezados: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    encabezados[k.toLowerCase()] = v;
  });
  const consulta: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((v, k) => {
    if (!Object.prototype.hasOwnProperty.call(consulta, k)) consulta[k] = v;
  });
  return { metodo, encabezados, consulta, cuerpo };
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export interface ContextoHandler {
  tenantId: string;
  conexionId: string;
  conector: string;
  evento: EventoCanonico;
}

export type ResultadoHandler = { estado: "procesado" | "ignorado"; resumen?: string; entidad?: string; entidadId?: string };

/** Lo que hace el Core con un evento. Corre dentro de runInTenantContext(tenantId). */
export type ManejadorEvento = (ctx: ContextoHandler) => Promise<ResultadoHandler>;

export interface DepsEntrada {
  registro: RegistroConectores;
  env: Record<string, string | undefined>;
  ahora: () => Date;
  /** Por conector. El que no figura deja el evento "recibido". */
  manejadores: Readonly<Record<string, ManejadorEvento>>;
  conexionPorToken: (token: string) => Promise<ConexionResuelta | null>;
  conexionPorCuenta: (conector: string, cuenta: string) => Promise<ConexionResuelta | null | "demasiadas">;
  leerSecreto: (c: ConexionResuelta, campo: string) => Promise<string | null>;
  /** null = siga; un número = segundos de espera (429). */
  limitar: (clave: string, request: Request) => number | null;
}

const limitador: RateLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

/**
 * Deps reales SIN handlers: los cablea cada ruta (la de MP, src/app/api/integraciones/c/[token]/route.ts,
 * suma `manejadorAvisoMP`; acá sería un ciclo de imports). Sin handler el evento queda "recibido" con
 * MARCA_SIN_MANEJADOR y lo reclama el próximo reenvío que sí lo tenga.
 */
export function depsDeProduccion(): DepsEntrada {
  return {
    registro: registroDelProducto(),
    env: process.env,
    ahora: () => new Date(),
    manejadores: {},
    conexionPorToken,
    conexionPorCuenta,
    leerSecreto: (c, campo) => leerCredencial(c.tenantId, c.conexionId, campo),
    limitar: (clave, request) => {
      const k = `integraciones:${clave}:${clientIpFromRequest(request)}`;
      if (limitador.blocked(k)) return Math.max(1, Math.ceil(limitador.retryAfterMs(k) / 1000));
      limitador.fail(k);
      return null;
    },
  };
}

// ── Registro y despacho de eventos ───────────────────────────────────────────

export interface ResumenDespacho {
  procesados: number;
  duplicados: number;
  fallidos: number;
  pendientes: number;
}

const esUnicaRepetida = (e: unknown) => !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2002";
const LARGO_DETALLE = 500;

/** Una fila "recibido" más vieja que esto se da por abandonada (corte/timeout) y se reclama. */
export const LEASE_RECIBIDO_MS = 5 * 60_000;
/** `resumen` de la fila que quedó "recibido" porque el conector no tenía handler. */
export const MARCA_SIN_MANEJADOR = "pendiente: sin handler para el conector";

/**
 * El filtro del reclamo de un reenvío (PURO, testeable). Sin handler sólo se reclaman los
 * "fallido" (como antes); con handler, además los "recibido" sin handler o vencidos.
 */
export function filtroDeReclamo(ahora: Date, conManejador: boolean, leaseMs: number = LEASE_RECIBIDO_MS) {
  const corte = new Date(ahora.getTime() - leaseMs);
  const fallido = { estado: "fallido" as const };
  if (!conManejador) return { OR: [fallido] };
  return {
    OR: [
      fallido,
      { estado: "recibido" as const, resumen: MARCA_SIN_MANEJADOR },
      { estado: "recibido" as const, procesadoEn: { lt: corte } },
      { estado: "recibido" as const, procesadoEn: null, createdAt: { lt: corte } },
    ],
  };
}

/**
 * Guarda cada evento en EventoIntegracion (redactado) y corre el handler UNA vez por clave.
 * Todo con el negocio de la conexión: tenantTransaction para escribir y runInTenantContext
 * para el handler, así lo que el handler lea o escriba queda dentro de ese negocio.
 */
export async function registrarYDespachar(
  conexion: ConexionResuelta,
  conector: ConectorDescriptor,
  eventos: readonly EventoCanonico[],
  manejador: ManejadorEvento | undefined,
): Promise<ResumenDespacho> {
  const { tenantId, conexionId } = conexion;
  const r: ResumenDespacho = { procesados: 0, duplicados: 0, fallidos: 0, pendientes: 0 };
  for (const evento of eventos) {
    const payload = redactar(evento, {
      secretas: conector.redaccion?.secretas,
      personales: conector.redaccion?.personales,
      textos: [...(CLAVES_EVENTO_CANONICO.textos ?? []), ...(conector.redaccion?.textos ?? [])],
    }) as object;
    const payloadSha256 = createHash("sha256").update(JSON.stringify(evento)).digest("hex");
    const clave = { tenantId, conexionId, direccion: "entrada" as const, idExterno: evento.idExterno };

    let id: string | null = null;
    try {
      const fila = await tenantTransaction(
        (tx) =>
          tx.eventoIntegracion.create({
            data: { ...clave, tipo: evento.tipo, payload, payloadSha256, intentos: 1, resumen: manejador ? null : MARCA_SIN_MANEJADOR },
            select: { id: true },
          }),
        { tenantId },
      );
      id = fila.id;
    } catch (e) {
      if (!esUnicaRepetida(e)) throw e;
      // Reenvío: se reintenta lo que falló, lo que quedó sin handler o lo abandonado (lease), y lo
      // reclama UNO (updateMany condicionado que cambia lo mismo que filtra).
      const ahora = new Date();
      const reclamado = await tenantTransaction(
        async (tx) => {
          const n = await tx.eventoIntegracion.updateMany({
            where: { ...clave, ...filtroDeReclamo(ahora, !!manejador) },
            data: { estado: "recibido", intentos: { increment: 1 }, resumen: manejador ? null : MARCA_SIN_MANEJADOR, procesadoEn: ahora },
          });
          if (n.count !== 1) return null;
          return tx.eventoIntegracion.findFirst({ where: clave, select: { id: true } });
        },
        { tenantId },
      );
      id = reclamado?.id ?? null;
    }
    if (!id) {
      r.duplicados++;
      continue;
    }
    if (!manejador) {
      r.pendientes++;
      continue;
    }
    const filaId = id;
    try {
      const res = await runInTenantContext(tenantId, async () =>
        await manejador({ tenantId, conexionId, conector: conector.id, evento }),
      );
      await tenantTransaction(
        (tx) =>
          tx.eventoIntegracion.updateMany({
            where: { id: filaId, tenantId },
            data: {
              estado: res.estado,
              procesadoEn: new Date(),
              resumen: res.resumen?.slice(0, LARGO_DETALLE) ?? null,
              entidad: res.entidad ?? null,
              entidadId: res.entidadId ?? null,
              codigoError: null,
              detalleError: null,
            },
          }),
        { tenantId },
      );
      r.procesados++;
    } catch (e) {
      r.fallidos++;
      logIntegraciones.error("integraciones", "el handler del evento falló", e, { conector: conector.id, conexionId, tipo: evento.tipo });
      await tenantTransaction(
        (tx) =>
          tx.eventoIntegracion.updateMany({
            where: { id: filaId, tenantId },
            data: {
              estado: "fallido",
              codigoError: "error_interno",
              detalleError: (e instanceof Error ? e.name : "Error").slice(0, LARGO_DETALLE),
            },
          }),
        { tenantId },
      );
    }
  }
  await tenantTransaction(
    (tx) => tx.integracionConexion.updateMany({ where: { id: conexionId, tenantId }, data: { ultimoEventoEn: new Date() } }),
    { tenantId },
  );
  return r;
}

// ── Respuestas ───────────────────────────────────────────────────────────────

/** 404 sin cuerpo ni pista: token desconocido, mal formado o conector inexistente. */
export const noEncontrado = () => new Response(null, { status: 404 });
const json = (cuerpo: unknown, status: number, headers?: Record<string, string>) => Response.json(cuerpo, { status, headers });

function respuestaDespacho(r: ResumenDespacho, descartados: number): Response {
  // Un handler que falló → 500: el proveedor reintenta y el reintento reclama la fila "fallido".
  return json({ ok: r.fallidos === 0, ...r, descartados }, r.fallidos > 0 ? 500 : 200);
}

function normalizar(conector: ConectorDescriptor, req: EntradaCruda) {
  const n = normalizarFailClosed(conector, req);
  if (!n.ok) {
    logIntegraciones.warn("integraciones", "normalizar rechazó el aviso", { conector: conector.id, motivo: n.motivo, detalle: n.detalle });
    return { respuesta: json({ ok: false, error: n.motivo }, n.motivo === "cuerpo_invalido" ? 400 : n.motivo === "sin_entrada" ? 404 : 500) };
  }
  return { eventos: n.eventos, descartados: n.descartados.length };
}

// ── POST /api/integraciones/c/{token} ────────────────────────────────────────

export async function atenderAvisoPorConexion(request: Request, token: string, deps: DepsEntrada): Promise<Response> {
  const espera = deps.limitar("c", request);
  if (espera !== null) return json({ ok: false, error: "demasiados-avisos" }, 429, { "Retry-After": String(espera) });

  const conexion = await deps.conexionPorToken(token);
  if (!conexion) return noEncontrado();
  const conector = deps.registro.obtener(conexion.conector);
  const entrada = conector?.entrada;
  if (!conector || !entrada || entrada.modo !== "url-por-conexion" || entrada.secretoFirma.origen !== "conexion") {
    return noEncontrado();
  }
  const req = await entradaDeRequest(request);
  if (!req || req.metodo !== "POST") return json({ ok: false, error: "aviso-invalido" }, 413);

  let secreto: string | null = null;
  try {
    secreto = await deps.leerSecreto(conexion, entrada.secretoFirma.campo);
  } catch (e) {
    // Sin KEK o sobre ilegible: no se puede verificar → 503 (fail-closed), nunca "pasa".
    logIntegraciones.error("integraciones", "no se pudo abrir el secreto de firma", e, { conector: conector.id, conexionId: conexion.conexionId });
    secreto = null;
  }
  const firma = verificarFirmaFailClosed(conector, req, secreto, deps.ahora());
  const estado = estadoHttpPorFirma(firma);
  if (estado !== null) {
    logIntegraciones.warn("integraciones", "firma rechazada", {
      conector: conector.id,
      conexionId: conexion.conexionId,
      motivo: firma.ok ? null : firma.motivo,
    });
    return json({ ok: false, error: estado === 503 ? "sin-secreto" : "firma-invalida" }, estado);
  }

  const n = normalizar(conector, req);
  if ("respuesta" in n) return n.respuesta as Response;
  const r = await registrarYDespachar(conexion, conector, n.eventos, deps.manejadores[conector.id]);
  return respuestaDespacho(r, n.descartados);
}

// ── GET|POST /api/integraciones/{conector} ───────────────────────────────────

export async function atenderDesafio(request: Request, conectorId: string, deps: DepsEntrada): Promise<Response> {
  const conector = deps.registro.obtener(conectorId);
  const desafio = conector?.entrada?.modo === "url-de-app" ? conector.entrada.desafio : undefined;
  if (!conector || !desafio) return noEncontrado();
  const req = await entradaDeRequest(request);
  if (!req) return noEncontrado();
  const r = responderDesafioFailClosed(conector, req, deps.env[desafio.variable]);
  return new Response(r.estado === 200 ? r.cuerpo : null, {
    status: r.estado,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function atenderAvisoDeApp(request: Request, conectorId: string, deps: DepsEntrada): Promise<Response> {
  const conector = deps.registro.obtener(conectorId);
  const entrada = conector?.entrada;
  if (!conector || !entrada || entrada.modo !== "url-de-app" || entrada.secretoFirma.origen !== "entorno") {
    return noEncontrado();
  }
  const espera = deps.limitar(conector.id, request);
  if (espera !== null) return json({ ok: false, error: "demasiados-avisos" }, 429, { "Retry-After": String(espera) });
  const req = await entradaDeRequest(request);
  if (!req || req.metodo !== "POST") return json({ ok: false, error: "aviso-invalido" }, 413);

  const firma = verificarFirmaFailClosed(conector, req, deps.env[entrada.secretoFirma.variable], deps.ahora());
  const estado = estadoHttpPorFirma(firma);
  if (estado !== null) {
    logIntegraciones.warn("integraciones", "firma rechazada", { conector: conector.id, motivo: firma.ok ? null : firma.motivo });
    return json({ ok: false, error: estado === 503 ? "sin-secreto" : "firma-invalida" }, estado);
  }
  const n = normalizar(conector, req);
  if ("respuesta" in n) return n.respuesta as Response;

  const { porCuenta, sinCuenta } = agruparPorCuenta(n.eventos);
  const total: ResumenDespacho = { procesados: 0, duplicados: 0, fallidos: 0, pendientes: 0 };
  let sinConexion = sinCuenta.length;
  for (const [cuenta, eventos] of porCuenta) {
    const conexion = await deps.conexionPorCuenta(conector.id, cuenta);
    if (conexion === "demasiadas") {
      logIntegraciones.error("integraciones", "demasiadas conexiones para resolver la cuenta", undefined, { conector: conector.id });
      return json({ ok: false, error: "sin-resolver" }, 503);
    }
    // Una cuenta sin conexión no es de nadie: 200 sin efecto (el proveedor no reintenta en vano).
    if (!conexion || conexion.cuentaExterna !== cuenta) {
      sinConexion += eventos.length;
      continue;
    }
    const r = await registrarYDespachar(conexion, conector, eventos, deps.manejadores[conector.id]);
    total.procesados += r.procesados;
    total.duplicados += r.duplicados;
    total.fallidos += r.fallidos;
    total.pendientes += r.pendientes;
  }
  if (sinConexion > 0) logIntegraciones.warn("integraciones", "eventos de una cuenta sin conexión", { conector: conector.id, eventos: sinConexion });
  return respuestaDespacho(total, n.descartados + sinConexion);
}
