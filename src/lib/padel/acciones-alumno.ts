"use server";

// ============================================================================
// PADEL-CLASES — escrituras PÚBLICAS (turnero y link del alumno). Sin login.
// ============================================================================
//
// El negocio sale del dominio; el alumno, del token de su link o de la cookie `padel_alumno` de su
// teléfono (alumnoDelLink). Todo se busca con `tenantId` + `alumnoId`: un alumno nunca toca una
// clase de otro alumno ni de otro negocio, y la respuesta nunca trae datos de otro.
// Frenadas por IP (30 cada 10 min) y, lo que se pide con un celular, por teléfono (3 cada 10 min).
// Todo se vuelve a chequear en el servidor: la franja que mandó el navegador no se cree a ciegas.
//
// El token del alumno (la llave de su link) se entrega SÓLO al dispositivo que lo creó o que ya lo
// tenía en su cookie (sesion-alumno.ts). A quien tipea un celular ajeno nunca se le muestra: el
// link le viaja por WhatsApp al número registrado (pedirMiLink).
//
// Las altas de clase van en `bookingTransaction` (Serializable con reintento): dos alumnos que
// tocan la misma franja a la vez no quedan los dos adentro (ADR-004/023).

import { after } from "next/server";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { bookingTransaction, tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditPublic, requestIp } from "@/lib/audit-core";
import { createRateLimiter } from "@/lib/rate-limit";
import { dateStrInBusinessTz } from "@/lib/datetime";
import {
  armarMensaje,
  comprobanteValido,
  diaHumano,
  esTipoClase,
  horaHumana,
  linkWhatsApp,
  nombreValido,
  pagoAlCancelar,
  pesos,
  precioDe,
  puedeCancelarAlumno,
  puedePedir,
  puedeSubirComprobante,
  repetidaNaceConfirmada,
  telefonoAlumno,
  textoMensajeValido,
  tokenValido,
  type TipoClase,
} from "./core";
import { configPadel, datosDelNegocio, libresCercanos, libresDelDia } from "./datos.server";
import { notificadorActual } from "./notificador";
import { conPisoDeTiempo, decidirPedidoDeLink, politicaDeToken } from "./sesion-alumno";
import { escribirTokenCookie, leerTokenCookie } from "./sesion-alumno.server";
import {
  DIEZ_MIN,
  ErrorNegocio,
  FRENADO,
  LINK_INVALIDO,
  alumnoDelLink,
  alumnoPorTelefono,
  alumnoReconocido,
  avisarAlProfe,
  choqueEn,
  conErrorNegocio,
  respuestaDeError,
  frenadoPorIp,
  frenadoPorTelefono,
  origen,
  pagoConSaldo,
  refrescar,
  regenerarToken,
  saldoEnTx,
  tokenParaMandar,
  type Resultado,
} from "./acciones-compartido";

// «Pedí tu link»: por IP y, sobre todo, por celular (3 en 10 min; el 4º se frena). Un mismo celular
// recibe a lo sumo un WhatsApp con su link cada 10 minutos (lo mira la base, no la memoria).
const frenoDeLinkPorIp = createRateLimiter({ max: 30, windowMs: DIEZ_MIN });
const frenoDeLinkPorTel = createRateLimiter({ max: 3, windowMs: DIEZ_MIN });
// O-2: «Pedí tu link» siempre tarda al menos esto (exista o no el celular).
const PISO_PEDIR_LINK_MS = 800;
// O-6: abrir el link del alumno recuerda el dispositivo; por IP, 30 cada 10 min (una lectura cada una).
const frenoDeRecordar = createRateLimiter({ max: 30, windowMs: DIEZ_MIN });

const ACTIVAS = ["PEDIDA", "CONFIRMADA"];

// ════════════════════════════════════════════════════════════════════════════
// TURNERO
// ════════════════════════════════════════════════════════════════════════════

export interface PedidoTurnero {
  hora: string; // ISO del inicio, tal como lo mostró el turnero
  nombre: string;
  telefono: string;
  tipo: string;
  personas: number;
  /** T3C: «¿Algo que el profe tenga que saber?» (opcional). Va en el aviso al profe, no en la clase. */
  nota?: string;
}

/** T3C: la nota opcional del turnero, ya validada, como cola del aviso al profe (vacío si no hay). */
const colaDeNota = (raw: unknown): string => {
  const t = raw ? textoMensajeValido(raw) : null;
  return t ? ` Nota: «${t.slice(0, 300)}»` : "";
};

/**
 * El alumno pide una clase desde el turnero público. Nace PEDIDA: la confirma el profe.
 *
 * `token` viene SÓLO si este navegador es el dueño del link: el alumno es nuevo (y se le guarda
 * la cookie) o ya tenía la cookie de ese mismo alumno. Si el celular es de un alumno conocido y
 * el navegador no lo es, `token: null` y `conocido: true`: la clase se pide igual y el profe la
 * confirma por el número de siempre. Nunca se le da a un tercero el link de otro.
 *
 * O-1: si el alumno de ese celular todavía no fue reconocido por el profe y el pedido viene de otro
 * dispositivo, su link se regenera sin entregárselo a nadie (politicaDeToken): el primero que tipeó
 * el número no se queda con las clases del dueño real.
 *
 * Si la hora se ocupó en el medio (A·E26), vuelve con las 2 libres más cercanas (`alternativas`).
 */
export async function pedirClase(
  p: PedidoTurnero,
): Promise<Resultado<{ token: string | null; conocido: boolean; waProfe: string | null; cuando: string; claseId: string | null }> & { alternativas?: string[] }> {
  const tenantId = await getCurrentTenantId();
  if (await frenadoPorIp("pedir", tenantId)) return { ok: false, error: FRENADO };
  const nombre = nombreValido(p.nombre);
  if (!nombre) return { ok: false, error: "Poné tu nombre (y apellido si querés)." };
  const telefono = telefonoAlumno(p.telefono);
  if (!telefono) return { ok: false, error: "Poné tu celular con código de área, por ejemplo 11 5555-1234." };
  const tipo: TipoClase = esTipoClase(p.tipo) ? p.tipo : "INDIVIDUAL";
  const personas = tipo === "GRUPAL" ? Math.min(4, Math.max(2, Math.trunc(Number(p.personas)) || 2)) : 1;
  const empiezaEn = new Date(p.hora);
  if (Number.isNaN(empiezaEn.getTime())) return { ok: false, error: "Elegí un horario." };

  const fecha = dateStrInBusinessTz(empiezaEn);
  const { config, libres } = await libresDelDia(tenantId, fecha);
  if (!libres.includes(empiezaEn.toISOString())) {
    return { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro.", alternativas: await libresCercanos(tenantId, empiezaEn, { n: 2 }) };
  }
  // El freno de 3 por celular cuenta DESPUÉS de ver que la hora está libre (O-10 de la CERT T2+T3):
  // un alumno al que «se le ocupó» tres veces seguidas no queda frenado 10 minutos. El de IP, arriba,
  // sigue contando todo.
  if (frenadoPorTelefono("pedir", tenantId, telefono)) return { ok: false, error: FRENADO };
  const terminaEn = new Date(empiezaEn.getTime() + config.duracionMin * 60_000);

  const tokenCookie = await leerTokenCookie();
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
      // ¿Este dispositivo es el dueño del link? Si no lo es y el profe todavía no reconoció al alumno,
      // el link se regenera: nadie se queda con uno que pudo sacar tipeando un celular ajeno.
      const reconocido = alumno.recienCreado ? false : await alumnoReconocido(tx, tenantId, alumno.id, clase.id);
      const politica = politicaDeToken({ esNuevo: alumno.esNuevo, recienCreado: alumno.recienCreado, reconocido, tokenAlumno: alumno.token, tokenCookie });
      const tokenVigente = politica.rotar ? await regenerarToken(tx, tenantId, alumno.id) : alumno.token;
      return { alumno: { ...alumno, token: tokenVigente }, tokenViejo: alumno.token, entregar: politica.entregar, rotado: politica.rotar, claseId: clase.id };
    });
    const cuando = `${diaHumano(empiezaEn)} a las ${horaHumana(empiezaEn)}`;
    const token = r.entregar;
    if (r.alumno.esNuevo && token) await escribirTokenCookie(token);
    const queClase = tipo === "GRUPAL" ? `grupal (${personas})` : "individual";
    await avisarAlProfe(
      tenantId,
      "pedido",
      (token
        ? `${r.alumno.esNuevo ? nombre : r.alumno.nombre} pidió clase ${queClase} el ${cuando}.`
        : r.rotado
          ? `${r.alumno.nombre} pidió clase ${queClase} el ${cuando} desde otro teléfono, y todavía no lo confirmaste nunca. Por seguridad su link se renovó: le llega el nuevo cuando lo confirmes. Confirmalo por el número de siempre.`
          : `${r.alumno.nombre} (alumno conocido) pidió clase ${queClase} el ${cuando} desde un teléfono nuevo. Confirmalo por el número de siempre.`) + colaDeNota(p.nota),
      r.claseId,
      r.alumno.id,
    );
    await auditPublic({ action: "padel.pedir", entity: "PadelClase", entityId: r.claseId, clientPhone: telefono, changes: { mismoDispositivo: Boolean(token), nuevo: r.alumno.esNuevo, linkRenovado: r.rotado } });
    const negocio = await datosDelNegocio(tenantId);
    const waProfe = linkWhatsApp(
      negocio.whatsapp,
      armarMensaje(config.plantillas.pedidoAlProfe, { profe: negocio.profe, nombre, dia: diaHumano(empiezaEn), hora: horaHumana(empiezaEn) }),
    );
    refrescar(r.alumno.token, r.tokenViejo);
    // T3C: el id de la clase sólo viaja con el token (lo usa «Agregar al calendario»); sin token no sirve.
    return { ok: true, token, conocido: !r.alumno.esNuevo && !token, waProfe, cuando, claseId: token ? r.claseId : null };
  } catch (e) {
    const r = respuestaDeError(e);
    if (r) return r;
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
  // O-2: la demora no tiene que decir si el celular es de un alumno. Las MISMAS lecturas en los dos
  // casos, lo que sólo pasa si existe (aviso, WhatsApp, registro) después de responder (`after`), y
  // un piso de tiempo por si la base contesta distinto.
  return conPisoDeTiempo(PISO_PEDIR_LINK_MS, async () => {
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
    // Siempre se consulta (con un id que no existe si no hay alumno): misma cantidad de idas a la base.
    const yaPedido = frenado
      ? false
      : Boolean(
          await prisma.padelAviso.findFirst({
            where: { tenantId, alumnoId: alumno?.id ?? "sin-alumno", tipo: "link-pedido", createdAt: { gte: new Date(Date.now() - DIEZ_MIN) } },
            select: { id: true },
          }),
        );
    const d = decidirPedidoDeLink({ frenado, esAlumno: Boolean(alumno), yaPedidoHaceRato: yaPedido, profe: negocio.profe });
    if (!d.ok) return d;
    const base = await origen();
    const avisar = d.avisar && alumno ? alumno : null;
    after(async () => {
      try {
        if (avisar) await mandarLinkPedido(tenantId, avisar, base);
        await auditPublic({ action: "padel.pedirLink", entity: "PadelAlumno", entityId: avisar?.id ?? alumno?.id ?? null, clientPhone: telefono });
      } catch (e) {
        logger.error("padel.pedirLink", "no se pudo avisar el pedido de link", e);
      }
    });
    return { ok: true, mensaje: d.mensaje };
  });
}

/** Lo que pasa cuando un alumno de verdad pidió su link: aviso al profe y, con la Cloud API, el WhatsApp. */
async function mandarLinkPedido(tenantId: string, alumno: { id: string; token: string; client: { name: string; phone: string } }, base: string) {
  await avisarAlProfe(tenantId, "link-pedido", `${alumno.client.name} pidió su link desde el turnero. Mandáselo desde Alumnos → «Mandarle su link».`, null, alumno.id);
  const notificador = notificadorActual();
  if (notificador.modo !== "cloud") return;
  const config = await configPadel(tenantId);
  const { token } = await tokenParaMandar(tenantId, alumno);
  const vars = { nombre: alumno.client.name.split(" ")[0], link: `${base}/alumno/${token}` };
  const texto = armarMensaje(config.plantillas.linkPedido, vars);
  const r = await notificador.enviar({ telefono: alumno.client.phone, texto, plantilla: { clave: "linkAlumno", vars } });
  await prisma.padelAviso.create({
    data: {
      tenantId, destino: "ALUMNO", tipo: "link", alumnoId: alumno.id, texto, canal: r.canal,
      enviadoEl: r.enviado ? new Date() : null, errorEnvio: r.error ?? null, idExterno: r.idExterno ?? null,
    },
  });
}

/**
 * «Dejarle un mensaje» (principio 6, A·E30): el alumno nunca llega a una vía muerta, aunque el profe
 * no tenga WhatsApp cargado. Con el link o la cookie, el mensaje entra a la bandeja con su nombre.
 * Sin link, desde el turnero, va con el celular que puso, marcado «sin verificar» y SIN asociarlo a
 * ningún alumno (nadie se hace pasar por otro). La respuesta es siempre la misma.
 */
export async function dejarMensaje(p: { token?: string | null; telefono?: string; nombre?: string; texto: string }): Promise<Resultado<{ mensaje: string }>> {
  const texto = textoMensajeValido(p?.texto);
  if (!texto) return { ok: false, error: "Escribí tu mensaje (hasta 500 letras)." };
  const tenantId = await getCurrentTenantId();
  if (await frenadoPorIp("mensaje", tenantId)) return { ok: false, error: FRENADO };
  if (p.token && !tokenValido(p.token)) return { ok: false, error: LINK_INVALIDO };
  const d = await alumnoDelLink(p.token ?? null);
  if (p.token && !d) return { ok: false, error: LINK_INVALIDO };
  const negocio = await datosDelNegocio(tenantId);
  if (d) {
    await avisarAlProfe(tenantId, "mensaje", `${d.alumno.client.name} te dejó un mensaje: «${texto}»`, null, d.alumno.id);
    await auditPublic({ action: "padel.mensaje", entity: "PadelAlumno", entityId: d.alumno.id, clientPhone: d.alumno.client.phone });
  } else {
    const telefono = telefonoAlumno(p.telefono);
    if (!telefono) return { ok: false, error: "Poné tu celular con código de área, así te puede contestar." };
    if (frenadoPorTelefono("mensaje", tenantId, telefono)) return { ok: false, error: FRENADO };
    const nombre = nombreValido(p.nombre) ?? "Alguien";
    await avisarAlProfe(tenantId, "mensaje", `${nombre} (${telefono}, sin verificar) te dejó un mensaje desde el turnero: «${texto}»`, null, null);
    await auditPublic({ action: "padel.mensaje", entity: "PadelAviso", clientPhone: telefono });
  }
  refrescar();
  return { ok: true, mensaje: `Listo, le llegó a ${negocio.profe}. Te contesta por WhatsApp.` };
}

// ════════════════════════════════════════════════════════════════════════════
// LINK DEL ALUMNO (token de /alumno/<token> o cookie de /mis-clases)
// ════════════════════════════════════════════════════════════════════════════

/**
 * El alumno abrió su link (`/alumno/<token>`): este navegador queda recordado con la cookie
 * httpOnly, así la próxima vez el turnero sabe quién es sin pedirle nada. Sólo si el token existe
 * EN ESTE negocio: un token de otro negocio no escribe nada.
 */
export async function recordarToken(token: string): Promise<Resultado> {
  if (!tokenValido(token)) return { ok: false, error: "Este link no es válido." };
  // Ya lo recuerda: no hace falta ni leer la base.
  if ((await leerTokenCookie()) === token) return { ok: true };
  // O-6: freno por IP antes de la lectura (la llama el navegador cada vez que se abre un link).
  const tenantId = await getCurrentTenantId();
  const clave = `padel-recordar:${tenantId}:${(await requestIp()) ?? "sin-ip"}`;
  if (frenoDeRecordar.blocked(clave)) return { ok: false, error: "Probá de nuevo en unos minutos." };
  frenoDeRecordar.fail(clave);
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, token }, select: { id: true } });
  if (!a) return { ok: false, error: "Este link no es válido." };
  await escribirTokenCookie(token);
  return { ok: true };
}

/**
 * El alumno reserva desde su link: "la semana que viene a la misma hora" (con `repiteDe`) u
 * otro horario libre que le ofrecimos. Si ya tomó clases, nace CONFIRMADA (no le hace falta
 * esperar al profe); si es nuevo, PEDIDA. Si el horario no está, devuelve alternativas.
 */
export async function reservarDesdeLink(
  token: string | null,
  horaIso: string,
  repiteDe?: string,
  /** T3C: el turnero con la cookie del alumno pide por acá (sin tipear): tipo, personas y nota. */
  opciones?: { tipo?: string; personas?: number; nota?: string },
): Promise<Resultado<{ estado: string; cuando: string; pagadaConSaldo?: boolean; claseId: string }> & { alternativas?: string[] }> {
  const tenantIdFreno = await getCurrentTenantId();
  if (await frenadoPorIp("link", tenantIdFreno)) return { ok: false, error: FRENADO };
  const d = await alumnoDelLink(token);
  if (!d) return { ok: false, error: LINK_INVALIDO };
  const { tenantId, alumno } = d;
  const empiezaEn = new Date(horaIso);
  if (Number.isNaN(empiezaEn.getTime())) return { ok: false, error: "Elegí un horario." };

  let base: { tipo: string; personas: number } = { tipo: "INDIVIDUAL", personas: 1 };
  if (repiteDe) {
    const anterior = await prisma.padelClase.findFirst({ where: { tenantId, id: repiteDe, alumnoId: alumno.id }, select: { tipo: true, personas: true } });
    if (!anterior) return { ok: false, error: "No encontramos esa clase." };
    base = anterior;
  } else if (opciones && esTipoClase(opciones.tipo)) {
    base = { tipo: opciones.tipo, personas: opciones.tipo === "GRUPAL" ? Math.min(4, Math.max(2, Math.trunc(Number(opciones.personas)) || 2)) : 1 };
  }

  const fecha = dateStrInBusinessTz(empiezaEn);
  const { config, libres } = await libresDelDia(tenantId, fecha);
  if (!libres.includes(empiezaEn.toISOString())) {
    // Las tres franjas libres más cercanas a la que quería, ese día o el siguiente.
    return { ok: false, error: "Ese horario ya no está libre.", alternativas: await libresCercanos(tenantId, empiezaEn) };
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
    await avisarAlProfe(tenantId, confirmada ? "proxima" : "pedido", `${alumno.client.name} ${confirmada ? "confirmó" : "pidió"} clase el ${cuando} desde su link.${colaDeNota(opciones?.nota)}`, clase.id, alumno.id);
    await auditPublic({ action: "padel.reservarDesdeLink", entity: "PadelClase", entityId: clase.id, clientPhone: alumno.client.phone });
    refrescar(alumno.token);
    return { ok: true, estado: confirmada ? "CONFIRMADA" : "PEDIDA", cuando, pagadaConSaldo: clase.pagoMedio === "SALDO_A_FAVOR", claseId: clase.id };
  } catch (e) {
    const r = respuestaDeError(e);
    if (r) return r;
    throw e;
  }
}

/** El alumno manda la foto del comprobante de UNA clase: queda "comprobante por revisar". */
export async function subirComprobante(token: string | null, claseId: string, dataUrl: string): Promise<Resultado> {
  const r = await subirComprobanteVarias(token, [claseId], dataUrl);
  return r.ok ? { ok: true } : r;
}

/**
 * «Ya transferí → Subir comprobante» (F8): UNA captura para N clases. Todas tienen que ser de este
 * alumno y pagables (o ya en revisión: manda otra); si una no, no se toca ninguna. Quedan EN_REVISION
 * con el MISMO comprobante y la misma hora de envío (el panel las agrupa por `comprobanteEnviadoEl`).
 * PDF: no hay librería para pasarlo a imagen sin una dependencia nueva (pide OK del dueño); hasta
 * entonces la pantalla pide una captura del PDF (T3C).
 */
export async function subirComprobanteVarias(token: string | null, claseIds: string[], dataUrl: string): Promise<Resultado<{ clases: number; total: number }>> {
  if (!comprobanteValido(dataUrl)) return { ok: false, error: "La imagen es muy pesada o no es una foto. Probá con una captura de pantalla." };
  const ids = [...new Set((Array.isArray(claseIds) ? claseIds : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))];
  if (!ids.length || ids.length > 30) return { ok: false, error: "Elegí qué clases pagás." };
  const tenantIdFreno = await getCurrentTenantId();
  if (await frenadoPorIp("comprobante", tenantIdFreno)) return { ok: false, error: FRENADO };
  const d = await alumnoDelLink(token);
  if (!d) return { ok: false, error: LINK_INVALIDO };
  const { tenantId, alumno } = d;
  return conErrorNegocio(async () => {
    const r = await tenantTransaction(async (tx) => {
      const clases = await tx.padelClase.findMany({
        where: { tenantId, alumnoId: alumno.id, id: { in: ids } },
        select: { id: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true, motivoCancel: true, empiezaEn: true },
      });
      if (clases.length !== ids.length) throw new ErrorNegocio(ids.length === 1 ? "No encontramos esa clase." : "No encontramos alguna de esas clases.");
      const mal = clases.find((c) => !puedeSubirComprobante({ ...c, precio: Number(c.precio) }));
      if (mal) {
        const pagada = mal.pagoEstado === "PAGADO";
        throw new ErrorNegocio(ids.length === 1 ? (pagada ? "Esa clase ya está pagada." : "Esa clase no se puede pagar.") : pagada ? "Alguna de esas clases ya está pagada." : "Alguna de esas clases todavía no se puede pagar.");
      }
      const n = await tx.padelClase.updateMany({
        where: { tenantId, alumnoId: alumno.id, id: { in: ids }, pagoEstado: { in: ["PENDIENTE", "EN_REVISION"] } },
        data: { pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA", comprobante: dataUrl, comprobanteEnviadoEl: new Date(), pagoNota: null },
      });
      if (n.count !== ids.length) throw new ErrorNegocio("Alguna clase cambió recién. Actualizá la pantalla.");
      return { clases, total: clases.reduce((s, c) => s + Number(c.precio), 0) };
    }, { tenantId });
    const primera = [...r.clases].sort((a, b) => +a.empiezaEn - +b.empiezaEn)[0];
    const texto =
      r.clases.length === 1
        ? `${alumno.client.name} mandó el comprobante de la clase del ${diaHumano(primera.empiezaEn)}.`
        : `${alumno.client.name} mandó un comprobante por ${r.clases.length} clases (${pesos(r.total)}).`;
    await avisarAlProfe(tenantId, "comprobante", texto, primera.id, alumno.id);
    await auditPublic({ action: "padel.comprobante", entity: "PadelClase", entityId: primera.id, clientPhone: alumno.client.phone, changes: { clases: r.clases.length } });
    refrescar(alumno.token);
    return { ok: true as const, clases: r.clases.length, total: r.total };
  });
}

/** El alumno cancela desde su link (sólo con la anticipación que fijó el profe). */
export async function cancelarDesdeLink(token: string | null, claseId: string): Promise<Resultado> {
  // El mismo freno por IP que el resto de las acciones del link (O-11 de la CERT T2+T3).
  const tenantIdFreno = await getCurrentTenantId();
  if (await frenadoPorIp("link", tenantIdFreno)) return { ok: false, error: FRENADO };
  const d = await alumnoDelLink(token);
  if (!d) return { ok: false, error: LINK_INVALIDO };
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
  refrescar(alumno.token);
  return { ok: true };
}

/**
 * «Cambiar horario» desde el link (F2 alumno, M-032 del lado del alumno). Sólo a una hora libre de
 * la grilla del profe (con su anticipación) y dentro del plazo para cancelar gratis.
 *  · Un alumno conocido (ya tomó clases) con su clase CONFIRMADA, o cualquier PEDIDA: se mueve la
 *    misma clase, en una transacción (conserva estado, pago y precio) y el profe recibe un aviso.
 *  · Un alumno nuevo con su clase CONFIRMADA: la vieja se CONSERVA hasta que el profe confirme. Se
 *    pide la nueva (PEDIDA, `repiteDe` = la vieja, aviso «cambio-pedido»): cuando el profe la
 *    confirma, la vieja se cancela sola y su pago pasa a la nueva (confirmarCambio, en acciones.ts).
 * Si la hora ya no está, vuelve con las más cercanas (`alternativas`).
 */
export async function cambiarHorarioDesdeLink(
  token: string | null,
  claseId: string,
  nuevaHoraIso: string,
): Promise<Resultado<{ estado: string; cuando: string; esperaAlProfe: boolean }> & { alternativas?: string[] }> {
  const tenantIdFreno = await getCurrentTenantId();
  if (await frenadoPorIp("link", tenantIdFreno)) return { ok: false, error: FRENADO };
  const d = await alumnoDelLink(token);
  if (!d) return { ok: false, error: LINK_INVALIDO };
  const { tenantId, alumno } = d;
  const nueva = new Date(nuevaHoraIso);
  if (Number.isNaN(nueva.getTime())) return { ok: false, error: "Elegí un horario." };
  const [clase, config, negocio] = await Promise.all([
    prisma.padelClase.findFirst({
      where: { tenantId, id: claseId, alumnoId: alumno.id },
      select: { id: true, estado: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, precio: true, clientId: true },
    }),
    configPadel(tenantId),
    datosDelNegocio(tenantId),
  ]);
  if (!clase) return { ok: false, error: "No encontramos esa clase." };
  if (!ACTIVAS.includes(clase.estado)) return { ok: false, error: "Esa clase ya no se puede cambiar." };
  const ahora = new Date();
  if (!puedeCancelarAlumno(clase.estado, clase.empiezaEn, ahora, config.anticipacionMin)) {
    return { ok: false, error: `Ya pasó el límite para cambiarla desde acá. Escribile a ${negocio.profe} o avisale que no vas.` };
  }
  if (nueva.getTime() === clase.empiezaEn.getTime()) return { ok: false, error: "Tu clase ya es a esa hora." };
  const duracionMs = clase.terminaEn.getTime() - clase.empiezaEn.getTime();
  const duracionMin = Math.round(duracionMs / 60_000);
  const { libres } = await libresDelDia(tenantId, dateStrInBusinessTz(nueva), ahora, clase.id, { duracionMin });
  if (!libres.includes(nueva.toISOString())) {
    return { ok: false, error: "Ese horario ya no está libre.", alternativas: await libresCercanos(tenantId, nueva, { excluir: clase.id, duracionMin }) };
  }
  const terminaEn = new Date(nueva.getTime() + duracionMs);
  const antes = `${diaHumano(clase.empiezaEn)} ${horaHumana(clase.empiezaEn)}`;
  const despues = `${diaHumano(nueva)} ${horaHumana(nueva)}`;
  const cuando = `${diaHumano(nueva)} a las ${horaHumana(nueva)}`;
  const mueveLaMisma = clase.estado === "PEDIDA" || repetidaNaceConfirmada(alumno._count.clases);
  return conErrorNegocio(async () => {
    if (mueveLaMisma) {
      await bookingTransaction(async (tx) => {
        if (await choqueEn(tx, tenantId, nueva, terminaEn, clase.id)) throw new ErrorNegocio("Ese horario se acaba de ocupar. Elegí otro.");
        const n = await tx.padelClase.updateMany({
          where: { tenantId, id: clase.id, alumnoId: alumno.id, estado: clase.estado, empiezaEn: clase.empiezaEn },
          data: { empiezaEn: nueva, terminaEn },
        });
        if (n.count === 0) throw new ErrorNegocio("Esa clase ya cambió. Actualizá la pantalla.");
      });
      const queCambio = clase.estado === "PEDIDA" ? "cambió su pedido" : "pasó su clase";
      await avisarAlProfe(tenantId, "cambio", `${alumno.client.name} ${queCambio} del ${antes} al ${despues} desde su link.`, clase.id, alumno.id);
      await auditPublic({ action: "padel.cambiarHorario", entity: "PadelClase", entityId: clase.id, clientPhone: alumno.client.phone, changes: { de: clase.empiezaEn.toISOString(), a: nueva.toISOString() } });
      refrescar(alumno.token);
      return { ok: true as const, estado: clase.estado, cuando, esperaAlProfe: clase.estado === "PEDIDA" };
    }
    // Alumno nuevo con la clase confirmada: se pide la nueva y la vieja queda hasta que el profe diga.
    const nuevaClase = await bookingTransaction(async (tx) => {
      if (await choqueEn(tx, tenantId, nueva, terminaEn, clase.id)) throw new ErrorNegocio("Ese horario se acaba de ocupar. Elegí otro.");
      const pendientes = await tx.padelClase.count({ where: { tenantId, alumnoId: alumno.id, estado: "PEDIDA", empiezaEn: { gt: new Date() } } });
      if (!puedePedir(pendientes, config.maxPendientesPorTel)) throw new ErrorNegocio("Ya tenés clases esperando que el profe confirme.");
      return tx.padelClase.create({
        data: {
          tenantId, alumnoId: alumno.id, clientId: clase.clientId, empiezaEn: nueva, terminaEn, tipo: clase.tipo, personas: clase.personas,
          estado: "PEDIDA", origen: "ALUMNO_LINK", repiteDe: clase.id, precio: clase.precio,
        },
        select: { id: true },
      });
    });
    await avisarAlProfe(
      tenantId,
      "cambio-pedido",
      `${alumno.client.name} quiere pasar la clase del ${antes} al ${despues}. Si le confirmás la nueva, la del ${antes} se cancela sola (y si estaba pagada, el pago pasa a la nueva).`,
      nuevaClase.id,
      alumno.id,
    );
    await auditPublic({ action: "padel.pedirCambio", entity: "PadelClase", entityId: nuevaClase.id, clientPhone: alumno.client.phone, changes: { repiteDe: clase.id } });
    refrescar(alumno.token);
    return { ok: true as const, estado: "PEDIDA", cuando, esperaAlProfe: true };
  });
}

/**
 * «Avisar que no voy» (A·E13): pasado el plazo para cancelar gratis, el alumno igual le avisa al profe
 * (entra a la bandeja aunque el profe no tenga WhatsApp). La clase no cambia: el profe decide si es
 * «No vino · se cobra» o la cancela. Dentro del plazo, se le dice que la cancele (queda libre).
 * TODO(T4): con la regla «tardía se cobra» (`PadelConfig.tardiaSeCobra`, default no) se marcará
 * `seCobra`; hoy, sin la regla, no se marca nada (MOTIVO_TARDIA_SE_COBRA queda reservado).
 */
export async function avisarNoVoy(token: string | null, claseId: string): Promise<Resultado<{ yaAvisado: boolean }>> {
  const tenantIdFreno = await getCurrentTenantId();
  if (await frenadoPorIp("link", tenantIdFreno)) return { ok: false, error: FRENADO };
  const d = await alumnoDelLink(token);
  if (!d) return { ok: false, error: LINK_INVALIDO };
  const { tenantId, alumno } = d;
  const [clase, config] = await Promise.all([
    prisma.padelClase.findFirst({ where: { tenantId, id: claseId, alumnoId: alumno.id }, select: { id: true, estado: true, empiezaEn: true, terminaEn: true } }),
    configPadel(tenantId),
  ]);
  if (!clase) return { ok: false, error: "No encontramos esa clase." };
  const ahora = new Date();
  if (!ACTIVAS.includes(clase.estado) || clase.terminaEn.getTime() <= ahora.getTime()) return { ok: false, error: "Esa clase ya no está activa." };
  if (puedeCancelarAlumno(clase.estado, clase.empiezaEn, ahora, config.anticipacionMin)) {
    return { ok: false, error: "Todavía estás a tiempo de cancelarla gratis: tocá «Cancelar» y el horario queda libre." };
  }
  const ya = await prisma.padelAviso.findFirst({ where: { tenantId, destino: "PROFE", tipo: "no-voy", claseId: clase.id }, select: { id: true } });
  if (ya) return { ok: true, yaAvisado: true };
  await avisarAlProfe(tenantId, "no-voy", `${alumno.client.name} avisó que no va a la clase del ${diaHumano(clase.empiezaEn)} a las ${horaHumana(clase.empiezaEn)} (fuera de término). Decidí si la cobrás («No vino») o la cancelás.`, clase.id, alumno.id);
  await auditPublic({ action: "padel.avisarNoVoy", entity: "PadelClase", entityId: clase.id, clientPhone: alumno.client.phone });
  refrescar(alumno.token);
  return { ok: true, yaAvisado: false };
}
