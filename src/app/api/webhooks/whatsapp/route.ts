// Webhook de WhatsApp Business (Cloud API de Meta) del profe de pádel.
//
// GET  = verificación de Meta (hub.challenge). Sin WHATSAPP_VERIFY_TOKEN → 503; token que no
//        coincide → 403. Ver responderDesafio (src/lib/padel/whatsapp-cloud.ts).
// POST = mensajes entrantes. APAGADO salvo PADEL_WHATSAPP=cloud: hasta entonces acusa recibo
//        sin tocar nada (como el webhook de Mercado Pago con la facturación apagada). Prendido:
//        firma X-Hub-Signature-256 con WHATSAPP_APP_SECRET (sin secreto 503, firma mala 401),
//        deduplicación por wamid, y la respuesta corta del alumno ("sí" / "cancelar") se aplica a
//        su próxima clase. Todo lo demás queda en la bandeja del profe para leer.
//
// El negocio sale del dominio de la URL que se carga en Meta (https://<negocio>/api/webhooks/
// whatsapp), igual que el resto de la app. Meta reintenta si no recibe 200: por eso los errores
// de negocio contestan 200 y quedan en el log.
//
// Paso a paso para conectarlo: docs/tenants/matiasconsoli/whatsapp-business-paso-a-paso.md

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { parseInboundMeta } from "@/lib/wa-provider";
import { diaHumano, horaHumana, puedeCancelarAlumno, telefonoAlumno } from "@/lib/padel/core";
import { configPadel } from "@/lib/padel/datos.server";
import { firmaValida, interpretarRespuesta, modoWhatsApp, responderDesafio } from "@/lib/padel/whatsapp-cloud";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const r = responderDesafio(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
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
  const msg = parseInboundMeta(payload, { receivedAt: Date.now() });
  if (!msg) return Response.json({ ok: true, ignorado: "no es un mensaje de texto" });

  try {
    const tenantId = await getCurrentTenantId();
    const ya = await prisma.padelAviso.findFirst({ where: { tenantId, idExterno: msg.messageId }, select: { id: true } });
    if (ya) return Response.json({ ok: true, duplicado: true });

    const telefono = telefonoAlumno(msg.from);
    const alumno = telefono
      ? await prisma.padelAlumno.findFirst({ where: { tenantId, client: { phone: telefono } }, select: { id: true, client: { select: { name: true } } } })
      : null;
    const quien = alumno?.client.name ?? msg.contactName ?? `+${msg.from}`;
    const intencion = alumno ? interpretarRespuesta(msg.text) : null;
    let texto = `${quien} escribió: "${msg.text.slice(0, 300)}"`;
    let claseId: string | null = null;

    if (alumno && intencion) {
      const ahora = new Date();
      const proxima = await prisma.padelClase.findFirst({
        where: { tenantId, alumnoId: alumno.id, estado: { in: ["PEDIDA", "CONFIRMADA"] }, empiezaEn: { gt: ahora } },
        orderBy: { empiezaEn: "asc" },
        select: { id: true, estado: true, empiezaEn: true },
      });
      if (proxima) {
        claseId = proxima.id;
        const cuando = `${diaHumano(proxima.empiezaEn)} ${horaHumana(proxima.empiezaEn)}`;
        if (intencion === "confirmar") {
          texto = `${quien} confirmó por WhatsApp que va a la clase del ${cuando}.`;
        } else {
          const { anticipacionMin } = await configPadel(tenantId);
          if (puedeCancelarAlumno(proxima.estado, proxima.empiezaEn, ahora, anticipacionMin)) {
            await prisma.padelClase.updateMany({ where: { tenantId, id: proxima.id }, data: { estado: "CANCELADA", canceladaEl: ahora, motivoCancel: "La canceló el alumno por WhatsApp" } });
            texto = `${quien} canceló por WhatsApp la clase del ${cuando}. Ese horario quedó libre.`;
          } else {
            texto = `${quien} quiere cancelar la clase del ${cuando}, pero ya está fuera de término. Escribile.`;
          }
        }
      }
    }

    await prisma.padelAviso.create({
      data: { tenantId, destino: "PROFE", tipo: intencion === "cancelar" ? "cancelacion" : "respuesta", texto, claseId, alumnoId: alumno?.id ?? null, canal: "WA_CLOUD", idExterno: msg.messageId },
    });
    return Response.json({ ok: true });
  } catch (e) {
    logger.error("padel.whatsapp", "no se pudo procesar el mensaje entrante", e, { messageId: msg.messageId });
    return Response.json({ ok: true, error: "procesamiento" });
  }
}
