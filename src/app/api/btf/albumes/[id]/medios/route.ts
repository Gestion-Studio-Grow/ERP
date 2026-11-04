// GET /api/btf/albumes/:id/medios → Medio[] del dueño (incluye ocultos y no subidos).
// POST → 201 { medio, subir: { original, previa, miniatura } }: PUT prefirmados (10 min, Content-Type fijo).
// El medio nace `subido: false` y no es público hasta POST /medios/:id/confirmar.
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { albumDelDueno } from "@/lib/btf/dueno";
import { ErrorBtf, entero, json, leerCuerpo, manejar, texto } from "@/lib/btf/http";
import { claveMiniatura, claveOriginal, clavePrevia, extensionDe, nuevoId } from "@/lib/btf/ids";
import { medioRed } from "@/lib/btf/mapeo";
import { configS3, urlFirmadaPut } from "@/lib/btf/s3";
import { exigirFotografo } from "@/lib/btf/sesion";
import { dorsales } from "@/lib/btf/validar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIEZ_MIN = 600;
const MAX_PESO = 5 * 1024 ** 3;

type Ctx = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id } = await params;
    await albumDelDueno(id, exigirFotografo(request));
    const medios = await btfDb.btfMedio.findMany({ where: { albumId: id }, orderBy: { creadoEn: "asc" } });
    const cfg = configS3()!;
    return json(medios.map((m) => medioRed(m, cfg.urlPublicaPrevias)));
  });
}

export function POST(request: Request, { params }: Ctx) {
  return manejar(async () => {
    exigirServidor();
    const { id: albumId } = await params;
    const fotografoId = exigirFotografo(request);
    await albumDelDueno(albumId, fotografoId);
    const c = await leerCuerpo(request);
    const tipo = c.tipo === "video" ? "video" : c.tipo === "foto" ? "foto" : null;
    if (!tipo) throw new ErrorBtf("invalido", "El tipo tiene que ser foto o video.");
    const mimeOriginal = texto(c.mimeOriginal, "el tipo de archivo", { max: 40 }).toLowerCase();
    const mimePrevia = texto(c.mimePrevia, "el tipo de la vista previa", { max: 40 }).toLowerCase();
    const extO = extensionDe(mimeOriginal);
    const extP = extensionDe(mimePrevia);
    if (!extO || !mimeOriginal.startsWith(tipo === "foto" ? "image/" : "video/")) throw new ErrorBtf("invalido", "Ese tipo de archivo no se admite.");
    if (!extP || !mimePrevia.startsWith("image/")) throw new ErrorBtf("invalido", "La vista previa tiene que ser una imagen.");
    const duracion = tipo === "video" && typeof c.duracion === "number" && Number.isFinite(c.duracion) && c.duracion >= 0 ? c.duracion : null;

    const id = nuevoId("m");
    const m = await btfDb.btfMedio.create({
      data: {
        id,
        albumId,
        fotografoId,
        tipo,
        nombreArchivo: texto(c.nombreArchivo, "el nombre del archivo", { max: 200 }),
        ancho: entero(c.ancho, "el ancho", { max: 100_000 }),
        alto: entero(c.alto, "el alto", { max: 100_000 }),
        duracion,
        peso: BigInt(entero(c.peso, "el peso", { max: MAX_PESO })),
        dorsales: "dorsales" in c ? dorsales(c.dorsales) : [],
        mimeOriginal,
        mimePrevia,
        claveOriginal: claveOriginal(fotografoId, albumId, id, extO),
        clavePrevia: clavePrevia(albumId, id, extP),
        claveMiniatura: claveMiniatura(albumId, id, extP),
      },
    });
    const cfg = configS3()!;
    return json(
      {
        medio: medioRed(m, cfg.urlPublicaPrevias),
        subir: {
          original: urlFirmadaPut(cfg.bucketOriginales, m.claveOriginal, mimeOriginal, DIEZ_MIN),
          previa: urlFirmadaPut(cfg.bucketPrevias, m.clavePrevia, mimePrevia, DIEZ_MIN),
          miniatura: urlFirmadaPut(cfg.bucketPrevias, m.claveMiniatura, mimePrevia, DIEZ_MIN),
        },
      },
      201,
    );
  });
}
