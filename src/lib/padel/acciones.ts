"use server";

// ============================================================================
// PADEL-CLASES — escrituras.
// ============================================================================
//
// Dos puertas:
//   · Públicas (turnero y link del alumno): sin login. El negocio sale del dominio, el alumno
//     del token. Frenadas por IP y por tope de pedidos sin confirmar por teléfono. Todo se
//     vuelve a chequear en el servidor: la franja que mandó el navegador no se cree a ciegas.
//   · Del profe: piden agenda:manage en cada acción (esconder un botón no protege nada).
//
// Las altas de clase van en `bookingTransaction` (Serializable con reintento): dos alumnos
// que tocan la misma franja a la vez no quedan los dos adentro (ADR-004/023).
//
// Cada acción del profe que le cambia algo al alumno devuelve `wa` (el link con el mensaje
// listo) o `enviado: true` si salió solo por la Cloud API (notificador.ts).
//
// El token del alumno (la llave de su link) se entrega SÓLO al dispositivo que lo creó o que ya lo
// tenía en su cookie `padel_alumno` (sesion-alumno.ts). A quien tipea un celular ajeno nunca se le
// muestra: el link le viaja por WhatsApp al número registrado (pedirMiLink).
//
// La plata pagada nunca se pierde: una clase pagada que se cancela queda ACREDITADO (saldo a favor)
// y el saldo paga sola la próxima clase entera que se agenda o se confirma (core.ts → saldoAFavor).

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { bookingTransaction, tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin, auditPublic, requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { leerImporte } from "@/lib/dinero/leer";
import { dateStrInBusinessTz, businessWallTimeToUtc } from "@/lib/datetime";
import {
  CLAVES_PLANTILLA,
  ESTADOS_QUE_OCUPAN,
  armarMensaje,
  comprobanteValido,
  diaHumano,
  fechaValida,
  horaHumana,
  pagoAlCancelar,
  saldoAFavor,
  saldoCubre,
  horaValida,
  esTipoClase,
  linkWhatsApp,
  nombreValido,
  pesos,
  precioDe,
  plantillaConfirmada,
  proximaSemana,
  puedeCancelarAlumno,
  puedePedir,
  repetidaNaceConfirmada,
  telefonoAlumno,
  tokenValido,
  transicionClase,
  transicionPago,
  type ClavePlantilla,
  type EventoClase,
  type EventoPago,
  type TipoClase,
} from "./core";
import { AVISOS_QUE_ESPERAN, configPadel, datosDelNegocio, libresDelDia, type ConfigPadel } from "./datos.server";
import { notificadorActual } from "./notificador";
import { decidirPedidoDeLink, tokenAEntregar } from "./sesion-alumno";
import { escribirTokenCookie, leerTokenCookie } from "./sesion-alumno.server";
import type { ClaveMeta } from "./whatsapp-cloud";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type ConAviso = { wa: string | null; enviado: boolean };

const RAIZ = "/admin/clases";
const frenoDePedidos = createRateLimiter({ max: 8, windowMs: 10 * 60 * 1000 });
// «Pedí tu link»: por IP y, sobre todo, por celular (3 en 10 min; el 4º se frena). Un mismo celular
// recibe a lo sumo un WhatsApp con su link cada 10 minutos (lo mira la base, no la memoria).
const DIEZ_MIN = 10 * 60 * 1000;
const frenoDeLinkPorIp = createRateLimiter({ max: 10, windowMs: DIEZ_MIN });
const frenoDeLinkPorTel = createRateLimiter({ max: 3, windowMs: DIEZ_MIN });

class ErrorNegocio extends Error {}

const nuevoToken = () => randomBytes(18).toString("base64url");

function refrescar(token?: string) {
  revalidatePath(RAIZ, "layout");
  revalidatePath("/clases");
  if (token) revalidatePath(`/alumno/${token}`);
}

/** https://<dominio> del pedido, para armar los links que van por WhatsApp. */
async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

async function frenado(): Promise<boolean> {
  const clave = `padel:${(await requestIp()) ?? "sin-ip"}`;
  if (frenoDePedidos.blocked(clave)) return true;
  frenoDePedidos.fail(clave);
  return false;
}

/** Clase viva que pisa [empiezaEn, terminaEn), o null. Se llama adentro de la transacción. */
type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];
async function choqueEn(tx: Tx, tenantId: string, empiezaEn: Date, terminaEn: Date, excluir?: string) {
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
async function alumnoPorTelefono(tx: Tx, tenantId: string, telefono: string, nombre: string) {
  const existente = await tx.padelAlumno.findFirst({
    where: { tenantId, client: { phone: telefono } },
    select: { id: true, token: true, clientId: true, client: { select: { name: true } } },
  });
  if (existente) return { id: existente.id, token: existente.token, clientId: existente.clientId, nombre: existente.client.name, esNuevo: false };
  const ficha = await tx.client.findFirst({ where: { tenantId, phone: telefono }, select: { id: true, name: true } });
  const cliente = ficha ?? (await tx.client.create({ data: { tenantId, name: nombre, phone: telefono }, select: { id: true, name: true } }));
  const a = await tx.padelAlumno.create({ data: { tenantId, clientId: cliente.id, token: nuevoToken() }, select: { id: true, token: true, clientId: true } });
  return { ...a, nombre: cliente.name, esNuevo: !ficha };
}

/** El saldo a favor del alumno, leído adentro de la transacción (para que dos altas no lo usen dos veces). */
async function saldoEnTx(tx: Tx, tenantId: string, alumnoId: string, excluir?: string): Promise<number> {
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
function pagoConSaldo(saldo: number, precio: number) {
  return saldoCubre(saldo, precio) ? { pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", pagoValidadoEl: new Date() } : null;
}

const YA_PAGADA_CON_SALDO = "Ya está pagada con tu saldo a favor.";

// ── Mensajes al alumno ──────────────────────────────────────────────────────

const META_DE: Partial<Record<ClavePlantilla, ClaveMeta>> = {
  confirmada: "confirmada",
  rechazada: "rechazada",
  proxima: "proxima",
  pagoOk: "pagoOk",
  pagoNo: "pagoNo",
  recordatorio: "recordatorio",
  linkAlumno: "linkAlumno",
};

async function avisarAlAlumno(p: {
  tenantId: string;
  config: ConfigPadel;
  clave: ClavePlantilla;
  tipo: string;
  clase: { id: string; empiezaEn: Date; precio: number | { toString(): string } };
  alumno: { id: string; token: string; nombre: string; telefono: string };
  /** Una línea más al final (por ejemplo «Ya está pagada con tu saldo a favor.»). */
  extra?: string;
}): Promise<ConAviso> {
  const base = await origen();
  const vars = {
    nombre: p.alumno.nombre.split(" ")[0],
    dia: diaHumano(p.clase.empiezaEn),
    hora: horaHumana(p.clase.empiezaEn),
    // Sin precio cargado nunca «$ 0»: el texto de fábrica lo omite y uno editado lee «a coordinar».
    precio: Number(p.clase.precio) > 0 ? pesos(Number(p.clase.precio)) : "a coordinar",
    alias: p.config.aliasCbu || "(te lo paso por acá)",
    link: `${base}/alumno/${p.alumno.token}`,
    turnero: `${base}/clases`,
  };
  const precioCargado = Number(p.clase.precio) > 0;
  const plantilla =
    p.clave === "confirmada"
      ? plantillaConfirmada(p.config.plantillas.confirmada, { hayPrecio: precioCargado, hayAlias: Boolean(p.config.aliasCbu) })
      : p.config.plantillas[p.clave];
  const texto = [armarMensaje(plantilla, vars), p.extra].filter(Boolean).join(" ");
  const meta = META_DE[p.clave];
  const r = await notificadorActual().enviar({
    telefono: p.alumno.telefono,
    texto,
    plantilla: meta ? { clave: meta, vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)])) } : undefined,
  });
  await prisma.padelAviso.create({
    data: {
      tenantId: p.tenantId,
      destino: "ALUMNO",
      tipo: p.tipo,
      claseId: p.clase.id,
      alumnoId: p.alumno.id,
      texto,
      canal: r.canal,
      enviadoEl: r.enviado ? new Date() : null,
      errorEnvio: r.error ?? null,
      idExterno: r.idExterno ?? null,
    },
  });
  return { wa: r.wa, enviado: r.enviado };
}

async function avisarAlProfe(tenantId: string, tipo: string, texto: string, claseId: string | null, alumnoId: string | null) {
  await prisma.padelAviso.create({ data: { tenantId, destino: "PROFE", tipo, texto, claseId, alumnoId } });
}

// ════════════════════════════════════════════════════════════════════════════
// PÚBLICAS — turnero y link del alumno
// ════════════════════════════════════════════════════════════════════════════

export interface PedidoTurnero {
  hora: string; // ISO del inicio, tal como lo mostró el turnero
  nombre: string;
  telefono: string;
  tipo: string;
  personas: number;
}

/**
 * El alumno pide una clase desde el turnero público. Nace PEDIDA: la confirma el profe.
 *
 * `token` viene SÓLO si este navegador es el dueño del link: el alumno es nuevo (y se le guarda
 * la cookie) o ya tenía la cookie de ese mismo alumno. Si el celular es de un alumno conocido y
 * el navegador no lo es, `token: null` y `conocido: true`: la clase se pide igual y el profe la
 * confirma por el número de siempre. Nunca se le da a un tercero el link de otro.
 */
export async function pedirClase(p: PedidoTurnero): Promise<Resultado<{ token: string | null; conocido: boolean; waProfe: string | null; cuando: string }>> {
  if (await frenado()) return { ok: false, error: "Hiciste muchos pedidos seguidos. Probá de nuevo en unos minutos." };
  const nombre = nombreValido(p.nombre);
  if (!nombre) return { ok: false, error: "Poné tu nombre (y apellido si querés)." };
  const telefono = telefonoAlumno(p.telefono);
  if (!telefono) return { ok: false, error: "Poné tu celular con código de área, por ejemplo 11 5555-1234." };
  const tipo: TipoClase = esTipoClase(p.tipo) ? p.tipo : "INDIVIDUAL";
  const personas = tipo === "GRUPAL" ? Math.min(4, Math.max(2, Math.trunc(Number(p.personas)) || 2)) : 1;
  const empiezaEn = new Date(p.hora);
  if (Number.isNaN(empiezaEn.getTime())) return { ok: false, error: "Elegí un horario." };

  const tenantId = await getCurrentTenantId();
  const fecha = dateStrInBusinessTz(empiezaEn);
  const { config, libres } = await libresDelDia(tenantId, fecha);
  if (!libres.includes(empiezaEn.toISOString())) return { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro." };
  const terminaEn = new Date(empiezaEn.getTime() + config.duracionMin * 60_000);

  try {
    const r = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) throw new ErrorNegocio("Ese horario se acaba de ocupar. Elegí otro.");
      const alumno = await alumnoPorTelefono(tx, tenantId, telefono, nombre);
      const pendientes = await tx.padelClase.count({ where: { tenantId, alumnoId: alumno.id, estado: "PEDIDA", empiezaEn: { gt: new Date() } } });
      if (!puedePedir(pendientes, config.maxPendientesPorTel)) {
        throw new ErrorNegocio(`Ya tenés ${pendientes} clase${pendientes > 1 ? "s" : ""} esperando que el profe confirme. Cuando te conteste, pedí la próxima.`);
      }
      const clase = await tx.padelClase.create({
        data: { tenantId, alumnoId: alumno.id, clientId: alumno.clientId, empiezaEn, terminaEn, tipo, personas, origen: "TURNERO", precio: precioDe(config, tipo, personas) },
        select: { id: true },
      });
      return { alumno, claseId: clase.id };
    });
    const cuando = `${diaHumano(empiezaEn)} a las ${horaHumana(empiezaEn)}`;
    const token = tokenAEntregar({ esNuevo: r.alumno.esNuevo, tokenAlumno: r.alumno.token, tokenCookie: await leerTokenCookie() });
    if (r.alumno.esNuevo) await escribirTokenCookie(r.alumno.token);
    const queClase = tipo === "GRUPAL" ? `grupal (${personas})` : "individual";
    await avisarAlProfe(
      tenantId,
      "pedido",
      token
        ? `${r.alumno.esNuevo ? nombre : r.alumno.nombre} pidió clase ${queClase} el ${cuando}.`
        : `${r.alumno.nombre} (alumno conocido) pidió clase ${queClase} el ${cuando} desde un teléfono nuevo. Confirmalo por el número de siempre.`,
      r.claseId,
      r.alumno.id,
    );
    await auditPublic({ action: "padel.pedir", entity: "PadelClase", entityId: r.claseId, clientPhone: telefono, changes: { mismoDispositivo: Boolean(token), nuevo: r.alumno.esNuevo } });
    const negocio = await datosDelNegocio(tenantId);
    const waProfe = linkWhatsApp(
      negocio.whatsapp,
      armarMensaje(config.plantillas.pedidoAlProfe, { profe: negocio.profe, nombre, dia: diaHumano(empiezaEn), hora: horaHumana(empiezaEn) }),
    );
    refrescar(r.alumno.token);
    return { ok: true, token, conocido: !r.alumno.esNuevo && !token, waProfe, cuando };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * «¿Ya sos alumno? Pedí tu link»: el link NUNCA se muestra en pantalla. Si el celular es de un
 * alumno, le llega por WhatsApp a ese número (con la Cloud API sale solo; en modo manual queda en
 * la bandeja del profe como «Juan pidió su link», para mandarlo con un toque). La respuesta es
 * siempre la misma, exista o no el celular: no se revela quién es alumno.
 */
export async function pedirMiLink(telefonoRaw: string): Promise<Resultado<{ mensaje: string }>> {
  const telefono = telefonoAlumno(telefonoRaw);
  if (!telefono) return { ok: false, error: "Poné tu celular con código de área, por ejemplo 11 5555-1234." };
  const tenantId = await getCurrentTenantId();
  const claveIp = `padel-link:${tenantId}:${(await requestIp()) ?? "sin-ip"}`;
  const claveTel = `padel-link:${tenantId}:${telefono}`;
  const frenado = frenoDeLinkPorIp.blocked(claveIp) || frenoDeLinkPorTel.blocked(claveTel);
  if (!frenado) {
    frenoDeLinkPorIp.fail(claveIp);
    frenoDeLinkPorTel.fail(claveTel);
  }
  const [alumno, negocio] = await Promise.all([
    frenado
      ? Promise.resolve(null)
      : prisma.padelAlumno.findFirst({ where: { tenantId, client: { phone: telefono } }, select: { id: true, token: true, client: { select: { name: true, phone: true } } } }),
    datosDelNegocio(tenantId),
  ]);
  const yaPedido = alumno
    ? Boolean(await prisma.padelAviso.findFirst({ where: { tenantId, alumnoId: alumno.id, tipo: "link-pedido", createdAt: { gte: new Date(Date.now() - DIEZ_MIN) } }, select: { id: true } }))
    : false;
  const d = decidirPedidoDeLink({ frenado, esAlumno: Boolean(alumno), yaPedidoHaceRato: yaPedido, profe: negocio.profe });
  if (!d.ok) return d;
  if (d.avisar && alumno) {
    await avisarAlProfe(tenantId, "link-pedido", `${alumno.client.name} pidió su link desde el turnero. Mandáselo desde Alumnos → «Mandarle su link».`, null, alumno.id);
    const notificador = notificadorActual();
    if (notificador.modo === "cloud") {
      const config = await configPadel(tenantId);
      const vars = { nombre: alumno.client.name.split(" ")[0], link: `${await origen()}/alumno/${alumno.token}` };
      const texto = armarMensaje(config.plantillas.linkAlumno, vars);
      const r = await notificador.enviar({ telefono: alumno.client.phone, texto, plantilla: { clave: "linkAlumno", vars } });
      await prisma.padelAviso.create({
        data: {
          tenantId, destino: "ALUMNO", tipo: "link", alumnoId: alumno.id, texto, canal: r.canal,
          enviadoEl: r.enviado ? new Date() : null, errorEnvio: r.error ?? null, idExterno: r.idExterno ?? null,
        },
      });
    }
  }
  await auditPublic({ action: "padel.pedirLink", entity: "PadelAlumno", entityId: alumno?.id ?? null, clientPhone: telefono });
  return { ok: true, mensaje: d.mensaje };
}

/**
 * El alumno abrió su link (`/alumno/<token>`): este navegador queda recordado con la cookie
 * httpOnly, así la próxima vez el turnero sabe quién es sin pedirle nada. Sólo si el token existe
 * EN ESTE negocio: un token de otro negocio no escribe nada.
 */
export async function recordarToken(token: string): Promise<Resultado> {
  if (!tokenValido(token)) return { ok: false, error: "Este link no es válido." };
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, token }, select: { id: true } });
  if (!a) return { ok: false, error: "Este link no es válido." };
  if ((await leerTokenCookie()) !== token) await escribirTokenCookie(token);
  return { ok: true };
}

async function alumnoDelToken(token: string) {
  if (!tokenValido(token)) return null;
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({
    where: { tenantId, token },
    select: { id: true, token: true, clientId: true, client: { select: { name: true, phone: true } }, _count: { select: { clases: { where: { estado: "DADA" } } } } },
  });
  return a ? { tenantId, alumno: a } : null;
}

/**
 * El alumno reserva desde su link: "la semana que viene a la misma hora" (con `repiteDe`) u
 * otro horario libre que le ofrecimos. Si ya tomó clases, nace CONFIRMADA (no le hace falta
 * esperar al profe); si es nuevo, PEDIDA. Si el horario no está, devuelve alternativas.
 */
export async function reservarDesdeLink(token: string, horaIso: string, repiteDe?: string): Promise<Resultado<{ estado: string; cuando: string; pagadaConSaldo?: boolean }> & { alternativas?: string[] }> {
  if (await frenado()) return { ok: false, error: "Hiciste muchos pedidos seguidos. Probá de nuevo en unos minutos." };
  const d = await alumnoDelToken(token);
  if (!d) return { ok: false, error: "Este link no es válido. Pedile uno nuevo al profe." };
  const { tenantId, alumno } = d;
  const empiezaEn = new Date(horaIso);
  if (Number.isNaN(empiezaEn.getTime())) return { ok: false, error: "Elegí un horario." };

  let base: { tipo: string; personas: number } = { tipo: "INDIVIDUAL", personas: 1 };
  if (repiteDe) {
    const anterior = await prisma.padelClase.findFirst({ where: { tenantId, id: repiteDe, alumnoId: alumno.id }, select: { tipo: true, personas: true } });
    if (!anterior) return { ok: false, error: "No encontramos esa clase." };
    base = anterior;
  }

  const fecha = dateStrInBusinessTz(empiezaEn);
  const { config, libres } = await libresDelDia(tenantId, fecha);
  if (!libres.includes(empiezaEn.toISOString())) {
    // Las dos franjas libres más cercanas a la que quería, ese día o el siguiente.
    const siguiente = new Date(new Date(`${fecha}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    const otras = [...libres, ...(await libresDelDia(tenantId, siguiente)).libres];
    const alternativas = otras.sort((a, b) => Math.abs(new Date(a).getTime() - empiezaEn.getTime()) - Math.abs(new Date(b).getTime() - empiezaEn.getTime())).slice(0, 3).sort();
    return { ok: false, error: "Ese horario ya no está libre.", alternativas };
  }
  const tipo: TipoClase = esTipoClase(base.tipo) ? base.tipo : "INDIVIDUAL";
  const confirmada = repetidaNaceConfirmada(alumno._count.clases);
  const terminaEn = new Date(empiezaEn.getTime() + config.duracionMin * 60_000);
  try {
    const clase = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) throw new ErrorNegocio("Ese horario se acaba de ocupar. Elegí otro.");
      if (!confirmada) {
        const pendientes = await tx.padelClase.count({ where: { tenantId, alumnoId: alumno.id, estado: "PEDIDA", empiezaEn: { gt: new Date() } } });
        if (!puedePedir(pendientes, config.maxPendientesPorTel)) throw new ErrorNegocio("Ya tenés clases esperando que el profe confirme.");
      }
      const precio = precioDe(config, tipo, base.personas);
      // Confirmada de entrada: si tiene saldo a favor que la cubre entera, nace pagada.
      const conSaldo = confirmada ? pagoConSaldo(await saldoEnTx(tx, tenantId, alumno.id), precio) : null;
      return tx.padelClase.create({
        data: {
          tenantId, alumnoId: alumno.id, clientId: alumno.clientId, empiezaEn, terminaEn, tipo, personas: base.personas,
          estado: confirmada ? "CONFIRMADA" : "PEDIDA", confirmadaEl: confirmada ? new Date() : null,
          origen: "ALUMNO_LINK", repiteDe: repiteDe ?? null, precio, ...(conSaldo ?? {}),
        },
        select: { id: true, pagoMedio: true },
      });
    });
    const cuando = `${diaHumano(empiezaEn)} a las ${horaHumana(empiezaEn)}`;
    await avisarAlProfe(tenantId, confirmada ? "proxima" : "pedido", `${alumno.client.name} ${confirmada ? "confirmó" : "pidió"} clase el ${cuando} desde su link.`, clase.id, alumno.id);
    await auditPublic({ action: "padel.reservarDesdeLink", entity: "PadelClase", entityId: clase.id, clientPhone: alumno.client.phone });
    refrescar(token);
    return { ok: true, estado: confirmada ? "CONFIRMADA" : "PEDIDA", cuando, pagadaConSaldo: clase.pagoMedio === "SALDO_A_FAVOR" };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/** El alumno manda la foto del comprobante: la clase queda "comprobante por revisar". */
export async function subirComprobante(token: string, claseId: string, dataUrl: string): Promise<Resultado> {
  if (!comprobanteValido(dataUrl)) return { ok: false, error: "La imagen es muy pesada o no es una foto. Probá con una captura de pantalla." };
  const d = await alumnoDelToken(token);
  if (!d) return { ok: false, error: "Este link no es válido. Pedile uno nuevo al profe." };
  const { tenantId, alumno } = d;
  const clase = await prisma.padelClase.findFirst({ where: { tenantId, id: claseId, alumnoId: alumno.id }, select: { id: true, estado: true, pagoEstado: true, empiezaEn: true } });
  if (!clase) return { ok: false, error: "No encontramos esa clase." };
  const nuevo = transicionPago(clase.pagoEstado, clase.estado, "subir", "alumno");
  if (!nuevo) return { ok: false, error: clase.pagoEstado === "PAGADO" ? "Esa clase ya está pagada." : "Esa clase no se puede pagar." };
  await prisma.padelClase.updateMany({
    where: { tenantId, id: clase.id },
    data: { pagoEstado: nuevo, pagoMedio: "TRANSFERENCIA", comprobante: dataUrl, comprobanteEnviadoEl: new Date(), pagoNota: null },
  });
  await avisarAlProfe(tenantId, "comprobante", `${alumno.client.name} mandó el comprobante de la clase del ${diaHumano(clase.empiezaEn)}.`, clase.id, alumno.id);
  await auditPublic({ action: "padel.comprobante", entity: "PadelClase", entityId: clase.id, clientPhone: alumno.client.phone });
  refrescar(token);
  return { ok: true };
}

/** El alumno cancela desde su link (sólo con la anticipación que fijó el profe). */
export async function cancelarDesdeLink(token: string, claseId: string): Promise<Resultado> {
  const d = await alumnoDelToken(token);
  if (!d) return { ok: false, error: "Este link no es válido. Pedile uno nuevo al profe." };
  const { tenantId, alumno } = d;
  const [clase, config] = await Promise.all([
    prisma.padelClase.findFirst({ where: { tenantId, id: claseId, alumnoId: alumno.id }, select: { id: true, estado: true, empiezaEn: true, pagoEstado: true, pagoMedio: true } }),
    configPadel(tenantId),
  ]);
  if (!clase) return { ok: false, error: "No encontramos esa clase." };
  if (!puedeCancelarAlumno(clase.estado, clase.empiezaEn, new Date(), config.anticipacionMin)) {
    return { ok: false, error: "Ya no se puede cancelar desde acá. Escribile al profe." };
  }
  // Si estaba pagada, la plata queda a favor (no se pierde).
  const n = await prisma.padelClase.updateMany({
    where: { tenantId, id: clase.id, estado: clase.estado, pagoEstado: clase.pagoEstado },
    data: { estado: "CANCELADA", canceladaEl: new Date(), motivoCancel: "La canceló el alumno", ...(pagoAlCancelar(clase) ?? {}) },
  });
  if (n.count === 0) return { ok: false, error: "Esa clase ya cambió. Actualizá la pantalla." };
  await avisarAlProfe(tenantId, "cancelacion", `${alumno.client.name} canceló la clase del ${diaHumano(clase.empiezaEn)} a las ${horaHumana(clase.empiezaEn)}. Ese horario quedó libre.`, clase.id, alumno.id);
  await auditPublic({ action: "padel.cancelarAlumno", entity: "PadelClase", entityId: clase.id, clientPhone: alumno.client.phone });
  refrescar(token);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// DEL PROFE — panel
// ════════════════════════════════════════════════════════════════════════════

async function claseDelProfe(id: string) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const clase = await prisma.padelClase.findFirst({
    where: { tenantId, id },
    select: {
      id: true, estado: true, pagoEstado: true, pagoMedio: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, precio: true, alumnoId: true, clientId: true,
      alumno: { select: { id: true, token: true } },
      client: { select: { name: true, phone: true } },
    },
  });
  if (!clase) throw new ErrorNegocio("No encontramos esa clase.");
  const config = await configPadel(tenantId);
  const alumno = { id: clase.alumno.id, token: clase.alumno.token, nombre: clase.client.name, telefono: clase.client.phone };
  return { tenantId, clase, config, alumno };
}

const MENSAJE_POR_EVENTO: Partial<Record<EventoClase, { clave: ClavePlantilla; tipo: string }>> = {
  confirmar: { clave: "confirmada", tipo: "confirmada" },
  rechazar: { clave: "rechazada", tipo: "rechazada" },
  cancelar: { clave: "rechazada", tipo: "cancelada" },
};

/**
 * Confirmar, rechazar, dar, ausente o cancelar: un toque. Devuelve el WhatsApp listo si corresponde.
 * Cancelar o rechazar una clase PAGADA la deja ACREDITADO: `aFavor` es lo que queda a favor del
 * alumno. Confirmar con saldo a favor que la cubre la deja pagada con «Saldo a favor».
 */
export async function moverClase(id: string, evento: EventoClase): Promise<Resultado<ConAviso & { aFavor?: number }>> {
  try {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    const nuevo = transicionClase(clase.estado, evento, "profe");
    if (!nuevo) return { ok: false, error: "Esa clase ya cambió. Actualizá la pantalla." };
    const ahora = new Date();
    const sello: Record<string, Date | string> =
      nuevo === "CONFIRMADA" ? { confirmadaEl: ahora } :
      nuevo === "RECHAZADA" ? { rechazadaEl: ahora } :
      nuevo === "DADA" ? { dadaEl: ahora } :
      nuevo === "CANCELADA" ? { canceladaEl: ahora, motivoCancel: "La canceló el profe" } : {};
    // Al confirmar se congela el precio vigente: si después cambia la lista, esta clase no se discute.
    const precio = nuevo === "CONFIRMADA" ? { precio: precioDe(config, esTipoClase(clase.tipo) ? clase.tipo : "INDIVIDUAL", clase.personas) } : {};
    // Cancelada o rechazada: si estaba pagada, la plata queda a favor (pagoAlCancelar).
    const pago = nuevo === "CANCELADA" || nuevo === "RECHAZADA" ? pagoAlCancelar(clase) : null;
    const r = await bookingTransaction(async (tx) => {
      const conSaldo =
        nuevo === "CONFIRMADA" && clase.pagoEstado === "PENDIENTE"
          ? pagoConSaldo(await saldoEnTx(tx, tenantId, clase.alumnoId, id), Number("precio" in precio ? precio.precio : clase.precio))
          : null;
      const n = await tx.padelClase.updateMany({
        where: { tenantId, id, estado: clase.estado, pagoEstado: clase.pagoEstado },
        data: { estado: nuevo, ...sello, ...precio, ...(pago ?? {}), ...(conSaldo ?? {}) },
      });
      return { cambio: n.count > 0, conSaldo: Boolean(conSaldo) };
    });
    if (!r.cambio) return { ok: false, error: "Esa clase ya cambió. Actualizá la pantalla." };
    await prisma.padelAviso.updateMany({ where: { tenantId, claseId: id, destino: "PROFE", leidoEl: null }, data: { leidoEl: ahora } });
    const cambioPago = r.conSaldo ? "SALDO_A_FAVOR" : pago?.pagoEstado;
    await auditAdmin({ action: `padel.${evento}`, entity: "PadelClase", entityId: id, changes: { de: clase.estado, a: nuevo, ...(cambioPago ? { pago: cambioPago } : {}) } });
    const acreditada = pago?.pagoEstado === "ACREDITADO";
    const m = MENSAJE_POR_EVENTO[evento];
    const aviso = m
      ? await avisarAlAlumno({
          tenantId, config, clave: m.clave, tipo: m.tipo, alumno,
          clase: { ...clase, ...("precio" in precio ? precio : {}) },
          extra: r.conSaldo ? YA_PAGADA_CON_SALDO : acreditada ? `Lo que pagaste (${pesos(Number(clase.precio))}) te queda a favor para la próxima.` : undefined,
        })
      : { wa: null, enviado: false };
    refrescar(alumno.token);
    return { ok: true, ...aviso, ...(acreditada ? { aFavor: Number(clase.precio) } : {}) };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/** Cobro: "cobré en efectivo", validar el comprobante o devolverlo. */
export async function moverPago(id: string, evento: Exclude<EventoPago, "subir">, nota?: string): Promise<Resultado<ConAviso>> {
  try {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    const nuevo = transicionPago(clase.pagoEstado, clase.estado, evento, "profe");
    if (!nuevo) return { ok: false, error: "Ese cobro ya cambió. Actualizá la pantalla." };
    const ahora = new Date();
    const data =
      evento === "efectivo" ? { pagoEstado: nuevo, pagoMedio: "EFECTIVO", pagoValidadoEl: ahora } :
      evento === "validar" ? { pagoEstado: nuevo, pagoValidadoEl: ahora } :
      { pagoEstado: nuevo, pagoNota: (nota ?? "").slice(0, 200) || "No se pudo validar el comprobante" };
    const n = await prisma.padelClase.updateMany({ where: { tenantId, id, pagoEstado: clase.pagoEstado }, data });
    if (n.count === 0) return { ok: false, error: "Ese cobro ya cambió. Actualizá la pantalla." };
    await prisma.padelAviso.updateMany({ where: { tenantId, claseId: id, destino: "PROFE", tipo: "comprobante", leidoEl: null }, data: { leidoEl: ahora } });
    await auditAdmin({ action: `padel.pago.${evento}`, entity: "PadelClase", entityId: id, changes: { de: clase.pagoEstado, a: nuevo } });
    const aviso =
      evento === "validar" ? await avisarAlAlumno({ tenantId, config, clave: "pagoOk", tipo: "pago-ok", clase, alumno }) :
      evento === "noValido" ? await avisarAlAlumno({ tenantId, config, clave: "pagoNo", tipo: "pago-no", clase, alumno }) :
      { wa: null, enviado: false };
    refrescar(alumno.token);
    return { ok: true, ...aviso };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * "Agendar la próxima": la misma hora la semana que viene, CONFIRMADA. El profe puede agendar
 * fuera de su grilla (lo arregló en la cancha); lo único que se frena es pisar otra clase.
 */
export async function agendarProxima(id: string): Promise<Resultado<ConAviso & { cuando: string }>> {
  try {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    const empiezaEn = proximaSemana(clase.empiezaEn);
    const terminaEn = proximaSemana(clase.terminaEn);
    const nueva = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) throw new ErrorNegocio(`El ${diaHumano(empiezaEn)} a las ${horaHumana(empiezaEn)} ya está ocupado.`);
      const precio = precioDe(config, esTipoClase(clase.tipo) ? clase.tipo : "INDIVIDUAL", clase.personas);
      const conSaldo = pagoConSaldo(await saldoEnTx(tx, tenantId, clase.alumnoId), precio);
      return tx.padelClase.create({
        data: {
          tenantId, alumnoId: clase.alumnoId, clientId: clase.clientId, empiezaEn, terminaEn, tipo: clase.tipo, personas: clase.personas,
          estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", repiteDe: clase.id, precio, ...(conSaldo ?? {}),
        },
        select: { id: true, empiezaEn: true, precio: true, pagoMedio: true },
      });
    });
    await auditAdmin({ action: "padel.agendarProxima", entity: "PadelClase", entityId: nueva.id, changes: { repiteDe: clase.id } });
    const aviso = await avisarAlAlumno({ tenantId, config, clave: "proxima", tipo: "proxima", clase: nueva, alumno, extra: nueva.pagoMedio === "SALDO_A_FAVOR" ? YA_PAGADA_CON_SALDO : undefined });
    refrescar(alumno.token);
    return { ok: true, ...aviso, cuando: `${diaHumano(empiezaEn)} ${horaHumana(empiezaEn)}` };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/** Alta directa del profe (le pidieron la clase en la cancha): alumno existente o nuevo. */
export async function agendarClase(fd: FormData): Promise<Resultado<ConAviso & { cuando: string }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const fecha = String(fd.get("fecha") ?? "");
  const horaTxt = String(fd.get("hora") ?? "");
  if (!fechaValida(fecha) || !horaValida(horaTxt)) return { ok: false, error: "Elegí día y hora." };
  const tipo: TipoClase = esTipoClase(fd.get("tipo")) ? (fd.get("tipo") as TipoClase) : "INDIVIDUAL";
  const personas = tipo === "GRUPAL" ? Math.min(4, Math.max(2, Number(fd.get("personas")) || 2)) : 1;
  const alumnoId = String(fd.get("alumnoId") ?? "");
  const nombre = nombreValido(fd.get("nombre"));
  const telefono = telefonoAlumno(String(fd.get("telefono") ?? ""));
  if (!alumnoId && (!nombre || !telefono)) return { ok: false, error: "Elegí un alumno, o poné nombre y celular de uno nuevo." };

  const config = await configPadel(tenantId);
  const empiezaEn = businessWallTimeToUtc(fecha, horaTxt);
  const terminaEn = new Date(empiezaEn.getTime() + config.duracionMin * 60_000);
  try {
    const r = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, empiezaEn, terminaEn)) throw new ErrorNegocio("Ese horario ya tiene una clase.");
      const alumno = alumnoId
        ? await tx.padelAlumno.findFirst({ where: { tenantId, id: alumnoId }, select: { id: true, token: true, clientId: true } })
        : await alumnoPorTelefono(tx, tenantId, telefono, nombre!);
      if (!alumno) throw new ErrorNegocio("No encontramos ese alumno.");
      const precio = precioDe(config, tipo, personas);
      const conSaldo = pagoConSaldo(await saldoEnTx(tx, tenantId, alumno.id), precio);
      const clase = await tx.padelClase.create({
        data: {
          tenantId, alumnoId: alumno.id, clientId: alumno.clientId, empiezaEn, terminaEn, tipo, personas,
          estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio, ...(conSaldo ?? {}),
        },
        select: { id: true, empiezaEn: true, precio: true, pagoMedio: true },
      });
      const cliente = await tx.client.findFirst({ where: { tenantId, id: alumno.clientId }, select: { name: true, phone: true } });
      return { clase, alumno: { id: alumno.id, token: alumno.token, nombre: cliente?.name ?? "", telefono: cliente?.phone ?? "" } };
    });
    await auditAdmin({ action: "padel.agendar", entity: "PadelClase", entityId: r.clase.id });
    const aviso = await avisarAlAlumno({ tenantId, config, clave: "proxima", tipo: "proxima", clase: r.clase, alumno: r.alumno, extra: r.clase.pagoMedio === "SALDO_A_FAVOR" ? YA_PAGADA_CON_SALDO : undefined });
    refrescar(r.alumno.token);
    return { ok: true, ...aviso, cuando: `${diaHumano(empiezaEn)} ${horaHumana(empiezaEn)}` };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/** El link del alumno por WhatsApp (para mandárselo la primera vez o si lo perdió). */
export async function mandarLinkAlAlumno(alumnoId: string): Promise<Resultado<{ wa: string | null }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, id: alumnoId }, select: { token: true, client: { select: { name: true, phone: true } } } });
  if (!a) return { ok: false, error: "No encontramos ese alumno." };
  const config = await configPadel(tenantId);
  const texto = armarMensaje(config.plantillas.linkAlumno, { nombre: a.client.name.split(" ")[0], link: `${await origen()}/alumno/${a.token}` });
  return { ok: true, wa: linkWhatsApp(a.client.phone, texto) };
}

/** Recordatorio de la clase (para las de mañana): el WhatsApp listo. */
export async function recordatorio(id: string): Promise<Resultado<ConAviso>> {
  try {
    const { tenantId, clase, config, alumno } = await claseDelProfe(id);
    return { ok: true, ...(await avisarAlAlumno({ tenantId, config, clave: "recordatorio", tipo: "recordatorio", clase, alumno })) };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * «Le devolví»: el profe le devolvió en mano lo que había quedado a favor de esa clase.
 * ACREDITADO → DEVUELTO, y sale del saldo. No deja el saldo en negativo (si parte ya se usó, no corre).
 */
export async function devolverSaldo(claseId: string): Promise<Resultado<{ aFavor: number }>> {
  try {
    const { tenantId, clase } = await claseDelProfe(claseId);
    const nuevo = transicionPago(clase.pagoEstado, clase.estado, "devolver", "profe");
    if (!nuevo) return { ok: false, error: "Esa clase no tiene plata a favor para devolver." };
    const r = await tenantTransaction(async (tx) => {
      const saldo = await saldoEnTx(tx, tenantId, clase.alumnoId);
      if (saldo < Number(clase.precio)) throw new ErrorNegocio("Parte de ese saldo ya se usó en otra clase: no se puede devolver entero.");
      const n = await tx.padelClase.updateMany({ where: { tenantId, id: claseId, pagoEstado: "ACREDITADO" }, data: { pagoEstado: nuevo } });
      if (n.count === 0) throw new ErrorNegocio("Ese saldo ya cambió. Actualizá la pantalla.");
      return { aFavor: saldo - Number(clase.precio) };
    });
    await auditAdmin({ action: "padel.pago.devolver", entity: "PadelClase", entityId: claseId, changes: { de: clase.pagoEstado, a: nuevo } });
    refrescar(clase.alumno.token);
    return { ok: true, aFavor: r.aFavor };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

export async function marcarAvisosLeidos(): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  await prisma.padelAviso.updateMany({ where: { tenantId, destino: "PROFE", leidoEl: null, tipo: { in: [...AVISOS_QUE_ESPERAN, "proxima"] } }, data: { leidoEl: new Date() } });
  revalidatePath(RAIZ, "layout");
}

// ── Configuración ───────────────────────────────────────────────────────────

const entero = (v: FormDataEntryValue | null, min: number, max: number, def: number): number => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const importe = (v: FormDataEntryValue | null): number => {
  const l = leerImporte(typeof v === "string" ? v : "");
  return l.estado === "ok" ? l.valor : 0;
};

export async function guardarConfig(fd: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const plantillas: Record<string, string> = {};
  for (const k of CLAVES_PLANTILLA) {
    const t = String(fd.get(`plantilla_${k}`) ?? "").trim();
    if (t) plantillas[k] = t.slice(0, 600);
  }
  const whatsapp = String(fd.get("whatsappProfe") ?? "").trim();
  if (whatsapp && !telefonoAlumno(whatsapp)) return { ok: false, error: "El celular tiene que ser argentino, con código de área (ej. 11 5555-1234)." };
  const data = {
    duracionMin: entero(fd.get("duracionMin"), 30, 180, 60),
    precioIndividual: importe(fd.get("precioIndividual")),
    precioGrupal: importe(fd.get("precioGrupal")),
    aliasCbu: String(fd.get("aliasCbu") ?? "").trim().slice(0, 60) || null,
    titularCuenta: String(fd.get("titularCuenta") ?? "").trim().slice(0, 80) || null,
    anticipacionMin: entero(fd.get("anticipacionMin"), 0, 48 * 60, 120),
    diasAdelante: entero(fd.get("diasAdelante"), 1, 60, 14),
    maxPendientesPorTel: entero(fd.get("maxPendientesPorTel"), 1, 10, 2),
    whatsappProfe: whatsapp ? telefonoAlumno(whatsapp) : null,
    plantillas,
  };
  await prisma.padelConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await auditAdmin({ action: "padel.config", entity: "PadelConfig", entityId: tenantId });
  refrescar();
  return { ok: true };
}

/**
 * Los horarios de la semana: por cada día, "desde-hasta" separados por coma
 * ("08:00-12:00, 16:00-21:00"). Vacío = ese día no da clases. Reemplaza las franjas semanales.
 */
export async function guardarHorarios(fd: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const filas: { diaSemana: number; desde: string; hasta: string }[] = [];
  for (let dia = 0; dia < 7; dia++) {
    const raw = String(fd.get(`dia_${dia}`) ?? "").trim();
    if (!raw) continue;
    for (const tramo of raw.split(/[,;]/)) {
      const m = /^\s*(\d{1,2}):?(\d{2})?\s*(?:-|a)\s*(\d{1,2}):?(\d{2})?\s*$/.exec(tramo);
      if (!m) return { ok: false, error: `No entendí "${tramo.trim()}". Escribilo como 08:00-12:00.` };
      const desde = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
      const hasta = `${m[3].padStart(2, "0")}:${m[4] ?? "00"}`;
      if (!horaValida(desde) || !horaValida(hasta) || hasta <= desde) return { ok: false, error: `El tramo "${tramo.trim()}" no es válido.` };
      filas.push({ diaSemana: dia, desde, hasta });
    }
  }
  await tenantTransaction(async (tx) => {
    await tx.padelDisponibilidad.deleteMany({ where: { tenantId, fecha: null } });
    if (filas.length) await tx.padelDisponibilidad.createMany({ data: filas.map((f) => ({ tenantId, ...f, tipo: "DA" })) });
  });
  await auditAdmin({ action: "padel.horarios", entity: "PadelDisponibilidad", changes: { tramos: filas.length } });
  refrescar();
  return { ok: true };
}

/** Bloquear un día (o una parte): lluvia, viaje, torneo. El turnero deja de ofrecerlo. */
export async function agregarBloqueo(fd: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const fecha = String(fd.get("fecha") ?? "");
  const desde = String(fd.get("desde") ?? "") || "00:00";
  const hasta = String(fd.get("hasta") ?? "") || "23:59";
  if (!fechaValida(fecha) || !horaValida(desde) || !horaValida(hasta) || hasta <= desde) return { ok: false, error: "Elegí el día (y si querés, desde y hasta qué hora)." };
  await prisma.padelDisponibilidad.create({ data: { tenantId, fecha: new Date(`${fecha}T00:00:00.000Z`), desde, hasta, tipo: "NO" } });
  await auditAdmin({ action: "padel.bloqueo", entity: "PadelDisponibilidad", changes: { fecha, desde, hasta } });
  refrescar();
  return { ok: true };
}

export async function quitarBloqueo(fd: FormData): Promise<void> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  await prisma.padelDisponibilidad.deleteMany({ where: { tenantId, id: String(fd.get("id") ?? ""), fecha: { not: null } } });
  refrescar();
}
