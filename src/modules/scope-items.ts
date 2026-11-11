// Coherencia de las fichas de scope items de un módulo (docs/finanzas-control/METODO-SCOPE-ITEMS.md).
// PURA. No es una guardia del catálogo (validarDescriptor no cambia): la usan los tests de cada
// módulo que declara fichas con código.

import type { ScopeItem } from "./contract";

const CODIGO = /^[A-Z]{2,4}-\d{2}$/;
const GUION = /^docs\/[A-Za-z0-9\-/]+\.md$/;

/** Lista los problemas de las fichas (vacía = coherente): códigos únicos, dependencias que existen, sin ciclos. */
export function problemasDeScopeItems(items: readonly ScopeItem[]): string[] {
  const problemas: string[] = [];
  const vistos = new Set<string>();
  const todos = new Set(items.map((i) => i.codigo).filter((c): c is string => !!c));
  for (const item of items) {
    const c = item.codigo;
    if (!c) {
      if (item.referenciaSap || item.perfilMin || item.enLite || item.dependencias || item.guion) {
        problemas.push(`"${item.label}": tiene ficha pero no código`);
      }
      continue;
    }
    if (!CODIGO.test(c)) problemas.push(`${c}: código con formato inválido (esperado "FC-01")`);
    if (vistos.has(c)) problemas.push(`${c}: código repetido`);
    if (item.enLite && item.perfilMin !== "enterprise") problemas.push(`${c}: "enLite" sólo tiene sentido si el perfil mínimo es enterprise`);
    if (item.guion && !GUION.test(item.guion)) problemas.push(`${c}: guion con ruta inválida (${item.guion})`);
    for (const d of item.dependencias ?? []) {
      if (d === c) problemas.push(`${c}: depende de sí mismo`);
      else if (!todos.has(d)) problemas.push(`${c}: depende de ${d}, que no existe en el módulo`);
    }
    vistos.add(c);
  }
  const ciclo = cicloDeDependencias(items);
  if (ciclo) problemas.push(`dependencias en ciclo: ${ciclo.join(" → ")}`);
  return problemas;
}

/** Primer ciclo encontrado en el grafo de dependencias, o null. */
function cicloDeDependencias(items: readonly ScopeItem[]): string[] | null {
  const deps = new Map<string, string[]>();
  for (const i of items) if (i.codigo) deps.set(i.codigo, [...(deps.get(i.codigo) ?? []), ...(i.dependencias ?? [])]);
  const estado = new Map<string, "visitando" | "listo">();
  const camino: string[] = [];
  const visitar = (c: string): string[] | null => {
    if (estado.get(c) === "listo" || !deps.has(c)) return null;
    if (estado.get(c) === "visitando") return [...camino.slice(camino.indexOf(c)), c];
    estado.set(c, "visitando");
    camino.push(c);
    for (const d of deps.get(c)!) {
      if (d === c) continue;
      const ciclo = visitar(d);
      if (ciclo) return ciclo;
    }
    camino.pop();
    estado.set(c, "listo");
    return null;
  };
  for (const c of deps.keys()) {
    const ciclo = visitar(c);
    if (ciclo) return ciclo;
  }
  return null;
}
