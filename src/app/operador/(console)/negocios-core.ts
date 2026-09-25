// ============================================================================
// NEGOCIOS (consola GSG) — lo que se decide sin base: vista, búsqueda, orden, palabras y bandeja.
// ============================================================================
//
// La página (page.tsx) lee UNA vez los negocios y su «listo para abrir» (aperturas.server.ts) y
// esto arma lo que se ve. Puro: se prueba con datos (negocios-core.test.ts).
//
//   · VISTA (`?estado=`): todos · en producción · en prueba · con pendientes · estudios contables.
//   · BÚSQUEDA (`?q=`): por nombre, slug o link, sin mayúsculas ni acentos.
//   · ORDEN (`?orden=`): nombre, personas, pendientes, actividad (`-` adelante = de mayor a menor).
//   · PALABRAS: el estado, el plan y el rubro como los diría el dueño («En prueba», no «TRIAL»).
//   · BANDEJA «Para atender»: un renglón por negocio con algo pendiente para abrir, con la pestaña
//     de su ficha que lo resuelve (Fiscal, Personas o Puesta en marcha).

import type { ItemApertura, ResultadoApertura } from "@/lib/operador/checklist-apertura";
import { esPlanId, planPorId } from "@/planes/catalogo";
import type { TipoMarca } from "@/components/ui/Marca";

export type EstadoTenant = "ACTIVE" | "TRIAL" | "SUSPENDED";

export const VISTAS = ["produccion", "prueba", "pendientes", "estudios"] as const;
export type VistaNegocios = (typeof VISTAS)[number] | null;

/** Las pestañas de la ficha de un negocio (tenants/[id]). */
export const PESTANAS_FICHA = ["puesta", "fiscal", "plan", "marca", "personas", "historial"] as const;
export type PestanaFicha = (typeof PESTANAS_FICHA)[number];

export interface NegocioParaLista {
  id: string;
  nombre: string;
  slug: string;
  subdominio: string | null;
  estado: EstadoTenant;
  /** `Tenant.plan` crudo (texto libre hoy). */
  plan: string | null;
  /** El rubro en palabras (`getBlueprint(id).label`), o null sin blueprint. */
  rubro: string | null;
  modulos: readonly string[];
  personas: number;
  /** Turnos + pedidos (lo que «hizo» el negocio desde que nació). */
  operaciones: number;
  /** «Listo para abrir» (la misma regla que la ficha y el tablero), o null si no se pudo leer. */
  apertura: ResultadoApertura | null;
  /** CH: sólo se toca con el OK del dueño (`requiereOkDelDuenio`). */
  conCandado: boolean;
}

export function leerVista(v: string | string[] | undefined): VistaNegocios {
  const x = Array.isArray(v) ? v[0] : v;
  return (VISTAS as readonly string[]).includes(x ?? "") ? (x as VistaNegocios) : null;
}

export function leerPestana(v: string | string[] | undefined): PestanaFicha {
  const x = Array.isArray(v) ? v[0] : v;
  return (PESTANAS_FICHA as readonly string[]).includes(x ?? "") ? (x as PestanaFicha) : "puesta";
}

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const esEstudio = (n: Pick<NegocioParaLista, "modulos">) => n.modulos.includes("cartera");
export const esCasaDeRed = (n: Pick<NegocioParaLista, "modulos">) => n.modulos.includes("multilocal");
export const pendientesDe = (n: Pick<NegocioParaLista, "apertura">) => n.apertura?.pendientes ?? 0;

/** Cuántos hay en cada vista (para la línea de estado y las pestañas). */
export function contarVistas(filas: readonly NegocioParaLista[]) {
  return {
    todos: filas.length,
    produccion: filas.filter((n) => n.estado === "ACTIVE").length,
    prueba: filas.filter((n) => n.estado === "TRIAL").length,
    suspendidos: filas.filter((n) => n.estado === "SUSPENDED").length,
    pendientes: filas.filter((n) => pendientesDe(n) > 0).length,
    estudios: filas.filter(esEstudio).length,
  };
}

export function filtrarNegocios(filas: readonly NegocioParaLista[], vista: VistaNegocios, q: string): NegocioParaLista[] {
  const buscado = plano(q);
  return filas.filter((n) => {
    if (vista === "produccion" && n.estado !== "ACTIVE") return false;
    if (vista === "prueba" && n.estado !== "TRIAL") return false;
    if (vista === "pendientes" && pendientesDe(n) === 0) return false;
    if (vista === "estudios" && !esEstudio(n)) return false;
    if (!buscado) return true;
    return [n.nombre, n.slug, n.subdominio ?? ""].some((t) => plano(t).includes(buscado));
  });
}

export const ORDENABLES = ["nombre", "personas", "pendientes", "actividad"] as const;

/** Ordena con `?orden=` (`clave` o `-clave`). Sin orden: el de alta (el que trae la base). */
export function ordenarNegocios(filas: readonly NegocioParaLista[], orden: string | null | undefined): NegocioParaLista[] {
  if (!orden) return [...filas];
  const desc = orden.startsWith("-");
  const clave = desc ? orden.slice(1) : orden;
  const valor = (n: NegocioParaLista): string | number =>
    clave === "nombre" ? plano(n.nombre) : clave === "personas" ? n.personas : clave === "pendientes" ? pendientesDe(n) : clave === "actividad" ? n.operaciones : 0;
  if (!(ORDENABLES as readonly string[]).includes(clave)) return [...filas];
  return [...filas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const c = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "es") : (va as number) - (vb as number);
    return desc ? -c : c;
  });
}

/** El estado del negocio en palabras, con su marca (forma + palabra). */
export function estadoEnPalabras(estado: EstadoTenant): { texto: string; marca: TipoMarca } {
  if (estado === "ACTIVE") return { texto: "En producción", marca: "hecho" };
  if (estado === "SUSPENDED") return { texto: "Suspendido", marca: "anulado" };
  return { texto: "En prueba", marca: "pendiente" };
}

// Los planes viejos de la consola (src/lib/operator-config.ts: trial/base/pro/enterprise), para
// los negocios que quedaron con uno. No se ofrecen más: el catálogo nuevo es src/planes.
const PLANES_VIEJOS: Record<string, string> = { trial: "Prueba", base: "Base", pro: "Pro", enterprise: "Enterprise" };

/**
 * El plan en palabras. Del catálogo nuevo (src/planes, provisional a confirmar), uno viejo de la
 * consola, o «Sin plan». Nunca se inventa: un texto que no se reconoce se muestra tal cual.
 */
export function planEnPalabras(plan: string | null): { texto: string; nota: string | null } {
  const p = plan?.trim();
  if (!p) return { texto: "Sin plan", nota: null };
  if (esPlanId(p)) return { texto: planPorId(p).nombre, nota: "provisional" };
  if (PLANES_VIEJOS[p]) return { texto: PLANES_VIEJOS[p], nota: "plan viejo" };
  return { texto: p, nota: null };
}

/** El rubro sin el prefijo del blueprint («Retail · Carnicería boutique» → «Carnicería boutique»). */
export function rubroEnPalabras(rubro: string | null): string {
  if (!rubro) return "Sin rubro cargado";
  const partes = rubro.split(" · ");
  return partes[partes.length - 1] || rubro;
}

/** «4 personas · 20 productos · 544 operaciones», en cifras de acá. */
export function actividadEnPalabras(operaciones: number): string {
  if (operaciones === 0) return "sin operaciones";
  return `${operaciones.toLocaleString("es-AR")} ${operaciones === 1 ? "operación" : "operaciones"}`;
}

/** Qué pestaña de la ficha resuelve un ítem de «Listo para abrir». */
export function pestanaQueResuelve(item: Pick<ItemApertura, "id">): PestanaFicha {
  if (item.id === "facturacion") return "fiscal";
  if (item.id === "usuarios") return "personas";
  return "puesta";
}

const NOMBRE_PESTANA: Record<PestanaFicha, string> = {
  puesta: "Puesta en marcha",
  fiscal: "Fiscal",
  plan: "Plan y apps",
  marca: "Marca y vidriera",
  personas: "Personas",
  historial: "Historial",
};

export function nombreDePestana(p: PestanaFicha): string {
  return NOMBRE_PESTANA[p];
}

/** Un pendiente solo, dicho como lo diría el dueño (el título del renglón de la bandeja). */
const UN_PENDIENTE: Record<ItemApertura["id"], string> = {
  precios: "Vende con precios de referencia",
  direccion: "Falta la dirección del local",
  instagram: "Falta su Instagram",
  facturacion: "Todavía no puede facturar",
  subdominio: "No tiene link propio",
  usuarios: "Tiene un solo usuario",
};

export interface RenglonParaAtender {
  id: string;
  /** El sujeto del renglón: el negocio. */
  negocio: string;
  /** Cuántos pendientes para abrir tiene. */
  pendientes: number;
  /** Qué le falta, en palabras: uno solo, dicho entero; varios, sus nombres. */
  detalle: string;
  tecla: { etiqueta: string; href: string };
}

/**
 * La bandeja «Para atender»: un renglón por negocio con pendientes para abrir, los que más deben
 * primero. El renglón nombra al negocio; el detalle dice qué le falta (con las palabras del
 * checklist); la tecla abre la pestaña de su ficha que resuelve el primero. Un suspendido no pide
 * nada.
 */
export function bandejaDeNegocios(filas: readonly NegocioParaLista[]): RenglonParaAtender[] {
  return filas
    .filter((n) => n.estado !== "SUSPENDED" && pendientesDe(n) > 0)
    .sort((a, b) => pendientesDe(b) - pendientesDe(a) || a.nombre.localeCompare(b.nombre, "es"))
    .map((n) => {
      const faltan = (n.apertura?.items ?? []).filter((i) => i.ok === false);
      const primero = faltan[0];
      const pestana = primero ? pestanaQueResuelve(primero) : "puesta";
      return {
        id: n.id,
        negocio: n.nombre,
        pendientes: faltan.length,
        detalle: faltan.length === 1 && primero ? `${UN_PENDIENTE[primero.id]}: ${primero.detalle}` : `Falta: ${faltan.map((i) => i.label).join(" · ")}`,
        tecla: { etiqueta: nombreDePestana(pestana), href: `/operador/tenants/${n.id}?pestana=${pestana}` },
      };
    });
}

/** El «riel» de «Listo para abrir»: cuántos de los ítems que aplican están listos. */
export function rielDeApertura(apertura: ResultadoApertura | null): { hechos: number; total: number; pasos: string[] } | null {
  if (!apertura) return null;
  const aplican = apertura.items.filter((i) => i.ok !== null);
  // Los listos primero: el riel se lee «●●●○○», como el de un pedido.
  const ordenados = [...aplican].sort((a, b) => Number(b.ok) - Number(a.ok));
  return { hechos: aplican.filter((i) => i.ok).length, total: aplican.length, pasos: ordenados.map((i) => i.label) };
}
