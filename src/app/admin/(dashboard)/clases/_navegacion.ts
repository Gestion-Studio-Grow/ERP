// La barra de abajo del profe (matias-DISENO.md §2.1): cinco lugares, siempre los mismos.
// Puro (sin React ni Next): lo usa la barra y lo prueba _barra-inferior.test.ts.

export type ItemBarra = "hoy" | "semana" | "agendar" | "alumnos" | "plata";

export const BASE_CLASES = "/admin/clases";

export const ITEMS_BARRA: readonly { id: ItemBarra; href: string; rotulo: string }[] = [
  { id: "hoy", href: BASE_CLASES, rotulo: "Hoy" },
  { id: "semana", href: `${BASE_CLASES}/semana`, rotulo: "Semana" },
  { id: "agendar", href: `${BASE_CLASES}/agendar`, rotulo: "Agendar" },
  { id: "alumnos", href: `${BASE_CLASES}/alumnos`, rotulo: "Alumnos" },
  { id: "plata", href: `${BASE_CLASES}/plata`, rotulo: "Plata" },
];

const SECCIONES: readonly ItemBarra[] = ["semana", "agendar", "alumnos", "plata"];

/**
 * Qué lugar de la barra se marca (aria-current) para una ruta. La ficha de un alumno
 * (`/alumnos/123`) cuenta como Alumnos. La bandeja (campana) y los ajustes (engranaje) no son de
 * la barra: con ellos abiertos no se marca ninguno. Fuera de /admin/clases, tampoco.
 */
export function itemActivo(pathname: string | null | undefined): ItemBarra | null {
  if (!pathname) return null;
  const ruta = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  if (ruta === BASE_CLASES) return "hoy";
  if (!ruta.startsWith(`${BASE_CLASES}/`)) return null;
  const seccion = ruta.slice(BASE_CLASES.length + 1).split("/")[0];
  return SECCIONES.find((s) => s === seccion) ?? null;
}

/** El número del globito de Hoy: nunca negativo, y a partir de 100 dice «99+». */
export function textoBadge(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}
