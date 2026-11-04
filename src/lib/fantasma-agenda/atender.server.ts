// Fantasma Agenda · atender UN mensaje entrante de WhatsApp en UN negocio.
//
// Orden (cada paso con `tenantId` explícito y dentro de `runInTenantContext`):
//   1. Interruptor «fantasma-agenda» del negocio: apagado → nada (ni fila, ni respuesta).
//   2. Conversación por {tenantId, telefono} (`ConversacionWhatsapp`, estado "agenda:<flow>").
//   3. Idempotencia: el mensaje entrante se guarda con su wamid (único por negocio). Si ya estaba,
//      Meta reintentó: no se vuelve a atender (un solo turno, una sola respuesta).
//   3b. Turno de atención: la conversación se toma con un `updateMany` condicional sobre `estado`
//      (pasa a "agenda:atendiendo"). Dos mensajes distintos que llegan juntos ("sí" y "si") no se
//      atienden los dos con el mismo estado: el que obtiene 0 filas no responde. Si un proceso murió
//      con la conversación tomada, a los `TOMA_VENCIDA_MS` se puede volver a tomar (compare-and-swap
//      sobre `updatedAt`).
//   4. `decidirAtencion` (uso.ts): tope de charlas del mes y charla larga, con aviso una sola vez.
//   5. Charla nueva → AuditLog `FantasmaCharla` (es lo que cuenta el tope del mes).
//   6. `dispatch` con los puertos del negocio; el estado vuelve a la conversación (vence en 24 h).
//   7. La respuesta sale por la Cloud API si hay credenciales; si no, queda registrada
//      con estadoEntrega "sin-credenciales". Siempre se guarda como mensaje saliente.
//
// Sin migraciones: usa tablas que ya existen (ConversacionWhatsapp, MensajeWhatsapp, AuditLog).

import "server-only";
import { prisma } from "@/lib/prisma";
import { runInTenantContext } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import { normalizePhone } from "@/lib/wa-provider";
import { dispatch, INITIAL_STATE, type WaFlow, type WaSessionState } from "@/lib/wa-dispatch";
import { estadoDesdeFilas, fantasmaAgendaPrendida, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import { notificadorCloud } from "@/lib/padel/notificador";
import { credencialesCloud } from "@/lib/padel/whatsapp-cloud";
import { decidirAtencion, topeCharlasMes, VENTANA_CHARLA_MS, type MotivoSinAtender } from "./uso";
import { puertosDelNegocio } from "./puertos.server";

export const ENTIDAD_CHARLA = "FantasmaCharla";
const PREFIJO_ESTADO = "agenda:";
const ESTADO_ATENDIENDO = `${PREFIJO_ESTADO}atendiendo`;
/** Una toma más vieja que esto es de un proceso que murió: se puede volver a tomar. */
const TOMA_VENCIDA_MS = 60_000;

export type MensajeEntrante = {
  tenantId: string;
  from: string;
  text: string;
  wamid: string;
  contactName?: string;
  now: Date;
};

export type ResultadoAtencion =
  | { atendido: false; motivo: MotivoSinAtender | "duplicado" | "ocupado"; respuesta: string | null }
  | { atendido: true; respuesta: string; handoff: boolean };

/** Lo que guarda la conversación en `contexto` (el estado del dispatcher + el uso de la charla). */
type Contexto = WaSessionState & { mensajes: number; ultimo: string | null; avisado: MotivoSinAtender | null };

const FLOWS: readonly WaFlow[] = ["idle", "booking", "confirm_booking"];

function leerContexto(estado: string, crudo: unknown): Contexto {
  const vacio: Contexto = { ...INITIAL_STATE, mensajes: 0, ultimo: null, avisado: null };
  // Una conversación que no es de la agenda (otro bot del mismo número) arranca de cero.
  if (!estado.startsWith(PREFIJO_ESTADO) || !crudo || typeof crudo !== "object") return vacio;
  const c = crudo as Partial<Contexto>;
  return {
    flow: FLOWS.includes(c.flow as WaFlow) ? (c.flow as WaFlow) : "idle",
    draft: c.draft && typeof c.draft === "object" ? c.draft : {},
    mensajes: typeof c.mensajes === "number" ? c.mensajes : 0,
    ultimo: typeof c.ultimo === "string" ? c.ultimo : null,
    avisado: c.avisado === "tope" || c.avisado === "charla-larga" ? c.avisado : null,
  };
}

function esDuplicado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** ¿Fantasma Agenda está prendido en ESTE negocio? Misma lectura que el panel, sin request. */
async function prendidoEn(tenantId: string): Promise<boolean> {
  try {
    const filas = await prisma.auditLog.findMany({
      where: filtroDeFilasValidas(tenantId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["entity", "entityId"],
      select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
    });
    return fantasmaAgendaPrendida(estadoDesdeFilas(filas));
  } catch (err) {
    logger.warn("fantasma.agenda", "no se pudo leer el interruptor; queda apagado", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function inicioDelMes(now: Date): Date {
  return businessWallTimeToUtc(`${dateStrInBusinessTz(now).slice(0, 7)}-01`, "00:00");
}

async function enviarYGuardar(p: {
  tenantId: string;
  conversacionId: string;
  telefono: string;
  texto: string;
  wamidEntrada: string;
}): Promise<void> {
  const cred = credencialesCloud(process.env);
  let wamid = `fantasma:${p.wamidEntrada}`;
  let estadoEntrega = "sin-credenciales";
  if (cred) {
    const r = await notificadorCloud(cred).enviar({ telefono: p.telefono, texto: p.texto });
    estadoEntrega = r.enviado ? "sent" : "failed";
    if (r.idExterno) wamid = r.idExterno;
  }
  await prisma.mensajeWhatsapp.create({
    data: {
      tenantId: p.tenantId,
      conversacionId: p.conversacionId,
      wamid,
      direccion: "salida",
      tipo: "text",
      telefono: p.telefono,
      texto: p.texto,
      estadoEntrega,
    },
  });
}

export function atenderMensaje(m: MensajeEntrante): Promise<ResultadoAtencion> {
  const { tenantId } = m;
  return runInTenantContext(tenantId, async (): Promise<ResultadoAtencion> => {
    if (!(await prendidoEn(tenantId))) return { atendido: false, motivo: "apagado", respuesta: null };

    const telefono = normalizePhone(m.from);
    const conv = await prisma.conversacionWhatsapp.upsert({
      where: { tenantId_telefono: { tenantId, telefono } },
      create: { tenantId, telefono, estado: `${PREFIJO_ESTADO}idle`, contexto: { ...INITIAL_STATE, mensajes: 0, ultimo: null, avisado: null } },
      update: {},
      select: { id: true, estado: true, contexto: true, updatedAt: true },
    });

    // Idempotencia: la fila del mensaje entrante es la llave (único {tenantId, wamid}).
    try {
      await prisma.mensajeWhatsapp.create({
        data: { tenantId, conversacionId: conv.id, wamid: m.wamid, direccion: "entrada", tipo: "text", telefono, texto: m.text.slice(0, 4000) },
      });
    } catch (e) {
      if (esDuplicado(e)) return { atendido: false, motivo: "duplicado", respuesta: null };
      throw e;
    }

    // Turno de atención: sólo uno de los mensajes que leyeron este mismo estado lo atiende.
    const tomada = conv.estado === ESTADO_ATENDIENDO;
    if (tomada && m.now.getTime() - conv.updatedAt.getTime() < TOMA_VENCIDA_MS) {
      return { atendido: false, motivo: "ocupado", respuesta: null };
    }
    const toma = await prisma.conversacionWhatsapp.updateMany({
      where: { tenantId, id: conv.id, estado: conv.estado, ...(tomada ? { updatedAt: conv.updatedAt } : {}) },
      data: { estado: ESTADO_ATENDIENDO },
    });
    if (toma.count === 0) return { atendido: false, motivo: "ocupado", respuesta: null };
    // Estado al que se vuelve si no se atiende (el contexto conserva el flow del dispatcher).
    const estadoPrevio = tomada ? `${PREFIJO_ESTADO}idle` : conv.estado;
    try {
      return await atenderTomada(m, telefono, conv, estadoPrevio);
    } catch (e) {
      await prisma.conversacionWhatsapp
        .updateMany({ where: { tenantId, id: conv.id, estado: ESTADO_ATENDIENDO }, data: { estado: estadoPrevio } })
        .catch(() => undefined);
      throw e;
    }
  });
}

async function atenderTomada(
  m: MensajeEntrante,
  telefono: string,
  conv: { id: string; estado: string; contexto: unknown },
  estadoPrevio: string,
): Promise<ResultadoAtencion> {
  const { tenantId } = m;
  const ctx = leerContexto(conv.estado, conv.contexto);
  const charlasDelMes = await prisma.auditLog.count({
    where: { tenantId, entity: ENTIDAD_CHARLA, createdAt: { gte: inicioDelMes(m.now) } },
  });
  const decision = decidirAtencion({
    prendido: true,
    charlasDelMes,
    mensajesEnCharla: ctx.mensajes,
    ultimoMensaje: ctx.ultimo ? new Date(ctx.ultimo) : null,
    ahora: m.now,
    yaAvisado: ctx.avisado,
    tope: topeCharlasMes(),
  });
  const vence = new Date(m.now.getTime() + VENTANA_CHARLA_MS);

  if (!decision.atender) {
    await prisma.conversacionWhatsapp.update({
      where: { tenantId_telefono: { tenantId, telefono } },
      data: { estado: estadoPrevio, contexto: { ...ctx, ultimo: m.now.toISOString(), avisado: decision.motivo === "apagado" ? null : decision.motivo }, vence },
    });
    if (decision.aviso) {
      await enviarYGuardar({ tenantId, conversacionId: conv.id, telefono, texto: decision.aviso, wamidEntrada: m.wamid });
    }
    return { atendido: false, motivo: decision.motivo, respuesta: decision.aviso ?? null };
  }

  let estado: Contexto = ctx;
  if (decision.charlaNueva) {
    estado = { ...INITIAL_STATE, mensajes: 0, ultimo: null, avisado: null };
    await prisma.auditLog.create({
      data: { tenantId, actor: `cliente:${telefono}`, action: "charla.inicio", entity: ENTIDAD_CHARLA, entityId: conv.id, channel: "whatsapp" },
    });
  }

  const reply = await dispatch(m.text, { flow: estado.flow, draft: estado.draft }, {
    now: m.now,
    from: telefono,
    ports: puertosDelNegocio(tenantId, { contactName: m.contactName }),
  });

  await prisma.conversacionWhatsapp.update({
    where: { tenantId_telefono: { tenantId, telefono } },
    data: {
      estado: `${PREFIJO_ESTADO}${reply.state.flow}`,
      contexto: { ...reply.state, mensajes: estado.mensajes + 1, ultimo: m.now.toISOString(), avisado: null },
      vence,
    },
  });
  await enviarYGuardar({ tenantId, conversacionId: conv.id, telefono, texto: reply.text, wamidEntrada: m.wamid });
  if (reply.handoff) logger.info("fantasma.agenda", "el bot derivó la charla al local", { tenantId, conversacionId: conv.id });
  return { atendido: true, respuesta: reply.text, handoff: reply.handoff };
}
