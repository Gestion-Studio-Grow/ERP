// Las imágenes de Diseño se sirven acá, con permiso: quien pide una tiene que poder ver ese proyecto. Así la página no baja megas embebidos.

import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { leerClaveImagen, partirDataUrl } from "@/lib/proyectos/diseno-core";
import { actorActual, proyectoVisible, puede } from "@/lib/proyectos/gestion.server";

const NO = () => new Response("No encontrada", { status: 404 });

export async function GET(_: Request, { params }: { params: Promise<{ clave: string }> }) {
  await requireApp("gestion-diseno");
  const a = await actorActual();
  const c = leerClaveImagen((await params).clave);
  if (!c || !puede(a, "diseno", "ver")) return NO();
  const fila =
    c.tipo === "archivo"
      ? await prisma.proyectoArchivo.findFirst({ where: { id: c.id, tenantId: a.tenantId }, select: { datos: true, proyectoId: true } })
      : await prisma.proyectoEntregableVersion.findFirst({ where: { id: c.id, tenantId: a.tenantId }, select: { datos: true, entregable: { select: { proyectoId: true } } } }).then((v) => v && { datos: v.datos, proyectoId: v.entregable.proyectoId });
  if (!fila?.datos || !(await proyectoVisible(a, fila.proyectoId))) return NO();
  const imagen = partirDataUrl(fila.datos);
  if (!imagen) return NO();
  return new Response(new Uint8Array(Buffer.from(imagen.base64, "base64")), {
    headers: { "content-type": imagen.tipo, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
}
