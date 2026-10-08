import { plata } from "@/lib/dinero";
import { cotizar, precioUnitario } from "@/lib/precios";
import type { Album, Medio, TipoEvento } from "@/lib/tipos";

/** Textos y cálculos chicos del recorrido del comprador. Puros: sin DOM ni repositorio. */

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  carrera: "Carrera",
  torneo: "Torneo",
  fiesta: "Fiesta",
  otro: "Evento",
};

/** 75 → "1:15" */
export function duracionTexto(segundos: number | null): string {
  if (segundos == null || !Number.isFinite(segundos)) return "";
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "3 fotos", "1 video", "4 fotos y 1 video" */
export function contarMedios(lista: Pick<Medio, "tipo">[]): string {
  const videos = lista.filter((m) => m.tipo === "video").length;
  const fotos = lista.length - videos;
  const partes: string[] = [];
  if (fotos || !videos) partes.push(`${fotos} ${fotos === 1 ? "foto" : "fotos"}`);
  if (videos) partes.push(`${videos} ${videos === 1 ? "video" : "videos"}`);
  return partes.join(" y ");
}

/** "Foto 3" / "Video 7": numerado según la posición en el álbum completo (estable aunque se filtre). */
export function nombreMedio(m: Pick<Medio, "tipo">, indice: number): string {
  return `${m.tipo === "video" ? "Video" : "Foto"} ${indice + 1}`;
}

/** "73" · "73 y 4471" · "73, 507 y 4471" */
export function listaDorsales(d: string[]): string {
  if (d.length <= 1) return d.join("");
  return `${d.slice(0, -1).join(", ")} y ${d[d.length - 1]}`;
}

export interface Sugerencia {
  extra: number;
  etiqueta: string;
  total: number;
}

type AlbumPrecios = Pick<Album, "precioFoto" | "precioVideo" | "paquetes" | "escalones" | "cupones">;

/**
 * Si sumando 1 a 4 fotos más se activa una regla mejor (paquete o escalón), devuelve la más cercana.
 * Las fotos hipotéticas se cotizan a precio de foto. No inventa urgencia: es información de precio.
 */
export function sugerencia(album: AlbumPrecios, items: Pick<Medio, "tipo">[], totalMedios: number): Sugerencia | null {
  if (items.length === 0) return null;
  const disponibles = totalMedios - items.length;
  const base = cotizar(album, items, null, totalMedios);
  for (let n = 1; n <= Math.min(4, disponibles); n++) {
    const extra = Array.from({ length: n }, () => ({ tipo: "foto" as const }));
    const hip = cotizar(album, [...items, ...extra], null, totalMedios);
    if (hip.regla.tipo !== "unitario" && hip.regla.etiqueta !== base.regla.etiqueta && hip.ahorroCantidad > base.ahorroCantidad) {
      return { extra: n, etiqueta: hip.regla.etiqueta, total: hip.subtotal };
    }
  }
  return null;
}

export interface LineaDescuento {
  titulo: string;
  detalle: string;
}

/** Explicación de paquetes y escalones con el ahorro, para el diálogo del encabezado. */
export function lineasDescuento(album: AlbumPrecios, totalMedios: number): LineaDescuento[] {
  const foto = precioUnitario(album, "foto");
  const out: LineaDescuento[] = [];
  for (const p of album.paquetes) {
    if (!(p.precio > 0)) continue;
    const cant = p.cantidad === 0 ? totalMedios : p.cantidad;
    if (cant <= 0) continue;
    const lista = cant * foto;
    const ahorro = lista - p.precio;
    out.push({
      titulo: p.cantidad === 0 ? `Paquete ${p.nombre}: todo el álbum` : `Paquete ${p.nombre}`,
      detalle:
        (p.cantidad === 0
          ? `Llevando las ${cant} fotos y videos del álbum pagás ${plata(p.precio)}`
          : `Llevando ${cant} fotos pagás ${plata(p.precio)}`) +
        (ahorro > 0 ? ` en vez de ${plata(lista)}: ahorrás ${plata(ahorro)}.` : ".") +
        " Se aplica solo al pagar.",
    });
  }
  for (const e of [...album.escalones].sort((a, b) => a.desde - b.desde)) {
    if (!(e.desde > 0 && e.porcentaje > 0)) continue;
    out.push({
      titulo: `${e.porcentaje} % menos desde ${e.desde}`,
      detalle: `Llevando ${e.desde} o más, todo el carrito sale ${e.porcentaje} % más barato. Se aplica solo al pagar.`,
    });
  }
  return out;
}

/** Nombre de archivo para la descarga: el original del fotógrafo o uno armado con la extensión del tipo. */
export function nombreDescarga(nombreArchivo: string | undefined, tipoMime: string, indice: number): string {
  if (nombreArchivo && nombreArchivo.trim()) return nombreArchivo;
  const ext = tipoMime.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") || "bin";
  return `buscatufoto-${indice + 1}.${ext}`;
}
