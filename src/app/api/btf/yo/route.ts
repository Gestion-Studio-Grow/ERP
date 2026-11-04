// GET /api/btf/yo → Fotografo · PATCH → cambios parciales (nombre, usuario, bio, instagram, whatsapp, cobro, marca).
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { ErrorBtf, json, leerCuerpo, manejar, texto } from "@/lib/btf/http";
import { aSlug } from "@/lib/btf/ids";
import { fotografoRed } from "@/lib/btf/mapeo";
import { exigirFotografo } from "@/lib/btf/sesion";
import { cobro, marca } from "@/lib/btf/validar";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function yo(id: string) {
  const f = await btfDb.btfFotografo.findUnique({ where: { id } });
  if (!f) throw new ErrorBtf("no-autenticado", "Tu sesión ya no es válida. Ingresá de nuevo.");
  return f;
}

export function GET(request: Request) {
  return manejar(async () => {
    exigirServidor();
    return json(fotografoRed(await yo(exigirFotografo(request))));
  });
}

export function PATCH(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const id = exigirFotografo(request);
    await yo(id);
    const c = await leerCuerpo(request);
    const data: Prisma.BtfFotografoUpdateInput = {};
    if ("nombre" in c) data.nombre = texto(c.nombre, "el nombre", { max: 120 });
    if ("bio" in c) data.bio = texto(c.bio, "la bio", { max: 1000, vacio: true });
    if ("instagram" in c) data.instagram = texto(c.instagram, "el Instagram", { max: 60, vacio: true });
    if ("whatsapp" in c) data.whatsapp = texto(c.whatsapp, "el WhatsApp", { max: 30, vacio: true });
    if ("cobro" in c) {
      const v = cobro(c.cobro);
      data.cobro = v === null ? Prisma.DbNull : (v as unknown as Prisma.InputJsonValue);
    }
    if ("marca" in c) data.marca = marca(c.marca) as unknown as Prisma.InputJsonValue;
    if ("usuario" in c) {
      const u = aSlug(typeof c.usuario === "string" ? c.usuario : "");
      if (!u) throw new ErrorBtf("invalido", "El usuario no puede quedar vacío.");
      const otro = await btfDb.btfFotografo.findUnique({ where: { usuario: u }, select: { id: true } });
      if (otro && otro.id !== id) throw new ErrorBtf("duplicado", "Ese usuario ya está tomado.");
      data.usuario = u;
    }
    return json(fotografoRed(await btfDb.btfFotografo.update({ where: { id }, data })));
  });
}
