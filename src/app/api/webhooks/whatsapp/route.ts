// Webhook de WhatsApp Business (Cloud API de Meta) del profe de pádel.
//
// GET  = verificación de Meta (hub.challenge). Sin WHATSAPP_VERIFY_TOKEN → 503; token que no
//        coincide → 403. Ver responderDesafio (src/lib/padel/whatsapp-cloud.ts).
// POST = mensajes entrantes. APAGADO salvo PADEL_WHATSAPP=cloud: hasta entonces acusa recibo
//        sin tocar nada (como el webhook de Mercado Pago con la facturación apagada). Prendido:
//        firma X-Hub-Signature-256 con WHATSAPP_APP_SECRET (sin secreto 503, firma mala 401),
//        deduplicación por wamid, y la respuesta del alumno según interpretarRespuesta:
//          · «CANCELAR» exacto (o el botón rápido CANCELAR) → cancela su próxima clase si está a
//            tiempo y le contesta «Listo, cancelada…»; fuera de término le contesta y avisa al profe.
//          · «no», «no puedo…», «no voy…» → NO toca la clase: le pregunta «¿Cancelás…? Respondé
//            CANCELAR» y deja el mensaje en la bandeja.
//          · un sí exacto → queda anotado en la bandeja. Todo lo demás, también: no se adivina.
//        Cada respuesta que sale al alumno queda registrada como PadelAviso destino ALUMNO.
//
// El negocio sale de la CONEXIÓN, no del host. Tanda P1 (P1-C5): el `phone_number_id` del cuerpo
// (firmado por Meta con el secreto de la app) → la IntegracionConexion "whatsapp" de esa cuenta
// (src/integraciones/conexiones.server.ts, tope 20 conexiones; más → sin negocio y alerta). Si el
// número no tiene conexión, lo de S1: se mapea a un slug con `WHATSAPP_PHONE_NUMBERS` (JSON
// `{ "<phone_number_id>": "<slug>" }`, docs/runbooks/webhooks-por-negocio.md). Sin mapeo → 200 sin
// efecto y aviso en el log. El trabajo corre en `runInTenantContext(negocio)`. Antes de todo, rate
// limit por IP. Meta reintenta si no recibe 200: por eso los errores de negocio contestan 200 y
// quedan en el log.
//
// Paso a paso para conectarlo: docs/tenants/matiasconsoli/whatsapp-business-paso-a-paso.md

import { prisma } from "@/lib/prisma";
import { basePrisma } from "@/lib/prisma-base";
import { runInTenantContext } from "@/lib/tenant-context";
import { limitarWebhook, respuestaDemasiados, negocioDelMensajeWA, phoneNumberIdDe } from "@/lib/webhooks/resolver-negocio";
import { conexionPorCuenta } from "@/integraciones/conexiones.server";
import { logger } from "@/lib/logger";
import { parseInboundMeta } from "@/lib/wa-provider";
import { diaHumano, horaHumana, pagoAlCancelar, puedeCancelarAlumno, telefonoAlumno } from "@/lib/padel/core";
import { configPadel, datosDelNegocio } from "@/lib/padel/datos.server";
import { notificadorActual } from "@/lib/padel/notificador";
import { botonRespuestaMeta, firmaValida, interpretarRespuesta, modoWhatsApp, respuestaAlAlumno, responderDesafio } from "@/lib/padel/whatsapp-cloud";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const r = responderDesafio(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** https://<negocio> del pedido (el mismo dominio que se cargó en Meta), para el link al turnero. */
function origenDe(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  const espera = limitarWebhook("whatsapp", request);
  if (espera != null) return respuestaDemasiados(espera);
  if (modoWhatsApp(process.env) !== "cloud") return Response.json({ ok: true, skipped: "whatsapp-apagado" });

  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return Response.json({ ok: false, error: "webhook sin configurar" }, { status: 503 });
  const crudo = await request.text();
  if (!firmaValida(crudo, request.headers.get("x-hub-signature-256"), secreto)) {
    return Response.json({ ok: false, error: "firma inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(crudo);
  } catch {
    return Response.json({ ok: true, ignorado: "cuerpo ilegible" });
  }
  const texto = parseInboundMeta(payload, { receivedAt: Date.now() });
  const boton = texto ? null : botonRespuestaMeta(payload);
  const msg = texto ? { from: texto.from, text: texto.text, messageId: texto.messageId, contactName: texto.contactName, payload: null } : boton;
  if (!msg) return Response.json({ ok: true, ignorado: "no es un mensaje de texto ni un botón" });

  // El negocio, por el número de WhatsApp Business que recibió el mensaje.
  // Sin WHATSAPP_PHONE_NUMBERS y con UN solo negocio en la base → ese negocio (con aviso al monitor).
  const SELECT_NEGOCIO_WA = { id: true, slug: true } as const;
  const r = await negocioDelMensajeWA(payload, process.env, {
    porSlug: (s) => basePrisma.tenant.findUnique({ where: { slug: s }, select: SELECT_NEGOCIO_WA }),
    primerosDos: () => basePrisma.tenant.findMany({ take: 2, orderBy: { createdAt: "asc" }, select: SELECT_NEGOCIO_WA }),
    porConexion: async (phoneNumberId) => {
      const c = await conexionPorCuenta("whatsapp", phoneNumberId);
      if (c === "demasiadas" || !c) return c;
      return basePrisma.tenant.findUnique({ where: { id: c.tenantId }, select: SELECT_NEGOCIO_WA });
    },
  }).catch((): { ok: false; slug: null; motivo?: "demasiadas-conexiones" } => ({ ok: false, slug: null }));
  if (!r.ok && r.motivo === "demasiadas-conexiones") {
    logger.error("monitor", "WhatsApp: más conexiones que el tope para resolver el número: no se procesa", undefined, {
      aviso: "wa-demasiadas-conexiones",
      messageId: msg.messageId,
    });
    return Response.json({ ok: true, ignorado: "sin-resolver" });
  }
  if (!r.ok) {
    logger.warn("padel.whatsapp", "mensaje entrante de un número sin negocio: no se procesa", {
      aviso: "wa-numero-sin-negocio",
      phoneNumberId: phoneNumberIdDe(payload),
      slug: r.slug,
      messageId: msg.messageId,
    });
    return Response.json({ ok: true, ignorado: "numero-sin-negocio" });
  }
  if (r.via === "negocio-unico") {
    logger.warn("monitor", "WhatsApp sin WHATSAPP_PHONE_NUMBERS: mensaje asignado al único negocio de la base", {
      aviso: "wa-sin-mapa-negocio-unico",
      phoneNumberId: phoneNumberIdDe(payload),
      negocio: r.negocio.slug,
    });
  }
  const tenantId = r.negocio.id;

  try {
    return await runInTenantContext(tenantId, async () => await atenderMensaje(request, tenantId, msg));
  } catch (e) {
    logger.error("padel.whatsapp", "no se pudo procesar el mensaje entrante", e, { messageId: msg.messageId });
    return Response.json({ ok: true, error: "procesamiento" });
  }
}

type MensajeEntrante = { from: string; text: string; messageId: string; contactName?: string | null; payload: string | null };

async function atenderMensaje(request: Request, tenantId: string, msg: MensajeEntrante): Promise<Response> {
  {
    const ya = await prisma.padelAviso.findFirst({ where: { tenantId, idExterno: msg.messageId }, select: { id: true } });
    if (ya) return Response.json({ ok: true, duplicado: true });

    const telefono = telefonoAlumno(msg.from);
    const alumno = telefono
      ? await prisma.padelAlumno.findFirst({ where: { tenantId, client: { phone: telefono } }, select: { id: true, client: { select: { name: true, phone: true } } } })
      : null;
    const quien = alumno?.client.name ?? msg.contactName ?? `+${msg.from}`;
    const intencion = alumno ? interpretarRespuesta(msg.text, msg.payload) : null;
    let aviso = `${quien} escribió: "${msg.text.slice(0, 300)}"`;
    let tipo = "respuesta";
    let claseId: string | null = null;
    let contestar: string | null = null;

    if (alumno && intencion) {
      const ahora = new Date();
      const proxima = await prisma.padelClase.findFirst({
        where: { tenantId, alumnoId: alumno.id, estado: { in: ["PEDIDA", "CONFIRMADA"] }, empiezaEn: { gt: ahora } },
        orderBy: { empiezaEn: "asc" },
        select: { id: true, estado: true, empiezaEn: true, pagoEstado: true, pagoMedio: true },
      });
      if (proxima) {
        claseId = proxima.id;
        const cuando = `${diaHumano(proxima.empiezaEn)} ${horaHumana(proxima.empiezaEn)}`;
        if (intencion === "confirmar") {
          aviso = `${quien} confirmó por WhatsApp que va a la clase del ${cuando}.`;
        } else if (intencion === "quiereCancelar") {
          // Un «no» suelto NO cancela: se le pregunta y la clase sigue igual.
          aviso = `${quien} escribió: "${msg.text.slice(0, 300)}". Le preguntamos si cancela la clase del ${cuando} (tiene que responder CANCELAR).`;
          contestar = respuestaAlAlumno({ tipo: "preguntar", cuando });
        } else {
          tipo = "cancelacion";
          const [{ anticipacionMin }, negocio] = await Promise.all([configPadel(tenantId), datosDelNegocio(tenantId)]);
          if (puedeCancelarAlumno(proxima.estado, proxima.empiezaEn, ahora, anticipacionMin)) {
            const n = await prisma.padelClase.updateMany({
              where: { tenantId, id: proxima.id, estado: proxima.estado, pagoEstado: proxima.pagoEstado },
              data: { estado: "CANCELADA", canceladaEl: ahora, motivoCancel: "La canceló el alumno por WhatsApp", ...(pagoAlCancelar(proxima) ?? {}) },
            });
            if (n.count > 0) {
              aviso = `${quien} canceló por WhatsApp la clase del ${cuando}. Ese horario quedó libre.`;
              contestar = respuestaAlAlumno({ tipo: "cancelada", turnero: `${origenDe(request)}/clases` });
            } else {
              aviso = `${quien} pidió cancelar por WhatsApp la clase del ${cuando}, pero la clase cambió mientras tanto. Fijate y escribile.`;
            }
          } else {
            aviso = `${quien} quiere cancelar la clase del ${cuando}, pero ya está fuera de término. Escribile.`;
            contestar = respuestaAlAlumno({ tipo: "fueraDeTermino", profe: negocio.profe });
          }
        }
      }
    }

    await prisma.padelAviso.create({
      data: { tenantId, destino: "PROFE", tipo, texto: aviso, claseId, alumnoId: alumno?.id ?? null, canal: "WA_CLOUD", idExterno: msg.messageId },
    });

    // La respuesta al alumno va por la ventana de 24 h (acaba de escribir): texto libre, sin plantilla.
    if (alumno && contestar) {
      const r = await notificadorActual().enviar({ telefono: alumno.client.phone, texto: contestar });
      await prisma.padelAviso.create({
        data: {
          tenantId, destino: "ALUMNO", tipo: "respuesta-wa", claseId, alumnoId: alumno.id, texto: contestar, canal: r.canal,
          enviadoEl: r.enviado ? new Date() : null, errorEnvio: r.error ?? null, idExterno: r.idExterno ?? null,
        },
      });
    }
    return Response.json({ ok: true });
  }
}
