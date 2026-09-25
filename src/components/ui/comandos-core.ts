// ============================================================================
// EL BUSCADOR DE COMANDOS (Ctrl/⌘K) — qué se encuentra y en qué orden. Puro, client-safe.
// ============================================================================
//
// Tres capas, en este orden: ACCIONES (verbos con un enlace que ya existe: «Vender», «Cerrar el
// día»), APPS (con su espacio como segunda línea) y REGISTROS (clientes, productos, pedidos: llegan
// ya buscados, ordenados y cortados por el servidor, R6-F2, src/lib/buscador/; acá no se vuelven a
// filtrar, porque un cliente encontrado por el teléfono no coincide por el nombre).
//
// SEGURIDAD: busca sólo entre lo que llega, y lo que llega lo calculó el servidor con la misma
// decisión que la guardia de cada página (`appsVisibles` y la capability de cada acción). Buscar
// nunca puede hacer aparecer algo que la persona no puede abrir.
//
// El orden dentro de cada capa es el de src/modules/nav-search.ts (empieza con → palabra que
// empieza con → contiene → por palabra de búsqueda), el mismo del buscador de siempre, con dos
// podas propias de la paleta (que muestra 16 lugares y no 5): una palabra de búsqueda cuenta sólo
// si EMPIEZA con lo tipeado («ca» no trae «Tomar un pedido» por «en-ca-rgo»), y con menos de tres
// letras el nombre también tiene que empezar una palabra («ca» no trae «Recibir mercadería»).

import { normalizarBusqueda, rangoCoincidencia } from "@/modules/nav-search";
import type { NombreIcono } from "@/apps/contract";
import type { GrupoDeRegistros, GrupoRegistro } from "@/lib/buscador/registros-core";

export type GrupoComando = "acciones" | "apps" | GrupoRegistro;

export interface Comando {
  id: string;
  grupo: GrupoComando;
  nombre: string;
  /** Segunda línea: el espacio de la app, o la app que resuelve la acción. */
  segunda?: string;
  href: string;
  icono?: NombreIcono;
  /** Palabras con las que se busca además del nombre («arqueo», «afip», «fiado»). */
  alias?: readonly string[];
}

export const NOMBRE_GRUPO: Record<GrupoComando, string> = {
  acciones: "Acciones",
  apps: "Apps",
  clientes: "Clientes",
  productos: "Productos",
  pedidos: "Pedidos",
};

/** El ícono de cada renglón de registros: el de la app que lo abre. */
const ICONO_REGISTRO: Record<GrupoRegistro, NombreIcono> = { clientes: "clientes", productos: "catalogo", pedidos: "pedidos" };

/** Sin texto: las primeras acciones (las más comunes) y todas las apps. */
export const ACCIONES_SIN_TEXTO = 6;
/** Con texto: hasta tantas por capa (la lista entra en una pantalla). */
export const MAX_POR_GRUPO = 8;

export interface ResultadoComandos {
  grupos: { grupo: GrupoComando; nombre: string; items: Comando[] }[];
  /** Todos los ítems en el orden de la pantalla (para el cursor de ↑/↓). */
  plano: Comando[];
}

const palabras = (s: string) => normalizarBusqueda(s).split(/[\s/·-]+/);

/** El rango de nav-search con las podas de la paleta; `null` si no entra. Menor es mejor. */
function rangoEnLaPaleta(c: Comando, q: string): number | null {
  const alias = [...(c.alias ?? []), ...(c.segunda ? [c.segunda] : [])];
  const r = rangoCoincidencia({ href: c.href, label: c.nombre }, q);
  if (r !== null && (r <= 1 || q.length >= 3)) return r;
  return alias.some((a) => palabras(a).some((p) => p.startsWith(q))) ? 3 : null;
}

export function buscarComandos(
  comandos: readonly Comando[],
  texto: string,
  registros: readonly GrupoDeRegistros[] = [],
): ResultadoComandos {
  const q = normalizarBusqueda(texto);
  const orden = ["acciones", "apps"] as const;
  const grupos: ResultadoComandos["grupos"] = orden
    .map((grupo) => {
      const delGrupo = comandos.filter((c) => c.grupo === grupo);
      const items = q
        ? delGrupo
            .map((c, orden) => ({ c, orden, rango: rangoEnLaPaleta(c, q) }))
            .filter((x): x is { c: Comando; orden: number; rango: number } => x.rango !== null)
            .sort((a, b) => a.rango - b.rango || a.orden - b.orden)
            .map((x) => x.c)
            .slice(0, MAX_POR_GRUPO)
        : grupo === "acciones"
          ? delGrupo.slice(0, ACCIONES_SIN_TEXTO)
          : delGrupo;
      return { grupo, nombre: NOMBRE_GRUPO[grupo], items };
    })
    .filter((g) => g.items.length > 0);
  if (q) {
    for (const r of registros) {
      if (r.items.length === 0) continue;
      grupos.push({ grupo: r.grupo, nombre: NOMBRE_GRUPO[r.grupo], items: r.items.map((i) => ({ ...i, icono: ICONO_REGISTRO[i.grupo] })) });
    }
  }
  return { grupos, plano: grupos.flatMap((g) => g.items) };
}

/**
 * Dónde está lo tipeado dentro del nombre, para marcarlo. Compara sin tildes ni mayúsculas; como
 * en castellano cada letra con tilde es UNA letra (á, é, ñ), las posiciones coinciden con las del
 * nombre original. `null` si no está en el nombre (se encontró por una palabra de búsqueda).
 */
export function resaltar(nombre: string, texto: string): { antes: string; coincide: string; despues: string } | null {
  const q = normalizarBusqueda(texto);
  if (!q) return null;
  const n = normalizarBusqueda(nombre);
  // normalizarBusqueda recorta los bordes: se compara contra el nombre sin recortar para no correrse.
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (base.length !== nombre.length) return null;
  const i = base.indexOf(q);
  if (i < 0 || !n.includes(q)) return null;
  return { antes: nombre.slice(0, i), coincide: nombre.slice(i, i + q.length), despues: nombre.slice(i + q.length) };
}
