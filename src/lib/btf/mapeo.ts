// Fila de la base → objeto por red. Acá se decide qué NO viaja: el token de MP, el email y el cobro en lo
// público, los cupones del álbum público y TODO lo del original de un medio.

import type { BtfAlbum, BtfFotografo, BtfMedio } from "@/generated/prisma/client";
import type { Album, AlbumPublico, Colaborador, Cupon, DatosCobro, EscalonDescuento, FotografoPublico, FotografoRed, MarcaAgua, MedioRed, Paquete, PlanId, TipoEvento, TipoMedio } from "./tipos";

export const MARCA_POR_DEFECTO: MarcaAgua = {
  texto: "buscatufoto · vista previa",
  logo: null,
  color: "#ffffff", // design-lint-ignore: valor de dato (marca de agua por defecto de la app), no un estilo
  opacidad: 0.34,
  escala: 1,
  angulo: -28,
  modo: "mosaico",
};

function cobroSinToken(v: unknown): DatosCobro | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  return {
    metodo: c.metodo === "mercadopago" ? "mercadopago" : "transferencia",
    titular: String(c.titular ?? ""),
    alias: String(c.alias ?? ""),
    cuit: String(c.cuit ?? ""),
  };
}

export function fotografoRed(f: BtfFotografo): FotografoRed {
  return {
    id: f.id,
    nombre: f.nombre,
    email: f.email,
    usuario: f.usuario,
    bio: f.bio,
    instagram: f.instagram,
    whatsapp: f.whatsapp,
    plan: (f.plan === "pro" ? "pro" : "libre") as PlanId,
    cobro: cobroSinToken(f.cobro),
    marca: { ...MARCA_POR_DEFECTO, ...((f.marca as Partial<MarcaAgua> | null) ?? {}) },
    creadoEn: f.creadoEn.getTime(),
    mpConfigurado: f.mpCredencial !== null,
  };
}

export function fotografoPublico(f: BtfFotografo): FotografoPublico {
  return { id: f.id, nombre: f.nombre, usuario: f.usuario, bio: f.bio, instagram: f.instagram, creadoEn: f.creadoEn.getTime() };
}

const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function albumRed(a: BtfAlbum): Album {
  return {
    id: a.id,
    slug: a.slug,
    fotografoId: a.fotografoId,
    nombre: a.nombre,
    evento: a.evento as TipoEvento,
    lugar: a.lugar,
    fecha: a.fecha,
    descripcion: a.descripcion,
    precioFoto: a.precioFoto,
    precioVideo: a.precioVideo,
    paquetes: lista<Paquete>(a.paquetes),
    escalones: lista<EscalonDescuento>(a.escalones),
    cupones: lista<Cupon>(a.cupones),
    colaboradores: lista<Colaborador>(a.colaboradores),
    portadaId: a.portadaId,
    publicado: a.publicado,
    creadoEn: a.creadoEn.getTime(),
  };
}

export function albumPublico(a: BtfAlbum): AlbumPublico {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cupones, colaboradores, ...resto } = albumRed(a);
  return { ...resto, colaboradores: colaboradores.map((c) => ({ nombre: c.nombre, rol: c.rol })) };
}

/** `urlPublica` = BTF_PREVIAS_URL_PUBLICA sin barra final. */
export function medioRed(m: BtfMedio, urlPublica: string): MedioRed {
  return {
    id: m.id,
    albumId: m.albumId,
    tipo: m.tipo as TipoMedio,
    nombreArchivo: m.nombreArchivo,
    ancho: m.ancho,
    alto: m.alto,
    duracion: m.duracion,
    peso: Number(m.peso),
    dorsales: m.dorsales,
    previaUrl: `${urlPublica}/${m.clavePrevia}`,
    miniaturaUrl: `${urlPublica}/${m.claveMiniatura}`,
    subido: m.subido,
    oculto: m.oculto,
    creadoEn: m.creadoEn.getTime(),
  };
}
