// LA LISTA DE CLIENTES DEL DISEÑO NUEVO — qué filas se ven, en qué orden y cuántas por página.
//
// Todo sale de la URL (?q=, ?situacion=, ?orden=, ?cursor= con el número de página) y se resuelve en el SERVIDOR: al
// navegador llega sólo la página que se mira, no las 2.000 fichas. Las filas son las mismas que
// arma la lista del piloto (`FilaCliente`, con el motor comercial de src/lib/crm): acá no se
// consulta nada ni se calcula plata; sólo se filtra, se ordena y se corta.
//
// Client-safe: sin Prisma ni servidor.

import { normalizarTelefono } from "@/lib/clientes/telefono";
import { SEGMENTOS, esSegmento, type Segmento } from "@/lib/crm/segmentos";
import { ordenDesdeUrl, type OrdenTabla } from "@/components/ui/tabla-core";
import type { FilaCliente } from "./ClientesLista";

export const TAMANIO_PAGINA = 50;

/** Las columnas que la tabla deja ordenar. «ultima» = días desde la última visita o compra. */
export const ORDENABLES = ["nombre", "ultima", "visitas", "proximo"] as const;

export type ParametrosLista = {
  q: string;
  situacion: Segmento | null;
  orden: OrdenTabla;
  pagina: number;
};

type Sp = Readonly<Record<string, string | string[] | undefined>>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lo que la lista lee de la URL. Lo que no se entiende se ignora (no se inventa un filtro). */
export function leerParametrosLista(sp: Sp): ParametrosLista {
  const q = (uno(sp.q) ?? "").trim().slice(0, 80);
  const s = uno(sp.situacion);
  // La página viaja como `?cursor=` (el nombre que la Tabla ya limpia al cambiar orden o filtro).
  const n = Number.parseInt(uno(sp.cursor) ?? "", 10);
  return {
    q,
    situacion: esSegmento(s) ? s : null,
    orden: ordenDesdeUrl(uno(sp.orden), ORDENABLES),
    pagina: Number.isFinite(n) && n >= 1 ? n : 1,
  };
}

function sinTildes(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * ¿La fila coincide con lo buscado? Por nombre sin tildes ni mayúsculas, o por teléfono: tal
 * como está guardado o de corrido («1155552036» encuentra «11 5555-2036»). La misma regla que la
 * búsqueda de la lista del piloto (ClientesLista.tsx).
 */
export function coincide(f: FilaCliente, q: string): boolean {
  const texto = sinTildes(q.trim());
  if (!texto) return true;
  if (sinTildes(f.nombre).includes(texto) || f.telefono.includes(q.trim())) return true;
  const tel = normalizarTelefono(q);
  return tel !== "" && normalizarTelefono(f.telefono).includes(tel);
}

const porNombre = (a: FilaCliente, b: FilaCliente) => a.nombre.localeCompare(b.nombre, "es");

/**
 * El orden de la lista. Sin orden elegido: las que vinieron hace poco primero (el default de la
 * lista del piloto). Quien nunca vino va al final en «última vez» ascendente y al principio en
 * descendente; quien no tiene turno va al final en «próximo turno» en los dos sentidos.
 */
export function ordenarClientes(filas: readonly FilaCliente[], orden: OrdenTabla): FilaCliente[] {
  const dias = (f: FilaCliente) => f.diasSinVenir ?? Number.POSITIVE_INFINITY;
  const clave = orden?.key ?? "ultima";
  const signo = orden?.direction === "desc" ? -1 : 1;
  const cmp = (a: FilaCliente, b: FilaCliente): number => {
    switch (clave) {
      case "nombre":
        return signo * porNombre(a, b);
      case "visitas":
        return signo * (a.visitas - b.visitas) || porNombre(a, b);
      case "proximo": {
        if (!a.proximoTurno && !b.proximoTurno) return porNombre(a, b);
        if (!a.proximoTurno) return 1;
        if (!b.proximoTurno) return -1;
        return signo * a.proximoTurno.localeCompare(b.proximoTurno) || porNombre(a, b);
      }
      default: {
        const da = dias(a);
        const db = dias(b);
        if (da === db) return porNombre(a, b);
        return signo * (da < db ? -1 : 1);
      }
    }
  };
  return [...filas].sort(cmp);
}

export type PaginaDeClientes = {
  filas: FilaCliente[];
  /** Cuántas coinciden con la búsqueda y la situación (todas las páginas). */
  coinciden: number;
  pagina: number;
  paginas: number;
  /** Cuántas hay por situación, con la búsqueda aplicada: los números de los filtros. */
  porSituacion: Record<Segmento, number>;
};

/** Filtrar, ordenar y cortar la página. Una página que no existe muestra la última. */
export function paginaDeClientes(todas: readonly FilaCliente[], p: ParametrosLista): PaginaDeClientes {
  const buscadas = todas.filter((f) => coincide(f, p.q));
  const porSituacion = Object.fromEntries(SEGMENTOS.map((s) => [s, 0])) as Record<Segmento, number>;
  for (const f of buscadas) porSituacion[f.segmento] += 1;
  const filtradas = p.situacion ? buscadas.filter((f) => f.segmento === p.situacion) : buscadas;
  const ordenadas = ordenarClientes(filtradas, p.orden);
  const paginas = Math.max(1, Math.ceil(ordenadas.length / TAMANIO_PAGINA));
  const pagina = Math.min(p.pagina, paginas);
  const desde = (pagina - 1) * TAMANIO_PAGINA;
  return {
    filas: ordenadas.slice(desde, desde + TAMANIO_PAGINA),
    coinciden: ordenadas.length,
    pagina,
    paginas,
    porSituacion,
  };
}

/** «hace 12 días», «hoy», «nunca vino». Sin «(0 ciclos sin volver)». */
export function ultimaVez(diasSinVenir: number | null, visitaSingular: string): string {
  if (diasSinVenir === null) return visitaSingular === "compra" ? "Nunca compró" : "Nunca vino";
  if (diasSinVenir <= 0) return "Hoy";
  if (diasSinVenir === 1) return "Ayer";
  if (diasSinVenir < 60) return `Hace ${diasSinVenir} días`;
  const meses = Math.floor(diasSinVenir / 30);
  return meses < 12 ? `Hace ${meses} meses` : meses < 24 ? "Hace más de un año" : `Hace ${Math.floor(meses / 12)} años`;
}
