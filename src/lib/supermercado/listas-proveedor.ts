// ============================================================================
// LISTA DE PRECIOS DEL PROVEEDOR — la planilla que manda el distribuidor, leída y comparada.
// ============================================================================
//
// El proveedor manda su lista (Excel, PDF pasado a planilla, o copiada del mail): código de
// barras, descripción y costo. Se pega como texto (una fila por renglón, separada por punto y
// coma, coma o tabulación), se lee con las reglas de plata de acá ("12.500,50") y se compara con
// el catálogo por CÓDIGO: qué cambió de costo y cuánto, y qué no está en el catálogo.
//
// La lista vigente de cada proveedor queda guardada (config-repo.ts) y da el costo de referencia
// para el precio por margen cuando el producto no tiene compras con costo.
//
// PURO: sin base, sin React.

import { leerImporte } from "@/lib/dinero/leer";
import { centavosDe } from "@/lib/dinero/redondeo";
import type { ListaGuardada, RenglonDeLista } from "./config-repo";

export const MAX_RENGLONES_LISTA = 5000;

export type LecturaDeLista = {
  renglones: RenglonDeLista[];
  /** Filas que no se pudieron leer, con su número (desde 1) y el motivo. */
  errores: { fila: number; motivo: string }[];
};

function separar(linea: string): string[] {
  const sep = linea.includes("\t") ? "\t" : linea.includes(";") ? ";" : ",";
  return linea.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

/**
 * Lee la planilla pegada. Columnas: código, descripción, costo (la descripción es opcional: con
 * dos columnas son código y costo). Una primera fila de títulos ("código", "descripción"…) se
 * saltea. Un código repetido se queda con la ÚLTIMA fila y se avisa. PURA.
 */
export function leerPlanillaDeLista(texto: string): LecturaDeLista {
  const lineas = String(texto ?? "").split(/\r?\n/);
  const porCodigo = new Map<string, RenglonDeLista>();
  const errores: LecturaDeLista["errores"] = [];
  lineas.forEach((linea, i) => {
    const fila = i + 1;
    if (!linea.trim()) return;
    const c = separar(linea);
    if (i === 0 && /c[oó]digo|ean|art[ií]culo/i.test(c[0] ?? "")) return;
    if (c.length < 2) return errores.push({ fila, motivo: "Faltan columnas: va código, descripción y costo." });
    const codigo = (c[0] ?? "").replace(/\s/g, "");
    const costoTxt = c[c.length - 1] ?? "";
    const nombre = c.length >= 3 ? c.slice(1, -1).join(" ").trim() : "";
    if (!/^[0-9A-Za-z-]{1,40}$/.test(codigo)) return errores.push({ fila, motivo: `El código «${c[0] ?? ""}» no es válido.` });
    const l = leerImporte(costoTxt.replace(/\$/g, ""));
    if (l.estado !== "ok" || !(l.valor > 0)) return errores.push({ fila, motivo: `El costo «${costoTxt}» no es un importe.` });
    if (porCodigo.has(codigo)) errores.push({ fila, motivo: `El código ${codigo} está repetido: vale esta fila.` });
    porCodigo.set(codigo, { codigo, nombre, costo: l.valor });
  });
  const renglones = [...porCodigo.values()];
  if (renglones.length > MAX_RENGLONES_LISTA) {
    return { renglones: renglones.slice(0, MAX_RENGLONES_LISTA), errores: [...errores, { fila: 0, motivo: `La lista tiene más de ${MAX_RENGLONES_LISTA} renglones: se cargan los primeros.` }] };
  }
  return { renglones, errores };
}

export type ComparacionDeLista = {
  /** Productos del catálogo que están en la lista, con el costo de hoy y el de la lista. */
  encontrados: {
    productId: string;
    nombre: string;
    codigo: string;
    costoLista: number;
    costoHoy: number | null;
    /** Variación en %, con un decimal, o null sin costo de hoy. */
    variacion: number | null;
  }[];
  /** Renglones de la lista que no están en el catálogo (se pueden dar de alta). */
  sinProducto: RenglonDeLista[];
};

/** Compara la lista con el catálogo por código. PURA. */
export function compararConElCatalogo(
  renglones: readonly RenglonDeLista[],
  productos: readonly { id: string; name: string; codigo: string | null; costo: number | null }[],
): ComparacionDeLista {
  const porCodigo = new Map(productos.filter((p) => p.codigo).map((p) => [p.codigo!.trim(), p]));
  const encontrados: ComparacionDeLista["encontrados"] = [];
  const sinProducto: RenglonDeLista[] = [];
  for (const r of renglones) {
    const p = porCodigo.get(r.codigo);
    if (!p) {
      sinProducto.push(r);
      continue;
    }
    const hoy = p.costo != null && p.costo > 0 ? p.costo : null;
    const variacion = hoy ? Math.round(((centavosDe(r.costo) - centavosDe(hoy)) / centavosDe(hoy)) * 1000) / 10 : null; // no-es-plata: un porcentaje con un decimal para mostrar
    encontrados.push({ productId: p.id, nombre: p.name, codigo: r.codigo, costoLista: r.costo, costoHoy: hoy, variacion });
  }
  encontrados.sort((a, b) => Math.abs(b.variacion ?? 0) - Math.abs(a.variacion ?? 0));
  return { encontrados, sinProducto };
}

/**
 * Por código de producto: el costo de la lista MÁS NUEVA que lo trae y todos los proveedores
 * que lo listan. Lo usa el precio por margen cuando el producto no tiene otro costo. PURA.
 */
export function costosDeLasListas(listas: readonly ListaGuardada[]): Map<string, { costo: number; proveedores: string[] }> {
  const out = new Map<string, { costo: number; proveedores: string[]; cargada: number }>();
  for (const l of listas) {
    const t = l.cargada.getTime();
    for (const r of l.renglones) {
      const antes = out.get(r.codigo);
      if (!antes) out.set(r.codigo, { costo: r.costo, proveedores: [l.proveedorId], cargada: t });
      else {
        antes.proveedores.push(l.proveedorId);
        if (t > antes.cargada) {
          antes.costo = r.costo;
          antes.cargada = t;
        }
      }
    }
  }
  return new Map([...out].map(([k, v]) => [k, { costo: v.costo, proveedores: v.proveedores }]));
}
