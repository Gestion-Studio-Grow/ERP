// El chat de un proyecto, o el del equipo de Diseño con `proyectoId` nulo.

import { prisma } from "@/lib/prisma";
import { accesoChat, personasDelChat } from "@/lib/proyectos/diseno.server";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { ChatCliente } from "./_diseno-chat";

const hora = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

export async function ChatProyecto({ proyectoId, conAdjunto }: { proyectoId: string | null; conAdjunto?: boolean }) {
  const a = await actorActual();
  const acceso = await accesoChat(a, proyectoId);
  if (!acceso.ver) return <p className="text-sm text-muted">Tu rol no ve este chat.</p>;
  const [filas, personas] = await Promise.all([
    prisma.proyectoMensaje.findMany({
      where: { tenantId: a.tenantId, proyectoId, canal: { in: acceso.canales } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, canal: true, autor: true, texto: true, adjuntoNombre: true, adjuntoUrl: true, createdAt: true },
    }),
    personasDelChat(a, proyectoId, "general"),
  ]);
  const mensajes = filas.reverse().map(({ createdAt, ...m }) => ({ ...m, hora: hora.format(createdAt) }));
  const nombres = [...new Set(personas.filter((p) => p.id !== a.personaId).map((p) => p.nombre.split(" ")[0]))];
  return <ChatCliente proyectoId={proyectoId} canales={acceso.canales} mensajes={mensajes} personas={nombres} puedeEscribir={acceso.escribir} conAdjunto={conAdjunto} />;
}
