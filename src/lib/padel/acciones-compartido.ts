import "server-only";

// ============================================================================
// PADEL-CLASES — piezas que comparten las escrituras del profe (acciones.ts) y las del alumno
// (acciones-alumno.ts).
// ============================================================================
//
// NO es "use server" a propósito: nada de esto se puede llamar desde el navegador. Son las piezas
// que usan las dos puertas (y sólo corren en el servidor):
//   · los tipos de respuesta (`Resultado`, `ConAviso`, `AvisoEnCola`);
//   · los frenos por IP y por teléfono (una sola instancia en memoria para las dos puertas);
//   · el choque de horario, el alumno por teléfono, el reconocimiento del alumno (O-1) y el saldo
//     a favor adentro de la transacción;
//   · los avisos: al alumno (WhatsApp por link o Cloud API, siempre registrado en PadelAviso) y al
//     profe (la bandeja).
//
// La acción del profe que marca un aviso como mandado (`marcarAvisado(avisoId)`, la que usa la cola
// «Avisar a Juan (1 de 6)») vive en acciones.ts porque es una Server Action (pide agenda:manage):
// la pantalla la importa de "@/lib/padel/acciones" y los tipos de acá con `import type`.

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { ESTADOS_QUE_OCUPAN, armarMensaje, diaHumano, horaHumana, pesos, plantillaConfirmada, saldoAFavor, saldoCubre, tokenValido, type ClavePlantilla } from "./core";
import type { ConfigPadel } from "./datos.server";
import { notificadorActual } from "./notificador";
import { regenerarAlReconocer } from "./sesion-alumno";
import { leerTokenCookie } from "./sesion-alumno.server";
import type { ClaveMeta } from "./whatsapp-cloud";

// ── Tipos de respuesta ──────────────────────────────────────────────────────

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Lo que devuelve toda acción que le avisa algo al alumno:
 *  · `wa`: el link wa.me con el texto listo (modo manual, o la Cloud API falló);
 *  · `enviado`: salió solo por la Cloud API;
 *  · `avisoId`: el PadelAviso que lo registra. La cola lo marca con `marcarAvisado(avisoId)` cuando el
 *    profe toca el link; si toca «Después», queda en Bandeja → «Sin avisar».
 */
export type ConAviso = { wa: string | null; enviado: boolean; avisoId?: string | null };

/** Un ítem de la cola de avisos: a quién y de qué clase («Avisar a Juan (1 de 6)»). */
export type AvisoEnCola = ConAviso & { avisoId: string | null; claseId: string | null; nombre: string };

export const SIN_AVISO: ConAviso = { wa: null, enviado: false, avisoId: null };

/** Error de negocio: se le muestra al usuario tal cual. Cualquier otro error sube. */
export class ErrorNegocio extends Error {}

/** Corre la acción y convierte un ErrorNegocio en `{ ok: false, error }`. */
export async function conErrorNegocio<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

export const RAIZ = "/admin/clases";

export const nuevoToken = () => randomBytes(18).toString("base64url");

export function refrescar(...tokens: (string | undefined)[]) {
  revalidatePath(RAIZ, "layout");
  revalidatePath("/clases");
  for (const t of new Set(tokens)) if (t) revalidatePath(`/alumno/${t}`);
}

/** https://<dominio> del pedido, para armar los links que van por WhatsApp. */
export async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

// ── Frenos ──────────────────────────────────────────────────────────────────
//
// Por IP, 30 cada 10 minutos (M-020: diez alumnos detrás del wifi del club piden sin trabarse) y,
// en lo que se pide con un celular (pedirClase, pedirMiLink), 3 cada 10 minutos por teléfono.
// En memoria: un freno por instancia (es para el que aprieta veinte veces, no un muro).

export const DIEZ_MIN = 10 * 60 * 1000;
const frenoPorIp = createRateLimiter({ max: 30, windowMs: DIEZ_MIN });
const frenoPorTelefono = createRateLimiter({ max: 3, windowMs: DIEZ_MIN });

/** ¿Esta IP ya pidió demasiado? Si no, cuenta este pedido. `puerta` separa los contadores. */
export async function frenadoPorIp(puerta: string, tenantId?: string): Promise<boolean> {
  const clave = `padel:${puerta}:${tenantId ?? "-"}:${(await requestIp()) ?? "sin-ip"}`;
  if (frenoPorIp.blocked(clave)) return true;
  frenoPorIp.fail(clave);
  return false;
}

/** ¿Este celular ya pidió demasiado (3 cada 10 min)? Si no, cuenta este pedido. */
export function frenadoPorTelefono(puerta: string, tenantId: string, telefono: string): boolean {
  const clave = `padel:${puerta}:${tenantId}:${telefono}`;
  if (frenoPorTelefono.blocked(clave)) return true;
  frenoPorTelefono.fail(clave);
  return false;
}

export const FRENADO = "Hiciste muchos pedidos seguidos. Probá de nuevo en unos minutos.";

// ── Base: choque, alumno, reconocimiento, saldo ─────────────────────────────

/** El cliente de la transacción (`tenantTransaction` / `bookingTransaction`). */
export type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Clase viva que pisa [empiezaEn, terminaEn), o null. Se llama adentro de la transacción. */
export async function choqueEn(tx: Tx, tenantId: string, empiezaEn: Date, terminaEn: Date, excluir?: string) {
  return tx.padelClase.findFirst({
    where: {
      tenantId,
      estado: { in: [...ESTADOS_QUE_OCUPAN] },
      empiezaEn: { lt: terminaEn },
      terminaEn: { gt: empiezaEn },
      ...(excluir ? { id: { not: excluir } } : {}),
    },
    select: { id: true },
  });
}

/**
 * El alumno de ese celular (lo crea con su ficha de cliente si no existe). `esNuevo` = no había
 * NADA con ese celular en el negocio (ni alumno ni ficha de cliente): sólo entonces quien lo tipeó
 * es, sin duda, el dueño del link que nace. Si la ficha de cliente ya existía (la cargó el negocio),
 * se trata como conocido: el link le llega por WhatsApp, no se muestra en pantalla.
 */
export async function alumnoPorTelefono(tx: Tx, tenantId: string, telefono: string, nombre: string) {
  const existente = await tx.padelAlumno.findFirst({
    where: { tenantId, client: { phone: telefono } },
    select: { id: true, token: true, clientId: true, client: { select: { name: true } } },
  });
  if (existente) return { id: existente.id, token: existente.token, clientId: existente.clientId, nombre: existente.client.name, esNuevo: false, recienCreado: false };
  const ficha = await tx.client.findFirst({ where: { tenantId, phone: telefono }, select: { id: true, name: true } });
  const cliente = ficha ?? (await tx.client.create({ data: { tenantId, name: nombre, phone: telefono }, select: { id: true, name: true } }));
  const a = await tx.padelAlumno.create({ data: { tenantId, clientId: cliente.id, token: nuevoToken() }, select: { id: true, token: true, clientId: true } });
  // recienCreado: su token no lo vio nadie todavía (no hace falta regenerarlo).
  return { ...a, nombre: cliente.name, esNuevo: !ficha, recienCreado: true };
}

/**
 * O-1: ¿el profe ya reconoció a este alumno? Le confirmó una clase, se la agendó él o se la marcó
 * dada o ausente. Es el mismo criterio que `claseReconoce` (sesion-alumno.ts). `excluir`: la clase
 * que se está moviendo ahora (lo que importa es si estaba reconocido ANTES).
 */
export async function alumnoReconocido(tx: Tx, tenantId: string, alumnoId: string, excluir?: string): Promise<boolean> {
  const c = await tx.padelClase.findFirst({
    where: {
      tenantId,
      alumnoId,
      ...(excluir ? { id: { not: excluir } } : {}),
      OR: [{ confirmadaEl: { not: null } }, { origen: "PROFE" }, { estado: { in: ["DADA", "AUSENTE"] } }],
    },
    select: { id: true },
  });
  return Boolean(c);
}

/** Link nuevo. Hay un solo token por alumno: el viejo deja de andar en la misma escritura. */
export async function regenerarToken(tx: Tx, tenantId: string, alumnoId: string): Promise<string> {
  const token = nuevoToken();
  const n = await tx.padelAlumno.updateMany({ where: { tenantId, id: alumnoId }, data: { token } });
  if (n.count === 0) throw new ErrorNegocio("No encontramos ese alumno.");
  return token;
}

/**
 * O-1: la primera vez que el profe reconoce a un alumno que ya existía, su link se regenera (el que
 * tenía lo pudo haber sacado cualquiera que tipeó ese celular en el turnero). El nuevo le llega por
 * WhatsApp al número registrado con el mensaje de la acción. Se llama adentro de la transacción.
 */
export async function reconocerAlumno(
  tx: Tx,
  tenantId: string,
  alumno: { id: string; token: string },
  p: { excluir?: string; recienCreado?: boolean } = {},
): Promise<{ token: string; regenerado: boolean }> {
  const recienCreado = Boolean(p.recienCreado);
  const reconocidoAntes = recienCreado ? false : await alumnoReconocido(tx, tenantId, alumno.id, p.excluir);
  if (!regenerarAlReconocer({ reconocidoAntes, recienCreado })) return { token: alumno.token, regenerado: false };
  return { token: await regenerarToken(tx, tenantId, alumno.id), regenerado: true };
}

/**
 * O-1: el link que se manda al número registrado de un alumno que el profe todavía no reconoció es
 * siempre uno recién hecho: el que existía lo pudo haber sacado quien tipeó ese celular en el
 * turnero, y así el dueño del número recibe uno que el otro nunca vio. Si ya está reconocido, va el
 * de siempre.
 */
export async function tokenParaMandar(tenantId: string, alumno: { id: string; token: string }): Promise<{ token: string; regenerado: boolean }> {
  return tenantTransaction(async (tx) => {
    if (await alumnoReconocido(tx, tenantId, alumno.id)) return { token: alumno.token, regenerado: false };
    return { token: await regenerarToken(tx, tenantId, alumno.id), regenerado: true };
  }, { tenantId });
}

/** El saldo a favor del alumno, leído adentro de la transacción (para que dos altas no lo usen dos veces). */
export async function saldoEnTx(tx: Tx, tenantId: string, alumnoId: string, excluir?: string): Promise<number> {
  const filas = await tx.padelClase.findMany({
    where: {
      tenantId,
      alumnoId,
      OR: [{ pagoEstado: "ACREDITADO" }, { pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR" }],
      ...(excluir ? { id: { not: excluir } } : {}),
    },
    select: { estado: true, pagoEstado: true, pagoMedio: true, precio: true },
  });
  return saldoAFavor(filas.map((f) => ({ ...f, precio: Number(f.precio) })));
}

/** Si el saldo cubre la clase entera, nace (o queda) pagada con «Saldo a favor». Un saldo parcial no se aplica. */
export function pagoConSaldo(saldo: number, precio: number) {
  return saldoCubre(saldo, precio) ? { pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", pagoValidadoEl: new Date() } : null;
}

export const YA_PAGADA_CON_SALDO = "Ya está pagada con tu saldo a favor.";

// ── El alumno del link (token o cookie) ─────────────────────────────────────

/**
 * El alumno del link: el token que vino (el de `/alumno/<token>`) o, si no vino, el de la cookie
 * `padel_alumno` de este teléfono (`/mis-clases`). Se busca SIEMPRE en el negocio del dominio: un
 * token de otro negocio no encuentra a nadie. Un token malformado no toca la base (M-012).
 */
export async function alumnoDelLink(token?: string | null) {
  const t = token ? token : await leerTokenCookie();
  if (!tokenValido(t)) return null;
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({
    where: { tenantId, token: t },
    select: { id: true, token: true, clientId: true, client: { select: { name: true, phone: true } }, _count: { select: { clases: { where: { estado: "DADA" } } } } },
  });
  return a ? { tenantId, alumno: a } : null;
}

export const LINK_INVALIDO = "Este link no es válido. Pedile uno nuevo al profe.";

// ── Avisos ──────────────────────────────────────────────────────────────────

const META_DE: Partial<Record<ClavePlantilla, ClaveMeta>> = {
  confirmada: "confirmada",
  rechazada: "rechazada",
  proxima: "proxima",
  pagoOk: "pagoOk",
  pagoNo: "pagoNo",
  recordatorio: "recordatorio",
  linkAlumno: "linkAlumno",
  linkPedido: "linkAlumno",
  movida: "movida",
  suspendida: "suspendida",
};

/**
 * Le avisa al alumno: arma el texto con la plantilla del profe, lo manda (Cloud API) o devuelve el
 * wa.me (manual), y SIEMPRE lo registra en PadelAviso (destino ALUMNO). `avisoId` es ese registro.
 */
export async function avisarAlAlumno(p: {
  tenantId: string;
  config: ConfigPadel;
  clave: ClavePlantilla;
  tipo: string;
  /** La clase de la que se habla (null en un mensaje que no es de una clase, como «Lo que te deben»). */
  clase: { id: string; empiezaEn: Date; precio: number | { toString(): string } } | null;
  alumno: { id: string; token: string; nombre: string; telefono: string };
  /** Variables extra de la plantilla (diaAnterior, motivo, detalle…). */
  vars?: Record<string, string>;
  /** Una línea más al final (por ejemplo «Ya está pagada con tu saldo a favor.»). */
  extra?: string;
}): Promise<ConAviso & { avisoId: string }> {
  const base = await origen();
  const precio = p.clase ? Number(p.clase.precio) : 0;
  const vars: Record<string, string> = {
    nombre: p.alumno.nombre.split(" ")[0],
    dia: p.clase ? diaHumano(p.clase.empiezaEn) : "",
    hora: p.clase ? horaHumana(p.clase.empiezaEn) : "",
    // Sin precio cargado nunca «$ 0»: el texto de fábrica lo omite y uno editado lee «a coordinar».
    precio: precio > 0 ? pesos(precio) : "a coordinar",
    alias: p.config.aliasCbu || "(te lo paso por acá)",
    link: `${base}/alumno/${p.alumno.token}`,
    turnero: `${base}/clases`,
    ...(p.vars ?? {}),
  };
  const plantilla =
    p.clave === "confirmada"
      ? plantillaConfirmada(p.config.plantillas.confirmada, { hayPrecio: precio > 0, hayAlias: Boolean(p.config.aliasCbu) })
      : p.config.plantillas[p.clave];
  const texto = [armarMensaje(plantilla, vars), p.extra].filter(Boolean).join(" ");
  const meta = META_DE[p.clave];
  const r = await notificadorActual().enviar({
    telefono: p.alumno.telefono,
    texto,
    plantilla: meta ? { clave: meta, vars } : undefined,
  });
  const aviso = await prisma.padelAviso.create({
    data: {
      tenantId: p.tenantId,
      destino: "ALUMNO",
      tipo: p.tipo,
      claseId: p.clase?.id ?? null,
      alumnoId: p.alumno.id,
      texto,
      canal: r.canal,
      enviadoEl: r.enviado ? new Date() : null,
      errorEnvio: r.error ?? null,
      idExterno: r.idExterno ?? null,
    },
    select: { id: true },
  });
  return { wa: r.wa, enviado: r.enviado, avisoId: aviso.id };
}

export async function avisarAlProfe(tenantId: string, tipo: string, texto: string, claseId: string | null, alumnoId: string | null) {
  await prisma.padelAviso.create({ data: { tenantId, destino: "PROFE", tipo, texto, claseId, alumnoId } });
}
